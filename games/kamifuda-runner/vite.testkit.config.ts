import { readFile } from "node:fs/promises";
import path from "node:path";
import { defineConfig } from "vite-plus";

import sourceJson from "./candidate.manifest.source.json";
import { createCandidateBuildId, createCandidateManifestPlugin } from "./tools/candidate-build.mjs";

const projectRoot = import.meta.dirname;
const buildId = await createCandidateBuildId(projectRoot);
const hostSource = (
  await readFile(path.join(projectRoot, "tests/testkit/host.js"), "utf8")
).replaceAll("__GAMEYARD_TESTKIT_BUILD__", buildId);

export default defineConfig({
  root: "guest",
  base: "./",
  publicDir: false,
  define: {
    __GAMEYARD_BUILD__: JSON.stringify(buildId),
    __GAMEYARD_TESTKIT__: "true",
  },
  plugins: [
    createCandidateManifestPlugin({ source: sourceJson, buildId }),
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
