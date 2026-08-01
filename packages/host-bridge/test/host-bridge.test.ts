import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { PROTOCOL_VERSION, type HostContext } from "@gameyard/game-contract";

import {
  BridgeClosedError,
  CommandTimeoutError,
  HandshakeProtocolError,
  HandshakeTimeoutError,
  PortHostBridge,
  connectIframe,
} from "../src/index";

type MessageListener = (event: MessageEvent<unknown>) => void;

class FakePort {
  readonly messageListeners = new Set<MessageListener>();
  readonly messageErrorListeners = new Set<MessageListener>();
  peer: FakePort | undefined;
  closed = false;

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const callback = listener as MessageListener;
    if (type === "message") {
      this.messageListeners.add(callback);
    } else if (type === "messageerror") {
      this.messageErrorListeners.add(callback);
    }
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const callback = listener as MessageListener;
    if (type === "message") {
      this.messageListeners.delete(callback);
    } else if (type === "messageerror") {
      this.messageErrorListeners.delete(callback);
    }
  }

  postMessage(data: unknown): void {
    if (this.closed) {
      throw new Error("Port is closed");
    }
    const target = this.peer;
    if (target === undefined || target.closed) {
      return;
    }
    queueMicrotask(() => target.emit(data));
  }

  start(): void {}

  close(): void {
    this.closed = true;
  }

  emit(data: unknown): void {
    const event = { data } as MessageEvent<unknown>;
    for (const listener of this.messageListeners) {
      listener(event);
    }
  }
}

function createPortPair(): readonly [FakePort, FakePort] {
  const first = new FakePort();
  const second = new FakePort();
  first.peer = second;
  second.peer = first;
  return [first, second];
}

class FakeMessageChannel {
  readonly port1: MessagePort;
  readonly port2: MessagePort;

  constructor() {
    const [first, second] = createPortPair();
    this.port1 = first as unknown as MessagePort;
    this.port2 = second as unknown as MessagePort;
  }
}

class FakeWindow {
  readonly location = { origin: "https://gameyard.test" };
  readonly messageListeners = new Set<MessageListener>();

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (type === "message") {
      this.messageListeners.add(listener as MessageListener);
    }
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (type === "message") {
      this.messageListeners.delete(listener as MessageListener);
    }
  }

  dispatch(data: unknown, source: object, origin: string): void {
    const event = { data, source, origin } as unknown as MessageEvent<unknown>;
    for (const listener of this.messageListeners) {
      listener(event);
    }
  }
}

