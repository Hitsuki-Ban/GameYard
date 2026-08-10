import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const gameRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const projectRoot = resolve(gameRoot, "../..");
const recordPath = "provenance/kamifuda-runner/source-snapshot.json";
const inventoryPath = "provenance/kamifuda-runner/source-inventory.json";
const expectedArchiveSha256 = "5f2d6469b12ec50674b80aaa45a2519cad67fbf4938921e61814a458241f7752";
const sha256Pattern = /^[a-f0-9]{64}$/u;

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readJson(repositoryPath) {
  let text;
  try {
    text = await readFile(resolve(projectRoot, repositoryPath), "utf8");
  } catch (error) {
    if (error?.code === "ENOENT")
      throw new Error(`Required provenance is missing: ${repositoryPath}.`);
    throw error;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${repositoryPath} is not valid JSON: ${error.message}`);
  }
}

async function sha256(repositoryPath) {
  let bytes;
  try {
    bytes = await readFile(resolve(projectRoot, repositoryPath));
  } catch (error) {
    if (error?.code === "ENOENT")
      throw new Error(`Required evidence is missing: ${repositoryPath}.`);
    throw error;
  }
  return createHash("sha256").update(bytes).digest("hex");
}

function assertEvidence(value, label) {
  assertExactKeys(value, ["path", "sha256"], label);
  assert(typeof value.path === "string" && value.path.length > 0, `${label}.path is required.`);
  assert(sha256Pattern.test(value.sha256), `${label}.sha256 must be lowercase SHA-256.`);
}

async function main() {
  const record = await readJson(recordPath);
  assertExactKeys(
    record,
    [
      "schemaVersion",
      "recordId",
      "gameId",
      "authorization",
      "sourceSnapshot",
      "permissions",
      "productionBoundary",
    ],
    recordPath,
  );
  assert(record.schemaVersion === 1, `${recordPath}.schemaVersion must be 1.`);
  assert(record.gameId === "kamifuda-runner", `${recordPath}.gameId must be kamifuda-runner.`);

  assertExactKeys(
    record.authorization,
    ["source", "recordedAt", "taskId", "grantText", "grantTextSha256"],
    `${recordPath}.authorization`,
  );
  assert(record.authorization.source === "owner-project-direction", "Owner direction is required.");
  assert(sha256Pattern.test(record.authorization.grantTextSha256), "Grant hash is invalid.");
  assert(
    (await sha256(record.authorization.grantText)) === record.authorization.grantTextSha256,
    "Owner direction hash does not match the recorded grant.",
  );

  assertExactKeys(
    record.sourceSnapshot,
    ["kind", "archive", "inventory", "importedRoot", "repository", "revision", "license"],
    `${recordPath}.sourceSnapshot`,
  );
  assert(
    record.sourceSnapshot.kind === "owner-provided-archive",
    "Snapshot kind must be explicit.",
  );
  assert(
    record.sourceSnapshot.repository === null,
    "A repository must not be invented for this archive.",
  );
  assert(
    record.sourceSnapshot.revision === null,
    "A revision must not be invented for this archive.",
  );
  assert(
    record.sourceSnapshot.license === null,
    "A public license must not be invented for this archive.",
  );
  assert(record.sourceSnapshot.importedRoot === "games/kamifuda-runner", "Imported root changed.");
  assertExactKeys(
    record.sourceSnapshot.archive,
    ["path", "sha256", "entryCount", "uncompressedBytes"],
    `${recordPath}.sourceSnapshot.archive`,
  );
  assert(
    record.sourceSnapshot.archive.sha256 === expectedArchiveSha256,
    "Archive SHA-256 changed.",
  );
  assert(record.sourceSnapshot.archive.entryCount === 12, "Archive entry count changed.");
  assert(record.sourceSnapshot.archive.uncompressedBytes === 467437, "Archive byte count changed.");
  assertEvidence(record.sourceSnapshot.inventory, `${recordPath}.sourceSnapshot.inventory`);
  assert(record.sourceSnapshot.inventory.path === inventoryPath, "Inventory path changed.");
  assert(
    (await sha256(inventoryPath)) === record.sourceSnapshot.inventory.sha256,
    "Inventory hash does not match the snapshot record.",
  );

  assertExactKeys(
    record.permissions,
    ["actions", "venues", "licenseScope"],
    `${recordPath}.permissions`,
  );
  assert(
    record.permissions.licenseScope === "GameYard-project-only",
    "Distribution scope changed.",
  );
  assertExactKeys(
    record.productionBoundary,
    ["status", "runtimeAdmissionIssue", "excludedFromProductionInputs"],
    `${recordPath}.productionBoundary`,
  );
  assert(
    record.productionBoundary.status === "source-evidence-only",
    "Source was admitted too early.",
  );
  assert(
    record.productionBoundary.runtimeAdmissionIssue === 55,
    "Runtime admission issue changed.",
  );
  for (const requiredPath of [
    "games/kamifuda-runner-v4.zip",
    "games/kamifuda-runner/kamifuda-runner-v4-standalone.html",
    "games/kamifuda-runner/build.py",
    "games/kamifuda-runner-v3-standalone.html",
    "games/kamifuda-runner-v3.zip",
    "games/CHECKSUMS.txt",
  ]) {
    assert(
      record.productionBoundary.excludedFromProductionInputs.includes(requiredPath),
      `Production exclusion is missing: ${requiredPath}.`,
    );
  }

  const inventory = await readJson(inventoryPath);
  assertExactKeys(inventory, ["schemaVersion", "archive", "entries"], inventoryPath);
  assert(inventory.schemaVersion === 1, `${inventoryPath}.schemaVersion must be 1.`);
  assertExactKeys(
    inventory.archive,
    ["path", "sha256", "entryCount", "uncompressedBytes"],
    `${inventoryPath}.archive`,
  );
  assert(
    inventory.archive.path === record.sourceSnapshot.archive.path,
    "Archive path records diverged.",
  );
  assert(inventory.archive.sha256 === expectedArchiveSha256, "Inventory archive SHA-256 changed.");
  assert(inventory.entries.length === 12, "Inventory must contain all 12 archive entries.");

  const archivePaths = new Set();
  let totalBytes = 0;
  let importedFiles = 0;
  for (const [index, entry] of inventory.entries.entries()) {
    const label = `${inventoryPath}.entries[${index}]`;
    assertExactKeys(
      entry,
      ["archivePath", "kind", "uncompressedBytes", "importedPath", "sha256"],
      label,
    );
    assert(!archivePaths.has(entry.archivePath), `${label}.archivePath is duplicated.`);
    archivePaths.add(entry.archivePath);
    totalBytes += entry.uncompressedBytes;
    if (entry.kind === "directory") {
      assert(
        entry.importedPath === null && entry.sha256 === null,
        `${label} directory evidence is invalid.`,
      );
      continue;
    }
    assert(entry.kind === "file", `${label}.kind must be file or directory.`);
    assert(typeof entry.importedPath === "string", `${label}.importedPath is required.`);
    assert(
      entry.importedPath.startsWith("games/kamifuda-runner/"),
      `${label} escaped the imported root.`,
    );
    assert(sha256Pattern.test(entry.sha256), `${label}.sha256 is invalid.`);
    const fileStat = await stat(resolve(projectRoot, entry.importedPath));
    assert(fileStat.isFile(), `${entry.importedPath} is not a file.`);
    assert(fileStat.size === entry.uncompressedBytes, `${entry.importedPath} byte count changed.`);
    assert(
      (await sha256(entry.importedPath)) === entry.sha256,
      `${entry.importedPath} SHA-256 changed.`,
    );
    importedFiles += 1;
  }
  assert(importedFiles === 11, "Inventory must bind all 11 imported files.");
  assert(totalBytes === 467437, "Inventory uncompressed byte total changed.");

  console.log(`Kamifuda source snapshot verified: ${importedFiles} files, ${totalBytes} bytes.`);
}

await main();
