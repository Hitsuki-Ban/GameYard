import { GameManifestSourceSchema } from "@gameyard/game-contract";
import { createGameManifestPlugin } from "@gameyard/manifest-tools";
import { defineConfig } from "vite-plus";

import { createArtifactBuildId } from "../../tooling/artifact-build-id.mjs";
import { getRegisteredGame, loadProductionRegistry } from "../../tooling/production-registry.mjs";
import manifestSourceJson from "./game.manifest.source.json";

const buildId = await createArtifactBuildId();
const manifestSource = GameManifestSourceSchema.parse(manifestSourceJson);
const registry = await loadProductionRegistry(new URL("../../", import.meta.url));
const registeredGame = getRegisteredGame(registry, manifestSource.id);
const devBase = `/games/${manifestSource.id}/`;
const devFiles = [
  "game.manifest.json",
  "index.html",
  "src/audio.js",
  "src/content.js",
  "src/game.js",
  "src/i18n.js",
  "src/main.js",
  "styles.css",
];

export default defineConfig(({ command }) => ({
  base: command === "serve" ? devBase : "./",
  publicDir: false,
  define: {
    __GAMEYARD_BUILD__: JSON.stringify(buildId),
  },
  plugins: [createGameManifestPlugin({ source: manifestSource, buildId, devFiles })],
  build: {
    outDir: registeredGame.stagePath,
    emptyOutDir: true,
  },
  server: {
    host: "127.0.0.1",
    port: registeredGame.devPort,
    strictPort: true,
    hmr: false,
  },
}));
