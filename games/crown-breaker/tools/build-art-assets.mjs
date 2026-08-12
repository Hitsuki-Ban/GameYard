import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertStrictSvgDocument } from './svg-contract.mjs';

if (process.argv.length !== 2) {
  console.error('Usage: node tools/build-art-assets.mjs');
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
const sourceAssets = [
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

if (sourceAssets.length !== 50) throw new Error(`Internal inventory error: expected 50 assets, got ${sourceAssets.length}`);

async function listSvgFiles(directory) {
  const files = [];
  async function walk(current) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = resolve(current, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isSymbolicLink()) throw new Error(`Symbolic links are not allowed in assets/: ${relative(root, absolute)}`);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.svg')) {
        files.push(relative(root, absolute).split(sep).join('/'));
      }
    }
  }
  await walk(directory);
  return files.sort((a, b) => a.localeCompare(b, 'en'));
}

function assertExactInventory(actual) {
  const expected = sourceAssets.map(asset => asset.path);
  const missing = expected.filter(path => !actual.includes(path));
  const extra = actual.filter(path => !expected.includes(path));
  if (missing.length || extra.length) {
    const details = [
      ...missing.map(path => `missing ${path}`),
      ...extra.map(path => `unexpected ${path}`),
    ];
    throw new Error(`Source SVG inventory mismatch:\n${details.map(item => `- ${item}`).join('\n')}`);
  }
}

function makeTransparentFavicon(appIcon) {
  const backgroundPattern = /\s*<path\b(?=[^>]*\bfill="var\(--asset-background\)")(?=[^>]*\bd="M0 0h100v100H0z")[^>]*\/>/;
  if (!backgroundPattern.test(appIcon)) throw new Error('app-icon.svg: canonical background layer is missing');
  const output = appIcon
    .replace(backgroundPattern, '')
    .replace(' data-maskable-safe-zone="80"', '')
    .replaceAll('var(--asset-primary)', 'currentColor')
    .replaceAll('var(--asset-accent)', 'currentColor');
  if (/var\(/.test(output) || /#[0-9a-f]{3,8}\b|\b(?:rgb|hsl)a?\(/i.test(output)) {
    throw new Error('Derived icon.svg contains an unresolved token or hard-coded color');
  }
  return output.endsWith('\n') ? output : `${output}\n`;
}

function makeReleasePngSvg(appIcon) {
  const output = appIcon
    .replaceAll('var(--asset-background)', '#07050d')
    .replaceAll('var(--asset-primary)', '#55f6ff')
    .replaceAll('var(--asset-accent)', '#ffd769')
    .replaceAll('currentColor', '#f7f4ff');
  if (/var\(/.test(output)) throw new Error('PNG export SVG contains an unresolved CSS token');
  return output.endsWith('\n') ? output : `${output}\n`;
}

function runMagick(input, output, size) {
  const result = spawnSync('magick', [
    '-limit', 'memory', '64MiB',
    '-limit', 'map', '128MiB',
    '-limit', 'disk', '64MiB',
    '-limit', 'area', '4MP',
    '-limit', 'width', '1024',
    '-limit', 'height', '1024',
    '-limit', 'time', '15',
    '-background', 'none',
    input,
    '-resize', `${size}x${size}!`,
    '-strip',
    '-define', 'png:exclude-chunks=date,time',
    '-define', 'png:compression-level=9',
    `PNG32:${output}`,
  ], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    timeout: 20_000,
    windowsHide: true,
  });
  if (result.error) throw new Error(`ImageMagick is required for PWA export: ${result.error.message}`);
  if (result.status !== 0) {
    const outputText = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`ImageMagick failed for ${size}x${size} export (exit ${result.status}): ${outputText}`);
  }
}

function pngDimensions(buffer, path) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature) || buffer.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error(`${path}: invalid PNG signature or IHDR`);
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

const actualSvgFiles = await listSvgFiles(assetsRoot);
assertExactInventory(actualSvgFiles);

const sourceRecords = [];
for (const asset of sourceAssets) {
  const content = await readFile(resolve(root, asset.path));
  assertStrictSvgDocument(content.toString('utf8'), asset.path);
  sourceRecords.push(asset);
}

const appIconPath = resolve(root, 'assets/brand/app-icon.svg');
const appIcon = await readFile(appIconPath, 'utf8');
if (!/\bdata-maskable-safe-zone="80"/.test(appIcon)) {
  throw new Error('assets/brand/app-icon.svg: data-maskable-safe-zone="80" is required');
}
if (!/<g\b(?=[^>]*\bdata-maskable-core="true")(?=[^>]*\btransform="translate\(12 12\) scale\(\.76\)")[^>]*>/.test(appIcon)) {
  throw new Error('assets/brand/app-icon.svg: canonical transformed maskable-core group is required');
}

const temporaryDirectory = await mkdtemp(join(tmpdir(), 'crown-breaker-art-'));
try {
  const favicon = Buffer.from(makeTransparentFavicon(appIcon), 'utf8');
  const pngSourcePath = join(temporaryDirectory, 'app-icon-release.svg');
  const icon192Path = join(temporaryDirectory, 'icon-192.png');
  const icon512Path = join(temporaryDirectory, 'icon-512.png');
  await writeFile(pngSourcePath, makeReleasePngSvg(appIcon), 'utf8');
  runMagick(pngSourcePath, icon192Path, 192);
  runMagick(pngSourcePath, icon512Path, 512);

  const icon192 = await readFile(icon192Path);
  const icon512 = await readFile(icon512Path);
  const dimensions192 = pngDimensions(icon192, 'icon-192.png');
  const dimensions512 = pngDimensions(icon512, 'icon-512.png');
  if (dimensions192.width !== 192 || dimensions192.height !== 192) throw new Error('icon-192.png: export dimensions are not 192x192');
  if (dimensions512.width !== 512 || dimensions512.height !== 512) throw new Error('icon-512.png: export dimensions are not 512x512');

  const pwaOutputs = [
    { path: 'icon.svg', viewBox: '0 0 100 100', bytes: favicon.length },
    { path: 'icon-192.png', width: 192, height: 192, bytes: icon192.length },
    { path: 'icon-512.png', width: 512, height: 512, bytes: icon512.length },
  ];
  const catalog = {
    schemaVersion: 1,
    artDirection: 'deco-court',
    sourceCount: sourceRecords.length,
    sources: sourceRecords,
    pwaOutputs,
  };

  await writeFile(resolve(root, 'icon.svg'), favicon);
  await writeFile(resolve(root, 'icon-192.png'), icon192);
  await writeFile(resolve(root, 'icon-512.png'), icon512);
  await writeFile(resolve(root, 'assets/catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}

console.log(`Built deterministic art catalog and PWA icons from ${sourceRecords.length} source SVGs.`);
