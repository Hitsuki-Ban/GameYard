import {
  AckEventSchema,
  BuildIdSchema,
  DiagnosticEventMessageSchema,
  DiagnosticSnapshotSchema,
  DiagnosticsSnapshotResultEventSchema,
  GameIdSchema,
  GuestEventSchema,
  HostActionRequestEventSchema,
  HostCommandSchema,
  InitMessageSchema,
  LifecycleChangeRequestEventSchema,
  LifecycleStateEventSchema,
  PROTOCOL_VERSION,
  ReadyEventSchema,
  ReadyForInitSchema,
  SettingsChangeRequestEventSchema,
  type DiagnosticEvent,
  type DiagnosticSnapshot,
  type BuildId,
  type GameId,
  type GuestEvent,
  type HostAction,
  type HostContext,
  type HostSettings,
  type LifecycleChangeAction,
  type LifecycleState,
  type LocaleContext,
  type SettingsChange,
} from "@gameyard/game-contract";

export interface GuestWindow {
  readonly location: { readonly origin: string };
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  setTimeout(callback: () => void, delayMs: number): number;
  clearTimeout(id: number): void;
  setInterval(callback: () => void, intervalMs: number): number;
  clearInterval(id: number): void;
  requestAnimationFrame(callback: FrameRequestCallback): number;
  cancelAnimationFrame(id: number): void;
}

export interface GuestParent {
  postMessage(message: unknown, targetOrigin: string, transfer?: Transferable[]): void;
}

export interface GuestIdentity {
  readonly gameId: GameId;
  readonly buildId: BuildId;
}

export interface GuestBridgeHooks {
  readonly settings: {
    readonly apply: (settings: HostSettings) => void | Promise<void>;
  };
  readonly locale: {
    readonly apply: (locale: LocaleContext) => void | Promise<void>;
  };
  readonly input: {
    readonly setEnabled: (enabled: boolean) => void | Promise<void>;
    readonly releaseAll: () => void | Promise<void>;
  };
  readonly lifecycle: {
    readonly pause: () => void | Promise<void>;
    readonly resume: () => void | Promise<void>;
    readonly dispose: () => void | Promise<void>;
  };
  readonly diagnostics: {
    readonly snapshot: () => DiagnosticSnapshot | Promise<DiagnosticSnapshot>;
  };
}

export interface ConnectGuestOptions {
  readonly window: GuestWindow;
  readonly parent: GuestParent;
  readonly targetOrigin: string;
  readonly identity: GuestIdentity;
  readonly handshakeTimeoutMs: number;
  readonly hooks: GuestBridgeHooks;
  readonly initialize: (bridge: GuestBridge) => void | Promise<void>;
}

export interface ResourceEventTarget {
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
}

export interface GuestResources {
  readonly cleanupErrors: readonly Error[];
  listen(
    target: ResourceEventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject,
  ): () => void;
  timeout(callback: () => void, delayMs: number): () => void;
  interval(callback: () => void, intervalMs: number): () => void;
  animationFrame(callback: FrameRequestCallback): () => void;
  register(cleanup: () => void): () => void;
}

export interface GuestBridge {
  readonly context: HostContext;
  readonly resources: GuestResources;
  readonly isDisposed: boolean;
  emitLifecycleState(state: LifecycleState): void;
  requestSettingsChange(change: SettingsChange): void;
  requestLifecycleChange(action: LifecycleChangeAction): void;
  requestHostAction(action: HostAction): void;
  emitDiagnostic(event: DiagnosticEvent): void;
}

export class GuestConfigurationError extends Error {
  override readonly name = "GuestConfigurationError";
}

export class GuestHandshakeProtocolError extends Error {
  override readonly name = "GuestHandshakeProtocolError";
}

export class GuestHandshakeMismatchError extends Error {
  override readonly name = "GuestHandshakeMismatchError";
}

export class GuestHandshakeTimeoutError extends Error {
  override readonly name = "GuestHandshakeTimeoutError";
}

export class GuestInitializationError extends Error {
  override readonly name = "GuestInitializationError";
}

export class GuestDisposedError extends Error {
  override readonly name = "GuestDisposedError";
}

export class GuestPortProtocolError extends Error {
  override readonly name = "GuestPortProtocolError";
}

function assertPositiveTimeout(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new GuestConfigurationError(`${name} must be a positive integer`);
  }
}

