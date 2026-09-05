/**
 * Every amount in Julius is an integer number of cents. Nothing is ever stored
 * or summed as a float, so R$ 0,10 + R$ 0,20 is exactly R$ 0,30.
 *
 * This module is pure arithmetic. Anything that renders an amount for a human
 * lives in `@/i18n/format`, because how it reads depends on the locale.
 */

/**
 * Turns whatever the user typed into cents.
 *
 * Handles the shapes a Brazilian actually types: "47,90", "1.234,56",
 * "R$ 89", "89.90". When only dots are present, a trailing group of exactly
 * three digits is read as a thousands separator ("1.500" is fifteen hundred
 * reais, not one and a half).
 */
export function parseMoneyToCents(input: string): number | null {
  const cleaned = input.replace(/[^\d.,-]/g, "").trim();
  if (!cleaned) return null;

  const negative = cleaned.startsWith("-");
  const digitsAndSeparators = cleaned.replace(/-/g, "");
  if (!digitsAndSeparators) return null;

  const hasComma = digitsAndSeparators.includes(",");
  const hasDot = digitsAndSeparators.includes(".");

  let normalized: string;
  if (hasComma && hasDot) {
    normalized = digitsAndSeparators.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    normalized = digitsAndSeparators.replace(",", ".");
  } else if (hasDot) {
    const parts = digitsAndSeparators.split(".");
    const last = parts[parts.length - 1];
    const looksLikeThousands = parts.length > 1 && last.length === 3;
    normalized = looksLikeThousands
      ? parts.join("")
      : parts.slice(0, -1).join("") + "." + last;
  } else {
    normalized = digitsAndSeparators;
  }

  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;

  const cents = Math.round(value * 100);
  return negative ? -cents : cents;
}

/**
 * The masked-input path: the user types digits and they fill in from the right,
 * so "4790" reads back as R$ 47,90. There is no cursor to fight and no way to
 * land on an ambiguous separator.
 */
export function centsFromDigits(digits: string): number {
  const onlyDigits = digits.replace(/\D/g, "").slice(0, 15);
  if (!onlyDigits) return 0;
  return Number(onlyDigits);
}

export function digitsFromCents(cents: number): string {
  return String(Math.abs(Math.trunc(cents)));
}

/**
 * Splits a purchase into instalments without losing a cent: the remainder is
 * spread one cent at a time over the earliest instalments, the way a card
 * issuer does it.
 */
export function splitInstallments(
  totalCents: number,
  count: number,
): number[] {
  if (count < 1) return [totalCents];

  const base = Math.floor(totalCents / count);
  const remainder = totalCents - base * count;

  return Array.from({ length: count }, (_, index) =>
    index < remainder ? base + 1 : base,
  );
}

export function percentChange(
  current: number,
  previous: number,
): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}
