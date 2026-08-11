export const PROFILE_STORAGE_KEY = "gameyard.game.neon-overdrive.profile.v1";

const PROFILE_KEYS = ["version", "best", "unlockedEndless", "settings"];
const BEST_KEYS = ["story", "rush", "endless"];
const SETTINGS_KEYS = ["fxDensity", "showHitbox", "autoGuard"];
const FX_DENSITIES = new Set([1, 0.68, 0.38]);

function exactKeys(value, expected) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const compare = (left, right) => left.localeCompare(right);
  const actual = Object.keys(value).sort(compare);
  const wanted = [...expected].sort(compare);
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function validScore(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

export function createDefaultProfile() {
  return {
    version: 1,
    best: { story: 0, rush: 0, endless: 0 },
    unlockedEndless: false,
    settings: { fxDensity: 1, showHitbox: false, autoGuard: true },
  };
}

export function parseProfile(raw) {
  let profile;
  try {
    profile = JSON.parse(raw);
  } catch (cause) {
    throw new NeonProfileError("json", cause);
  }
  const valid =
    exactKeys(profile, PROFILE_KEYS) &&
    profile.version === 1 &&
    exactKeys(profile.best, BEST_KEYS) &&
    BEST_KEYS.every((mode) => validScore(profile.best[mode])) &&
    typeof profile.unlockedEndless === "boolean" &&
    exactKeys(profile.settings, SETTINGS_KEYS) &&
    FX_DENSITIES.has(profile.settings.fxDensity) &&
    typeof profile.settings.showHitbox === "boolean" &&
    typeof profile.settings.autoGuard === "boolean";
  if (!valid) throw new NeonProfileError("schema");
  return profile;
}

export class NeonProfileError extends Error {
  constructor(code, cause) {
    super(`Neon Overdrive profile error: ${code}`, { cause });
    this.name = "NeonProfileError";
    this.code = code;
  }
}

export function createProfileStorage(storage) {
  if (
    storage === null ||
    typeof storage !== "object" ||
    typeof storage.getItem !== "function" ||
    typeof storage.setItem !== "function"
  ) {
    throw new TypeError("Neon profile storage requires the Storage interface.");
  }
  return {
    load() {
      const raw = storage.getItem(PROFILE_STORAGE_KEY);
      return raw === null ? createDefaultProfile() : parseProfile(raw);
    },
    save(profile) {
      const encoded = JSON.stringify(profile);
      parseProfile(encoded);
      storage.setItem(PROFILE_STORAGE_KEY, encoded);
    },
  };
}
