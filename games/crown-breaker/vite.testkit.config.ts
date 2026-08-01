import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { defineConfig } from "vite-plus";

import { createArtifactBuildId } from "../../tooling/artifact-build-id.mjs";

const buildId = await createArtifactBuildId();
const hostSource = (
  await readFile(resolve(import.meta.dirname, "tests/testkit/host.js"), "utf8")
).replaceAll("__GAMEYARD_TESTKIT_BUILD__", buildId);

export default defineConfig({
  base: "./",
  publicDir: false,
  define: {
    __GAMEYARD_BUILD__: JSON.stringify(buildId),
    __GAMEYARD_TESTKIT__: "true",
  },
  plugins: [
    {
      name: "crown-breaker-testkit-self-host",
      transformIndexHtml() {
        return [{ tag: "script", children: hostSource, injectTo: "head-prepend" }];
      },
    },
  ],
  build: {
    outDir: "../../.gameyard/testkit/games/crown-breaker",
    emptyOutDir: true,
  },
});
