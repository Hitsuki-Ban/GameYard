import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";

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
import { GameRuntime, type GameRuntimeHandle } from "./GameRuntime";
import type { HubLabStartupState } from "./lab";
import { PwaDrawer } from "./PwaDrawer";
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
  readonly "--game-stage-aspect"?: string;
};

function gameStageStyle(game: GameCatalogEntry): GameStageStyle {
  return {
    "--game-accent": game.accent,
    ...(game.stage.kind === "fixed-aspect"
      ? { "--game-stage-aspect": `${game.stage.width} / ${game.stage.height}` }
      : {}),
  };
}

function GamePoster({ game }: { readonly game: GameCatalogEntry }) {
  const fallback = game.cover.candidates.at(-1);
  if (!fallback) throw new Error(`Catalog game ${game.id} is missing a cover candidate`);
  const srcSet = game.cover.candidates
    .map((candidate) => `${candidate.url} ${candidate.width}w`)
    .join(", ");
  return (
    <picture className="poster" aria-hidden="true">
      <img
        src={fallback.url}
        srcSet={srcSet}
        sizes="(max-width: 520px) 100vw, 42vw"
        width={fallback.width}
        height={fallback.height}
        alt=""
      />
    </picture>
  );
}

interface SettingsBarProps {
  readonly settings: HubSettings | null;
  readonly error: string | null;
  readonly locked: boolean;
  readonly onChange: (patch: HubSettingsPatch) => void;
}

