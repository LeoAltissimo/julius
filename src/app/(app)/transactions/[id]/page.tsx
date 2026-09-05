import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EntryForm } from "@/components/entry-form";
import { Button } from "@/components/ui";
import { getI18n } from "@/i18n/server";
import { todayIso } from "@/lib/dates";
import { fetchAccounts, fetchCategories, fetchEntry } from "@/lib/queries";
import { requireUser } from "@/lib/supabase/server";

import { deleteEntry, deleteInstallmentGroup, updateEntry } from "../actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.transactions.editTitle };
}

export default async function EditTransactionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { t } = await getI18n();

  const [entry, accounts, categories] = await Promise.all([
    fetchEntry(supabase, id),
    fetchAccounts(supabase, { includeArchived: true }),
    fetchCategories(supabase, { includeArchived: true }),
  ]);

  if (!entry) notFound();

  return (
    <div className="pt-4">
      <h1 className="mb-1 text-lg font-semibold text-text">
        {t.transactions.editTitle}
      </h1>
      {entry.installment_total ? (
        <p className="mb-4 text-xs text-text-muted">
          {t.transactions.installmentNote(
            entry.installment_number ?? 1,
            entry.installment_total,
          )}
        </p>
      ) : (
        <div className="mb-4" />
      )}

      <EntryForm
        action={updateEntry}
        accounts={accounts}
        categories={categories}
        entry={entry}
        submitLabel={t.common.saveChanges}
        defaultDate={todayIso()}
      />

      <div className="mt-2 flex flex-col gap-2 border-t border-border pt-4">
        <form action={deleteEntry}>
          <input type="hidden" name="id" value={entry.id} />
          <Button type="submit" variant="danger" className="w-full">
            {t.transactions.deleteOne}
          </Button>
        </form>

        {entry.installment_group_id ? (
          <form action={deleteInstallmentGroup}>
            <input
              type="hidden"
              name="installmentGroupId"
              value={entry.installment_group_id}
            />
            <Button type="submit" variant="danger" className="w-full">
              {t.transactions.deleteGroup(entry.installment_total ?? 0)}
            </Button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
