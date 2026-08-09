import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";

import { BrowseCatalog } from "./BrowseCatalog";
import { GAME_CATALOG, type GameCatalogEntry, type GameId } from "./catalog";
import {
  describeRoute,
  appendDiagnosticEvent,
  issueSummaryText,
  makeDiagnosticEnvelope,
  serializeDiagnosticEnvelope,
  type DiagnosticEvent,
  type DiagnosticEnvelope,
  type RuntimeDiagnosticState,
} from "./diagnostics";
import { i18n } from "./i18n";
import { GameCover } from "./GameCover";
import { GameRuntime, type GameRuntimeHandle } from "./GameRuntime";
import { HubDrawer } from "./HubDrawer";
import type { HubLabStartupState } from "./lab";
import { PwaPanel } from "./PwaPanel";
import { gameSearch, parseHubRoute, type HubRoute } from "./route";
import {
  SETTINGS_STORAGE_KEY,
  readSettings,
  resetSettings,
  resolveLocale,
  resolveSystemLocale,
  reviseSettings,
  serializeSettings,
  toHostSettings,
  toLocaleContext,
  type HubSettings,
  type HubSettingsPatch,
  type LocalePreference,
  type SettingsReadResult,
  type SupportedLocale,
} from "./settings";

const REDUCED_MOTION_MEDIA_QUERY = "(prefers-reduced-motion: reduce)";
const INDEX_GAME_HISTORY_KIND = "gameyard.index-game";
type HubOverlay = "settings" | "diagnostics" | "pwa" | "lab";

function isIndexGameHistoryState(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 1 && record.kind === INDEX_GAME_HISTORY_KIND;
}

const LAB_COPY = {
  en: {
    open: "Open Lab",
    heading: "Session Lab",
    close: "Close Lab",
    loading: "Loading Tweakpane…",
  },
  ja: {
    open: "Labを開く",
    heading: "セッション Lab",
    close: "Labを閉じる",
    loading: "Tweakpaneを読み込み中…",
  },
  "zh-Hans": {
    open: "打开 Lab",
    heading: "会话 Lab",
    close: "关闭 Lab",
    loading: "正在加载 Tweakpane…",
  },
} as const satisfies Record<
  SupportedLocale,
  {
    readonly open: string;
    readonly heading: string;
    readonly close: string;
    readonly loading: string;
  }
>;

function currentSystemLanguages(): readonly string[] {
  return navigator.languages.length > 0 ? [...navigator.languages] : [navigator.language];
}

function currentReducedMotionPreference(): boolean {
  return window.matchMedia(REDUCED_MOTION_MEDIA_QUERY).matches;
}

type GameStageStyle = CSSProperties & {
  readonly "--game-accent": string;
  readonly "--game-stage-ratio"?: number;
  readonly "--game-stage-inverse-ratio"?: number;
};

function gameStageStyle(game: GameCatalogEntry): GameStageStyle {
  return {
    "--game-accent": game.accent,
    ...(game.stage.kind === "fixed-aspect"
      ? {
          "--game-stage-ratio": game.stage.width / game.stage.height,
          "--game-stage-inverse-ratio": game.stage.height / game.stage.width,
        }
      : {}),
  };
}

interface SettingsPanelProps {
  readonly settings: HubSettings | null;
  readonly error: string | null;
  readonly locked: boolean;
  readonly onChange: (patch: HubSettingsPatch) => void;
}

