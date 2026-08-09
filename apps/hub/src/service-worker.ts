/// <reference lib="webworker" />

import { cacheNames, clientsClaim, setCacheNameDetails } from "workbox-core";
import { precacheAndRoute } from "workbox-precaching";

import {
  isCanonicalGameFile,
  type PwaOfflineStatus,
  type PwaRequest,
  type PwaResponse,
} from "./pwa-protocol";

declare const self: ServiceWorkerGlobalScope & {
  readonly __WB_MANIFEST: readonly { readonly url: string; readonly revision?: string | null }[];
};

const BUILD_ID = __GAMEYARD_BUILD__;
const GAME_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const scopePath = new URL(self.registration.scope).pathname;
const scopeKey =
  scopePath === "/"
    ? "root"
    : scopePath
        .replace(/^\/|\/$/gu, "")
        .replace(/[^a-z0-9]+/giu, "-")
        .toLowerCase();
const CACHE_PREFIX = `gameyard-${scopeKey}-`;
const GAME_CACHE_PREFIX = `${CACHE_PREFIX}game-`;
const CURRENT_GAME_CACHE_PREFIX = `${GAME_CACHE_PREFIX}${BUILD_ID}-`;

setCacheNameDetails({ prefix: `${CACHE_PREFIX}hub`, precache: "shell", suffix: BUILD_ID });
precacheAndRoute(self.__WB_MANIFEST, { ignoreURLParametersMatching: [/.*/u] });
clientsClaim();

function gameCacheName(gameId: string): string {
  return `${CURRENT_GAME_CACHE_PREFIX}${gameId}`;
}

function gameIdFromCacheName(cacheName: string): string | null {
  if (!cacheName.startsWith(CURRENT_GAME_CACHE_PREFIX)) return null;
  const gameId = cacheName.slice(CURRENT_GAME_CACHE_PREFIX.length);
  return GAME_ID_PATTERN.test(gameId) ? gameId : null;
}

async function offlineStatus(): Promise<PwaOfflineStatus> {
  const savedGames = (await caches.keys())
    .map(gameIdFromCacheName)
    .filter((gameId): gameId is string => gameId !== null)
    .sort();
  return { buildId: BUILD_ID, savedGames };
}

function success(status: PwaOfflineStatus): PwaResponse {
  return { ok: true, status };
}

