import { GameManifestSourceSchema } from "@gameyard/game-contract";
import { createGameManifestPlugin } from "@gameyard/manifest-tools";
import { defineConfig } from "vite-plus";

import { createArtifactBuildId } from "../../tooling/artifact-build-id.mjs";
import { getRegisteredGame, loadProductionRegistry } from "../../tooling/production-registry.mjs";
import manifestSourceJson from "./game.manifest.source.json";
import { listNeonGuestDevFiles } from "./build/list-guest-dev-files.mjs";

const archiveOwnedFiles = [
  "boss-preview.png",
  "DESIGN_NOTES.md",
  "game.js",
  "index.html",
  "NEON_OVERDRIVE.html",
  "overdrive-preview.png",
  "preview.png",
  "QA_REPORT.md",
  "README.md",
  "run_local.bat",
  "run_local.sh",
  "styles.css",
];
const buildId = await createArtifactBuildId();
const manifestSource = GameManifestSourceSchema.parse(manifestSourceJson);
const registry = await loadProductionRegistry(new URL("../../", import.meta.url));
const registeredGame = getRegisteredGame(registry, manifestSource.id);
const devFiles = await listNeonGuestDevFiles();
const devBase = `/games/${manifestSource.id}/`;

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
