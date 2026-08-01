import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { PROTOCOL_VERSION, type HostContext } from "@gameyard/game-contract";
import {
  DeterministicClock,
  createFakeMessageChannelConstructor,
  createFakeMessagePortPair,
  createFakeWindowPair,
  type FakeMessagePort,
} from "@gameyard/testkit";

import {
  BridgeConfigurationError,
  BridgeClosedError,
  CommandTimeoutError,
  HandshakeMismatchError,
  HandshakeProtocolError,
  HandshakeTimeoutError,
  PortHostBridge,
  PortProtocolError,
  connectIframe,
} from "../src/index";

const entryUrl = "./games/pulse-link-overdrive/index.html";

const context: HostContext = {
  protocol: PROTOCOL_VERSION,
  buildId: "gameyard@0123456789abcdef",
  gameId: "pulse-link-overdrive",
  instanceId: "instance-1",
  baseUrl: "./games/pulse-link-overdrive/",
  locale: { preference: "system", resolved: "en" },
  settings: {
    revision: 1,
    audio: { master: 1, music: 0.5, sfx: 0.75 },
    motion: { reduced: false, screenShake: true },
  },
  diagnostics: { mode: "read-only" },
};

class FakeIframe {
  readonly contentWindow: object;
  readonly #onNavigate: ((entry: string) => void) | undefined;
  #src: string | undefined;
  readonly #hasSrcdoc: boolean;
  setAttributeCalls = 0;

  constructor(
    contentWindow: object,
    onNavigate: ((entry: string) => void) | undefined,
    initialSrc: string | undefined,
    hasSrcdoc = false,
  ) {
    this.contentWindow = contentWindow;
    this.#onNavigate = onNavigate;
    this.#src = initialSrc;
    this.#hasSrcdoc = hasSrcdoc;
  }

