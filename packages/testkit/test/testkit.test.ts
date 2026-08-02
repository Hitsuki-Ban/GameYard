import { describe, expect, it } from "vite-plus/test";

import {
  DeterministicClock,
  LAB_PRESET_MAX_BYTES,
  LabPresetError,
  LabSceneRegistry,
  createFakeMessagePortPair,
  createFakeWindowPair,
  snapshotResources,
} from "../src/index";

const identity = {
  gameId: "pulse-link-overdrive",
  gameVersion: "1.1.0",
  buildId: "gameyard@0123456789abcdef",
} as const;

function createRegistry(): LabSceneRegistry {
  return new LabSceneRegistry([
    {
      ...identity,
      sceneId: "ready",
      sceneVersion: 1,
      parameters: {
        lifecycle: { type: "enum", values: ["active", "paused"] },
        reducedMotion: { type: "boolean" },
        accentOffset: { type: "number", integer: true, minimum: -24, maximum: 24 },
      },
    },
  ]);
}

describe("LabSceneRegistry", () => {
  it("round-trips a strict, exact-version preset", () => {
    const registry = createRegistry();
    const preset = registry.createPreset("ready", 0x5eed, {
      lifecycle: "active",
      reducedMotion: true,
      accentOffset: -4,
    });

    expect(registry.list()).toHaveLength(1);
    expect(registry.parseJson(registry.serialize(preset))).toEqual(preset);
  });

  it("rejects extra fields, missing parameters, and every identity mismatch", () => {
    const registry = createRegistry();
    const preset = registry.createPreset("ready", 7, {
      lifecycle: "paused",
      reducedMotion: false,
      accentOffset: 0,
    });

    expect(() => registry.parsePreset({ ...preset, legacyVersion: 1 })).toThrow(
      "Lab preset must contain exactly",
    );
    expect(() =>
      registry.parsePreset({
        ...preset,
        parameters: { lifecycle: "paused", reducedMotion: false },
      }),
    ).toThrow("Lab preset parameters must contain exactly");
    for (const mutation of [
      { gameId: "tumbledrum" },
      { gameVersion: "1.1.1" },
      { buildId: "gameyard@fedcba9876543210" },
      { sceneVersion: 2 },
    ]) {
      expect(() => registry.parsePreset({ ...preset, ...mutation })).toThrow(
        "does not exactly match",
      );
    }
  });

  it("enforces the byte limit before parsing JSON", () => {
    const oversized = `{"padding":"${"x".repeat(LAB_PRESET_MAX_BYTES)}"}`;
    expect(() => createRegistry().parseJson(oversized)).toThrow(LabPresetError);
    expect(() => createRegistry().parseJson(oversized)).toThrow("exceeds 16384 bytes");
  });
});

describe("DeterministicClock", () => {
  it("runs timers, intervals, and animation frames in stable order", () => {
    const clock = new DeterministicClock();
    const calls: string[] = [];
    const interval = clock.setInterval(() => calls.push(`interval:${clock.now}`), 5);
    clock.setTimeout(() => calls.push(`timeout:${clock.now}`), 10);
    clock.requestAnimationFrame((now) => calls.push(`raf:${now}`));

    clock.advanceBy(16);
    clock.clearInterval(interval);

    expect(calls).toEqual(["interval:5", "interval:10", "timeout:10", "interval:15", "raf:16"]);
    expect(clock.pendingCount).toBe(0);
  });
});

describe("transport fakes", () => {
  it("delivers port messages through the explicit clock and reports resources", () => {
    const pair = createFakeWindowPair("https://gameyard.test");
    const [hostPort, guestPort] = createFakeMessagePortPair(pair.clock);
    const messages: unknown[] = [];
    guestPort.addEventListener("message", ((event: MessageEvent<unknown>) => {
      messages.push(event.data);
    }) as EventListener);

    hostPort.postMessage({ type: "test" });
    expect(messages).toEqual([]);
    pair.clock.advanceBy(0);
    expect(messages).toEqual([{ type: "test" }]);
    expect(snapshotResources(pair.guest, pair.clock, [hostPort, guestPort])).toEqual({
      listeners: 1,
      scheduledTasks: 0,
      openPorts: 2,
    });
  });

  it("preserves source, origin, and transferred ports for window messages", () => {
    const pair = createFakeWindowPair("https://gameyard.test");
    const [, guestPort] = createFakeMessagePortPair(pair.clock);
    const received: MessageEvent<unknown>[] = [];
    pair.guest.addEventListener("message", ((event: MessageEvent<unknown>) => {
      received.push(event);
    }) as EventListener);

    pair.guestProxy.postMessage({ type: "init" }, pair.guest.location.origin, [
      guestPort as unknown as MessagePort,
    ]);
    pair.clock.advanceBy(0);

    expect(received).toHaveLength(1);
    expect(received[0]?.source).toBe(pair.hostProxy);
    expect(received[0]?.origin).toBe(pair.host.location.origin);
    expect(received[0]?.ports).toEqual([guestPort]);
  });
});
