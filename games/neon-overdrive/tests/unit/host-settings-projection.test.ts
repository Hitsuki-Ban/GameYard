import { describe, expect, it, vi } from "vite-plus/test";
import type { SettingsChange } from "@gameyard/game-contract";

import {
  HOST_SETTINGS_REQUEST_TIMEOUT_MS,
  createHostSettingsProjection,
} from "../../guest/src/host-settings-projection.js";

const INITIAL = Object.freeze({
  revision: 7,
  audio: Object.freeze({ master: 0.8, music: 0.6, sfx: 0.4 }),
  motion: Object.freeze({ reduced: false, screenShake: true }),
});

function createHarness(requestChange: (change: SettingsChange) => void = vi.fn()) {
  let timeoutCallback: (() => void) | null = null;
  const cancelTimeout = vi.fn();
  const scheduleTimeout = vi.fn((callback: () => void) => {
    timeoutCallback = callback;
    return cancelTimeout;
  });
  const changes = vi.fn();
  const projection = createHostSettingsProjection({
    initialSettings: INITIAL,
    requestChange,
    scheduleTimeout,
    onChange: changes,
  });
  return {
    projection,
    requestChange,
    scheduleTimeout,
    cancelTimeout,
    changes,
    fireTimeout: () => {
      if (timeoutCallback === null) throw new Error("No timeout is scheduled.");
      timeoutCallback();
    },
  };
}

describe("Host settings projection", () => {
  it("requires a strict, complete initial Host settings value", () => {
    expect(() =>
      createHostSettingsProjection({
        // @ts-expect-error The runtime boundary must reject incomplete values too.
        initialSettings: { revision: 0, audio: { master: 1 } },
        requestChange() {},
        scheduleTimeout: () => () => {},
        onChange() {},
      }),
    ).toThrow();
  });

  it("sends one strict field patch without changing canonical state", () => {
    const harness = createHarness();

    harness.projection.request("music", 0.25);

    expect(harness.requestChange).toHaveBeenCalledWith({ audio: { music: 0.25 } });
    expect(harness.scheduleTimeout).toHaveBeenCalledWith(
      expect.any(Function),
      HOST_SETTINGS_REQUEST_TIMEOUT_MS,
    );
    expect(harness.projection.snapshot()).toEqual({
      canonical: INITIAL,
      pending: { field: "music", value: 0.25, afterRevision: 7 },
      result: null,
    });
    expect(() => harness.projection.request("master", 0.5)).toThrow(
      "A Host setting request is already pending.",
    );
  });

  it("settles the first newer matching apply as applied", () => {
    const harness = createHarness();
    harness.projection.request("screenShake", false);

    harness.projection.apply({
      revision: 9,
      audio: { master: 0.1, music: 0.2, sfx: 0.3 },
      motion: { reduced: true, screenShake: false },
    });

    expect(harness.cancelTimeout).toHaveBeenCalledOnce();
    expect(harness.projection.snapshot()).toMatchObject({
      canonical: { revision: 9 },
      pending: null,
      result: { status: "applied", field: "screenShake", value: false, revision: 9 },
    });
  });

  it("settles a newer nonmatching apply as superseded and rejects stale revisions", () => {
    const harness = createHarness();
    harness.projection.request("reduced", true);

    harness.projection.apply({ ...INITIAL, revision: 8 });

    expect(harness.projection.snapshot().result).toEqual({
      status: "superseded",
      field: "reduced",
      value: true,
      revision: 8,
    });
    expect(() => harness.projection.apply({ ...INITIAL, revision: 8 })).toThrow(
      "Host settings revision must strictly increase.",
    );
  });

  it("publishes timeout and synchronous send errors as structured results", () => {
    const timeoutHarness = createHarness();
    timeoutHarness.projection.request("sfx", 0);
    timeoutHarness.fireTimeout();
    expect(timeoutHarness.projection.snapshot()).toMatchObject({
      pending: null,
      result: { status: "timeout", field: "sfx", value: 0, afterRevision: 7 },
    });

    const errorHarness = createHarness(() => {
      throw new Error("port closed");
    });
    expect(() => errorHarness.projection.request("master", 0)).not.toThrow();
    expect(errorHarness.cancelTimeout).toHaveBeenCalledOnce();
    expect(errorHarness.projection.snapshot()).toMatchObject({
      pending: null,
      result: { status: "error", field: "master", value: 0, afterRevision: 7 },
    });
  });

  it("projects external updates immediately and clears an owned timer on dispose", () => {
    const harness = createHarness();
    harness.projection.apply({ ...INITIAL, revision: 8 });
    expect(harness.changes).toHaveBeenLastCalledWith(
      expect.objectContaining({ canonical: expect.objectContaining({ revision: 8 }) }),
    );

    harness.projection.request("master", 0.5);
    harness.projection.dispose();
    expect(harness.cancelTimeout).toHaveBeenCalledOnce();
    expect(() => harness.projection.request("master", 0.4)).toThrow(
      "Host settings projection is disposed.",
    );
  });
});
