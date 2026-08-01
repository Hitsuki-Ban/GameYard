import { GameManifestSchema } from "@gameyard/game-contract";
import { defineConfig } from "vite-plus";

import { createArtifactBuildId } from "../../tooling/artifact-build-id.mjs";

const buildId = await createArtifactBuildId();
const gameId = "crown-breaker";
const devBase = `/games/${gameId}/`;
const devFiles = [
  "game.manifest.json",
  "index.html",
  "game.js",
  "i18n.js",
  "src/main.js",
  "src/managed-runtime.js",
  "styles.css",
];

function createManifest(files: string[]) {
  return GameManifestSchema.parse({
    schemaVersion: 1,
    protocol: 1,
    id: gameId,
    version: "3.7.1",
    buildId,
    entry: "index.html",
    locales: { source: "en", supported: ["en", "ja", "zh-Hans"] },
    capabilities: ["audio", "keyboard", "pointer", "touch"],
    provenance: {
      repository: "https://github.com/Hitsuki-Ban/CrownBreaker",
      revision: "1f7b911926c786043ba793e16c4f25cd5f523b21",
      license: "MIT",
    },
    files,
  });
}

export default defineConfig(({ command }) => ({
  base: command === "serve" ? devBase : "./",
  publicDir: false,
  define: {
    __GAMEYARD_BUILD__: JSON.stringify(buildId),
    __GAMEYARD_TESTKIT__: "false",
  },
  plugins: [
    {
      name: "crown-breaker-game-manifest",
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          if (
            !request.url ||
            new URL(request.url, "http://gameyard.local").pathname !==
              `${devBase}game.manifest.json`
          )
            return next();
          response.statusCode = 200;
          response.setHeader("Cache-Control", "no-store");
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.end(`${JSON.stringify(createManifest(devFiles), null, 2)}\n`);
        });
      },
      generateBundle(_options, bundle) {
        const files = [
          ...Object.values(bundle).map((output) => output.fileName),
          "game.manifest.json",
          "index.html",
        ].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
        this.emitFile({
          type: "asset",
          fileName: "game.manifest.json",
          source: `${JSON.stringify(createManifest(files), null, 2)}\n`,
        });
      },
    },
  ],
  build: {
    outDir: "../../.gameyard/stage/games/crown-breaker",
    emptyOutDir: true,
  },
  server: { host: "127.0.0.1", port: 5176, strictPort: true, hmr: false },
}));
