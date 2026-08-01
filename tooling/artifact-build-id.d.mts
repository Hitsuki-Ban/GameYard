export interface ArtifactBuildInput {
  readonly path: string;
  readonly kind: "file" | "directory";
}

export const REQUIRED_PRODUCTION_INPUTS: readonly ArtifactBuildInput[];
export function listArtifactBuildInputs(projectRoot?: string): Promise<string[]>;
export function createArtifactBuildId(projectRoot?: string): Promise<string>;
