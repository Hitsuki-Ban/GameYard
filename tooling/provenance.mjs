import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

import { parseRepositoryRelativePath } from "./production-registry.mjs";

const provenanceIndexPath = "provenance/upstreams.json";
const gameIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const revisionPattern = /^[a-f0-9]{40}$/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const requiredActions = Object.freeze([
  "copy",
  "modify",
  "build",
  "public-host",
  "display-and-run",
  "distribute-source",
  "distribute-static-artifact",
]);
const requiredVenues = Object.freeze([
  "https://github.com/Hitsuki-Ban/GameYard",
  "GitHub Pages",
  "Cloudflare",
]);
const requiredAssetClasses = new Map([
  ["runtime-source-and-localization", "covered"],
  ["programmatic-visuals-and-ui", "covered"],
  ["inline-icon", "covered"],
  ["programmatic-audio", "covered"],
  ["single-file-build", "covered"],
  ["screenshots", "covered"],
  ["documentation-tests-and-build-metadata", "covered"],
  ["font-files", "not-distributed"],
  ["recorded-audio-and-external-runtime-assets", "none-found"],
]);
const requiredThirdPartyBoundaries = Object.freeze([
  "system-fonts",
  "research-references",
  "playwright-development-dependencies",
]);
const requiredProjectDistributions = new Map([
  [
    "tumbledrum",
    Object.freeze({
      url: "https://github.com/Hitsuki-Ban/TUMBLEDRUM",
      revision: "ba6fc680626ac59db793175122600369d48f9834",
      tree: "57b7202e7326a606ad1e4a1a6b39c4300e5034c8",
      license: "LicenseRef-GameYard-TUMBLEDRUM-Distribution",
      rightsRecord: "provenance/tumbledrum/distribution-record.json",
    }),
  ],
]);

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

function requireString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function requirePattern(value, pattern, label) {
  const text = requireString(value, label);
  if (!pattern.test(text)) throw new Error(`${label} has an invalid format.`);
  return text;
}

function requireDateTime(value, label) {
  const text = requireString(value, label);
  if (!text.includes("T") || !Number.isFinite(Date.parse(text))) {
    throw new Error(`${label} must be an explicit date-time.`);
  }
  return text;
}

function requireHttpsUrl(value, label) {
  const text = requireString(value, label);
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`${label} must be an absolute HTTPS URL.`);
  }
  if (url.protocol !== "https:") throw new Error(`${label} must be an absolute HTTPS URL.`);
  return text;
}

function requireExactArray(value, expected, label) {
  if (
    !Array.isArray(value) ||
    value.length !== expected.length ||
    value.some((entry, index) => entry !== expected[index])
  ) {
    throw new Error(`${label} must be exactly: ${expected.join(", ")}.`);
  }
  return [...value];
}

function requireUniqueStringArray(value, label, { allowEmpty = false, paths = false } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    throw new Error(`${label} must be ${allowEmpty ? "an" : "a non-empty"} array.`);
  }
  const seen = new Set();
  return value.map((entry, index) => {
    const entryLabel = `${label}[${index}]`;
    const parsed = paths
      ? parseRepositoryRelativePath(entry, entryLabel)
      : requireString(entry, entryLabel);
    if (seen.has(parsed)) throw new Error(`${label} contains a duplicate: ${parsed}.`);
    seen.add(parsed);
    return parsed;
  });
}

