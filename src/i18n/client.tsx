"use client";

import { createContext, useContext, useMemo } from "react";

import { DEFAULT_LOCALE, type Locale } from "./config";
import { getFormatters, type Formatters } from "./format";
import { MESSAGES, type Messages } from "./messages";

type ClientI18n = {
  locale: Locale;
  t: Messages;
  fmt: Formatters;
};

const I18nContext = createContext<ClientI18n | null>(null);

/**
 * Only the locale crosses the server/client boundary. The catalogues are
 * imported here instead of passed down as props, because messages that take
 * arguments are functions and functions are not serialisable.
 */
export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const value = useMemo<ClientI18n>(
    () => ({
      locale,
      t: MESSAGES[locale],
      fmt: getFormatters(locale),
    }),
    [locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): ClientI18n {
  const value = useContext(I18nContext);
  if (value) return value;

  // A client component rendered outside the provider still has to render
  // something readable rather than crash.
  return {
    locale: DEFAULT_LOCALE,
    t: MESSAGES[DEFAULT_LOCALE],
    fmt: getFormatters(DEFAULT_LOCALE),
  };
}
