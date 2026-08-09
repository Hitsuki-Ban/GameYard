import { connectIframe } from "@gameyard/host-bridge";
import type {
  DiagnosticSnapshot as GuestDiagnosticSnapshot,
  HostAction,
  HostSettings,
  LocaleContext,
  SettingsChange,
} from "@gameyard/game-contract";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useTranslation } from "react-i18next";

import type { GameCatalogEntry } from "./catalog";
import type { DiagnosticEvent, RuntimeDiagnosticState } from "./diagnostics";
import { loadGameRuntime, type PlayableRuntime } from "./runtime-catalog";
import { RuntimeController, type RuntimeState } from "./runtime-controller";
import {
  toHostSettings,
  toLocaleContext,
  type HubSettings,
  type HubSettingsPatch,
} from "./settings";

const HANDSHAKE_TIMEOUT_MS = 8_000;
const COMMAND_TIMEOUT_MS = 4_000;

export interface GameRuntimeHandle {
  dispose(): Promise<void>;
  reload(): Promise<void>;
  requestDiagnostics(): Promise<GuestDiagnosticSnapshot | null>;
  pauseForOverlay(): Promise<boolean>;
  restoreAfterOverlay(resume: boolean): Promise<void>;
  applyHostState(
    settings: HostSettings,
    locale: LocaleContext,
    lifecycle: "active" | "paused",
  ): Promise<void>;
}

interface LoadedRuntime {
  readonly generation: number;
  readonly runtime: PlayableRuntime;
}

interface GameRuntimeProps {
  readonly game: GameCatalogEntry;
  readonly settings: HubSettings;
  readonly systemLanguages: readonly string[];
  readonly onClose: () => Promise<void>;
  readonly onOpenTools: () => void;
  readonly onSettingsChange: (patch: HubSettingsPatch) => void;
  readonly onDiagnosticSnapshot: (snapshot: RuntimeDiagnosticState | null) => void;
  readonly onEvent: (type: string, detail: DiagnosticEvent["detail"]) => void;
}

function settingsPatch(change: SettingsChange): HubSettingsPatch {
  return {
    ...(change.audio?.master !== undefined ? { masterVolume: change.audio.master } : {}),
    ...(change.audio?.music !== undefined ? { musicVolume: change.audio.music } : {}),
    ...(change.audio?.sfx !== undefined ? { sfxVolume: change.audio.sfx } : {}),
    ...(change.motion?.reduced !== undefined ? { reducedMotion: change.motion.reduced } : {}),
    ...(change.motion?.screenShake !== undefined ? { screenShake: change.motion.screenShake } : {}),
  };
}

function createInstanceId(gameId: GameCatalogEntry["id"], generation: number): string {
  if (typeof crypto.randomUUID !== "function") {
    throw new Error("crypto.randomUUID is required for runtime instance ids");
  }
  return `${gameId}.g${generation}.${crypto.randomUUID()}`;
}