async function readJson(root, path, label) {
  let content;
  try {
    content = await readFile(resolve(root, path), "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") throw new Error(`${label} is missing: ${path}.`);
    throw error;
  }
  try {
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

function parseRepository(value, index) {
  const label = `${provenanceIndexPath} repositories[${index}]`;
  assertExactKeys(
    value,
    ["id", "url", "revision", "tree", "license", "rightsRecord", "publicImportAllowed"],
    label,
  );
  const id = requirePattern(value.id, gameIdPattern, `${label}.id`);
  const url = requireHttpsUrl(value.url, `${label}.url`);
  const revision = requirePattern(value.revision, revisionPattern, `${label}.revision`);
  const tree = requirePattern(value.tree, revisionPattern, `${label}.tree`);
  const license = requireString(value.license, `${label}.license`);
  const rightsRecord =
    value.rightsRecord === null
      ? null
      : parseRepositoryRelativePath(value.rightsRecord, `${label}.rightsRecord`);
  if (typeof value.publicImportAllowed !== "boolean") {
    throw new Error(`${label}.publicImportAllowed must be a boolean.`);
  }
  if (license.startsWith("LicenseRef-") !== (rightsRecord !== null)) {
    throw new Error(`${label} must pair LicenseRef-* with exactly one rightsRecord.`);
  }
  return {
    id,
    url,
    revision,
    tree,
    license,
    rightsRecord,
    publicImportAllowed: value.publicImportAllowed,
  };
}

export function parseProvenanceIndex(value) {
  assertExactKeys(value, ["schemaVersion", "auditedAt", "repositories"], provenanceIndexPath);
  if (value.schemaVersion !== 1) throw new Error(`${provenanceIndexPath} schemaVersion must be 1.`);
  const auditedAt = requireDateTime(value.auditedAt, `${provenanceIndexPath}.auditedAt`);
  if (!Array.isArray(value.repositories) || value.repositories.length === 0) {
    throw new Error(`${provenanceIndexPath}.repositories must be a non-empty array.`);
  }
  const repositories = value.repositories.map(parseRepository);
  const byId = new Map();
  for (const repository of repositories) {
    if (byId.has(repository.id)) {
      throw new Error(`${provenanceIndexPath} has a duplicate repository ID: ${repository.id}.`);
    }
    byId.set(repository.id, repository);
  }
  for (const [gameId, expected] of requiredProjectDistributions) {
    const repository = byId.get(gameId);
    if (!repository) {
      throw new Error(`${provenanceIndexPath} must register the required ${gameId} distribution.`);
    }
    if (
      repository.url !== expected.url ||
      repository.revision !== expected.revision ||
      repository.tree !== expected.tree ||
      repository.license !== expected.license ||
      repository.rightsRecord !== expected.rightsRecord
    ) {
      throw new Error(
        `${provenanceIndexPath} must keep ${gameId} pinned to its required repository, revision, tree, LicenseRef, and rightsRecord.`,
      );
    }
  }
  return { schemaVersion: 1, auditedAt, repositories, byId };
}

function parseEvidence(value, label) {
  assertExactKeys(value, ["path", "sha256"], label);
  return {
    path: parseRepositoryRelativePath(value.path, `${label}.path`),
    sha256: requirePattern(value.sha256, sha256Pattern, `${label}.sha256`),
  };
}

function parseAssetClasses(value, label) {
  if (!Array.isArray(value) || value.length !== requiredAssetClasses.size) {
    throw new Error(`${label} must enumerate all ${requiredAssetClasses.size} required classes.`);
  }
  const parsed = new Map();
  for (const [index, assetClass] of value.entries()) {
    const itemLabel = `${label}[${index}]`;
    assertExactKeys(assetClass, ["id", "coverage", "paths", "evidence"], itemLabel);
    const id = requireString(assetClass.id, `${itemLabel}.id`);
    const expectedCoverage = requiredAssetClasses.get(id);
    if (!expectedCoverage) throw new Error(`${itemLabel}.id is not a required asset class: ${id}.`);
    if (parsed.has(id)) throw new Error(`${label} contains a duplicate asset class: ${id}.`);
    if (assetClass.coverage !== expectedCoverage) {
      throw new Error(`${itemLabel}.coverage must be ${expectedCoverage}.`);
    }
    const paths = requireUniqueStringArray(assetClass.paths, `${itemLabel}.paths`, {
      allowEmpty: expectedCoverage !== "covered",
      paths: true,
    });
    if (expectedCoverage !== "covered" && paths.length !== 0) {
      throw new Error(`${itemLabel}.paths must be empty when coverage is ${expectedCoverage}.`);
    }
    parsed.set(id, {
      id,
      coverage: assetClass.coverage,
      paths,
      evidence: requireString(assetClass.evidence, `${itemLabel}.evidence`),
    });
  }
  return [...parsed.values()];
}

function parseExcludedThirdParty(value, label) {
  if (!Array.isArray(value) || value.length !== requiredThirdPartyBoundaries.length) {
    throw new Error(
      `${label} must enumerate all ${requiredThirdPartyBoundaries.length} required boundaries.`,
    );
  }
  const parsed = new Map();
  for (const [index, exclusion] of value.entries()) {
    const itemLabel = `${label}[${index}]`;
    assertExactKeys(exclusion, ["id", "boundary", "evidence"], itemLabel);
    const id = requireString(exclusion.id, `${itemLabel}.id`);
    if (!requiredThirdPartyBoundaries.includes(id)) {
      throw new Error(`${itemLabel}.id is not a required third-party boundary: ${id}.`);
    }
    if (parsed.has(id)) throw new Error(`${label} contains a duplicate boundary: ${id}.`);
    parsed.set(id, {
      id,
      boundary: requireString(exclusion.boundary, `${itemLabel}.boundary`),
      evidence: requireString(exclusion.evidence, `${itemLabel}.evidence`),
    });
  }
  return [...parsed.values()];
}

export function parseDistributionRecord(value, label = "Distribution record") {
  assertExactKeys(
    value,
    [
      "schemaVersion",
      "recordId",
      "gameId",
      "authorization",
      "upstream",
      "permissions",
      "assetClasses",
      "excludedThirdParty",
    ],
    label,
  );
  if (value.schemaVersion !== 1) throw new Error(`${label}.schemaVersion must be 1.`);
  const recordId = requireString(value.recordId, `${label}.recordId`);
  const gameId = requirePattern(value.gameId, gameIdPattern, `${label}.gameId`);

  assertExactKeys(
    value.authorization,
    ["source", "recordedAt", "taskId", "grantText", "grantTextSha256"],
    `${label}.authorization`,
  );
  if (value.authorization.source !== "owner-project-direction") {
    throw new Error(`${label}.authorization.source must be owner-project-direction.`);
  }
  const authorization = {
    source: value.authorization.source,
    recordedAt: requireDateTime(
      value.authorization.recordedAt,
      `${label}.authorization.recordedAt`,
    ),
    taskId: requireString(value.authorization.taskId, `${label}.authorization.taskId`),
    grantText: parseRepositoryRelativePath(
      value.authorization.grantText,
      `${label}.authorization.grantText`,
    ),
    grantTextSha256: requirePattern(
      value.authorization.grantTextSha256,
      sha256Pattern,
      `${label}.authorization.grantTextSha256`,
    ),
  };

  assertExactKeys(
    value.upstream,
    ["repository", "revision", "tree", "checksumManifest", "assetManifest"],
    `${label}.upstream`,
  );
  const upstream = {
    repository: requireHttpsUrl(value.upstream.repository, `${label}.upstream.repository`),
    revision: requirePattern(
      value.upstream.revision,
      revisionPattern,
      `${label}.upstream.revision`,
    ),
    tree: requirePattern(value.upstream.tree, revisionPattern, `${label}.upstream.tree`),
    checksumManifest: parseEvidence(
      value.upstream.checksumManifest,
      `${label}.upstream.checksumManifest`,
    ),
    assetManifest: parseEvidence(value.upstream.assetManifest, `${label}.upstream.assetManifest`),
  };

  assertExactKeys(value.permissions, ["actions", "venues", "licenseScope"], `${label}.permissions`);
  if (value.permissions.licenseScope !== "GameYard-project-only") {
    throw new Error(`${label}.permissions.licenseScope must be GameYard-project-only.`);
  }
  const permissions = {
    actions: requireExactArray(
      value.permissions.actions,
      requiredActions,
      `${label}.permissions.actions`,
    ),
    venues: requireExactArray(
      value.permissions.venues,
      requiredVenues,
      `${label}.permissions.venues`,
    ),
    licenseScope: value.permissions.licenseScope,
  };

  return {
    schemaVersion: 1,
    recordId,
    gameId,
    authorization,
    upstream,
    permissions,
    assetClasses: parseAssetClasses(value.assetClasses, `${label}.assetClasses`),
    excludedThirdParty: parseExcludedThirdParty(
      value.excludedThirdParty,
      `${label}.excludedThirdParty`,
    ),
  };
}

function parsePositiveSafeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
  return value;
}

function parseNonnegativeSafeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a nonnegative safe integer.`);
  }
  return value;
}

function parseArchiveEntryPath(value, label, directory) {
  const text = requireString(value, label);
  const logicalPath = directory && text.endsWith("/") ? text.slice(0, -1) : text;
  parseRepositoryRelativePath(logicalPath, label);
  if (directory !== text.endsWith("/")) {
    throw new Error(`${label} directory marker does not match its entry kind.`);
  }
  return text;
}

function parseArchiveEvidence(value, label) {
  assertExactKeys(value, ["path", "sha256", "entryCount", "uncompressedBytes"], label);
  return {
    path: parseRepositoryRelativePath(value.path, `${label}.path`),
    sha256: requirePattern(value.sha256, sha256Pattern, `${label}.sha256`),
    entryCount: parsePositiveSafeInteger(value.entryCount, `${label}.entryCount`),
    uncompressedBytes: parsePositiveSafeInteger(
      value.uncompressedBytes,
      `${label}.uncompressedBytes`,
    ),
  };
}

export function parseSourceSnapshotRecord(value, label = "Source snapshot record") {
  assertExactKeys(
    value,
    [
      "schemaVersion",
      "recordId",
      "gameId",
      "authorization",
      "sourceSnapshot",
      "permissions",
      "productionBoundary",
    ],
    label,
  );
  if (value.schemaVersion !== 1) throw new Error(`${label}.schemaVersion must be 1.`);
  const gameId = requirePattern(value.gameId, gameIdPattern, `${label}.gameId`);
  const recordId = requireString(value.recordId, `${label}.recordId`);

  assertExactKeys(
    value.authorization,
    ["source", "recordedAt", "taskId", "grantText", "grantTextSha256"],
    `${label}.authorization`,
  );
  if (value.authorization.source !== "owner-project-direction") {
    throw new Error(`${label}.authorization.source must be owner-project-direction.`);
  }
  const authorization = {
    source: value.authorization.source,
    recordedAt: requireDateTime(
      value.authorization.recordedAt,
      `${label}.authorization.recordedAt`,
    ),
    taskId: requireString(value.authorization.taskId, `${label}.authorization.taskId`),
    grantText: parseRepositoryRelativePath(
      value.authorization.grantText,
      `${label}.authorization.grantText`,
    ),
    grantTextSha256: requirePattern(
      value.authorization.grantTextSha256,
      sha256Pattern,
      `${label}.authorization.grantTextSha256`,
    ),
  };

  assertExactKeys(
    value.sourceSnapshot,
    [
      "kind",
      "archiveAvailability",
      "archive",
      "inventory",
      "importedRoot",
      "repository",
      "revision",
      "license",
    ],
    `${label}.sourceSnapshot`,
  );
  if (value.sourceSnapshot.kind !== "owner-provided-archive") {
    throw new Error(`${label}.sourceSnapshot.kind must be owner-provided-archive.`);
  }
  if (value.sourceSnapshot.archiveAvailability !== "owner-workspace-only") {
    throw new Error(`${label}.sourceSnapshot.archiveAvailability must be owner-workspace-only.`);
  }
  for (const field of ["repository", "revision", "license"]) {
    if (value.sourceSnapshot[field] !== null) {
      throw new Error(`${label}.sourceSnapshot.${field} must be null.`);
    }
  }
  const sourceSnapshot = {
    kind: value.sourceSnapshot.kind,
    archiveAvailability: value.sourceSnapshot.archiveAvailability,
    archive: parseArchiveEvidence(value.sourceSnapshot.archive, `${label}.sourceSnapshot.archive`),
    inventory: parseEvidence(value.sourceSnapshot.inventory, `${label}.sourceSnapshot.inventory`),
    importedRoot: parseRepositoryRelativePath(
      value.sourceSnapshot.importedRoot,
      `${label}.sourceSnapshot.importedRoot`,
    ),
    repository: null,
    revision: null,
    license: null,
  };

  assertExactKeys(value.permissions, ["actions", "venues", "licenseScope"], `${label}.permissions`);
  if (value.permissions.licenseScope !== "GameYard-project-only") {
    throw new Error(`${label}.permissions.licenseScope must be GameYard-project-only.`);
  }
  const permissions = {
    actions: requireExactArray(
      value.permissions.actions,
      requiredActions,
      `${label}.permissions.actions`,
    ),
    venues: requireExactArray(
      value.permissions.venues,
      requiredVenues,
      `${label}.permissions.venues`,
    ),
    licenseScope: value.permissions.licenseScope,
  };

  assertExactKeys(
    value.productionBoundary,
    ["status", "runtimeAdmissionIssue", "excludedFromProductionInputs"],
    `${label}.productionBoundary`,
  );
  if (
    value.productionBoundary.status !== "source-evidence-only" &&
    value.productionBoundary.status !== "production-admitted"
  ) {
    throw new Error(
      `${label}.productionBoundary.status must be source-evidence-only or production-admitted.`,
    );
  }
  const productionBoundary = {
    status: value.productionBoundary.status,
    runtimeAdmissionIssue: parsePositiveSafeInteger(
      value.productionBoundary.runtimeAdmissionIssue,
      `${label}.productionBoundary.runtimeAdmissionIssue`,
    ),
    excludedFromProductionInputs: requireUniqueStringArray(
      value.productionBoundary.excludedFromProductionInputs,
      `${label}.productionBoundary.excludedFromProductionInputs`,
      { paths: true },
    ),
  };
  if (!productionBoundary.excludedFromProductionInputs.includes(sourceSnapshot.archive.path)) {
    throw new Error(`${label} must exclude its source archive from production inputs.`);
  }

  return {
    schemaVersion: 1,
    recordId,
    gameId,
    authorization,
    sourceSnapshot,
    permissions,
    productionBoundary,
  };
}

async function requireMatchingFileHash(root, evidence, label) {
  const content = await readFile(resolve(root, evidence.path));
  const actual = createHash("sha256").update(content).digest("hex");
  if (actual !== evidence.sha256) {
    throw new Error(`${label} hash mismatch: expected ${evidence.sha256}, received ${actual}.`);
  }
  return content;
}

async function verifySourceInventory(root, record, label) {
  const inventoryContent = await requireMatchingFileHash(
    root,
    record.sourceSnapshot.inventory,
    `${label} inventory`,
  );
  let inventory;
  try {
    inventory = JSON.parse(inventoryContent.toString("utf8"));
  } catch (error) {
    throw new Error(`${label} inventory is not valid JSON: ${error.message}`);
  }
  assertExactKeys(inventory, ["schemaVersion", "archive", "entries"], `${label} inventory`);
  if (inventory.schemaVersion !== 1) throw new Error(`${label} inventory schemaVersion must be 1.`);
  const archive = parseArchiveEvidence(inventory.archive, `${label} inventory.archive`);
  if (JSON.stringify(archive) !== JSON.stringify(record.sourceSnapshot.archive)) {
    throw new Error(`${label} inventory archive evidence does not match its record.`);
  }
  if (!Array.isArray(inventory.entries) || inventory.entries.length !== archive.entryCount) {
    throw new Error(`${label} inventory must contain exactly ${archive.entryCount} entries.`);
  }

  const archivePaths = new Set();
  let uncompressedBytes = 0;
  for (const [index, entry] of inventory.entries.entries()) {
    const entryLabel = `${label} inventory.entries[${index}]`;
    assertExactKeys(
      entry,
      ["archivePath", "kind", "uncompressedBytes", "importedPath", "sha256"],
      entryLabel,
    );
    if (entry.kind !== "directory" && entry.kind !== "file") {
      throw new Error(`${entryLabel}.kind must be file or directory.`);
    }
    const archivePath = parseArchiveEntryPath(
      entry.archivePath,
      `${entryLabel}.archivePath`,
      entry.kind === "directory",
    );
    if (archivePaths.has(archivePath)) throw new Error(`${entryLabel}.archivePath is duplicated.`);
    archivePaths.add(archivePath);
    const entryBytes = parseNonnegativeSafeInteger(
      entry.uncompressedBytes,
      `${entryLabel}.uncompressedBytes`,
    );
    uncompressedBytes += entryBytes;
    if (entry.kind === "directory") {
      if (entry.importedPath !== null || entry.sha256 !== null) {
        throw new Error(`${entryLabel} directory evidence must use null importedPath and sha256.`);
      }
      continue;
    }
    if (entryBytes === 0) throw new Error(`${entryLabel} file must not be empty.`);
    const importedPath = parseRepositoryRelativePath(
      entry.importedPath,
      `${entryLabel}.importedPath`,
    );
    if (!importedPath.startsWith(`${record.sourceSnapshot.importedRoot}/`)) {
      throw new Error(`${entryLabel}.importedPath must stay inside the imported root.`);
    }
    const sha256 = requirePattern(entry.sha256, sha256Pattern, `${entryLabel}.sha256`);
    const importedStat = await stat(resolve(root, importedPath));
    if (!importedStat.isFile() || importedStat.size !== entryBytes) {
      throw new Error(`${entryLabel} imported file size does not match the inventory.`);
    }
    await requireMatchingFileHash(
      root,
      { path: importedPath, sha256 },
      `${entryLabel} imported file`,
    );
  }
  if (uncompressedBytes !== archive.uncompressedBytes) {
    throw new Error(`${label} inventory byte total does not match its archive evidence.`);
  }
}

export async function loadProvenanceIndex(projectRoot) {
  const root = resolve(projectRoot);
  return parseProvenanceIndex(await readJson(root, provenanceIndexPath, provenanceIndexPath));
}

export async function requireSourceSnapshotEvidence(projectRoot, recordPath, gameId) {
  const root = resolve(projectRoot);
  const normalizedRecordPath = parseRepositoryRelativePath(
    recordPath,
    "Source snapshot record path",
  );
  const expectedGameId = requirePattern(gameId, gameIdPattern, "Source snapshot game id");
  const label = `Source snapshot record ${normalizedRecordPath}`;
  const record = parseSourceSnapshotRecord(
    await readJson(root, normalizedRecordPath, label),
    label,
  );
  if (record.gameId !== expectedGameId) {
    throw new Error(`${label} does not belong to game ${expectedGameId}.`);
  }
  await requireMatchingFileHash(
    root,
    { path: record.authorization.grantText, sha256: record.authorization.grantTextSha256 },
    `${label} authorization grant`,
  );
  await verifySourceInventory(root, record, label);
  return { recordPath: normalizedRecordPath, record };
}

async function requireRepositoryDistributionRights(projectRoot, provenance, gameId) {
  const root = resolve(projectRoot);
  const repository = provenance.byId.get(gameId);
  if (!repository) throw new Error(`No provenance repository is registered for game ${gameId}.`);
  if (!repository.publicImportAllowed) {
    throw new Error(`Public distribution is not allowed for game ${gameId}.`);
  }
  if (!repository.rightsRecord) return repository;

  const label = `Distribution record ${repository.rightsRecord}`;
  const record = parseDistributionRecord(
    await readJson(root, repository.rightsRecord, label),
    label,
  );
  if (
    record.gameId !== repository.id ||
    record.upstream.repository !== repository.url ||
    record.upstream.revision !== repository.revision ||
    record.upstream.tree !== repository.tree
  ) {
    throw new Error(`${label} does not match ${provenanceIndexPath} for game ${gameId}.`);
  }
  const grantText = await readFile(resolve(root, record.authorization.grantText));
  const actualGrantHash = createHash("sha256").update(grantText).digest("hex");
  if (actualGrantHash !== record.authorization.grantTextSha256) {
    throw new Error(
      `${label} grant text hash mismatch: expected ${record.authorization.grantTextSha256}, received ${actualGrantHash}.`,
    );
  }
  return repository;
}

export async function requireGameDistributionProvenance(
  projectRoot,
  provenance,
  gameId,
  manifestProvenance,
) {
  const root = resolve(projectRoot);
  if (manifestProvenance.kind === "repository") {
    const repository = await requireRepositoryDistributionRights(root, provenance, gameId);
    if (
      repository.url !== manifestProvenance.repository ||
      repository.revision !== manifestProvenance.revision ||
      repository.license !== manifestProvenance.license
    ) {
      throw new Error(`Provenance index does not match manifest provenance for game ${gameId}.`);
    }
    return { kind: "repository", repository };
  }
  if (manifestProvenance.kind !== "owner-provided-source-snapshot") {
    throw new Error(`Unsupported manifest provenance kind for game ${gameId}.`);
  }
  const label = `Source snapshot record ${manifestProvenance.record}`;
  const { recordPath, record } = await requireSourceSnapshotEvidence(
    root,
    manifestProvenance.record,
    gameId,
  );
  if (record.sourceSnapshot.archive.sha256 !== manifestProvenance.archiveSha256) {
    throw new Error(`${label} archive hash does not match manifest provenance for game ${gameId}.`);
  }
  if (record.productionBoundary.status !== "production-admitted") {
    throw new Error(`${label} is not admitted to production.`);
  }
  return { kind: "owner-provided-source-snapshot", recordPath, record };
}
