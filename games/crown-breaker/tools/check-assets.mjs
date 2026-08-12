import { spawnSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateStrictSvgDocument } from './svg-contract.mjs';

if (process.argv.length !== 2) {
  console.error('Usage: node tools/check-assets.mjs');
  process.exit(1);
}

const root = fileURLToPath(new URL('..', import.meta.url));
const assetsRoot = resolve(root, 'assets');
const pieceKinds = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'];
const traitIds = [
  'berserk', 'chains', 'echo', 'gravity', 'guarded', 'hex', 'lockstep', 'mist',
  'phantom', 'possession', 'rampart', 'summoner', 'swift', 'thorns', 'tithe',
];
const formationIds = ['fortress', 'lance', 'phalanx', 'pincer', 'scatter', 'vanguard'];
const actIds = ['gallery', 'outer', 'throne'];
const uiIds = ['combo', 'crown', 'energy', 'relic', 'shield', 'turns'];
const expectedAssets = [
  ...['white', 'black'].flatMap(side => pieceKinds.map(kind => ({
    id: `piece.${side}.${kind}`,
    category: 'pieces',
    path: `assets/pieces/${side}-${kind}.svg`,
    viewBox: '0 0 100 100',
  }))),
  { id: 'boss.ironBastion', category: 'bosses', path: 'assets/bosses/iron-bastion.svg', viewBox: '0 0 120 120' },
  { id: 'boss.pawnstorm', category: 'bosses', path: 'assets/bosses/pawnstorm.svg', viewBox: '0 0 120 120' },
  { id: 'boss.twinQueens', category: 'bosses', path: 'assets/bosses/twin-queens.svg', viewBox: '0 0 120 120' },
  ...traitIds.map(id => ({ id: `trait.${id}`, category: 'traits', path: `assets/traits/${id}.svg`, viewBox: '0 0 24 24' })),
  ...formationIds.map(id => ({ id: `formation.${id}`, category: 'formations', path: `assets/formations/${id}.svg`, viewBox: '0 0 24 24' })),
  ...actIds.flatMap(id => [
    { id: `act.${id}.background`, category: 'acts', path: `assets/acts/${id}.svg`, viewBox: '0 0 1920 1080' },
    { id: `act.${id}.particles`, category: 'acts', path: `assets/acts/${id}-particles.svg`, viewBox: '0 0 96 32' },
  ]),
  ...uiIds.map(id => ({ id: `ui.${id}`, category: 'ui', path: `assets/ui/${id}.svg`, viewBox: '0 0 16 16' })),
  { id: 'brand.appIcon', category: 'brand', path: 'assets/brand/app-icon.svg', viewBox: '0 0 100 100' },
  { id: 'brand.logo', category: 'brand', path: 'assets/brand/logo.svg', viewBox: '0 0 600 100' },
].sort((a, b) => a.path.localeCompare(b.path, 'en'));
const formationGrid = 'M2.5 2v20M6.3 2v20M10.1 2v20M13.9 2v20M17.7 2v20M21.5 2v20M1 3h22M1 9h22M1 15h22M1 21h22';
const errors = [];
let maskableMaximumRadiusPercent = null;

function fail(message) {
  errors.push(message);
}

async function listSvgFiles(directory) {
  const files = [];
  async function walk(current) {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (error) {
      fail(`Cannot read ${relative(root, current) || 'assets'}: ${error.message}`);
      return;
    }
    for (const entry of entries) {
      const absolute = resolve(current, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isSymbolicLink()) fail(`Symbolic links are not allowed in assets/: ${relative(root, absolute)}`);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.svg')) {
        files.push(relative(root, absolute).split(sep).join('/'));
      }
    }
  }
  await walk(directory);
  return files.sort((a, b) => a.localeCompare(b, 'en'));
}

function attribute(source, name) {
  const match = source.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 's'));
  return match?.[2] ?? null;
}

function countVisibleTopLevelGraphics(source) {
  const tags = [...source.matchAll(/<\/?([A-Za-z][\w:.-]*)\b[^>]*>/g)].map(match => match[0]);
  let depth = 0;
  let rootSeen = false;
  let count = 0;
  for (const token of tags) {
    const name = token.match(/^<\/?([A-Za-z][\w:.-]*)/)?.[1];
    if (!name) continue;
    if (token.startsWith('</')) {
      depth -= 1;
      continue;
    }
    if (!rootSeen) {
      if (name === 'svg') {
        rootSeen = true;
        depth = 1;
      }
      continue;
    }
    if (depth === 1 && (name === 'path' || name === 'g') && !/\b(?:display="none"|visibility="hidden")/.test(token)) count += 1;
    if (!token.endsWith('/>')) depth += 1;
  }
  return count;
}

