import { describe, expect, it } from "vite-plus/test";

import {
  SETTINGS_STORAGE_KEY,
  createInitialSettings,
  parseSettingsJson,
  readSettings,
  resetSettings,
  resolveLocale,
  reviseSettings,
  serializeSettings,
  toHostSettings,
  toLocaleContext,
} from "./settings";

describe("hub settings", () => {
  it("creates the named product initial settings from the motion preference", () => {
    expect(createInitialSettings(false)).toEqual({
      schemaVersion: 1,
      revision: 1,
      localePreference: "system",
      masterVolume: 0.72,
      musicVolume: 0.72,
      sfxVolume: 0.72,
      reducedMotion: false,
      screenShake: true,
    });
    expect(createInitialSettings(true)).toMatchObject({
      reducedMotion: true,
      screenShake: false,
    });
  });

  it("uses the named product initial policy only when the key is absent", () => {
    const storage = {
      getItem: (key: string) => (key === SETTINGS_STORAGE_KEY ? null : "unexpected"),
    };
    expect(readSettings(storage, true)).toEqual({
      kind: "empty",
      settings: createInitialSettings(true),
    });
  });

  it("accepts the exact current schema", () => {
    const initialSettings = createInitialSettings(false);
    expect(parseSettingsJson(serializeSettings(initialSettings))).toEqual({
      kind: "valid",
      settings: initialSettings,
    });
  });

  it("rejects malformed, old, partial, and extended settings", () => {
    const initialSettings = createInitialSettings(false);
    expect(parseSettingsJson("{")).toEqual({ kind: "error", error: "settings.invalid-json" });
    expect(parseSettingsJson('{"schemaVersion":0}')).toEqual({
      kind: "error",
      error: "settings.invalid-shape",
    });
    expect(parseSettingsJson(JSON.stringify({ ...initialSettings, schemaVersion: 0 }))).toEqual({
      kind: "error",
      error: "settings.unsupported-schema",
    });
    expect(parseSettingsJson(JSON.stringify({ ...initialSettings, extra: true }))).toEqual({
      kind: "error",
      error: "settings.invalid-shape",
    });
    const oldShape = {
      schemaVersion: initialSettings.schemaVersion,
      revision: initialSettings.revision,
      localePreference: initialSettings.localePreference,
      masterVolume: initialSettings.masterVolume,
      reducedMotion: initialSettings.reducedMotion,
      screenShake: initialSettings.screenShake,
    };
    expect(parseSettingsJson(JSON.stringify(oldShape))).toEqual({
      kind: "error",
      error: "settings.invalid-shape",
    });
  });

  it("requires all three persisted audio sources to be unit intervals", () => {
    const initialSettings = createInitialSettings(false);
    for (const field of ["masterVolume", "musicVolume", "sfxVolume"] as const) {
      expect(parseSettingsJson(JSON.stringify({ ...initialSettings, [field]: -0.01 }))).toEqual({
        kind: "error",
        error: "settings.invalid-volume",
      });
      expect(parseSettingsJson(JSON.stringify({ ...initialSettings, [field]: 1.01 }))).toEqual({
        kind: "error",
        error: "settings.invalid-volume",
      });
    }
  });

  it("resets only through an explicit write of the current initial policy", () => {
    const writes: Array<{ key: string; value: string }> = [];
    const result = resetSettings(
      {
        setItem: (key, value) => writes.push({ key, value }),
      },
      true,
    );

    expect(result).toEqual({ kind: "success", settings: createInitialSettings(true) });
    expect(writes).toEqual([
      {
        key: SETTINGS_STORAGE_KEY,
        value: serializeSettings(createInitialSettings(true)),
      },
    ]);
    expect(
      resetSettings(
        {
          setItem: () => {
            throw new Error("storage blocked");
          },
        },
        false,
      ),
    ).toEqual({ kind: "error", error: "settings.write-failed" });
  });

  it("revises user changes and resolves system locale deterministically", () => {
    expect(reviseSettings(createInitialSettings(false), { musicVolume: 0.4 })).toMatchObject({
      masterVolume: 0.72,
      musicVolume: 0.4,
      sfxVolume: 0.72,
      revision: 2,
    });
    expect(reviseSettings(createInitialSettings(false), { sfxVolume: 0.4 })).toMatchObject({
      sfxVolume: 0.4,
      masterVolume: 0.72,
      revision: 2,
    });
    expect(resolveLocale("system", ["ja-JP"])).toBe("ja");
    expect(resolveLocale("system", ["zh-TW"])).toBe("zh-Hans");
    expect(resolveLocale("system", ["de-DE"])).toBe("en");
    expect(resolveLocale("zh-Hans", ["ja-JP"])).toBe("zh-Hans");
  });

  it("accepts safe revisions and fails before a revision can stop increasing", () => {
    const initialSettings = createInitialSettings(false);
    expect(
      parseSettingsJson(
        serializeSettings({ ...initialSettings, revision: Number.MAX_SAFE_INTEGER }),
      ),
    ).toMatchObject({ kind: "valid" });
    expect(
      parseSettingsJson(
        serializeSettings({ ...initialSettings, revision: Number.MAX_SAFE_INTEGER + 1 }),
      ),
    ).toEqual({ kind: "error", error: "settings.invalid-revision" });
    expect(() =>
      reviseSettings({ ...initialSettings, revision: Number.MAX_SAFE_INTEGER }, { sfxVolume: 0.4 }),
    ).toThrow(RangeError);
  });

  it("maps Hub settings and locale to complete contract contexts", () => {
    const settings = {
      ...createInitialSettings(false),
      revision: 8,
      masterVolume: 0.9,
      musicVolume: 0.6,
      sfxVolume: 0.75,
    };
    expect(toHostSettings(settings)).toEqual({
      revision: 8,
      audio: { master: 0.9, music: 0.6, sfx: 0.75 },
      motion: { reduced: false, screenShake: true },
    });
    expect(toLocaleContext("system", ["ja-JP"])).toEqual({
      preference: "system",
      resolved: "ja",
    });
    expect(toLocaleContext("en", ["ja-JP"])).toEqual({ preference: "en", resolved: "en" });
  });
});
