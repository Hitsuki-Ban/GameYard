import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const errors = [];
const fail = message => errors.push(message);

let catalog = null;
try {
  catalog = JSON.parse(await readFile(resolve(root, 'assets/catalog.json'), 'utf8'));
  if (catalog.schemaVersion !== 1) fail('assets/catalog.json: schemaVersion must equal 1');
  if (catalog.artDirection !== 'deco-court') fail('assets/catalog.json: artDirection must equal deco-court');
  if (catalog.sourceCount !== 50) fail('assets/catalog.json: sourceCount must equal 50');
  if (!Array.isArray(catalog.sources) || catalog.sources.length !== 50) fail('assets/catalog.json: sources must contain exactly 50 entries');
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

const requiredFiles = [
  'index.html',
  'i18n.js',
  'game.js',
  'styles.css',
  'src/main.js',
  'src/managed-runtime.js',
  'vite.config.ts',
  'vite.testkit.config.ts',
  'icon.svg',
  'icon-192.png',
  'icon-512.png',
  'assets/catalog.json',
  'assets/STYLE_GUIDE.md',
  'previews/assets.html',
  'previews/assets.css',
  'previews/assets.js',
  'previews/assets-sheet.png',
  ...catalogAssetPaths
];
for (const file of requiredFiles) {
  try { await access(resolve(root, file)); }
  catch { fail(`Missing required file: ${file}`); }
}

const index = await readFile(resolve(root, 'index.html'), 'utf8').catch(() => '');
if (/\b(?:src|href|action|poster)\s*=\s*["']\/(?!\/)/i.test(index)) fail('index.html: root-absolute resource path found');
if (!/<link\b(?=[^>]*\brel=["']icon["'])(?=[^>]*\bhref=["']\.\/icon-192\.png["'])(?=[^>]*\btype=["']image\/png["'])[^>]*>/i.test(index)) {
  fail('index.html: the visible favicon must use the color icon-192.png export');
}
if (!/<script\b(?=[^>]*\btype=["']module["'])(?=[^>]*\bsrc=["']\.\/src\/main\.js["'])[^>]*><\/script>/i.test(index)) {
  fail('index.html: the GameYard ESM entry src/main.js is missing');
}
if (/rel=["']manifest["']|apple-touch-icon|serviceWorker|manifest\.webmanifest/i.test(index)) fail('index.html: standalone PWA paths are forbidden');

for (const file of ['sw.js', 'manifest.webmanifest', 'manifest.zh-CN.webmanifest', 'manifest.ja.webmanifest']) {
  try {
    await access(resolve(root, file));
    fail(`Standalone PWA file must be removed: ${file}`);
  } catch { /* expected */ }
}

const assetPreview = await readFile(resolve(root, 'previews/assets.html'), 'utf8').catch(() => '');
if (/script-src[^;]*'unsafe-inline'/i.test(assetPreview)) fail('previews/assets.html: inline script execution must remain disabled by CSP');
if (!/<script\s+src=["']assets\.js["']\s+defer><\/script>/i.test(assetPreview)) fail('previews/assets.html: external deferred assets.js script is missing');

if (errors.length > 0) {
  console.error(`Static checks failed (${errors.length}):`);
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`Static checks passed (${requiredFiles.length} required files, GameYard ESM entry, no standalone PWA).`);