function SettingsPanel({ settings, error, locked, onChange }: SettingsPanelProps) {
  const { t } = useTranslation();
  const disabled = settings === null || locked;

  return (
    <section className="settings-panel" aria-label={t("settings.heading")}>
      <label className="setting setting--locale">
        <span>{t("settings.language")}</span>
        <select
          value={settings?.localePreference ?? ""}
          disabled={disabled}
          onChange={(event) =>
            onChange({ localePreference: event.target.value as LocalePreference })
          }
        >
          <option value="system">{t("settings.system")}</option>
          <option value="en">English</option>
          <option value="ja">日本語</option>
          <option value="zh-Hans">简体中文</option>
        </select>
      </label>
      <fieldset className="setting setting--audio">
        <legend>{t("settings.audio")}</legend>
        <label className="audio-control">
          <span>
            {t("settings.masterVolume")}{" "}
            <b>{settings ? Math.round(settings.masterVolume * 100) : "—"}</b>
          </span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={settings?.masterVolume ?? 0}
            disabled={disabled}
            onChange={(event) => onChange({ masterVolume: Number(event.target.value) })}
          />
        </label>
        <label className="audio-control">
          <span>
            {t("settings.musicVolume")}{" "}
            <b>{settings ? Math.round(settings.musicVolume * 100) : "—"}</b>
          </span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={settings?.musicVolume ?? 0}
            disabled={disabled}
            onChange={(event) => onChange({ musicVolume: Number(event.target.value) })}
          />
        </label>
        <label className="audio-control">
          <span>
            {t("settings.sfxVolume")} <b>{settings ? Math.round(settings.sfxVolume * 100) : "—"}</b>
          </span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={settings?.sfxVolume ?? 0}
            disabled={disabled}
            onChange={(event) => onChange({ sfxVolume: Number(event.target.value) })}
          />
        </label>
      </fieldset>
      <label className="setting setting--switch">
        <span>{t("settings.reducedMotion")}</span>
        <input
          type="checkbox"
          checked={settings?.reducedMotion ?? false}
          disabled={disabled}
          onChange={(event) => onChange({ reducedMotion: event.target.checked })}
        />
        <span className="switch-track" aria-hidden="true" />
      </label>
      <label className="setting setting--switch">
        <span>{t("settings.screenShake")}</span>
        <input
          type="checkbox"
          checked={settings?.screenShake ?? false}
          disabled={disabled}
          onChange={(event) => onChange({ screenShake: event.target.checked })}
        />
        <span className="switch-track" aria-hidden="true" />
      </label>
      {error ? (
        <div className="settings-error" role="alert">
          <strong>{t("settings.errorTitle")}</strong>
          <span>{t(error)}</span>
        </div>
      ) : null}
    </section>
  );
}

interface StageProps {
  readonly route: Exclude<HubRoute, { readonly kind: "index" }>;
  readonly settings: HubSettings | null;
  readonly systemLanguages: readonly string[];
  readonly runtimeRef: React.RefObject<GameRuntimeHandle | null>;
  readonly onCloseRuntime: () => Promise<void>;
  readonly onOpenTools: () => void;
  readonly onSettingsChange: (patch: HubSettingsPatch) => void;
  readonly onGuestDiagnosticSnapshot: (snapshot: RuntimeDiagnosticState | null) => void;
  readonly onEvent: (type: string, detail: DiagnosticEvent["detail"]) => void;
}

function Stage({
  route,
  settings,
  systemLanguages,
  runtimeRef,
  onCloseRuntime,
  onOpenTools,
  onSettingsChange,
  onGuestDiagnosticSnapshot,
  onEvent,
}: StageProps) {
  const { t } = useTranslation();

  if (route.kind === "error") {
    return (
      <section className="stage stage--error" aria-labelledby="route-error-title">
        <div className="route-error__code">400 / {route.code.toUpperCase()}</div>
        <h2 id="route-error-title">{t("route.errorTitle")}</h2>
        <p>{t(`route.${route.code}`)}</p>
        <code>{t("route.received", { value: route.received.join(", ") || "(empty)" })}</code>
      </section>
    );
  }

  const game = route.game;
  if (settings !== null) {
    return (
      <GameRuntime
        key={game.id}
        ref={runtimeRef}
        game={game}
        settings={settings}
        systemLanguages={systemLanguages}
        onClose={onCloseRuntime}
        onOpenTools={onOpenTools}
        onSettingsChange={onSettingsChange}
        onDiagnosticSnapshot={onGuestDiagnosticSnapshot}
        onEvent={onEvent}
      />
    );
  }
  return (
    <section
      className="stage stage--game stage--settings-error"
      style={gameStageStyle(game)}
      data-stage-strategy={game.stage.kind}
      aria-labelledby="settings-stage-error-title"
      role="alert"
    >
      <div className="runtime-toolbar">
        <button
          className="runtime-toolbar__back"
          type="button"
          onClick={() => void onCloseRuntime()}
        >
          <span aria-hidden="true">←</span> {t("runtime.back")}
        </button>
        <div className="runtime-toolbar__identity">
          <strong id="settings-stage-error-title">{game.title}</strong>
          <span className="runtime-state runtime-state--failed">{t("runtime.state.failed")}</span>
        </div>
        <div className="runtime-toolbar__actions">
          <button type="button" onClick={onOpenTools}>
            {t("runtime.more")}
          </button>
        </div>
      </div>
      <div className="stage--settings-error__content">
        <div className="stage__poster-wrap">
          <GameCover
            className="poster"
            game={game}
            loading="eager"
            fetchPriority="auto"
            sizes="(max-width: 520px) 100vw, 42vw"
          />
        </div>
        <div className="stage__body">
          <span className="micro-label">SETTINGS / CONTRACT / STOP</span>
          <p className="stage__description">{t("stage.settingsRequired")}</p>
        </div>
      </div>
    </section>
  );
}

