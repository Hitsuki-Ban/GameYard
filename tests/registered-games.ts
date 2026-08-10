import { readFile } from "node:fs/promises";

import { GameCatalogSchema } from "@gameyard/game-contract";

import { loadProductionRegistry } from "../tooling/production-registry.mjs";

const registry = await loadProductionRegistry(import.meta.dirname + "/..");
const catalog = GameCatalogSchema.parse(
  JSON.parse(await readFile(new URL("../dist/games/catalog.json", import.meta.url), "utf8")),
);

if (
  catalog.games.length !== registry.games.length ||
  catalog.games.some((game, index) => game.id !== registry.games[index]?.id)
) {
  throw new Error("The built artifact catalog does not exactly match the production registry");
}

export const REGISTERED_GAMES = catalog.games.map((catalogGame, index) => {
  const sourceGame = registry.games[index];
  if (!sourceGame) throw new Error(`Missing registry metadata for artifact game ${catalogGame.id}`);
  const entryPrefix = `./${catalogGame.id}/`;
  if (!catalogGame.entry.startsWith(entryPrefix)) {
    throw new Error(`Artifact catalog entry does not belong to game ${catalogGame.id}`);
  }
  const entry = catalogGame.entry.slice(entryPrefix.length);
  if (entry !== sourceGame.manifest.entry) {
    throw new Error(`Artifact catalog entry does not match source manifest ${catalogGame.id}`);
  }
  return {
    id: catalogGame.id,
    title: sourceGame.presentation.title,
    entry,
    frameUrl: `/games/${catalogGame.entry.slice(2)}`,
  };
});

export const REGISTERED_GAME_IDS = REGISTERED_GAMES.map((game) => game.id);
