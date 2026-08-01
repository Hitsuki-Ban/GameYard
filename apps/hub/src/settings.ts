import type { HostSettings, LocaleContext } from "@gameyard/game-contract";

export const SETTINGS_STORAGE_KEY = "gameyard.settings.v1";
export const SETTINGS_SCHEMA_VERSION = 1 as const;

export type LocalePreference = "system" | "en" | "ja" | "zh-Hans";
export type SupportedLocale = Exclude<LocalePreference, "system">;

export interface HubSettings {
  readonly schemaVersion: typeof SETTINGS_SCHEMA_VERSION;
  readonly revision: number;
  readonly localePreference: LocalePreference;
  readonly masterVolume: number;
  readonly musicVolume: number;
  readonly sfxVolume: number;
  readonly reducedMotion: boolean;
  readonly screenShake: boolean;
}

export type HubSettingsPatch = Partial<
  Pick<
    HubSettings,
    | "localePreference"
    | "masterVolume"
    | "musicVolume"
    | "sfxVolume"
    | "reducedMotion"
    | "screenShake"
  >
>;

export function createInitialSettings(prefersReducedMotion: boolean): HubSettings {
  return Object.freeze({
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    revision: 1,
    localePreference: "system",
    masterVolume: 0.72,
    musicVolume: 0.72,
    sfxVolume: 0.72,
    reducedMotion: prefersReducedMotion,
    screenShake: !prefersReducedMotion,
  });
}

export type SettingsReadResult =
  | { readonly kind: "empty"; readonly settings: HubSettings }
  | { readonly kind: "valid"; readonly settings: HubSettings }
  | { readonly kind: "error"; readonly error: string };

export type SettingsResetResult =
  | { readonly kind: "success"; readonly settings: HubSettings }
  | { readonly kind: "error"; readonly error: "settings.write-failed" };

const SETTINGS_KEYS = [
  "schemaVersion",
  "revision",
  "localePreference",
  "masterVolume",
  "musicVolume",
  "sfxVolume",
  "reducedMotion",
  "screenShake",
] as const;

const LOCALE_PREFERENCES: readonly LocalePreference[] = ["system", "en", "ja", "zh-Hans"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactSettingsKeys(value: Record<string, unknown>): boolean {
  const keys = Object.keys(value).sort();
  const expected = [...SETTINGS_KEYS].sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

export function parseSettingsJson(raw: string): SettingsReadResult {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { kind: "error", error: "settings.invalid-json" };
  }

  if (!isRecord(value) || !hasExactSettingsKeys(value)) {
    return { kind: "error", error: "settings.invalid-shape" };
  }

  if (value.schemaVersion !== SETTINGS_SCHEMA_VERSION) {
    return { kind: "error", error: "settings.unsupported-schema" };
  }

  if (!Number.isSafeInteger(value.revision) || (value.revision as number) < 1) {
    return { kind: "error", error: "settings.invalid-revision" };
  }

  if (
    typeof value.localePreference !== "string" ||
    !LOCALE_PREFERENCES.includes(value.localePreference as LocalePreference)
  ) {
    return { kind: "error", error: "settings.invalid-locale" };
  }

  if (
    !isUnitInterval(value.masterVolume) ||
    !isUnitInterval(value.musicVolume) ||
    !isUnitInterval(value.sfxVolume)
  ) {
    return { kind: "error", error: "settings.invalid-volume" };
  }

  if (typeof value.reducedMotion !== "boolean" || typeof value.screenShake !== "boolean") {
    return { kind: "error", error: "settings.invalid-comfort" };
  }

  return {
    kind: "valid",
    settings: {
      schemaVersion: SETTINGS_SCHEMA_VERSION,
      revision: value.revision as number,
      localePreference: value.localePreference as LocalePreference,
      masterVolume: value.masterVolume,
      musicVolume: value.musicVolume,
      sfxVolume: value.sfxVolume,
      reducedMotion: value.reducedMotion,
      screenShake: value.screenShake,
    },
  };
}

export function readSettings(
  storage: Pick<Storage, "getItem">,
  prefersReducedMotion: boolean,
): SettingsReadResult {
  let raw: string | null;
  try {
    raw = storage.getItem(SETTINGS_STORAGE_KEY);
  } catch {
    return { kind: "error", error: "settings.storage-unavailable" };
  }
  if (raw === null) {
    return { kind: "empty", settings: createInitialSettings(prefersReducedMotion) };
  }
  return parseSettingsJson(raw);
}

export function resetSettings(
  storage: Pick<Storage, "setItem">,
  prefersReducedMotion: boolean,
): SettingsResetResult {
  const settings = createInitialSettings(prefersReducedMotion);
  try {
    storage.setItem(SETTINGS_STORAGE_KEY, serializeSettings(settings));
  } catch {
    return { kind: "error", error: "settings.write-failed" };
  }
  return { kind: "success", settings };
}

export function serializeSettings(settings: HubSettings): string {
  return JSON.stringify(settings);
}

export function reviseSettings(settings: HubSettings, patch: HubSettingsPatch): HubSettings {
  if (!Number.isSafeInteger(settings.revision) || settings.revision < 1) {
    throw new RangeError("Settings revision must be a positive safe integer");
  }
  if (settings.revision === Number.MAX_SAFE_INTEGER) {
    throw new RangeError("Settings revision cannot advance beyond Number.MAX_SAFE_INTEGER");
  }
  return {
    ...settings,
    ...patch,
    revision: settings.revision + 1,
  };
}

export function toHostSettings(settings: HubSettings): HostSettings {
  return {
    revision: settings.revision,
    audio: {
      master: settings.masterVolume,
      music: settings.musicVolume,
      sfx: settings.sfxVolume,
    },
    motion: {
      reduced: settings.reducedMotion,
      screenShake: settings.screenShake,
    },
  } satisfies HostSettings;
}

export function toLocaleContext(
  preference: LocalePreference,
  systemLanguages: readonly string[],
): LocaleContext {
  return {
    preference,
    resolved: resolveLocale(preference, systemLanguages),
  } satisfies LocaleContext;
}

export function resolveSystemLocale(languages: readonly string[]): SupportedLocale {
  for (const language of languages) {
    const normalized = language.toLowerCase();
    if (normalized === "ja" || normalized.startsWith("ja-")) return "ja";
    if (normalized === "zh" || normalized.startsWith("zh-")) return "zh-Hans";
    if (normalized === "en" || normalized.startsWith("en-")) return "en";
  }
  return "en";
}

export function resolveLocale(
  preference: LocalePreference,
  systemLanguages: readonly string[],
): SupportedLocale {
  return preference === "system" ? resolveSystemLocale(systemLanguages) : preference;
}

function isUnitInterval(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}