  hasAttribute(name: string): boolean {
    return (name === "src" && this.#src !== undefined) || (name === "srcdoc" && this.#hasSrcdoc);
  }

  setAttribute(name: string, value: string): void {
    if (name !== "src") {
      throw new Error(`Unexpected iframe attribute: ${name}`);
    }
    this.setAttributeCalls += 1;
    this.#src = value;
    this.#onNavigate?.(value);
  }

  get srcAttribute(): string | undefined {
    return this.#src;
  }
}

function iframeOptions(pair: ReturnType<typeof createFakeWindowPair>, iframe: FakeIframe) {
  return {
    iframe: iframe as unknown as HTMLIFrameElement,
    context,
    entryUrl,
    targetOrigin: pair.host.location.origin,
    handshakeTimeoutMs: 100,
    commandTimeoutMs: 100,
  };
}

function readyForInit(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "gameyard:ready-for-init",
    protocol: PROTOCOL_VERSION,
    buildId: context.buildId,
    gameId: context.gameId,
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("connectIframe", () => {
  it("registers the handshake listener before navigation emits ready-for-init synchronously", async () => {
    const pair = createFakeWindowPair("https://gameyard.test");
    const initMessages: MessageEvent<unknown>[] = [];
    pair.guest.addEventListener("message", ((event: MessageEvent<unknown>) => {
      initMessages.push(event);
      (event.ports[0] as unknown as FakeMessagePort).postMessage({ type: "ready" });
    }) as EventListener);
    vi.stubGlobal("window", pair.host);
    vi.stubGlobal("MessageChannel", createFakeMessageChannelConstructor(pair.clock));
    const iframe = new FakeIframe(
      pair.guestProxy,
      (navigation) => {
        expect(navigation).toBe(entryUrl);
        expect(pair.host.listenerCount).toBe(1);
        pair.host.receiveMessage(readyForInit(), pair.hostProxy, pair.host.location.origin, []);
        pair.host.receiveMessage(readyForInit(), pair.guestProxy, "https://untrusted.test", []);
        expect(initMessages).toEqual([]);
        pair.host.receiveMessage(readyForInit(), pair.guestProxy, pair.host.location.origin, []);
      },
      undefined,
    );
    const connection = connectIframe(iframeOptions(pair, iframe));
    pair.clock.advanceBy(0);
    const bridge = await connection;

    expect(initMessages).toHaveLength(1);
    expect(initMessages[0]?.data).toEqual({ type: "gameyard:init", context });
    expect(initMessages[0]?.ports).toHaveLength(1);
    expect(pair.host.listenerCount).toBe(0);
    expect(iframe.srcAttribute).toBe(entryUrl);
    bridge.close();
  });

  it("rejects protocol, game, and build mismatches from the target iframe", async () => {
    const mismatches = [
      { overrides: { protocol: 2 }, error: HandshakeProtocolError },
      { overrides: { gameId: "another-game" }, error: HandshakeMismatchError },
      {
        overrides: { buildId: "gameyard@fedcba9876543210" },
        error: HandshakeMismatchError,
      },
    ];

    for (const mismatch of mismatches) {
      const pair = createFakeWindowPair("https://gameyard.test");
      vi.stubGlobal("window", pair.host);
      vi.stubGlobal("MessageChannel", createFakeMessageChannelConstructor(pair.clock));
      const iframe = new FakeIframe(pair.guestProxy, undefined, undefined);
      const connection = connectIframe(iframeOptions(pair, iframe));

      pair.hostProxy.postMessage(readyForInit(mismatch.overrides), pair.host.location.origin);
      pair.clock.advanceBy(0);
      await expect(connection).rejects.toBeInstanceOf(mismatch.error);
      vi.unstubAllGlobals();
    }
  });

  it("rejects a non-strict ready event on the transferred port", async () => {
    const pair = createFakeWindowPair("https://gameyard.test");
    pair.guest.addEventListener("message", ((event: MessageEvent<unknown>) => {
      (event.ports[0] as unknown as FakeMessagePort).postMessage({ type: "ready", extra: true });
    }) as EventListener);
    vi.stubGlobal("window", pair.host);
    vi.stubGlobal("MessageChannel", createFakeMessageChannelConstructor(pair.clock));
    const iframe = new FakeIframe(pair.guestProxy, undefined, undefined);
    const connection = connectIframe(iframeOptions(pair, iframe));

    pair.hostProxy.postMessage(readyForInit(), pair.host.location.origin);
    pair.clock.advanceBy(0);
    await expect(connection).rejects.toBeInstanceOf(HandshakeProtocolError);
    expect(pair.host.listenerCount).toBe(0);
  });

  it("fails immediately when the handshake port emits messageerror", async () => {
    const pair = createFakeWindowPair("https://gameyard.test");
    pair.guest.addEventListener("message", ((event: MessageEvent<unknown>) => {
      (event.ports[0] as unknown as FakeMessagePort).postMessageError("undecodable");
    }) as EventListener);
    vi.stubGlobal("window", pair.host);
    vi.stubGlobal("MessageChannel", createFakeMessageChannelConstructor(pair.clock));
    const iframe = new FakeIframe(pair.guestProxy, undefined, undefined);
    const connection = connectIframe(iframeOptions(pair, iframe));

    pair.hostProxy.postMessage(readyForInit(), pair.host.location.origin);
    pair.clock.advanceBy(0);
    await expect(connection).rejects.toBeInstanceOf(HandshakeProtocolError);
    expect(pair.host.listenerCount).toBe(0);
  });

  it("rejects preloaded iframes and unsafe or out-of-base entry URLs before navigation", () => {
    const pair = createFakeWindowPair("https://gameyard.test");
    const preloaded = new FakeIframe(pair.guestProxy, undefined, entryUrl);
    expect(() => connectIframe(iframeOptions(pair, preloaded))).toThrow(BridgeConfigurationError);
    expect(preloaded.setAttributeCalls).toBe(0);
    const srcdoc = new FakeIframe(pair.guestProxy, undefined, undefined, true);
    expect(() => connectIframe(iframeOptions(pair, srcdoc))).toThrow(BridgeConfigurationError);
    expect(srcdoc.setAttributeCalls).toBe(0);

    const invalidEntries = [
      "https://gameyard.test/games/pulse-link-overdrive/index.html",
      "/games/pulse-link-overdrive/index.html",
      "./games/pulse-link-overdrive/index.html?debug=1",
      "./games/pulse-link-overdrive/index.html#main",
      ".\\games\\pulse-link-overdrive\\index.html",
      "./games/pulse-link-overdrive/../other/index.html",
      "./games/pulse-link-overdrive//index.html",
      "./games/another-game/index.html",
    ];
    for (const invalidEntry of invalidEntries) {
      const iframe = new FakeIframe(pair.guestProxy, undefined, undefined);
      expect(() =>
        connectIframe({ ...iframeOptions(pair, iframe), entryUrl: invalidEntry }),
      ).toThrow(BridgeConfigurationError);
      expect(iframe.setAttributeCalls).toBe(0);
    }
  });

  it("fails explicitly when the handshake times out", async () => {
    vi.useFakeTimers();
    const pair = createFakeWindowPair("https://gameyard.test");
    vi.stubGlobal("window", pair.host);
    vi.stubGlobal("MessageChannel", createFakeMessageChannelConstructor(pair.clock));
    const iframe = new FakeIframe(pair.guestProxy, undefined, undefined);
    const connection = connectIframe({
      ...iframeOptions(pair, iframe),
      handshakeTimeoutMs: 20,
    });
    const rejection = expect(connection).rejects.toBeInstanceOf(HandshakeTimeoutError);

    await vi.advanceTimersByTimeAsync(21);
    await rejection;
    expect(pair.host.listenerCount).toBe(0);
  });
});

describe("PortHostBridge", () => {
  it("resolves commands with explicit ACKs", async () => {
    const clock = new DeterministicClock();
    const [hostPort, guestPort] = createFakeMessagePortPair(clock);
    const bridge = new PortHostBridge(hostPort as unknown as MessagePort, 100);
    guestPort.addEventListener("message", ((event: MessageEvent<unknown>) => {
      const command = event.data as { commandId: string };
      guestPort.postMessage({
        type: "ack",
        commandId: command.commandId,
        result: { ok: true },
      });
    }) as EventListener);

    const command = bridge.command({ type: "input.releaseAll", commandId: "command-1" });
    clock.advanceBy(0);
    await expect(command).resolves.toMatchObject({ result: { ok: true } });
    bridge.close();
  });

  it("makes an unknown ACK terminal", async () => {
    const clock = new DeterministicClock();
    const [hostPort, guestPort] = createFakeMessagePortPair(clock);
    const bridge = new PortHostBridge(hostPort as unknown as MessagePort, 100);
    const command = bridge.command({ type: "lifecycle.pause", commandId: "expected-command" });
    const rejection = expect(command).rejects.toBeInstanceOf(PortProtocolError);

    guestPort.postMessage({
      type: "ack",
      commandId: "unknown-command",
      result: { ok: true },
    });
    clock.advanceBy(0);

    await rejection;
    expect(bridge.isClosed).toBe(true);
    expect(hostPort.closed).toBe(true);
  });

  it("makes a command timeout terminal and rejects every pending command", async () => {
    vi.useFakeTimers();
    const clock = new DeterministicClock();
    const [hostPort] = createFakeMessagePortPair(clock);
    const bridge = new PortHostBridge(hostPort as unknown as MessagePort, 20);
    const timedOut = bridge.command({ type: "input.releaseAll", commandId: "command-timeout" });
    const concurrent = bridge.command({ type: "lifecycle.pause", commandId: "command-concurrent" });
    const timedOutRejection = expect(timedOut).rejects.toBeInstanceOf(CommandTimeoutError);
    const concurrentRejection = expect(concurrent).rejects.toBeInstanceOf(CommandTimeoutError);

    await vi.advanceTimersByTimeAsync(21);
    await Promise.all([timedOutRejection, concurrentRejection]);
    expect(bridge.isClosed).toBe(true);
    expect(hostPort.closed).toBe(true);
  });

  it("makes a postMessage throw terminal and rejects every pending command", async () => {
    const clock = new DeterministicClock();
    const [hostPort] = createFakeMessagePortPair(clock);
    const bridge = new PortHostBridge(hostPort as unknown as MessagePort, 100);
    const pending = bridge.command({ type: "input.releaseAll", commandId: "pending-command" });
    const pendingRejection = expect(pending).rejects.toThrow("Fake message port is closed");

    hostPort.close();
    const failedPost = bridge.command({
      type: "lifecycle.pause",
      commandId: "failed-post-command",
    });
    const failedPostRejection = expect(failedPost).rejects.toThrow("Fake message port is closed");

    await Promise.all([pendingRejection, failedPostRejection]);
    expect(bridge.isClosed).toBe(true);
    expect(hostPort.listenerCount).toBe(0);
    await expect(
      bridge.command({ type: "lifecycle.resume", commandId: "after-failed-post" }),
    ).rejects.toBeInstanceOf(BridgeClosedError);
  });

  it("dispose ACK is terminal and clears port resources", async () => {
    const clock = new DeterministicClock();
    const [hostPort, guestPort] = createFakeMessagePortPair(clock);
    const bridge = new PortHostBridge(hostPort as unknown as MessagePort, 100);
    guestPort.addEventListener("message", ((event: MessageEvent<unknown>) => {
      const command = event.data as { commandId: string };
      guestPort.postMessage({ type: "ack", commandId: command.commandId, result: { ok: true } });
    }) as EventListener);

    const disposal = bridge.dispose("dispose-1");
    clock.advanceBy(0);
    await expect(disposal).resolves.toMatchObject({ result: { ok: true } });
    expect(bridge.isClosed).toBe(true);
    expect(hostPort.closed).toBe(true);
    expect(hostPort.listenerCount).toBe(0);
    await expect(
      bridge.command({ type: "lifecycle.resume", commandId: "after-dispose" }),
    ).rejects.toBeInstanceOf(BridgeClosedError);
  });
});
