import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { GameManifestSourceSchema } from "../packages/game-contract/src/index.ts";
import {
  loadProvenanceIndex,
  requireGameDistributionProvenance,
  requireSourceSnapshotEvidence,
} from "./provenance.mjs";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

await test("verifies the admitted Kamifuda owner-provided source snapshot", async () => {
  const manifest = GameManifestSourceSchema.parse(
    JSON.parse(
      await readFile(
        new URL("../games/kamifuda-runner/game.manifest.source.json", import.meta.url),
        "utf8",
      ),
    ),
  );
  const provenance = await loadProvenanceIndex(projectRoot);
  const distribution = await requireGameDistributionProvenance(
    projectRoot,
    provenance,
    manifest.id,
    manifest.provenance,
  );

  assert.equal(distribution.kind, "owner-provided-source-snapshot");
  assert.equal(distribution.record.gameId, manifest.id);
  assert.equal(distribution.record.sourceSnapshot.archiveAvailability, "owner-workspace-only");
  assert.equal(
    distribution.record.sourceSnapshot.archive.sha256,
    manifest.provenance.archiveSha256,
  );
  assert.equal(distribution.record.productionBoundary.status, "production-admitted");
  assert.equal(distribution.record.sourceSnapshot.repository, null);
  assert.equal(distribution.record.sourceSnapshot.revision, null);
  assert.equal(distribution.record.sourceSnapshot.license, null);
});

await test("verifies the admitted Neon owner-provided source snapshot", async () => {
  const evidence = await requireSourceSnapshotEvidence(
    projectRoot,
    "provenance/neon-overdrive/source-snapshot.json",
    "neon-overdrive",
  );

  assert.equal(evidence.recordPath, "provenance/neon-overdrive/source-snapshot.json");
  assert.equal(evidence.record.gameId, "neon-overdrive");
  assert.equal(evidence.record.productionBoundary.status, "production-admitted");
  assert.equal(evidence.record.productionBoundary.runtimeAdmissionIssue, 52);
  assert.deepEqual(evidence.record.productionBoundary.excludedFromProductionInputs, [
    "games/neon-overdrive.zip",
    "games/neon-overdrive/NEON_OVERDRIVE.html",
    "games/neon-overdrive/preview.png",
    "games/neon-overdrive/overdrive-preview.png",
    "games/neon-overdrive/boss-preview.png",
    "games/neon-overdrive/run_local.sh",
    "games/neon-overdrive/run_local.bat",
    "games/neon-overdrive/playwright.baseline.config.ts",
    "games/neon-overdrive/vite.source.config.ts",
    "games/neon-overdrive/tools",
    "games/neon-overdrive/tests",
    "games/neon-overdrive/performance",
  ]);
  assert.equal(evidence.record.sourceSnapshot.repository, null);
  assert.equal(evidence.record.sourceSnapshot.revision, null);
  assert.equal(evidence.record.sourceSnapshot.license, null);
  const provenance = await loadProvenanceIndex(projectRoot);
  const distribution = await requireGameDistributionProvenance(
    projectRoot,
    provenance,
    "neon-overdrive",
    {
      kind: "owner-provided-source-snapshot",
      record: "provenance/neon-overdrive/source-snapshot.json",
      archiveSha256: "08ceef2d930c801bab64ff4cbeab39129d3f5f088ee9344e3ac0a80e5e976883",
    },
  );
  assert.equal(distribution.kind, "owner-provided-source-snapshot");
  assert.equal(distribution.record.productionBoundary.status, "production-admitted");
});
