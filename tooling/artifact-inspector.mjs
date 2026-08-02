import { readdir, readFile } from "node:fs/promises";
import { basename, extname, relative, resolve } from "node:path";

export const TEXT_ARTIFACT_EXTENSIONS = new Set([
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
const serviceWorkerFilenames = new Set([
  "service-worker.js",
  "service_worker.js",
  "serviceworker.js",
  "sw.js",
]);
const forbiddenLabMarkers = ["open lab", "session lab", "tweakpane", "lab-overlay", "lab-accent"];
const serviceWorkerMarkers = ["navigator.serviceworker", "serviceworker.register", "sw.js"];

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

export function inspectArtifactText(file, content, options = {}) {
  const extension = extname(file).toLowerCase();
  const failures = [];
  const normalized = content.toLowerCase();
  const allowHubPwa = options.allowHubPwa === true;
  const artifactPath = String(options.artifactPath ?? file).replaceAll("\\", "/");
  const isHubServiceWorker = allowHubPwa && artifactPath === "service-worker.js";
  const isHubJavaScript =
    allowHubPwa && /^assets\/[^/]+\.(?:js|mjs)$/u.test(artifactPath.toLowerCase());

  if (serviceWorkerFilenames.has(basename(file).toLowerCase()) && !isHubServiceWorker) {
    failures.push("forbidden Service Worker file");
  }
  for (const marker of forbiddenLabMarkers) {
    if (normalized.includes(marker)) {
      failures.push(`forbidden marker "${marker}"`);
    }
  }
  for (const marker of serviceWorkerMarkers) {
    if (normalized.includes(marker) && !isHubServiceWorker && !isHubJavaScript) {
      failures.push(`forbidden marker "${marker}"`);
    }
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

export async function listArtifactFiles(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(`Artifact directory is missing: ${directory}`);
    }
    throw error;
  }

  const files = [];
  for (const entry of entries) {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listArtifactFiles(entryPath)));
    else if (entry.isFile()) files.push(entryPath);
    else throw new Error(`Unsupported artifact entry: ${entryPath}`);
  }
  return files;
}

export async function inspectArtifactFiles(files, reportRoot, options = {}) {
  const failures = [];
  for (const file of files) {
    if (!TEXT_ARTIFACT_EXTENSIONS.has(extname(file).toLowerCase())) continue;
    const content = await readFile(file, "utf8");
    const artifactPath = relative(reportRoot, file).split("\\").join("/");
    for (const failure of inspectArtifactText(file, content, { ...options, artifactPath })) {
      failures.push(`${relative(reportRoot, file)} contains ${failure}`);
    }
  }
  return failures;
}
