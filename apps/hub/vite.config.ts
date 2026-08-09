import react from "@vitejs/plugin-react";
import { GameManifestSchema } from "@gameyard/game-contract";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";
import { VitePWA } from "vite-plugin-pwa";

import { createArtifactBuildId } from "../../tooling/artifact-build-id.mjs";
import { loadProductionRegistry } from "../../tooling/production-registry.mjs";
import { createProductionRegistryVitePlugin } from "../../tooling/production-registry-vite.mjs";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
const productionRegistry = await loadProductionRegistry(projectRoot);
const artifactBuildId = await createArtifactBuildId();
const devRuntimes = productionRegistry.games.map((game) => ({
  manifest: game.manifest,
  origin: `http://127.0.0.1:${game.devPort}`,
}));
const hubStageManifest = `${JSON.stringify(
  { schemaVersion: 1, buildId: artifactBuildId, entry: "index.html" },
  null,
  2,
)}\n`;

const devCatalog = `${JSON.stringify(
  {
    schemaVersion: 1,
    buildId: artifactBuildId,
    games: devRuntimes.map(({ manifest }) => ({
      id: manifest.id,
      entry: `./${manifest.id}/${manifest.entry}`,
      manifest: `./${manifest.id}/game.manifest.json`,
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
  const manifestUrl = `${runtime.origin}/games/${runtime.manifest.id}/game.manifest.json`;
  const deadline = Date.now() + 10_000;
  let lastFailure = `${runtime.manifest.id} dev server did not respond`;
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
          manifest.data.id === runtime.manifest.id &&
          manifest.data.entry === runtime.manifest.entry &&
          manifest.data.buildId === artifactBuildId
        ) {
          return;
        }
        lastFailure = `${runtime.manifest.id} dev manifest does not match the Hub runtime identity`;
      } else {
        lastFailure = `${runtime.manifest.id} dev manifest returned HTTP ${response.status}`;
      }
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
  }
  throw new Error(`${runtime.manifest.id} dev runtime was not ready after 10000ms: ${lastFailure}`);
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

function productionBoundaryPlugin() {
  return {
    name: "gameyard-production-boundary",
    apply: "build" as const,
    generateBundle(
      _options: unknown,
      bundle: Record<
        string,
        { readonly type: string; readonly modules?: Readonly<Record<string, unknown>> }
      >,
    ) {
      const forbiddenModule = Object.values(bundle)
        .filter((output) => output.type === "chunk")
        .flatMap((output) => Object.keys(output.modules ?? {}))
        .find(
          (moduleId) =>
            /[/\\]apps[/\\]hub[/\\]src[/\\]lab(?:\.css|\.ts)$/u.test(moduleId) ||
            /[/\\]packages[/\\]testkit[/\\]/u.test(moduleId) ||
            /[/\\]tooling[/\\]/u.test(moduleId) ||
            moduleId.includes("node:") ||
            moduleId.includes("__vite-browser-external"),
        );
      if (forbiddenModule) {
        throw new Error(`Production Hub includes a development or Node module: ${forbiddenModule}`);
      }
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [
    createProductionRegistryVitePlugin(productionRegistry),
    react(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "service-worker.ts",
      injectRegister: false,
      manifest: {
        id: "./",
        name: "GameYard — Experimental Game Gallery",
        short_name: "GameYard",
        description: "Experimental browser games in one focused same-origin gallery.",
        start_url: "./",
        scope: "./",
        display: "standalone",
        background_color: "#f4f2ec",
        theme_color: "#070b1a",
        icons: [
          {
            src: "./icons/gameyard-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable",
          },
          {
            src: "./icons/gameyard-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      injectManifest: {
        globPatterns: ["**/*.{html,js,css}"],
        maximumFileSizeToCacheInBytes: 1_000_000,
      },
      devOptions: { enabled: false },
    }),
    devRuntimeProxyPlugin(),
    productionBoundaryPlugin(),
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
    port: productionRegistry.hub.devPort,
    strictPort: true,
    proxy: Object.fromEntries(
      devRuntimes.map(({ manifest, origin }) => [
        `/games/${manifest.id}`,
        {
          target: origin,
          ws: true,
        },
      ]),
    ),
  },
  build: {
    outDir: productionRegistry.hub.stagePath,
    emptyOutDir: true,
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
