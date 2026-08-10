import { defineConfig } from "vite-plus";

import sourceJson from "./candidate.manifest.source.json";
import { createCandidateBuildId, createCandidateManifestPlugin } from "./tools/candidate-build.mjs";

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

const buildId = await createCandidateBuildId(import.meta.dirname);

export default defineConfig({
  root: "guest",
  base: "./",
  publicDir: false,
  define: {
    __GAMEYARD_BUILD__: JSON.stringify(buildId),
    __GAMEYARD_TESTKIT__: "false",
  },
  plugins: [createCandidateManifestPlugin({ source: sourceJson, buildId })],
  build: {
    outDir: "../../../.gameyard/candidates/kamifuda-runner",
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
    port: 5191,
    strictPort: true,
    hmr: false,
  },
});
