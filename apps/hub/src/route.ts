import { getGameById, isGameId, type GameCatalogEntry, type GameId } from "./catalog";

export type HubRoute =
  | { readonly kind: "index" }
  | { readonly kind: "game"; readonly game: GameCatalogEntry }
  | {
      readonly kind: "error";
      readonly code: "duplicate-game" | "unknown-game";
      readonly received: readonly string[];
    };

export function parseHubRoute(search: string): HubRoute {
  const params = new URLSearchParams(search);
  const gameValues = params.getAll("game");

  if (gameValues.length === 0) {
    return { kind: "index" };
  }

  if (gameValues.length !== 1) {
    return { kind: "error", code: "duplicate-game", received: gameValues };
  }

  const gameId = gameValues[0];
  if (gameId === undefined || !isGameId(gameId)) {
    return { kind: "error", code: "unknown-game", received: gameValues };
  }

  return { kind: "game", game: getGameById(gameId) };
}

export function gameSearch(id: GameId): string {
  const params = new URLSearchParams({ game: id });
  return `?${params.toString()}`;
}
