export type GameId = "tumbledrum" | "pulse-link-overdrive" | "crown-breaker";
export type MigrationStatus = "queued";
export type PosterKind = "drum" | "pulse" | "crown";

export interface GameCatalogEntry {
  readonly id: GameId;
  readonly displayTitle: string;
  readonly typeKey: string;
  readonly descriptionKey: string;
  readonly languages: readonly ["en", "ja", "zh-Hans"];
  readonly status: MigrationStatus;
  readonly migrationOrder: 1 | 2 | 3;
  readonly repositoryUrl: string;
  readonly liveUrl: string;
  readonly accent: "ultramarine" | "vermilion" | "graphite";
  readonly poster: PosterKind;
}

export const GAME_CATALOG = [
  {
    id: "tumbledrum",
    displayTitle: "TUMBLEDRUM",
    typeKey: "game.tumbledrum.type",
    descriptionKey: "game.tumbledrum.description",
    languages: ["en", "ja", "zh-Hans"],
    status: "queued",
    migrationOrder: 2,
    repositoryUrl: "https://github.com/Hitsuki-Ban/TUMBLEDRUM",
    liveUrl: "https://hitsuki-ban.github.io/TUMBLEDRUM/",
    accent: "vermilion",
    poster: "drum",
  },
  {
    id: "pulse-link-overdrive",
    displayTitle: "PULSE LINK // OVERDRIVE",
    typeKey: "game.pulse.type",
    descriptionKey: "game.pulse.description",
    languages: ["en", "ja", "zh-Hans"],
    status: "queued",
    migrationOrder: 1,
    repositoryUrl: "https://github.com/Hitsuki-Ban/PulseLinkOverdrive",
    liveUrl: "https://hitsuki-ban.github.io/PulseLinkOverdrive/",
    accent: "ultramarine",
    poster: "pulse",
  },
  {
    id: "crown-breaker",
    displayTitle: "CROWN//BREAKER",
    typeKey: "game.crown.type",
    descriptionKey: "game.crown.description",
    languages: ["en", "ja", "zh-Hans"],
    status: "queued",
    migrationOrder: 3,
    repositoryUrl: "https://github.com/Hitsuki-Ban/CrownBreaker",
    liveUrl: "https://hitsuki-ban.github.io/CrownBreaker/",
    accent: "graphite",
    poster: "crown",
  },
] as const satisfies readonly GameCatalogEntry[];

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
