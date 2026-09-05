import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";

import { ButtonLink, Card, CardHeader, EmptyState } from "@/components/ui";
import type { Formatters } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import type { Messages } from "@/i18n/messages";
import { fetchAccountBalances, fetchAccounts, type AccountRow } from "@/lib/queries";
import { requireUser } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.accounts.title };
}

export default async function AccountsPage() {
  const { supabase } = await requireUser();
  const { t, fmt } = await getI18n();

  const [accounts, balances] = await Promise.all([
    fetchAccounts(supabase),
    fetchAccountBalances(supabase),
  ]);

  // Card balances are debt, so they are shown separately instead of being
  // added to the money you actually have.
  const cards = accounts.filter((account) => account.type === "credit_card");
  const funds = accounts.filter((account) => account.type !== "credit_card");

  const available = funds.reduce(
    (sum, account) => sum + (balances.get(account.id) ?? 0),
    0,
  );
  const owed = cards.reduce(
    (sum, account) => sum + (balances.get(account.id) ?? 0),
    0,
  );

  return (
    <div className="flex flex-col gap-4 pt-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-text">{t.accounts.title}</h1>
        <ButtonLink href="/accounts/new" size="sm">
          <Plus className="size-4" aria-hidden />
          {t.common.new}
        </ButtonLink>
      </div>

      <Card className="grid grid-cols-2 gap-3 p-4">
        <div>
          <p className="text-xs text-text-muted">{t.accounts.available}</p>
          <p className="tabular mt-0.5 text-lg font-semibold text-text">
            {fmt.money(available)}
          </p>
        </div>
        <div>
          <p className="text-xs text-text-muted">{t.accounts.openBills}</p>
          <p className="tabular mt-0.5 text-lg font-semibold text-negative">
            {fmt.money(Math.abs(owed))}
          </p>
        </div>
      </Card>

      {accounts.length === 0 ? (
        <Card>
          <EmptyState
            title={t.accounts.emptyTitle}
            description={t.accounts.emptyBody}
            action={
              <ButtonLink href="/accounts/new">{t.accounts.emptyCta}</ButtonLink>
            }
          />
        </Card>
      ) : null}

      {funds.length > 0 ? (
        <Card className="pb-2">
          <CardHeader title={t.accounts.fundsTitle} />
          <ul className="mt-2 divide-y divide-border">
            {funds.map((account) => (
              <AccountRowItem
                key={account.id}
                account={account}
                balance={balances.get(account.id) ?? 0}
                t={t}
                fmt={fmt}
              />
            ))}
          </ul>
        </Card>
      ) : null}

      {cards.length > 0 ? (
        <Card className="pb-2">
          <CardHeader
            title={t.accounts.cardsTitle}
            description={t.accounts.cardsSubtitle}
          />
          <ul className="mt-2 divide-y divide-border">
            {cards.map((account) => (
              <AccountRowItem
                key={account.id}
                account={account}
                balance={balances.get(account.id) ?? 0}
                t={t}
                fmt={fmt}
                asDebt
              />
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

function AccountRowItem({
  account,
  balance,
  t,
  fmt,
  asDebt = false,
}: {
  account: AccountRow;
  balance: number;
  t: Messages;
  fmt: Formatters;
  asDebt?: boolean;
}) {
  const detail = [
    t.accounts.types[account.type],
    account.institution,
    account.statement_due_day
      ? t.accounts.dueOn(account.statement_due_day)
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li>
      <Link
        href={`/accounts/${account.id}`}
        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-3"
      >
        <span
          aria-hidden
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: account.color }}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-text">
            {account.name}
          </span>
          <span className="block truncate text-xs text-text-muted">
            {detail}
          </span>
        </span>
        <span
          className={`tabular shrink-0 text-sm font-semibold ${
            asDebt || balance < 0 ? "text-negative" : "text-text"
          }`}
        >
          {fmt.money(asDebt ? Math.abs(balance) : balance)}
        </span>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-text-faint" />
      </Link>
    </li>
  );
}
