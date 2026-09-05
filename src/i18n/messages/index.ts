import type { Locale } from "../config";

import { en } from "./en";
import { ptBR, type Messages } from "./pt-BR";

export const MESSAGES: Record<Locale, Messages> = {
  "pt-BR": ptBR,
  en,
};

export type { Messages };
