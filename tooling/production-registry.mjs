import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  GameManifestSourceSchema,
  GamePresentationSourceSchema,
} from "../packages/game-contract/src/index.ts";

const registryFilename = "site.assembly.json";
const gameIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const packageNamePattern = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u;

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertExactKeys(value, expected, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  const keys = Object.keys(value).sort(compareStrings);
  const expectedKeys = [...expected].sort(compareStrings);
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new Error(`${label} fields must be exactly: ${expectedKeys.join(", ")}.`);
  }
}

function parseTrimmedString(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    throw new Error(`${label} must be a trimmed non-empty string.`);
  }
  return value;
}

export function parseRepositoryRelativePath(value, label) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\\") ||
    value.includes(":") ||
    value.includes("%") ||
    value.includes("?") ||
    value.includes("#") ||
    value.startsWith("/") ||
    value.endsWith("/") ||
    value.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new Error(`${label} must be a normalized repository-relative POSIX path.`);
  }
  return value;
}

function parseStagePath(value, label) {
  const path = parseRepositoryRelativePath(value, label);
  if (!path.toLowerCase().startsWith(".gameyard/stage/")) {
    throw new Error(`${label} must be inside .gameyard/stage/.`);
  }
  return path;
}

function parsePort(value, label) {
  if (!Number.isSafeInteger(value) || value < 1_024 || value > 65_535) {
    throw new Error(`${label} must be an integer from 1024 through 65535.`);
  }
  return value;
}

function assertUniquePaths(paths, label) {
  const ordered = paths.map((path) => path.toLowerCase()).sort(compareStrings);
  for (let index = 0; index < ordered.length; index += 1) {
    const current = ordered[index];
    const previous = ordered[index - 1];
    if (previous === current) throw new Error(`${label} contains a duplicate path: ${current}`);
    if (previous && current.startsWith(`${previous}/`)) {
      throw new Error(`${label} contains overlapping paths: ${previous} and ${current}`);
    }
  }
}

function parseGame(value, index) {
  const label = `${registryFilename} games[${index}]`;
  assertExactKeys(
    value,
    [
      "id",
      "packageName",
      "stage",
      "manifestSource",
      "presentationSource",
      "devPort",
      "productionInputs",
    ],
    label,
  );
  const id = parseTrimmedString(value.id, `${label}.id`);
  if (!gameIdPattern.test(id)) throw new Error(`${label}.id must be a lowercase GameYard game ID.`);
  const packageName = parseTrimmedString(value.packageName, `${label}.packageName`);
  if (!packageNamePattern.test(packageName)) {
    throw new Error(`${label}.packageName must be a lowercase npm package name.`);
  }
  const stage = parseStagePath(value.stage, `${label}.stage`);
  const manifestSource = parseRepositoryRelativePath(
    value.manifestSource,
    `${label}.manifestSource`,
  );
  const presentationSource = parseRepositoryRelativePath(
    value.presentationSource,
    `${label}.presentationSource`,
  );
  const devPort = parsePort(value.devPort, `${label}.devPort`);
  if (!Array.isArray(value.productionInputs) || value.productionInputs.length === 0) {
    throw new Error(`${label}.productionInputs must be a non-empty array.`);
  }
  const productionInputs = value.productionInputs.map((input, inputIndex) =>
    parseRepositoryRelativePath(input, `${label}.productionInputs[${inputIndex}]`),
  );
  assertUniquePaths(productionInputs, `${label}.productionInputs`);
  for (const input of productionInputs) {
    const folded = input.toLowerCase();
    const foldedStage = stage.toLowerCase();
    if (
      folded === "dist" ||
      folded.startsWith("dist/") ||
      folded === ".gameyard" ||
      folded.startsWith(".gameyard/") ||
      folded === foldedStage ||
      folded.startsWith(`${foldedStage}/`)
    ) {
      throw new Error(
        `${label}.productionInputs must not include stage or distribution output: ${input}`,
      );
    }
  }
  return {
    id,
    packageName,
    stage,
    manifestSource,
    presentationSource,
    devPort,
    productionInputs,
  };
}

