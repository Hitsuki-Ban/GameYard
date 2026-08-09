import type { GameId } from "@gameyard/game-contract";

import { loadGameRuntime } from "./runtime-catalog";
import {
  isPwaResponse,
  PWA_MESSAGE_TIMEOUT_MS,
  type PwaOfflineStatus,
  type PwaRequest,
} from "./pwa-protocol";

export type ArtifactCheck =
  | { readonly kind: "current"; readonly source: "network" | "service-worker" }
  | { readonly kind: "mismatch"; readonly received: string }
  | { readonly kind: "unavailable"; readonly reason: string };

function validBuildInfo(
  value: unknown,
): value is { readonly schemaVersion: 1; readonly buildId: string } {
  if (value === null || typeof value !== "object") return false;
  const buildInfo = value as Record<string, unknown>;
  return buildInfo.schemaVersion === 1 && typeof buildInfo.buildId === "string";
}

async function sendRequest(
  worker: ServiceWorker,
  request: PwaRequest,
  expectedBuildId = __GAMEYARD_BUILD__,
): Promise<PwaOfflineStatus> {
  const channel = new MessageChannel();
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error(`PWA request timed out after ${PWA_MESSAGE_TIMEOUT_MS}ms`)),
      PWA_MESSAGE_TIMEOUT_MS,
    );
    channel.port1.onmessage = (event: MessageEvent<unknown>) => {
      window.clearTimeout(timer);
      channel.port1.close();
      if (!isPwaResponse(event.data)) {
        reject(new Error("PWA worker returned an invalid response"));
      } else if (!event.data.ok) {
        reject(new Error(event.data.error));
      } else if (event.data.status.buildId !== expectedBuildId) {
        reject(
          new Error(
            `PWA worker build mismatch: expected ${expectedBuildId}, received ${event.data.status.buildId}`,
          ),
        );
      } else {
        resolve(event.data.status);
      }
    };
    worker.postMessage(request, [channel.port2]);
  });
}

function registrationWorker(registration: ServiceWorkerRegistration): ServiceWorker {
  const worker = registration.active ?? navigator.serviceWorker.controller;
  if (!worker) throw new Error("The GameYard Service Worker is not active yet");
  return worker;
}

export async function verifyArtifactBuild(): Promise<ArtifactCheck> {
  if (import.meta.env.DEV) return { kind: "current", source: "network" };
  let response: Response;
  try {
    response = await fetch(new URL("build-info.json", document.baseURI), {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    const controller = "serviceWorker" in navigator ? navigator.serviceWorker.controller : null;
    if (controller) {
      try {
        await sendRequest(controller, {
          type: "gameyard:pwa-status",
          buildId: __GAMEYARD_BUILD__,
        });
        return { kind: "current", source: "service-worker" };
      } catch (workerError) {
        return {
          kind: "unavailable",
          reason: workerError instanceof Error ? workerError.message : String(workerError),
        };
      }
    }
    return {
      kind: "unavailable",
      reason: error instanceof Error ? error.message : String(error),
    };
  }
  if (!response.ok) {
    return { kind: "unavailable", reason: `build-info.json returned HTTP ${response.status}` };
  }
  let value: unknown;
  try {
    value = await response.json();
  } catch (error) {
    return {
      kind: "unavailable",
      reason: `build-info.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  if (!validBuildInfo(value)) {
    return { kind: "unavailable", reason: "build-info.json violates its required schema" };
  }
  if (value.buildId !== __GAMEYARD_BUILD__) {
    return { kind: "mismatch", received: value.buildId };
  }
  return { kind: "current", source: "network" };
}

export async function registerHubServiceWorker(): Promise<ServiceWorkerRegistration> {
  if (!("serviceWorker" in navigator)) throw new Error("Service Workers are not supported");
  const scope = new URL("./", document.baseURI);
  const script = new URL("service-worker.js", scope);
  const registration = await navigator.serviceWorker.register(script, {
    scope: scope.href,
    updateViaCache: "none",
  });
  await navigator.serviceWorker.ready;
  return registration;
}

export function watchForPwaUpdate(
  registration: ServiceWorkerRegistration,
  onWaiting: (worker: ServiceWorker) => void,
): () => void {
  const observeInstalling = () => {
    const installing = registration.installing;
    if (!installing) return;
    const onStateChange = () => {
      if (installing.state === "installed" && navigator.serviceWorker.controller) {
        onWaiting(registration.waiting ?? installing);
      }
    };
    installing.addEventListener("statechange", onStateChange);
  };
  const onUpdateFound = () => observeInstalling();
  registration.addEventListener("updatefound", onUpdateFound);
  if (registration.waiting) onWaiting(registration.waiting);
  observeInstalling();
  return () => registration.removeEventListener("updatefound", onUpdateFound);
}

export async function fetchPublishedBuildId(): Promise<string> {
  const response = await fetch(new URL("build-info.json", document.baseURI), {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`build-info.json returned HTTP ${response.status}`);
  const value: unknown = await response.json();
  if (!validBuildInfo(value)) throw new Error("build-info.json violates its required schema");
  return value.buildId;
}

export async function assertPwaWorkerBuild(
  worker: ServiceWorker,
  expectedBuildId: string,
): Promise<void> {
  await sendRequest(
    worker,
    { type: "gameyard:pwa-status", buildId: expectedBuildId },
    expectedBuildId,
  );
}

export async function queryPwaStatus(
  registration: ServiceWorkerRegistration,
): Promise<PwaOfflineStatus> {
  return sendRequest(registrationWorker(registration), {
    type: "gameyard:pwa-status",
    buildId: __GAMEYARD_BUILD__,
  });
}

export async function saveGameOffline(
  registration: ServiceWorkerRegistration,
  gameId: GameId,
): Promise<PwaOfflineStatus> {
  const runtime = await loadGameRuntime(window.fetch.bind(window), __GAMEYARD_BUILD__, gameId);
  return sendRequest(registrationWorker(registration), {
    type: "gameyard:pwa-save-game",
    buildId: __GAMEYARD_BUILD__,
    gameId,
    files: runtime.manifest.files,
  });
}

export async function clearOfflineGames(
  registration: ServiceWorkerRegistration,
): Promise<PwaOfflineStatus> {
  return sendRequest(registrationWorker(registration), {
    type: "gameyard:pwa-clear-games",
    buildId: __GAMEYARD_BUILD__,
  });
}

export async function removeGameOffline(
  registration: ServiceWorkerRegistration,
  gameId: string,
): Promise<PwaOfflineStatus> {
  return sendRequest(registrationWorker(registration), {
    type: "gameyard:pwa-remove-game",
    buildId: __GAMEYARD_BUILD__,
    gameId,
  });
}

export async function activatePwaUpdate(
  worker: ServiceWorker,
  expectedBuildId: string,
): Promise<void> {
  await sendRequest(
    worker,
    { type: "gameyard:pwa-activate", buildId: expectedBuildId },
    expectedBuildId,
  );
}
