export const LOCALES = ["pt-BR", "en"] as const;

export type Locale = (typeof LOCALES)[number];

/**
 * Portuguese is the default because the app is built around Brazilian habits:
 * instalments on a credit card, `R$ 1.234,56`, categories like "Frutaria".
 */
export const DEFAULT_LOCALE: Locale = "pt-BR";

export const LOCALE_COOKIE = "locale";

export const LOCALE_LABELS: Record<Locale, string> = {
  "pt-BR": "Português",
  en: "English",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && LOCALES.includes(value as Locale);
}
