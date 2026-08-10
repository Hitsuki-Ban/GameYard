import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { App } from "./App";
import { applyHubDocumentPresentation } from "./i18n";
import { currentSystemLanguages } from "./locales";
import {
  activatePwaUpdate,
  assertPwaWorkerBuild,
  fetchPublishedBuildId,
  registerHubServiceWorker,
  verifyArtifactBuild,
  watchForPwaUpdate,
  type ArtifactCheck,
} from "./pwa";
import { readSettings, resolveLocale, resolveSystemLocale } from "./settings";
import "./styles.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("GameYard Hub root element is missing.");
}

const bootstrapLanguages = currentSystemLanguages();
const bootstrapSettings = readSettings(
  window.localStorage,
  window.matchMedia("(prefers-reduced-motion: reduce)").matches,
);
const bootstrapLocale =
  bootstrapSettings.kind === "error"
    ? resolveSystemLocale(bootstrapLanguages)
    : resolveLocale(bootstrapSettings.settings.localePreference, bootstrapLanguages);
applyHubDocumentPresentation(bootstrapLocale, { titleKey: "meta.indexTitle" });

interface WaitingRelease {
  readonly worker: ServiceWorker;
  readonly buildId: string;
}

function ArtifactContractStop({
  result,
}: {
  readonly result: Exclude<ArtifactCheck, { kind: "current" }>;
}) {
  const { t } = useTranslation();
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [waitingRelease, setWaitingRelease] = useState<WaitingRelease | null>(null);
  const [updateState, setUpdateState] = useState<"checking" | "ready" | "applying" | "failed">(
    "checking",
  );
  const [updateFailed, setUpdateFailed] = useState(false);
  const detail =
    result.kind === "mismatch"
      ? t("artifact.mismatch", { expected: __GAMEYARD_BUILD__, received: result.received })
      : result.code === "http"
        ? t("artifact.error.http", { status: result.status })
        : t(`artifact.error.${result.code}`);

  useEffect(() => {
    if (result.kind !== "mismatch" || !("serviceWorker" in navigator)) {
      setUpdateState("failed");
      return;
    }
    let cancelled = false;
    let stopWatching: () => void = () => undefined;
    void registerHubServiceWorker()
      .then(async (registration) => {
        if (cancelled) return;
        setRegistration(registration);
        stopWatching = watchForPwaUpdate(registration, (worker) => {
          void fetchPublishedBuildId()
            .then(async (buildId) => {
              await assertPwaWorkerBuild(worker, buildId);
              if (cancelled) return;
              setWaitingRelease({ worker, buildId });
              setUpdateState("ready");
            })
            .catch(() => {
              if (cancelled) return;
              setWaitingRelease(null);
              setUpdateState("checking");
            });
        });
        await registration.update();
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error("GameYard release update check failed", error);
        setUpdateState("failed");
        setUpdateFailed(true);
      });
    return () => {
      cancelled = true;
      stopWatching();
    };
  }, [result.kind]);

  const applyUpdate = () => {
    if (!waitingRelease || !registration) return;
    setUpdateState("applying");
    setUpdateFailed(false);
    void (async () => {
      const publishedBuildId = await fetchPublishedBuildId();
      if (publishedBuildId !== waitingRelease.buildId) {
        setWaitingRelease(null);
        setUpdateState("checking");
        await registration.update();
        return;
      }
      await assertPwaWorkerBuild(waitingRelease.worker, publishedBuildId);
      await activatePwaUpdate(waitingRelease.worker, publishedBuildId);
      window.location.reload();
    })().catch((error: unknown) => {
      console.error("GameYard release activation failed", error);
      setUpdateState("failed");
      setUpdateFailed(true);
    });
  };

  return (
    <main className="artifact-stop" role="alert">
      <span>{t("artifact.eyebrow")}</span>
      <h1>{t("artifact.title")}</h1>
      <p>{t("artifact.body")}</p>
      <code>{detail}</code>
      {(updateState === "ready" || updateState === "applying") && waitingRelease ? (
        <button type="button" disabled={updateState === "applying"} onClick={applyUpdate}>
          {updateState === "applying" ? t("artifact.applying") : t("artifact.apply")}
        </button>
      ) : null}
      {updateState === "checking" && result.kind === "mismatch" ? (
        <p>{t("artifact.checking")}</p>
      ) : null}
      {updateFailed ? <p>{t("artifact.updateError")}</p> : null}
      <button type="button" onClick={() => window.location.reload()}>
        {t("artifact.reload")}
      </button>
    </main>
  );
}

const root = createRoot(rootElement);
void verifyArtifactBuild().then((result) => {
  if (result.kind === "current") {
    root.render(<App />);
    return;
  }
  applyHubDocumentPresentation(bootstrapLocale, { titleKey: "meta.artifactTitle" });
  root.render(<ArtifactContractStop result={result} />);
});
