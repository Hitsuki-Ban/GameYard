import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const sourceShaPattern = /^[0-9a-f]{40}$/u;
const artifactDigestPattern = /^sha256:[0-9a-f]{64}$/u;
const versionIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const productionOrigin = "https://gameyard.hitsuki.space";
const productionTarget = "gameyard.hitsuki.space (custom domain)";

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith("--") || !value || values.has(flag)) {
      throw new Error("Deployment evidence arguments must be unique --flag value pairs");
    }
    values.set(flag, value);
  }
  const required = ["--file", "--metadata", "--artifact-digest", "--github-output", "--evidence"];
  if (values.size !== required.length || required.some((flag) => !values.has(flag))) {
    throw new Error(
      "Usage: parse-cloudflare-deploy.mjs --file <ndjson> --metadata <json> --artifact-digest <sha256:hex> --github-output <file> --evidence <json>",
    );
  }
  return {
    file: resolve(values.get("--file")),
    metadata: resolve(values.get("--metadata")),
    artifactDigest: values.get("--artifact-digest"),
    githubOutput: resolve(values.get("--github-output")),
    evidence: resolve(values.get("--evidence")),
  };
}

function exactKeys(value, expected, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const compare = (left, right) => left.localeCompare(right);
  const actual = Object.keys(value).sort(compare);
  const sortedExpected = [...expected].sort(compare);
  if (JSON.stringify(actual) !== JSON.stringify(sortedExpected)) {
    throw new Error(`${label} has unexpected fields: ${actual.join(", ")}`);
  }
}

function requireProductionTarget(value) {
  if (value !== productionTarget) {
    throw new Error(`Wrangler deploy target is not ${productionTarget}: ${String(value)}`);
  }
  return productionOrigin;
}

async function main() {
  const arguments_ = parseArguments(process.argv.slice(2));
  const lines = (await readFile(arguments_.file, "utf8"))
    .split(/\r?\n/u)
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
  const deployments = lines.filter((entry) => entry.type === "deploy");
  if (deployments.length !== 1) {
    throw new Error(`Expected exactly one Wrangler deploy event, received ${deployments.length}`);
  }
  if (lines.some((entry) => entry.type === "command-failed")) {
    throw new Error("Wrangler reported a failed command in its machine-readable output");
  }

  const deployment = deployments[0];
  exactKeys(
    deployment,
    [
      "timestamp",
      "type",
      "version",
      "worker_name",
      "worker_tag",
      "version_id",
      "targets",
      "wrangler_environment",
      "worker_name_overridden",
    ],
    "Wrangler deploy event",
  );
  if (
    deployment.version !== 1 ||
    deployment.worker_name !== "gameyard" ||
    deployment.wrangler_environment !== "production" ||
    deployment.worker_name_overridden !== false ||
    !versionIdPattern.test(deployment.version_id)
  ) {
    throw new Error("Wrangler deploy event does not identify the expected production Worker");
  }
  if (!Array.isArray(deployment.targets) || deployment.targets.length !== 1) {
    throw new Error("Wrangler production deploy must report exactly one public target");
  }
  const target = requireProductionTarget(deployment.targets[0]);

  const metadata = JSON.parse(await readFile(arguments_.metadata, "utf8"));
  exactKeys(
    metadata,
    ["schemaVersion", "sourceSha", "buildId", "protocol", "games"],
    "Release metadata",
  );
  if (
    metadata.schemaVersion !== 1 ||
    typeof metadata.buildId !== "string" ||
    !sourceShaPattern.test(metadata.sourceSha) ||
    !Number.isSafeInteger(metadata.protocol) ||
    !Array.isArray(metadata.games) ||
    metadata.games.length === 0 ||
    !metadata.games.every(
      (game) =>
        game !== null &&
        typeof game === "object" &&
        !Array.isArray(game) &&
        Object.keys(game).length === 2 &&
        typeof game.id === "string" &&
        typeof game.version === "string",
    )
  ) {
    throw new Error("Release metadata cannot provide deployment identity");
  }
  if (!artifactDigestPattern.test(arguments_.artifactDigest)) {
    throw new Error(
      "Artifact digest must be sha256 followed by 64 lowercase hexadecimal characters",
    );
  }

  const evidence = {
    schemaVersion: 1,
    sourceSha: metadata.sourceSha,
    buildId: metadata.buildId,
    artifactDigest: arguments_.artifactDigest,
    workerName: deployment.worker_name,
    versionId: deployment.version_id,
    target,
  };
  await mkdir(dirname(arguments_.evidence), { recursive: true });
  await writeFile(arguments_.evidence, `${JSON.stringify(evidence, null, 2)}\n`);
  await appendFile(
    arguments_.githubOutput,
    `version-id=${evidence.versionId}\ntarget=${evidence.target}\nbuild-id=${evidence.buildId}\n`,
  );
  console.log(
    `Cloudflare deployment verified: ${evidence.versionId}; ${evidence.target}; ${evidence.buildId}`,
  );
}

await main();
