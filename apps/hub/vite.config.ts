import react from "@vitejs/plugin-react";
import { GameManifestSchema } from "@gameyard/game-contract";
import { defineConfig } from "vite-plus";

import { createArtifactBuildId } from "../../tooling/artifact-build-id.mjs";

const artifactBuildId = await createArtifactBuildId();
const devRuntimes = [
  { id: "pulse-link-overdrive", origin: "http://127.0.0.1:5174" },
  { id: "tumbledrum", origin: "http://127.0.0.1:5175" },
  { id: "crown-breaker", origin: "http://127.0.0.1:5176" },
] as const;
const hubStageManifest = `${JSON.stringify(
  { schemaVersion: 1, buildId: artifactBuildId, entry: "index.html" },
  null,
  2,
)}\n`;

const devCatalog = `${JSON.stringify(
  {
    schemaVersion: 1,
    buildId: artifactBuildId,
    games: devRuntimes.map(({ id }) => ({
      id,
      entry: `./${id}/index.html`,
      manifest: `./${id}/game.manifest.json`,
    })),
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

async function waitForDevRuntime(runtime: (typeof devRuntimes)[number]): Promise<void> {
  const manifestUrl = `${runtime.origin}/games/${runtime.id}/game.manifest.json`;
  const deadline = Date.now() + 10_000;
  let lastFailure = `${runtime.id} dev server did not respond`;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(manifestUrl, {
        cache: "no-store",
        signal: AbortSignal.timeout(500),
      });
      if (response.ok) {
        const manifest = GameManifestSchema.safeParse(await response.json());
        if (
          manifest.success &&
          manifest.data.id === runtime.id &&
          manifest.data.buildId === artifactBuildId
        ) {
          return;
        }
        lastFailure = `${runtime.id} dev manifest does not match the Hub runtime identity`;
      } else {
        lastFailure = `${runtime.id} dev manifest returned HTTP ${response.status}`;
      }
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
  }
  throw new Error(`${runtime.id} dev runtime was not ready after 10000ms: ${lastFailure}`);
}

async function waitForDevRuntimes(): Promise<void> {
  await Promise.all(devRuntimes.map((runtime) => waitForDevRuntime(runtime)));
}

function devRuntimeProxyPlugin() {
  return {
    name: "gameyard-dev-runtime-proxy",
    apply: "serve" as const,
    async configureServer(server: { middlewares: { use(handler: DevMiddleware): void } }) {
      await waitForDevRuntimes();
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
    proxy: Object.fromEntries(
      devRuntimes.map(({ id, origin }) => [
        `/games/${id}`,
        {
          target: origin,
          ws: true,
        },
      ]),
    ),
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
