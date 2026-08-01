import { GameManifestSchema } from "@gameyard/game-contract";
import { defineConfig } from "vite-plus";

import { createArtifactBuildId } from "../../tooling/artifact-build-id.mjs";

const buildId = await createArtifactBuildId();
const gameId = "tumbledrum";
const devBase = `/games/${gameId}/`;
const devFiles = [
  "game.manifest.json",
  "index.html",
  "src/audio.js",
  "src/content.js",
  "src/game.js",
  "src/i18n.js",
  "src/main.js",
  "styles.css",
];

function createManifest(files: readonly string[]) {
  return GameManifestSchema.parse({
    schemaVersion: 1,
    protocol: 1,
    id: gameId,
    version: "1.1.0",
    buildId,
    entry: "index.html",
    locales: { source: "en", supported: ["en", "ja", "zh-Hans"] },
    capabilities: ["audio", "fullscreen", "keyboard", "pointer", "touch", "gamepad"],
    provenance: {
      repository: "https://github.com/Hitsuki-Ban/TUMBLEDRUM",
      revision: "ba6fc680626ac59db793175122600369d48f9834",
      license: "LicenseRef-GameYard-TUMBLEDRUM-Distribution",
    },
    files,
  });
}

export default defineConfig(({ command }) => ({
  base: command === "serve" ? devBase : "./",
  publicDir: false,
  define: {
    __GAMEYARD_BUILD__: JSON.stringify(buildId),
  },
  plugins: [
    {
      name: "tumbledrum-game-manifest",
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          if (
            !request.url ||
            new URL(request.url, "http://gameyard.local").pathname !==
              `${devBase}game.manifest.json`
          ) {
            return next();
          }
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
    outDir: "../../.gameyard/stage/games/tumbledrum",
    emptyOutDir: true,
  },
  server: { hmr: false },
}));
