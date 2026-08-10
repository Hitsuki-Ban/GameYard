import { GameManifestSourceSchema } from "@gameyard/game-contract";
import { createGameManifestPlugin } from "@gameyard/manifest-tools";
import { defineConfig } from "vite-plus";

import { createArtifactBuildId } from "../../tooling/artifact-build-id.mjs";
import { getRegisteredGame, loadProductionRegistry } from "../../tooling/production-registry.mjs";
import manifestSourceJson from "./game.manifest.source.json";

const archiveOwnedFiles = [
  "ACCEPTANCE_RESULTS.json",
  "DESIGN_NOTES.md",
  "LEVEL_CONTENT_AUDIT.md",
  "PRESENTATION_SPEC.md",
  "TEST_REPORT.md",
  "VISUAL_PRESENTATION_AUDIT.md",
  "build.py",
  "game.js",
  "index.html",
  "kamifuda-runner-v4-standalone.html",
  "style.css",
];
const buildId = await createArtifactBuildId();
const manifestSource = GameManifestSourceSchema.parse(manifestSourceJson);
const registry = await loadProductionRegistry(new URL("../../", import.meta.url));
const registeredGame = getRegisteredGame(registry, manifestSource.id);
const devBase = `/games/${manifestSource.id}/`;
const devFiles = [
  "game.manifest.json",
  "index.html",
  "src/audio.js",
  "src/haptics.js",
  "src/input.js",
  "src/i18n.ts",
  "src/main.js",
  "src/managed-runtime.js",
  "src/renderer.js",
  "src/runtime-owner.js",
  "src/simulation.js",
  "src/storage.js",
  "src/ui-projection.js",
  "styles.css",
];

export default defineConfig(({ command }) => ({
  root: "guest",
  base: command === "serve" ? devBase : "./",
  publicDir: false,
  define: {
    __GAMEYARD_BUILD__: JSON.stringify(buildId),
    __GAMEYARD_TESTKIT__: "false",
  },
  plugins: [createGameManifestPlugin({ source: manifestSource, buildId, devFiles })],
  build: {
    outDir: registeredGame.stagePath,
    emptyOutDir: true,
  },
  fmt: {
    ignorePatterns: archiveOwnedFiles,
    semi: true,
    singleQuote: false,
  },
  lint: {
    ignorePatterns: archiveOwnedFiles,
  },
  server: {
    host: "127.0.0.1",
    port: registeredGame.devPort,
    strictPort: true,
    hmr: false,
  },
}));
