import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

import { createArtifactBuildId } from "../../tooling/artifact-build-id.mjs";

const artifactBuildId = await createArtifactBuildId();

export default defineConfig({
  base: "./",
  plugins: [react()],
  define: {
    __GAMEYARD_BUILD__: JSON.stringify(artifactBuildId),
  },
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
