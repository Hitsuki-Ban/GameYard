import { readFile } from "node:fs/promises";
import path from "node:path";
import { GameManifestSourceSchema } from "@gameyard/game-contract";
import { createGameManifestPlugin } from "@gameyard/manifest-tools";
import { defineConfig } from "vite-plus";

import { createArtifactBuildId } from "../../tooling/artifact-build-id.mjs";
import manifestSourceJson from "./game.manifest.source.json";

const projectRoot = import.meta.dirname;
const buildId = await createArtifactBuildId();
const manifestSource = GameManifestSourceSchema.parse(manifestSourceJson);
const hostSource = (
  await readFile(path.join(projectRoot, "tests/testkit/host.js"), "utf8")
).replaceAll("__GAMEYARD_TESTKIT_BUILD__", buildId);
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

export default defineConfig({
  root: "guest",
  base: "./",
  publicDir: false,
  define: {
    __GAMEYARD_BUILD__: JSON.stringify(buildId),
    __GAMEYARD_TESTKIT__: "true",
  },
  plugins: [
    createGameManifestPlugin({ source: manifestSource, buildId, devFiles }),
    {
      name: "kamifuda-testkit-self-host",
      transformIndexHtml() {
        return [{ tag: "script", children: hostSource, injectTo: "head-prepend" }];
      },
    },
  ],
  build: {
    outDir: "../../../.gameyard/testkit/games/kamifuda-runner",
    emptyOutDir: true,
  },
  server: {
    host: "127.0.0.1",
    port: 5191,
    strictPort: true,
    hmr: false,
  },
});
