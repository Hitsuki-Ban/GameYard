import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { GameCatalogSchema, GameManifestSchema } from "../packages/game-contract/src/index.ts";
import { parseAssemblyConfig } from "./assembly-config.mjs";
import { createArtifactBuildId } from "./artifact-build-id.mjs";
import {
  inspectArtifactFiles,
  inspectArtifactText,
  listArtifactFiles,
} from "./artifact-inspector.mjs";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const productionDirectory = fileURLToPath(new URL("../dist/", import.meta.url));
const buildIdPattern = /^gameyard@[a-f0-9]{16}$/u;

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

function assertRelativeFileList(files, label) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error(`${label} must be a non-empty array.`);
  }
  const unique = new Set();
  for (const file of files) {
    if (
      typeof file !== "string" ||
      file.length === 0 ||
      file.includes("\\") ||
      file.startsWith("/") ||
      file.split("/").some((part) => part === "" || part === "." || part === "..")
    ) {
      throw new Error(`${label} contains an invalid relative file path: ${String(file)}`);
    }
    const folded = file.toLowerCase();
    if (unique.has(folded)) throw new Error(`${label} contains a case collision: ${file}`);
    unique.add(folded);
  }
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

function assertExactFiles(actualFiles, declaredFiles, label) {
  const actual = [...actualFiles].sort(compareStrings);
  const declared = [...declaredFiles].sort(compareStrings);
  if (actual.length !== declared.length || actual.some((file, index) => file !== declared[index])) {
    throw new Error(`${label} files are not declared exactly.`);
  }
}

