import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  GameManifestSchema,
  GameManifestSourceSchema,
  PUBLIC_LOCALES,
} from "@gameyard/game-contract";

const projectRoot = path.resolve(import.meta.dirname, "../../..");
const gameRoot = path.join(projectRoot, "games/neon-overdrive");
const guestRoot = path.join(gameRoot, "guest");
const candidateRoot = path.join(projectRoot, ".gameyard/candidates/neon-overdrive");

const requiredCandidateInputs = Object.freeze([
  { path: "pnpm-lock.yaml", kind: "file" },
  { path: "games/neon-overdrive/candidate.manifest.source.json", kind: "file" },
  { path: "games/neon-overdrive/package.json", kind: "file" },
  { path: "games/neon-overdrive/tsconfig.json", kind: "file" },
  { path: "games/neon-overdrive/vite.candidate.config.ts", kind: "file" },
  { path: "games/neon-overdrive/vite.testkit.config.ts", kind: "file" },
  { path: "games/neon-overdrive/playwright.runtime.config.ts", kind: "file" },
  { path: "games/neon-overdrive/tools/verify-candidate.mjs", kind: "file" },
  { path: "games/neon-overdrive/guest", kind: "directory" },
  { path: "packages/game-contract/package.json", kind: "file" },
  { path: "packages/game-contract/src", kind: "directory" },
  { path: "packages/guest-bridge/package.json", kind: "file" },
  { path: "packages/guest-bridge/src", kind: "directory" },
  { path: "packages/manifest-tools/package.json", kind: "file" },
  { path: "packages/manifest-tools/src", kind: "directory" },
  { path: "provenance/neon-overdrive", kind: "directory" },
]);

const expectedCapabilities = Object.freeze([
  "audio",
  "fullscreen",
  "keyboard",
  "pointer",
  "touch",
  "gamepad",
]);
const forbiddenArtifactPaths = new Set([
  "game.js",
  "styles.css",
  "NEON_OVERDRIVE.html",
  "preview.png",
  "overdrive-preview.png",
  "boss-preview.png",
  "run_local.sh",
  "run_local.bat",
]);
const forbiddenArtifactMarkers = [
  "__NEON_OVERDRIVE__",
  "__NEON_DEBUG__",
  "__NEON_DISPOSE_REPORT__",
  "__GAMEYARD_TESTKIT__",
  "prepareGraze",
  "prepareGuardBoundary",
  "prepareThreat",
  "prepareCollisionPriority",
  "prepareContactDamage",
  "prepareReverseEnemyHit",
  "preparePendingDeathAbsorption",
  "preparePrunedPlayerShots",
  "prepareDiverPowerKill",
  "prepareEliteKill",
  "prepareBossMissileHit",
  "prepareMissileFlight",
  "prepareBossPhaseBreak",
  "simulationRng",
  "directorClock",
  "presentationEntities",
  "ringParticleCount",
  "lineParticleCount",
  "presentationState",
  "pickupAggregate",
  "collisionTargets",
  "testkitEventBuffer",
  "controls:null",
  "neon-overdrive-save-v1",
  "navigator.serviceWorker",
  "serviceWorker.register",
  "requestFullscreen(",
  "exitFullscreen(",
];

function isMissingFileError(error) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function requirePath(inputPath, kind, label) {
  let metadata;
  try {
    metadata = await stat(inputPath);
  } catch (error) {
    if (isMissingFileError(error)) throw new Error(`${label} is missing.`);
    throw error;
  }
  if (kind === "file" && !metadata.isFile()) throw new Error(`${label} must be a file.`);
  if (kind === "directory" && !metadata.isDirectory()) {
    throw new Error(`${label} must be a directory.`);
  }
}

async function collectDirectoryFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectDirectoryFiles(entryPath)));
    else if (entry.isFile()) files.push(entryPath);
    else throw new Error(`Unsupported candidate input: ${entryPath}`);
  }
  return files;
}

function comparePaths(left, right) {
  const leftPath = path.relative(projectRoot, left).split(path.sep).join("/");
  const rightPath = path.relative(projectRoot, right).split(path.sep).join("/");
  return leftPath < rightPath ? -1 : leftPath > rightPath ? 1 : 0;
}

export async function listNeonCandidateBuildInputs() {
  const files = [];
  for (const input of requiredCandidateInputs) {
    const inputPath = path.join(projectRoot, input.path);
    await requirePath(inputPath, input.kind, `Required Neon candidate input ${input.path}`);
    if (input.kind === "file") files.push(inputPath);
    else {
      const directoryFiles = await collectDirectoryFiles(inputPath);
      if (directoryFiles.length === 0) {
        throw new Error(`Required Neon candidate input directory is empty: ${input.path}`);
      }
      files.push(...directoryFiles);
    }
  }

  const logicalPaths = new Set();
  for (const file of files) {
    const logicalPath = path.relative(projectRoot, file).split(path.sep).join("/").toLowerCase();
    if (logicalPaths.has(logicalPath)) {
      throw new Error(`Neon candidate inputs resolve to the same file: ${logicalPath}`);
    }
    logicalPaths.add(logicalPath);
  }
  return files.sort(comparePaths);
}

export async function createNeonCandidateBuildId() {
  const hash = createHash("sha256");
  for (const file of await listNeonCandidateBuildInputs()) {
    const logicalPath = path.relative(projectRoot, file).split(path.sep).join("/");
    const content = await readFile(file);
    hash.update(`${logicalPath.length}:${logicalPath}:${content.byteLength}:`);
    hash.update(content);
  }
  return `gameyard@${hash.digest("hex").slice(0, 16)}`;
}

