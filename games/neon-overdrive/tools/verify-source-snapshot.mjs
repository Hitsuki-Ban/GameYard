import { fileURLToPath } from "node:url";

import { requireSourceSnapshotEvidence } from "../../../tooling/provenance.mjs";

const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));
const evidence = await requireSourceSnapshotEvidence(
  projectRoot,
  "provenance/neon-overdrive/source-snapshot.json",
  "neon-overdrive",
);

if (evidence.record.productionBoundary.status !== "source-evidence-only") {
  throw new Error("Neon source evidence must remain outside the production runtime.");
}
if (evidence.record.productionBoundary.runtimeAdmissionIssue !== 52) {
  throw new Error("Neon runtime admission must remain assigned to Issue #52.");
}

console.log(
  `Neon source snapshot verified: ${evidence.record.recordId}; archive ${evidence.record.sourceSnapshot.archive.sha256}.`,
);