function requireGlobalUniqueness(values, label) {
  const seen = new Set();
  for (const value of values) {
    const folded = typeof value === "string" ? value.toLowerCase() : value;
    if (seen.has(folded)) throw new Error(`${registryFilename} has a ${label} collision: ${value}`);
    seen.add(folded);
  }
}

export function parseProductionRegistry(value) {
  if (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    value.schemaVersion === 1
  ) {
    throw new Error(`${registryFilename} schemaVersion 1 is not supported; expected 2.`);
  }
  assertExactKeys(value, ["schemaVersion", "hub", "games"], registryFilename);
  if (value.schemaVersion !== 2) throw new Error(`${registryFilename} schemaVersion must be 2.`);
  assertExactKeys(value.hub, ["stage", "devPort"], `${registryFilename} hub`);
  const hub = {
    stage: parseStagePath(value.hub.stage, `${registryFilename} hub.stage`),
    devPort: parsePort(value.hub.devPort, `${registryFilename} hub.devPort`),
  };
  if (!Array.isArray(value.games)) throw new Error(`${registryFilename} games must be an array.`);
  if (value.games.length === 0) throw new Error(`${registryFilename} games must not be empty.`);
  const games = value.games.map(parseGame);

  requireGlobalUniqueness(
    games.map((game) => game.id),
    "game ID",
  );
  requireGlobalUniqueness(
    games.map((game) => game.packageName),
    "package name",
  );
  assertUniquePaths([hub.stage, ...games.map((game) => game.stage)], `${registryFilename} stages`);
  requireGlobalUniqueness(
    games.flatMap((game) => [game.manifestSource, game.presentationSource]),
    "source path",
  );
  requireGlobalUniqueness([hub.devPort, ...games.map((game) => game.devPort)], "development port");
  requireGlobalUniqueness(
    games.flatMap((game) => game.productionInputs),
    "production input path",
  );

  return { schemaVersion: 2, hub, games };
}