export async function listNeonGuestDevFiles() {
  await requirePath(guestRoot, "directory", "Neon candidate guest root");
  const files = (await collectDirectoryFiles(guestRoot))
    .map((file) => path.relative(guestRoot, file).split(path.sep).join("/"))
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  for (const required of ["index.html", "src/main.ts"]) {
    if (!files.includes(required)) throw new Error(`Neon candidate guest is missing ${required}.`);
  }
  return ["game.manifest.json", ...files].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
}

async function readJson(file, label) {
  let value;
  try {
    value = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    throw new Error(`${label} is not valid JSON.`, { cause: error });
  }
  return value;
}

function requireRelativeArtifactUrls(relativeFile, source) {
  const checks = [
    /(?:src|href)\s*=\s*["']\/(?!\/)/iu,
    /(?:src|href)\s*=\s*["']\/\//iu,
    /url\(\s*["']?\/(?!\/)/iu,
    /\bimport\s*\(\s*["']\//u,
  ];
  if (checks.some((pattern) => pattern.test(source))) {
    throw new Error(`Neon candidate artifact contains a non-relative URL in ${relativeFile}.`);
  }
}

async function verifyCandidate() {
  await requirePath(candidateRoot, "directory", "Neon candidate artifact");
  const expectedBuildId = await createNeonCandidateBuildId();
  const source = GameManifestSourceSchema.parse(
    await readJson(
      path.join(gameRoot, "candidate.manifest.source.json"),
      "Candidate manifest source",
    ),
  );
  const manifest = GameManifestSchema.parse(
    await readJson(path.join(candidateRoot, "game.manifest.json"), "Candidate manifest"),
  );
  const packageJson = await readJson(path.join(gameRoot, "package.json"), "Neon package");

  assert.equal(source.id, "neon-overdrive");
  assert.equal(source.version, packageJson.version);
  assert.deepEqual(source.locales, {
    source: "zh-Hans",
    supported: [...PUBLIC_LOCALES],
  });
  assert.deepEqual(source.capabilities, expectedCapabilities);
  assert.deepEqual(source.provenance, {
    kind: "owner-provided-source-snapshot",
    record: "provenance/neon-overdrive/source-snapshot.json",
    archiveSha256: "08ceef2d930c801bab64ff4cbeab39129d3f5f088ee9344e3ac0a80e5e976883",
  });

  const { buildId, files: manifestFiles, ...manifestSource } = manifest;
  assert.equal(buildId, expectedBuildId, "Candidate build ID does not match its strict inputs.");
  assert.deepEqual(manifestSource, source, "Built manifest does not match candidate source.");

  const artifactFiles = (await collectDirectoryFiles(candidateRoot))
    .map((file) => path.relative(candidateRoot, file).split(path.sep).join("/"))
    .sort();
  const executableSources = [];
  assert.deepEqual(
    manifestFiles,
    artifactFiles,
    "Manifest files do not exactly bind the artifact.",
  );
  for (const relativeFile of artifactFiles) {
    const basename = path.posix.basename(relativeFile);
    if (forbiddenArtifactPaths.has(basename)) {
      throw new Error(`Neon candidate contains archive-owned or monolithic file ${relativeFile}.`);
    }
    if (/^(?:sw|service-worker)(?:[.-]|$)/iu.test(basename) || /workbox/iu.test(basename)) {
      throw new Error(`Neon candidate contains a Service Worker artifact: ${relativeFile}.`);
    }
    if (!/\.(?:css|html|js|json)$/iu.test(relativeFile)) continue;
    const content = await readFile(path.join(candidateRoot, relativeFile), "utf8");
    if (/\.js$/iu.test(relativeFile)) executableSources.push(content);
    requireRelativeArtifactUrls(relativeFile, content);
    for (const marker of forbiddenArtifactMarkers) {
      if (content.includes(marker)) {
        throw new Error(`Neon candidate ${relativeFile} contains forbidden marker ${marker}.`);
      }
    }
  }

  const entryHtml = await readFile(path.join(candidateRoot, source.entry), "utf8");
  const canvases = [...entryHtml.matchAll(/<canvas\b[^>]*>/giu)].map((match) => match[0]);
  const fixedInMarkup = canvases.some(
    (canvas) => /\bwidth=["']540["']/iu.test(canvas) && /\bheight=["']960["']/iu.test(canvas),
  );
  const fixedInRuntime = executableSources.some((content) =>
    /\.width=540[,;][\s\S]{0,80}?\.height=960(?:[,;]|\b)/u.test(content),
  );
  if (!fixedInMarkup && !fixedInRuntime) {
    throw new Error("Neon candidate entry must declare a fixed 540x960 canvas.");
  }

  const registry = await readJson(
    path.join(projectRoot, "site.assembly.json"),
    "Production registry",
  );
  if (!Array.isArray(registry.games))
    throw new Error("Production registry games must be an array.");
  if (registry.games.some((game) => game?.id === "neon-overdrive")) {
    throw new Error("Neon candidate must remain absent from the production registry.");
  }

  console.log(
    `Neon candidate verified: ${buildId}; ${artifactFiles.length} files; production registry unchanged.`,
  );
}

const invokedPath = process.argv[1] === undefined ? undefined : path.resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) await verifyCandidate();
