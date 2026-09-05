import type { Metadata } from "next";
import { Plus } from "lucide-react";

import { InvestmentBoard } from "@/components/investment-board";
import { NetWorthChart, type NetWorthDatum } from "@/components/net-worth-chart";
import { ButtonLink, Card, CardHeader, EmptyState } from "@/components/ui";
import { getI18n } from "@/i18n/server";
import { fetchInvestments, fetchNetWorthSeries } from "@/lib/queries";
import { requireUser } from "@/lib/supabase/server";

import { updateInvestmentValues } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.investments.title };
}

export default async function InvestmentsPage() {
  const { supabase } = await requireUser();
  const { t, fmt } = await getI18n();

  const [investments, series] = await Promise.all([
    fetchInvestments(supabase),
    fetchNetWorthSeries(supabase),
  ]);

  const total = investments.reduce(
    (sum, item) => sum + item.current_value_cents,
    0,
  );

  // Several positions updated in one sitting land on the same date, and an axis
  // repeating "05/09" four times says nothing. Fall back to the clock while the
  // whole history still fits in a single day.
  const sameDay =
    series.length > 0 &&
    series[0].recorded_at.slice(0, 10) ===
      series[series.length - 1].recorded_at.slice(0, 10);

  const chartData: NetWorthDatum[] = series.map((point) => ({
    label: sameDay ? fmt.time(point.recorded_at) : fmt.shortDate(point.recorded_at),
    value: point.value_cents,
  }));

  return (
    <div className="flex flex-col gap-4 pt-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-text">
          {t.investments.title}
        </h1>
        <ButtonLink href="/investments/new" size="sm">
          <Plus className="size-4" aria-hidden />
          {t.investments.newPosition}
        </ButtonLink>
      </div>

      <Card className="p-4">
        <p className="text-xs font-medium text-text-muted">
          {t.investments.total}
        </p>
        <p className="tabular mt-1 text-3xl font-semibold tracking-tight text-text">
          {fmt.money(total)}
        </p>
        <p className="mt-1 text-xs text-text-faint">
          {investments.length === 0
            ? t.investments.noPositions
            : t.investments.positionCount(investments.length)}
        </p>
      </Card>

      {chartData.length > 1 ? (
        <Card className="pb-3">
          <CardHeader
            title={t.investments.evolution}
            description={t.investments.evolutionSubtitle}
          />
          <div className="px-1 pt-2">
            <NetWorthChart data={chartData} />
          </div>
        </Card>
      ) : null}

      <Card className="pb-2">
        <CardHeader title={t.investments.positions} />
        {investments.length === 0 ? (
          <EmptyState
            title={t.investments.emptyTitle}
            description={t.investments.emptyBody}
            action={
              <ButtonLink href="/investments/new">
                {t.investments.emptyCta}
              </ButtonLink>
            }
          />
        ) : (
          <div className="mt-2">
            <InvestmentBoard
              investments={investments}
              action={updateInvestmentValues}
            />
          </div>
        )}
      </Card>
    </div>
  );
}
