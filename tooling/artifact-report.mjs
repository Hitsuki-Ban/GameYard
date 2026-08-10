import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { GameCatalogSchema } from "../packages/game-contract/src/index.ts";
import { listArtifactFiles } from "./artifact-inspector.mjs";
import { loadStaticAssetPolicy } from "./static-asset-policy.mjs";
import { verifyPublishedArtifact } from "./verify-production.mjs";

const gameIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function assertExactKeys(value, expected, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  const actual = Object.keys(value).sort(compareStrings);
  const required = [...expected].sort(compareStrings);
  if (actual.length !== required.length || actual.some((key, index) => key !== required[index])) {
    throw new Error(`${label} fields must be exactly: ${required.join(", ")}.`);
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

function summarizeGroup(files) {
  return {
    totalBytes: files.reduce((total, file) => total + file.bytes, 0),
    fileCount: files.length,
  };
}

async function verifyMetricArtifact(root, files) {
  const actualFiles = files
    .map((file) => relative(root, file).replaceAll("\\", "/"))
    .sort(compareStrings);
  const buildInfo = await readJson(resolve(root, "build-info.json"), "build-info.json");
  assertExactKeys(buildInfo, ["schemaVersion", "buildId", "files"], "build-info.json");
  if (
    buildInfo.schemaVersion !== 1 ||
    typeof buildInfo.buildId !== "string" ||
    !/^gameyard@[a-f0-9]{16}$/u.test(buildInfo.buildId) ||
    !Array.isArray(buildInfo.files) ||
    !buildInfo.files.every((file) => typeof file === "string")
  ) {
    throw new Error("Historical artifact build-info.json violates the metric contract.");
  }
  const declaredFiles = [...buildInfo.files].sort(compareStrings);
  if (
    buildInfo.files.some((file, index) => index > 0 && buildInfo.files[index - 1] > file) ||
    new Set(buildInfo.files.map((file) => file.toLowerCase())).size !== buildInfo.files.length ||
    actualFiles.length !== declaredFiles.length ||
    actualFiles.some((file, index) => file !== declaredFiles[index])
  ) {
    throw new Error("Historical artifact build-info.json does not declare its exact file set.");
  }
  const catalogResult = GameCatalogSchema.safeParse(
    await readJson(resolve(root, "games/catalog.json"), "games/catalog.json"),
  );
  if (!catalogResult.success || catalogResult.data.buildId !== buildInfo.buildId) {
    throw new Error("Historical artifact catalog violates the metric contract.");
  }
  return { buildId: buildInfo.buildId, catalog: catalogResult.data };
}

async function scanArtifact(directory, largestFileCount, verification) {
  const root = resolve(directory);
  const artifactFiles = await listArtifactFiles(root);
  const metricIdentity = await verifyMetricArtifact(root, artifactFiles);
  if (verification === "published") await verifyPublishedArtifact(root);
  const files = await Promise.all(
    artifactFiles.map(async (file) => ({
      path: relative(root, file).replaceAll("\\", "/"),
      bytes: (await stat(file)).size,
    })),
  );
  files.sort((left, right) => compareStrings(left.path, right.path));
  const games = metricIdentity.catalog.games.map((game) => {
    const prefix = `games/${game.id}/`;
    return {
      gameId: game.id,
      ...summarizeGroup(files.filter((file) => file.path.startsWith(prefix))),
    };
  });
  const gamePrefixes = games.map((game) => `games/${game.gameId}/`);
  const hubFiles = files.filter(
    (file) => !gamePrefixes.some((prefix) => file.path.startsWith(prefix)),
  );
  const largestFiles = [...files]
    .sort((left, right) => right.bytes - left.bytes || compareStrings(left.path, right.path))
    .slice(0, largestFileCount);
  return {
    buildId: metricIdentity.buildId,
    ...summarizeGroup(files),
    hub: summarizeGroup(hubFiles),
    games,
    largestFiles,
  };
}

function withoutLargestFiles(summary) {
  return {
    buildId: summary.buildId,
    totalBytes: summary.totalBytes,
    fileCount: summary.fileCount,
    hub: summary.hub,
    games: summary.games,
  };
}

function createDelta(current, previous) {
  const previousGames = new Map(previous.games.map((game) => [game.gameId, game]));
  const currentIds = new Set(current.games.map((game) => game.gameId));
  const orderedGameIds = [
    ...current.games.map((game) => game.gameId),
    ...previous.games.map((game) => game.gameId).filter((gameId) => !currentIds.has(gameId)),
  ];
  const currentGames = new Map(current.games.map((game) => [game.gameId, game]));
  return {
    totalBytes: current.totalBytes - previous.totalBytes,
    fileCount: current.fileCount - previous.fileCount,
    hub: {
      totalBytes: current.hub.totalBytes - previous.hub.totalBytes,
      fileCount: current.hub.fileCount - previous.hub.fileCount,
    },
    games: orderedGameIds.map((gameId) => {
      const currentGame = currentGames.get(gameId) ?? { totalBytes: 0, fileCount: 0 };
      const previousGame = previousGames.get(gameId) ?? { totalBytes: 0, fileCount: 0 };
      return {
        gameId,
        totalBytes: currentGame.totalBytes - previousGame.totalBytes,
        fileCount: currentGame.fileCount - previousGame.fileCount,
      };
    }),
  };
}

function enforcePolicy(current, policy) {
  const failures = [];
  const warnings = [];
  if (current.fileCount > policy.maximumFileCount) {
    failures.push(
      `Artifact has ${current.fileCount} files; Cloudflare deployment limit is ${policy.maximumFileCount}.`,
    );
  } else if (current.fileCount >= policy.warningFileCount) {
    warnings.push(
      `Artifact file count ${current.fileCount} reached the ${policy.warningFileCount} warning threshold.`,
    );
  }
  for (const file of current.largestFiles) {
    if (file.bytes > policy.maximumFileBytes) {
      failures.push(
        `${file.path} is ${file.bytes} bytes; Cloudflare single-file limit is ${policy.maximumFileBytes}.`,
      );
    } else if (file.bytes >= policy.warningFileBytes) {
      warnings.push(
        `${file.path} is ${file.bytes} bytes and reached the ${policy.warningFileBytes} warning threshold.`,
      );
    }
  }
  if (failures.length > 0) {
    throw new Error(`Static asset policy failed:\n- ${failures.join("\n- ")}`);
  }
  return warnings;
}

function policySnapshot(content, policy) {
  return { sha256: sha256(content), ...policy };
}

export async function createArtifactReport(directory, previousDirectory, policyFile) {
  const loadedPolicy = await loadStaticAssetPolicy(policyFile);
  const current = await scanArtifact(directory, loadedPolicy.policy.largestFileCount, "published");
  const previous = withoutLargestFiles(
    await scanArtifact(previousDirectory, loadedPolicy.policy.largestFileCount, "metrics-only"),
  );
  const warnings = enforcePolicy(current, loadedPolicy.policy);
  return {
    schemaVersion: 1,
    policy: policySnapshot(loadedPolicy.content, loadedPolicy.policy),
    current,
    previous,
    delta: createDelta(current, previous),
    warnings,
  };
}

function requireSafeInteger(value, label, { nonnegative = true } = {}) {
  if (!Number.isSafeInteger(value) || (nonnegative && value < 0)) {
    throw new Error(`${label} must be a ${nonnegative ? "nonnegative " : ""}safe integer.`);
  }
  return value;
}

function validateGroup(value, label, { delta = false } = {}) {
  assertExactKeys(value, ["totalBytes", "fileCount"], label);
  return {
    totalBytes: requireSafeInteger(value.totalBytes, `${label}.totalBytes`, {
      nonnegative: !delta,
    }),
    fileCount: requireSafeInteger(value.fileCount, `${label}.fileCount`, { nonnegative: !delta }),
  };
}

function validateGames(value, label, { delta = false } = {}) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  const ids = new Set();
  return value.map((game, index) => {
    const gameLabel = `${label}[${index}]`;
    assertExactKeys(game, ["gameId", "totalBytes", "fileCount"], gameLabel);
    if (typeof game.gameId !== "string" || !gameIdPattern.test(game.gameId)) {
      throw new Error(`${gameLabel}.gameId must be a GameYard game ID.`);
    }
    if (ids.has(game.gameId)) throw new Error(`${label} contains duplicate game ${game.gameId}.`);
    ids.add(game.gameId);
    return {
      gameId: game.gameId,
      ...validateGroup({ totalBytes: game.totalBytes, fileCount: game.fileCount }, gameLabel, {
        delta,
      }),
    };
  });
}

function validateSummary(value, label) {
  assertExactKeys(value, ["buildId", "totalBytes", "fileCount", "hub", "games"], label);
  if (typeof value.buildId !== "string" || !/^gameyard@[a-f0-9]{16}$/u.test(value.buildId)) {
    throw new Error(`${label}.buildId must be a GameYard build ID.`);
  }
  return {
    buildId: value.buildId,
    ...validateGroup({ totalBytes: value.totalBytes, fileCount: value.fileCount }, label),
    hub: validateGroup(value.hub, `${label}.hub`),
    games: validateGames(value.games, `${label}.games`),
  };
}

function validateDelta(value) {
  assertExactKeys(value, ["totalBytes", "fileCount", "hub", "games"], "Artifact report delta");
  return {
    ...validateGroup(
      { totalBytes: value.totalBytes, fileCount: value.fileCount },
      "Artifact report delta",
      { delta: true },
    ),
    hub: validateGroup(value.hub, "Artifact report delta.hub", { delta: true }),
    games: validateGames(value.games, "Artifact report delta.games", { delta: true }),
  };
}

function validateCurrent(value) {
  assertExactKeys(
    value,
    ["buildId", "totalBytes", "fileCount", "hub", "games", "largestFiles"],
    "Artifact report current",
  );
  const base = validateSummary(
    {
      buildId: value.buildId,
      totalBytes: value.totalBytes,
      fileCount: value.fileCount,
      hub: value.hub,
      games: value.games,
    },
    "Artifact report current",
  );
  if (!Array.isArray(value.largestFiles)) {
    throw new Error("Artifact report current.largestFiles must be an array.");
  }
  const paths = new Set();
  const largestFiles = value.largestFiles.map((file, index) => {
    const label = `Artifact report current.largestFiles[${index}]`;
    assertExactKeys(file, ["path", "bytes"], label);
    if (
      typeof file.path !== "string" ||
      file.path.length === 0 ||
      file.path.startsWith("/") ||
      file.path.includes("\\")
    ) {
      throw new Error(`${label}.path must be a relative artifact path.`);
    }
    if (paths.has(file.path))
      throw new Error(`Artifact report contains duplicate file ${file.path}.`);
    paths.add(file.path);
    return { path: file.path, bytes: requireSafeInteger(file.bytes, `${label}.bytes`) };
  });
  return { ...base, largestFiles };
}

function equal(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function verifyArtifactReport(directory, policyFile, reportFile) {
  const loadedPolicy = await loadStaticAssetPolicy(policyFile);
  const actual = await readJson(resolve(reportFile), "Artifact report");
  assertExactKeys(
    actual,
    ["schemaVersion", "policy", "current", "previous", "delta", "warnings"],
    "Artifact report",
  );
  if (actual.schemaVersion !== 1) throw new Error("Artifact report schemaVersion must be 1.");
  const expectedPolicy = policySnapshot(loadedPolicy.content, loadedPolicy.policy);
  if (!equal(actual.policy, expectedPolicy)) {
    throw new Error("Artifact report policy does not match deployment/static-asset-policy.json.");
  }
  const current = validateCurrent(actual.current);
  const previous = validateSummary(actual.previous, "Artifact report previous");
  const delta = validateDelta(actual.delta);
  if (
    !Array.isArray(actual.warnings) ||
    !actual.warnings.every((warning) => typeof warning === "string")
  ) {
    throw new Error("Artifact report warnings must be an array of strings.");
  }
  const expectedCurrent = await scanArtifact(
    directory,
    loadedPolicy.policy.largestFileCount,
    "published",
  );
  if (!equal(current, expectedCurrent)) {
    throw new Error("Artifact report current metrics do not match the published artifact.");
  }
  const expectedWarnings = enforcePolicy(expectedCurrent, loadedPolicy.policy);
  if (!equal(actual.warnings, expectedWarnings)) {
    throw new Error("Artifact report warnings do not match the deployment policy.");
  }
  const expectedDelta = createDelta(current, previous);
  if (!equal(delta, expectedDelta)) {
    throw new Error("Artifact report delta does not match current and previous metrics.");
  }
  return actual;
}

function signed(value) {
  return value > 0 ? `+${value}` : String(value);
}

function formatMiB(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

export function renderArtifactReportSummary(report) {
  const lines = [
    "### Static asset budget",
    "",
    `- Current: \`${report.current.buildId}\` — ${formatMiB(report.current.totalBytes)}, ${report.current.fileCount} files`,
    `- Previous: \`${report.previous.buildId}\` — ${formatMiB(report.previous.totalBytes)}, ${report.previous.fileCount} files`,
    `- Delta: ${signed(report.delta.totalBytes)} bytes, ${signed(report.delta.fileCount)} files`,
    `- Limits: ${formatMiB(report.policy.maximumFileBytes)} per file; ${report.policy.maximumFileCount} files; warnings at ${formatMiB(report.policy.warningFileBytes)} and ${report.policy.warningFileCount} files`,
    "",
    "| Surface | Current size | Files | Size delta | File delta |",
    "| --- | ---: | ---: | ---: | ---: |",
    `| Hub | ${formatMiB(report.current.hub.totalBytes)} | ${report.current.hub.fileCount} | ${signed(report.delta.hub.totalBytes)} B | ${signed(report.delta.hub.fileCount)} |`,
  ];
  const deltas = new Map(report.delta.games.map((game) => [game.gameId, game]));
  for (const game of report.current.games) {
    const delta = deltas.get(game.gameId);
    lines.push(
      `| ${game.gameId} | ${formatMiB(game.totalBytes)} | ${game.fileCount} | ${signed(delta?.totalBytes ?? 0)} B | ${signed(delta?.fileCount ?? 0)} |`,
    );
  }
  lines.push("", "Largest files:", "");
  for (const file of report.current.largestFiles) {
    lines.push(`- \`${file.path}\`: ${formatMiB(file.bytes)} (${file.bytes} bytes)`);
  }
  if (report.warnings.length > 0) {
    lines.push("", "Warnings:", "", ...report.warnings.map((warning) => `- ${warning}`));
  }
  return `${lines.join("\n")}\n`;
}

async function writeReport(directory, previousDirectory, policyFile, outputFile, summaryFile) {
  const report = await createArtifactReport(directory, previousDirectory, policyFile);
  await mkdir(dirname(resolve(outputFile)), { recursive: true });
  await writeFile(resolve(outputFile), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(resolve(summaryFile), renderArtifactReportSummary(report), { flag: "a" });
  console.log(
    `Artifact report written: ${report.current.buildId}; ${report.current.fileCount} files; ${report.current.games.length} games; delta ${signed(report.delta.totalBytes)} bytes.`,
  );
}

async function main() {
  const args = process.argv.slice(2);
  if (
    args.length === 11 &&
    args[0] === "write" &&
    args[1] === "--directory" &&
    args[3] === "--previous-directory" &&
    args[5] === "--policy" &&
    args[7] === "--output" &&
    args[9] === "--github-summary"
  ) {
    await writeReport(args[2], args[4], args[6], args[8], args[10]);
    return;
  }
  if (
    args.length === 7 &&
    args[0] === "verify" &&
    args[1] === "--directory" &&
    args[3] === "--policy" &&
    args[5] === "--file"
  ) {
    const report = await verifyArtifactReport(args[2], args[4], args[6]);
    console.log(
      `Artifact report verified: ${report.current.buildId}; ${report.current.fileCount} files; ${report.current.games.length} games.`,
    );
    return;
  }
  throw new Error(
    "Usage: artifact-report.mjs write --directory <dist> --previous-directory <dist> --policy <policy.json> --output <report.json> --github-summary <summary.md> | verify --directory <dist> --policy <policy.json> --file <report.json>",
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) await main();

export { enforcePolicy };
