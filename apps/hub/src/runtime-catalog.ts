import { BuildIdSchema, GameManifestSchema, type GameManifest } from "@gameyard/game-contract";

export interface RuntimeFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export type RuntimeFetch = (url: string) => Promise<RuntimeFetchResponse>;

interface RuntimeCatalogGame {
  readonly id: string;
  readonly entry: string;
  readonly manifest: string;
}

interface RuntimeCatalog {
  readonly schemaVersion: 1;
  readonly buildId: string;
  readonly games: readonly RuntimeCatalogGame[];
}

export interface PlayableRuntime {
  readonly id: "pulse-link-overdrive";
  readonly buildId: string;
  readonly entryUrl: string;
  readonly baseUrl: string;
  readonly manifest: GameManifest;
}

const PULSE_ID = "pulse-link-overdrive" as const;
const CATALOG_URL = "./games/catalog.json";

export class RuntimeCatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeCatalogError";
  }
}

function assertExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
  location: string,
): void {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new RuntimeCatalogError(`${location} must contain exactly: ${expectedKeys.join(", ")}`);
  }
}

function asObject(value: unknown, location: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new RuntimeCatalogError(`${location} must be an object`);
  }
  return value as Record<string, unknown>;
}

export function parseRuntimeCatalog(value: unknown, expectedBuildId: string): RuntimeCatalog {
  const expectedBuild = BuildIdSchema.safeParse(expectedBuildId);
  if (!expectedBuild.success) {
    throw new RuntimeCatalogError("Hub build id is invalid");
  }

  const root = asObject(value, "runtime catalog");
  assertExactKeys(root, ["schemaVersion", "buildId", "games"], "runtime catalog");
  if (root.schemaVersion !== 1) {
    throw new RuntimeCatalogError("runtime catalog schemaVersion must be 1");
  }
  if (root.buildId !== expectedBuild.data) {
    throw new RuntimeCatalogError(
      `runtime catalog build mismatch: expected ${expectedBuild.data}, received ${String(root.buildId)}`,
    );
  }
  if (!Array.isArray(root.games)) {
    throw new RuntimeCatalogError("runtime catalog games must be an array");
  }

  const ids = new Set<string>();
  const games = root.games.map((candidate, index) => {
    const game = asObject(candidate, `runtime catalog games[${index}]`);
    assertExactKeys(game, ["id", "entry", "manifest"], `runtime catalog games[${index}]`);
    if (
      typeof game.id !== "string" ||
      typeof game.entry !== "string" ||
      typeof game.manifest !== "string"
    ) {
      throw new RuntimeCatalogError(`runtime catalog games[${index}] fields must be strings`);
    }
    if (ids.has(game.id)) {
      throw new RuntimeCatalogError(`runtime catalog contains duplicate game id: ${game.id}`);
    }
    ids.add(game.id);
    return { id: game.id, entry: game.entry, manifest: game.manifest };
  });

  return { schemaVersion: 1, buildId: expectedBuild.data, games };
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

export async function loadPulseRuntime(
  fetcher: RuntimeFetch,
  expectedBuildId: string,
): Promise<PlayableRuntime> {
  const catalog = parseRuntimeCatalog(
    await fetchJson(fetcher, CATALOG_URL, "runtime catalog"),
    expectedBuildId,
  );
  const pulse = catalog.games.find((game) => game.id === PULSE_ID);
  if (!pulse) {
    throw new RuntimeCatalogError(`runtime catalog is missing required game: ${PULSE_ID}`);
  }

  const expectedManifestPath = `./${PULSE_ID}/game.manifest.json`;
  if (pulse.manifest !== expectedManifestPath) {
    throw new RuntimeCatalogError(
      `${PULSE_ID} manifest path mismatch: expected ${expectedManifestPath}, received ${pulse.manifest}`,
    );
  }

  const manifestUrl = `./games/${pulse.manifest.slice(2)}`;
  const parsedManifest = GameManifestSchema.safeParse(
    await fetchJson(fetcher, manifestUrl, `${PULSE_ID} manifest`),
  );
  if (!parsedManifest.success) {
    throw new RuntimeCatalogError(`${PULSE_ID} manifest failed schema validation`);
  }
  const manifest = parsedManifest.data;
  if (manifest.id !== PULSE_ID) {
    throw new RuntimeCatalogError(`${PULSE_ID} manifest id mismatch: received ${manifest.id}`);
  }
  if (manifest.buildId !== catalog.buildId) {
    throw new RuntimeCatalogError(
      `${PULSE_ID} manifest build mismatch: expected ${catalog.buildId}, received ${manifest.buildId}`,
    );
  }

  const catalogEntry = `./${PULSE_ID}/${manifest.entry}`;
  if (pulse.entry !== catalogEntry) {
    throw new RuntimeCatalogError(
      `${PULSE_ID} entry mismatch: expected ${catalogEntry}, received ${pulse.entry}`,
    );
  }

  return {
    id: PULSE_ID,
    buildId: catalog.buildId,
    entryUrl: `./games/${PULSE_ID}/${manifest.entry}`,
    baseUrl: `./games/${PULSE_ID}/`,
    manifest,
  };
}
