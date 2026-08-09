import {
  LOCALE_PREFERENCES,
  PUBLIC_LOCALES,
  type LocalePreference as ContractLocalePreference,
  type PublicLocale,
} from "@gameyard/game-contract/locales";

export type LocalePreference = ContractLocalePreference;
export type SupportedLocale = PublicLocale;

export const DEFAULT_LOCALE: SupportedLocale = "en";
export { LOCALE_PREFERENCES, PUBLIC_LOCALES };

export const LANGUAGE_AUTONYMS: readonly {
  readonly locale: SupportedLocale;
  readonly label: string;
}[] = [
  { locale: "en", label: "English" },
  { locale: "ja", label: "日本語" },
  { locale: "zh-Hans", label: "简体中文" },
];

export function languageAutonym(locale: SupportedLocale): string {
  const option = LANGUAGE_AUTONYMS.find((candidate) => candidate.locale === locale);
  if (!option) throw new Error(`Missing language autonym for ${locale}`);
  return option.label;
}

const HANT_REGIONS = new Set(["HK", "MO", "TW"]);
const HANS_REGIONS = new Set(["CN", "SG"]);

function matchLanguageTag(languageTag: string): SupportedLocale | null {
  let locale: Intl.Locale;
  try {
    locale = new Intl.Locale(languageTag);
  } catch {
    return null;
  }

  if (locale.language === "en") return "en";
  if (locale.language === "ja") return "ja";
  if (locale.language !== "zh") return null;

  if (
    locale.script === "Hant" ||
    (locale.region !== undefined && HANT_REGIONS.has(locale.region))
  ) {
    return null;
  }
  if (
    locale.script === "Hans" ||
    (locale.region !== undefined && HANS_REGIONS.has(locale.region))
  ) {
    return "zh-Hans";
  }
  return locale.script === undefined && locale.region === undefined ? "zh-Hans" : null;
}

export function resolveSystemLocale(languages: readonly string[]): SupportedLocale {
  for (const language of languages) {
    const match = matchLanguageTag(language);
    if (match !== null) return match;
  }
  return DEFAULT_LOCALE;
}

export function localeDirection(_locale: SupportedLocale): "ltr" {
  return "ltr";
}

export function currentSystemLanguages(): readonly string[] {
  return navigator.languages.length > 0 ? [...navigator.languages] : [navigator.language];
}