function assertTargetOrigin(targetOrigin: string, guestWindow: GuestWindow): void {
  let parsed: URL;
  try {
    parsed = new URL(targetOrigin);
  } catch {
    throw new GuestConfigurationError("targetOrigin must be an absolute origin");
  }
  if (parsed.origin !== targetOrigin) {
    throw new GuestConfigurationError("targetOrigin must contain only the canonical origin");
  }
  if (parsed.origin !== guestWindow.location.origin) {
    throw new GuestConfigurationError("targetOrigin must match the guest window origin");
  }
}

function assertHooks(hooks: GuestBridgeHooks): void {
  if (hooks === null || typeof hooks !== "object") {
    throw new GuestConfigurationError("Guest bridge hooks must be an explicit object");
  }
  const callbacks = [
    hooks.settings?.apply,
    hooks.locale?.apply,
    hooks.input?.setEnabled,
    hooks.input?.releaseAll,
    hooks.lifecycle?.pause,
    hooks.lifecycle?.resume,
    hooks.lifecycle?.dispose,
    hooks.diagnostics?.snapshot,
  ];
  if (callbacks.some((callback) => typeof callback !== "function")) {
    throw new GuestConfigurationError("All guest bridge hooks must be explicit functions");
  }
}

function assertInitializer(
  initialize: ConnectGuestOptions["initialize"],
): asserts initialize is ConnectGuestOptions["initialize"] {
  if (typeof initialize !== "function") {
    throw new GuestConfigurationError("Guest initialization must be an explicit function");
  }
}

class ResourceRegistry implements GuestResources {
  readonly #window: GuestWindow;
  readonly #cleanups = new Set<() => void>();
  readonly #cleanupErrors: Error[] = [];
  #disposed = false;

  constructor(guestWindow: GuestWindow) {
    this.#window = guestWindow;
  }

  get cleanupErrors(): readonly Error[] {
    return this.#cleanupErrors;
  }

  listen(
    target: ResourceEventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject,
  ): () => void {
    this.#assertActive();
    target.addEventListener(type, listener);
    return this.register(() => target.removeEventListener(type, listener));
  }

  timeout(callback: () => void, delayMs: number): () => void {
    this.#assertActive();
    let cleanup: () => void;
    const id = this.#window.setTimeout(() => {
      this.#cleanups.delete(cleanup);
      callback();
    }, delayMs);
    cleanup = () => this.#window.clearTimeout(id);
    this.#cleanups.add(cleanup);
    return this.#makeUnregister(cleanup);
  }

  interval(callback: () => void, intervalMs: number): () => void {
    this.#assertActive();
    const id = this.#window.setInterval(callback, intervalMs);
    return this.register(() => this.#window.clearInterval(id));
  }

  animationFrame(callback: FrameRequestCallback): () => void {
    this.#assertActive();
    let cleanup: () => void;
    const id = this.#window.requestAnimationFrame((timestamp) => {
      this.#cleanups.delete(cleanup);
      callback(timestamp);
    });
    cleanup = () => this.#window.cancelAnimationFrame(id);
    this.#cleanups.add(cleanup);
    return this.#makeUnregister(cleanup);
  }

  register(cleanup: () => void): () => void {
    this.#assertActive();
    this.#cleanups.add(cleanup);
    return this.#makeUnregister(cleanup);
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    for (const cleanup of [...this.#cleanups].reverse()) {
      try {
        cleanup();
      } catch (error) {
        this.#cleanupErrors.push(
          error instanceof Error
            ? error
            : new Error("Guest resource cleanup threw a non-Error value"),
        );
      }
    }
    this.#cleanups.clear();
  }

  #makeUnregister(cleanup: () => void): () => void {
    return () => {
      if (this.#cleanups.delete(cleanup)) {
        cleanup();
      }
    };
  }

  #assertActive(): void {
    if (this.#disposed) {
      throw new GuestDisposedError("Guest resource registry is disposed");
    }
  }
}

class PortGuestBridge implements GuestBridge {
  readonly context: HostContext;
  readonly resources: ResourceRegistry;
  readonly #port: MessagePort;
  readonly #hooks: GuestBridgeHooks;
  #settingsRevision: number;
  #active = false;
  #disposed = false;
  #queue: Promise<void> = Promise.resolve();

