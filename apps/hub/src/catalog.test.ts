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

  it("keeps every game queued and migration order explicit", () => {
    expect(GAME_CATALOG.every((game) => game.status === "queued")).toBe(true);
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
