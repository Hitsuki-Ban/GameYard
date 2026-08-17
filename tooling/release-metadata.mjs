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

function requireBuildInfo(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value.schemaVersion !== 1 ||
    typeof value.buildId !== "string"
  ) {
    throw new Error("dist/build-info.json cannot provide a release build ID");
  }
  return value;
}

export async function createReleaseMetadata(root, sourceSha) {
  if (!sourceShaPattern.test(sourceSha)) {
    throw new Error("Release source SHA must be exactly 40 lowercase hexadecimal characters");
  }
  const dist = resolve(root, "dist");
  const buildInfo = requireBuildInfo(
    await readJson(resolve(dist, "build-info.json"), "dist/build-info.json"),
  );
  const catalogResult = GameCatalogSchema.safeParse(
    await readJson(resolve(dist, "games/catalog.json"), "dist/games/catalog.json"),
  );
  if (!catalogResult.success) throw new Error("dist/games/catalog.json violates GameCatalogSchema");
  if (catalogResult.data.buildId !== buildInfo.buildId) {
    throw new Error("Release catalog and build-info.json use different build IDs");
  }

  const games = [];
  for (const game of catalogResult.data.games) {
    const manifestResult = GameManifestSchema.safeParse(
      await readJson(
        resolve(dist, "games", game.id, "game.manifest.json"),
        `Game ${game.id} manifest`,
      ),
    );
    if (!manifestResult.success) {
      throw new Error(`Game ${game.id} manifest violates GameManifestSchema`);
    }
    const manifest = manifestResult.data;
    if (manifest.id !== game.id || manifest.buildId !== buildInfo.buildId) {
      throw new Error(`Game ${game.id} manifest does not belong to the release build`);
    }
    games.push({ id: manifest.id, version: manifest.version });
  }

  return {
    schemaVersion: 1,
    sourceSha,
    buildId: buildInfo.buildId,
    protocol: PROTOCOL_VERSION,
    games,
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
    console.log(`Release metadata written: ${expected.buildId}; ${expected.games.length} games.`);
    return;
  }
  const actual = await readFile(arguments_.file, "utf8");
  if (actual !== serialized) throw new Error("Release metadata does not match the built site");
  console.log(`Release metadata verified: ${expected.buildId}; ${expected.games.length} games.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
