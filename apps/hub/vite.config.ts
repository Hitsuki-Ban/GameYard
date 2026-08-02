import react from "@vitejs/plugin-react";
import { GameManifestSchema, GameManifestSourceSchema } from "@gameyard/game-contract";
import { defineConfig } from "vite-plus";
import { VitePWA } from "vite-plugin-pwa";

import { createArtifactBuildId } from "../../tooling/artifact-build-id.mjs";
import crownBreakerSource from "../../games/crown-breaker/game.manifest.source.json";
import pulseLinkOverdriveSource from "../../games/pulse-link-overdrive/game.manifest.source.json";
import tumbledrumSource from "../../games/tumbledrum/game.manifest.source.json";

const artifactBuildId = await createArtifactBuildId();
const devRuntimes = [
  {
    source: GameManifestSourceSchema.parse(pulseLinkOverdriveSource),
    origin: "http://127.0.0.1:5174",
  },
  {
    source: GameManifestSourceSchema.parse(tumbledrumSource),
    origin: "http://127.0.0.1:5175",
  },
  {
    source: GameManifestSourceSchema.parse(crownBreakerSource),
    origin: "http://127.0.0.1:5176",
  },
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
    games: devRuntimes.map(({ source }) => ({
      id: source.id,
      entry: `./${source.id}/${source.entry}`,
      manifest: `./${source.id}/game.manifest.json`,
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
  const manifestUrl = `${runtime.origin}/games/${runtime.source.id}/game.manifest.json`;
  const deadline = Date.now() + 10_000;
  let lastFailure = `${runtime.source.id} dev server did not respond`;
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
          manifest.data.id === runtime.source.id &&
          manifest.data.entry === runtime.source.entry &&
          manifest.data.buildId === artifactBuildId
        ) {
          return;
        }
        lastFailure = `${runtime.source.id} dev manifest does not match the Hub runtime identity`;
      } else {
        lastFailure = `${runtime.source.id} dev manifest returned HTTP ${response.status}`;
      }
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
  }
  throw new Error(`${runtime.source.id} dev runtime was not ready after 10000ms: ${lastFailure}`);
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
            /[/\\]packages[/\\]testkit[/\\]/u.test(moduleId),
        );
      if (forbiddenModule) {
        throw new Error(`Production Hub includes a Lab/testkit module: ${forbiddenModule}`);
      }
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [
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
        description: "Three experimental browser games in one focused same-origin gallery.",
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
    proxy: Object.fromEntries(
      devRuntimes.map(({ source, origin }) => [
        `/games/${source.id}`,
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
