import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const exactMaximumFileBytes = 25 * 1024 * 1024;
const exactWarningFileBytes = 20 * 1024 * 1024;

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

function requirePositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
  return value;
}

export function parseStaticAssetPolicy(value) {
  const label = "deployment/static-asset-policy.json";
  assertExactKeys(
    value,
    [
      "schemaVersion",
      "provider",
      "limitProfile",
      "verifiedAt",
      "source",
      "maximumFileBytes",
      "warningFileBytes",
      "maximumFileCount",
      "warningFileCount",
      "largestFileCount",
    ],
    label,
  );
  if (value.schemaVersion !== 1) throw new Error(`${label} schemaVersion must be 1.`);
  if (value.provider !== "cloudflare-workers-static-assets") {
    throw new Error(`${label} provider must be cloudflare-workers-static-assets.`);
  }
  if (value.limitProfile !== "workers-free-minimum") {
    throw new Error(`${label} limitProfile must be workers-free-minimum.`);
  }
  if (
    !/^\d{4}-\d{2}-\d{2}$/u.test(value.verifiedAt) ||
    Number.isNaN(Date.parse(value.verifiedAt))
  ) {
    throw new Error(`${label} verifiedAt must be an ISO calendar date.`);
  }
  if (value.source !== "https://developers.cloudflare.com/workers/platform/limits/") {
    throw new Error(`${label} source must be the official Cloudflare Workers limits page.`);
  }
  const maximumFileBytes = requirePositiveInteger(
    value.maximumFileBytes,
    `${label} maximumFileBytes`,
  );
  const warningFileBytes = requirePositiveInteger(
    value.warningFileBytes,
    `${label} warningFileBytes`,
  );
  const maximumFileCount = requirePositiveInteger(
    value.maximumFileCount,
    `${label} maximumFileCount`,
  );
  const warningFileCount = requirePositiveInteger(
    value.warningFileCount,
    `${label} warningFileCount`,
  );
  const largestFileCount = requirePositiveInteger(
    value.largestFileCount,
    `${label} largestFileCount`,
  );
  if (maximumFileBytes !== exactMaximumFileBytes || warningFileBytes !== exactWarningFileBytes) {
    throw new Error(`${label} file thresholds must be exactly 25 MiB and 20 MiB.`);
  }
  if (maximumFileCount !== 20_000 || warningFileCount * 10 !== maximumFileCount * 7) {
    throw new Error(`${label} must use the 20,000-file minimum and its exact 70% warning.`);
  }
  if (largestFileCount > maximumFileCount) {
    throw new Error(`${label} largestFileCount must not exceed maximumFileCount.`);
  }
  return {
    schemaVersion: 1,
    provider: value.provider,
    limitProfile: value.limitProfile,
    verifiedAt: value.verifiedAt,
    source: value.source,
    maximumFileBytes,
    warningFileBytes,
    maximumFileCount,
    warningFileCount,
    largestFileCount,
  };
}

export async function loadStaticAssetPolicy(file) {
  const path = resolve(file);
  let content;
  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") throw new Error(`Static asset policy is missing: ${path}`);
    throw error;
  }
  let value;
  try {
    value = JSON.parse(content);
  } catch (error) {
    throw new Error(`Static asset policy is not valid JSON: ${error.message}`);
  }
  return { content, policy: parseStaticAssetPolicy(value) };
}
