import { GameManifestSourceSchema } from "@gameyard/game-contract";
import { createGameManifestPlugin } from "@gameyard/manifest-tools";
import { defineConfig } from "vite-plus";

import manifestSourceJson from "./candidate.manifest.source.json";
import { createNeonCandidateBuildId, listNeonGuestDevFiles } from "./tools/verify-candidate.mjs";

const buildId = await createNeonCandidateBuildId();
const manifestSource = GameManifestSourceSchema.parse(manifestSourceJson);
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
    outDir: "../../../.gameyard/candidates/neon-overdrive",
    emptyOutDir: true,
  },
  server: {
    host: "127.0.0.1",
    port: 5193,
    strictPort: true,
    hmr: false,
  },
}));
