import { describe, expect, it } from "vite-plus/test";

import { GAME_CATALOG, getGameById, isGameId } from "./catalog";

function firstGame() {
  const game = GAME_CATALOG[0];
  if (!game) throw new Error("The production catalog must contain at least one game");
  return game;
}

describe("game catalog", () => {
  it("projects every validated registry entry into the Hub catalog", () => {
    expect(GAME_CATALOG.length).toBeGreaterThan(0);
    expect(new Set(GAME_CATALOG.map((game) => game.id)).size).toBe(GAME_CATALOG.length);
    expect(GAME_CATALOG.map((game) => game.order)).toEqual(
      GAME_CATALOG.map((_, index) => index + 1),
    );
    for (const game of GAME_CATALOG) {
      expect(game.id).toBe(game.manifestSource.id);
      expect(game.languages).toEqual(game.manifestSource.locales.supported);
      expect(game.title).not.toBe("");
      expect(Object.values(game.taglines).every((tagline) => tagline.length > 0)).toBe(true);
      expect(game.cover.candidates.length).toBeGreaterThan(0);
      expect(game.cover.candidates.every((candidate) => candidate.url.length > 0)).toBe(true);
    }
  });

  it("performs exact id lookup for registry-derived ids", () => {
    const game = firstGame();
    expect(isGameId(game.id)).toBe(true);
    expect(isGameId(game.id.toUpperCase())).toBe(false);
    expect(getGameById(game.id)).toBe(game);
  });
});
