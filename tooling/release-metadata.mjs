import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  GameCatalogSchema,
  GameManifestSchema,
  PROTOCOL_VERSION,
} from "../packages/game-contract/src/index.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const sourceShaPattern = /^[0-9a-f]{40}$/u;

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

async function readText(file, label) {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") throw new Error(`${label} is missing: ${file}`);
    throw error;
  }
}

async function readJson(file, label) {
  const content = await readText(file, label);
  try {
    return { content, value: JSON.parse(content) };
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

function assertBuildInfo(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value.schemaVersion !== 1 ||
    typeof value.buildId !== "string" ||
    !Array.isArray(value.files) ||
    !value.files.every((file) => typeof file === "string")
  ) {
    throw new Error("dist/build-info.json violates the release metadata contract");
  }
  return value;
}

export async function createReleaseMetadata(root, sourceSha) {
  if (!sourceShaPattern.test(sourceSha)) {
    throw new Error("Release source SHA must be exactly 40 lowercase hexadecimal characters");
  }
  const dist = resolve(root, "dist");
  const buildInfo = assertBuildInfo(
    (await readJson(resolve(dist, "build-info.json"), "dist/build-info.json")).value,
  );
  const catalogFile = resolve(dist, "games/catalog.json");
  const catalogJson = await readJson(catalogFile, "dist/games/catalog.json");
  const catalogResult = GameCatalogSchema.safeParse(catalogJson.value);
  if (!catalogResult.success) throw new Error("dist/games/catalog.json violates GameCatalogSchema");
  const catalog = catalogResult.data;
  if (catalog.buildId !== buildInfo.buildId) {
    throw new Error("Release catalog and build-info.json use different build IDs");
  }

  const manifests = [];
  for (const game of catalog.games) {
    const manifestPath = `games/${game.manifest.slice(2)}`;
    const manifestJson = await readJson(resolve(dist, manifestPath), `dist/${manifestPath}`);
    const manifestResult = GameManifestSchema.safeParse(manifestJson.value);
    if (!manifestResult.success)
      throw new Error(`dist/${manifestPath} violates GameManifestSchema`);
    const manifest = manifestResult.data;
    if (manifest.id !== game.id || manifest.buildId !== buildInfo.buildId) {
      throw new Error(`dist/${manifestPath} does not belong to the release artifact`);
    }
    manifests.push({
      gameId: manifest.id,
      version: manifest.version,
      path: manifestPath,
      sha256: sha256(manifestJson.content),
      repository: manifest.provenance.repository,
      revision: manifest.provenance.revision,
      license: manifest.provenance.license,
    });
  }

  const provenancePath = "provenance/upstreams.json";
  const provenance = await readText(resolve(root, provenancePath), provenancePath);
  const deploymentConfigPath = "wrangler.jsonc";
  const deploymentConfig = await readText(
    resolve(root, deploymentConfigPath),
    deploymentConfigPath,
  );
  const deploymentWorkerPath = "deployment/cloudflare-worker.mjs";
  const deploymentWorker = await readText(
    resolve(root, deploymentWorkerPath),
    deploymentWorkerPath,
  );
  return {
    schemaVersion: 2,
    sourceSha,
    buildId: buildInfo.buildId,
    protocol: PROTOCOL_VERSION,
    fileCount: buildInfo.files.length,
    catalog: {
      path: "games/catalog.json",
      sha256: sha256(catalogJson.content),
    },
    manifests,
    provenance: {
      path: provenancePath,
      sha256: sha256(provenance),
    },
    deployment: {
      config: {
        path: deploymentConfigPath,
        sha256: sha256(deploymentConfig),
      },
      worker: {
        path: deploymentWorkerPath,
        sha256: sha256(deploymentWorker),
      },
    },
  };
}

function parseArguments(argv) {
  const [command, sourceFlag, sourceSha, fileFlag, file, ...rest] = argv;
  if (
    (command !== "write" && command !== "verify") ||
    sourceFlag !== "--source-sha" ||
    !sourceSha ||
    fileFlag !== "--file" ||
    !file ||
    rest.length !== 0
  ) {
    throw new Error(
      "Usage: release-metadata.mjs <write|verify> --source-sha <40-hex-sha> --file <metadata.json>",
    );
  }
  return { command, sourceSha, file: resolve(file) };
}

async function main() {
  const arguments_ = parseArguments(process.argv.slice(2));
  const expected = await createReleaseMetadata(projectRoot, arguments_.sourceSha);
  const serialized = `${JSON.stringify(expected, null, 2)}\n`;
  if (arguments_.command === "write") {
    await mkdir(dirname(arguments_.file), { recursive: true });
    await writeFile(arguments_.file, serialized);
    console.log(`Release metadata written: ${expected.buildId}; source ${expected.sourceSha}`);
    return;
  }
  const actual = await readText(arguments_.file, "Release metadata");
  if (actual !== serialized) throw new Error("Release metadata does not match dist and source SHA");
  console.log(`Release metadata verified: ${expected.buildId}; source ${expected.sourceSha}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
