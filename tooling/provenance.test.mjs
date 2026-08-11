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

await test("verifies Neon source evidence without requiring its owner-only archive", async () => {
  const evidence = await requireSourceSnapshotEvidence(
    projectRoot,
    "provenance/neon-overdrive/source-snapshot.json",
    "neon-overdrive",
  );

  assert.equal(evidence.recordPath, "provenance/neon-overdrive/source-snapshot.json");
  assert.equal(evidence.record.gameId, "neon-overdrive");
  assert.equal(evidence.record.productionBoundary.status, "source-evidence-only");
  assert.equal(evidence.record.productionBoundary.runtimeAdmissionIssue, 52);
  assert.equal(evidence.record.sourceSnapshot.repository, null);
  assert.equal(evidence.record.sourceSnapshot.revision, null);
  assert.equal(evidence.record.sourceSnapshot.license, null);
});

await test("rejects Neon source evidence at the production provenance gate", async () => {
  const provenance = await loadProvenanceIndex(projectRoot);

  await assert.rejects(
    requireGameDistributionProvenance(projectRoot, provenance, "neon-overdrive", {
      kind: "owner-provided-source-snapshot",
      record: "provenance/neon-overdrive/source-snapshot.json",
      archiveSha256: "08ceef2d930c801bab64ff4cbeab39129d3f5f088ee9344e3ac0a80e5e976883",
    }),
    /is not admitted to production/u,
  );
});