function makeTransparentFavicon(appIcon) {
  const backgroundPattern = /\s*<path\b(?=[^>]*\bfill="var\(--asset-background\)")(?=[^>]*\bd="M0 0h100v100H0z")[^>]*\/>/;
  if (!backgroundPattern.test(appIcon)) return null;
  const output = appIcon
    .replace(backgroundPattern, '')
    .replace(' data-maskable-safe-zone="80"', '')
    .replaceAll('var(--asset-primary)', 'currentColor')
    .replaceAll('var(--asset-accent)', 'currentColor');
  return output.endsWith('\n') ? output : `${output}\n`;
}

function readPngMetadata(buffer, path) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buffer.length < 100 || !buffer.subarray(0, 8).equals(signature) || buffer.toString('ascii', 12, 16) !== 'IHDR') {
    fail(`${path}: invalid or empty PNG`);
    return { width: 0, height: 0 };
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function renderRawRgba(path, size) {
  const result = spawnSync('magick', [
    '-limit', 'memory', '64MiB',
    '-limit', 'map', '128MiB',
    '-limit', 'disk', '64MiB',
    '-limit', 'area', '4MP',
    '-limit', 'width', '1024',
    '-limit', 'height', '1024',
    '-limit', 'time', '15',
    '-background', 'none',
    path,
    '-alpha', 'on',
    '-resize', `${size}x${size}!`,
    '-depth', '8',
    'RGBA:-',
  ], {
    encoding: null,
    maxBuffer: 4 * 1024 * 1024,
    timeout: 20_000,
    windowsHide: true,
  });
  if (result.error) throw new Error(`ImageMagick is required for maskable geometry checks: ${result.error.message}`);
  if (result.status !== 0) {
    const diagnostics = Buffer.concat([result.stdout ?? Buffer.alloc(0), result.stderr ?? Buffer.alloc(0)]).toString('utf8').trim();
    throw new Error(`ImageMagick maskable render failed (exit ${result.status}): ${diagnostics}`);
  }
  const expectedBytes = size * size * 4;
  if (result.stdout.length !== expectedBytes) throw new Error(`ImageMagick returned ${result.stdout.length} RGBA bytes; expected ${expectedBytes}`);
  return result.stdout;
}

function checkMaskableSafeCircle(path) {
  const size = 400;
  const rgba = renderRawRgba(path, size);
  const radius = size * 0.4;
  let visiblePixels = 0;
  let outsidePixels = 0;
  let maximumRadius = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const alpha = rgba[((y * size + x) * 4) + 3];
      if (alpha === 0) continue;
      visiblePixels += 1;
      const distance = Math.hypot((x + 0.5) - (size / 2), (y + 0.5) - (size / 2));
      maximumRadius = Math.max(maximumRadius, distance);
      if (distance > radius) outsidePixels += 1;
    }
  }
  if (visiblePixels === 0) fail('icon.svg: maskable core render is empty');
  if (outsidePixels > 0) {
    fail(`icon.svg: ${outsidePixels} visible pixels exceed the central 80% safe circle (maximum radius ${(maximumRadius / size * 100).toFixed(2)}%)`);
  }
  return maximumRadius / size * 100;
}

if (expectedAssets.length !== 50) fail(`Internal inventory error: expected 50 entries, got ${expectedAssets.length}`);
if (new Set(expectedAssets.map(asset => asset.id)).size !== expectedAssets.length) fail('Internal inventory error: duplicate asset ID');
if (new Set(expectedAssets.map(asset => asset.path)).size !== expectedAssets.length) fail('Internal inventory error: duplicate asset path');
const contractRejectionFixtures = [
  ['namespaced element', '<svg xmlns="http://www.w3.org/2000/svg"><x:path xmlns:x="http://www.w3.org/2000/svg" d="M0 0"/></svg>'],
  ['animation element', '<svg xmlns="http://www.w3.org/2000/svg"><animate attributeName="opacity"/></svg>'],
  ['namespaced attribute', '<svg xmlns="http://www.w3.org/2000/svg"><path xmlns:x="urn:local" x:ref="asset" d="M0 0"/></svg>'],
  ['element before root', '<path d="M0 0"/><svg xmlns="http://www.w3.org/2000/svg"/>'],
  ['element after root', '<svg xmlns="http://www.w3.org/2000/svg"/><path d="M0 0"/>'],
];
for (const [label, fixture] of contractRejectionFixtures) {
  if (validateStrictSvgDocument(fixture, `fixture:${label}`).length === 0) fail(`Internal SVG contract error: ${label} fixture was accepted`);
}

const actualSvgFiles = await listSvgFiles(assetsRoot);
const expectedPaths = expectedAssets.map(asset => asset.path);
for (const path of expectedPaths.filter(path => !actualSvgFiles.includes(path))) fail(`Missing source SVG: ${path}`);
for (const path of actualSvgFiles.filter(path => !expectedPaths.includes(path))) fail(`Unexpected source SVG: ${path}`);