export const GameRuntime = forwardRef<GameRuntimeHandle, GameRuntimeProps>(function GameRuntime(
  {
    game,
    settings,
    systemLanguages,
    onClose,
    onOpenTools,
    onSettingsChange,
    onDiagnosticSnapshot,
    onEvent,
  },
  ref,
) {
  const { t } = useTranslation();
  const [generation, setGeneration] = useState(1);
  const generationRef = useRef(generation);
  const [loadedRuntime, setLoadedRuntime] = useState<LoadedRuntime | null>(null);
  const runtime = loadedRuntime?.generation === generation ? loadedRuntime.runtime : null;
  const [state, setState] = useState<RuntimeState>({
    generation,
    instanceId: "pending",
    phase: "loading",
    error: null,
    lifecycle: null,
  });
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const frameWrapRef = useRef<HTMLElement>(null);
  const controllerRef = useRef<RuntimeController | null>(null);
  const pendingSettingsRef = useRef<HostSettings | null>(null);
  const settingsApplyInFlightRef = useRef(false);
  const settingsRef = useRef(settings);
  const systemLanguagesRef = useRef(systemLanguages);
  const onSettingsChangeRef = useRef(onSettingsChange);
  const onDiagnosticSnapshotRef = useRef(onDiagnosticSnapshot);
  const onEventRef = useRef(onEvent);
  settingsRef.current = settings;
  systemLanguagesRef.current = systemLanguages;
  onSettingsChangeRef.current = onSettingsChange;
  onDiagnosticSnapshotRef.current = onDiagnosticSnapshot;
  onEventRef.current = onEvent;

  const flushPendingSettings = useCallback(async () => {
    if (settingsApplyInFlightRef.current) return;
    settingsApplyInFlightRef.current = true;
    try {
      while (pendingSettingsRef.current !== null) {
        const next = pendingSettingsRef.current;
        pendingSettingsRef.current = null;
        const controller = controllerRef.current;
        if (!controller) return;
        await controller.applySettings(next);
      }
    } catch {
      // RuntimeController owns the visible failure state and diagnostic event.
    } finally {
      settingsApplyInFlightRef.current = false;
      if (pendingSettingsRef.current !== null && controllerRef.current !== null) {
        void flushPendingSettings();
      }
    }
  }, []);

  const updateState = useCallback((next: RuntimeState) => {
    if (next.generation !== generationRef.current) return;
    setState(next);
    if (next.phase === "failed") {
      setLoadedRuntime(null);
      onDiagnosticSnapshotRef.current(null);
    }
  }, []);

  const recordFailure = useCallback(
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      setState((current) => ({ ...current, phase: "failed", error: message }));
      onEvent("runtime.failure", { generation: generationRef.current, message });
    },
    [onEvent],
  );

  const performFullscreenAction = useCallback(
    async (action: HostAction) => {
      try {
        if (action === "fullscreen.enter") {
          const target = frameWrapRef.current;
          if (!target) throw new Error("Runtime fullscreen wrapper is unavailable");
          await target.requestFullscreen();
        } else if (document.fullscreenElement !== null) {
          await document.exitFullscreen();
        }
        onEvent("runtime.fullscreen", { action, generation: generationRef.current });
      } catch (error) {
        onEvent("runtime.fullscreen-failed", {
          action,
          generation: generationRef.current,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [onEvent],
  );

  useEffect(() => {
    generationRef.current = generation;
    controllerRef.current = null;
    pendingSettingsRef.current = null;
    onDiagnosticSnapshot(null);
    setLoadedRuntime(null);
    setState({
      generation,
      instanceId: "pending",
      phase: "loading",
      error: null,
      lifecycle: null,
    });
    let cancelled = false;
    void loadGameRuntime(window.fetch.bind(window), __GAMEYARD_BUILD__, game.id)
      .then((loaded) => {
        if (!cancelled && generation === generationRef.current) {
          setLoadedRuntime({ generation, runtime: loaded });
          onDiagnosticSnapshot({
            gameId: loaded.manifest.id,
            gameVersion: loaded.manifest.version,
            buildId: loaded.manifest.buildId,
            snapshot: null,
          });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled && generation === generationRef.current) recordFailure(error);
      });
    return () => {
      cancelled = true;
    };
  }, [game.id, generation, onDiagnosticSnapshot, recordFailure]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!runtime || !iframe) return;
    let instanceId: string;
    try {
      instanceId = createInstanceId(game.id, generation);
    } catch (error) {
      recordFailure(error);
      return;
    }
    const controller = new RuntimeController({
      generation,
      instanceId,
      iframe,
      runtime,
      buildId: __GAMEYARD_BUILD__,
      locale: toLocaleContext(settingsRef.current.localePreference, systemLanguagesRef.current),
      settings: toHostSettings(settingsRef.current),
      diagnosticsMode: import.meta.env.DEV ? "lab" : "read-only",
      initiallyHidden: document.hidden,
      targetOrigin: window.location.origin,
      handshakeTimeoutMs: HANDSHAKE_TIMEOUT_MS,
      commandTimeoutMs: COMMAND_TIMEOUT_MS,
      connect: connectIframe,
      onState: updateState,
      onSettingsChangeRequest: (change) => {
        if (generation === generationRef.current) {
          onSettingsChangeRef.current(settingsPatch(change));
        }
      },
      onHostActionRequest: (action) => {
        if (generation === generationRef.current) void performFullscreenAction(action);
      },
      onDiagnosticEvent: (event) => {
        if (generation !== generationRef.current) return;
        onEventRef.current("guest.diagnostic", {
          level: event.level,
          code: event.code,
          message: event.message,
          timestampMs: event.timestampMs,
        });
      },
      onDiagnosticSnapshot: (snapshot) => {
        if (generation === generationRef.current) {
          onDiagnosticSnapshotRef.current({
            gameId: runtime.manifest.id,
            gameVersion: runtime.manifest.version,
            buildId: runtime.manifest.buildId,
            snapshot,
          });
        }
      },
    });
    controllerRef.current = controller;
    onEventRef.current("runtime.mount", { generation, instanceId });
    void controller
      .mount()
      .then(() => {
        if (generation !== generationRef.current) return;
        if (!document.hidden && controller.state.phase === "active") iframe.contentWindow?.focus();
        onEventRef.current("runtime.active", { generation, instanceId });
      })
      .catch(() => undefined);
  }, [game.id, generation, performFullscreenAction, recordFailure, runtime, updateState]);

  useEffect(() => {
    if (!controllerRef.current) return;
    pendingSettingsRef.current = toHostSettings(settings);
    void flushPendingSettings();
  }, [flushPendingSettings, settings]);

  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    void controller
      .applyLocale(toLocaleContext(settings.localePreference, systemLanguages))
      .catch(() => undefined);
  }, [settings.localePreference, systemLanguages]);

  useEffect(() => {
    const handleVisibility = () => {
      void controllerRef.current?.handleVisibility(document.hidden).catch(() => undefined);
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  useEffect(
    () => () => {
      generationRef.current = -1;
      const controller = controllerRef.current;
      controllerRef.current = null;
      void controller?.dispose().catch(() => undefined);
    },
    [],
  );

  const dispose = useCallback(async () => {
    const controller = controllerRef.current;
    if (!controller) {
      setLoadedRuntime(null);
      return;
    }
    try {
      await controller.dispose();
      onEvent("runtime.disposed", { generation: generationRef.current });
    } catch (error) {
      onEvent("runtime.dispose-failed", {
        generation: generationRef.current,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      controllerRef.current = null;
      setLoadedRuntime(null);
      onDiagnosticSnapshotRef.current(null);
    }
  }, [onEvent]);

  const reload = useCallback(async () => {
    await dispose();
    setGeneration((current) => current + 1);
  }, [dispose]);

  useImperativeHandle(
    ref,
    () => ({
      dispose,
      reload,
      pauseForOverlay: async () => {
        const controller = controllerRef.current;
        if (!controller) return false;
        if (controller.state.phase === "active") {
          await controller.pause();
          return true;
        }
        if (controller.state.phase === "paused") await controller.setInputEnabled(false);
        return false;
      },
      restoreAfterOverlay: async (resume) => {
        const controller = controllerRef.current;
        if (resume && controller?.state.phase === "paused") await controller.resume();
      },
      requestDiagnostics: async () => {
        await flushPendingSettings();
        const controller = controllerRef.current;
        if (!controller || controller.state.phase === "disposed") return null;
        return controller.requestDiagnostics();
      },
      applyHostState: async (settings, locale, lifecycle) => {
        const controller = controllerRef.current;
        if (!controller) throw new Error("Runtime controller is unavailable");
        await controller.applySettings(settings);
        await controller.applyLocale(locale);
        if (lifecycle === "paused") await controller.pause();
        else await controller.resume();
      },
    }),
    [dispose, flushPendingSettings, reload],
  );

  const run = (operation: () => Promise<unknown>) => {
    void operation().catch(() => undefined);
  };
  const canControl = state.phase === "active" || state.phase === "paused";
  const stageStyle = {
    "--game-accent": game.accent,
    ...(game.stage.kind === "fixed-aspect"
      ? {
          "--game-stage-ratio": game.stage.width / game.stage.height,
          "--game-stage-inverse-ratio": game.stage.height / game.stage.width,
        }
      : {}),
  } as CSSProperties;

  return (
    <section
      ref={frameWrapRef}
      className="stage stage--runtime"
      style={stageStyle}
      data-stage-strategy={game.stage.kind}
      aria-labelledby="selected-game-title"
    >
      <div className="runtime-toolbar">
        <button
          className="runtime-toolbar__back"
          type="button"
          disabled={state.phase === "disposing"}
          onClick={() => run(onClose)}
        >
          <span aria-hidden="true">←</span> {t("runtime.back")}
        </button>
        <div className="runtime-toolbar__identity">
          <strong id="selected-game-title">{game.title}</strong>
          <span className={`runtime-state runtime-state--${state.phase}`}>
            {t(`runtime.state.${state.phase}`)}
          </span>
        </div>
        <div className="runtime-toolbar__actions">
          {state.phase === "active" ? (
            <button
              type="button"
              disabled={!canControl}
              onClick={() => run(() => controllerRef.current!.pause())}
            >
              {t("runtime.pause")}
            </button>
          ) : (
            <button
              type="button"
              disabled={state.phase !== "paused"}
              onClick={() => run(() => controllerRef.current!.resume())}
            >
              {t("runtime.resume")}
            </button>
          )}
          <button
            type="button"
            disabled={!canControl}
            onClick={() => void performFullscreenAction("fullscreen.enter")}
          >
            {t("runtime.fullscreen")}
          </button>
          <button type="button" onClick={onOpenTools}>
            {t("runtime.more")}
          </button>
        </div>
      </div>
      <div
        className="runtime-frame"
        onPointerDown={() => {
          const controller = controllerRef.current;
          if (!controller || state.phase !== "active") return;
          void controller
            .setInputEnabled(true)
            .then(() => iframeRef.current?.contentWindow?.focus())
            .catch(() => undefined);
        }}
      >
        {runtime ? (
          <iframe key={generation} ref={iframeRef} title={game.title} allow="fullscreen" />
        ) : null}
        {state.phase === "loading" ? (
          <div className="runtime-overlay" role="status">
            {t("runtime.loading")}
          </div>
        ) : null}
        {state.phase === "failed" ? (
          <div className="runtime-overlay runtime-overlay--failed" role="alert">
            <strong>{t("runtime.failed")}</strong>
            <p>{t("runtime.failureDetail")}</p>
            <button type="button" onClick={() => run(reload)}>
              {t("runtime.retry")}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
});
