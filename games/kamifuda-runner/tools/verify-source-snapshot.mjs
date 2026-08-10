import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { GameManifestSourceSchema } from "@gameyard/game-contract";

import {
  loadProvenanceIndex,
  requireGameDistributionProvenance,
} from "../../../tooling/provenance.mjs";

const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));
const manifestPath = fileURLToPath(new URL("../game.manifest.source.json", import.meta.url));
const manifest = GameManifestSourceSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")));
const provenance = await loadProvenanceIndex(projectRoot);
const distribution = await requireGameDistributionProvenance(
  projectRoot,
  provenance,
  manifest.id,
  manifest.provenance,
);
if (distribution.kind !== "owner-provided-source-snapshot") {
  throw new Error("Kamifuda production provenance must be an owner-provided source snapshot.");
}

console.log(
  `Kamifuda source snapshot verified: ${distribution.record.recordId}; archive ${distribution.record.sourceSnapshot.archive.sha256}.`,
);
