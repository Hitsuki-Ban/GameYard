export const PUBLIC_LOCALES = ["en", "ja", "zh-Hans"] as const;
export const LOCALE_PREFERENCES = ["system", ...PUBLIC_LOCALES] as const;

export type PublicLocale = (typeof PUBLIC_LOCALES)[number];
export type LocalePreference = (typeof LOCALE_PREFERENCES)[number];
