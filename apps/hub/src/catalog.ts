import {
  GameManifestSourceSchema,
  type GameId,
  type GameManifestSource,
  type ResolvedLocale,
} from "@gameyard/game-contract";

import crownBreakerSource from "../../../games/crown-breaker/game.manifest.source.json";
import pulseLinkOverdriveSource from "../../../games/pulse-link-overdrive/game.manifest.source.json";
import tumbledrumSource from "../../../games/tumbledrum/game.manifest.source.json";

export type { GameId };
export type MigrationStatus = "playable" | "queued";
export type PosterKind = "drum" | "pulse" | "crown";

export interface GameCatalogEntry {
  readonly id: GameId;
  readonly manifestSource: GameManifestSource;
  readonly displayTitle: string;
  readonly typeKey: string;
  readonly descriptionKey: string;
  readonly languages: readonly ResolvedLocale[];
  readonly status: MigrationStatus;
  readonly migrationOrder: 1 | 2 | 3;
  readonly repositoryUrl: string;
  readonly liveUrl?: string;
  readonly runtime?: "local";
  readonly accent: "ultramarine" | "vermilion" | "graphite";
  readonly poster: PosterKind;
}

interface GamePresentation {
  readonly displayTitle: string;
  readonly typeKey: string;
  readonly descriptionKey: string;
  readonly status: MigrationStatus;
  readonly migrationOrder: 1 | 2 | 3;
  readonly liveUrl?: string;
  readonly runtime: "local";
  readonly accent: "ultramarine" | "vermilion" | "graphite";
  readonly poster: PosterKind;
}

const catalogDefinitions: readonly {
  readonly source: unknown;
  readonly presentation: GamePresentation;
}[] = [
  {
    source: tumbledrumSource,
    presentation: {
      displayTitle: "TUMBLEDRUM",
      typeKey: "game.tumbledrum.type",
      descriptionKey: "game.tumbledrum.description",
      status: "playable",
      migrationOrder: 2,
      runtime: "local",
      accent: "vermilion",
      poster: "drum",
    },
  },
  {
    source: pulseLinkOverdriveSource,
    presentation: {
      displayTitle: "PULSE LINK // OVERDRIVE",
      typeKey: "game.pulse.type",
      descriptionKey: "game.pulse.description",
      status: "playable",
      migrationOrder: 1,
      runtime: "local",
      accent: "ultramarine",
      poster: "pulse",
    },
  },
  {
    source: crownBreakerSource,
    presentation: {
      displayTitle: "CROWN//BREAKER",
      typeKey: "game.crown.type",
      descriptionKey: "game.crown.description",
      status: "playable",
      migrationOrder: 3,
      runtime: "local",
      accent: "graphite",
      poster: "crown",
    },
  },
] as const;

export const GAME_CATALOG: readonly GameCatalogEntry[] = catalogDefinitions.map(
  ({ source: sourceJson, presentation }) => {
    const manifestSource = GameManifestSourceSchema.parse(sourceJson);
    return {
      ...presentation,
      id: manifestSource.id,
      manifestSource,
      languages: manifestSource.locales.supported,
      repositoryUrl: manifestSource.provenance.repository,
    };
  },
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
