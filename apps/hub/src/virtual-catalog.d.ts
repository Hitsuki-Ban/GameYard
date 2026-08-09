declare module "virtual:gameyard/catalog" {
  import type { GameManifestSource, GamePresentation } from "@gameyard/game-contract";

  export const GAMEYARD_CATALOG: readonly {
    readonly order: number;
    readonly manifest: GameManifestSource;
    readonly presentation: GamePresentation;
  }[];
}
