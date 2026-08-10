import { loadProductionRegistry } from "../tooling/production-registry.mjs";

const registry = await loadProductionRegistry(import.meta.dirname + "/..");

export const SOURCE_GAME_IDS = registry.games.map((game) => game.id);
