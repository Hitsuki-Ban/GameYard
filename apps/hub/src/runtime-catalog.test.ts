import { describe, expect, it, vi } from "vite-plus/test";

import type { GameId } from "./catalog";
import { loadGameRuntime, parseRuntimeCatalog, type RuntimeFetch } from "./runtime-catalog";

const BUILD_ID = "gameyard@0123456789abcdef";

const playableGameIds = ["pulse-link-overdrive", "tumbledrum"] as const satisfies readonly GameId[];

const catalog = {
  schemaVersion: 1,
  buildId: BUILD_ID,
  games: playableGameIds.map((id) => ({
    id,
    entry: `./${id}/index.html`,
    manifest: `./${id}/game.manifest.json`,
  })),
};

function manifest(id: GameId) {
  return {
    schemaVersion: 1,
    protocol: 1,
    id,
    version: "1.0.0",
    buildId: BUILD_ID,
    entry: "index.html",
    locales: { source: "en", supported: ["en", "ja", "zh-Hans"] },
    capabilities: [],
    provenance: {
      repository: `https://github.com/Hitsuki-Ban/${id}`,
      revision: "0123456789abcdef0123456789abcdef01234567",
      license: "MIT",
    },
    files: ["index.html", "game.manifest.json"],
  };
}

function response(value: unknown) {
  return { ok: true, status: 200, json: async () => value };
}

describe("runtime catalog", () => {
  it("rejects extra fields and build mismatches", () => {
    expect(() => parseRuntimeCatalog({ ...catalog, unexpected: true }, BUILD_ID)).toThrow(
      /exactly/,
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

  it("loads and normalizes both playable runtimes by game id", async () => {
    for (const gameId of playableGameIds) {
      const fetcher = vi
        .fn<RuntimeFetch>()
        .mockResolvedValueOnce(response(catalog))
        .mockResolvedValueOnce(response(manifest(gameId)));

      await expect(loadGameRuntime(fetcher, BUILD_ID, gameId)).resolves.toMatchObject({
        id: gameId,
        buildId: BUILD_ID,
        entryUrl: `./games/${gameId}/index.html`,
        baseUrl: `./games/${gameId}/`,
      });
      expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
        "./games/catalog.json",
        `./games/${gameId}/game.manifest.json`,
      ]);
    }
  });

  it("fails when the selected manifest does not agree with its catalog identity", async () => {
    const gameId = "tumbledrum";
    const disagreements = [
      {
        value: {
          ...manifest(gameId),
          entry: "other.html",
          files: ["other.html", "game.manifest.json"],
        },
        error: /entry mismatch/,
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
