import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const manifestLanguages = new Map([
  ['manifest.webmanifest', 'en'],
  ['manifest.zh-CN.webmanifest', 'zh-CN'],
  ['manifest.ja.webmanifest', 'ja'],
]);
const requiredFiles = [
  'index.html',
  'i18n.js',
  'game.js',
  'styles.css',
  'sw.js',
  ...manifestLanguages.keys(),
  'icon.svg',
  'icon-192.png',
  'icon-512.png',
];
const requiredPrecache = [
  './',
  './index.html',
  './styles.css',
  './i18n.js',
  './game.js',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './manifest.webmanifest',
  './manifest.zh-CN.webmanifest',
  './manifest.ja.webmanifest',
];
const urlKeys = new Set(['id', 'start_url', 'scope', 'src', 'url']);
const errors = [];

function fail(message) {
  errors.push(message);
}

function isProjectRelativeUrl(value) {
  if (typeof value !== 'string' || !value.startsWith('./')) return false;
  try {
    const base = new URL('https://example.invalid/CrownBreaker/');
    const resolved = new URL(value, base);
    return resolved.origin === base.origin && resolved.pathname.startsWith(base.pathname);
  } catch {
    return false;
  }
}

function checkManifestUrls(value, file, path = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => checkManifestUrls(item, file, [...path, index]));
    return;
  }
  if (!value || typeof value !== 'object') return;

  for (const [key, child] of Object.entries(value)) {
    const childPath = [...path, key];
    if (urlKeys.has(key) && !isProjectRelativeUrl(child)) {
      fail(`${file}: ${childPath.join('.')} must be a project-relative URL beginning with ./`);
    }
    checkManifestUrls(child, file, childPath);
  }
}

for (const file of requiredFiles) {
  try {
    await access(resolve(root, file));
  } catch {
    fail(`Missing required file: ${file}`);
  }
}

for (const [file, language] of manifestLanguages) {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(resolve(root, file), 'utf8'));
  } catch (error) {
    fail(`${file}: invalid JSON (${error.message})`);
    continue;
  }

  for (const key of ['id', 'start_url', 'scope']) {
    if (manifest[key] !== './') fail(`${file}: ${key} must equal ./`);
  }
  if (manifest.lang !== language) fail(`${file}: lang must equal ${language}`);
  checkManifestUrls(manifest, file);
}

let index = '';
try {
  index = await readFile(resolve(root, 'index.html'), 'utf8');
} catch {}

if (/\b(?:src|href|action|poster)\s*=\s*["']\/(?!\/)/i.test(index)) {
  fail('index.html: root-absolute resource path found');
}

const scriptSources = [...index.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)]
  .map(match => match[1].replace(/^\.\//, ''));
const i18nIndex = scriptSources.indexOf('i18n.js');
const gameIndex = scriptSources.indexOf('game.js');
if (i18nIndex === -1) fail('index.html: i18n.js script is missing');
if (gameIndex === -1) fail('index.html: game.js script is missing');
if (i18nIndex !== -1 && gameIndex !== -1 && i18nIndex >= gameIndex) {
  fail('index.html: i18n.js must load before game.js');
}

let serviceWorker = '';
try {
  serviceWorker = await readFile(resolve(root, 'sw.js'), 'utf8');
} catch {}
const precachedPaths = new Set(
  [...serviceWorker.matchAll(/["'](\.\/[^"']*)["']/g)].map(match => match[1]),
);
for (const path of requiredPrecache) {
  if (!precachedPaths.has(path)) fail(`sw.js: precache entry missing: ${path}`);
}

if (errors.length > 0) {
  console.error(`Static checks failed (${errors.length}):`);
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`Static checks passed (${requiredFiles.length} required files, ${manifestLanguages.size} manifests, ${requiredPrecache.length} precache entries).`);
