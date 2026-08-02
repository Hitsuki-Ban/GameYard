import { copyFile, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";

import { GameCatalogSchema, GameManifestSchema } from "../packages/game-contract/src/index.ts";
import { createArtifactBuildId } from "./artifact-build-id.mjs";
import { inspectArtifactFiles, listArtifactFiles } from "./artifact-inspector.mjs";
import { parseAssemblyConfig, parseRepositoryRelativePath } from "./assembly-config.mjs";
import { loadProvenanceIndex, requireGameDistributionRights } from "./provenance.mjs";

const assemblyConfigFilename = "site.assembly.json";
const manifestFilename = "game.manifest.json";
const hubManifestFilename = "hub.manifest.json";
const provenanceIndexFilename = "provenance/upstreams.json";

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

function toLogicalPath(root, file) {
  return relative(root, file).split(sep).join("/");
}

async function readJson(file, label) {
  let content;
  try {
    content = await readFile(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") throw new Error(`${label} is missing: ${file}`);
    throw error;
  }
  try {
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

async function requireDirectory(directory, label) {
  let metadata;
  try {
    metadata = await stat(directory);
  } catch (error) {
    if (error?.code === "ENOENT") throw new Error(`${label} is missing: ${directory}`);
    throw error;
  }
  if (!metadata.isDirectory()) throw new Error(`${label} is not a directory: ${directory}`);
}

function assertExactDeclaredFiles(stage, actualFiles, declaredFiles, label) {
  const actual = actualFiles.map((file) => toLogicalPath(stage, file)).sort(compareStrings);
  const declared = [...declaredFiles].sort(compareStrings);
  const actualFolded = new Set();
  for (const file of actual) {
    const folded = file.toLowerCase();
    if (actualFolded.has(folded)) throw new Error(`${label} has a case-colliding file: ${file}`);
    actualFolded.add(folded);
  }
  const declaredFolded = new Set();
  for (const file of declared) {
    const folded = file.toLowerCase();
    if (declaredFolded.has(folded)) {
      throw new Error(`${label} manifest has a case-colliding file: ${file}`);
    }
    declaredFolded.add(folded);
  }
  if (actual.length !== declared.length || actual.some((file, index) => file !== declared[index])) {
    const undeclared = actual.filter((file) => !declared.includes(file));
    const missing = declared.filter((file) => !actual.includes(file));
    throw new Error(
      `${label} files do not match its manifest; undeclared: ${undeclared.join(", ") || "none"}; missing: ${missing.join(", ") || "none"}.`,
    );
  }
}

function assertNoDestinationCollisions(entries) {
  const byFoldedPath = new Map();
  for (const entry of entries) {
    parseRepositoryRelativePath(entry.destination, `Output path ${entry.destination}`);
    const folded = entry.destination.toLowerCase();
    const previous = byFoldedPath.get(folded);
    if (previous) {
      throw new Error(
        `Output path collision between ${previous.destination} and ${entry.destination}.`,
      );
    }
    byFoldedPath.set(folded, entry);
  }

  for (const entry of entries) {
    const parts = entry.destination.toLowerCase().split("/");
    for (let index = 1; index < parts.length; index += 1) {
      const parent = parts.slice(0, index).join("/");
      const collidingFile = byFoldedPath.get(parent);
      if (collidingFile) {
        throw new Error(
          `Output file/directory collision between ${collidingFile.destination} and ${entry.destination}.`,
        );
      }
    }
  }
}

async function inspectStage(files, stage, label, options) {
  const failures = await inspectArtifactFiles(files, stage, options);
  if (failures.length > 0) {
    throw new Error(`${label} artifact inspection failed:\n- ${failures.join("\n- ")}`);
  }
}

export async function createAssemblyPlan(projectRoot) {
  const root = resolve(projectRoot);
  const config = parseAssemblyConfig(
    await readJson(resolve(root, assemblyConfigFilename), assemblyConfigFilename),
  );
  const provenance = await loadProvenanceIndex(root);
  const distributions = new Map();
  for (const repository of provenance.repositories) {
    if (repository.rightsRecord) {
      distributions.set(
        repository.id,
        await requireGameDistributionRights(root, provenance, repository.id),
      );
    }
  }
  const gameStages = [];
  const gameIds = new Set();
  for (const gameConfig of config.games) {
    const stage = resolve(root, gameConfig.stage);
    await requireDirectory(stage, `Game stage ${gameConfig.stage}`);
    const manifestPath = resolve(stage, manifestFilename);
    const parsedManifest = GameManifestSchema.safeParse(
      await readJson(manifestPath, `${gameConfig.stage}/${manifestFilename}`),
    );
    if (!parsedManifest.success) {
      throw new Error(
        `${gameConfig.stage}/${manifestFilename} violates GameManifestSchema: ${parsedManifest.error.message}`,
      );
    }
    const manifest = parsedManifest.data;
    const foldedId = manifest.id.toLowerCase();
    if (gameIds.has(foldedId)) throw new Error(`Game ID collision: ${manifest.id}`);
    gameIds.add(foldedId);
    if (!distributions.has(manifest.id)) {
      distributions.set(
        manifest.id,
        await requireGameDistributionRights(root, provenance, manifest.id),
      );
    }
    gameStages.push({ gameConfig, stage, manifest, distribution: distributions.get(manifest.id) });
  }
  const buildId = await createArtifactBuildId(root);
  const hubStage = resolve(root, config.hubStage);
  await requireDirectory(hubStage, "Hub stage");
  const hubFiles = await listArtifactFiles(hubStage);
  if (hubFiles.length === 0) throw new Error("Hub stage is empty.");
  const reservedHubPath = hubFiles
    .map((file) => toLogicalPath(hubStage, file))
    .find((file) => file.toLowerCase() === "games" || file.toLowerCase().startsWith("games/"));
  if (reservedHubPath) {
    throw new Error(`Hub stage must not write to the reserved games namespace: ${reservedHubPath}`);
  }
  const hubManifest = await readJson(
    resolve(hubStage, hubManifestFilename),
    `Hub stage ${hubManifestFilename}`,
  );
  assertExactKeys(hubManifest, ["schemaVersion", "buildId", "entry"], hubManifestFilename);
  if (hubManifest.schemaVersion !== 1)
    throw new Error("hub.manifest.json schemaVersion must be 1.");
  if (hubManifest.buildId !== buildId) {
    throw new Error(
      `hub.manifest.json buildId mismatch: expected ${buildId}, received ${String(hubManifest.buildId)}.`,
    );
  }
  if (hubManifest.entry !== "index.html") {
    throw new Error('hub.manifest.json entry must be "index.html".');
  }
  if (!hubFiles.some((file) => toLogicalPath(hubStage, file) === hubManifest.entry)) {
    throw new Error(`Hub stage entry is missing: ${hubManifest.entry}`);
  }
  await inspectStage(hubFiles, hubStage, "Hub stage", { allowHubPwa: true });

  const entries = hubFiles
    .filter((source) => toLogicalPath(hubStage, source) !== hubManifestFilename)
    .map((source) => ({
      source,
      destination: toLogicalPath(hubStage, source),
    }));
  const games = [];

  for (const { gameConfig, stage, manifest, distribution } of gameStages) {
    if (
      manifest.provenance.repository !== distribution.url ||
      manifest.provenance.revision !== distribution.revision ||
      manifest.provenance.license !== distribution.license
    ) {
      throw new Error(
        `${gameConfig.stage}/${manifestFilename} provenance does not match ${provenanceIndexFilename} for game ${manifest.id}.`,
      );
    }
    if (manifest.buildId !== buildId) {
      throw new Error(
        `${gameConfig.stage}/${manifestFilename} buildId mismatch: expected ${buildId}, received ${manifest.buildId}.`,
      );
    }
    const gameFiles = await listArtifactFiles(stage);
    assertExactDeclaredFiles(stage, gameFiles, manifest.files, `Game ${manifest.id}`);
    await inspectStage(gameFiles, stage, `Game ${manifest.id}`);

    for (const source of gameFiles) {
      entries.push({
        source,
        destination: `games/${manifest.id}/${toLogicalPath(stage, source)}`,
      });
    }
    games.push({
      id: manifest.id,
      entry: `./${manifest.id}/${manifest.entry}`,
      manifest: `./${manifest.id}/${manifestFilename}`,
    });
  }

  entries.push(
    { source: undefined, destination: "build-info.json" },
    { source: undefined, destination: "games/catalog.json" },
  );
  assertNoDestinationCollisions(entries);

  const files = entries.map((entry) => entry.destination).sort(compareStrings);
  return {
    buildId,
    config,
    entries: entries.filter((entry) => entry.source !== undefined),
    buildInfo: { schemaVersion: 1, buildId, files },
    catalog: GameCatalogSchema.parse({ schemaVersion: 1, buildId, games }),
  };
}

async function writeJson(file, value) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeAssembly(plan, directory) {
  for (const entry of plan.entries) {
    const destination = resolve(directory, entry.destination);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(entry.source, destination);
  }
  await writeJson(resolve(directory, "build-info.json"), plan.buildInfo);
  await writeJson(resolve(directory, "games/catalog.json"), plan.catalog);
}

const filesystemOperations = { rename, rm, stat };

async function pathExists(path, operations) {
  try {
    await operations.stat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

export async function replaceDirectoryTransactional(next, destination, backup, operations) {
  const hadDestination = await pathExists(destination, operations);
  if (hadDestination) {
    const destinationStat = await operations.stat(destination);
    if (!destinationStat.isDirectory()) {
      throw new Error(`Production destination is not a directory: ${destination}`);
    }
    await operations.rename(destination, backup);
  }

  try {
    await operations.rename(next, destination);
  } catch (installError) {
    if (hadDestination) await operations.rename(backup, destination);
    throw installError;
  }

  if (hadDestination) {
    try {
      await operations.rm(backup, { recursive: true });
    } catch (cleanupError) {
      throw new Error(
        `New production artifact is installed, but previous artifact cleanup failed; residual backup remains at ${backup}.`,
        { cause: cleanupError },
      );
    }
  }
}

export async function assembleSite(projectRoot) {
  const root = resolve(projectRoot);
  const plan = await createAssemblyPlan(root);
  const transactionParent = resolve(root, ".gameyard");
  await mkdir(transactionParent, { recursive: true });
  const next = await mkdtemp(resolve(transactionParent, "assembly-"));
  const backup = `${next}-previous`;
  const destination = resolve(root, "dist");

  try {
    await writeAssembly(plan, next);
    await replaceDirectoryTransactional(next, destination, backup, filesystemOperations);
  } catch (error) {
    await rm(next, { recursive: true, force: true }).catch((cleanupError) => {
      throw new AggregateError([error, cleanupError], "Assembly and transaction cleanup failed.");
    });
    throw error;
  }

  return {
    buildId: plan.buildId,
    fileCount: plan.buildInfo.files.length,
    gameCount: plan.catalog.games.length,
  };
}
