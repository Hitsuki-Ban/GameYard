import {
  GuestEventSchema,
  HostCommandSchema,
  HostContextSchema,
  InitMessageSchema,
  ReadyEventSchema,
  ReadyForInitSchema,
  type AckEvent,
  type CommandId,
  type GuestEvent,
  type HostCommand,
  type HostContext,
} from "@gameyard/game-contract";

export interface ConnectIframeOptions {
  readonly iframe: HTMLIFrameElement;
  readonly context: HostContext;
  readonly entryUrl: string;
  readonly targetOrigin: string;
  readonly handshakeTimeoutMs: number;
  readonly commandTimeoutMs: number;
}

export type GuestEventListener = (event: Readonly<GuestEvent>) => void;

export interface HostBridge {
  readonly isClosed: boolean;
  command(command: HostCommand): Promise<AckEvent>;
  subscribe(listener: GuestEventListener): () => void;
  close(): void;
  dispose(commandId: CommandId): Promise<AckEvent>;
}

export class BridgeConfigurationError extends Error {
  override readonly name = "BridgeConfigurationError";
}

export class HandshakeProtocolError extends Error {
  override readonly name = "HandshakeProtocolError";
}

export class HandshakeMismatchError extends Error {
  override readonly name = "HandshakeMismatchError";
}

export class HandshakeTimeoutError extends Error {
  override readonly name = "HandshakeTimeoutError";
}

export class CommandTimeoutError extends Error {
  override readonly name = "CommandTimeoutError";
}

export class DuplicateCommandError extends Error {
  override readonly name = "DuplicateCommandError";
}

export class BridgeClosedError extends Error {
  override readonly name = "BridgeClosedError";
}

export class PortProtocolError extends Error {
  override readonly name = "PortProtocolError";
}

interface PendingCommand {
  readonly resolve: (ack: AckEvent) => void;
  readonly reject: (error: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

function assertPositiveTimeout(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new BridgeConfigurationError(`${name} must be a positive integer`);
  }
}

function assertTargetOrigin(targetOrigin: string, hostWindow: Window): void {
  let parsed: URL;
  try {
    parsed = new URL(targetOrigin);
  } catch {
    throw new BridgeConfigurationError("targetOrigin must be an absolute origin");
  }

  if (parsed.origin !== targetOrigin) {
    throw new BridgeConfigurationError("targetOrigin must contain only the canonical origin");
  }
  if (parsed.origin !== hostWindow.location.origin) {
    throw new BridgeConfigurationError("targetOrigin must match the host window origin");
  }
}

function assertEntryUrl(entryUrl: string, baseUrl: string): void {
  if (
    typeof entryUrl !== "string" ||
    !entryUrl.startsWith("./") ||
    entryUrl.endsWith("/") ||
    entryUrl.includes("\\") ||
    entryUrl.includes(":") ||
    entryUrl.includes("%") ||
    entryUrl.includes("?") ||
    entryUrl.includes("#")
  ) {
    throw new BridgeConfigurationError("entryUrl must be a prefix-safe relative file URL");
  }
  const path = entryUrl.slice(2);
  if (
    path.length === 0 ||
    path.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new BridgeConfigurationError("entryUrl must be a prefix-safe relative file URL");
  }
  if (!entryUrl.startsWith(baseUrl) || entryUrl.length === baseUrl.length) {
    throw new BridgeConfigurationError("entryUrl must be located under context.baseUrl");
  }
}

export class PortHostBridge implements HostBridge {
  readonly #port: MessagePort;
  readonly #commandTimeoutMs: number;
  readonly #listeners = new Set<GuestEventListener>();
  readonly #pending = new Map<string, PendingCommand>();
  #closed = false;

  readonly #handleMessage = (event: MessageEvent<unknown>): void => {
    const parsed = GuestEventSchema.safeParse(event.data);
    if (!parsed.success) {
      this.#terminate(new PortProtocolError("Guest sent a message outside the v1 contract"));
      return;
    }

