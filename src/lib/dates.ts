import { addMonths, endOfMonth, format, parseISO, startOfMonth, subMonths } from "date-fns";

/**
 * A month is addressed as "2026-09" everywhere in the app and in the URL.
 *
 * This module is calendar arithmetic only. Turning a month into words is the
 * job of `@/i18n/format`, since the words depend on the locale.
 */
export type MonthKey = string;

export function toMonthKey(date: Date): MonthKey {
  return format(date, "yyyy-MM");
}

export function currentMonthKey(): MonthKey {
  return toMonthKey(new Date());
}

export function isValidMonthKey(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function monthKeyToDate(month: MonthKey): Date {
  return parseISO(`${month}-01T00:00:00`);
}

export function shiftMonth(month: MonthKey, delta: number): MonthKey {
  return toMonthKey(addMonths(monthKeyToDate(month), delta));
}

export function previousMonth(month: MonthKey): MonthKey {
  return toMonthKey(subMonths(monthKeyToDate(month), 1));
}

/** Inclusive first and last day, as the `date` strings Postgres expects. */
export function monthRange(month: MonthKey): { from: string; to: string } {
  const date = monthKeyToDate(month);
  return {
    from: format(startOfMonth(date), "yyyy-MM-dd"),
    to: format(endOfMonth(date), "yyyy-MM-dd"),
  };
}

export function todayIso(): string {
  return format(new Date(), "yyyy-MM-dd");
}

/** The month keys from `month` going back `count - 1` months, oldest first. */
export function recentMonths(month: MonthKey, count: number): MonthKey[] {
  return Array.from({ length: count }, (_, index) =>
    shiftMonth(month, -(count - 1 - index)),
  );
}
