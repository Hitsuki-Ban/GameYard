import {
  HostSettingsSchema,
  SettingsChangeSchema,
  type HostSettings,
  type SettingsChange,
} from "@gameyard/game-contract";

export const HOST_SETTINGS_REQUEST_TIMEOUT_MS = 4_500;

export type HostSettingField = "master" | "music" | "sfx" | "reduced" | "screenShake";
export type HostSettingValue = number | boolean;

export interface PendingHostSettingRequest {
  readonly field: HostSettingField;
  readonly value: HostSettingValue;
  readonly afterRevision: number;
}

export type HostSettingRequestResult =
  | {
      readonly status: "applied" | "superseded";
      readonly field: HostSettingField;
      readonly value: HostSettingValue;
      readonly revision: number;
    }
  | {
      readonly status: "timeout" | "error";
      readonly field: HostSettingField;
      readonly value: HostSettingValue;
      readonly afterRevision: number;
    };

export interface HostSettingsProjectionSnapshot {
  readonly canonical: HostSettings;
  readonly pending: PendingHostSettingRequest | null;
  readonly result: HostSettingRequestResult | null;
}

export interface HostSettingsProjection {
  snapshot(): HostSettingsProjectionSnapshot;
  request(field: HostSettingField, value: HostSettingValue): void;
  apply(settings: HostSettings): void;
  dispose(): void;
}

export interface HostSettingsProjectionOptions {
  readonly initialSettings: HostSettings;
  readonly requestChange: (change: SettingsChange) => void;
  readonly scheduleTimeout: (callback: () => void, delayMs: number) => () => void;
  readonly onChange: (snapshot: HostSettingsProjectionSnapshot) => void;
}

function freezeSettings(settings: HostSettings): HostSettings {
  Object.freeze(settings.audio);
  Object.freeze(settings.motion);
  return Object.freeze(settings);
}

function parseSettings(settings: HostSettings): HostSettings {
  return freezeSettings(HostSettingsSchema.parse(settings));
}

function createChange(field: HostSettingField, value: HostSettingValue): SettingsChange {
  switch (field) {
    case "master":
    case "music":
    case "sfx":
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
        throw new RangeError(`Host audio setting ${field} must be a finite number from 0 to 1.`);
      }
      return SettingsChangeSchema.parse({ audio: { [field]: value } });
    case "reduced":
    case "screenShake":
      if (typeof value !== "boolean") {
        throw new TypeError(`Host motion setting ${field} must be boolean.`);
      }
      return SettingsChangeSchema.parse({ motion: { [field]: value } });
    default:
      throw new RangeError(`Unknown Host setting field: ${String(field)}`);
  }
}

function readField(settings: HostSettings, field: HostSettingField): HostSettingValue {
  switch (field) {
    case "master":
    case "music":
    case "sfx":
      return settings.audio[field];
    case "reduced":
    case "screenShake":
      return settings.motion[field];
  }
}

export function createHostSettingsProjection(
  options: HostSettingsProjectionOptions,
): HostSettingsProjection {
  if (options === null || typeof options !== "object") {
    throw new TypeError("Host settings projection requires explicit options.");
  }
  if (typeof options.requestChange !== "function") {
    throw new TypeError("Host settings projection requires a requestChange function.");
  }
  if (typeof options.scheduleTimeout !== "function") {
    throw new TypeError("Host settings projection requires a scheduleTimeout function.");
  }
  if (typeof options.onChange !== "function") {
    throw new TypeError("Host settings projection requires an onChange function.");
  }

  let canonical = parseSettings(options.initialSettings);
  let pending: PendingHostSettingRequest | null = null;
  let result: HostSettingRequestResult | null = null;
  let cancelPendingTimeout: (() => void) | null = null;
  let disposed = false;

  function assertActive(): void {
    if (disposed) throw new Error("Host settings projection is disposed.");
  }

  function snapshot(): HostSettingsProjectionSnapshot {
    return Object.freeze({ canonical, pending, result });
  }

  function notify(): void {
    options.onChange(snapshot());
  }

  function cancelTimer(): void {
    cancelPendingTimeout?.();
    cancelPendingTimeout = null;
  }

  function request(field: HostSettingField, value: HostSettingValue): void {
    assertActive();
    const change = createChange(field, value);
    if (pending !== null) {
      throw new Error("A Host setting request is already pending.");
    }

    const requestRecord = Object.freeze({ field, value, afterRevision: canonical.revision });
    let cancelTimeout: () => void;
    try {
      cancelTimeout = options.scheduleTimeout(() => {
        if (pending !== requestRecord) return;
        pending = null;
        cancelPendingTimeout = null;
        result = Object.freeze({
          status: "timeout",
          field,
          value,
          afterRevision: requestRecord.afterRevision,
        });
        notify();
      }, HOST_SETTINGS_REQUEST_TIMEOUT_MS);
    } catch (error) {
      throw new Error("Host settings timeout could not be scheduled.", { cause: error });
    }
    if (typeof cancelTimeout !== "function") {
      throw new TypeError("Host settings scheduler must return a cancellation function.");
    }

    pending = requestRecord;
    result = null;
    cancelPendingTimeout = cancelTimeout;
    notify();
    try {
      options.requestChange(change);
    } catch {
      cancelTimer();
      pending = null;
      result = Object.freeze({
        status: "error",
        field,
        value,
        afterRevision: requestRecord.afterRevision,
      });
      notify();
    }
  }

  function apply(settings: HostSettings): void {
    assertActive();
    const next = parseSettings(settings);
    if (next.revision <= canonical.revision) {
      throw new RangeError("Host settings revision must strictly increase.");
    }

    canonical = next;
    if (pending !== null) {
      const settled = pending;
      cancelTimer();
      pending = null;
      result = Object.freeze({
        status: readField(next, settled.field) === settled.value ? "applied" : "superseded",
        field: settled.field,
        value: settled.value,
        revision: next.revision,
      });
    }
    notify();
  }

  return Object.freeze({
    snapshot,
    request,
    apply,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelTimer();
      pending = null;
    },
  });
}
