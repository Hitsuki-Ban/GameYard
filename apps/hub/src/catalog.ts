import type {
  GameId,
  GameManifestSource,
  GamePresentation,
  ResolvedLocale,
} from "@gameyard/game-contract";
import { GAMEYARD_CATALOG } from "virtual:gameyard/catalog";

export type { GameId };

export interface GameCatalogEntry {
  readonly id: GameId;
  readonly order: number;
  readonly manifestSource: GameManifestSource;
  readonly title: string;
  readonly taglines: Readonly<Record<ResolvedLocale, string>>;
  readonly languages: readonly ResolvedLocale[];
  readonly accent: string;
  readonly cover: GamePresentation["cover"];
  readonly stage: GamePresentation["stage"];
}

export const GAME_CATALOG: readonly GameCatalogEntry[] = GAMEYARD_CATALOG.map(
  ({ order, manifest, presentation }) => ({
    id: manifest.id,
    order,
    manifestSource: manifest,
    title: presentation.title,
    taglines: presentation.taglines,
    languages: manifest.locales.supported,
    accent: presentation.accent,
    cover: presentation.cover,
    stage: presentation.stage,
  }),
);

const CATALOG_BY_ID = new Map<GameId, GameCatalogEntry>(
  GAME_CATALOG.map((game) => [game.id, game]),
);

export function isGameId(value: string): value is GameId {
  return CATALOG_BY_ID.has(value as GameId);
}

export function getGameById(id: GameId): GameCatalogEntry {
  const game = CATALOG_BY_ID.get(id);
  if (!game) {
    throw new Error(`Catalog invariant failed for game id: ${id}`);
  }
  return game;
}
