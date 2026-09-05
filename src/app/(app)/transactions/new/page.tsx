import type { Metadata } from "next";

import { EntryForm } from "@/components/entry-form";
import { getI18n } from "@/i18n/server";
import { todayIso } from "@/lib/dates";
import { fetchAccounts, fetchCategories } from "@/lib/queries";
import { requireUser } from "@/lib/supabase/server";

import { createEntry } from "../actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.transactions.newTitle };
}

export default async function NewTransactionPage() {
  const { supabase } = await requireUser();
  const { t } = await getI18n();

  const [accounts, categories] = await Promise.all([
    fetchAccounts(supabase),
    fetchCategories(supabase),
  ]);

  return (
    <div className="pt-4">
      <h1 className="mb-4 text-lg font-semibold text-text">
        {t.transactions.newTitle}
      </h1>
      <EntryForm
        action={createEntry}
        accounts={accounts}
        categories={categories}
        submitLabel={t.common.save}
        defaultDate={todayIso()}
      />
    </div>
  );
}