const sourceRecords = [];
const sourceTextByPath = new Map();
for (const asset of expectedAssets) {
  let buffer;
  try {
    buffer = await readFile(resolve(root, asset.path));
  } catch (error) {
    fail(`${asset.path}: cannot read (${error.message})`);
    continue;
  }
  const source = buffer.toString('utf8');
  sourceTextByPath.set(asset.path, source);
  validateStrictSvgDocument(source, asset.path).forEach(fail);
  if (attribute(source.match(/^\s*<svg\b[^>]*>/)?.[0] ?? '', 'viewBox') !== asset.viewBox) {
    fail(`${asset.path}: viewBox must equal "${asset.viewBox}"`);
  }

  if (asset.category === 'pieces' && !/\bstroke-width="2"/.test(source)) fail(`${asset.path}: piece outline must use stroke-width="2"`);
  if (asset.category === 'bosses') {
    if (!/<g\b[^>]*\bid="crown-base"/.test(source)) fail(`${asset.path}: missing crown-base layer`);
    if (!/<g\b[^>]*\bid="decor"/.test(source)) fail(`${asset.path}: missing decor layer`);
  }
  if (asset.category === 'traits' && !/\bstroke-width="2"/.test(source)) fail(`${asset.path}: trait icon must use stroke-width="2"`);
  if (asset.category === 'formations') {
    if (!source.includes(`d="${formationGrid}"`)) fail(`${asset.path}: canonical six-column/four-row micro-grid is missing`);
    if (!/\bstroke-width="1"\s+opacity="\.25"/.test(source)) fail(`${asset.path}: canonical micro-grid styling is missing`);
  }
  if (asset.id.endsWith('.particles') && countVisibleTopLevelGraphics(source) !== 3) {
    fail(`${asset.path}: particle sheet must have exactly three visible top-level path/group elements`);
  }
  if (asset.id === 'brand.appIcon' && !/\bdata-maskable-safe-zone="80"/.test(source)) {
    fail(`${asset.path}: data-maskable-safe-zone="80" is required`);
  }
  if (asset.id === 'brand.appIcon' && !/<g\b(?=[^>]*\bdata-maskable-core="true")(?=[^>]*\btransform="translate\(12 12\) scale\(\.76\)")[^>]*>/.test(source)) {
    fail(`${asset.path}: canonical transformed maskable-core group is required`);
  }
  sourceRecords.push(asset);
}

let favicon = null;
let icon192 = null;
let icon512 = null;
try {
  favicon = await readFile(resolve(root, 'icon.svg'));
  const faviconText = favicon.toString('utf8');
  const faviconContractErrors = validateStrictSvgDocument(faviconText, 'icon.svg');
  faviconContractErrors.forEach(fail);
  if (/var\(/.test(faviconText)) fail('icon.svg: CSS variables are forbidden');
  if (attribute(faviconText.match(/^\s*<svg\b[^>]*>/)?.[0] ?? '', 'viewBox') !== '0 0 100 100') fail('icon.svg: viewBox must equal "0 0 100 100"');
  const expectedFavicon = makeTransparentFavicon(sourceTextByPath.get('assets/brand/app-icon.svg') ?? '');
  if (expectedFavicon === null || faviconText !== expectedFavicon) fail('icon.svg: output is not the deterministic transparent derivative of app-icon.svg');
  if (faviconContractErrors.length === 0) maskableMaximumRadiusPercent = checkMaskableSafeCircle(resolve(root, 'icon.svg'));
} catch (error) {
  fail(`icon.svg: cannot read (${error.message})`);
}

for (const [path, size] of [['icon-192.png', 192], ['icon-512.png', 512]]) {
  try {
    const buffer = await readFile(resolve(root, path));
    const dimensions = readPngMetadata(buffer, path);
    if (dimensions.width !== size || dimensions.height !== size) fail(`${path}: dimensions must equal ${size}x${size}`);
    if (path === 'icon-192.png') icon192 = buffer;
    else icon512 = buffer;
  } catch (error) {
    fail(`${path}: cannot read (${error.message})`);
  }
}

if (favicon && icon192 && icon512 && sourceRecords.length === expectedAssets.length) {
  const expectedCatalog = {
    schemaVersion: 1,
    artDirection: 'deco-court',
    sourceCount: 50,
    sources: sourceRecords,
    pwaOutputs: [
      { path: 'icon.svg', viewBox: '0 0 100 100', bytes: favicon.length },
      { path: 'icon-192.png', width: 192, height: 192, bytes: icon192.length },
      { path: 'icon-512.png', width: 512, height: 512, bytes: icon512.length },
    ],
  };
  try {
    const catalogText = await readFile(resolve(root, 'assets/catalog.json'), 'utf8');
    const canonicalCatalog = `${JSON.stringify(expectedCatalog, null, 2)}\n`;
    if (catalogText !== canonicalCatalog) fail('assets/catalog.json: catalog is stale or not in canonical stable format; run vp run crown-breaker#build:assets');
  } catch (error) {
    fail(`assets/catalog.json: cannot read (${error.message})`);
  }
}

if (errors.length) {
  console.error(`Asset checks failed (${errors.length}):`);
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`Asset checks passed (50 exact source SVGs, deterministic catalog, maskable core radius ${maskableMaximumRadiusPercent?.toFixed(2)}%, and 192/512 PWA icons).`);
