import { describe, expect, it } from "vite-plus/test";

import { GAME_CATALOG, getGameById, isGameId } from "./catalog";

describe("game catalog", () => {
  it("combines the three validated manifest sources with curated presentation", () => {
    expect(GAME_CATALOG).toHaveLength(3);
    expect(new Set(GAME_CATALOG.map((game) => game.id)).size).toBe(3);
    for (const game of GAME_CATALOG) {
      expect(game).toMatchObject({
        id: game.manifestSource.id,
        languages: game.manifestSource.locales.supported,
        repositoryUrl: game.manifestSource.provenance.repository,
      });
    }
    expect(GAME_CATALOG.map((game) => game.displayTitle)).toEqual([
      "TUMBLEDRUM",
      "PULSE LINK // OVERDRIVE",
      "CROWN//BREAKER",
    ]);
  });

  it("marks all three curated games playable through the local runtime", () => {
    for (const id of ["pulse-link-overdrive", "tumbledrum", "crown-breaker"] as const) {
      expect(getGameById(id)).toMatchObject({ status: "playable", runtime: "local" });
      expect(getGameById(id).liveUrl).toBeUndefined();
    }
    expect(
      [...GAME_CATALOG].sort((a, b) => a.migrationOrder - b.migrationOrder).map((game) => game.id),
    ).toEqual(["pulse-link-overdrive", "tumbledrum", "crown-breaker"]);
  });

  it("performs exact id lookup", () => {
    expect(isGameId("crown-breaker")).toBe(true);
    expect(isGameId("CrownBreaker")).toBe(false);
    expect(getGameById("tumbledrum")).toBe(GAME_CATALOG[0]);
  });
});
