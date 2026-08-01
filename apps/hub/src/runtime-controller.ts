import type {
  DiagnosticSnapshot,
  GuestEvent,
  HostAction,
  HostCommand,
  HostContext,
  HostSettings,
  LocaleContext,
  SettingsChange,
} from "@gameyard/game-contract";
import type { ConnectIframeOptions, HostBridge } from "@gameyard/host-bridge";

import type { PlayableRuntime } from "./runtime-catalog";

export type RuntimePhase =
  | "loading"
  | "ready"
  | "active"
  | "paused"
  | "disposing"
  | "disposed"
  | "failed";

export interface RuntimeState {
  readonly generation: number;
  readonly instanceId: string;
  readonly phase: RuntimePhase;
  readonly error: string | null;
  readonly lifecycle: string | null;
}

export type RuntimeConnect = (options: ConnectIframeOptions) => Promise<HostBridge>;

export interface RuntimeControllerOptions {
  readonly generation: number;
  readonly instanceId: string;
  readonly iframe: HTMLIFrameElement;
  readonly runtime: PlayableRuntime;
  readonly buildId: string;
  readonly locale: LocaleContext;
  readonly settings: HostSettings;
  readonly diagnosticsMode: "read-only" | "lab";
  readonly initiallyHidden: boolean;
  readonly targetOrigin: string;
  readonly handshakeTimeoutMs: number;
  readonly commandTimeoutMs: number;
  readonly connect: RuntimeConnect;
  readonly onState: (state: RuntimeState) => void;
  readonly onSettingsChangeRequest: (change: SettingsChange) => void;
  readonly onHostActionRequest: (action: HostAction) => void;
  readonly onDiagnosticEvent: (
    event: Extract<GuestEvent, { type: "diagnostic.event" }>["event"],
  ) => void;
  readonly onDiagnosticSnapshot: (snapshot: DiagnosticSnapshot) => void;
}

export class RuntimeCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeCommandError";
  }
}

