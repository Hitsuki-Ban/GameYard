import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

import { createArtifactBuildId } from "../../tooling/artifact-build-id.mjs";

const artifactBuildId = await createArtifactBuildId();
const hubStageManifest = `${JSON.stringify(
  { schemaVersion: 1, buildId: artifactBuildId, entry: "index.html" },
  null,
  2,
)}\n`;

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    {
      name: "gameyard-hub-stage-manifest",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "hub.manifest.json",
          source: hubStageManifest,
        });
      },
    },
  ],
  define: {
    __GAMEYARD_BUILD__: JSON.stringify(artifactBuildId),
  },
  build: {
    outDir: "../../.gameyard/stage/hub",
    emptyOutDir: true,
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
