import type { Language } from "../enums";
import { en, type Catalog } from "./en";
import { te } from "./te";

export type { Catalog } from "./en";

export const DEFAULT_LANGUAGE: Language = "te";
export const SUPPORTED_LANGUAGES: Language[] = ["te", "en"];

/** i18next-compatible resource bundle. */
export const resources: Record<Language, { translation: Catalog }> = {
  te: { translation: te },
  en: { translation: en },
};

export const catalogs: Record<Language, Catalog> = { te, en };
