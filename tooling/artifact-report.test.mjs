import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";

import {
  createArtifactReport,
  enforcePolicy,
  renderArtifactReportSummary,
  verifyArtifactReport,
} from "./artifact-report.mjs";
import { parseStaticAssetPolicy } from "./static-asset-policy.mjs";
import { EXPECTED_STATIC_ASSET_HEADERS } from "./verify-production.mjs";

const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

function policyValue() {
  return {
    schemaVersion: 1,
    provider: "cloudflare-workers-static-assets",
    limitProfile: "workers-free-minimum",
    verifiedAt: "2026-08-10",
    source: "https://developers.cloudflare.com/workers/platform/limits/",
    maximumFileBytes: 25 * 1024 * 1024,
    warningFileBytes: 20 * 1024 * 1024,
    maximumFileCount: 20_000,
    warningFileCount: 14_000,
    largestFileCount: 10,
  };
}

async function createArtifact(root, buildId, payloadBytes, includeHeaders = true) {
  const files = [
    "assets/app.js",
    "build-info.json",
    "games/catalog.json",
    "games/demo/assets/payload.bin",
    "games/demo/game.manifest.json",
    "games/demo/index.html",
    "icons/gameyard-192.png",
    "icons/gameyard-512.png",
    "index.html",
    "manifest.webmanifest",
    "service-worker.js",
  ];
  if (includeHeaders) files.unshift("_headers");
  await mkdir(join(root, "assets"), { recursive: true });
  await mkdir(join(root, "games/demo/assets"), { recursive: true });
  await mkdir(join(root, "icons"), { recursive: true });
  if (includeHeaders) await writeFile(join(root, "_headers"), EXPECTED_STATIC_ASSET_HEADERS);
  await writeFile(
    join(root, "build-info.json"),
    JSON.stringify({ schemaVersion: 1, buildId, files }),
  );
  await writeFile(
    join(root, "games/catalog.json"),
    JSON.stringify({
      schemaVersion: 1,
      buildId,
      games: [
        {
          id: "demo",
          entry: "./demo/index.html",
          manifest: "./demo/game.manifest.json",
        },
      ],
    }),
  );
  await writeFile(
    join(root, "games/demo/game.manifest.json"),
    JSON.stringify({
      schemaVersion: 1,
      protocol: 1,
      id: "demo",
      version: "1.0.0",
      entry: "index.html",
      locales: { source: "en", supported: ["en"] },
      capabilities: [],
      provenance: {
        repository: "https://example.test/demo",
        revision: "0123456789abcdef0123456789abcdef01234567",
        license: "MIT",
      },
      buildId,
      files: ["assets/payload.bin", "game.manifest.json", "index.html"],
    }),
  );
  await writeFile(join(root, "games/demo/index.html"), "<!doctype html><title>Demo</title>");
  await writeFile(join(root, "games/demo/assets/payload.bin"), Buffer.alloc(payloadBytes, 1));
  await writeFile(
    join(root, "assets/app.js"),
    'navigator.serviceWorker.register("./service-worker.js");',
  );
  await writeFile(
    join(root, "service-worker.js"),
    `const BUILD_ID = "${buildId}"; const CACHE = "gameyard-"; self.registration.scope;`,
  );
  await writeFile(join(root, "index.html"), "<!doctype html><title>GameYard</title>");
  await writeFile(
    join(root, "manifest.webmanifest"),
    JSON.stringify({
      id: "./",
      start_url: "./",
      scope: "./",
      display: "standalone",
      icons: [
        { src: "./icons/gameyard-192.png", sizes: "192x192" },
        { src: "./icons/gameyard-512.png", sizes: "512x512" },
      ],
    }),
  );
  await writeFile(join(root, "icons/gameyard-192.png"), "fixture");
  await writeFile(join(root, "icons/gameyard-512.png"), "fixture");
}

await test("reports artifact, per-game, largest-file, and previous-build deltas", async () => {
  const root = await mkdtemp(join(tmpdir(), "gameyard-artifact-report-"));
  temporaryRoots.push(root);
  const current = join(root, "current");
  const previous = join(root, "previous");
  const policyFile = join(root, "policy.json");
  await createArtifact(current, "gameyard@1111111111111111", 100);
  await createArtifact(previous, "gameyard@2222222222222222", 40, false);
  await writeFile(policyFile, `${JSON.stringify(policyValue(), null, 2)}\n`);

  const report = await createArtifactReport(current, previous, policyFile);
  assert.equal(report.current.games.length, 1);
  assert.equal(report.current.games[0].gameId, "demo");
  assert.equal(report.current.fileCount, 12);
  assert.ok(report.delta.totalBytes > 60);
  assert.equal(report.delta.games[0].totalBytes, 60);
  assert.ok(
    report.current.largestFiles.some((file) => file.path === "games/demo/assets/payload.bin"),
  );
  assert.match(renderArtifactReportSummary(report), /Static asset budget/);

  const reportFile = join(root, "report.json");
  await writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`);
  assert.equal(
    (await verifyArtifactReport(current, policyFile, reportFile)).current.buildId,
    report.current.buildId,
  );

  const tampered = JSON.parse(await readFile(reportFile, "utf8"));
  tampered.current.totalBytes += 1;
  await writeFile(reportFile, JSON.stringify(tampered));
  await assert.rejects(
    verifyArtifactReport(current, policyFile, reportFile),
    /current metrics do not match/,
  );
});

await test("enforces exact Cloudflare limits and project warning thresholds", () => {
  const policy = parseStaticAssetPolicy(policyValue());
  assert.deepEqual(
    enforcePolicy(
      {
        fileCount: policy.warningFileCount,
        largestFiles: [{ path: "large.bin", bytes: policy.warningFileBytes }],
      },
      policy,
    ),
    [
      `Artifact file count ${policy.warningFileCount} reached the ${policy.warningFileCount} warning threshold.`,
      `large.bin is ${policy.warningFileBytes} bytes and reached the ${policy.warningFileBytes} warning threshold.`,
    ],
  );
  assert.throws(
    () =>
      enforcePolicy(
        {
          fileCount: policy.maximumFileCount + 1,
          largestFiles: [{ path: "too-large.bin", bytes: policy.maximumFileBytes + 1 }],
        },
        policy,
      ),
    /Static asset policy failed:[\s\S]*too-large\.bin/,
  );
});

await test("rejects policy drift from the documented 25 MiB and 70 percent limits", () => {
  assert.throws(
    () => parseStaticAssetPolicy({ ...policyValue(), warningFileCount: 13_999 }),
    /exact 70% warning/,
  );
  assert.throws(
    () => parseStaticAssetPolicy({ ...policyValue(), maximumFileBytes: 26 * 1024 * 1024 }),
    /exactly 25 MiB and 20 MiB/,
  );
});
