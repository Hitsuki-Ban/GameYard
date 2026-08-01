import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

if (process.argv.length !== 2) {
  console.error("Usage: vp exec node tools/verify-simulation-fixture.mjs");
  process.exit(1);
}

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const fixturePath = path.join(projectRoot, "tests", "fixtures", "simulation-baseline.json");
const expectedConfig = Object.freeze({ runs: 100, policy: "greedy", seedBase: 1000 });

function runSimulator() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        path.join(scriptDirectory, "sim-run.mjs"),
        "--runs",
        String(expectedConfig.runs),
        "--policy",
        expectedConfig.policy,
        "--seed-base",
        String(expectedConfig.seedBase),
      ],
      { cwd: projectRoot, stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) {
        reject(new Error(`100-run simulator exited with code ${code}.\n${stderr.trim()}`));
        return;
      }
      resolve(stdout.trim().split(/\r?\n/));
    });
  });
}

const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
assert.deepEqual(Object.keys(fixture).sort(), [
  "config",
  "reportSha256",
  "schemaVersion",
  "summary",
]);
assert.equal(fixture.schemaVersion, 2, "Fixture schemaVersion must be 2.");
assert.deepEqual(
  fixture.config,
  expectedConfig,
  "Fixture must describe the fixed 100-run seed-base-1000 gate.",
);
if (fixture.summary === null || fixture.reportSha256 === null) {
  throw new Error(
    "Simulation fixture is pending: run the fixed simulator twice, then commit its exact summary and canonical SHA-256.",
  );
}
assert.equal(typeof fixture.summary, "object", "Fixture summary must be an object.");
assert.match(
  fixture.reportSha256,
  /^[0-9a-f]{64}$/,
  "Fixture reportSha256 must be a lowercase SHA-256 digest.",
);

const outputPaths = await runSimulator();
assert.equal(
  outputPaths.length,
  2,
  "Simulator must emit exactly one JSON and one Markdown report path.",
);
const jsonRelativePath = outputPaths.find((value) => value.endsWith(".json"));
assert.ok(jsonRelativePath, "Simulator did not emit a JSON report path.");
const reportPath = path.resolve(projectRoot, jsonRelativePath);
const reportsRoot = `${path.join(projectRoot, "reports")}${path.sep}`;
assert.ok(
  reportPath.startsWith(reportsRoot),
  "Simulator report escaped the project reports directory.",
);
const report = JSON.parse(await readFile(reportPath, "utf8"));

assert.deepEqual(Object.keys(report).sort(), ["config", "runs", "schemaVersion", "summary"]);
assert.equal(report.schemaVersion, fixture.schemaVersion, "Simulation report schema changed.");
assert.deepEqual(report.config, expectedConfig, "Simulation report config changed.");
assert.equal(
  report.runs.length,
  expectedConfig.runs,
  "Simulation report must contain exactly 100 runs.",
);
for (let index = 0; index < report.runs.length; index += 1) {
  assert.equal(report.runs[index].index, index, `Run ${index} index changed.`);
  assert.equal(
    report.runs[index].seed,
    expectedConfig.seedBase + index,
    `Run ${index} seed changed.`,
  );
}
assert.deepEqual(report.summary, fixture.summary, "Simulation summary changed.");
const reportSha256 = createHash("sha256").update(JSON.stringify(report)).digest("hex");
assert.equal(reportSha256, fixture.reportSha256, "Simulation canonical report hash changed.");
process.stdout.write(`Simulation baseline passed: ${reportSha256}\n`);
