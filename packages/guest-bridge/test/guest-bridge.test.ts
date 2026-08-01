import { describe, expect, it, vi } from "vite-plus/test";

import { PROTOCOL_VERSION, type HostContext } from "@gameyard/game-contract";
import {
  FakeMessageChannel,
  createFakeWindowPair,
  snapshotResources,
  type FakeWindowPair,
} from "@gameyard/testkit";

import {
  GuestConfigurationError,
  GuestDisposedError,
  GuestHandshakeMismatchError,
  connectGuest,
  type GuestBridge,
  type GuestBridgeHooks,
} from "../src/index";

const context: HostContext = {
  protocol: PROTOCOL_VERSION,
  buildId: "gameyard@0123456789abcdef",
  gameId: "pulse-link-overdrive",
  instanceId: "instance-host-owned",
  baseUrl: "./games/pulse-link-overdrive/",
  locale: { preference: "system", resolved: "en" },
  settings: {
    revision: 1,
    audio: { master: 1, music: 0.5, sfx: 0.75 },
    motion: { reduced: false, screenShake: true },
  },
  diagnostics: { mode: "read-only" },
};

function createHooks(): GuestBridgeHooks {
  return {
    settings: { apply: vi.fn() },
    locale: { apply: vi.fn() },
    input: { setEnabled: vi.fn(), releaseAll: vi.fn() },
    lifecycle: { pause: vi.fn(), resume: vi.fn(), dispose: vi.fn() },
    diagnostics: {
      snapshot: vi.fn(() => ({
        lifecycle: "active" as const,
        settingsRevision: context.settings.revision,
        inputEnabled: true,
        events: [],
      })),
    },
  };
}

interface ConnectedGuest {
  readonly pair: FakeWindowPair;
  readonly channel: FakeMessageChannel;
  readonly bridge: GuestBridge;
  readonly hooks: GuestBridgeHooks;
  readonly windowMessages: unknown[];
  readonly portMessages: unknown[];
}

async function flushAsync(pair: FakeWindowPair, rounds: number): Promise<void> {
  for (let index = 0; index < rounds; index += 1) {
    pair.clock.advanceBy(0);
    await Promise.resolve();
  }
}

async function connect(hooks: GuestBridgeHooks = createHooks()): Promise<ConnectedGuest> {
  const pair = createFakeWindowPair("https://gameyard.test");
  const channel = new FakeMessageChannel(pair.clock);
  const windowMessages: unknown[] = [];
  const portMessages: unknown[] = [];
  channel.port1.addEventListener("message", ((event: MessageEvent<unknown>) => {
    portMessages.push(event.data);
  }) as EventListener);
  pair.host.addEventListener("message", ((event: MessageEvent<unknown>) => {
    windowMessages.push(event.data);
    pair.guestProxy.postMessage({ type: "gameyard:init", context }, pair.guest.location.origin, [
      channel.port2 as unknown as MessagePort,
    ]);
  }) as EventListener);

  const connection = connectGuest({
    window: pair.guest,
    parent: pair.hostProxy,
    targetOrigin: pair.guest.location.origin,
    identity: { gameId: context.gameId, buildId: context.buildId },
    handshakeTimeoutMs: 100,
    hooks,
  });
  pair.clock.advanceBy(0);
  const bridge = await connection;
  pair.clock.advanceBy(0);
  return { pair, channel, bridge, hooks, windowMessages, portMessages };
}

