import { GameManifestSourceSchema } from "@gameyard/game-contract";
import { createGameManifestPlugin } from "@gameyard/manifest-tools";
import { defineConfig } from "vite-plus";

import { createArtifactBuildId } from "../../tooling/artifact-build-id.mjs";
import manifestSourceJson from "./game.manifest.source.json";

const buildId = await createArtifactBuildId();
const manifestSource = GameManifestSourceSchema.parse(manifestSourceJson);
const devBase = `/games/${manifestSource.id}/`;
const devFiles = [
  "assets/icon.svg",
  "game.manifest.json",
  "index.html",
  "src/app.js",
  "src/audio.js",
  "src/config.js",
  "src/i18n.js",
  "src/input.js",
  "src/model.js",
  "src/render.js",
  "styles.css",
];

export default defineConfig(({ command }) => ({
  base: command === "serve" ? devBase : "./",
  define: {
    __GAMEYARD_BUILD__: JSON.stringify(buildId),
  },
  plugins: [createGameManifestPlugin({ source: manifestSource, buildId, devFiles })],
  build: {
    outDir: "../../.gameyard/stage/games/pulse-link-overdrive",
    emptyOutDir: true,
  },
  server: {
    hmr: false,
  },
}));
