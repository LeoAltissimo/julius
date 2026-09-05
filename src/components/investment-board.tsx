"use client";

import { useState } from "react";
import Link from "next/link";
import { Pencil, X } from "lucide-react";

import { Button } from "@/components/ui";
import { useI18n } from "@/i18n/client";
import { centsFromDigits, digitsFromCents } from "@/lib/money";
import type { InvestmentRow } from "@/lib/queries";

/**
 * Two modes on one screen. Reading is the common case; the update mode puts
 * every position into an editable field at once, because updating them one at a
 * time through separate forms is exactly the friction that makes people stop.
 */
export function InvestmentBoard({
  investments,
  action,
}: {
  investments: InvestmentRow[];
  action: (formData: FormData) => Promise<void>;
}) {
  const { t, fmt } = useI18n();
  const [editing, setEditing] = useState(false);

  if (investments.length === 0) return null;

  if (!editing) {
    const total = investments.reduce(
      (sum, item) => sum + item.current_value_cents,
      0,
    );

    return (
      <div>
        <ul className="divide-y divide-border">
          {investments.map((investment) => (
            <li
              key={investment.id}
              className="flex items-center gap-3 px-4 py-3"
            >
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: investment.color }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-text">
                  {investment.name}
                </span>
                <span className="block truncate text-xs text-text-muted">
                  {[investment.institution, investment.kind]
                    .filter(Boolean)
                    .join(" · ") || t.common.none}
                  {total > 0
                    ? ` · ${((investment.current_value_cents / total) * 100).toFixed(0)}%`
                    : ""}
                </span>
              </span>
              <span className="tabular shrink-0 text-sm font-semibold text-text">
                {fmt.money(investment.current_value_cents)}
              </span>
              <Link
                href={`/investments/${investment.id}`}
                aria-label={t.investments.editPosition(investment.name)}
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-text-faint transition-colors hover:bg-surface-3 hover:text-text"
              >
                <Pencil className="size-4" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>

        <div className="px-4 pb-1 pt-3">
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={() => setEditing(true)}
          >
            {t.investments.updateValues}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form action={action}>
      <ul className="divide-y divide-border">
        {investments.map((investment) => (
          <ValueRow key={investment.id} investment={investment} />
        ))}
      </ul>

      <div className="flex gap-2 px-4 pb-1 pt-3">
        <Button
          type="button"
          variant="ghost"
          className="flex-1"
          onClick={() => setEditing(false)}
        >
          <X className="size-4" aria-hidden />
          {t.common.cancel}
        </Button>
        <Button type="submit" className="flex-[2]">
          {t.investments.saveValues}
        </Button>
      </div>
    </form>
  );
}

function ValueRow({ investment }: { investment: InvestmentRow }) {
  const { t, fmt } = useI18n();
  const [digits, setDigits] = useState(
    digitsFromCents(investment.current_value_cents),
  );
  const cents = centsFromDigits(digits);

  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <span
        aria-hidden
        className="size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: investment.color }}
      />
      <label className="min-w-0 flex-1 truncate text-sm text-text">
        {investment.name}
      </label>

      <div className="flex shrink-0 items-baseline gap-1 rounded-lg border border-border bg-surface-0 px-2 py-1.5 focus-within:border-accent">
        <span className="text-xs text-text-muted">R$</span>
        <input
          type="text"
          inputMode="numeric"
          aria-label={t.investments.valueOf(investment.name)}
          value={fmt.moneyPlain(cents)}
          onChange={(event) =>
            setDigits(event.target.value.replace(/\D/g, "").slice(0, 12))
          }
          className="tabular w-28 bg-transparent text-right text-sm font-medium text-text outline-none"
        />
      </div>

      <input type="hidden" name={`value_${investment.id}`} value={cents} />
      <input
        type="hidden"
        name={`previous_${investment.id}`}
        value={investment.current_value_cents}
      />
    </li>
  );
}
