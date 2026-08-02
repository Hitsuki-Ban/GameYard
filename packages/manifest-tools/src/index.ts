import {
  GameManifestSchema,
  GameManifestSourceSchema,
  type BuildId,
  type GameManifest,
  type GameManifestSource,
} from "@gameyard/game-contract";

const manifestFilename = "game.manifest.json";

type DevMiddleware = (
  request: { url?: string },
  response: {
    statusCode: number;
    setHeader(name: string, value: string): void;
    end(body?: string | Uint8Array): void;
  },
  next: () => void,
) => void;

interface GameManifestPlugin {
  readonly name: string;
  configureServer(server: { middlewares: { use(handler: DevMiddleware): void } }): void;
  generateBundle(
    this: {
      emitFile(file: {
        readonly type: "asset";
        readonly fileName: string;
        readonly source: string;
      }): void;
    },
    options: unknown,
    bundle: Record<string, { readonly fileName: string }>,
  ): void;
}

export interface GameManifestPluginOptions {
  readonly source: unknown;
  readonly buildId: BuildId;
  readonly devFiles: readonly string[];
}

function serializeManifest(manifest: GameManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function createManifest(
  source: GameManifestSource,
  buildId: BuildId,
  files: readonly string[],
): GameManifest {
  return GameManifestSchema.parse({ ...source, buildId, files });
}

export function createGameManifestPlugin(options: GameManifestPluginOptions): GameManifestPlugin {
  const source = GameManifestSourceSchema.parse(options.source);
  const devBase = `/games/${source.id}/`;
  const devManifest = serializeManifest(createManifest(source, options.buildId, options.devFiles));

  return {
    name: `gameyard-game-manifest:${source.id}`,
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (
          !request.url ||
          new URL(request.url, "http://gameyard.local").pathname !== `${devBase}${manifestFilename}`
        ) {
          return next();
        }
        response.statusCode = 200;
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.end(devManifest);
      });
    },
    generateBundle(_options, bundle) {
      const files = [
        ...Object.values(bundle).map((output) => output.fileName),
        manifestFilename,
        source.entry,
      ].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
      this.emitFile({
        type: "asset",
        fileName: manifestFilename,
        source: serializeManifest(createManifest(source, options.buildId, files)),
      });
    },
  };
}
