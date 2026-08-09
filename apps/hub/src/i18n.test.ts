import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";

import { assertTranslationCatalogs, HUB_UNTRANSLATED_CONTENT, translationCatalogs } from "./i18n";
import {
  LANGUAGE_AUTONYMS,
  PUBLIC_LOCALES,
  resolveSystemLocale,
  type SupportedLocale,
} from "./locales";
import { offlineCatalogs, offlineCopy, orderedAcceptLanguages } from "./offline-i18n";

const sourceRoot = dirname(fileURLToPath(import.meta.url));
const visitorComponents = [
  "App.tsx",
  "BrowseCatalog.tsx",
  "GameRuntime.tsx",
  "HubDrawer.tsx",
  "main.tsx",
  "PwaPanel.tsx",
] as const;
const VISITOR_TEXT_ATTRIBUTES = new Set(["aria-label", "placeholder", "title"]);

function visitorLiterals(file: string): readonly string[] {
  const sourceText = readFileSync(resolve(sourceRoot, file), "utf8");
  const jsxText = [...sourceText.matchAll(/<[A-Za-z][^>]*>\s*([^<>{}]*\p{L}[^<>{}]*)\s*<\//gu)].map(
    (match) => match[1]!.replace(/\s+/gu, " ").trim(),
  );
  const textAttributes = [
    ...sourceText.matchAll(/\b(aria-label|placeholder|title)="([^"\r\n]*\p{L}[^"\r\n]*)"/gu),
  ]
    .filter((match) => VISITOR_TEXT_ATTRIBUTES.has(match[1]!))
    .map((match) => match[2]!);
  return [...jsxText, ...textAttributes];
}

describe("Hub localization boundary", () => {
  it("keeps all public catalogs exact, non-empty, count-neutral, and registry-compatible", () => {
    expect(() => assertTranslationCatalogs(translationCatalogs)).not.toThrow();
    expect(Object.keys(translationCatalogs)).toEqual(PUBLIC_LOCALES);
    expect(Object.keys(offlineCatalogs)).toEqual(PUBLIC_LOCALES);
    expect(LANGUAGE_AUTONYMS.map(({ locale }) => locale)).toEqual(PUBLIC_LOCALES);

    for (const locale of PUBLIC_LOCALES) {
      const catalog = translationCatalogs[locale];
      expect(Object.values(catalog).every((value) => value.trim().length > 0)).toBe(true);
      expect(Object.values(catalog).join(" ")).not.toContain("⟦missing:");
      expect(catalog["brand.subtitle"]).not.toMatch(/(?:three|3|三款|三个|3作品)/iu);
      expect(catalog["index.instruction"]).not.toMatch(/(?:all three|三款|3作品)/iu);
      expect(offlineCatalogs[locale].message).toContain("{{path}}");
    }
  });

  it("matches browser and Accept-Language preferences without conflating Traditional Chinese", () => {
    const cases: readonly [readonly string[], SupportedLocale][] = [
      [["ja-JP", "en-US"], "ja"],
      [["zh", "en-US"], "zh-Hans"],
      [["zh-Hans", "en-US"], "zh-Hans"],
      [["zh-CN", "en-US"], "zh-Hans"],
      [["zh-SG", "en-US"], "zh-Hans"],
      [["zh-Hant", "ja-JP"], "ja"],
      [["zh-TW"], "en"],
      [["zh-HK", "ja-JP"], "ja"],
      [["zh-MO", "fr-FR"], "en"],
      [["invalid_tag", "en-GB"], "en"],
    ];
    for (const [languages, expected] of cases) {
      expect(resolveSystemLocale(languages), languages.join(",")).toBe(expected);
    }
    expect(orderedAcceptLanguages("zh-TW;q=1, ja-JP;q=0.8, en;q=0")).toEqual(["zh-TW", "ja-JP"]);
    expect(offlineCopy(["zh-TW", "ja-JP"], "games/example/index.html")).toMatchObject({
      locale: "ja",
      direction: "ltr",
    });
  });

  it("allows only explicit brand literals outside the translation boundary", () => {
    const literals = visitorComponents.flatMap(visitorLiterals).sort();
    expect(literals).toEqual([...HUB_UNTRANSLATED_CONTENT.brandSegments].sort());
  });
});
