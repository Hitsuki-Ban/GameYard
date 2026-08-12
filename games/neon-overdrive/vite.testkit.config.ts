import { readFile } from "node:fs/promises";
import path from "node:path";

import { GameManifestSourceSchema } from "@gameyard/game-contract";
import { createGameManifestPlugin } from "@gameyard/manifest-tools";
import { defineConfig } from "vite-plus";

import { createArtifactBuildId } from "../../tooling/artifact-build-id.mjs";
import manifestSourceJson from "./game.manifest.source.json";
import { listNeonGuestDevFiles } from "./build/list-guest-dev-files.mjs";

const buildId = await createArtifactBuildId();
const manifestSource = GameManifestSourceSchema.parse(manifestSourceJson);
const devFiles = await listNeonGuestDevFiles();
const hostTemplate = await readFile(
  path.join(import.meta.dirname, "tests/testkit/host.js"),
  "utf8",
);
const buildToken = "__GAMEYARD_TESTKIT_BUILD__";
if (hostTemplate.split(buildToken).length !== 2) {
  throw new Error(`Neon testkit Host must contain exactly one ${buildToken} token.`);
}
const hostSource = hostTemplate.replace(buildToken, buildId);

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
      name: "neon-overdrive-testkit-self-host",
      transformIndexHtml() {
        return [{ tag: "script", children: hostSource, injectTo: "head-prepend" }];
      },
    },
  ],
  build: {
    outDir: "../../../.gameyard/testkit/games/neon-overdrive",
    emptyOutDir: true,
  },
  server: {
    host: "127.0.0.1",
    port: 5194,
    strictPort: true,
    hmr: false,
  },
  preview: {
    host: "127.0.0.1",
    port: 5194,
    strictPort: true,
  },
});
