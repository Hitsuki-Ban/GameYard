import { describe, expect, it } from "vite-plus/test";

import { PUBLIC_LOCALES, type LocaleContext } from "@gameyard/game-contract";

import {
  NEON_CATALOG_KEYS,
  NEON_SOURCE_LOCALE,
  NEON_UNTRANSLATED_CONTENT,
  createNeonI18n,
  type NeonCatalogKey,
  type NeonNumberStyle,
} from "../../guest/src/i18n";

const EXACT_LOCALES = ["en", "ja", "zh-Hans"] as const;

function context(resolved: (typeof EXACT_LOCALES)[number]): LocaleContext {
  return { preference: resolved, resolved };
}

function requiredParams(
  i18n: ReturnType<typeof createNeonI18n>,
  key: NeonCatalogKey,
): Record<string, string> | undefined {
  try {
    i18n.t(key);
    return undefined;
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    const match = /^Neon translation .+ requires exactly: (.+)\.$/u.exec(error.message);
    if (match === null) throw error;
    return Object.fromEntries(match[1]!.split(", ").map((name) => [name, `value-${name}`]));
  }
}

function expectedNumber(locale: string, value: number, style: NeonNumberStyle): string {
  switch (style) {
    case "score":
      return new Intl.NumberFormat(locale, {
        minimumIntegerDigits: 9,
        maximumFractionDigits: 0,
        useGrouping: false,
      }).format(Math.floor(value));
    case "integer":
      return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.trunc(value));
    case "decimal2":
      return new Intl.NumberFormat(locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);
    case "percent":
      return new Intl.NumberFormat(locale, {
        style: "percent",
        maximumFractionDigits: 0,
      }).format(value);
    case "clock": {
      const part = new Intl.NumberFormat(locale, {
        minimumIntegerDigits: 2,
        maximumFractionDigits: 0,
        useGrouping: false,
      });
      const seconds = Math.floor(value);
      return `${part.format(Math.floor(seconds / 60))}:${part.format(seconds % 60)}`;
    }
  }
}

describe("Neon game-local i18n gate", () => {
  it("owns exactly the public locales with identical non-empty key and placeholder contracts", () => {
    expect(PUBLIC_LOCALES).toEqual(EXACT_LOCALES);
    expect(NEON_SOURCE_LOCALE).toBe("zh-Hans");
    expect(new Set(NEON_CATALOG_KEYS).size).toBe(NEON_CATALOG_KEYS.length);
    expect(NEON_CATALOG_KEYS.length).toBeGreaterThan(150);

    const source = createNeonI18n(context("zh-Hans"));
    const paramsByKey = new Map(
      NEON_CATALOG_KEYS.map((key) => [key, requiredParams(source, key)] as const),
    );
    for (const locale of EXACT_LOCALES) {
      const i18n = createNeonI18n(context(locale));
      for (const key of NEON_CATALOG_KEYS) {
        const value = i18n.t(key, paramsByKey.get(key));
        expect(value.trim(), `${locale}:${key}`).not.toBe("");
        expect(value, `${locale}:${key}`).not.toMatch(/\{[A-Za-z][A-Za-z0-9]*\}/u);
      }
    }
  });

  it("fails unknown locale, key, missing value parameters, and placeholder expansion", () => {
    expect(() => createNeonI18n({ preference: "fr", resolved: "fr" } as never)).toThrow(
      /exact supported GameYard locale/u,
    );
    const i18n = createNeonI18n(context("en"));
    expect(() => i18n.t("missing.key" as NeonCatalogKey)).toThrow("Unknown Neon translation key");
    expect(() => i18n.t("upgrade.level", { from: 1 })).toThrow("requires exactly: from, to");
    expect(() => i18n.t("upgrade.level", { from: 1, to: Number.NaN })).toThrow(
      "must be text or a finite number",
    );
    expect(() => i18n.t("menu.mode", { unused: "value" })).toThrow("does not accept parameters");
  });

  it("rebuilds every number formatter for each applied locale and rejects invalid numbers", () => {
    const i18n = createNeonI18n(context("zh-Hans"));
    const cases = [
      ["score", 123_456.8],
      ["integer", 12_345.8],
      ["decimal2", 1_234.5],
      ["percent", 0.456],
      ["clock", 125.9],
    ] as const satisfies readonly (readonly [NeonNumberStyle, number])[];

    for (const locale of EXACT_LOCALES) {
      i18n.apply(context(locale));
      for (const [style, value] of cases) {
        expect(i18n.formatNumber(value, style)).toBe(expectedNumber(locale, value, style));
      }
    }
    expect(() => i18n.formatNumber(Number.NaN, "integer")).toThrow("must be finite");
    expect(() => i18n.formatNumber(-1, "score")).toThrow("must be non-negative");
    expect(() => i18n.formatNumber(-1, "clock")).toThrow("must be non-negative");
    expect(() => i18n.formatNumber(1, "currency" as NeonNumberStyle)).toThrow(
      "Unknown Neon number style",
    );
  });

  it("keeps intentionally untranslated literals in one exact frozen allowlist", () => {
    expect(Object.isFrozen(NEON_UNTRANSLATED_CONTENT)).toBe(true);
    expect(NEON_UNTRANSLATED_CONTENT).toEqual({
      "brand.title": "NEON OVERDRIVE",
      "brand.mark": "N/O",
      "brand.system": "NEON RITUAL SYSTEM",
      "brand.gameyard": "GameYard",
      "technology.canvas2d": "Canvas 2D",
      "technology.webAudio": "Web Audio",
      "weapon.overdrive": "OVERDRIVE",
      "weapon.chain": "CHAIN",
      "weapon.drop": "DROP",
      "mode.rush180": "RUSH 180",
      "boss.aella.name": "AELLA // THE FEED",
      "boss.aella.phase.infiniteScroll": "INFINITE SCROLL",
      "boss.aella.phase.redDotHunger": "RED DOT HUNGER",
      "boss.aella.phase.feedCollapse": "FEED COLLAPSE",
      "boss.mirrorSaint.name": "MIRROR SAINT",
      "boss.mirrorSaint.phase.twinReflection": "TWIN REFLECTION",
      "boss.mirrorSaint.phase.glassLattice": "GLASS LATTICE",
      "boss.mirrorSaint.phase.kaleidoscopeEnd": "KALEIDOSCOPE END",
      "boss.algorithm.name": "THE ALGORITHM",
      "boss.algorithm.phase.predictiveDesire": "PREDICTIVE DESIRE",
      "boss.algorithm.phase.perfectCorridor": "PERFECT CORRIDOR",
      "boss.algorithm.phase.goldenEngagement": "GOLDEN ENGAGEMENT",
      "boss.algorithm.phase.zeroSunFinal": "ZERO SUN // FINAL",
      "stage.synapseCity": "SYNAPSE CITY",
      "stage.glassTemple": "GLASS TEMPLE",
      "stage.zeroSun": "ZERO SUN",
    });
  });
});
