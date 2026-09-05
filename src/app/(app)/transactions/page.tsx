import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftRight, X } from "lucide-react";

import { MonthSwitcher } from "@/components/month-switcher";
import { ButtonLink, Card, EmptyState } from "@/components/ui";
import type { Formatters } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import type { Messages } from "@/i18n/messages";
import { groupByDay, totalsFor, UNCATEGORIZED } from "@/lib/aggregate";
import { currentMonthKey, isValidMonthKey } from "@/lib/dates";
import { fetchMonthEntries, type Entry } from "@/lib/queries";
import { requireUser } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.transactions.title };
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; category?: string }>;
}) {
  const { month: requested, category } = await searchParams;
  const month =
    requested && isValidMonthKey(requested) ? requested : currentMonthKey();

  const { supabase } = await requireUser();
  const { t, fmt } = await getI18n();

  const allEntries = await fetchMonthEntries(supabase, month);

  const entries = category
    ? allEntries.filter((entry) =>
        category === UNCATEGORIZED.id
          ? entry.category_id === null && entry.kind !== "transfer"
          : entry.category_id === category,
      )
    : allEntries;

  const totals = totalsFor(entries);
  const days = groupByDay(entries);

  const filterName =
    category === UNCATEGORIZED.id
      ? t.categories.uncategorized
      : (allEntries.find((entry) => entry.category_id === category)?.category
          ?.name ?? null);

  return (
    <div className="flex flex-col gap-4 pt-4">
      <MonthSwitcher month={month} />

      <Card className="flex items-center justify-between gap-3 px-4 py-3">
        <div>
          <p className="text-xs text-text-muted">{t.transactions.outflow}</p>
          <p className="tabular text-base font-semibold text-text">
            {fmt.money(totals.expenseCents)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-text-muted">{t.transactions.inflow}</p>
          <p className="tabular text-base font-semibold text-positive">
            {fmt.money(totals.incomeCents)}
          </p>
        </div>
      </Card>

      {category && filterName ? (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full bg-surface-3 py-1 pl-3 pr-1 text-xs text-text">
            {filterName}
            <Link
              href={`/transactions?month=${month}`}
              aria-label={t.transactions.removeFilter}
              className="flex size-5 items-center justify-center rounded-full text-text-muted hover:bg-surface-0"
            >
              <X className="size-3" aria-hidden />
            </Link>
          </span>
        </div>
      ) : null}

      {days.length === 0 ? (
        <Card>
          <EmptyState
            title={t.transactions.emptyTitle}
            description={
              category
                ? t.transactions.emptyFiltered
                : t.transactions.emptyBody
            }
            action={
              <ButtonLink href="/transactions/new">
                {t.transactions.add}
              </ButtonLink>
            }
          />
        </Card>
      ) : (
        days.map(([day, dayEntries]) => (
          <section key={day}>
            <div className="mb-1.5 flex items-baseline justify-between px-1">
              <h2 className="text-xs font-medium text-text-muted first-letter:uppercase">
                {fmt.dayLabel(day)}
              </h2>
              <span className="tabular text-xs text-text-faint">
                {fmt.money(
                  dayEntries.reduce(
                    (sum, entry) =>
                      entry.kind === "expense" ? sum + entry.amount_cents : sum,
                    0,
                  ),
                )}
              </span>
            </div>

            <Card className="divide-y divide-border overflow-hidden">
              {dayEntries.map((entry) => (
                <EntryRow key={entry.id} entry={entry} t={t} fmt={fmt} />
              ))}
            </Card>
          </section>
        ))
      )}
    </div>
  );
}

function EntryRow({
  entry,
  t,
  fmt,
}: {
  entry: Entry;
  t: Messages;
  fmt: Formatters;
}) {
  const isTransfer = entry.kind === "transfer";
  const isIncome = entry.kind === "income";

  const title =
    entry.description ||
    entry.subcategory?.name ||
    entry.category?.name ||
    (isTransfer ? t.transactions.transfer : t.transactions.noDescription);

  const subtitle = isTransfer
    ? t.transactions.transferTo(entry.account?.name ?? t.common.none)
    : [entry.category?.name, entry.subcategory?.name, entry.account?.name]
        .filter(Boolean)
        .join(" · ");

  return (
    <Link
      href={`/transactions/${entry.id}`}
      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-3"
    >
      {isTransfer ? (
        <ArrowLeftRight
          aria-hidden
          className="size-2.5 shrink-0 text-text-faint"
        />
      ) : (
        <span
          aria-hidden
          className="size-2.5 shrink-0 rounded-full"
          style={{
            backgroundColor: entry.category?.color ?? UNCATEGORIZED.color,
          }}
        />
      )}

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-text">
          {title}
          {entry.installment_total ? (
            <span className="ml-1.5 text-xs font-normal text-text-faint">
              {entry.installment_number}/{entry.installment_total}
            </span>
          ) : null}
        </span>
        {subtitle ? (
          <span className="block truncate text-xs text-text-muted">
            {subtitle}
          </span>
        ) : null}
      </span>

      <span
        className={`tabular shrink-0 text-sm font-semibold ${
          isIncome
            ? "text-positive"
            : isTransfer
              ? "text-text-muted"
              : "text-text"
        }`}
      >
        {isIncome ? "+" : isTransfer ? "" : "−"}
        {fmt.money(entry.amount_cents)}
      </span>
    </Link>
  );
}
