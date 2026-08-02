import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";

import { App } from "./App";
import "./i18n";
import {
  activatePwaUpdate,
  assertPwaWorkerBuild,
  fetchPublishedBuildId,
  registerHubServiceWorker,
  verifyArtifactBuild,
  watchForPwaUpdate,
  type ArtifactCheck,
} from "./pwa";
import "./styles.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("GameYard Hub root element is missing.");
}

interface WaitingRelease {
  readonly worker: ServiceWorker;
  readonly buildId: string;
}

function ArtifactContractStop({
  result,
}: {
  readonly result: Exclude<ArtifactCheck, { kind: "current" }>;
}) {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [waitingRelease, setWaitingRelease] = useState<WaitingRelease | null>(null);
  const [updateState, setUpdateState] = useState<"checking" | "ready" | "applying" | "failed">(
    "checking",
  );
  const [updateError, setUpdateError] = useState<string | null>(null);
  const detail =
    result.kind === "mismatch"
      ? `Expected ${__GAMEYARD_BUILD__}; received ${result.received}.`
      : result.reason;

  useEffect(() => {
    if (result.kind !== "mismatch" || !("serviceWorker" in navigator)) {
      setUpdateState("failed");
      return;
    }
    let cancelled = false;
    let stopWatching: () => void = () => undefined;
    const onControllerChange = () => window.location.reload();
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
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
        setUpdateState("failed");
        setUpdateError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
      stopWatching();
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, [result.kind]);

  const applyUpdate = () => {
    if (!waitingRelease || !registration) return;
    setUpdateState("applying");
    setUpdateError(null);
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
    })().catch((error: unknown) => {
      setUpdateState("failed");
      setUpdateError(error instanceof Error ? error.message : String(error));
    });
  };

  return (
    <main className="artifact-stop" role="alert">
      <span>ARTIFACT / CONTRACT / STOP</span>
      <h1>GameYard update required</h1>
      <p>The loaded Hub shell does not match the currently published atomic artifact.</p>
      <code>{detail}</code>
      {(updateState === "ready" || updateState === "applying") && waitingRelease ? (
        <button type="button" disabled={updateState === "applying"} onClick={applyUpdate}>
          {updateState === "applying" ? "Applying current release…" : "Apply current release"}
        </button>
      ) : null}
      {updateState === "checking" && result.kind === "mismatch" ? (
        <p>Checking the current Service Worker release…</p>
      ) : null}
      {updateError ? <code>{updateError}</code> : null}
      <button type="button" onClick={() => window.location.reload()}>
        Reload current release
      </button>
    </main>
  );
}

const root = createRoot(rootElement);
void verifyArtifactBuild().then((result) => {
  root.render(result.kind === "current" ? <App /> : <ArtifactContractStop result={result} />);
});
