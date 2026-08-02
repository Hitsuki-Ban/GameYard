import { describe, expect, it, vi } from "vite-plus/test";

import { getGameById, type GameId } from "./catalog";
import { loadGameRuntime, parseRuntimeCatalog, type RuntimeFetch } from "./runtime-catalog";

const BUILD_ID = "gameyard@0123456789abcdef";

const playableGameIds = [
  "pulse-link-overdrive",
  "tumbledrum",
  "crown-breaker",
] as const satisfies readonly GameId[];

const catalog = {
  schemaVersion: 1,
  buildId: BUILD_ID,
  games: playableGameIds.map((id) => ({
    id,
    entry: `./${id}/${getGameById(id).manifestSource.entry}`,
    manifest: `./${id}/game.manifest.json`,
  })),
};

function manifest(id: GameId) {
  const source = getGameById(id).manifestSource;
  return {
    ...source,
    buildId: BUILD_ID,
    files: [source.entry, "game.manifest.json"],
  };
}

function response(value: unknown) {
  return { ok: true, status: 200, json: async () => value };
}

describe("runtime catalog", () => {
  it("rejects extra fields and build mismatches", () => {
    expect(() => parseRuntimeCatalog({ ...catalog, unexpected: true }, BUILD_ID)).toThrow(
      /schema validation/,
    );
    expect(() => parseRuntimeCatalog(catalog, "gameyard@fedcba9876543210")).toThrow(
      /build mismatch/,
    );
    expect(() =>
      parseRuntimeCatalog(
        { ...catalog, games: [{ ...catalog.games[0]!, id: "unknown-game" }] },
        BUILD_ID,
      ),
    ).toThrow(/unknown game id/);
  });

  it("loads and normalizes all three playable runtimes by game id", async () => {
    for (const gameId of playableGameIds) {
      const fetcher = vi
        .fn<RuntimeFetch>()
        .mockResolvedValueOnce(response(catalog))
        .mockResolvedValueOnce(response(manifest(gameId)));

      await expect(loadGameRuntime(fetcher, BUILD_ID, gameId)).resolves.toMatchObject({
        id: gameId,
        buildId: BUILD_ID,
        entryUrl: `./games/${gameId}/${getGameById(gameId).manifestSource.entry}`,
        baseUrl: `./games/${gameId}/`,
      });
      expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
        "./games/catalog.json",
        `./games/${gameId}/game.manifest.json`,
      ]);
    }
  });

  it("fails when the selected manifest does not agree with its catalog identity", async () => {
    const gameId = "crown-breaker";
    const disagreements = [
      {
        value: {
          ...manifest(gameId),
          entry: "other.html",
          files: ["other.html", "game.manifest.json"],
        },
        error: /source does not match/,
      },
      { value: { ...manifest(gameId), id: "pulse-link-overdrive" }, error: /id mismatch/ },
      {
        value: { ...manifest(gameId), buildId: "gameyard@fedcba9876543210" },
        error: /build mismatch/,
      },
    ] as const;

    for (const disagreement of disagreements) {
      const fetcher = vi
        .fn<RuntimeFetch>()
        .mockResolvedValueOnce(response(catalog))
        .mockResolvedValueOnce(response(disagreement.value));
      await expect(loadGameRuntime(fetcher, BUILD_ID, gameId)).rejects.toThrow(disagreement.error);
    }
  });
});
