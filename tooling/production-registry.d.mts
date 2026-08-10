import type {
  GameManifestSource,
  GamePresentationSource,
} from "../packages/game-contract/src/index.ts";

export const REQUIRED_GAME_TASKS: readonly ["build", "check", "test"];

export interface ProductionRegistryGame {
  id: string;
  packageName: string;
  stage: string;
  manifestSource: string;
  presentationSource: string;
  devPort: number;
  productionInputs: string[];
}

export interface ProductionRegistry {
  schemaVersion: 2;
  hub: { stage: string; devPort: number };
  games: ProductionRegistryGame[];
}

export interface LoadedProductionRegistryGame extends ProductionRegistryGame {
  stagePath: string;
  manifestSourcePath: string;
  presentationSourcePath: string;
  packagePath: string;
  packageScripts: Record<string, string>;
  manifest: GameManifestSource;
  presentation: GamePresentationSource;
  covers: Array<{ path: string; width: number; height: number; sourcePath: string }>;
}

export interface LoadedProductionRegistry {
  schemaVersion: 2;
  projectRoot: string;
  hub: { stage: string; stagePath: string; devPort: number };
  games: LoadedProductionRegistryGame[];
}

export function parseRepositoryRelativePath(value: unknown, label: string): string;
export function parseProductionRegistry(value: unknown): ProductionRegistry;
export function loadProductionRegistry(
  projectRoot: string | URL,
): Promise<LoadedProductionRegistry>;
export function getRegisteredGame(
  registry: LoadedProductionRegistry,
  id: string,
): LoadedProductionRegistryGame;
