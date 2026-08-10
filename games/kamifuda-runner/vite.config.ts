import { defineConfig } from "vite-plus";

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

export default defineConfig({
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
