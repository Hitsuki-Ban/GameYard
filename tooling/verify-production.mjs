import { readdir, readFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const productionDirectory = fileURLToPath(new URL("../dist/", import.meta.url));

const textExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".map",
  ".mjs",
  ".svg",
  ".txt",
  ".webmanifest",
]);
const jsonExtensions = new Set([".json", ".webmanifest"]);
const forbiddenMarkers = [
  "open lab",
  "session lab",
  "tweakpane",
  "lab-overlay",
  "lab-accent",
  "navigator.serviceworker",
  "serviceworker.register",
  "sw.js",
];

function isRootAbsoluteUrl(value) {
  return /^\s*\/(?!\/)/.test(value);
}

function findHtmlReferences(content) {
  const failures = [];
  const attributePattern =
    /\b(src|href|poster|srcset)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/giu;

  for (const match of content.matchAll(attributePattern)) {
    const attribute = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    if (attribute === "srcset") {
      const candidates = value
        .split(",")
        .map((candidate) => candidate.trim().split(/\s+/u)[0] ?? "");
      if (candidates.some(isRootAbsoluteUrl)) failures.push("HTML srcset");
    } else if (isRootAbsoluteUrl(value)) {
      failures.push(`HTML ${attribute}`);
    }
  }

  return failures;
}

function findCssReferences(content) {
  const failures = [];
  const urlPattern = /\burl\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)'";]+))\s*\)/giu;
  const importPattern = /@import\s+(?:"([^"]*)"|'([^']*)')/giu;

  for (const match of content.matchAll(urlPattern)) {
    const value = match[1] ?? match[2] ?? match[3] ?? "";
    if (isRootAbsoluteUrl(value)) failures.push("CSS url()");
  }
  for (const match of content.matchAll(importPattern)) {
    const value = match[1] ?? match[2] ?? "";
    if (isRootAbsoluteUrl(value)) failures.push("CSS @import");
  }

  return failures;
}

function findJsonReferences(value, location = "$") {
  if (typeof value === "string") {
    return isRootAbsoluteUrl(value) ? [`JSON value at ${location}`] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => findJsonReferences(entry, `${location}[${index}]`));
  }
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([key, entry]) =>
      findJsonReferences(entry, `${location}.${key}`),
    );
  }
  return [];
}

function findJavaScriptReferences(content) {
  const failures = [];
  const callPattern =
    /\b(?:(?:new\s+)?(?:URL|Worker|SharedWorker|EventSource)|fetch|import|navigator\.sendBeacon|(?:window\.)?open|(?:window\.)?location\.(?:assign|replace))\s*\(\s*(["'`])\s*(\/(?!\/)[^"'`\r\n]*)\1/gu;
  const modulePattern =
    /\b(?:import|export)\s+(?:[^;"'`]*?\s+from\s+)?(["'])\s*\/(?!\/)[^"'`\r\n]*\1/gu;

  for (const match of content.matchAll(callPattern)) {
    failures.push(`JavaScript URL call (${match[0].slice(0, 32)})`);
  }
  for (const match of content.matchAll(modulePattern)) {
    failures.push(`JavaScript module URL (${match[0].slice(0, 32)})`);
  }

  return failures;
}

export function inspectArtifactText(file, content) {
  const extension = extname(file).toLowerCase();
  const failures = [];
  const normalized = content.toLowerCase();

  for (const marker of forbiddenMarkers) {
    if (normalized.includes(marker)) failures.push(`forbidden marker "${marker}"`);
  }

  if (extension === ".html" || extension === ".svg") {
    failures.push(...findHtmlReferences(content));
  }
  if (extension === ".css") failures.push(...findCssReferences(content));
  if (extension === ".js" || extension === ".mjs") {
    failures.push(...findJavaScriptReferences(content));
  }
  if (jsonExtensions.has(extension)) {
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      throw new Error(`Invalid JSON production artifact ${file}: ${error.message}`);
    }
    failures.push(...findJsonReferences(parsed));
  }

  return failures;
}

async function walk(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(`Production artifact directory is missing: ${directory}`);
    }
    throw error;
  }

  const files = [];
  for (const entry of entries) {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(entryPath)));
    else if (entry.isFile()) files.push(entryPath);
    else throw new Error(`Unsupported production artifact entry: ${entryPath}`);
  }
  return files;
}

export async function verifyProductionArtifact(
  directory = productionDirectory,
  reportRoot = projectRoot,
) {
  const files = await walk(resolve(directory));
  if (files.length === 0) throw new Error("Production artifact is empty.");

  const failures = [];
  for (const file of files) {
    if (!textExtensions.has(extname(file).toLowerCase())) continue;
    const content = await readFile(file, "utf8");
    for (const failure of inspectArtifactText(file, content)) {
      failures.push(`${relative(reportRoot, file)} contains ${failure}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`Production artifact verification failed:\n- ${failures.join("\n- ")}`);
  }

  return { fileCount: files.length };
}

async function main() {
  const { fileCount } = await verifyProductionArtifact();
  console.log(
    `Production artifact verified: ${fileCount} files; no Lab runtime, game Service Worker, or repository-prefix-breaking root-absolute URLs.`,
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) await main();
