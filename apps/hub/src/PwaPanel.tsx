import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { GameCatalogEntry, GameId } from "./catalog";
import type { DiagnosticEvent } from "./diagnostics";
import type { SupportedLocale } from "./locales";
import {
  activatePwaUpdate,
  assertPwaWorkerBuild,
  clearOfflineGames,
  fetchPublishedBuildId,
  queryPwaStatus,
  registerHubServiceWorker,
  removeGameOffline,
  saveGameOffline,
  watchForPwaUpdate,
} from "./pwa";

type Phase =
  | "registering"
  | "ready"
  | "saving"
  | "removing"
  | "clearing"
  | "updating"
  | "unsupported";

interface WaitingRelease {
  readonly worker: ServiceWorker;
  readonly buildId: string;
}

type StorageEstimateState =
  | { readonly kind: "loading" }
  | { readonly kind: "unavailable" }
  | { readonly kind: "ready"; readonly usage: number; readonly quota: number };

interface PwaPanelProps {
  readonly games: readonly GameCatalogEntry[];
  readonly locale: SupportedLocale;
  readonly open: boolean;
  readonly selectedGame: GameId | null;
  readonly onEvent: (type: string, detail: DiagnosticEvent["detail"]) => void;
}

function formatMegabytes(bytes: number, locale: SupportedLocale): string {
  const value = bytes === 0 ? 0 : Math.max(0.01, bytes / (1024 * 1024));
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit: "megabyte",
    unitDisplay: "short",
    maximumFractionDigits: bytes < 1024 * 1024 ? 2 : 1,
  }).format(value);
}