interface DiagnosticsPanelProps {
  readonly open: boolean;
  readonly snapshot: DiagnosticEnvelope;
}

function DiagnosticsPanel({ open, snapshot }: DiagnosticsPanelProps) {
  const { t } = useTranslation();
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!open) setFeedback(null);
  }, [open]);

  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(issueSummaryText(snapshot));
      setFeedback("diagnostics.copied");
    } catch {
      setFeedback("diagnostics.copyError");
    }
  };

  const exportJson = () => {
    try {
      const blob = new Blob([serializeDiagnosticEnvelope(snapshot)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `gameyard-diagnostics-${new Date().toISOString().replaceAll(":", "-")}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setFeedback("diagnostics.exported");
    } catch {
      setFeedback("diagnostics.exportError");
    }
  };

  if (!open) return null;

  return (
    <div className="diagnostics-panel">
      <div className="diagnostics__content">
        <dl className="diagnostics__facts">
          <div>
            <dt>{t("diagnostics.build")}</dt>
            <dd>{snapshot.buildId}</dd>
          </div>
          <div>
            <dt>{t("diagnostics.route")}</dt>
            <dd>{snapshot.hub.route}</dd>
          </div>
          <div>
            <dt>{t("diagnostics.selected")}</dt>
            <dd>{snapshot.game?.id ?? t("diagnostics.none")}</dd>
          </div>
          <div>
            <dt>{t("diagnostics.locale")}</dt>
            <dd>{snapshot.hub.locale}</dd>
          </div>
          <div>
            <dt>{t("diagnostics.revision")}</dt>
            <dd>{snapshot.hub.settingsRevision ?? t("diagnostics.invalid")}</dd>
          </div>
          <div>
            <dt>{t("diagnostics.guestLifecycle")}</dt>
            <dd>{snapshot.game?.lifecycle ?? t("diagnostics.none")}</dd>
          </div>
          <div>
            <dt>{t("diagnostics.guestInput")}</dt>
            <dd>
              {snapshot.game?.inputEnabled === null || snapshot.game === null
                ? t("diagnostics.none")
                : String(snapshot.game.inputEnabled)}
            </dd>
          </div>
          <div>
            <dt>{t("diagnostics.guestRevision")}</dt>
            <dd>{snapshot.game?.settingsRevision ?? t("diagnostics.none")}</dd>
          </div>
          <div>
            <dt>{t("diagnostics.guestEvents")}</dt>
            <dd>{snapshot.game?.events.length ?? 0}</dd>
          </div>
          <div>
            <dt>Schema</dt>
            <dd>{snapshot.schemaVersion}</dd>
          </div>
          <div>
            <dt>Hub health</dt>
            <dd>{snapshot.hub.health}</dd>
          </div>
          <div>
            <dt>Game version</dt>
            <dd>{snapshot.game?.version ?? t("diagnostics.none")}</dd>
          </div>
          <div>
            <dt>Game build</dt>
            <dd>{snapshot.game?.buildId ?? t("diagnostics.none")}</dd>
          </div>
          <div>
            <dt>Game health</dt>
            <dd>{snapshot.game?.health ?? "unavailable"}</dd>
          </div>
        </dl>
        <div className="diagnostics__events">
          <h3>{t("diagnostics.events")}</h3>
          {snapshot.hub.events.length === 0 ? (
            <p>{t("diagnostics.empty")}</p>
          ) : (
            <ol>
              {snapshot.hub.events.map((event, index) => (
                <li key={`${event.at}-${event.type}-${index}`}>
                  <time>{event.at}</time>
                  <strong>{event.type}</strong>
                  <code>{JSON.stringify(event.detail)}</code>
                </li>
              ))}
            </ol>
          )}
          <h3>{t("diagnostics.guestEvents")}</h3>
          {snapshot.game?.events.length ? (
            <ol>
              {snapshot.game.events.map((event, index) => (
                <li key={`${event.timestampMs}-${event.code}-${index}`}>
                  <time>{event.timestampMs}</time>
                  <strong>{event.level}</strong>
                  <code>
                    {event.code}: {event.message}
                  </code>
                </li>
              ))}
            </ol>
          ) : (
            <p>{t("diagnostics.empty")}</p>
          )}
        </div>
        <div className="diagnostics__actions">
          <button type="button" onClick={() => void copySummary()}>
            {t("diagnostics.copy")}
          </button>
          <button type="button" onClick={exportJson}>
            {t("diagnostics.export")}
          </button>
          <span aria-live="polite">{feedback ? t(feedback) : null}</span>
        </div>
        <p className="diagnostics__privacy">{t("diagnostics.privacy")}</p>
      </div>
    </div>
  );
}

interface LabPanelProps {
  readonly open: boolean;
  readonly locale: SupportedLocale;
  readonly runtime: RuntimeDiagnosticState | null;
  readonly onApply: (state: HubLabStartupState) => Promise<void>;
  readonly onEvent: (type: string, detail: DiagnosticEvent["detail"]) => void;
}

function LabPanel({ open, locale, runtime, onApply, onEvent }: LabPanelProps) {
  const paneHost = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("loading");
  const copy = LAB_COPY[locale];

  useEffect(() => {
    if (!import.meta.env.DEV || !open || !paneHost.current) return;
    setStatus("loading");
    if (runtime === null) {
      setStatus("Lab requires a loaded guest manifest.");
      return;
    }
    let cancelled = false;
    let dispose: (() => void) | undefined;
    void import("./lab")
      .then(({ createLabPane }) => {
        if (cancelled || !paneHost.current) return;
        return createLabPane(paneHost.current, {
          identity: {
            gameId: runtime.gameId,
            gameVersion: runtime.gameVersion,
            buildId: runtime.buildId,
          },
          onApply: (state) => onApply(state),
          onChange: (label) => onEvent("lab.change", { target: label, sessionOnly: true }),
        });
      })
      .then((disposePane) => {
        if (cancelled) {
          disposePane?.();
          return;
        }
        dispose = disposePane;
        setStatus("ready");
      })
      .catch((error: unknown) => {
        setStatus(error instanceof Error ? error.message : "Lab import failed");
      });
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [onApply, onEvent, open, runtime]);

  if (!open) return null;

  return (
    <section className="lab-panel" aria-label={copy.heading}>
      {status !== "ready" ? <p>{status === "loading" ? copy.loading : status}</p> : null}
      <div ref={paneHost} />
    </section>
  );
}

export function App() {
  const { t } = useTranslation();
  const [route, setRoute] = useState<HubRoute>(() => parseHubRoute(window.location.search));
  const [settingsState, setSettingsState] = useState<SettingsReadResult>(() =>
    readSettings(window.localStorage, currentReducedMotionPreference()),
  );
  const [writeError, setWriteError] = useState<string | null>(null);
  const [systemLanguages, setSystemLanguages] = useState<readonly string[]>(currentSystemLanguages);
  const [activeOverlay, setActiveOverlay] = useState<HubOverlay | null>(null);
  const [labSettings, setLabSettings] = useState<HubSettings | null>(null);
  const [labApplyInFlight, setLabApplyInFlight] = useState(false);
  const [runtimeDiagnostic, setRuntimeDiagnostic] = useState<RuntimeDiagnosticState | null>(null);
  const runtimeRef = useRef<GameRuntimeHandle>(null);
  const playModeRef = useRef<HTMLElement>(null);
  const activeOverlayRef = useRef<HubOverlay | null>(null);
  const overlayPauseRef = useRef<Promise<boolean>>(Promise.resolve(false));
  const labApplyInFlightRef = useRef(false);
  const routeRef = useRef(route);
  const [events, setEvents] = useState<readonly DiagnosticEvent[]>(() => [
    {
      at: new Date().toISOString(),
      type: "hub.boot",
      detail: { build: __GAMEYARD_BUILD__, route: describeRoute(route) },
    },
  ]);

  const recordEvent = useCallback((type: string, detail: DiagnosticEvent["detail"]) => {
    const event: DiagnosticEvent = { at: new Date().toISOString(), type, detail };
    setEvents((current) => appendDiagnosticEvent(current, event));
  }, []);

  const openOverlay = useCallback(
    (overlay: HubOverlay): Promise<boolean> => {
      if (activeOverlayRef.current !== null) {
        activeOverlayRef.current = overlay;
        setActiveOverlay(overlay);
        return overlayPauseRef.current;
      }
      activeOverlayRef.current = overlay;
      setActiveOverlay(overlay);
      const handle = runtimeRef.current;
      overlayPauseRef.current = handle
        ? handle.pauseForOverlay().catch((error: unknown) => {
            recordEvent("overlay.pause-failed", {
              message: error instanceof Error ? error.message : String(error),
            });
            return false;
          })
        : Promise.resolve(false);
      recordEvent("overlay.open", { overlay });
      return overlayPauseRef.current;
    },
    [recordEvent],
  );

  const closeOverlay = useCallback(() => {
    const overlay = activeOverlayRef.current;
    if (overlay === null) return;
    const pause = overlayPauseRef.current;
    activeOverlayRef.current = null;
    overlayPauseRef.current = Promise.resolve(false);
    setActiveOverlay(null);
    recordEvent("overlay.close", { overlay });
    void pause
      .then(async (resume) => runtimeRef.current?.restoreAfterOverlay(resume))
      .catch((error: unknown) => {
        recordEvent("overlay.resume-failed", {
          message: error instanceof Error ? error.message : String(error),
        });
      });
  }, [recordEvent]);

  const abandonOverlay = useCallback(() => {
    activeOverlayRef.current = null;
    overlayPauseRef.current = Promise.resolve(false);
    setActiveOverlay(null);
  }, []);

  const persistedSettings = settingsState.kind === "error" ? null : settingsState.settings;
  const settings = persistedSettings === null ? null : (labSettings ?? persistedSettings);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const settingsError = settingsState.kind === "error" ? settingsState.error : writeError;
  const locale: SupportedLocale = settings
    ? resolveLocale(settings.localePreference, systemLanguages)
    : resolveSystemLocale(systemLanguages);
  routeRef.current = route;

  useEffect(() => {
    if (settingsState.kind !== "empty") return;
    try {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, serializeSettings(settingsState.settings));
      setSettingsState({ kind: "valid", settings: settingsState.settings });
      recordEvent("settings.initialize", { revision: settingsState.settings.revision });
    } catch {
      setSettingsState({ kind: "error", error: "settings.storage-unavailable" });
      recordEvent("settings.error", { code: "settings.storage-unavailable" });
    }
  }, [recordEvent, settingsState]);

  useEffect(() => {
    void i18n.changeLanguage(locale);
    document.documentElement.lang = locale;
    document.documentElement.dataset.reducedMotion = String(settings?.reducedMotion ?? false);
    document.documentElement.dataset.screenShake = String(settings?.screenShake ?? false);
  }, [locale, settings?.reducedMotion, settings?.screenShake]);

  useEffect(() => {
    const handleLanguageChange = () => {
      const nextLanguages = currentSystemLanguages();
      setSystemLanguages(nextLanguages);
      if (settings?.localePreference === "system") {
        recordEvent("locale.system-change", { locale: resolveSystemLocale(nextLanguages) });
      }
    };
    window.addEventListener("languagechange", handleLanguageChange);
    return () => window.removeEventListener("languagechange", handleLanguageChange);
  }, [recordEvent, settings?.localePreference]);

  useEffect(() => {
    const handlePopState = () => {
      abandonOverlay();
      const nextRoute = parseHubRoute(window.location.search);
      const currentRoute = routeRef.current;
      if (currentRoute.kind === "game" && runtimeRef.current) {
        const exitFullscreen =
          document.fullscreenElement === null ? Promise.resolve() : document.exitFullscreen();
        void exitFullscreen
          .then(() => runtimeRef.current?.dispose())
          .then(() => {
            routeRef.current = nextRoute;
            setRoute(nextRoute);
            setLabSettings(null);
            setRuntimeDiagnostic(null);
            recordEvent("route.popstate", { route: describeRoute(nextRoute) });
          })
          .catch(() => undefined);
        return;
      }
      routeRef.current = nextRoute;
      setRoute(nextRoute);
      setLabSettings(null);
      recordEvent("route.popstate", { route: describeRoute(nextRoute) });
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [abandonOverlay, recordEvent]);

  useEffect(() => {
    if (route.kind !== "game") return;
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      playModeRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [route]);

  const selectGame = async (gameId: GameId) => {
    if (route.kind === "game" && route.game.id === gameId) return;
    abandonOverlay();
    if (route.kind === "game") {
      await runtimeRef.current?.dispose();
      setRuntimeDiagnostic(null);
    }
    setLabSettings(null);
    window.history.pushState({ kind: INDEX_GAME_HISTORY_KIND }, "", gameSearch(gameId));
    const nextRoute = parseHubRoute(window.location.search);
    routeRef.current = nextRoute;
    setRoute(nextRoute);
    recordEvent("route.select", { gameId });
  };

  const updateSettings = (patch: HubSettingsPatch) => {
    if (!persistedSettings) return;
    if (labApplyInFlightRef.current) {
      recordEvent("settings.blocked", { reason: "lab-apply-in-flight" });
      return;
    }
    const activeSettings = settingsRef.current;
    if (activeSettings === null || activeSettings.revision < persistedSettings.revision) {
      throw new Error("Active settings revision must not precede persisted settings");
    }
    const next = reviseSettings({ ...persistedSettings, revision: activeSettings.revision }, patch);
    try {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, serializeSettings(next));
    } catch {
      setWriteError("settings.write-failed");
      recordEvent("settings.error", { code: "settings.write-failed" });
      return;
    }
    setSettingsState({ kind: "valid", settings: next });
    setLabSettings(null);
    settingsRef.current = next;
    setWriteError(null);
    recordEvent("settings.update", {
      revision: next.revision,
      fields: Object.keys(patch).join(","),
    });
  };

  const resetInvalidSettings = () => {
    const result = resetSettings(window.localStorage, currentReducedMotionPreference());
    if (result.kind === "error") {
      setSettingsState(result);
      recordEvent("settings.error", { code: result.error, action: "reset" });
      return;
    }
    setSettingsState({ kind: "valid", settings: result.settings });
    setLabSettings(null);
    settingsRef.current = result.settings;
    setWriteError(null);
    recordEvent("settings.reset", {
      revision: result.settings.revision,
      reducedMotion: result.settings.reducedMotion,
      screenShake: result.settings.screenShake,
    });
  };

  const closeRuntime = useCallback(async () => {
    const currentRoute = routeRef.current;
    if (currentRoute.kind !== "game") {
      throw new Error("Cannot close a runtime without an active game route");
    }
    const gameId = currentRoute.game.id;
    abandonOverlay();
    if (isIndexGameHistoryState(window.history.state)) {
      window.history.back();
      recordEvent("route.back", { gameId, target: "history" });
      return;
    }
    if (document.fullscreenElement !== null) await document.exitFullscreen();
    await runtimeRef.current?.dispose();
    setLabSettings(null);
    setRuntimeDiagnostic(null);
    window.history.replaceState(null, "", "./");
    const nextRoute = parseHubRoute(window.location.search);
    routeRef.current = nextRoute;
    setRoute(nextRoute);
    recordEvent("route.back", { gameId, target: "index" });
  }, [abandonOverlay, recordEvent]);

  const openDiagnostics = useCallback(() => {
    void openOverlay("diagnostics").then(() => {
      const handle = runtimeRef.current;
      if (!handle) return;
      void handle.requestDiagnostics().catch((error: unknown) => {
        recordEvent("diagnostics.guest-failed", {
          message: error instanceof Error ? error.message : String(error),
        });
      });
    });
  }, [openOverlay, recordEvent]);

  const applyLabStartupState = useCallback(
    async (state: HubLabStartupState) => {
      if (!import.meta.env.DEV) throw new Error("Lab startup states require a development build");
      const current = settingsRef.current;
      const handle = runtimeRef.current;
      if (current === null || handle === null || runtimeDiagnostic === null) {
        throw new Error("Lab requires a loaded guest manifest and active runtime");
      }
      if (labApplyInFlightRef.current) throw new Error("A Lab scene is already being applied");
      labApplyInFlightRef.current = true;
      setLabApplyInFlight(true);
      const next = reviseSettings(current, {
        localePreference: state.localePreference,
        masterVolume: state.masterVolume,
        musicVolume: state.musicVolume,
        sfxVolume: state.sfxVolume,
        reducedMotion: state.reducedMotion,
        screenShake: state.screenShake,
      });
      try {
        await handle.applyHostState(
          toHostSettings(next),
          toLocaleContext(next.localePreference, systemLanguages),
          "paused",
        );
        overlayPauseRef.current = Promise.resolve(state.lifecycle === "active");
        setLabSettings(next);
        settingsRef.current = next;
        setWriteError(null);
        recordEvent("lab.scene-applied", {
          gameId: runtimeDiagnostic.gameId,
          lifecycle: state.lifecycle,
          revision: next.revision,
          sessionOnly: true,
        });
      } finally {
        labApplyInFlightRef.current = false;
        setLabApplyInFlight(false);
      }
    },
    [recordEvent, runtimeDiagnostic, systemLanguages],
  );

  const diagnosticSnapshot = useMemo(
    () =>
      makeDiagnosticEnvelope(route, locale, settings?.revision ?? null, events, runtimeDiagnostic),
    [events, locale, route, runtimeDiagnostic, settings?.revision],
  );
  const selectedId = route.kind === "game" ? route.game.id : null;
  const drawerTitle =
    activeOverlay === "diagnostics"
      ? t("diagnostics.heading")
      : activeOverlay === "pwa"
        ? t("pwa.heading")
        : import.meta.env.DEV && activeOverlay === "lab"
          ? LAB_COPY[locale].heading
          : t("settings.heading");

  const reloadRuntimeFromOverlay = () => {
    const handle = runtimeRef.current;
    if (!handle) throw new Error("Runtime controller is unavailable for reload");
    abandonOverlay();
    void handle.reload().catch((error: unknown) => {
      recordEvent("runtime.reload-failed", {
        message: error instanceof Error ? error.message : String(error),
      });
    });
  };

  return (
    <div className={`app-shell${route.kind === "game" ? " app-shell--play" : ""}`}>
      <div
        className="hub-surface"
        inert={activeOverlay !== null}
        aria-hidden={activeOverlay !== null}
      >
        {route.kind === "game" ? (
          <main
            ref={playModeRef}
            className="play-mode"
            tabIndex={-1}
            aria-label={t("runtime.playMode", { game: route.game.title })}
          >
            <Stage
              route={route}
              settings={settings}
              systemLanguages={systemLanguages}
              runtimeRef={runtimeRef}
              onCloseRuntime={closeRuntime}
              onOpenTools={() => void openOverlay("settings")}
              onSettingsChange={updateSettings}
              onGuestDiagnosticSnapshot={setRuntimeDiagnostic}
              onEvent={recordEvent}
            />
          </main>
        ) : (
          <>
            <header className="site-header">
              <div className="brand-block">
                <a className="wordmark" href="./" aria-label="GameYard home">
                  <span>GAME</span>
                  <span>YARD</span>
                </a>
                <div>
                  <p>{t("brand.kicker")}</p>
                  <span>{t("brand.subtitle")}</span>
                </div>
              </div>
              <div className="header-actions">
                <button
                  className="utility-button"
                  type="button"
                  onClick={() => void openOverlay("settings")}
                >
                  {t("settings.open")} <span aria-hidden="true">↘</span>
                </button>
              </div>
            </header>

            {settingsState.kind === "error" ? (
              <div className="contract-error" role="alert">
                <span>SETTINGS / CONTRACT / STOP</span>
                <div>
                  <strong>{t("settings.errorTitle")}</strong>
                  <p>{t("settings.errorBody")}</p>
                  <code>{settingsState.error}</code>
                  <div className="contract-error__reset">
                    <p>{t("settings.resetHint")}</p>
                    <button type="button" onClick={resetInvalidSettings}>
                      {t("settings.reset")}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            <main className="browse-mode">
              <section className="browse-intro" aria-labelledby="page-title">
                <div>
                  <span className="micro-label">{t("index.eyebrow")}</span>
                  <h1 id="page-title">{t("index.title")}</h1>
                </div>
                <p>{t("index.instruction")}</p>
              </section>

              {route.kind === "index" ? (
                <section className="catalog" aria-labelledby="catalog-title">
                  <h2 className="catalog__heading" id="catalog-title">
                    {t("catalog.heading")}
                  </h2>
                  <BrowseCatalog
                    games={GAME_CATALOG}
                    locale={locale}
                    onSelect={(gameId) => {
                      void selectGame(gameId).catch(() => undefined);
                    }}
                  />
                </section>
              ) : (
                <Stage
                  route={route}
                  settings={settings}
                  systemLanguages={systemLanguages}
                  runtimeRef={runtimeRef}
                  onCloseRuntime={closeRuntime}
                  onOpenTools={() => void openOverlay("settings")}
                  onSettingsChange={updateSettings}
                  onGuestDiagnosticSnapshot={setRuntimeDiagnostic}
                  onEvent={recordEvent}
                />
              )}
            </main>

            <footer className="site-footer">
              <span>{t("footer.note")}</span>
              <span>{__GAMEYARD_BUILD__}</span>
            </footer>
          </>
        )}
      </div>

      <HubDrawer
        open={activeOverlay !== null}
        contentKey={activeOverlay ?? "closed"}
        title={drawerTitle}
        eyebrow={t("drawer.eyebrow")}
        closeLabel={t("drawer.close")}
        onClose={closeOverlay}
      >
        <div className="settings-drawer-panel" hidden={activeOverlay !== "settings"}>
          <SettingsPanel
            settings={settings}
            error={settingsError}
            locked={labApplyInFlight}
            onChange={updateSettings}
          />
          {settings === null ? (
            <div className="settings-drawer-panel__contract" role="alert">
              <p>{t("settings.resetHint")}</p>
              <button type="button" onClick={resetInvalidSettings}>
                {t("settings.reset")}
              </button>
            </div>
          ) : null}
          <nav className="drawer-utilities" aria-label={t("drawer.utilities")}>
            {import.meta.env.DEV ? (
              <button type="button" onClick={() => void openOverlay("lab")}>
                {LAB_COPY[locale].open}
              </button>
            ) : null}
            {import.meta.env.PROD ? (
              <button type="button" onClick={() => void openOverlay("pwa")}>
                {t("nav.offline")}
              </button>
            ) : null}
            <button type="button" onClick={openDiagnostics}>
              {t("nav.diagnostics")}
            </button>
          </nav>
          {route.kind === "game" ? (
            <div className="drawer-reload">
              <div>
                <strong>{t("runtime.reload")}</strong>
                <p>{t("runtime.reloadDetail")}</p>
              </div>
              <button type="button" onClick={reloadRuntimeFromOverlay}>
                {t("runtime.reload")}
              </button>
            </div>
          ) : null}
        </div>
        <DiagnosticsPanel open={activeOverlay === "diagnostics"} snapshot={diagnosticSnapshot} />
        {import.meta.env.PROD ? (
          <PwaPanel
            open={activeOverlay === "pwa"}
            games={GAME_CATALOG}
            selectedGame={selectedId}
            onEvent={recordEvent}
          />
        ) : null}
        {import.meta.env.DEV ? (
          <LabPanel
            open={activeOverlay === "lab"}
            locale={locale}
            runtime={runtimeDiagnostic}
            onApply={applyLabStartupState}
            onEvent={recordEvent}
          />
        ) : null}
      </HubDrawer>
    </div>
  );
}