    const guestEvent = parsed.data;
    if (guestEvent.type === "ack") {
      const pending = this.#pending.get(guestEvent.commandId);
      if (pending === undefined) {
        this.#terminate(
          new PortProtocolError(`Guest acknowledged unknown command ${guestEvent.commandId}`),
        );
        return;
      }
      clearTimeout(pending.timer);
      this.#pending.delete(guestEvent.commandId);
      pending.resolve(guestEvent);
    }

    for (const listener of this.#listeners) {
      listener(guestEvent);
    }
  };

  readonly #handleMessageError = (): void => {
    this.#terminate(new PortProtocolError("Guest message could not be decoded"));
  };

  constructor(port: MessagePort, commandTimeoutMs: number) {
    assertPositiveTimeout(commandTimeoutMs, "commandTimeoutMs");
    this.#port = port;
    this.#commandTimeoutMs = commandTimeoutMs;
    this.#port.addEventListener("message", this.#handleMessage);
    this.#port.addEventListener("messageerror", this.#handleMessageError);
    this.#port.start();
  }

  get isClosed(): boolean {
    return this.#closed;
  }

  command(command: HostCommand): Promise<AckEvent> {
    if (this.#closed) {
      return Promise.reject(new BridgeClosedError("Bridge is closed"));
    }

    const parsed = HostCommandSchema.safeParse(command);
    if (!parsed.success) {
      return Promise.reject(new PortProtocolError("Host command is outside the v1 contract"));
    }
    if (this.#pending.has(parsed.data.commandId)) {
      return Promise.reject(
        new DuplicateCommandError(`Command ${parsed.data.commandId} is already pending`),
      );
    }

    return new Promise<AckEvent>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#terminate(
          new CommandTimeoutError(
            `Command ${parsed.data.commandId} timed out after ${this.#commandTimeoutMs}ms`,
          ),
        );
      }, this.#commandTimeoutMs);

      this.#pending.set(parsed.data.commandId, { resolve, reject, timer });
      try {
        this.#port.postMessage(parsed.data);
      } catch (error) {
        this.#terminate(
          error instanceof Error ? error : new PortProtocolError("Command could not be posted"),
        );
      }
    });
  }

  subscribe(listener: GuestEventListener): () => void {
    if (this.#closed) {
      throw new BridgeClosedError("Bridge is closed");
    }
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  close(): void {
    this.#terminate(new BridgeClosedError("Bridge was closed by the host"));
  }

  async dispose(commandId: CommandId): Promise<AckEvent> {
    try {
      return await this.command({
        type: "lifecycle.dispose",
        commandId,
      });
    } finally {
      this.close();
    }
  }

  #terminate(error: Error): void {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    this.#port.removeEventListener("message", this.#handleMessage);
    this.#port.removeEventListener("messageerror", this.#handleMessageError);
    this.#port.close();
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.#pending.clear();
    this.#listeners.clear();
  }
}

function assertReadyForInitMatchesContext(
  readyForInit: ReturnType<typeof ReadyForInitSchema.parse>,
  context: HostContext,
): void {
  if (readyForInit.protocol !== context.protocol) {
    throw new HandshakeMismatchError("Protocol version does not match");
  }
  if (readyForInit.gameId !== context.gameId) {
    throw new HandshakeMismatchError("Game id does not match");
  }
  if (readyForInit.buildId !== context.buildId) {
    throw new HandshakeMismatchError("Build id does not match");
  }
}

