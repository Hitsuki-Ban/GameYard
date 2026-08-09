import {
  localeDirection,
  PUBLIC_LOCALES,
  resolveSystemLocale,
  type SupportedLocale,
} from "./locales";

interface OfflineCatalog {
  readonly title: string;
  readonly message: string;
}

export const offlineCatalogs = {
  en: {
    title: "Offline game unavailable",
    message: "The offline copy for {{path}} is unavailable. Connect and save this game first.",
  },
  ja: {
    title: "オフラインゲームを利用できません",
    message: "{{path}} のオフラインコピーは利用できません。接続後にこのゲームを保存してください。",
  },
  "zh-Hans": {
    title: "离线游戏不可用",
    message: "{{path}} 的离线副本不可用。请联网后先保存此游戏。",
  },
} as const satisfies Record<SupportedLocale, OfflineCatalog>;

if (Object.keys(offlineCatalogs).length !== PUBLIC_LOCALES.length) {
  throw new Error("Offline catalogs do not match the public locale set");
}

export function orderedAcceptLanguages(header: string | null): readonly string[] {
  if (header === null) return [];
  return header
    .split(",")
    .map((part, index) => {
      const [language = "", ...parameters] = part.trim().split(";");
      const qualityParameter = parameters.find((parameter) => parameter.trim().startsWith("q="));
      const quality = qualityParameter
        ? Number.parseFloat(qualityParameter.trim().slice("q=".length))
        : 1;
      return { language, quality, index };
    })
    .filter(
      (candidate) =>
        candidate.language !== "" &&
        candidate.language !== "*" &&
        Number.isFinite(candidate.quality) &&
        candidate.quality > 0 &&
        candidate.quality <= 1,
    )
    .sort((left, right) => right.quality - left.quality || left.index - right.index)
    .map((candidate) => candidate.language);
}

export function offlineCopy(
  languages: readonly string[],
  path: string,
): OfflineCatalog & { readonly locale: SupportedLocale; readonly direction: "ltr" } {
  const locale = resolveSystemLocale(languages);
  const catalog = offlineCatalogs[locale];
  return {
    locale,
    direction: localeDirection(locale),
    title: catalog.title,
    message: catalog.message.replace("{{path}}", path),
  };
}
