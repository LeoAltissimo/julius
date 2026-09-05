"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getI18n } from "@/i18n/server";
import type { Messages } from "@/i18n/messages";
import { createClient } from "@/lib/supabase/server";

export type AccountFormState = { error: string | null };

function accountSchema(t: Messages) {
  const optionalDay = z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : Number(value)))
    .nullable()
    .refine(
      (value) =>
        value === null ||
        (Number.isInteger(value) && value >= 1 && value <= 31),
      t.accounts.form.invalidDay,
    );

  return z.object({
    name: z.string().trim().min(1, t.accounts.form.nameRequired).max(80),
    type: z.enum([
      "checking",
      "savings",
      "credit_card",
      "cash",
      "investment",
      "other",
    ]),
    institution: z
      .string()
      .trim()
      .max(80)
      .transform((value) => (value === "" ? null : value))
      .nullable(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, t.categoryForm.invalidColor),
    openingBalanceCents: z.coerce.number().int(),
    creditLimitCents: z.coerce.number().int().min(0),
    statementClosingDay: optionalDay,
    statementDueDay: optionalDay,
  });
}

type AccountValues = z.infer<ReturnType<typeof accountSchema>>;

function readForm(t: Messages, formData: FormData) {
  return accountSchema(t).safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    institution: formData.get("institution") ?? "",
    color: formData.get("color"),
    openingBalanceCents: formData.get("openingBalanceCents") ?? 0,
    creditLimitCents: formData.get("creditLimitCents") ?? 0,
    statementClosingDay: formData.get("statementClosingDay") ?? "",
    statementDueDay: formData.get("statementDueDay") ?? "",
  });
}

/** Statement days and a credit limit only mean something on a card. */
function shape(value: AccountValues) {
  const isCard = value.type === "credit_card";
  return {
    name: value.name,
    type: value.type,
    institution: value.institution,
    color: value.color,
    opening_balance_cents: isCard ? 0 : value.openingBalanceCents,
    credit_limit_cents: isCard ? value.creditLimitCents : null,
    statement_closing_day: isCard ? value.statementClosingDay : null,
    statement_due_day: isCard ? value.statementDueDay : null,
  };
}

function revalidateAccountPages() {
  revalidatePath("/");
  revalidatePath("/accounts");
  revalidatePath("/transactions");
}

function describe(t: Messages, message: string): string {
  return message.includes("_name_key")
    ? t.accounts.form.duplicate
    : t.accounts.form.saveFailed;
}

export async function createAccount(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const { t } = await getI18n();

  const parsed = readForm(t, formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t.common.sessionExpired };

  const { error } = await supabase
    .from("accounts")
    .insert({ user_id: user.id, ...shape(parsed.data) });

  if (error) return { error: describe(t, error.message) };

  revalidateAccountPages();
  redirect("/accounts");
}

export async function updateAccount(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const { t } = await getI18n();

  const id = formData.get("id");
  if (typeof id !== "string") return { error: t.accounts.form.invalidAccount };

  const parsed = readForm(t, formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase
    .from("accounts")
    .update(shape(parsed.data))
    .eq("id", id);

  if (error) return { error: describe(t, error.message) };

  revalidateAccountPages();
  redirect("/accounts");
}

export async function archiveAccount(formData: FormData) {
  const id = formData.get("id");
  if (typeof id !== "string") return;

  const supabase = await createClient();
  await supabase
    .from("accounts")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);

  revalidateAccountPages();
  redirect("/accounts");
}

export async function restoreAccount(formData: FormData) {
  const id = formData.get("id");
  if (typeof id !== "string") return;

  const supabase = await createClient();
  await supabase.from("accounts").update({ archived_at: null }).eq("id", id);

  revalidateAccountPages();
  redirect("/accounts");
}
