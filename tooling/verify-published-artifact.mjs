import { verifyPublishedArtifact } from "./verify-production.mjs";

const { buildId, fileCount, gameCount } = await verifyPublishedArtifact();
console.log(
  `Published artifact verified: ${buildId}; ${fileCount} files; ${gameCount} games; one Hub Service Worker; no Lab runtime, game Service Worker, or repository-prefix-breaking root-absolute URLs.`,
);
