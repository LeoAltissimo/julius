"use client";

import { useState } from "react";

import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/cn";
import { centsFromDigits, digitsFromCents } from "@/lib/money";

/**
 * Digits fill in from the right, so typing 4790 reads back as 47,90. There is
 * no decimal separator to place and no way to end up with R$ 4.790,00 because a
 * comma was missed — the failure mode that makes people stop tracking expenses.
 *
 * The visible field is display only; `name` carries the integer cents.
 */
export function MoneyInput({
  name,
  defaultValueCents = 0,
  autoFocus,
  onValueChange,
  className,
}: {
  name: string;
  defaultValueCents?: number;
  autoFocus?: boolean;
  onValueChange?: (cents: number) => void;
  className?: string;
}) {
  const { t, fmt } = useI18n();
  const [digits, setDigits] = useState(() =>
    defaultValueCents ? digitsFromCents(defaultValueCents) : "",
  );

  const cents = centsFromDigits(digits);

  return (
    <div
      className={cn(
        "flex items-baseline gap-2 rounded-xl border border-border bg-surface-0 px-3 py-3 focus-within:border-accent",
        className,
      )}
    >
      <span className="text-lg font-medium text-text-muted">R$</span>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        autoFocus={autoFocus}
        aria-label={t.entryForm.amount}
        value={fmt.moneyPlain(cents)}
        onChange={(event) => {
          const next = event.target.value.replace(/\D/g, "").slice(0, 12);
          setDigits(next);
          onValueChange?.(centsFromDigits(next));
        }}
        className="tabular w-full bg-transparent text-3xl font-semibold tracking-tight text-text outline-none"
      />
      <input type="hidden" name={name} value={cents} />
    </div>
  );
}