  readonly #handleMessage = (event: MessageEvent<unknown>): void => {
    if (this.#disposed) {
      return;
    }
    this.#queue = this.#queue.then(() => this.#processMessage(event.data));
  };

  readonly #handleMessageError = (): void => {
    this.#terminate();
  };

  constructor(
    context: HostContext,
    port: MessagePort,
    guestWindow: GuestWindow,
    hooks: GuestBridgeHooks,
  ) {
    this.context = context;
    this.#port = port;
    this.#hooks = hooks;
    this.#settingsRevision = context.settings.revision;
    this.resources = new ResourceRegistry(guestWindow);
  }

  activate(): void {
    if (this.#disposed) {
      throw new GuestDisposedError("Guest bridge is disposed");
    }
    if (this.#active) {
      throw new GuestInitializationError("Guest bridge is already active");
    }
    this.#active = true;
    this.#port.addEventListener("message", this.#handleMessage);
    this.#port.addEventListener("messageerror", this.#handleMessageError);
    this.#port.start();
  }

  abortInitialization(): void {
    this.#terminate();
  }

  get isDisposed(): boolean {
    return this.#disposed;
  }

  emitLifecycleState(state: LifecycleState): void {
    this.#postGuestEvent(LifecycleStateEventSchema.parse({ type: "lifecycle.state", state }));
  }

  requestSettingsChange(change: SettingsChange): void {
    this.#postGuestEvent(
      SettingsChangeRequestEventSchema.parse({ type: "settings.changeRequest", change }),
    );
  }

  requestLifecycleChange(action: LifecycleChangeAction): void {
    this.#postGuestEvent(
      LifecycleChangeRequestEventSchema.parse({ type: "lifecycle.changeRequest", action }),
    );
  }

  requestHostAction(action: HostAction): void {
    this.#postGuestEvent(
      HostActionRequestEventSchema.parse({ type: "hostAction.request", action }),
    );
  }

  emitDiagnostic(event: DiagnosticEvent): void {
    this.#postGuestEvent(DiagnosticEventMessageSchema.parse({ type: "diagnostic.event", event }));
  }

  async #processMessage(data: unknown): Promise<void> {
    if (this.#disposed) {
      return;
    }
    const parsed = HostCommandSchema.safeParse(data);
    if (!parsed.success) {
      this.#terminate();
      return;
    }

    const command = parsed.data;
    try {
      switch (command.type) {
        case "settings.apply":
          if (command.settings.revision <= this.#settingsRevision) {
            this.#postAck(command.commandId, {
              ok: false,
              error: {
                code: "settings.revision.stale",
                message: "Settings revision must strictly increase",
              },
            });
            return;
          }
          await this.#hooks.settings.apply(command.settings);
          this.#settingsRevision = command.settings.revision;
          break;
        case "locale.apply":
          await this.#hooks.locale.apply(command.locale);
          break;
        case "input.setEnabled":
          await this.#hooks.input.setEnabled(command.enabled);
          break;
        case "input.releaseAll":
          await this.#hooks.input.releaseAll();
          break;
        case "lifecycle.pause":
          await this.#hooks.lifecycle.pause();
          break;
        case "lifecycle.resume":
          await this.#hooks.lifecycle.resume();
          break;
        case "lifecycle.dispose":
          await this.#hooks.lifecycle.dispose();
          this.#postAck(command.commandId, { ok: true });
          this.#terminate();
          return;
        case "diagnostics.snapshot": {
          const snapshot = DiagnosticSnapshotSchema.parse(await this.#hooks.diagnostics.snapshot());
          this.#postGuestEvent(
            DiagnosticsSnapshotResultEventSchema.parse({
              type: "diagnostics.snapshotResult",
              commandId: command.commandId,
              snapshot,
            }),
          );
          break;
        }
      }
      this.#postAck(command.commandId, { ok: true });
    } catch {
      this.#postAck(command.commandId, {
        ok: false,
        error: { code: "hook.failed", message: "Guest command hook failed" },
      });
      if (command.type === "lifecycle.dispose") {
        this.#terminate();
      }
    }
  }

  #postAck(
    commandId: string,
    result:
      | { readonly ok: true }
      | {
          readonly ok: false;
          readonly error: { readonly code: string; readonly message: string };
        },
  ): void {
    this.#postGuestEvent(AckEventSchema.parse({ type: "ack", commandId, result }));
  }

  #postGuestEvent(event: GuestEvent): void {
    if (this.#disposed) {
      throw new GuestDisposedError("Guest bridge is disposed");
    }
    if (!this.#active) {
      throw new GuestInitializationError(
        "Guest bridge is not active until initialization completes",
      );
    }
    const parsed = GuestEventSchema.parse(event);
    try {
      this.#port.postMessage(parsed);
    } catch (error) {
      this.#terminate();
      throw error instanceof Error
        ? error
        : new GuestPortProtocolError("Guest event could not be posted");
    }
  }

  #terminate(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    if (this.#active) {
      this.#port.removeEventListener("message", this.#handleMessage);
      this.#port.removeEventListener("messageerror", this.#handleMessageError);
    }
    this.#active = false;
    this.#port.close();
    this.resources.dispose();
  }
}

