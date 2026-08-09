import { loadProductionRegistry } from "../tooling/production-registry.mjs";

const registry = await loadProductionRegistry(import.meta.dirname + "/..");

export const REGISTERED_GAMES = registry.games.map((game) => ({
  id: game.id,
  title: game.presentation.title,
  entry: game.manifest.entry,
  frameUrl: `/games/${game.id}/${game.manifest.entry}`,
}));

export const REGISTERED_GAME_IDS = REGISTERED_GAMES.map((game) => game.id);
