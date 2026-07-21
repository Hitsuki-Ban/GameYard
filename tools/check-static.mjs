import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const errors = [];
const manifestLanguages = new Map([
  ['manifest.webmanifest', 'en'],
  ['manifest.zh-CN.webmanifest', 'zh-CN'],
  ['manifest.ja.webmanifest', 'ja'],
]);

function fail(message) {
  errors.push(message);
}

let catalog = null;
try {
  catalog = JSON.parse(await readFile(resolve(root, 'assets/catalog.json'), 'utf8'));
  if (catalog.schemaVersion !== 1) fail('assets/catalog.json: schemaVersion must equal 1');
  if (catalog.artDirection !== 'deco-court') fail('assets/catalog.json: artDirection must equal deco-court');
  if (catalog.sourceCount !== 50) fail('assets/catalog.json: sourceCount must equal 50');
  if (!Array.isArray(catalog.sources) || catalog.sources.length !== 50) {
    fail('assets/catalog.json: sources must contain exactly 50 entries');
  }
} catch (error) {
  fail(`assets/catalog.json: invalid or missing JSON (${error.message})`);
}

const catalogAssetPaths = [];
if (Array.isArray(catalog?.sources)) {
  for (const [index, source] of catalog.sources.entries()) {
    const path = source?.path;
    if (typeof path !== 'string' || !/^assets\/[a-z0-9-]+\/[a-z0-9-]+\.svg$/.test(path)) {
      fail(`assets/catalog.json: sources.${index}.path must be a safe project-relative asset SVG path`);
      continue;
    }
    catalogAssetPaths.push(path);
  }
  if (new Set(catalogAssetPaths).size !== catalogAssetPaths.length) fail('assets/catalog.json: duplicate source paths');
}

const previewFiles = [
  'previews/assets.html',
  'previews/assets.css',
  'previews/assets.js',
  'previews/assets-sheet.png',
];
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
  'assets/catalog.json',
  'assets/STYLE_GUIDE.md',
  ...previewFiles,
  ...catalogAssetPaths,
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
  './assets/catalog.json',
  ...previewFiles.map(path => `./${path}`),
  ...catalogAssetPaths.map(path => `./${path}`),
];
const requiredPrecacheSet = new Set(requiredPrecache);
if (requiredPrecacheSet.size !== requiredPrecache.length) fail('Internal static contract error: duplicate canonical precache entries');
const urlKeys = new Set(['id', 'start_url', 'scope', 'src', 'url']);

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
  const expectedIcons = [
    { src: './icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
    { src: './icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
  ];
  if (JSON.stringify(manifest.icons) !== JSON.stringify(expectedIcons)) {
    fail(`${file}: icons must be the canonical color PNG 192/512 maskable pair`);
  }
}

let index = '';
try {
  index = await readFile(resolve(root, 'index.html'), 'utf8');
} catch {}

if (/\b(?:src|href|action|poster)\s*=\s*["']\/(?!\/)/i.test(index)) {
  fail('index.html: root-absolute resource path found');
}
if (!/<link\b(?=[^>]*\brel=["']icon["'])(?=[^>]*\bhref=["']\.\/icon-192\.png["'])(?=[^>]*\btype=["']image\/png["'])[^>]*>/i.test(index)) {
  fail('index.html: the visible favicon must use the color icon-192.png export');
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
if (!/const CACHE = ['"]crown-breaker-v3\.7\.1['"]/.test(serviceWorker)) {
  fail('sw.js: cache name must equal crown-breaker-v3.7.1');
}
if (!/key\.startsWith\(['"]crown-breaker-['"]\)/.test(serviceWorker)) {
  fail('sw.js: cache cleanup must remain limited to the crown-breaker- namespace');
}
const filesArray = serviceWorker.match(/const FILES = Object\.freeze\(\[([\s\S]*?)\]\);/)?.[1] ?? '';
if (!filesArray) fail('sw.js: frozen canonical FILES precache array is missing');
const precacheMatches = [...filesArray.matchAll(/(["'])(.*?)\1/g)].map(match => match[2]);
const unparsedPrecache = filesArray.replace(/(["'])(.*?)\1/g, '').replace(/[\s,]/g, '');
if (unparsedPrecache) fail('sw.js: FILES must contain only comma-separated string literals');
for (const path of precacheMatches) {
  if (!path.startsWith('./')) fail(`sw.js: non-project-relative precache entry: ${path}`);
}
const precachedPaths = new Set(precacheMatches);
if (precacheMatches.length !== precachedPaths.size) fail('sw.js: duplicate project-relative precache entries');
for (const path of requiredPrecache) {
  if (!precachedPaths.has(path)) fail(`sw.js: precache entry missing: ${path}`);
}
for (const path of precacheMatches) {
  if (!requiredPrecacheSet.has(path)) fail(`sw.js: unexpected precache entry: ${path}`);
  if (path === './' || !path.startsWith('./')) continue;
  try {
    await access(resolve(root, path.slice(2)));
  } catch {
    fail(`sw.js: precache target does not exist: ${path}`);
  }
}
if (precacheMatches.length !== requiredPrecache.length) {
  fail(`sw.js: precache must contain exactly ${requiredPrecache.length} canonical entries, found ${precacheMatches.length}`);
}

let assetPreview = '';
try {
  assetPreview = await readFile(resolve(root, 'previews/assets.html'), 'utf8');
} catch {}
if (/script-src[^;]*'unsafe-inline'/i.test(assetPreview)) fail('previews/assets.html: inline script execution must remain disabled by CSP');
if (!/<script\s+src=["']assets\.js["']\s+defer><\/script>/i.test(assetPreview)) {
  fail('previews/assets.html: external deferred assets.js script is missing');
}

if (errors.length > 0) {
  console.error(`Static checks failed (${errors.length}):`);
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`Static checks passed (${requiredFiles.length} required files, ${manifestLanguages.size} manifests, ${requiredPrecache.length} precache entries).`);
