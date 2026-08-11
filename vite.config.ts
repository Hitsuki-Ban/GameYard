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

const kamifudaRunnerUpstreamStyleFiles = [
  "games/kamifuda-runner/ACCEPTANCE_RESULTS.json",
  "games/kamifuda-runner/DESIGN_NOTES.md",
  "games/kamifuda-runner/LEVEL_CONTENT_AUDIT.md",
  "games/kamifuda-runner/PRESENTATION_SPEC.md",
  "games/kamifuda-runner/TEST_REPORT.md",
  "games/kamifuda-runner/VISUAL_PRESENTATION_AUDIT.md",
  "games/kamifuda-runner/build.py",
  "games/kamifuda-runner/game.js",
  "games/kamifuda-runner/index.html",
  "games/kamifuda-runner/kamifuda-runner-v4-standalone.html",
  "games/kamifuda-runner/style.css",
];

const neonOverdriveUpstreamStyleFiles = [
  "games/neon-overdrive/boss-preview.png",
  "games/neon-overdrive/DESIGN_NOTES.md",
  "games/neon-overdrive/game.js",
  "games/neon-overdrive/index.html",
  "games/neon-overdrive/NEON_OVERDRIVE.html",
  "games/neon-overdrive/overdrive-preview.png",
  "games/neon-overdrive/preview.png",
  "games/neon-overdrive/QA_REPORT.md",
  "games/neon-overdrive/README.md",
  "games/neon-overdrive/run_local.bat",
  "games/neon-overdrive/run_local.sh",
  "games/neon-overdrive/styles.css",
];

const upstreamStyleFiles = [
  ...tumbledrumUpstreamStyleFiles,
  ...crownBreakerUpstreamStyleFiles,
  ...kamifudaRunnerUpstreamStyleFiles,
  ...neonOverdriveUpstreamStyleFiles,
];

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
