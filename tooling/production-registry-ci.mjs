import { appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { loadProductionRegistry } from "./production-registry.mjs";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

export function createGameCiMatrix(registry) {
  return {
    include: registry.games.map((game) => ({
      gameId: game.id,
      packageName: game.packageName,
    })),
  };
}

export async function writeGameCiMatrix(root, githubOutputFile) {
  if (typeof githubOutputFile !== "string" || githubOutputFile.trim() === "") {
    throw new Error("GitHub output file must be a non-empty path.");
  }
  const registry = await loadProductionRegistry(root);
  const matrix = createGameCiMatrix(registry);
  await appendFile(resolve(githubOutputFile), `game-matrix=${JSON.stringify(matrix)}\n`, "utf8");
  return matrix;
}

async function main() {
  if (process.argv.length !== 4 || process.argv[2] !== "--github-output") {
    throw new Error("Usage: production-registry-ci.mjs --github-output <path>");
  }
  await writeGameCiMatrix(projectRoot, process.argv[3]);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) await main();
