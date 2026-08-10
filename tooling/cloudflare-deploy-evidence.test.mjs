import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const parser = resolve("deployment/parse-cloudflare-deploy.mjs");
const sourceSha = "a".repeat(40);
const artifactDigest = `sha256:${"b".repeat(64)}`;
const versionId = "01234567-89ab-cdef-0123-456789abcdef";

async function createFixture(schemaVersion) {
  const root = await mkdtemp(resolve(tmpdir(), "gameyard-cloudflare-evidence-"));
  const deploymentFile = resolve(root, "wrangler.ndjson");
  const metadataFile = resolve(root, "release-metadata.json");
  const outputFile = resolve(root, "github-output.txt");
  const evidenceFile = resolve(root, "evidence.json");
  await writeFile(
    deploymentFile,
    `${JSON.stringify({
      timestamp: "2026-08-10T00:00:00.000Z",
      type: "deploy",
      version: 1,
      worker_name: "gameyard",
      worker_tag: "fixture",
      version_id: versionId,
      targets: ["gameyard.hitsuki.space (custom domain)"],
      wrangler_environment: "production",
      worker_name_overridden: false,
    })}\n`,
  );
  await writeFile(
    metadataFile,
    `${JSON.stringify({ schemaVersion, sourceSha, buildId: "gameyard@fixture" })}\n`,
  );
  await writeFile(outputFile, "");
  return { deploymentFile, metadataFile, outputFile, evidenceFile };
}

function parserArguments(fixture) {
  return [
    parser,
    "--file",
    fixture.deploymentFile,
    "--metadata",
    fixture.metadataFile,
    "--artifact-digest",
    artifactDigest,
    "--github-output",
    fixture.outputFile,
    "--evidence",
    fixture.evidenceFile,
  ];
}

void test("binds Cloudflare deployment evidence to release metadata schema 4", async () => {
  const fixture = await createFixture(4);
  const result = await execFileAsync(process.execPath, parserArguments(fixture));
  assert.match(result.stdout, /Cloudflare deployment verified/u);
  assert.deepEqual(JSON.parse(await readFile(fixture.evidenceFile, "utf8")), {
    schemaVersion: 1,
    sourceSha,
    buildId: "gameyard@fixture",
    artifactDigest,
    workerName: "gameyard",
    versionId,
    target: "https://gameyard.hitsuki.space",
  });
  assert.equal(
    await readFile(fixture.outputFile, "utf8"),
    `version-id=${versionId}\ntarget=https://gameyard.hitsuki.space\nbuild-id=gameyard@fixture\n`,
  );
});

void test("rejects obsolete release metadata instead of accepting a compatibility schema", async () => {
  const fixture = await createFixture(3);
  await assert.rejects(
    execFileAsync(process.execPath, parserArguments(fixture)),
    /Release metadata cannot provide deployment identity/u,
  );
});