export function PwaPanel({ games, locale, open, selectedGame, onEvent }: PwaPanelProps) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>("registering");
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [savedGames, setSavedGames] = useState<readonly string[]>([]);
  const [activeGame, setActiveGame] = useState<GameId | null>(null);
  const [staleGames, setStaleGames] = useState<readonly string[]>([]);
  const [waitingRelease, setWaitingRelease] = useState<WaitingRelease | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [storageEstimate, setStorageEstimate] = useState<StorageEstimateState>({ kind: "loading" });
  const [operationError, setOperationError] = useState(false);
  const reloadOnControllerChange = useRef(false);

  useEffect(() => {
    if (import.meta.env.DEV) {
      setPhase("unsupported");
      return;
    }
    let cancelled = false;
    let stopWatching: () => void = () => undefined;
    const onControllerChange = () => {
      if (reloadOnControllerChange.current) window.location.reload();
    };
    navigator.serviceWorker?.addEventListener("controllerchange", onControllerChange);
    void registerHubServiceWorker()
      .then(async (nextRegistration) => {
        if (cancelled) return;
        setRegistration(nextRegistration);
        stopWatching = watchForPwaUpdate(nextRegistration, (worker) => {
          void fetchPublishedBuildId()
            .then(async (buildId) => {
              await assertPwaWorkerBuild(worker, buildId);
              if (!cancelled) setWaitingRelease({ worker, buildId });
            })
            .catch(() => {
              if (!cancelled) setWaitingRelease(null);
            });
        });
        const status = await queryPwaStatus(nextRegistration);
        const knownIds = new Set<string>(games.map((game) => game.id));
        if (status.savedGames.some((gameId) => !knownIds.has(gameId))) {
          throw new Error("The Service Worker returned a saved game outside the current catalog");
        }
        if (cancelled) return;
        setStaleGames(status.staleGames);
        setSavedGames(status.savedGames);
        setPhase("ready");
        onEvent("pwa.ready", { buildId: status.buildId });
        if (status.staleGames.length > 0) {
          onEvent("pwa.stale-entries-found", { gameIds: status.staleGames.join(",") });
        }
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setPhase("unsupported");
        onEvent("pwa.failed", {
          message: reason instanceof Error ? reason.message : String(reason),
        });
      });
    return () => {
      cancelled = true;
      stopWatching();
      navigator.serviceWorker?.removeEventListener("controllerchange", onControllerChange);
    };
  }, [games, onEvent]);

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);
    const checkForUpdate = () => {
      setOnline(true);
      void registration?.update().catch(() => undefined);
    };
    window.addEventListener("online", checkForUpdate);
    window.addEventListener("offline", updateOnline);
    return () => {
      window.removeEventListener("online", checkForUpdate);
      window.removeEventListener("offline", updateOnline);
    };
  }, [registration]);

  useEffect(() => {
    if (!open) return;
    if (!navigator.storage?.estimate) {
      setStorageEstimate({ kind: "unavailable" });
      return;
    }
    let cancelled = false;
    setStorageEstimate({ kind: "loading" });
    void navigator.storage
      .estimate()
      .then((estimate) => {
        if (cancelled) return;
        if (typeof estimate.usage !== "number" || typeof estimate.quota !== "number") {
          setStorageEstimate({ kind: "unavailable" });
          return;
        }
        setStorageEstimate({ kind: "ready", usage: estimate.usage, quota: estimate.quota });
      })
      .catch(() => {
        if (!cancelled) setStorageEstimate({ kind: "unavailable" });
      });
    return () => {
      cancelled = true;
    };
  }, [open, savedGames]);

  const run = async (nextPhase: Phase, gameId: GameId | null, operation: () => Promise<void>) => {
    setPhase(nextPhase);
    setActiveGame(gameId);
    setOperationError(false);
    try {
      await operation();
      setPhase("ready");
    } catch (reason) {
      setPhase("ready");
      setOperationError(true);
      onEvent("pwa.operation-failed", {
        operation: nextPhase,
        gameId,
        message: reason instanceof Error ? reason.message : String(reason),
      });
    } finally {
      setActiveGame(null);
    }
  };

  const saveGame = (gameId: GameId) => {
    if (!registration) return;
    void run("saving", gameId, async () => {
      const status = await saveGameOffline(registration, gameId);
      setSavedGames(status.savedGames);
      onEvent("pwa.game-saved", { gameId, buildId: status.buildId });
    });
  };

  const removeGame = (gameId: GameId) => {
    if (!registration) return;
    void run("removing", gameId, async () => {
      const status = await removeGameOffline(registration, gameId);
      setSavedGames(status.savedGames);
      onEvent("pwa.game-removed", { gameId, buildId: status.buildId });
    });
  };

  const clearGames = () => {
    if (!registration) return;
    void run("clearing", null, async () => {
      const status = await clearOfflineGames(registration);
      setSavedGames(status.savedGames);
      setStaleGames(status.staleGames);
      onEvent("pwa.games-cleared", { buildId: status.buildId });
    });
  };

  const applyUpdate = () => {
    if (!waitingRelease || !registration) return;
    void run("updating", null, async () => {
      const publishedBuildId = await fetchPublishedBuildId();
      if (publishedBuildId !== waitingRelease.buildId) {
        setWaitingRelease(null);
        await registration.update();
        throw new Error("The published release changed; waiting for its current Service Worker");
      }
      await assertPwaWorkerBuild(waitingRelease.worker, publishedBuildId);
      reloadOnControllerChange.current = true;
      await activatePwaUpdate(waitingRelease.worker, publishedBuildId);
      onEvent("pwa.update-accepted", { buildId: publishedBuildId });
    });
  };

  if (!open) return null;
  const busy = phase !== "ready";

  return (
    <div className="pwa-panel">
      <div className="pwa-panel__status" role="status">
        <span data-online={online}>{online ? t("pwa.online") : t("pwa.offline")}</span>
        <code>{__GAMEYARD_BUILD__}</code>
      </div>
      {waitingRelease ? (
        <section className="pwa-panel__update">
          <strong>{t("pwa.updateReady")}</strong>
          <p>{t("pwa.updateDetail")}</p>
          <button type="button" disabled={busy} onClick={applyUpdate}>
            {phase === "updating" ? t("pwa.updating") : t("pwa.update")}
          </button>
        </section>
      ) : null}
      {staleGames.length > 0 ? (
        <p className="pwa-panel__notice" role="alert">
          {t("pwa.staleFound", { games: staleGames.join(", ") })}
        </p>
      ) : null}
      <section>
        <strong>{t("pwa.gamesHeading")}</strong>
        <p>{t("pwa.gamesDetail")}</p>
        <ul className="pwa-panel__games">
          {games.map((game) => {
            const saved = savedGames.includes(game.id);
            const pending = activeGame === game.id;
            return (
              <li key={game.id} data-selected={selectedGame === game.id}>
                <div>
                  <strong>{game.title}</strong>
                  <span>{saved ? t("pwa.gameSaved") : t("pwa.gameOnlineOnly")}</span>
                </div>
                <button
                  type="button"
                  disabled={!registration || busy}
                  onClick={() => (saved ? removeGame(game.id) : saveGame(game.id))}
                >
                  {pending
                    ? phase === "saving"
                      ? t("pwa.saving")
                      : t("pwa.removing")
                    : saved
                      ? t("pwa.remove")
                      : t("pwa.save")}
                </button>
              </li>
            );
          })}
        </ul>
      </section>
      <section>
        <strong>{t("pwa.storageHeading")}</strong>
        <p>{t("pwa.storageDetail")}</p>
        <p className="pwa-panel__estimate">
          {storageEstimate.kind === "ready"
            ? t("pwa.storageEstimate", {
                usage: formatMegabytes(storageEstimate.usage, locale),
                quota: formatMegabytes(storageEstimate.quota, locale),
              })
            : storageEstimate.kind === "loading"
              ? t("pwa.storageEstimating")
              : t("pwa.storageUnavailable")}
        </p>
        <button
          type="button"
          disabled={!registration || (savedGames.length === 0 && staleGames.length === 0) || busy}
          onClick={clearGames}
        >
          {phase === "clearing" ? t("pwa.clearing") : t("pwa.clear")}
        </button>
      </section>
      {phase === "registering" ? <p>{t("pwa.registering")}</p> : null}
      {phase === "unsupported" ? <p>{t("pwa.unavailable")}</p> : null}
      {operationError ? (
        <p className="pwa-panel__error" role="alert">
          {t("pwa.operationError")}
        </p>
      ) : null}
    </div>
  );
}
