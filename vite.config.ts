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

export default defineConfig({
  fmt: {
    ignorePatterns: tumbledrumUpstreamStyleFiles,
    semi: true,
    singleQuote: false,
  },
  lint: {
    ignorePatterns: tumbledrumUpstreamStyleFiles,
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
