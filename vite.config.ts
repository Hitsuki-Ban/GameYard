import { defineConfig } from "vite-plus";

const tumbledrumPinnedSnapshotText = [
  "games/tumbledrum/ASSET_MANIFEST.md",
  "games/tumbledrum/BUILD_INFO.json",
  "games/tumbledrum/README.md",
  "games/tumbledrum/RESEARCH_AND_DESIGN*.md",
  "games/tumbledrum/SHA256SUMS.txt",
  "games/tumbledrum/TEST_REPORT.md",
  "games/tumbledrum/TUMBLEDRUM_PLAY.html",
  "games/tumbledrum/VERSION.txt",
  "games/tumbledrum/index.html",
  "games/tumbledrum/pyproject.toml",
  "games/tumbledrum/screenshots/**",
  "games/tumbledrum/src/**",
  "games/tumbledrum/styles.css",
  "games/tumbledrum/tests/full_run_test.py",
  "games/tumbledrum/tests/integration_test.py",
  "games/tumbledrum/tests/regression_test.py",
  "games/tumbledrum/tests/smoke_test.py",
  "games/tumbledrum/tools/build_single.py",
  "games/tumbledrum/uv.lock",
];

export default defineConfig({
  fmt: {
    ignorePatterns: tumbledrumPinnedSnapshotText,
    semi: true,
    singleQuote: false,
  },
  lint: {
    ignorePatterns: tumbledrumPinnedSnapshotText,
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