function failure(error: unknown): PwaResponse {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

function assertCurrentRequest(request: PwaRequest): void {
  if (request.buildId !== BUILD_ID) {
    throw new Error(`PWA build mismatch: expected ${BUILD_ID}, received ${request.buildId}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function readRequiredJson(
  response: Response,
  label: string,
): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    value = await response.clone().json();
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  return value;
}

async function saveGame(request: Extract<PwaRequest, { type: "gameyard:pwa-save-game" }>) {
  if (typeof request.gameId !== "string" || !GAME_ID_PATTERN.test(request.gameId)) {
    throw new Error("Invalid offline game id");
  }
  if (
    !Array.isArray(request.files) ||
    request.files.length === 0 ||
    !request.files.includes("game.manifest.json") ||
    !request.files.every(isCanonicalGameFile) ||
    new Set(request.files).size !== request.files.length
  ) {
    throw new Error(`Invalid offline file contract for ${request.gameId}`);
  }
  const scope = new URL(self.registration.scope);
  const cachePaths = [
    "games/catalog.json",
    ...request.files.map((file) => `games/${request.gameId}/${file}`),
  ];
  const cacheRequests = [
    new URL("games/catalog.json", scope),
    ...request.files.map((file) => new URL(`games/${request.gameId}/${file}`, scope)),
  ].map((url) => new Request(url, { cache: "reload" }));
  const buildInfoRequest = new Request(new URL("build-info.json", scope), { cache: "reload" });
  const responses = await Promise.all(
    [buildInfoRequest, ...cacheRequests].map(async (resourceRequest) => {
      const response = await fetch(resourceRequest);
      if (!response.ok) {
        throw new Error(
          `Offline resource returned HTTP ${response.status}: ${new URL(resourceRequest.url).pathname}`,
        );
      }
      return response;
    }),
  );
  const buildInfo = await readRequiredJson(responses[0]!, "build-info.json");
  const catalog = await readRequiredJson(responses[1]!, "games/catalog.json");
  const manifestIndex = request.files.indexOf("game.manifest.json");
  const manifest = await readRequiredJson(
    responses[manifestIndex + 2]!,
    `${request.gameId}/game.manifest.json`,
  );
  const artifactFiles = Array.isArray(buildInfo.files) ? buildInfo.files : null;
  if (
    buildInfo.schemaVersion !== 1 ||
    buildInfo.buildId !== BUILD_ID ||
    artifactFiles === null ||
    !cachePaths.every((path) => artifactFiles.includes(path))
  ) {
    throw new Error("Offline download crossed the published artifact boundary");
  }
  const expectedManifest = `./${request.gameId}/game.manifest.json`;
  const expectedEntry =
    typeof manifest.entry === "string" ? `./${request.gameId}/${manifest.entry}` : null;
  const catalogGame = Array.isArray(catalog.games)
    ? catalog.games.find((candidate) => isRecord(candidate) && candidate.id === request.gameId)
    : undefined;
  if (
    catalog.schemaVersion !== 1 ||
    catalog.buildId !== BUILD_ID ||
    !isRecord(catalogGame) ||
    catalogGame.manifest !== expectedManifest ||
    catalogGame.entry !== expectedEntry ||
    manifest.schemaVersion !== 1 ||
    manifest.buildId !== BUILD_ID ||
    manifest.id !== request.gameId ||
    !Array.isArray(manifest.files) ||
    manifest.files.length !== request.files.length ||
    !manifest.files.every((file, index) => file === request.files[index])
  ) {
    throw new Error(`Offline metadata mismatch for ${request.gameId}`);
  }
  const cacheName = gameCacheName(request.gameId);
  try {
    await caches.delete(cacheName);
    const cache = await caches.open(cacheName);
    for (const [index, cacheRequest] of cacheRequests.entries()) {
      await cache.put(cacheRequest, responses[index + 1]!);
    }
  } catch (error) {
    await caches.delete(cacheName);
    throw error;
  }
}

async function clearGameCaches(): Promise<void> {
  const names = await caches.keys();
  await Promise.all(
    names.filter((name) => name.startsWith(GAME_CACHE_PREFIX)).map((name) => caches.delete(name)),
  );
}

async function removeGameCache(
  request: Extract<PwaRequest, { type: "gameyard:pwa-remove-game" }>,
): Promise<void> {
  if (typeof request.gameId !== "string" || !GAME_ID_PATTERN.test(request.gameId)) {
    throw new Error("Invalid offline game id");
  }
  await caches.delete(gameCacheName(request.gameId));
}

function isPwaRequest(value: unknown): value is PwaRequest {
  if (value === null || typeof value !== "object") return false;
  const request = value as Record<string, unknown>;
  return (
    typeof request.buildId === "string" &&
    (request.type === "gameyard:pwa-status" ||
      request.type === "gameyard:pwa-save-game" ||
      request.type === "gameyard:pwa-remove-game" ||
      request.type === "gameyard:pwa-clear-games" ||
      request.type === "gameyard:pwa-activate")
  );
}

self.addEventListener("message", (event: ExtendableMessageEvent) => {
  if (!isPwaRequest(event.data) || event.ports.length !== 1) return;
  const request = event.data;
  const port = event.ports[0]!;
  event.waitUntil(
    (async () => {
      try {
        assertCurrentRequest(request);
        if (request.type === "gameyard:pwa-save-game") await saveGame(request);
        else if (request.type === "gameyard:pwa-remove-game") await removeGameCache(request);
        else if (request.type === "gameyard:pwa-clear-games") await clearGameCaches();
        else if (request.type === "gameyard:pwa-activate") await self.skipWaiting();
        port.postMessage(success(await offlineStatus()));
      } catch (error) {
        port.postMessage(failure(error));
      }
    })(),
  );
});

async function cleanOldGameYardCaches(): Promise<void> {
  const names = await caches.keys();
  await Promise.all(
    names
      .filter(
        (name) =>
          name.startsWith(CACHE_PREFIX) &&
          name !== cacheNames.precache &&
          !name.startsWith(CURRENT_GAME_CACHE_PREFIX),
      )
      .map((name) => caches.delete(name)),
  );
}

self.addEventListener("activate", (event: ExtendableEvent) => {
  event.waitUntil(cleanOldGameYardCaches());
});

function relativeScopePath(url: URL): string | null {
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return null;
  return url.pathname.slice(scope.pathname.length);
}

async function matchSavedGame(request: Request, gameId: string | null): Promise<Response | null> {
  const names = await caches.keys();
  const candidates = gameId ? [gameCacheName(gameId)] : names.filter(gameIdFromCacheName);
  for (const name of candidates) {
    if (!names.includes(name)) continue;
    const response = await caches
      .open(name)
      .then((cache) => cache.match(request, { ignoreVary: true }));
    if (response) return response;
  }
  return null;
}

function unavailableResponse(request: Request, path: string): Response {
  const message = `GameYard offline copy is unavailable for ${path}. Connect and save this game for offline play.`;
  if (request.mode === "navigate") {
    return new Response(
      `<!doctype html><html lang="en"><meta charset="utf-8"><title>Offline game unavailable</title><body><main><h1>Offline game unavailable</h1><p>${message}</p></main></body></html>`,
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
  return new Response(message, {
    status: 503,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

self.addEventListener("fetch", (event: FetchEvent) => {
  if (event.request.method !== "GET") return;
  const path = relativeScopePath(new URL(event.request.url));
  if (path === null) return;
  const gameMatch = /^games\/([a-z0-9]+(?:-[a-z0-9]+)*)\//u.exec(path);
  if (path !== "games/catalog.json" && !gameMatch) return;

  event.respondWith(
    (async () => {
      const cached = await matchSavedGame(event.request, gameMatch?.[1] ?? null);
      if (cached) return cached;
      try {
        const response = await fetch(event.request);
        if (response.ok) return response;
        return response;
      } catch {
        return unavailableResponse(event.request, path);
      }
    })(),
  );
});
