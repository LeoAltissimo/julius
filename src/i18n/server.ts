import "server-only";

import { cookies } from "next/headers";

import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from "./config";
import { getFormatters, type Formatters } from "./format";
import { MESSAGES, type Messages } from "./messages";

export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const value = store.get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export type ServerI18n = {
  locale: Locale;
  t: Messages;
  fmt: Formatters;
};

/** One call gives a server component its strings and its formatters. */
export async function getI18n(): Promise<ServerI18n> {
  const locale = await getLocale();
  return { locale, t: MESSAGES[locale], fmt: getFormatters(locale) };
}