function SettingsBar({ settings, error, locked, onChange }: SettingsBarProps) {
  const { t } = useTranslation();
  const disabled = settings === null || locked;

  return (
    <section className="settings-bar" aria-labelledby="settings-title">
      <div className="settings-bar__heading">
        <span className="micro-label" id="settings-title">
          {t("settings.heading")}
        </span>
      </div>
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

function CatalogRow({
  game,
  locale,
  selected,
  onSelect,
}: {
  readonly game: GameCatalogEntry;
  readonly locale: SupportedLocale;
  readonly selected: boolean;
  readonly onSelect: (gameId: GameId) => void;
}) {
  const { t } = useTranslation();

  return (
    <li className={`catalog-row${selected ? " is-selected" : ""}`}>
      <a
        href={gameSearch(game.id)}
        className="catalog-row__select"
        aria-current={selected ? "page" : undefined}
        onClick={(event) => {
          event.preventDefault();
          onSelect(game.id);
        }}
      >
        <span className="catalog-row__number">{String(game.order).padStart(2, "0")}</span>
        <span className="catalog-row__title">{game.title}</span>
        <span className="catalog-row__type">{game.taglines[locale]}</span>
        <span className="catalog-row__arrow" aria-hidden="true">
          ↗
        </span>
      </a>
      <div className="catalog-row__meta">
        <span>{t("catalog.order", { order: game.order })}</span>
        <span>{t("catalog.languages", { languages: game.languages.join(" · ") })}</span>
      </div>
    </li>
  );
}

interface StageProps {
  readonly route: HubRoute;
  readonly settings: HubSettings | null;
  readonly systemLanguages: readonly string[];
  readonly runtimeRef: React.RefObject<GameRuntimeHandle | null>;
  readonly onCloseRuntime: () => Promise<void>;
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

  if (route.kind === "index") {
    return (
      <section className="stage stage--empty" aria-labelledby="empty-stage-title">
        <div className="empty-stage__axis" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="empty-stage__copy">
          <span className="micro-label">NO SELECTION / 000</span>
          <h2 id="empty-stage-title">{t("stage.select")}</h2>
          <p>{t("stage.selectDetail")}</p>
        </div>
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
      <div className="stage__poster-wrap">
        <GamePoster game={game} />
      </div>
      <div className="stage__body">
        <span className="micro-label">SETTINGS / CONTRACT / STOP</span>
        <div className="kinetic-title">
          <h2 id="settings-stage-error-title">{game.title}</h2>
        </div>
        <p className="stage__description">{t("stage.settingsRequired")}</p>
      </div>
    </section>
  );
}

interface DiagnosticsDrawerProps {
  readonly open: boolean;
  readonly snapshot: DiagnosticEnvelope;
  readonly onClose: () => void;
}

function DiagnosticsDrawer({ open, snapshot, onClose }: DiagnosticsDrawerProps) {
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

  return (
    <aside className={`diagnostics${open ? " is-open" : ""}`} aria-hidden={!open} inert={!open}>
      <div className="diagnostics__bar">
        <h2>{t("diagnostics.heading")}</h2>
        <button type="button" onClick={onClose}>
          {t("diagnostics.close")} ×
        </button>
      </div>
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
    </aside>
  );
}

interface LabOverlayProps {
  readonly open: boolean;
  readonly locale: SupportedLocale;
  readonly runtime: RuntimeDiagnosticState | null;
  readonly onClose: () => void;
  readonly onApply: (state: HubLabStartupState) => Promise<void>;
  readonly onEvent: (type: string, detail: DiagnosticEvent["detail"]) => void;
}

function LabOverlay({ open, locale, runtime, onClose, onApply, onEvent }: LabOverlayProps) {
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
    <section className="lab-overlay" aria-label={copy.heading}>
      <div className="lab-overlay__bar">
        <strong>{copy.heading}</strong>
        <button type="button" onClick={onClose}>
          {copy.close} ×
        </button>
      </div>
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
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [pwaOpen, setPwaOpen] = useState(false);
  const [labOpen, setLabOpen] = useState(false);
  const [labSettings, setLabSettings] = useState<HubSettings | null>(null);
  const [labApplyInFlight, setLabApplyInFlight] = useState(false);
  const [runtimeDiagnostic, setRuntimeDiagnostic] = useState<RuntimeDiagnosticState | null>(null);
  const runtimeRef = useRef<GameRuntimeHandle>(null);
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
      const nextRoute = parseHubRoute(window.location.search);
      const currentRoute = routeRef.current;
      if (currentRoute.kind === "game" && runtimeRef.current) {
        void runtimeRef.current
          .dispose()
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
  }, [recordEvent]);

  const selectGame = async (gameId: GameId) => {
    if (route.kind === "game" && route.game.id === gameId) return;
    if (route.kind === "game") {
      await runtimeRef.current?.dispose();
      setRuntimeDiagnostic(null);
    }
    setLabSettings(null);
    window.history.pushState(null, "", gameSearch(gameId));
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
    await runtimeRef.current?.dispose();
    setLabSettings(null);
    setRuntimeDiagnostic(null);
    window.history.pushState(null, "", "./");
    const nextRoute = parseHubRoute(window.location.search);
    routeRef.current = nextRoute;
    setRoute(nextRoute);
    recordEvent("route.close", { gameId });
  }, [recordEvent]);

  const openDiagnostics = useCallback(() => {
    setDiagnosticsOpen(true);
    const handle = runtimeRef.current;
    if (!handle) return;
    void handle.requestDiagnostics().catch((error: unknown) => {
      recordEvent("diagnostics.guest-failed", {
        message: error instanceof Error ? error.message : String(error),
      });
    });
  }, [recordEvent]);

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
          state.lifecycle,
        );
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

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="brand-block">
          <a
            className="wordmark"
            href="./"
            aria-label="GameYard home"
            onClick={(event) => {
              if (route.kind !== "game") return;
              event.preventDefault();
              void closeRuntime().catch(() => undefined);
            }}
          >
            <span>GAME</span>
            <span>YARD</span>
          </a>
          <div>
            <p>{t("brand.kicker")}</p>
            <span>{t("brand.subtitle")}</span>
          </div>
        </div>
        <div className="header-actions">
          {import.meta.env.DEV ? (
            <button
              className="utility-button utility-button--lab"
              type="button"
              onClick={() => setLabOpen(true)}
            >
              {LAB_COPY[locale].open}
            </button>
          ) : null}
          {import.meta.env.PROD ? (
            <button className="utility-button" type="button" onClick={() => setPwaOpen(true)}>
              {t("nav.offline")} <span aria-hidden="true">↓</span>
            </button>
          ) : null}
          <button className="utility-button" type="button" onClick={openDiagnostics}>
            {t("nav.diagnostics")} <span aria-hidden="true">↘</span>
          </button>
        </div>
      </header>

      <SettingsBar
        settings={settings}
        error={settingsError}
        locked={labApplyInFlight}
        onChange={updateSettings}
      />
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

      <main>
        <section className="intro" aria-labelledby="page-title">
          <div>
            <span className="micro-label">{t("index.eyebrow")}</span>
            <h1 id="page-title">{t("index.title")}</h1>
          </div>
          <p>{t("index.instruction")}</p>
        </section>

        <div className="gallery-layout">
          <section className="catalog" aria-labelledby="catalog-title">
            <div className="section-rule">
              <h2 id="catalog-title">{t("catalog.heading")}</h2>
              <span>{t("catalog.count", { count: GAME_CATALOG.length })}</span>
            </div>
            <ol>
              {GAME_CATALOG.map((game) => (
                <CatalogRow
                  key={game.id}
                  game={game}
                  locale={locale}
                  selected={game.id === selectedId}
                  onSelect={(gameId) => {
                    void selectGame(gameId).catch(() => undefined);
                  }}
                />
              ))}
            </ol>
          </section>
          <Stage
            route={route}
            settings={settings}
            systemLanguages={systemLanguages}
            runtimeRef={runtimeRef}
            onCloseRuntime={closeRuntime}
            onSettingsChange={updateSettings}
            onGuestDiagnosticSnapshot={setRuntimeDiagnostic}
            onEvent={recordEvent}
          />
        </div>
      </main>

      <footer className="site-footer">
        <span>{t("footer.note")}</span>
        <span>{__GAMEYARD_BUILD__}</span>
      </footer>

      <DiagnosticsDrawer
        open={diagnosticsOpen}
        snapshot={diagnosticSnapshot}
        onClose={() => setDiagnosticsOpen(false)}
      />
      {import.meta.env.PROD ? (
        <PwaDrawer
          open={pwaOpen}
          selectedGame={selectedId}
          onClose={() => setPwaOpen(false)}
          onEvent={recordEvent}
        />
      ) : null}
      {import.meta.env.DEV ? (
        <LabOverlay
          open={labOpen}
          locale={locale}
          runtime={runtimeDiagnostic}
          onClose={() => setLabOpen(false)}
          onApply={applyLabStartupState}
          onEvent={recordEvent}
        />
      ) : null}
    </div>
  );
}
