"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/cn";
import { percentChange } from "@/lib/money";

/**
 * A month-over-month delta. For spending, going up is bad, so the colour is
 * driven by `higherIsWorse` rather than by the sign alone.
 */
export function Delta({
  current,
  previous,
  higherIsWorse = true,
  className,
  showAmount = true,
}: {
  current: number;
  previous: number;
  higherIsWorse?: boolean;
  className?: string;
  showAmount?: boolean;
}) {
  const { t, fmt } = useI18n();

  const diff = current - previous;
  const pct = percentChange(current, previous);

  if (previous === 0 && current === 0) {
    return (
      <span className={cn("text-xs text-text-faint", className)}>
        {t.delta.noMovement}
      </span>
    );
  }

  if (diff === 0) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 text-xs text-text-muted",
          className,
        )}
      >
        <Minus className="size-3" aria-hidden />
        {t.delta.sameAsLastMonth}
      </span>
    );
  }

  const worse = higherIsWorse ? diff > 0 : diff < 0;
  const Icon = diff > 0 ? ArrowUpRight : ArrowDownRight;

  const pctLabel =
    pct === null
      ? previous === 0
        ? t.delta.brandNew
        : ""
      : `${Math.abs(pct).toFixed(0)}%`;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium tabular",
        worse ? "text-negative" : "text-positive",
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {pctLabel}
      {showAmount ? (
        <span className="font-normal text-text-muted">
          ({diff > 0 ? "+" : "−"}
          {fmt.money(Math.abs(diff))})
        </span>
      ) : null}
    </span>
  );
}
