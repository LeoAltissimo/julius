import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AccountForm } from "@/components/account-form";
import { Button, Card } from "@/components/ui";
import { getI18n } from "@/i18n/server";
import { fetchAccountBalances, fetchAccounts } from "@/lib/queries";
import { requireUser } from "@/lib/supabase/server";

import { archiveAccount, restoreAccount, updateAccount } from "../actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.accounts.title };
}

export default async function EditAccountPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { t, fmt } = await getI18n();

  const [accounts, balances] = await Promise.all([
    fetchAccounts(supabase, { includeArchived: true }),
    fetchAccountBalances(supabase),
  ]);

  const account = accounts.find((item) => item.id === id);
  if (!account) notFound();

  const balance = balances.get(account.id) ?? 0;

  return (
    <div className="flex flex-col gap-4 pt-4">
      <div>
        <h1 className="text-lg font-semibold text-text">{account.name}</h1>
        <p className="tabular text-sm text-text-muted">
          {t.accounts.currentBalance(fmt.money(balance))}
        </p>
      </div>

      {account.archived_at ? (
        <Card className="flex items-center justify-between gap-3 p-4">
          <p className="text-xs text-text-muted">{t.accounts.archivedNotice}</p>
          <form action={restoreAccount}>
            <input type="hidden" name="id" value={account.id} />
            <Button type="submit" variant="secondary" size="sm">
              {t.common.restore}
            </Button>
          </form>
        </Card>
      ) : null}

      <AccountForm
        action={updateAccount}
        account={account}
        submitLabel={t.common.saveChanges}
      />

      {!account.archived_at ? (
        <form action={archiveAccount} className="pb-2">
          <input type="hidden" name="id" value={account.id} />
          <Button type="submit" variant="danger" className="w-full">
            {t.accounts.archiveCta}
          </Button>
          <p className="mt-2 text-center text-xs text-text-faint">
            {t.accounts.archiveNote}
          </p>
        </form>
      ) : null}
    </div>
  );
}
