export const PROFILE_STORAGE_KEY = "gameyard.game.kamifuda-runner.profile.v1";

const modeRecordKeys = ["best", "clears", "runs", "bestGrade", "bestAct", "bestTime"];
const profileKeys = ["version", "records", "settings", "unlocks", "tutorial"];

function exactKeys(value, expected) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const compare = (left, right) => left.localeCompare(right);
  const actual = Object.keys(value).sort(compare);
  const wanted = [...expected].sort(compare);
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function finiteNonnegative(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function validModeRecord(value) {
  return (
    exactKeys(value, modeRecordKeys) &&
    finiteNonnegative(value.best) &&
    Number.isSafeInteger(value.clears) &&
    value.clears >= 0 &&
    Number.isSafeInteger(value.runs) &&
    value.runs >= 0 &&
    typeof value.bestGrade === "string" &&
    value.bestGrade.length > 0 &&
    value.bestGrade.length <= 8 &&
    Number.isSafeInteger(value.bestAct) &&
    value.bestAct >= 0 &&
    finiteNonnegative(value.bestTime)
  );
}

function parseProfile(raw) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch (cause) {
    throw new KamifudaProfileError("Kamifuda profile is not valid JSON.", cause);
  }
  const valid =
    exactKeys(value, profileKeys) &&
    value.version === 1 &&
    exactKeys(value.records, ["normal", "hard", "totalSeals"]) &&
    validModeRecord(value.records.normal) &&
    validModeRecord(value.records.hard) &&
    Number.isSafeInteger(value.records.totalSeals) &&
    value.records.totalSeals >= 0 &&
    exactKeys(value.settings, ["sound", "haptic", "reducedMotion", "quality", "skin"]) &&
    typeof value.settings.sound === "boolean" &&
    typeof value.settings.haptic === "boolean" &&
    typeof value.settings.reducedMotion === "boolean" &&
    ["auto", "high", "low"].includes(value.settings.quality) &&
    typeof value.settings.skin === "string" &&
    value.settings.skin.length > 0 &&
    value.settings.skin.length <= 32 &&
    exactKeys(value.unlocks, ["skins", "hard"]) &&
    Array.isArray(value.unlocks.skins) &&
    value.unlocks.skins.length <= 32 &&
    value.unlocks.skins.every(
      (skin) => typeof skin === "string" && skin.length > 0 && skin.length <= 32,
    ) &&
    new Set(value.unlocks.skins).size === value.unlocks.skins.length &&
    typeof value.unlocks.hard === "boolean" &&
    exactKeys(value.tutorial, ["seen"]) &&
    typeof value.tutorial.seen === "boolean";
  if (!valid) throw new KamifudaProfileError("Kamifuda profile violates schema version 1.");
  return value;
}

export class KamifudaProfileError extends Error {
  constructor(message, cause) {
    super(message, { cause });
    this.name = "KamifudaProfileError";
  }
}

export function createProfileStorage(storage) {
  return {
    load(createDefault) {
      const raw = storage.getItem(PROFILE_STORAGE_KEY);
      return raw === null ? createDefault() : parseProfile(raw);
    },
    save(profile) {
      const encoded = JSON.stringify(profile);
      parseProfile(encoded);
      storage.setItem(PROFILE_STORAGE_KEY, encoded);
    },
    reset() {
      storage.removeItem(PROFILE_STORAGE_KEY);
    },
  };
}
