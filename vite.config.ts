import { defineConfig } from "vite-plus";

const pulsePinnedSnapshotText = [
  "games/pulse-link-overdrive/README.md",
  "games/pulse-link-overdrive/docs/**",
  "games/pulse-link-overdrive/index.html",
  "games/pulse-link-overdrive/manifest.*.webmanifest",
  "games/pulse-link-overdrive/src/**",
  "games/pulse-link-overdrive/styles.css",
  "games/pulse-link-overdrive/sw.js",
  "games/pulse-link-overdrive/tests/logic-smoke.html",
];

export default defineConfig({
  fmt: {
    ignorePatterns: pulsePinnedSnapshotText,
    semi: true,
    singleQuote: false,
  },
  lint: {
    ignorePatterns: pulsePinnedSnapshotText,
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: {
      "vite-plus/prefer-vite-plus-imports": "error",
    },
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  run: {
    cache: true,
  },
});