const context: HostContext = {
  protocol: PROTOCOL_VERSION,
  buildId: "build-1",
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

function hello(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "hello",
    protocol: PROTOCOL_VERSION,
    buildId: context.buildId,
    gameId: context.gameId,
    instanceId: context.instanceId,
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("connectIframe", () => {
  it("filters unrelated window messages and transfers one port", async () => {
    const hostWindow = new FakeWindow();
    const unrelatedSource = {};
    const guestWindow = {
      postMessage: vi.fn((message: unknown, origin: string, transfer: Transferable[]) => {
        expect(message).toEqual({ type: "connect", context });
        expect(origin).toBe(hostWindow.location.origin);
        expect(transfer).toHaveLength(1);
        (transfer[0] as unknown as FakePort).postMessage({ type: "ready" });
      }),
    };
    const iframe = { contentWindow: guestWindow } as unknown as HTMLIFrameElement;

    vi.stubGlobal("window", hostWindow);
    vi.stubGlobal("MessageChannel", FakeMessageChannel);

    const connection = connectIframe({
      iframe,
      context,
      targetOrigin: hostWindow.location.origin,
      handshakeTimeoutMs: 100,
      commandTimeoutMs: 100,
    });

    hostWindow.dispatch(hello(), unrelatedSource, hostWindow.location.origin);
    hostWindow.dispatch(hello(), guestWindow, "https://untrusted.test");
    expect(guestWindow.postMessage).not.toHaveBeenCalled();

    hostWindow.dispatch(hello(), guestWindow, hostWindow.location.origin);
    const bridge = await connection;

    expect(guestWindow.postMessage).toHaveBeenCalledOnce();
    expect(hostWindow.messageListeners.size).toBe(0);
    bridge.close();
  });

  it("fails a matching iframe that sends an invalid protocol hello", async () => {
    const hostWindow = new FakeWindow();
    const guestWindow = { postMessage: vi.fn() };
    const iframe = { contentWindow: guestWindow } as unknown as HTMLIFrameElement;

    vi.stubGlobal("window", hostWindow);
    vi.stubGlobal("MessageChannel", FakeMessageChannel);

    const connection = connectIframe({
      iframe,
      context,
      targetOrigin: hostWindow.location.origin,
      handshakeTimeoutMs: 100,
      commandTimeoutMs: 100,
    });
    hostWindow.dispatch(hello({ protocol: 2 }), guestWindow, hostWindow.location.origin);

    await expect(connection).rejects.toBeInstanceOf(HandshakeProtocolError);
    expect(hostWindow.messageListeners.size).toBe(0);
  });

  it("fails explicitly when the handshake times out", async () => {
    vi.useFakeTimers();
    const hostWindow = new FakeWindow();
    const guestWindow = { postMessage: vi.fn() };
    const iframe = { contentWindow: guestWindow } as unknown as HTMLIFrameElement;

    vi.stubGlobal("window", hostWindow);
    vi.stubGlobal("MessageChannel", FakeMessageChannel);

    const connection = connectIframe({
      iframe,
      context,
      targetOrigin: hostWindow.location.origin,
      handshakeTimeoutMs: 20,
      commandTimeoutMs: 100,
    });
    const rejection = expect(connection).rejects.toBeInstanceOf(HandshakeTimeoutError);

    await vi.advanceTimersByTimeAsync(21);
    await rejection;
    expect(hostWindow.messageListeners.size).toBe(0);
  });
});

describe("PortHostBridge", () => {
  it("resolves commands with explicit success and failure ACKs", async () => {
    const [hostPort, guestPort] = createPortPair();
    const bridge = new PortHostBridge(hostPort as unknown as MessagePort, 100);
    guestPort.addEventListener("message", ((event: MessageEvent<unknown>) => {
      const command = event.data as { commandId: string; type: string };
      guestPort.postMessage({
        type: "ack",
        commandId: command.commandId,
        result:
          command.type === "input.releaseAll"
            ? { ok: true }
            : {
                ok: false,
                error: { code: "invalid.state", message: "Cannot resume" },
              },
      });
    }) as unknown as EventListener);

    await expect(
      bridge.command({
        type: "input.releaseAll",
        commandId: "command-1",
      }),
    ).resolves.toMatchObject({ result: { ok: true } });
    await expect(
      bridge.command({
        type: "lifecycle.resume",
        commandId: "command-2",
      }),
    ).resolves.toMatchObject({
      result: {
        ok: false,
        error: { code: "invalid.state", message: "Cannot resume" },
      },
    });
    await expect(
      bridge.command({
        type: "locale.apply",
        commandId: "command-3",
        locale: { preference: "system", resolved: "ja" },
      }),
    ).resolves.toMatchObject({
      commandId: "command-3",
      result: {
        ok: false,
        error: { code: "invalid.state", message: "Cannot resume" },
      },
    });
    bridge.close();
  });

  it("makes a command timeout terminal and rejects every pending command", async () => {
    vi.useFakeTimers();
    const [hostPort, guestPort] = createPortPair();
    const bridge = new PortHostBridge(hostPort as unknown as MessagePort, 20);
    const timedOutCommand = bridge.command({
      type: "input.releaseAll",
      commandId: "command-timeout",
    });
    const concurrentCommand = bridge.command({
      type: "lifecycle.pause",
      commandId: "command-concurrent",
    });
    const timeoutRejection = expect(timedOutCommand).rejects.toBeInstanceOf(CommandTimeoutError);
    const concurrentRejection =
      expect(concurrentCommand).rejects.toBeInstanceOf(CommandTimeoutError);

    await vi.advanceTimersByTimeAsync(21);
    await Promise.all([timeoutRejection, concurrentRejection]);

    expect(bridge.isClosed).toBe(true);
    expect(hostPort.closed).toBe(true);
    expect(hostPort.messageListeners.size).toBe(0);
    expect(hostPort.messageErrorListeners.size).toBe(0);

    guestPort.postMessage({
      type: "ack",
      commandId: "command-timeout",
      result: { ok: true },
    });
    vi.runAllTicks();
    expect(bridge.isClosed).toBe(true);
    await expect(
      bridge.command({ type: "lifecycle.resume", commandId: "command-after-timeout" }),
    ).rejects.toBeInstanceOf(BridgeClosedError);
  });

  it("close removes listeners, closes the port, and rejects pending commands", async () => {
    const [hostPort] = createPortPair();
    const bridge = new PortHostBridge(hostPort as unknown as MessagePort, 100);
    const command = bridge.command({
      type: "input.releaseAll",
      commandId: "command-pending",
    });
    const rejection = expect(command).rejects.toBeInstanceOf(BridgeClosedError);

    bridge.close();

    await rejection;
    expect(bridge.isClosed).toBe(true);
    expect(hostPort.closed).toBe(true);
    expect(hostPort.messageListeners.size).toBe(0);
    expect(hostPort.messageErrorListeners.size).toBe(0);
  });
});
