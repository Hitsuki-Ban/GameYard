import type { GameId } from "@gameyard/game-contract";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { DiagnosticEvent } from "./diagnostics";
import {
  activatePwaUpdate,
  assertPwaWorkerBuild,
  clearOfflineGames,
  fetchPublishedBuildId,
  queryPwaStatus,
  registerHubServiceWorker,
  saveGameOffline,
  watchForPwaUpdate,
} from "./pwa";

interface PwaDrawerProps {
  readonly open: boolean;
  readonly selectedGame: GameId | null;
  readonly onClose: () => void;
  readonly onEvent: (type: string, detail: DiagnosticEvent["detail"]) => void;
}

type Phase = "registering" | "ready" | "saving" | "clearing" | "updating" | "unsupported";
interface WaitingRelease {
  readonly worker: ServiceWorker;
  readonly buildId: string;
}

export function PwaDrawer({ open, selectedGame, onClose, onEvent }: PwaDrawerProps) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>("registering");
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [savedGames, setSavedGames] = useState<readonly GameId[]>([]);
  const [waitingRelease, setWaitingRelease] = useState<WaitingRelease | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [error, setError] = useState<string | null>(null);
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
        if (cancelled) return;
        setSavedGames(status.savedGames);
        setPhase("ready");
        onEvent("pwa.ready", { buildId: status.buildId });
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setPhase("unsupported");
        setError(reason instanceof Error ? reason.message : String(reason));
        onEvent("pwa.failed", {
          message: reason instanceof Error ? reason.message : String(reason),
        });
      });
    return () => {
      cancelled = true;
      stopWatching();
      navigator.serviceWorker?.removeEventListener("controllerchange", onControllerChange);
    };
  }, [onEvent]);

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

  const run = async (nextPhase: Phase, operation: () => Promise<void>) => {
    setPhase(nextPhase);
    setError(null);
    try {
      await operation();
      setPhase("ready");
    } catch (reason) {
      setPhase("ready");
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const saveSelected = () => {
    if (!registration || !selectedGame) return;
    void run("saving", async () => {
      const status = await saveGameOffline(registration, selectedGame);
      setSavedGames(status.savedGames);
      onEvent("pwa.game-saved", { gameId: selectedGame, buildId: status.buildId });
    });
  };

  const clearGames = () => {
    if (!registration) return;
    void run("clearing", async () => {
      const status = await clearOfflineGames(registration);
      setSavedGames(status.savedGames);
      onEvent("pwa.games-cleared", { buildId: status.buildId });
    });
  };

  const applyUpdate = () => {
    if (!waitingRelease || !registration) return;
    void run("updating", async () => {
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
  const selectedSaved = selectedGame !== null && savedGames.includes(selectedGame);

  return (
    <aside className="pwa-drawer" aria-labelledby="pwa-heading">
      <div className="pwa-drawer__bar">
        <h2 id="pwa-heading">{t("pwa.heading")}</h2>
        <button type="button" onClick={onClose}>
          {t("pwa.close")} ×
        </button>
      </div>
      <div className="pwa-drawer__content">
        <div className="pwa-drawer__status" role="status">
          <span data-online={online}>{online ? t("pwa.online") : t("pwa.offline")}</span>
          <code>{__GAMEYARD_BUILD__}</code>
        </div>
        {waitingRelease ? (
          <section className="pwa-drawer__update">
            <strong>{t("pwa.updateReady")}</strong>
            <p>{t("pwa.updateDetail")}</p>
            <button type="button" disabled={phase !== "ready"} onClick={applyUpdate}>
              {phase === "updating" ? t("pwa.updating") : t("pwa.update")}
            </button>
          </section>
        ) : null}
        <section>
          <strong>{t("pwa.gamesHeading")}</strong>
          <p>{selectedGame ? t("pwa.selected", { game: selectedGame }) : t("pwa.selectGame")}</p>
          <button
            type="button"
            disabled={!registration || !selectedGame || selectedSaved || phase !== "ready"}
            onClick={saveSelected}
          >
            {phase === "saving" ? t("pwa.saving") : selectedSaved ? t("pwa.saved") : t("pwa.save")}
          </button>
          <p>{t("pwa.savedList", { games: savedGames.join(", ") || t("pwa.none") })}</p>
        </section>
        <section>
          <strong>{t("pwa.storageHeading")}</strong>
          <p>{t("pwa.storageDetail")}</p>
          <button
            type="button"
            disabled={!registration || savedGames.length === 0 || phase !== "ready"}
            onClick={clearGames}
          >
            {phase === "clearing" ? t("pwa.clearing") : t("pwa.clear")}
          </button>
        </section>
        {phase === "registering" ? <p>{t("pwa.registering")}</p> : null}
        {phase === "unsupported" ? <p>{t("pwa.unavailable")}</p> : null}
        {error ? (
          <p className="pwa-drawer__error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </aside>
  );
}
