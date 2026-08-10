import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { GameManifestSourceSchema } from "../packages/game-contract/src/index.ts";
import {
  loadProvenanceIndex,
  parseSourceSnapshotRecord,
  requireGameDistributionProvenance,
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

await test("rejects a source-evidence-only snapshot at the production provenance gate", async () => {
  const record = JSON.parse(
    await readFile(
      new URL("../provenance/kamifuda-runner/source-snapshot.json", import.meta.url),
      "utf8",
    ),
  );
  record.productionBoundary.status = "source-evidence-only";
  assert.throws(
    () => parseSourceSnapshotRecord(record),
    /productionBoundary\.status must be production-admitted/u,
  );
});
