'use strict';
window.__ASSET_PREVIEW_READY__ = false;
window.__ASSET_PREVIEW_ERROR__ = '';

const pieceTypes = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'];
const traits = ['guarded', 'phantom', 'chains', 'hex', 'summoner', 'thorns', 'tithe', 'mist', 'berserk', 'rampart', 'swift', 'echo', 'gravity', 'possession', 'lockstep'];
const formations = ['scatter', 'phalanx', 'pincer', 'fortress', 'vanguard', 'lance'];
const bosses = ['twin-queens', 'iron-bastion', 'pawnstorm'];
const acts = ['outer', 'gallery', 'throne'];
const ui = ['turns', 'shield', 'crown', 'combo', 'energy', 'relic'];
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const XMLNS_NAMESPACE = 'http://www.w3.org/2000/xmlns/';
const allowedElementNames = new Set(['svg', 'title', 'g', 'path', 'circle']);
const allowedAttributeNames = new Set([
  'aria-labelledby', 'cx', 'cy', 'd', 'data-maskable-core', 'data-maskable-safe-zone',
  'fill', 'fill-rule', 'height', 'id', 'opacity', 'r', 'role', 'stroke',
  'stroke-linecap', 'stroke-linejoin', 'stroke-width', 'transform', 'viewBox', 'width', 'xmlns'
]);
const allowedPaintValues = new Set([
  'none', 'currentColor', 'var(--asset-background)', 'var(--asset-primary)', 'var(--asset-accent)'
]);
const titleCase = (value) => value.split('-').map((word) => word[0].toUpperCase() + word.slice(1)).join(' ');

const assetTarget = (path, className = '') => {
  const node = document.createElement('div');
  node.className = `asset-target ${className}`.trim();
  node.dataset.path = path;
  return node;
};

for (const type of pieceTypes) {
  const card = document.createElement('article');
  card.className = 'piece-card';
  const label = document.createElement('h3');
  label.textContent = titleCase(type);
  card.append(label);
  for (const side of ['white', 'black']) {
    const row = document.createElement('div');
    row.className = `piece-side ${side}`;
    const sideLabel = document.createElement('span');
    sideLabel.textContent = side === 'white' ? 'PLAYER' : 'ENEMY';
    row.append(sideLabel);
    for (const size of [100, 48, 24, 16]) {
      const specimen = document.createElement('div');
      specimen.className = `piece-specimen size-${size}`;
      specimen.append(assetTarget(`assets/pieces/${side}-${type}.svg`));
      const dimension = document.createElement('small');
      dimension.textContent = size;
      specimen.append(dimension);
      row.append(specimen);
    }
    card.append(row);
  }
  document.querySelector('#piece-grid').append(card);

  const pair = document.createElement('div');
  pair.className = 'mono-pair';
  pair.append(assetTarget(`assets/pieces/white-${type}.svg`));
  pair.append(assetTarget(`assets/pieces/black-${type}.svg`));
  document.querySelector('#mono-pairs').append(pair);
}

for (const id of bosses) {
  const card = document.createElement('article');
  card.className = 'boss-card';
  card.append(assetTarget(`assets/bosses/${id}.svg`));
  const label = document.createElement('h3');
  label.textContent = titleCase(id);
  card.append(label);
  document.querySelector('#boss-grid').append(card);
}

const addGlyphCards = (rootId, directory, ids) => {
  const root = document.querySelector(rootId);
  for (const id of ids) {
    const card = document.createElement('article');
    card.className = 'glyph-card';
    const sizes = document.createElement('div');
    sizes.className = 'glyph-sizes';
    sizes.append(assetTarget(`assets/${directory}/${id}.svg`, 'glyph-24'));
    sizes.append(assetTarget(`assets/${directory}/${id}.svg`, 'glyph-16'));
    const label = document.createElement('span');
    label.textContent = titleCase(id);
    card.append(sizes, label);
    root.append(card);
  }
};
addGlyphCards('#trait-grid', 'traits', traits);
addGlyphCards('#formation-grid', 'formations', formations);
addGlyphCards('#ui-grid', 'ui', ui);

for (const id of acts) {
  const card = document.createElement('article');
  card.className = `act-card ${id}`;
  const plate = document.createElement('div');
  plate.className = 'act-plate';
  plate.append(assetTarget(`assets/acts/${id}.svg`, 'act-background'));
  plate.append(assetTarget(`assets/acts/${id}-particles.svg`, 'act-particles'));
  const copy = document.createElement('div');
  const actNumber = acts.indexOf(id) + 1;
  const actLabel = document.createElement('span');
  actLabel.textContent = `ACT 0${actNumber}`;
  const actTitle = document.createElement('h3');
  actTitle.textContent = titleCase(id);
  const actDescription = document.createElement('p');
  actDescription.textContent = 'background plate + particle triptych';
  copy.append(actLabel, actTitle, actDescription);
  card.append(plate, copy);
  document.querySelector('#act-grid').append(card);
}

