"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getI18n } from "@/i18n/server";
import type { Messages } from "@/i18n/messages";
import { createClient } from "@/lib/supabase/server";

export type InvestmentFormState = { error: string | null };

function investmentSchema(t: Messages) {
  return z.object({
    name: z.string().trim().min(1, t.investments.form.nameRequired).max(80),
    institution: z
      .string()
      .trim()
      .max(80)
      .transform((value) => (value === "" ? null : value))
      .nullable(),
    kind: z
      .string()
      .trim()
      .max(40)
      .transform((value) => (value === "" ? null : value))
      .nullable(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, t.categoryForm.invalidColor),
    currentValueCents: z.coerce.number().int().min(0),
    notes: z
      .string()
      .trim()
      .max(2000)
      .transform((value) => (value === "" ? null : value))
      .nullable(),
  });
}

function readForm(t: Messages, formData: FormData) {
  return investmentSchema(t).safeParse({
    name: formData.get("name"),
    institution: formData.get("institution") ?? "",
    kind: formData.get("kind") ?? "",
    color: formData.get("color"),
    currentValueCents: formData.get("currentValueCents"),
    notes: formData.get("notes") ?? "",
  });
}

function revalidateInvestmentPages() {
  revalidatePath("/");
  revalidatePath("/investments");
}

function describe(t: Messages, message: string): string {
  return message.includes("_name_key")
    ? t.investments.form.duplicate
    : t.investments.form.saveFailed;
}

export async function createInvestment(
  _prev: InvestmentFormState,
  formData: FormData,
): Promise<InvestmentFormState> {
  const { t } = await getI18n();

  const parsed = readForm(t, formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t.common.sessionExpired };

  const { error } = await supabase.from("investments").insert({
    user_id: user.id,
    name: parsed.data.name,
    institution: parsed.data.institution,
    kind: parsed.data.kind,
    color: parsed.data.color,
    current_value_cents: parsed.data.currentValueCents,
    notes: parsed.data.notes,
  });

  if (error) return { error: describe(t, error.message) };

  revalidateInvestmentPages();
  redirect("/investments");
}

export async function updateInvestment(
  _prev: InvestmentFormState,
  formData: FormData,
): Promise<InvestmentFormState> {
  const { t } = await getI18n();

  const id = formData.get("id");
  if (typeof id !== "string") {
    return { error: t.investments.form.invalidPosition };
  }

  const parsed = readForm(t, formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase
    .from("investments")
    .update({
      name: parsed.data.name,
      institution: parsed.data.institution,
      kind: parsed.data.kind,
      color: parsed.data.color,
      current_value_cents: parsed.data.currentValueCents,
      notes: parsed.data.notes,
    })
    .eq("id", id);

  if (error) return { error: describe(t, error.message) };

  revalidateInvestmentPages();
  redirect("/investments");
}

/**
 * The periodic ritual: open the app, retype whatever each position is worth
 * today, save once. Only the values that actually moved are written, so the
 * snapshot history stays a record of real changes rather than of visits.
 */
export async function updateInvestmentValues(formData: FormData) {
  const supabase = await createClient();

  const updates: Array<{ id: string; value: number }> = [];

  for (const [key, raw] of formData.entries()) {
    if (!key.startsWith("value_")) continue;

    const id = key.slice("value_".length);
    if (!z.string().uuid().safeParse(id).success) continue;

    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0) continue;

    const previous = Number(formData.get(`previous_${id}`));
    if (Number.isInteger(previous) && previous === value) continue;

    updates.push({ id, value });
  }

  for (const update of updates) {
    await supabase
      .from("investments")
      .update({ current_value_cents: update.value })
      .eq("id", update.id);
  }

  revalidateInvestmentPages();
  redirect("/investments");
}

export async function archiveInvestment(formData: FormData) {
  const id = formData.get("id");
  if (typeof id !== "string") return;

  const supabase = await createClient();
  await supabase
    .from("investments")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);

  revalidateInvestmentPages();
  redirect("/investments");
}

export async function restoreInvestment(formData: FormData) {
  const id = formData.get("id");
  if (typeof id !== "string") return;

  const supabase = await createClient();
  await supabase.from("investments").update({ archived_at: null }).eq("id", id);

  revalidateInvestmentPages();
  redirect("/investments");
}