function assertContextMatchesIdentity(context: HostContext, identity: GuestIdentity): void {
  if (context.protocol !== PROTOCOL_VERSION) {
    throw new GuestHandshakeMismatchError("Protocol version does not match");
  }
  if (context.gameId !== identity.gameId) {
    throw new GuestHandshakeMismatchError("Game id does not match");
  }
  if (context.buildId !== identity.buildId) {
    throw new GuestHandshakeMismatchError("Build id does not match");
  }
}

export function connectGuest(options: ConnectGuestOptions): Promise<GuestBridge> {
  assertPositiveTimeout(options.handshakeTimeoutMs, "handshakeTimeoutMs");
  assertTargetOrigin(options.targetOrigin, options.window);
  assertHooks(options.hooks);
  assertInitializer(options.initialize);
  const identityResult = parseIdentity(options.identity);

  return new Promise<GuestBridge>((resolve, reject) => {
    let settled = false;
    let initializingBridge: PortGuestBridge | undefined;

    const cleanup = (): void => {
      options.window.removeEventListener("message", handleInit);
      options.window.clearTimeout(timeoutId);
    };

    const fail = (error: Error, ports: readonly MessagePort[] = []): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      if (initializingBridge === undefined) {
        for (const port of ports) {
          port.close();
        }
      } else {
        initializingBridge.abortInitialization();
      }
      reject(error);
    };

    function handleInit(rawEvent: Event): void {
      const event = rawEvent as MessageEvent<unknown>;
      if (event.source !== options.parent || event.origin !== options.targetOrigin) {
        return;
      }
      const initResult = InitMessageSchema.safeParse(event.data);
      if (!initResult.success || event.ports.length !== 1) {
        fail(
          new GuestHandshakeProtocolError("Host sent an invalid gameyard:init message"),
          event.ports,
        );
        return;
      }

      try {
        assertContextMatchesIdentity(initResult.data.context, identityResult);
      } catch (error) {
        fail(
          error instanceof Error
            ? error
            : new GuestHandshakeMismatchError("Host context identity does not match"),
          event.ports,
        );
        return;
      }

      options.window.removeEventListener("message", handleInit);
      const port = event.ports[0]!;
      try {
        initializingBridge = new PortGuestBridge(
          initResult.data.context,
          port,
          options.window,
          options.hooks,
        );
      } catch (error) {
        fail(
          error instanceof Error
            ? error
            : new GuestHandshakeProtocolError("Guest port could not be activated"),
          [port],
        );
        return;
      }

      const bridge = initializingBridge;
      void Promise.resolve()
        .then(() => options.initialize(bridge))
        .then(() => {
          if (settled) {
            return;
          }
          try {
            port.postMessage(ReadyEventSchema.parse({ type: "ready" }));
            bridge.activate();
          } catch (error) {
            fail(
              error instanceof Error
                ? error
                : new GuestHandshakeProtocolError("Guest port could not be activated"),
              [port],
            );
            return;
          }
          settled = true;
          cleanup();
          resolve(bridge);
        })
        .catch((error: unknown) => {
          fail(
            new GuestInitializationError("Guest initialization failed", {
              cause: error,
            }),
            [port],
          );
        });
    }

    const timeoutId = options.window.setTimeout(() => {
      fail(
        new GuestHandshakeTimeoutError(
          `Guest handshake timed out after ${options.handshakeTimeoutMs}ms`,
        ),
      );
    }, options.handshakeTimeoutMs);

    options.window.addEventListener("message", handleInit);
    const readyForInit = ReadyForInitSchema.parse({
      type: "gameyard:ready-for-init",
      protocol: PROTOCOL_VERSION,
      gameId: identityResult.gameId,
      buildId: identityResult.buildId,
    });
    try {
      options.parent.postMessage(readyForInit, options.targetOrigin);
    } catch (error) {
      fail(
        error instanceof Error
          ? error
          : new GuestHandshakeProtocolError("ready-for-init could not be posted"),
      );
    }
  });
}

function parseIdentity(identity: GuestIdentity): GuestIdentity {
  const gameId = GameIdSchema.safeParse(identity.gameId);
  const buildId = BuildIdSchema.safeParse(identity.buildId);
  if (!gameId.success || !buildId.success) {
    throw new GuestConfigurationError("identity must satisfy the strict game and build id schemas");
  }
  return { gameId: gameId.data, buildId: buildId.data };
}