describe("connectGuest", () => {
  it("fails fast when a required hook is missing", () => {
    const pair = createFakeWindowPair("https://gameyard.test");
    const hooks = createHooks();
    expect(() =>
      connectGuest({
        window: pair.guest,
        parent: pair.hostProxy,
        targetOrigin: pair.guest.location.origin,
        identity: { gameId: context.gameId, buildId: context.buildId },
        handshakeTimeoutMs: 100,
        hooks: { ...hooks, diagnostics: {} } as unknown as GuestBridgeHooks,
      }),
    ).toThrow(GuestConfigurationError);
  });

  it("announces exact identity, accepts one init, and sends port ready", async () => {
    const connected = await connect();

    expect(connected.windowMessages).toEqual([
      {
        type: "gameyard:ready-for-init",
        protocol: PROTOCOL_VERSION,
        gameId: context.gameId,
        buildId: context.buildId,
      },
    ]);
    expect(connected.windowMessages[0]).not.toHaveProperty("instanceId");
    expect(connected.portMessages).toEqual([{ type: "ready" }]);
    expect(connected.bridge.context.instanceId).toBe("instance-host-owned");
    expect(connected.pair.guest.listenerCount).toBe(0);
  });

  it("rejects an init context that does not match guest identity", async () => {
    const pair = createFakeWindowPair("https://gameyard.test");
    const channel = new FakeMessageChannel(pair.clock);
    pair.host.addEventListener("message", (() => {
      pair.guestProxy.postMessage(
        {
          type: "gameyard:init",
          context: { ...context, buildId: "gameyard@fedcba9876543210" },
        },
        pair.guest.location.origin,
        [channel.port2 as unknown as MessagePort],
      );
    }) as EventListener);
    const connection = connectGuest({
      window: pair.guest,
      parent: pair.hostProxy,
      targetOrigin: pair.guest.location.origin,
      identity: { gameId: context.gameId, buildId: context.buildId },
      handshakeTimeoutMs: 100,
      hooks: createHooks(),
    });

    pair.clock.advanceBy(0);
    await expect(connection).rejects.toBeInstanceOf(GuestHandshakeMismatchError);
    expect(channel.port2.closed).toBe(true);
    expect(pair.guest.listenerCount).toBe(0);
  });
});

