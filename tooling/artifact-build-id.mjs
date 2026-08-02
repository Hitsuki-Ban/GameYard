import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { parseAssemblyConfig } from "./assembly-config.mjs";

export const REQUIRED_PRODUCTION_INPUTS = Object.freeze([
  { path: "package.json", kind: "file" },
  { path: "pnpm-lock.yaml", kind: "file" },
  { path: "pnpm-workspace.yaml", kind: "file" },
  { path: "tsconfig.json", kind: "file" },
  { path: "vite.config.ts", kind: "file" },
  { path: "wrangler.jsonc", kind: "file" },
  { path: "site.assembly.json", kind: "file" },
  { path: "provenance", kind: "directory" },
  { path: "tooling/assembly-config.mjs", kind: "file" },
  { path: "tooling/artifact-build-id.mjs", kind: "file" },
  { path: "tooling/artifact-inspector.mjs", kind: "file" },
  { path: "tooling/assemble-site.mjs", kind: "file" },
  { path: "tooling/provenance.mjs", kind: "file" },
  { path: "tooling/site-assembler.mjs", kind: "file" },
  { path: "tooling/verify-published-artifact.mjs", kind: "file" },
  { path: "tooling/verify-production.mjs", kind: "file" },
  { path: "tooling/preview.vite.config.mjs", kind: "file" },
  { path: "apps/hub/index.html", kind: "file" },
  { path: "apps/hub/package.json", kind: "file" },
  { path: "apps/hub/public", kind: "directory" },
  { path: "apps/hub/tsconfig.json", kind: "file" },
  { path: "apps/hub/vite.config.ts", kind: "file" },
  { path: "apps/hub/src", kind: "directory" },
  { path: "packages/game-contract/package.json", kind: "file" },
  { path: "packages/game-contract/tsconfig.json", kind: "file" },
  { path: "packages/game-contract/src", kind: "directory" },
  { path: "packages/manifest-tools/package.json", kind: "file" },
  { path: "packages/manifest-tools/tsconfig.json", kind: "file" },
  { path: "packages/manifest-tools/vite.config.ts", kind: "file" },
  { path: "packages/manifest-tools/src", kind: "directory" },
  { path: "packages/host-bridge/package.json", kind: "file" },
  { path: "packages/host-bridge/tsconfig.json", kind: "file" },
  { path: "packages/host-bridge/src", kind: "directory" },
  { path: "packages/guest-bridge/package.json", kind: "file" },
  { path: "packages/guest-bridge/tsconfig.json", kind: "file" },
  { path: "packages/guest-bridge/src", kind: "directory" },
]);

const defaultProjectRoot = fileURLToPath(new URL("../", import.meta.url));

async function collectDirectoryFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectDirectoryFiles(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    } else {
      throw new Error(`Unsupported production input: ${entryPath}`);
    }
  }

  return files;
}

export async function listArtifactBuildInputs(projectRoot = defaultProjectRoot) {
  const root = resolve(projectRoot);
  const files = [];

  for (const input of REQUIRED_PRODUCTION_INPUTS) {
    const inputPath = resolve(root, input.path);
    let inputStat;
    try {
      inputStat = await stat(inputPath);
    } catch (error) {
      if (error?.code === "ENOENT") {
        throw new Error(`Required production input is missing: ${input.path}`);
      }
      throw error;
    }

    if (input.kind === "file") {
      if (!inputStat.isFile()) {
        throw new Error(`Required production input is not a file: ${input.path}`);
      }
      files.push(inputPath);
      continue;
    }

    if (!inputStat.isDirectory()) {
      throw new Error(`Required production input is not a directory: ${input.path}`);
    }
    const directoryFiles = await collectDirectoryFiles(inputPath);
    if (directoryFiles.length === 0) {
      throw new Error(`Required production input directory is empty: ${input.path}`);
    }
    files.push(...directoryFiles);
  }

  let assemblyConfigValue;
  try {
    assemblyConfigValue = JSON.parse(await readFile(resolve(root, "site.assembly.json"), "utf8"));
  } catch (error) {
    throw new Error(`site.assembly.json is not valid JSON: ${error.message}`);
  }
  const assemblyConfig = parseAssemblyConfig(assemblyConfigValue);
  for (const game of assemblyConfig.games) {
    for (const productionInput of game.productionInputs) {
      const inputPath = resolve(root, productionInput);
      let inputStat;
      try {
        inputStat = await stat(inputPath);
      } catch (error) {
        if (error?.code === "ENOENT") {
          throw new Error(`Required game production input is missing: ${productionInput}`);
        }
        throw error;
      }
      if (inputStat.isFile()) {
        files.push(inputPath);
      } else if (inputStat.isDirectory()) {
        const directoryFiles = await collectDirectoryFiles(inputPath);
        if (directoryFiles.length === 0) {
          throw new Error(`Required game production input directory is empty: ${productionInput}`);
        }
        files.push(...directoryFiles);
      } else {
        throw new Error(`Unsupported game production input: ${productionInput}`);
      }
    }
  }

  const logicalFiles = new Set();
  for (const file of files) {
    const logicalPath = relative(root, file).split(sep).join("/").toLowerCase();
    if (logicalFiles.has(logicalPath)) {
      throw new Error(`Production inputs resolve to the same file: ${logicalPath}`);
    }
    logicalFiles.add(logicalPath);
  }

  return files.sort((left, right) => {
    const leftPath = relative(root, left).split(sep).join("/");
    const rightPath = relative(root, right).split(sep).join("/");
    return leftPath < rightPath ? -1 : leftPath > rightPath ? 1 : 0;
  });
}

export async function createArtifactBuildId(projectRoot = defaultProjectRoot) {
  const root = resolve(projectRoot);
  const files = await listArtifactBuildInputs(root);
  const hash = createHash("sha256");

  for (const file of files) {
    const logicalPath = relative(root, file).split(sep).join("/");
    const content = await readFile(file);
    hash.update(`${logicalPath.length}:${logicalPath}:${content.byteLength}:`);
    hash.update(content);
  }

  return `gameyard@${hash.digest("hex").slice(0, 16)}`;
}
