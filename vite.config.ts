import { defineConfig } from "vite-plus";

const tumbledrumUpstreamStyleFiles = [
  "games/tumbledrum/ASSET_MANIFEST.md",
  "games/tumbledrum/BUILD_INFO.json",
  "games/tumbledrum/README.md",
  "games/tumbledrum/RESEARCH_AND_DESIGN*.md",
  "games/tumbledrum/SHA256SUMS.txt",
  "games/tumbledrum/TEST_REPORT.md",
  "games/tumbledrum/VERSION.txt",
  "games/tumbledrum/pyproject.toml",
  "games/tumbledrum/screenshots/**",
  "games/tumbledrum/src/**",
  "games/tumbledrum/styles.css",
  "games/tumbledrum/uv.lock",
];

const crownBreakerUpstreamStyleFiles = [
  "games/crown-breaker/CHANGELOG.md",
  "games/crown-breaker/COPY_GUIDE.md",
  "games/crown-breaker/DESIGN_NOTES.md",
  "games/crown-breaker/LICENSE.txt",
  "games/crown-breaker/QA_REPORT.md",
  "games/crown-breaker/README.md",
  "games/crown-breaker/assets/**",
  "games/crown-breaker/game.js",
  "games/crown-breaker/i18n.js",
  "games/crown-breaker/icon*.png",
  "games/crown-breaker/icon.svg",
  "games/crown-breaker/index.html",
  "games/crown-breaker/manifest*.webmanifest",
  "games/crown-breaker/previews/**",
  "games/crown-breaker/styles.css",
  "games/crown-breaker/sw.js",
  "games/crown-breaker/tools/build-art-assets.mjs",
  "games/crown-breaker/tools/check-*.mjs",
  "games/crown-breaker/tools/render-*.mjs",
  "games/crown-breaker/tools/sim-run.mjs",
  "games/crown-breaker/tools/svg-contract.mjs",
];

const upstreamStyleFiles = [...tumbledrumUpstreamStyleFiles, ...crownBreakerUpstreamStyleFiles];

export default defineConfig({
  fmt: {
    ignorePatterns: upstreamStyleFiles,
    semi: true,
    singleQuote: false,
  },
  lint: {
    ignorePatterns: upstreamStyleFiles,
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