interface PendingSnapshot {
  readonly resolve: (snapshot: DiagnosticSnapshot) => void;
  readonly reject: (error: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

export class RuntimeController {
  readonly #options: RuntimeControllerOptions;
  #bridge: HostBridge | null = null;
  #unsubscribe: (() => void) | null = null;
  #mountPromise: Promise<void> | null = null;
  #disposePromise: Promise<void> | null = null;
  #tail: Promise<void> = Promise.resolve();
  #commandSequence = 0;
  #settingsRevision: number;
  #localeKey: string;
  #hidden: boolean;
  #visibilityPaused = false;
  #state: RuntimeState;
  readonly #pendingSnapshots = new Map<string, PendingSnapshot>();

  constructor(options: RuntimeControllerOptions) {
    this.#options = options;
    this.#settingsRevision = options.settings.revision;
    this.#localeKey = JSON.stringify(options.locale);
    this.#hidden = options.initiallyHidden;
    this.#state = {
      generation: options.generation,
      instanceId: options.instanceId,
      phase: "loading",
      error: null,
      lifecycle: null,
    };
    options.onState(this.#state);
  }

  get state(): RuntimeState {
    return this.#state;
  }

  mount(): Promise<void> {
    if (this.#mountPromise !== null) return this.#mountPromise;
    this.#mountPromise = this.#connectAndActivate().catch((error: unknown) => {
      throw this.#fail(error);
    });
    return this.#mountPromise;
  }

  applySettings(settings: HostSettings): Promise<void> {
    if (settings.revision === this.#settingsRevision) return Promise.resolve();
    if (settings.revision < this.#settingsRevision) {
      return Promise.reject(
        this.#fail(
          new RuntimeCommandError(
            `Settings revision regressed from ${this.#settingsRevision} to ${settings.revision}`,
          ),
        ),
      );
    }
    return this.#serialize(async () => {
      await this.#requireMounted();
      await this.#command({
        type: "settings.apply",
        commandId: this.#nextCommandId(),
        settings,
      });
      this.#settingsRevision = settings.revision;
    });
  }

  applyLocale(locale: LocaleContext): Promise<void> {
    const localeKey = JSON.stringify(locale);
    if (localeKey === this.#localeKey) return Promise.resolve();
    return this.#serialize(async () => {
      await this.#requireMounted();
      await this.#command({
        type: "locale.apply",
        commandId: this.#nextCommandId(),
        locale,
      });
      this.#localeKey = localeKey;
    });
  }

  pause(): Promise<void> {
    this.#visibilityPaused = false;
    return this.#serialize(() => this.#pauseCommands());
  }

  resume(): Promise<void> {
    this.#visibilityPaused = false;
    return this.#serialize(() => this.#resumeCommands());
  }

  setInputEnabled(enabled: boolean): Promise<void> {
    return this.#serialize(async () => {
      await this.#requireMounted();
      if (!enabled) {
        await this.#command({
          type: "input.releaseAll",
          commandId: this.#nextCommandId(),
        });
      }
      await this.#command({
        type: "input.setEnabled",
        commandId: this.#nextCommandId(),
        enabled,
      });
    });
  }

  handleVisibility(hidden: boolean): Promise<void> {
    this.#hidden = hidden;
    if (hidden) {
      if (
        this.#state.phase === "loading" ||
        this.#state.phase === "ready" ||
        this.#state.phase === "failed" ||
        this.#state.phase === "disposing" ||
        this.#state.phase === "disposed" ||
        this.#visibilityPaused
      ) {
        return Promise.resolve();
      }
      if (this.#state.phase !== "active") return Promise.resolve();
      this.#visibilityPaused = true;
      return this.#serialize(() => this.#pauseCommands());
    }
    if (!this.#visibilityPaused) return Promise.resolve();
    this.#visibilityPaused = false;
    return this.#serialize(() => this.#resumeCommands());
  }

  requestDiagnostics(): Promise<DiagnosticSnapshot> {
    let result: Promise<DiagnosticSnapshot>;
    return this.#serialize(async () => {
      await this.#requireMounted();
      const commandId = this.#nextCommandId();
      result = new Promise<DiagnosticSnapshot>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.#pendingSnapshots.delete(commandId);
          reject(new RuntimeCommandError(`Diagnostic snapshot ${commandId} timed out`));
        }, this.#options.commandTimeoutMs);
        this.#pendingSnapshots.set(commandId, { resolve, reject, timer });
      });
      try {
        await this.#command({ type: "diagnostics.snapshot", commandId });
      } catch (error) {
        const pending = this.#pendingSnapshots.get(commandId);
        if (pending) {
          clearTimeout(pending.timer);
          this.#pendingSnapshots.delete(commandId);
          pending.reject(error instanceof Error ? error : new Error(String(error)));
        }
        throw error;
      }
    }).then(async () => {
      try {
        return await result!;
      } catch (error) {
        throw this.#fail(error);
      }
    });
  }

  dispose(): Promise<void> {
    if (this.#state.phase === "disposed") return Promise.resolve();
    if (this.#disposePromise !== null) return this.#disposePromise;
    this.#disposePromise = this.#serialize(async () => {
      await this.#requireConnectionForDispose();
      this.#setState("disposing");
      await this.#command({ type: "input.releaseAll", commandId: this.#nextCommandId() });
      await this.#command({
        type: "input.setEnabled",
        commandId: this.#nextCommandId(),
        enabled: false,
      });
      const bridge = this.#requireBridge();
      const ack = await bridge.dispose(this.#nextCommandId());
      this.#assertAck(ack);
      this.#unsubscribe?.();
      this.#unsubscribe = null;
      this.#setState("disposed", null, "disposed");
    });
    return this.#disposePromise;
  }

  async #connectAndActivate(): Promise<void> {
    const context: HostContext = {
      protocol: 1,
      buildId: this.#options.buildId,
      gameId: this.#options.runtime.id,
      instanceId: this.#options.instanceId,
      baseUrl: this.#options.runtime.baseUrl,
      locale: this.#options.locale,
      settings: this.#options.settings,
      diagnostics: { mode: this.#options.diagnosticsMode },
    };
    this.#bridge = await this.#options.connect({
      iframe: this.#options.iframe,
      context,
      entryUrl: this.#options.runtime.entryUrl,
      targetOrigin: this.#options.targetOrigin,
      handshakeTimeoutMs: this.#options.handshakeTimeoutMs,
      commandTimeoutMs: this.#options.commandTimeoutMs,
    });
    this.#unsubscribe = this.#bridge.subscribe((event: Readonly<GuestEvent>) =>
      this.#handleGuestEvent(event),
    );
    this.#setState("ready", null, "ready");
    if (this.#hidden) {
      this.#visibilityPaused = true;
      await this.#command({ type: "input.releaseAll", commandId: this.#nextCommandId() });
      await this.#command({
        type: "input.setEnabled",
        commandId: this.#nextCommandId(),
        enabled: false,
      });
      await this.#command({ type: "lifecycle.pause", commandId: this.#nextCommandId() });
      this.#setState("paused", null, "paused");
    } else {
      await this.#command({
        type: "input.setEnabled",
        commandId: this.#nextCommandId(),
        enabled: true,
      });
      await this.#command({ type: "lifecycle.resume", commandId: this.#nextCommandId() });
      if (this.#hidden) {
        this.#visibilityPaused = true;
        await this.#command({ type: "input.releaseAll", commandId: this.#nextCommandId() });
        await this.#command({
          type: "input.setEnabled",
          commandId: this.#nextCommandId(),
          enabled: false,
        });
        await this.#command({ type: "lifecycle.pause", commandId: this.#nextCommandId() });
        this.#setState("paused", null, "paused");
      } else {
        this.#setState("active", null, "active");
      }
    }
  }

  async #pauseCommands(force = false): Promise<void> {
    await this.#requireMounted();
    if (!force && this.#state.phase === "paused") return;
    await this.#command({ type: "input.releaseAll", commandId: this.#nextCommandId() });
    await this.#command({
      type: "input.setEnabled",
      commandId: this.#nextCommandId(),
      enabled: false,
    });
    await this.#command({ type: "lifecycle.pause", commandId: this.#nextCommandId() });
    this.#setState("paused", null, "paused");
  }

  async #resumeCommands(force = false): Promise<void> {
    await this.#requireMounted();
    if (!force && this.#state.phase === "active") return;
    await this.#command({ type: "lifecycle.resume", commandId: this.#nextCommandId() });
    await this.#command({
      type: "input.setEnabled",
      commandId: this.#nextCommandId(),
      enabled: true,
    });
    this.#setState("active", null, "active");
  }

  #serialize<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.#tail.then(operation);
    this.#tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run.catch((error: unknown) => {
      throw this.#fail(error);
    });
  }

  async #requireMounted(): Promise<void> {
    if (this.#mountPromise === null) {
      throw new RuntimeCommandError("Runtime has not started mounting");
    }
    await this.#mountPromise;
    if (this.#state.phase === "disposed") {
      throw new RuntimeCommandError("Runtime is disposed");
    }
  }

  async #requireConnectionForDispose(): Promise<void> {
    if (this.#mountPromise === null) {
      throw new RuntimeCommandError("Runtime has not started mounting");
    }
    try {
      await this.#mountPromise;
    } catch {
      if (this.#bridge === null) {
        throw new RuntimeCommandError("Runtime connection failed before disposal was possible");
      }
    }
  }

  #requireBridge(): HostBridge {
    if (this.#bridge === null) throw new RuntimeCommandError("Runtime bridge is unavailable");
    return this.#bridge;
  }

  async #command(command: HostCommand): Promise<void> {
    const ack = await this.#requireBridge().command(command);
    this.#assertAck(ack);
  }

  #assertAck(ack: Awaited<ReturnType<HostBridge["command"]>>): void {
    if (!ack.result.ok) {
      throw new RuntimeCommandError(
        `${ack.commandId} failed: ${ack.result.error.code}: ${ack.result.error.message}`,
      );
    }
  }

  #nextCommandId(): string {
    this.#commandSequence += 1;
    return `${this.#options.instanceId}.c${this.#commandSequence}`;
  }

  #handleGuestEvent(event: Readonly<GuestEvent>): void {
    switch (event.type) {
      case "lifecycle.state":
        this.#state = { ...this.#state, lifecycle: event.state };
        this.#options.onState(this.#state);
        break;
      case "settings.changeRequest":
        this.#options.onSettingsChangeRequest(event.change);
        break;
      case "lifecycle.changeRequest":
        void this.#serialize(() =>
          event.action === "pause" ? this.#pauseCommands(true) : this.#resumeCommands(true),
        ).catch(() => undefined);
        break;
      case "hostAction.request":
        this.#options.onHostActionRequest(event.action);
        break;
      case "diagnostic.event":
        this.#options.onDiagnosticEvent(event.event);
        break;
      case "diagnostics.snapshotResult": {
        const pending = this.#pendingSnapshots.get(event.commandId);
        if (!pending) break;
        clearTimeout(pending.timer);
        this.#pendingSnapshots.delete(event.commandId);
        this.#options.onDiagnosticSnapshot(event.snapshot);
        pending.resolve(event.snapshot);
        break;
      }
    }
  }

  #setState(phase: RuntimePhase, error: string | null = null, lifecycle?: string): void {
    this.#state = {
      ...this.#state,
      phase,
      error,
      lifecycle: lifecycle ?? this.#state.lifecycle,
    };
    this.#options.onState(this.#state);
  }

  #fail(error: unknown): Error {
    const failure = error instanceof Error ? error : new Error(String(error));
    if (this.#state.phase !== "failed" && this.#state.phase !== "disposed") {
      this.#setState("failed", failure.message, "failed");
    }
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.#bridge?.close();
    for (const pending of this.#pendingSnapshots.values()) {
      clearTimeout(pending.timer);
      pending.reject(failure);
    }
    this.#pendingSnapshots.clear();
    return failure;
  }
}
