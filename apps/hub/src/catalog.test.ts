import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vite-plus/test";

import { BrowseCatalog, catalogCoverPolicy } from "./BrowseCatalog";
import { GAME_CATALOG, getGameById, isGameId, type GameCatalogEntry, type GameId } from "./catalog";
import { i18n } from "./i18n";
import { PUBLIC_LOCALES } from "./locales";

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
      expect(game.languages).toEqual(PUBLIC_LOCALES);
      expect(game.title).not.toBe("");
      expect(Object.keys(game.taglines)).toEqual(PUBLIC_LOCALES);
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

  it("renders 30- and 100-entry collections in source order without runtime markup", () => {
    const template = firstGame();

    for (const count of [30, 100]) {
      const games: readonly GameCatalogEntry[] = Array.from({ length: count }, (_, index) => {
        const id = `fixture-game-${String(index + 1).padStart(3, "0")}` as GameId;
        return {
          ...template,
          id,
          order: index + 1,
          manifestSource: { ...template.manifestSource, id },
          title: `Fixture game ${index + 1}`,
        };
      });
      const markup = renderToStaticMarkup(
        createElement(
          I18nextProvider,
          { i18n },
          createElement(BrowseCatalog, { games, locale: "en", onSelect: () => undefined }),
        ),
      );

      expect(markup.match(/class="catalog-card__link"/g)).toHaveLength(count);
      expect(markup).not.toMatch(/<(?:iframe|script)\b/u);
      let previousOffset = -1;
      for (const game of games) {
        const offset = markup.indexOf(`?game=${game.id}`);
        expect(offset).toBeGreaterThan(previousOffset);
        previousOffset = offset;
      }
      expect(games.map((_, index) => catalogCoverPolicy(index))).toEqual([
        { loading: "eager", fetchPriority: "high" },
        { loading: "eager", fetchPriority: "auto" },
        { loading: "eager", fetchPriority: "auto" },
        { loading: "eager", fetchPriority: "auto" },
        ...Array.from({ length: count - 4 }, () => ({
          loading: "lazy" as const,
          fetchPriority: "auto" as const,
        })),
      ]);
    }
  });
});