describe("GuestBridge commands", () => {
  it("dispatches every hook and ACKs every command", async () => {
    const connected = await connect();
    const nextSettings = { ...context.settings, revision: 2 };
    const commands = [
      { type: "settings.apply", commandId: "settings-1", settings: nextSettings },
      { type: "locale.apply", commandId: "locale-1", locale: context.locale },
      { type: "input.setEnabled", commandId: "input-1", enabled: false },
      { type: "input.releaseAll", commandId: "input-2" },
      { type: "lifecycle.pause", commandId: "lifecycle-1" },
      { type: "lifecycle.resume", commandId: "lifecycle-2" },
      { type: "diagnostics.snapshot", commandId: "diagnostics-1" },
    ];
    for (const command of commands) {
      connected.channel.port1.postMessage(command);
    }
    await flushAsync(connected.pair, 40);

    expect(connected.hooks.settings.apply).toHaveBeenCalledWith(nextSettings);
    expect(connected.hooks.locale.apply).toHaveBeenCalledWith(context.locale);
    expect(connected.hooks.input.setEnabled).toHaveBeenCalledWith(false);
    expect(connected.hooks.input.releaseAll).toHaveBeenCalledOnce();
    expect(connected.hooks.lifecycle.pause).toHaveBeenCalledOnce();
    expect(connected.hooks.lifecycle.resume).toHaveBeenCalledOnce();
    expect(connected.hooks.diagnostics.snapshot).toHaveBeenCalledOnce();
    expect(
      connected.portMessages.filter((message) => (message as { type?: string }).type === "ack"),
    ).toHaveLength(commands.length);
    expect(connected.portMessages).toContainEqual({
      type: "diagnostics.snapshotResult",
      commandId: "diagnostics-1",
      snapshot: {
        lifecycle: "active",
        settingsRevision: 1,
        inputEnabled: true,
        events: [],
      },
    });
  });

  it("rejects stale settings revisions without invoking the hook", async () => {
    const connected = await connect();
    connected.channel.port1.postMessage({
      type: "settings.apply",
      commandId: "settings-same",
      settings: context.settings,
    });
    connected.channel.port1.postMessage({
      type: "settings.apply",
      commandId: "settings-older",
      settings: { ...context.settings, revision: 0 },
    });
    await flushAsync(connected.pair, 8);

    expect(connected.hooks.settings.apply).not.toHaveBeenCalled();
    for (const commandId of ["settings-same", "settings-older"]) {
      expect(connected.portMessages).toContainEqual({
        type: "ack",
        commandId,
        result: {
          ok: false,
          error: {
            code: "settings.revision.stale",
            message: "Settings revision must strictly increase",
          },
        },
      });
    }
    expect(connected.bridge.isDisposed).toBe(false);
  });

  it("returns a failure ACK when a hook throws without recovering through another path", async () => {
    const hooks = createHooks();
    const connected = await connect({
      ...hooks,
      input: {
        ...hooks.input,
        setEnabled: vi.fn(() => {
          throw new Error("failed");
        }),
      },
    });
    connected.channel.port1.postMessage({
      type: "input.setEnabled",
      commandId: "input-failed",
      enabled: true,
    });
    await flushAsync(connected.pair, 4);

    expect(connected.portMessages).toContainEqual({
      type: "ack",
      commandId: "input-failed",
      result: {
        ok: false,
        error: { code: "hook.failed", message: "Guest command hook failed" },
      },
    });
    expect(connected.bridge.isDisposed).toBe(false);
  });

  it("terminates on an unknown or non-strict command and clears registered resources", async () => {
    const connected = await connect();
    const customCleanup = vi.fn();
    connected.bridge.resources.listen(
      connected.pair.guest,
      "game-input",
      (() => {}) as EventListener,
    );
    connected.bridge.resources.timeout(vi.fn(), 100);
    connected.bridge.resources.interval(vi.fn(), 20);
    connected.bridge.resources.animationFrame(vi.fn());
    connected.bridge.resources.register(customCleanup);

    connected.channel.port1.postMessage({
      type: "input.releaseAll",
      commandId: "invalid-command",
      extra: true,
    });
    await flushAsync(connected.pair, 3);

    expect(connected.bridge.isDisposed).toBe(true);
    expect(connected.channel.port2.closed).toBe(true);
    expect(customCleanup).toHaveBeenCalledOnce();
    expect(
      snapshotResources(connected.pair.guest, connected.pair.clock, [connected.channel.port2]),
    ).toEqual({
      listeners: 0,
      scheduledTasks: 0,
      openPorts: 0,
    });
    expect(() => connected.bridge.resources.timeout(vi.fn(), 1)).toThrow(GuestDisposedError);
  });

  it("makes dispose terminal after ACK and removes all bridge resources", async () => {
    const connected = await connect();
    const cleanup = vi.fn();
    const cleanupAfterError = vi.fn();
    connected.bridge.resources.listen(
      connected.pair.guest,
      "game-input",
      (() => {}) as EventListener,
    );
    connected.bridge.resources.interval(vi.fn(), 20);
    connected.bridge.resources.register(cleanup);
    connected.bridge.resources.register(cleanupAfterError);
    connected.bridge.resources.register(() => {
      throw new Error("cleanup failed");
    });

    connected.channel.port1.postMessage({
      type: "lifecycle.dispose",
      commandId: "dispose-1",
    });
    await flushAsync(connected.pair, 5);

    expect(connected.hooks.lifecycle.dispose).toHaveBeenCalledOnce();
    expect(connected.portMessages).toContainEqual({
      type: "ack",
      commandId: "dispose-1",
      result: { ok: true },
    });
    expect(connected.bridge.isDisposed).toBe(true);
    expect(connected.channel.port2.closed).toBe(true);
    expect(cleanup).toHaveBeenCalledOnce();
    expect(cleanupAfterError).toHaveBeenCalledOnce();
    expect(connected.bridge.resources.cleanupErrors).toHaveLength(1);
    expect(connected.bridge.resources.cleanupErrors[0]?.message).toBe("cleanup failed");
    expect(
      snapshotResources(connected.pair.guest, connected.pair.clock, [connected.channel.port2]),
    ).toEqual({
      listeners: 0,
      scheduledTasks: 0,
      openPorts: 0,
    });
    expect(() => connected.bridge.emitLifecycleState("active")).toThrow(GuestDisposedError);
  });
});