async function readJson(path, label) {
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") throw new Error(`${label} is missing: ${path}`);
    throw error;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

async function requireInput(path, label) {
  let metadata;
  try {
    metadata = await stat(path);
  } catch (error) {
    if (error?.code === "ENOENT") throw new Error(`${label} is missing: ${path}`);
    throw error;
  }
  if (!metadata.isFile() && !metadata.isDirectory()) {
    throw new Error(`${label} must be a regular file or directory: ${path}`);
  }
}

function isPathCovered(path, productionInputs) {
  const foldedPath = path.toLowerCase();
  return productionInputs.some((input) => {
    const foldedInput = input.toLowerCase();
    return foldedPath === foldedInput || foldedPath.startsWith(`${foldedInput}/`);
  });
}

function requireProductionCoverage(path, productionInputs, label) {
  if (!isPathCovered(path, productionInputs)) {
    throw new Error(`${label} is not covered by productionInputs: ${path}`);
  }
}

function normalizeRoot(projectRoot) {
  if (projectRoot instanceof URL) return resolve(fileURLToPath(projectRoot));
  if (typeof projectRoot !== "string" || projectRoot.trim() === "") {
    throw new Error("loadProductionRegistry projectRoot must be a non-empty path or file URL.");
  }
  return resolve(projectRoot);
}

export async function loadProductionRegistry(projectRoot) {
  const root = normalizeRoot(projectRoot);
  const config = parseProductionRegistry(
    await readJson(resolve(root, registryFilename), registryFilename),
  );
  const games = [];

  for (const game of config.games) {
    const manifestSourcePath = resolve(root, game.manifestSource);
    const presentationSourcePath = resolve(root, game.presentationSource);
    const manifestResult = GameManifestSourceSchema.safeParse(
      await readJson(manifestSourcePath, game.manifestSource),
    );
    if (!manifestResult.success) {
      throw new Error(
        `${game.manifestSource} violates GameManifestSourceSchema: ${manifestResult.error.message}`,
      );
    }
    const presentationResult = GamePresentationSourceSchema.safeParse(
      await readJson(presentationSourcePath, game.presentationSource),
    );
    if (!presentationResult.success) {
      throw new Error(
        `${game.presentationSource} violates GamePresentationSourceSchema: ${presentationResult.error.message}`,
      );
    }
    const manifest = manifestResult.data;
    const presentation = presentationResult.data;
    if (manifest.id !== game.id) {
      throw new Error(`${game.manifestSource} id must match registry game ${game.id}.`);
    }
    if (presentation.id !== game.id) {
      throw new Error(`${game.presentationSource} id must match registry game ${game.id}.`);
    }
    for (const locale of ["en", "ja", "zh-Hans"]) {
      if (!manifest.locales.supported.includes(locale)) {
        throw new Error(`${game.manifestSource} must support locale ${locale}.`);
      }
    }
    if (dirname(manifestSourcePath) !== dirname(presentationSourcePath)) {
      throw new Error(`Registry sources for game ${game.id} must share one package directory.`);
    }
    const packagePath = resolve(dirname(manifestSourcePath), "package.json");
    const packageJson = await readJson(packagePath, `Package for game ${game.id}`);
    if (packageJson.name !== game.packageName) {
      throw new Error(`Package for game ${game.id} name must be ${game.packageName}.`);
    }
    if (packageJson.private !== true) {
      throw new Error(`Package for game ${game.id} must set private to true.`);
    }
    if (packageJson.version !== manifest.version) {
      throw new Error(`Package and manifest versions for game ${game.id} must match.`);
    }

    requireProductionCoverage(game.manifestSource, game.productionInputs, game.manifestSource);
    requireProductionCoverage(
      game.presentationSource,
      game.productionInputs,
      game.presentationSource,
    );
    for (const input of game.productionInputs) {
      await requireInput(resolve(root, input), `Production input ${input}`);
    }

    const presentationDirectory = dirname(game.presentationSource);
    const covers = [];
    const coverPaths = presentation.cover.candidates.map((candidate) =>
      candidate.path.toLowerCase(),
    );
    if (new Set(coverPaths).size !== coverPaths.length) {
      throw new Error(`Cover candidate paths for game ${game.id} must be unique.`);
    }
    for (const [candidateIndex, candidate] of presentation.cover.candidates.entries()) {
      const previous = presentation.cover.candidates[candidateIndex - 1];
      if (previous && candidate.width <= previous.width) {
        throw new Error(`Cover candidate widths for game ${game.id} must be strictly increasing.`);
      }
      if (previous && candidate.width * previous.height !== previous.width * candidate.height) {
        throw new Error(`Cover candidates for game ${game.id} must share one aspect ratio.`);
      }
      const path = `${presentationDirectory}/${candidate.path}`;
      requireProductionCoverage(path, game.productionInputs, `Cover for game ${game.id}`);
      const sourcePath = resolve(root, path);
      let metadata;
      try {
        metadata = await stat(sourcePath);
      } catch (error) {
        if (error?.code === "ENOENT")
          throw new Error(`Cover for game ${game.id} is missing: ${path}`);
        throw error;
      }
      if (!metadata.isFile()) throw new Error(`Cover for game ${game.id} is not a file: ${path}`);
      covers.push({ ...candidate, sourcePath });
    }

    games.push({
      ...game,
      stagePath: resolve(root, game.stage),
      manifestSourcePath,
      presentationSourcePath,
      manifest,
      presentation,
      covers,
    });
  }

  return {
    schemaVersion: 2,
    projectRoot: root,
    hub: { ...config.hub, stagePath: resolve(root, config.hub.stage) },
    games,
  };
}

export function getRegisteredGame(registry, id) {
  const game = registry.games.find((candidate) => candidate.id === id);
  if (!game) throw new Error(`Game ${String(id)} is not registered in ${registryFilename}.`);
  return game;
}