const allowedPaths = new Set([
  ...pieceTypes.flatMap((type) => ['white', 'black'].map((side) => `assets/pieces/${side}-${type}.svg`)),
  ...bosses.map((id) => `assets/bosses/${id}.svg`),
  ...traits.map((id) => `assets/traits/${id}.svg`),
  ...formations.map((id) => `assets/formations/${id}.svg`),
  ...acts.flatMap((id) => [`assets/acts/${id}.svg`, `assets/acts/${id}-particles.svg`]),
  ...ui.map((id) => `assets/ui/${id}.svg`),
  'assets/brand/logo.svg',
  'assets/brand/app-icon.svg'
]);

const assertSafeSvgDocument = (documentSvg, path) => {
  if (documentSvg.querySelector('parsererror') || documentSvg.doctype || documentSvg.documentElement.localName !== 'svg') {
    throw new Error(`Invalid SVG document: ${path}`);
  }
  for (const node of documentSvg.childNodes) {
    if (node.nodeType === Node.ELEMENT_NODE) continue;
    if (node.nodeType === Node.TEXT_NODE && !node.textContent.trim()) continue;
    throw new Error(`Forbidden top-level XML node in ${path}`);
  }
  const elements = [...documentSvg.getElementsByTagName('*')];
  if (elements.length === 0 || elements[0] !== documentSvg.documentElement) throw new Error(`Missing SVG root: ${path}`);
  if (elements.length > 256) throw new Error(`SVG element limit exceeded in ${path}`);
  for (const element of elements) {
    if (element.namespaceURI !== SVG_NAMESPACE || element.prefix || !allowedElementNames.has(element.localName)) {
      throw new Error(`Forbidden SVG element <${element.tagName}> in ${path}`);
    }
    for (const attribute of element.attributes) {
      const isDefaultXmlns = attribute.name === 'xmlns' && attribute.namespaceURI === XMLNS_NAMESPACE;
      if ((!isDefaultXmlns && attribute.namespaceURI) || attribute.prefix || !allowedAttributeNames.has(attribute.name)) {
        throw new Error(`Forbidden SVG attribute ${attribute.name} in ${path}`);
      }
      if (['fill', 'stroke', 'color'].includes(attribute.name) && !allowedPaintValues.has(attribute.value)) {
        throw new Error(`Forbidden SVG paint ${attribute.name}="${attribute.value}" in ${path}`);
      }
      if (/url\s*\(|#[0-9a-f]{3,8}\b|\b(?:rgb|hsl)a?\s*\(/i.test(attribute.value)) {
        throw new Error(`Forbidden SVG value in ${path}`);
      }
      if (attribute.name === 'd' && attribute.value.length > 32 * 1024) throw new Error(`SVG path complexity limit exceeded in ${path}`);
      if (attribute.name === 'transform' && attribute.value !== 'translate(12 12) scale(.76)') {
        throw new Error(`Non-canonical SVG transform in ${path}`);
      }
      if (attribute.name === 'data-maskable-core' && attribute.value !== 'true') throw new Error(`Invalid maskable-core marker in ${path}`);
      if (attribute.name === 'data-maskable-safe-zone' && attribute.value !== '80') throw new Error(`Invalid maskable safe-zone marker in ${path}`);
    }
  }
};

const assertSanitizerRejectsNamespaces = () => {
  const fixture = new DOMParser().parseFromString(
    '<svg xmlns="http://www.w3.org/2000/svg"><x:path xmlns:x="http://www.w3.org/2000/svg" d="M0 0"/></svg>',
    'image/svg+xml'
  );
  try {
    assertSafeSvgDocument(fixture, 'namespace self-test');
  } catch {
    return;
  }
  throw new Error('SVG sanitizer namespace self-test failed');
};

const loadSvg = async (path) => {
  if (!allowedPaths.has(path)) throw new Error(`Asset path is not in the preview allowlist: ${path}`);
  const response = await fetch(`../${path}`, { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) throw new Error(`Failed to load ${path}: HTTP ${response.status}`);
  const source = await response.text();
  if (new TextEncoder().encode(source).byteLength > 64 * 1024) throw new Error(`SVG size limit exceeded: ${path}`);
  const documentSvg = new DOMParser().parseFromString(source, 'image/svg+xml');
  assertSafeSvgDocument(documentSvg, path);
  const svg = document.importNode(documentSvg.documentElement, true);
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('aria-hidden', 'true');
  return svg;
};

const boot = async () => {
  try {
    assertSanitizerRejectsNamespaces();
    const targets = [...document.querySelectorAll('.asset-target')];
    const uniquePaths = new Set(targets.map((target) => target.dataset.path));
    if (uniquePaths.size !== 50 || uniquePaths.size !== allowedPaths.size) {
      throw new Error(`Preview inventory mismatch: expected 50 unique SVGs, found ${uniquePaths.size}`);
    }
    const cache = new Map();
    await Promise.all([...uniquePaths].map(async (path) => cache.set(path, await loadSvg(path))));
    for (const target of targets) target.append(cache.get(target.dataset.path).cloneNode(true));
    document.documentElement.dataset.ready = 'true';
    window.__ASSET_PREVIEW_READY__ = true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    window.__ASSET_PREVIEW_ERROR__ = message;
    const panel = document.querySelector('#preview-error');
    panel.hidden = false;
    panel.textContent = `ASSET PREVIEW FAILED — ${message}`;
    console.error(message);
  }
};

void boot();
