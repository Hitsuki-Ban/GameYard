import { GameManifestSchema } from "@gameyard/game-contract";
import { defineConfig } from "vite-plus";

import { createArtifactBuildId } from "../../tooling/artifact-build-id.mjs";

const buildId = await createArtifactBuildId();
const gameId = "pulse-link-overdrive";
const devBase = `/games/${gameId}/`;
const devFiles = [
  "assets/icon.svg",
  "game.manifest.json",
  "index.html",
  "src/app.js",
  "src/audio.js",
  "src/config.js",
  "src/i18n.js",
  "src/input.js",
  "src/model.js",
  "src/render.js",
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
    locales: { source: "zh-Hans", supported: ["en", "ja", "zh-Hans"] },
    capabilities: ["audio", "fullscreen", "keyboard", "pointer", "touch", "gamepad"],
    provenance: {
      repository: "https://github.com/Hitsuki-Ban/PulseLinkOverdrive",
      revision: "1e42e4130145922f22315e420daaabf44b42b325",
      license: "MIT",
    },
    files,
  });
}

export default defineConfig(({ command }) => ({
  base: command === "serve" ? devBase : "./",
  define: {
    __GAMEYARD_BUILD__: JSON.stringify(buildId),
  },
  plugins: [
    {
      name: "pulse-link-overdrive-game-manifest",
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
        const manifest = createManifest(files);
        this.emitFile({
          type: "asset",
          fileName: "game.manifest.json",
          source: `${JSON.stringify(manifest, null, 2)}\n`,
        });
      },
    },
  ],
  build: {
    outDir: "../../.gameyard/stage/games/pulse-link-overdrive",
    emptyOutDir: true,
  },
  server: {
    hmr: false,
  },
}));
