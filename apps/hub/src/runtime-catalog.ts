import {
  BuildIdSchema,
  GameCatalogSchema,
  GameManifestSchema,
  type GameCatalog,
  type GameManifest,
  type GameManifestSource,
} from "@gameyard/game-contract";

import { getGameById, isGameId, type GameId } from "./catalog";

export interface RuntimeFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export type RuntimeFetch = (url: string) => Promise<RuntimeFetchResponse>;

export interface PlayableRuntime {
  readonly id: GameId;
  readonly buildId: string;
  readonly entryUrl: string;
  readonly baseUrl: string;
  readonly manifest: GameManifest;
}

const CATALOG_URL = "./games/catalog.json";

export class RuntimeCatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeCatalogError";
  }
}

export function parseRuntimeCatalog(value: unknown, expectedBuildId: string): GameCatalog {
  const expectedBuild = BuildIdSchema.safeParse(expectedBuildId);
  if (!expectedBuild.success) {
    throw new RuntimeCatalogError("Hub build id is invalid");
  }

  const parsedCatalog = GameCatalogSchema.safeParse(value);
  if (!parsedCatalog.success) {
    throw new RuntimeCatalogError("runtime catalog failed schema validation");
  }
  const catalog = parsedCatalog.data;
  if (catalog.buildId !== expectedBuild.data) {
    throw new RuntimeCatalogError(
      `runtime catalog build mismatch: expected ${expectedBuild.data}, received ${catalog.buildId}`,
    );
  }

  for (const [index, game] of catalog.games.entries()) {
    if (!isGameId(game.id)) {
      throw new RuntimeCatalogError(`runtime catalog games[${index}] has unknown game id`);
    }
    const expectedManifestPath = `./${game.id}/game.manifest.json`;
    if (game.manifest !== expectedManifestPath) {
      throw new RuntimeCatalogError(
        `${game.id} manifest path mismatch: expected ${expectedManifestPath}, received ${game.manifest}`,
      );
    }
  }

  return catalog;
}

function manifestSourceOf(manifest: GameManifest): GameManifestSource {
  return {
    schemaVersion: manifest.schemaVersion,
    protocol: manifest.protocol,
    id: manifest.id,
    version: manifest.version,
    entry: manifest.entry,
    locales: manifest.locales,
    capabilities: manifest.capabilities,
    provenance: manifest.provenance,
  };
}

async function fetchJson(fetcher: RuntimeFetch, url: string, label: string): Promise<unknown> {
  let response: RuntimeFetchResponse;
  try {
    response = await fetcher(url);
  } catch (error) {
    throw new RuntimeCatalogError(
      `${label} request failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!response.ok) {
    throw new RuntimeCatalogError(`${label} request failed with HTTP ${response.status}`);
  }
  try {
    return await response.json();
  } catch (error) {
    throw new RuntimeCatalogError(
      `${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function loadGameRuntime(
  fetcher: RuntimeFetch,
  expectedBuildId: string,
  gameId: GameId,
): Promise<PlayableRuntime> {
  const catalog = parseRuntimeCatalog(
    await fetchJson(fetcher, CATALOG_URL, "runtime catalog"),
    expectedBuildId,
  );
  const game = catalog.games.find((candidate) => candidate.id === gameId);
  if (!game) {
    throw new RuntimeCatalogError(`runtime catalog is missing required game: ${gameId}`);
  }

  const manifestUrl = `./games/${game.manifest.slice(2)}`;
  const parsedManifest = GameManifestSchema.safeParse(
    await fetchJson(fetcher, manifestUrl, `${gameId} manifest`),
  );
  if (!parsedManifest.success) {
    throw new RuntimeCatalogError(`${gameId} manifest failed schema validation`);
  }
  const manifest = parsedManifest.data;
  if (manifest.id !== gameId) {
    throw new RuntimeCatalogError(`${gameId} manifest id mismatch: received ${manifest.id}`);
  }
  if (
    JSON.stringify(manifestSourceOf(manifest)) !==
    JSON.stringify(getGameById(gameId).manifestSource)
  ) {
    throw new RuntimeCatalogError(`${gameId} manifest source does not match the Hub catalog`);
  }
  if (manifest.buildId !== catalog.buildId) {
    throw new RuntimeCatalogError(
      `${gameId} manifest build mismatch: expected ${catalog.buildId}, received ${manifest.buildId}`,
    );
  }

  const catalogEntry = `./${gameId}/${manifest.entry}`;
  if (game.entry !== catalogEntry) {
    throw new RuntimeCatalogError(
      `${gameId} entry mismatch: expected ${catalogEntry}, received ${game.entry}`,
    );
  }

  return {
    id: gameId,
    buildId: catalog.buildId,
    entryUrl: `./games/${gameId}/${manifest.entry}`,
    baseUrl: `./games/${gameId}/`,
    manifest,
  };
}
