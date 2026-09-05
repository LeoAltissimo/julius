import { format, parseISO } from "date-fns";
import { enUS, ptBR as ptBRDate } from "date-fns/locale";
import type { Locale as DateFnsLocale } from "date-fns";

import { monthKeyToDate, type MonthKey } from "@/lib/dates";

import { DEFAULT_LOCALE, type Locale } from "./config";

const DATE_LOCALES: Record<Locale, DateFnsLocale> = {
  "pt-BR": ptBRDate,
  en: enUS,
};

/**
 * The amounts stay in reais whatever the interface language is -- this is a
 * Brazilian app, and translating the currency would be translating the money.
 * Only the grouping and the decimal separator follow the locale.
 */
const CURRENCY = "BRL";

const MONTH_YEAR: Record<Locale, string> = {
  "pt-BR": "MMMM 'de' yyyy",
  en: "MMMM yyyy",
};

const DAY_MONTH: Record<Locale, string> = {
  "pt-BR": "d 'de' MMM",
  en: "d MMM",
};

const FULL_DATE: Record<Locale, string> = {
  "pt-BR": "d 'de' MMMM 'de' yyyy",
  en: "d MMMM yyyy",
};

const SHORT_DATE: Record<Locale, string> = {
  "pt-BR": "dd/MM",
  en: "dd/MM",
};

export type Formatters = ReturnType<typeof buildFormatters>;

function buildFormatters(locale: Locale) {
  const dateLocale = DATE_LOCALES[locale];

  const currency = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: CURRENCY,
  });

  const plain = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const compactCurrency = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: CURRENCY,
    notation: "compact",
    maximumFractionDigits: 1,
  });

  const compactNumber = new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: 1,
  });

  return {
    locale,

    money: (cents: number) => currency.format(cents / 100),

    /** No symbol, two decimals: for inputs where the R$ is its own element. */
    moneyPlain: (cents: number) => plain.format(cents / 100),

    /** For tight cards, where "R$ 12,3 mil" beats "R$ 12.345,67". */
    moneyCompact: (cents: number) => compactCurrency.format(cents / 100),

    /**
     * Chart axes drop the currency symbol: "R$ 10 mil" does not fit in the
     * gutter of a phone-width chart and gets clipped to "$ 10 mil".
     */
    axisAmount: (cents: number) => compactNumber.format(cents / 100),

    monthLabel: (month: MonthKey) =>
      format(monthKeyToDate(month), MONTH_YEAR[locale], { locale: dateLocale }),

    monthShort: (month: MonthKey) =>
      format(monthKeyToDate(month), "MMM/yy", { locale: dateLocale }),

    dayLabel: (isoDate: string) =>
      format(parseISO(`${isoDate}T00:00:00`), DAY_MONTH[locale], {
        locale: dateLocale,
      }),

    fullDate: (isoDate: string) =>
      format(parseISO(`${isoDate}T00:00:00`), FULL_DATE[locale], {
        locale: dateLocale,
      }),

    shortDate: (timestamp: string) =>
      format(parseISO(timestamp), SHORT_DATE[locale], { locale: dateLocale }),

    time: (timestamp: string) =>
      format(parseISO(timestamp), "HH:mm", { locale: dateLocale }),
  };
}

const cache = new Map<Locale, Formatters>();

export function getFormatters(locale: Locale = DEFAULT_LOCALE): Formatters {
  let formatters = cache.get(locale);
  if (!formatters) {
    formatters = buildFormatters(locale);
    cache.set(locale, formatters);
  }
  return formatters;
}