export async function verifyProductionArtifact(
  directory = productionDirectory,
  reportRoot = projectRoot,
) {
  const root = resolve(directory);
  const files = await listArtifactFiles(root);
  if (files.length === 0) throw new Error("Production artifact is empty.");

  const failures = await inspectArtifactFiles(files, root, { allowHubPwa: true });
  if (failures.length > 0) {
    throw new Error(`Production artifact verification failed:\n- ${failures.join("\n- ")}`);
  }

  const buildInfoPath = resolve(root, "build-info.json");
  const catalogPath = resolve(root, "games/catalog.json");
  const buildInfo = await readJson(buildInfoPath, "build-info.json");
  const parsedCatalog = GameCatalogSchema.safeParse(
    await readJson(catalogPath, "games/catalog.json"),
  );
  if (!parsedCatalog.success) {
    throw new Error(
      `games/catalog.json violates GameCatalogSchema: ${parsedCatalog.error.message}`,
    );
  }
  const catalog = parsedCatalog.data;
  const assemblyConfig = parseAssemblyConfig(
    await readJson(resolve(reportRoot, "site.assembly.json"), "site.assembly.json"),
  );

  assertExactKeys(buildInfo, ["schemaVersion", "buildId", "files"], "build-info.json");
  if (buildInfo.schemaVersion !== 1) throw new Error("build-info.json schemaVersion must be 1.");
  if (!buildIdPattern.test(buildInfo.buildId)) {
    throw new Error("build-info.json buildId must match gameyard@<16 lowercase hex>.");
  }
  assertRelativeFileList(buildInfo.files, "build-info.json files");
  if (buildInfo.files.some((file, index) => index > 0 && buildInfo.files[index - 1] > file)) {
    throw new Error("build-info.json files must be sorted.");
  }

  if (catalog.buildId !== buildInfo.buildId) {
    throw new Error("games/catalog.json buildId does not match build-info.json.");
  }
  if (catalog.games.length !== assemblyConfig.games.length) {
    throw new Error("games/catalog.json games do not match site.assembly.json.");
  }

  const expectedBuildId = await createArtifactBuildId(reportRoot);
  if (buildInfo.buildId !== expectedBuildId) {
    throw new Error(
      `Production artifact buildId mismatch: expected ${expectedBuildId}, received ${buildInfo.buildId}.`,
    );
  }

  const actualFiles = files
    .map((file) => relative(root, file).replaceAll("\\", "/"))
    .sort(compareStrings);
  const declaredFiles = [...buildInfo.files].sort(compareStrings);
  if (
    actualFiles.length !== declaredFiles.length ||
    actualFiles.some((file, index) => file !== declaredFiles[index])
  ) {
    throw new Error("build-info.json files do not exactly declare the production artifact.");
  }

  if (!actualFiles.includes("index.html"))
    throw new Error("Production Hub entry is missing: index.html");
  const serviceWorkers = actualFiles.filter((file) =>
    /(?:^|\/)(?:service-worker|service_worker|serviceworker|sw)\.js$/iu.test(file),
  );
  if (serviceWorkers.length !== 1 || serviceWorkers[0] !== "service-worker.js") {
    throw new Error("Production artifact must contain exactly one root service-worker.js.");
  }
  if (!actualFiles.includes("manifest.webmanifest")) {
    throw new Error("Production Hub web manifest is missing: manifest.webmanifest");
  }
  const webManifest = await readJson(resolve(root, "manifest.webmanifest"), "manifest.webmanifest");
  if (
    webManifest.id !== "./" ||
    webManifest.start_url !== "./" ||
    webManifest.scope !== "./" ||
    webManifest.display !== "standalone" ||
    !Array.isArray(webManifest.icons) ||
    !["192x192", "512x512"].every((size) =>
      webManifest.icons.some(
        (icon) =>
          icon?.sizes === size &&
          typeof icon.src === "string" &&
          icon.src.startsWith("./") &&
          actualFiles.includes(icon.src.slice(2)),
      ),
    )
  ) {
    throw new Error("manifest.webmanifest violates the relative installability contract.");
  }
  const serviceWorker = await readFile(resolve(root, "service-worker.js"), "utf8");
  if (
    !serviceWorker.includes(buildInfo.buildId) ||
    !serviceWorker.includes("gameyard-") ||
    !serviceWorker.includes("registration.scope")
  ) {
    throw new Error(
      "service-worker.js is not bound to the exact artifact and per-game cache contract.",
    );
  }
  const hubJavaScript = (
    await Promise.all(
      actualFiles
        .filter((file) => file.startsWith("assets/") && file.endsWith(".js"))
        .map((file) => readFile(resolve(root, file), "utf8")),
    )
  ).join("\n");
  if ((hubJavaScript.match(/serviceWorker\.register/gu) ?? []).length !== 1) {
    throw new Error("Production Hub must register exactly one Service Worker.");
  }
  if ((hubJavaScript.match(/service-worker\.js/gu) ?? []).length !== 1) {
    throw new Error("Production Hub registration must target the one root service-worker.js.");
  }

  const allowedGameFiles = new Set(["games/catalog.json"]);
  for (const [index, game] of catalog.games.entries()) {
    const stageConfig = assemblyConfig.games[index];
    if (!stageConfig) {
      throw new Error(`site.assembly.json is missing stage for catalog game ${game.id}.`);
    }
    const parsedStageManifest = GameManifestSchema.safeParse(
      await readJson(
        resolve(reportRoot, stageConfig.stage, "game.manifest.json"),
        `Stage ${stageConfig.stage} game manifest`,
      ),
    );
    if (!parsedStageManifest.success) {
      throw new Error(
        `Stage ${stageConfig.stage} game manifest violates GameManifestSchema: ${parsedStageManifest.error.message}`,
      );
    }
    if (game.id !== parsedStageManifest.data.id) {
      throw new Error(
        `games/catalog.json games[${index}].id does not match its stage manifest identity.`,
      );
    }

    const expectedManifestReference = `./${game.id}/game.manifest.json`;
    if (game.manifest !== expectedManifestReference) {
      throw new Error(
        `games/catalog.json games[${index}].manifest must be ${expectedManifestReference}.`,
      );
    }
    const manifestPath = resolve(root, "games", game.id, "game.manifest.json");
    const parsedManifest = GameManifestSchema.safeParse(
      await readJson(manifestPath, `Game ${game.id} manifest`),
    );
    if (!parsedManifest.success) {
      throw new Error(
        `Game ${game.id} manifest violates GameManifestSchema: ${parsedManifest.error.message}`,
      );
    }
    const manifest = parsedManifest.data;
    if (manifest.id !== game.id)
      throw new Error(`Game ${game.id} manifest ID does not match catalog.`);
    if (manifest.buildId !== buildInfo.buildId) {
      throw new Error(`Game ${game.id} manifest buildId does not match build-info.json.`);
    }
    const expectedEntryReference = `./${game.id}/${manifest.entry}`;
    if (game.entry !== expectedEntryReference) {
      throw new Error(
        `games/catalog.json games[${index}].entry must be ${expectedEntryReference}.`,
      );
    }

    const gameRoot = resolve(root, "games", game.id);
    const gameFiles = (await listArtifactFiles(gameRoot)).map((file) =>
      relative(gameRoot, file).replaceAll("\\", "/"),
    );
    assertExactFiles(gameFiles, manifest.files, `Game ${game.id}`);
    for (const file of manifest.files) allowedGameFiles.add(`games/${game.id}/${file}`);
  }

  const rogueGamePath = actualFiles.find(
    (file) =>
      (file.toLowerCase() === "games" || file.toLowerCase().startsWith("games/")) &&
      !allowedGameFiles.has(file),
  );
  if (rogueGamePath) {
    throw new Error(`Production artifact contains an unregistered games path: ${rogueGamePath}`);
  }

  return { buildId: buildInfo.buildId, fileCount: files.length, gameCount: catalog.games.length };
}

async function main() {
  const { buildId, fileCount, gameCount } = await verifyProductionArtifact();
  console.log(
    `Production artifact verified: ${buildId}; ${fileCount} files; ${gameCount} games; one Hub Service Worker; no Lab runtime, game Service Worker, or repository-prefix-breaking root-absolute URLs.`,
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) await main();

export { inspectArtifactText };
