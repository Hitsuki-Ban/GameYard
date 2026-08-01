import react from "@vitejs/plugin-react";
import { GameManifestSchema } from "@gameyard/game-contract";
import { defineConfig } from "vite-plus";

import { createArtifactBuildId } from "../../tooling/artifact-build-id.mjs";

const artifactBuildId = await createArtifactBuildId();
const pulseId = "pulse-link-overdrive";
const pulseDevOrigin = "http://127.0.0.1:5174";
const pulseDevManifestUrl = `${pulseDevOrigin}/games/${pulseId}/game.manifest.json`;
const hubStageManifest = `${JSON.stringify(
  { schemaVersion: 1, buildId: artifactBuildId, entry: "index.html" },
  null,
  2,
)}\n`;

const devCatalog = `${JSON.stringify(
  {
    schemaVersion: 1,
    buildId: artifactBuildId,
    games: [
      {
        id: pulseId,
        entry: `./${pulseId}/index.html`,
        manifest: `./${pulseId}/game.manifest.json`,
      },
    ],
  },
  null,
  2,
)}\n`;

type DevMiddleware = (
  request: { url?: string },
  response: {
    statusCode: number;
    setHeader(name: string, value: string): void;
    end(body?: string | Uint8Array): void;
  },
  next: () => void,
) => void | Promise<void>;

async function waitForPulseDevRuntime(): Promise<void> {
  const deadline = Date.now() + 10_000;
  let lastFailure = "Pulse dev server did not respond";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(pulseDevManifestUrl, {
        cache: "no-store",
        signal: AbortSignal.timeout(500),
      });
      if (response.ok) {
        const manifest = GameManifestSchema.safeParse(await response.json());
        if (
          manifest.success &&
          manifest.data.id === pulseId &&
          manifest.data.buildId === artifactBuildId
        ) {
          return;
        }
        lastFailure = "Pulse dev manifest does not match the Hub runtime identity";
      } else {
        lastFailure = `Pulse dev manifest returned HTTP ${response.status}`;
      }
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
  }
  throw new Error(`Pulse dev runtime was not ready after 10000ms: ${lastFailure}`);
}

function devRuntimeProxyPlugin() {
  return {
    name: "gameyard-dev-runtime-proxy",
    apply: "serve" as const,
    async configureServer(server: { middlewares: { use(handler: DevMiddleware): void } }) {
      await waitForPulseDevRuntime();
      server.middlewares.use(
        (
          request: { url?: string },
          response: {
            statusCode: number;
            setHeader(name: string, value: string): void;
            end(body?: string | Uint8Array): void;
          },
          next: () => void,
        ) => {
          if (
            !request.url ||
            new URL(request.url, "http://gameyard.local").pathname !== "/games/catalog.json"
          )
            return next();
          response.statusCode = 200;
          response.setHeader("Cache-Control", "no-store");
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.end(devCatalog);
        },
      );
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    devRuntimeProxyPlugin(),
    {
      name: "gameyard-hub-stage-manifest",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "hub.manifest.json",
          source: hubStageManifest,
        });
      },
    },
  ],
  define: {
    __GAMEYARD_BUILD__: JSON.stringify(artifactBuildId),
  },
  server: {
    proxy: {
      [`/games/${pulseId}`]: {
        target: pulseDevOrigin,
        ws: true,
      },
    },
  },
  build: {
    outDir: "../../.gameyard/stage/hub",
    emptyOutDir: true,
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
