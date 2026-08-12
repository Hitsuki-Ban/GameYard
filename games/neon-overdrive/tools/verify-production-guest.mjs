import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  GameManifestSchema,
  GameManifestSourceSchema,
  PUBLIC_LOCALES,
} from "@gameyard/game-contract";

import { createArtifactBuildId } from "../../../tooling/artifact-build-id.mjs";

const projectRoot = path.resolve(import.meta.dirname, "../../..");
const gameRoot = path.join(projectRoot, "games/neon-overdrive");
const stageRoot = path.join(projectRoot, ".gameyard/stage/games/neon-overdrive");
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
  "performanceCounters",
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

async function collectDirectoryFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectDirectoryFiles(entryPath)));
    else if (entry.isFile()) files.push(entryPath);
    else throw new Error(`Unsupported Neon production artifact input: ${entryPath}`);
  }
  return files;
}

async function readJson(file, label) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    throw new Error(`${label} is not valid JSON.`, { cause: error });
  }
}

function requireRelativeArtifactUrls(relativeFile, source) {
  const checks = [
    /(?:src|href)\s*=\s*["']\/(?!\/)/iu,
    /(?:src|href)\s*=\s*["']\/\//iu,
    /url\(\s*["']?\/(?!\/)/iu,
    /\bimport\s*\(\s*["']\//u,
  ];
  if (checks.some((pattern) => pattern.test(source))) {
    throw new Error(`Neon production artifact contains a non-relative URL in ${relativeFile}.`);
  }
}

async function verifyProductionGuest() {
  const expectedBuildId = await createArtifactBuildId();
  const source = GameManifestSourceSchema.parse(
    await readJson(path.join(gameRoot, "game.manifest.source.json"), "Neon manifest source"),
  );
  const manifest = GameManifestSchema.parse(
    await readJson(path.join(stageRoot, "game.manifest.json"), "Neon production manifest"),
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
  assert.equal(
    buildId,
    expectedBuildId,
    "Neon production build ID does not match the release inputs.",
  );
  assert.deepEqual(manifestSource, source, "Built Neon manifest does not match its source.");

  const artifactFiles = (await collectDirectoryFiles(stageRoot))
    .map((file) => path.relative(stageRoot, file).split(path.sep).join("/"))
    .sort();
  const executableSources = [];
  assert.deepEqual(manifestFiles, artifactFiles, "Neon manifest does not exactly bind its stage.");
  for (const relativeFile of artifactFiles) {
    const basename = path.posix.basename(relativeFile);
    if (forbiddenArtifactPaths.has(basename)) {
      throw new Error(`Neon production stage contains archive-owned file ${relativeFile}.`);
    }
    if (/^(?:sw|service-worker)(?:[.-]|$)/iu.test(basename) || /workbox/iu.test(basename)) {
      throw new Error(`Neon production stage contains a Service Worker artifact: ${relativeFile}.`);
    }
    if (!/\.(?:css|html|js|json)$/iu.test(relativeFile)) continue;
    const content = await readFile(path.join(stageRoot, relativeFile), "utf8");
    if (/\.js$/iu.test(relativeFile)) executableSources.push(content);
    requireRelativeArtifactUrls(relativeFile, content);
    for (const marker of forbiddenArtifactMarkers) {
      if (content.includes(marker)) {
        throw new Error(
          `Neon production stage ${relativeFile} contains forbidden marker ${marker}.`,
        );
      }
    }
  }

  const entryHtml = await readFile(path.join(stageRoot, source.entry), "utf8");
  const canvases = [...entryHtml.matchAll(/<canvas\b[^>]*>/giu)].map((match) => match[0]);
  const fixedInMarkup = canvases.some(
    (canvas) => /\bwidth=["']540["']/iu.test(canvas) && /\bheight=["']960["']/iu.test(canvas),
  );
  const fixedInRuntime = executableSources.some((content) =>
    /\.width=540[,;][\s\S]{0,80}?\.height=960(?:[,;]|\b)/u.test(content),
  );
  if (!fixedInMarkup && !fixedInRuntime) {
    throw new Error("Neon production entry must declare a fixed 540x960 canvas.");
  }

  console.log(`Neon production Guest verified: ${buildId}; ${artifactFiles.length} files.`);
}

const invokedPath = process.argv[1] === undefined ? undefined : path.resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) await verifyProductionGuest();