export function connectIframe(options: ConnectIframeOptions): Promise<HostBridge> {
  assertPositiveTimeout(options.handshakeTimeoutMs, "handshakeTimeoutMs");
  assertPositiveTimeout(options.commandTimeoutMs, "commandTimeoutMs");

  const contextResult = HostContextSchema.safeParse(options.context);
  if (!contextResult.success) {
    throw new BridgeConfigurationError("context must satisfy the strict v1 HostContext schema");
  }
  const context = contextResult.data;
  assertEntryUrl(options.entryUrl, context.baseUrl);
  if (options.iframe.hasAttribute("src") || options.iframe.hasAttribute("srcdoc")) {
    throw new BridgeConfigurationError(
      "iframe must not have a src or srcdoc attribute before connection",
    );
  }

  if (typeof window === "undefined") {
    throw new BridgeConfigurationError("connectIframe requires a Window");
  }
  if (typeof MessageChannel === "undefined") {
    throw new BridgeConfigurationError("connectIframe requires the MessageChannel API");
  }
  assertTargetOrigin(options.targetOrigin, window);

  const guestWindow = options.iframe.contentWindow;
  if (guestWindow === null) {
    throw new BridgeConfigurationError("iframe.contentWindow is not available");
  }
  const targetWindow: Window = guestWindow;

  return new Promise<HostBridge>((resolve, reject) => {
    let settled = false;
    let channel: MessageChannel | undefined;
    let readyListener: ((event: MessageEvent<unknown>) => void) | undefined;
    let readyErrorListener: (() => void) | undefined;

    const cleanup = (): void => {
      window.removeEventListener("message", handleWindowMessage);
      if (channel !== undefined && readyListener !== undefined) {
        channel.port1.removeEventListener("message", readyListener);
      }
      if (channel !== undefined && readyErrorListener !== undefined) {
        channel.port1.removeEventListener("messageerror", readyErrorListener);
      }
      clearTimeout(timeout);
    };

    const fail = (error: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      channel?.port1.close();
      channel?.port2.close();
      reject(error);
    };

    const succeed = (): void => {
      if (settled || channel === undefined) {
        return;
      }
      settled = true;
      cleanup();
      resolve(new PortHostBridge(channel.port1, options.commandTimeoutMs));
    };

    function handleWindowMessage(event: MessageEvent<unknown>): void {
      if (event.source !== targetWindow || event.origin !== options.targetOrigin) {
        return;
      }

      const readyForInitResult = ReadyForInitSchema.safeParse(event.data);
      if (!readyForInitResult.success) {
        fail(new HandshakeProtocolError("Target iframe sent an invalid ready-for-init message"));
        return;
      }

      try {
        assertReadyForInitMatchesContext(readyForInitResult.data, context);
      } catch (error) {
        fail(
          error instanceof Error
            ? error
            : new HandshakeMismatchError("Handshake identity does not match"),
        );
        return;
      }

      window.removeEventListener("message", handleWindowMessage);
      try {
        channel = new MessageChannel();
      } catch (error) {
        fail(
          error instanceof Error
            ? error
            : new HandshakeProtocolError("Message channel could not be created"),
        );
        return;
      }
      readyListener = (portEvent: MessageEvent<unknown>): void => {
        const readyResult = ReadyEventSchema.safeParse(portEvent.data);
        if (!readyResult.success) {
          fail(new HandshakeProtocolError("Target iframe sent an invalid ready message"));
          return;
        }
        succeed();
      };
      readyErrorListener = (): void => {
        fail(new HandshakeProtocolError("Target iframe ready message could not be decoded"));
      };
      channel.port1.addEventListener("message", readyListener);
      channel.port1.addEventListener("messageerror", readyErrorListener);
      channel.port1.start();

      const initMessage = InitMessageSchema.parse({
        type: "gameyard:init",
        context,
      });
      try {
        targetWindow.postMessage(initMessage, options.targetOrigin, [channel.port2]);
      } catch (error) {
        fail(
          error instanceof Error
            ? error
            : new HandshakeProtocolError("Init message could not be posted"),
        );
      }
    }

    const timeout = setTimeout(() => {
      fail(new HandshakeTimeoutError(`Handshake timed out after ${options.handshakeTimeoutMs}ms`));
    }, options.handshakeTimeoutMs);

    window.addEventListener("message", handleWindowMessage);
    try {
      options.iframe.setAttribute("src", options.entryUrl);
    } catch (error) {
      fail(
        error instanceof Error
          ? error
          : new BridgeConfigurationError("iframe entry navigation failed"),
      );
    }
  });
}
