import { defineConfig } from "vite-plus";

export default defineConfig({
  root: ".",
  fmt: {
    ignorePatterns: [
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
    ],
    semi: true,
    singleQuote: false,
  },
  lint: {
    ignorePatterns: [
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
    ],
  },
  server: {
    host: "127.0.0.1",
    port: 5192,
    strictPort: true,
    hmr: false,
  },
});
