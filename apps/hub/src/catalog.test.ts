import { describe, expect, it } from "vite-plus/test";

import { GAME_CATALOG, getGameById, isGameId } from "./catalog";

describe("game catalog", () => {
  it("contains exactly the three curated games with unique ids", () => {
    expect(GAME_CATALOG).toHaveLength(3);
    expect(new Set(GAME_CATALOG.map((game) => game.id)).size).toBe(3);
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
    expect(getGameById("tumbledrum").repositoryUrl).toContain("/TUMBLEDRUM");
  });
});
