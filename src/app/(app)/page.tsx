import Link from "next/link";
import { ArrowRight, Wallet } from "lucide-react";

import { CategoryBreakdown } from "@/components/category-breakdown";
import { Delta } from "@/components/delta";
import { MonthSwitcher } from "@/components/month-switcher";
import { SpendPaceChart, type PacePoint } from "@/components/spend-pace-chart";
import { ButtonLink, Card, CardHeader, EmptyState } from "@/components/ui";
import { getI18n } from "@/i18n/server";
import { categoryBreakdown, cumulativeByDay, totalsFor } from "@/lib/aggregate";
import { currentMonthKey, isValidMonthKey, previousMonth } from "@/lib/dates";
import { fetchInvestments, fetchMonthEntries } from "@/lib/queries";
import { requireUser } from "@/lib/supabase/server";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month: requested } = await searchParams;
  const month =
    requested && isValidMonthKey(requested) ? requested : currentMonthKey();
  const prior = previousMonth(month);

  const { supabase } = await requireUser();
  const { t, fmt, locale } = await getI18n();

  const [currentEntries, previousEntries, investments] = await Promise.all([
    fetchMonthEntries(supabase, month),
    fetchMonthEntries(supabase, prior),
    fetchInvestments(supabase),
  ]);

  const current = totalsFor(currentEntries);
  const previousTotals = totalsFor(previousEntries);
  const categories = categoryBreakdown(currentEntries, previousEntries, {
    locale,
  });

  const invested = investments.reduce(
    (sum, position) => sum + position.current_value_cents,
    0,
  );

  // Only draw the current month up to today, so the running line is not a flat
  // stretch across days that have not happened yet.
  const isCurrentMonth = month === currentMonthKey();
  const lastDayToPlot = isCurrentMonth ? new Date().getDate() : 31;

  const currentPace = cumulativeByDay(currentEntries);
  const previousPace = cumulativeByDay(previousEntries);
  const pace: PacePoint[] = Array.from({ length: 31 }, (_, index) => {
    const day = index + 1;
    return {
      day,
      current: day <= lastDayToPlot ? (currentPace.get(day) ?? 0) : null,
      previous: previousPace.get(day) ?? 0,
    };
  });

  const hasAnything =
    current.entryCount > 0 || previousTotals.entryCount > 0 || invested > 0;

  return (
    <div className="flex flex-col gap-4 pt-4">
      <MonthSwitcher month={month} />

      <Card className="p-4">
        <p className="text-xs font-medium text-text-muted">
          {t.dashboard.monthSpending}
        </p>
        <p className="tabular mt-1 text-3xl font-semibold tracking-tight text-text">
          {fmt.money(current.expenseCents)}
        </p>
        <div className="mt-1.5">
          <Delta
            current={current.expenseCents}
            previous={previousTotals.expenseCents}
          />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3">
          <div>
            <p className="text-xs text-text-muted">{t.dashboard.income}</p>
            <p className="tabular mt-0.5 text-lg font-semibold text-positive">
              {fmt.money(current.incomeCents)}
            </p>
            <Delta
              current={current.incomeCents}
              previous={previousTotals.incomeCents}
              higherIsWorse={false}
              showAmount={false}
            />
          </div>
          <div>
            <p className="text-xs text-text-muted">{t.dashboard.leftOver}</p>
            <p
              className={`tabular mt-0.5 text-lg font-semibold ${
                current.netCents < 0 ? "text-negative" : "text-text"
              }`}
            >
              {fmt.money(current.netCents)}
            </p>
            <Delta
              current={current.netCents}
              previous={previousTotals.netCents}
              higherIsWorse={false}
              showAmount={false}
            />
          </div>
        </div>
      </Card>

      {!hasAnything ? (
        <Card>
          <EmptyState
            title={t.dashboard.emptyTitle}
            description={t.dashboard.emptyBody}
            action={
              <ButtonLink href="/transactions/new">
                {t.dashboard.emptyCta}
              </ButtonLink>
            }
          />
        </Card>
      ) : null}

      {current.entryCount > 0 || previousTotals.entryCount > 0 ? (
        <Card className="pb-3">
          <CardHeader
            title={t.dashboard.pace}
            description={t.dashboard.paceSubtitle(fmt.monthShort(prior))}
          />
          <div className="px-1 pt-2">
            <SpendPaceChart
              data={pace}
              currentLabel={fmt.monthShort(month)}
              previousLabel={fmt.monthShort(prior)}
            />
          </div>
        </Card>
      ) : null}

      {categories.length > 0 ? (
        <Card className="pb-2">
          <CardHeader
            title={t.dashboard.whereItWent}
            description={t.dashboard.whereItWentSubtitle}
          />
          <div className="mt-2">
            <CategoryBreakdown categories={categories} month={month} />
          </div>
        </Card>
      ) : null}

      <Card className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-medium text-text-muted">
              <Wallet className="size-3.5" aria-hidden />
              {t.dashboard.invested}
            </p>
            <p className="tabular mt-1 text-xl font-semibold text-text">
              {fmt.money(invested)}
            </p>
            <p className="mt-0.5 text-xs text-text-faint">
              {investments.length === 0
                ? t.investments.noPositions
                : t.investments.positionCountShort(investments.length)}
            </p>
          </div>
          <Link
            href="/investments"
            aria-label={t.dashboard.openNetWorth}
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-3 text-text-muted transition-colors hover:text-text"
          >
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </Card>
    </div>
  );
}
