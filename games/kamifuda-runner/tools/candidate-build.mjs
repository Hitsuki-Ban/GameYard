import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const manifestFilename = "candidate.manifest.json";

async function filesAt(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesAt(target)));
    else files.push(target);
  }
  return files;
}

export async function createCandidateBuildId(projectRoot) {
  const inputs = [
    ...(await filesAt(path.join(projectRoot, "guest"))),
    path.join(projectRoot, "candidate.manifest.source.json"),
  ].sort((left, right) => left.localeCompare(right));
  const hash = createHash("sha256");
  for (const file of inputs) {
    hash.update(path.relative(projectRoot, file).replaceAll("\\", "/"));
    hash.update("\0");
    hash.update(await readFile(file));
    hash.update("\0");
  }
  return `gameyard@${hash.digest("hex").slice(0, 16)}`;
}

function exactKeys(value, expected) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const compare = (left, right) => left.localeCompare(right);
  const actual = Object.keys(value).sort(compare);
  const wanted = [...expected].sort(compare);
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

export function validateCandidateSource(source) {
  const valid =
    exactKeys(source, [
      "schemaVersion",
      "protocol",
      "id",
      "version",
      "entry",
      "locales",
      "capabilities",
      "sourceSnapshot",
    ]) &&
    source.schemaVersion === 1 &&
    source.protocol === 1 &&
    source.id === "kamifuda-runner" &&
    /^\d+\.\d+\.\d+$/u.test(source.version) &&
    source.entry === "index.html" &&
    exactKeys(source.locales, ["source", "supported"]) &&
    source.locales.source === "ja" &&
    Array.isArray(source.locales.supported) &&
    source.locales.supported.length === 1 &&
    source.locales.supported[0] === "ja" &&
    Array.isArray(source.capabilities) &&
    source.capabilities.length === 5 &&
    new Set(source.capabilities).size === source.capabilities.length &&
    source.capabilities.every((capability) =>
      ["audio", "fullscreen", "keyboard", "pointer", "touch"].includes(capability),
    ) &&
    exactKeys(source.sourceSnapshot, ["record", "archiveSha256"]) &&
    source.sourceSnapshot.record === "provenance/kamifuda-runner/source-snapshot.json" &&
    /^[0-9a-f]{64}$/u.test(source.sourceSnapshot.archiveSha256);
  if (!valid) throw new Error("Kamifuda candidate manifest source violates its strict schema.");
  return source;
}

function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function createCandidateManifestPlugin({ source, buildId }) {
  validateCandidateSource(source);
  const devManifest = serialize({ ...source, buildId, files: [manifestFilename, source.entry] });
  return {
    name: "kamifuda-candidate-manifest",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (
          new URL(request.url || "/", "http://gameyard.local").pathname !== `/${manifestFilename}`
        )
          return next();
        response.statusCode = 200;
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.end(devManifest);
      });
    },
    generateBundle(_options, bundle) {
      const files = [
        ...new Set([
          ...Object.values(bundle).map((output) => output.fileName),
          manifestFilename,
          source.entry,
        ]),
      ].sort((left, right) => left.localeCompare(right));
      this.emitFile({
        type: "asset",
        fileName: manifestFilename,
        source: serialize({ ...source, buildId, files }),
      });
    },
  };
}
