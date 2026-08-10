import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createCandidateBuildId, validateCandidateSource } from "./candidate-build.mjs";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const candidateRoot = path.resolve(projectRoot, "../../.gameyard/candidates/kamifuda-runner");
const source = validateCandidateSource(
  JSON.parse(await readFile(path.join(projectRoot, "candidate.manifest.source.json"), "utf8")),
);
const manifest = JSON.parse(
  await readFile(path.join(candidateRoot, "candidate.manifest.json"), "utf8"),
);
const expectedManifestKeys = [...Object.keys(source), "buildId", "files"].sort((left, right) =>
  left.localeCompare(right),
);
const actualManifestKeys = Object.keys(manifest).sort((left, right) => left.localeCompare(right));
if (JSON.stringify(actualManifestKeys) !== JSON.stringify(expectedManifestKeys)) {
  throw new Error("Candidate manifest has unknown or missing fields.");
}
const expectedBuildId = await createCandidateBuildId(projectRoot);
if (manifest.buildId !== expectedBuildId) {
  throw new Error("Candidate build ID does not bind the active candidate inputs.");
}
for (const key of Object.keys(source)) {
  if (JSON.stringify(manifest[key]) !== JSON.stringify(source[key]))
    throw new Error(`Candidate manifest field ${key} diverged.`);
}
if (
  !Array.isArray(manifest.files) ||
  !manifest.files.includes("candidate.manifest.json") ||
  !manifest.files.includes(source.entry)
) {
  throw new Error("Candidate manifest files are incomplete.");
}

async function filesAt(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesAt(target)));
    else files.push(target);
  }
  return files;
}

const files = await filesAt(candidateRoot);
const actualFiles = files
  .map((file) => path.relative(candidateRoot, file).replaceAll("\\", "/"))
  .sort((left, right) => left.localeCompare(right));
const manifestFiles = [...manifest.files].sort((left, right) => left.localeCompare(right));
if (
  new Set(manifest.files).size !== manifest.files.length ||
  JSON.stringify(manifestFiles) !== JSON.stringify(actualFiles)
) {
  throw new Error("Candidate manifest files do not exactly match the candidate artifact.");
}
const snapshotRecord = JSON.parse(
  await readFile(path.resolve(projectRoot, "../../", source.sourceSnapshot.record), "utf8"),
);
if (snapshotRecord.sourceSnapshot.archive.sha256 !== source.sourceSnapshot.archiveSha256) {
  throw new Error("Candidate source snapshot binding diverged from provenance.");
}
const forbiddenNames = ["game.js", "build.py", "kamifuda-runner-v4-standalone.html"];
const forbiddenContent = [
  "kamifuda.runner.profile",
  "__KAMIFUDA_DEBUG__",
  "__KAMIFUDA_DISPOSE_REPORT__",
  "__GAMEYARD_TESTKIT__",
  "__KAMIFUDA_TEST__",
  "requestFullscreen(",
  "exitFullscreen(",
];
for (const file of files) {
  const relative = path.relative(candidateRoot, file).replaceAll("\\", "/");
  if (forbiddenNames.includes(path.basename(file)))
    throw new Error(`Forbidden candidate artifact: ${relative}`);
  if (!/\.(?:html|js|json|css)$/u.test(file)) continue;
  const content = await readFile(file, "utf8");
  for (const marker of forbiddenContent) {
    if (content.includes(marker))
      throw new Error(`Candidate artifact ${relative} contains ${marker}.`);
  }
}
process.stdout.write(`Kamifuda candidate artifact passed (${files.length} files).\n`);
