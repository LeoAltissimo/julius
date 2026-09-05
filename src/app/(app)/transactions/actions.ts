"use server";

import { randomUUID } from "node:crypto";

import { addMonths, format, parseISO } from "date-fns";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getI18n } from "@/i18n/server";
import type { Messages } from "@/i18n/messages";
import { splitInstallments } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export type EntryFormState = { error: string | null };

type EntryInsert = Database["public"]["Tables"]["entries"]["Insert"];

/**
 * The schema is built per request rather than at module scope, because its
 * messages are the ones the user reads and those depend on the locale.
 */
function entrySchema(t: Messages) {
  const optionalUuid = z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .refine(
      (value) => value === null || z.string().uuid().safeParse(value).success,
      t.entryForm.invalidSelection,
    );

  return z
    .object({
      kind: z.enum(["expense", "income", "transfer"]),
      amountCents: z.coerce.number().int().positive(t.entryForm.invalidAmount),
      occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, t.entryForm.invalidDate),
      description: z.string().trim().max(200).default(""),
      notes: z
        .string()
        .trim()
        .max(2000)
        .transform((value) => (value === "" ? null : value))
        .nullable(),
      accountId: z.string().uuid(t.entryForm.pickAccount),
      counterAccountId: optionalUuid,
      categoryId: optionalUuid,
      subcategoryId: optionalUuid,
      installments: z.coerce.number().int().min(1).max(72).default(1),
    })
    .superRefine((value, ctx) => {
      if (value.kind === "transfer") {
        if (!value.counterAccountId) {
          ctx.addIssue({
            code: "custom",
            message: t.entryForm.pickTargetAccount,
            path: ["counterAccountId"],
          });
        } else if (value.counterAccountId === value.accountId) {
          ctx.addIssue({
            code: "custom",
            message: t.entryForm.sameAccount,
            path: ["counterAccountId"],
          });
        }
      }

      if (value.subcategoryId && !value.categoryId) {
        ctx.addIssue({
          code: "custom",
          message: t.entryForm.subcategoryNeedsCategory,
          path: ["categoryId"],
        });
      }
    });
}

type EntryValues = z.infer<ReturnType<typeof entrySchema>>;

function readForm(t: Messages, formData: FormData) {
  return entrySchema(t).safeParse({
    kind: formData.get("kind"),
    amountCents: formData.get("amountCents"),
    occurredOn: formData.get("occurredOn"),
    description: formData.get("description") ?? "",
    notes: formData.get("notes") ?? "",
    accountId: formData.get("accountId"),
    counterAccountId: formData.get("counterAccountId") ?? "",
    categoryId: formData.get("categoryId") ?? "",
    subcategoryId: formData.get("subcategoryId") ?? "",
    installments: formData.get("installments") ?? 1,
  });
}

/** A transfer is not spending, so it never carries a category. */
function normalize(value: EntryValues) {
  const isTransfer = value.kind === "transfer";
  return {
    ...value,
    counterAccountId: isTransfer ? value.counterAccountId : null,
    categoryId: isTransfer ? null : value.categoryId,
    subcategoryId: isTransfer ? null : value.subcategoryId,
    installments: value.kind === "expense" ? value.installments : 1,
  };
}

function revalidateMoneyPages() {
  revalidatePath("/");
  revalidatePath("/transactions");
  revalidatePath("/investments");
}

function describe(t: Messages, message: string): string {
  if (message.includes("entries_transfer_shape")) {
    return t.entryForm.transferShapeError;
  }
  if (message.includes("subcategory_id_category_id")) {
    return t.entryForm.subcategoryMismatch;
  }
  return t.entryForm.saveFailed;
}

export async function createEntry(
  _prev: EntryFormState,
  formData: FormData,
): Promise<EntryFormState> {
  const { t } = await getI18n();

  const parsed = readForm(t, formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const value = normalize(parsed.data);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: t.common.sessionExpired };

  const base = {
    user_id: user.id,
    kind: value.kind,
    description: value.description,
    notes: value.notes,
    account_id: value.accountId,
    counter_account_id: value.counterAccountId,
    category_id: value.categoryId,
    subcategory_id: value.subcategoryId,
  };

  // A 12x purchase becomes twelve dated rows sharing one group id. Spreading
  // them is what keeps each month's dashboard honest: the full amount does not
  // land on the month you happened to buy it.
  const groupId = randomUUID();
  const rows: EntryInsert[] =
    value.installments > 1
      ? splitInstallments(value.amountCents, value.installments).map(
          (cents, index) => ({
            ...base,
            amount_cents: cents,
            occurred_on: format(
              addMonths(parseISO(`${value.occurredOn}T00:00:00`), index),
              "yyyy-MM-dd",
            ),
            installment_group_id: groupId,
            installment_number: index + 1,
            installment_total: value.installments,
          }),
        )
      : [
          {
            ...base,
            amount_cents: value.amountCents,
            occurred_on: value.occurredOn,
            installment_group_id: null,
            installment_number: null,
            installment_total: null,
          },
        ];

  const { error } = await supabase.from("entries").insert(rows);
  if (error) return { error: describe(t, error.message) };

  revalidateMoneyPages();
  redirect(`/transactions?month=${value.occurredOn.slice(0, 7)}`);
}

export async function updateEntry(
  _prev: EntryFormState,
  formData: FormData,
): Promise<EntryFormState> {
  const { t } = await getI18n();

  const id = formData.get("id");
  if (typeof id !== "string" || !z.string().uuid().safeParse(id).success) {
    return { error: t.entryForm.invalidEntry };
  }

  const parsed = readForm(t, formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const value = normalize(parsed.data);
  const supabase = await createClient();

  const { error } = await supabase
    .from("entries")
    .update({
      kind: value.kind,
      amount_cents: value.amountCents,
      occurred_on: value.occurredOn,
      description: value.description,
      notes: value.notes,
      account_id: value.accountId,
      counter_account_id: value.counterAccountId,
      category_id: value.categoryId,
      subcategory_id: value.subcategoryId,
    })
    .eq("id", id);

  if (error) return { error: describe(t, error.message) };

  revalidateMoneyPages();
  redirect(`/transactions?month=${value.occurredOn.slice(0, 7)}`);
}

export async function deleteEntry(formData: FormData) {
  const id = formData.get("id");
  if (typeof id !== "string") return;

  const supabase = await createClient();
  await supabase.from("entries").delete().eq("id", id);

  revalidateMoneyPages();
  redirect("/transactions");
}

/** Remove every instalment of a purchase in one go. */
export async function deleteInstallmentGroup(formData: FormData) {
  const groupId = formData.get("installmentGroupId");
  if (typeof groupId !== "string") return;

  const supabase = await createClient();
  await supabase.from("entries").delete().eq("installment_group_id", groupId);

  revalidateMoneyPages();
  redirect("/transactions");
}
