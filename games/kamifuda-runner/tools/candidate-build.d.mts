import type { Plugin } from "vite";

export function createCandidateBuildId(projectRoot: string): Promise<`gameyard@${string}`>;
export function validateCandidateSource(source: unknown): Record<string, unknown>;
export function createCandidateManifestPlugin(options: {
  source: unknown;
  buildId: string;
}): Plugin;
