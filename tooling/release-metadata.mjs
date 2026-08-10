import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  GameCatalogSchema,
  GameManifestSchema,
  PROTOCOL_VERSION,
} from "../packages/game-contract/src/index.ts";
import { verifyArtifactReport } from "./artifact-report.mjs";
import { loadProvenanceIndex, requireGameDistributionProvenance } from "./provenance.mjs";
import { loadProductionRegistry } from "./production-registry.mjs";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const sourceShaPattern = /^[0-9a-f]{40}$/u;

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

async function readText(file, label) {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") throw new Error(`${label} is missing: ${file}`);
    throw error;
  }
}

async function readJson(file, label) {
  const content = await readText(file, label);
  try {
    return { content, value: JSON.parse(content) };
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

function assertBuildInfo(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value.schemaVersion !== 1 ||
    typeof value.buildId !== "string" ||
    !Array.isArray(value.files) ||
    !value.files.every((file) => typeof file === "string")
  ) {
    throw new Error("dist/build-info.json violates the release metadata contract");
  }
  return value;
}

export async function createReleaseMetadata(root, sourceSha) {
  if (!sourceShaPattern.test(sourceSha)) {
    throw new Error("Release source SHA must be exactly 40 lowercase hexadecimal characters");
  }
  const dist = resolve(root, "dist");
  const registry = await loadProductionRegistry(root);
  const registryPath = "site.assembly.json";
  const registrySource = await readText(resolve(root, registryPath), registryPath);
  const buildInfo = assertBuildInfo(
    (await readJson(resolve(dist, "build-info.json"), "dist/build-info.json")).value,
  );
  const catalogFile = resolve(dist, "games/catalog.json");
  const catalogJson = await readJson(catalogFile, "dist/games/catalog.json");
  const catalogResult = GameCatalogSchema.safeParse(catalogJson.value);
  if (!catalogResult.success) throw new Error("dist/games/catalog.json violates GameCatalogSchema");
  const catalog = catalogResult.data;
  if (catalog.buildId !== buildInfo.buildId) {
    throw new Error("Release catalog and build-info.json use different build IDs");
  }
  if (
    catalog.games.length !== registry.games.length ||
    catalog.games.some((game, index) => game.id !== registry.games[index]?.id)
  ) {
    throw new Error("Release catalog IDs and order must match site.assembly.json");
  }

  const provenancePath = "provenance/upstreams.json";
  const provenance = await readText(resolve(root, provenancePath), provenancePath);
  const provenanceIndex = await loadProvenanceIndex(root);
  const policyPath = "deployment/static-asset-policy.json";
  const policy = await readText(resolve(root, policyPath), policyPath);
  const artifactReportPath = ".gameyard/artifact-report.json";
  const artifactReportFile = resolve(root, artifactReportPath);
  const artifactReport = await verifyArtifactReport(
    dist,
    resolve(root, policyPath),
    artifactReportFile,
  );
  const artifactReportSource = await readText(artifactReportFile, artifactReportPath);
  if (artifactReport.current.buildId !== buildInfo.buildId) {
    throw new Error("Artifact report and build-info.json use different build IDs");
  }

  const manifests = [];
  for (const [index, game] of catalog.games.entries()) {
    const registeredGame = registry.games[index];
    if (!registeredGame) throw new Error(`Registry is missing catalog game ${game.id}`);
    const manifestPath = `games/${game.manifest.slice(2)}`;
    const manifestJson = await readJson(resolve(dist, manifestPath), `dist/${manifestPath}`);
    const manifestResult = GameManifestSchema.safeParse(manifestJson.value);
    if (!manifestResult.success)
      throw new Error(`dist/${manifestPath} violates GameManifestSchema`);
    const manifest = manifestResult.data;
    if (manifest.id !== game.id || manifest.buildId !== buildInfo.buildId) {
      throw new Error(`dist/${manifestPath} does not belong to the release artifact`);
    }
    const distribution = await requireGameDistributionProvenance(
      root,
      provenanceIndex,
      manifest.id,
      manifest.provenance,
    );
    const presentationSource = await readText(
      registeredGame.presentationSourcePath,
      registeredGame.presentationSource,
    );
    const provenanceMetadata =
      distribution.kind === "repository"
        ? {
            kind: distribution.kind,
            repository: distribution.repository.url,
            revision: distribution.repository.revision,
            license: distribution.repository.license,
            index: {
              path: provenancePath,
              entrySha256: sha256(
                `${JSON.stringify({
                  id: distribution.repository.id,
                  url: distribution.repository.url,
                  revision: distribution.repository.revision,
                  tree: distribution.repository.tree,
                  license: distribution.repository.license,
                  rightsRecord: distribution.repository.rightsRecord,
                  publicImportAllowed: distribution.repository.publicImportAllowed,
                })}\n`,
              ),
            },
            rights:
              distribution.repository.rightsRecord === null
                ? null
                : {
                    path: distribution.repository.rightsRecord,
                    sha256: sha256(
                      await readText(
                        resolve(root, distribution.repository.rightsRecord),
                        distribution.repository.rightsRecord,
                      ),
                    ),
                  },
          }
        : {
            kind: distribution.kind,
            record: {
              path: distribution.recordPath,
              sha256: sha256(
                await readText(resolve(root, distribution.recordPath), distribution.recordPath),
              ),
            },
            archive: distribution.record.sourceSnapshot.archive,
            inventory: distribution.record.sourceSnapshot.inventory,
            authorization: {
              path: distribution.record.authorization.grantText,
              sha256: distribution.record.authorization.grantTextSha256,
            },
            licenseScope: distribution.record.permissions.licenseScope,
          };
    manifests.push({
      gameId: manifest.id,
      version: manifest.version,
      path: manifestPath,
      sha256: sha256(manifestJson.content),
      provenance: provenanceMetadata,
      presentation: {
        path: registeredGame.presentationSource,
        sha256: sha256(presentationSource),
      },
    });
  }

  const deploymentConfigPath = "wrangler.jsonc";
  const deploymentConfig = await readText(
    resolve(root, deploymentConfigPath),
    deploymentConfigPath,
  );
  const deploymentWorkerPath = "deployment/cloudflare-worker.mjs";
  const deploymentWorker = await readText(
    resolve(root, deploymentWorkerPath),
    deploymentWorkerPath,
  );
  return {
    schemaVersion: 4,
    sourceSha,
    buildId: buildInfo.buildId,
    protocol: PROTOCOL_VERSION,
    fileCount: buildInfo.files.length,
    catalog: {
      path: "games/catalog.json",
      sha256: sha256(catalogJson.content),
    },
    registry: {
      path: registryPath,
      sha256: sha256(registrySource),
    },
    manifests,
    provenance: {
      path: provenancePath,
      sha256: sha256(provenance),
    },
    staticAssetPolicy: {
      path: policyPath,
      sha256: sha256(policy),
    },
    artifactReport: {
      path: artifactReportPath,
      sha256: sha256(artifactReportSource),
    },
    deployment: {
      config: {
        path: deploymentConfigPath,
        sha256: sha256(deploymentConfig),
      },
      worker: {
        path: deploymentWorkerPath,
        sha256: sha256(deploymentWorker),
      },
    },
  };
}

function parseArguments(argv) {
  const [command, sourceFlag, sourceSha, fileFlag, file, ...rest] = argv;
  if (
    (command !== "write" && command !== "verify") ||
    sourceFlag !== "--source-sha" ||
    !sourceSha ||
    fileFlag !== "--file" ||
    !file ||
    rest.length !== 0
  ) {
    throw new Error(
      "Usage: release-metadata.mjs <write|verify> --source-sha <40-hex-sha> --file <metadata.json>",
    );
  }
  return { command, sourceSha, file: resolve(file) };
}

async function main() {
  const arguments_ = parseArguments(process.argv.slice(2));
  const expected = await createReleaseMetadata(projectRoot, arguments_.sourceSha);
  const serialized = `${JSON.stringify(expected, null, 2)}\n`;
  if (arguments_.command === "write") {
    await mkdir(dirname(arguments_.file), { recursive: true });
    await writeFile(arguments_.file, serialized);
    console.log(`Release metadata written: ${expected.buildId}; source ${expected.sourceSha}`);
    return;
  }
  const actual = await readText(arguments_.file, "Release metadata");
  if (actual !== serialized) throw new Error("Release metadata does not match dist and source SHA");
  console.log(`Release metadata verified: ${expected.buildId}; source ${expected.sourceSha}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
