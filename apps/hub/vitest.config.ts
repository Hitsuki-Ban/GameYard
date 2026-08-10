import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus/test/config";

import { loadProductionRegistry } from "../../tooling/production-registry.mjs";
import { createProductionRegistryVitePlugin } from "../../tooling/production-registry-vite.mjs";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
const productionRegistry = await loadProductionRegistry(projectRoot);

export default defineConfig({
  plugins: [createProductionRegistryVitePlugin(productionRegistry)],
  define: {
    __GAMEYARD_BUILD__: JSON.stringify("hub@test"),
    __GAMEYARD_GAME_IDS__: JSON.stringify(productionRegistry.games.map((game) => game.id)),
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
