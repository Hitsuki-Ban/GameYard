const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const MAX_SVG_BYTES = 64 * 1024;

const allowedElements = new Set(['svg', 'title', 'g', 'path', 'circle']);
const allowedAttributes = new Set([
  'aria-labelledby',
  'cx',
  'cy',
  'd',
  'data-maskable-core',
  'data-maskable-safe-zone',
  'fill',
  'fill-rule',
  'height',
  'id',
  'opacity',
  'r',
  'role',
  'stroke',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-width',
  'transform',
  'viewBox',
  'width',
  'xmlns',
]);
const allowedPaint = new Set([
  'none',
  'currentColor',
  'var(--asset-background)',
  'var(--asset-primary)',
  'var(--asset-accent)',
]);

function parseAttributes(raw, elementName, path, errors) {
  const attributes = new Map();
  const pattern = /\s+([A-Za-z_][A-Za-z0-9_.:-]*)\s*=\s*(["'])(.*?)\2/gs;
  let cursor = 0;

  for (const match of raw.matchAll(pattern)) {
    if (raw.slice(cursor, match.index).trim()) {
      errors.push(`${path}: malformed or unquoted attribute syntax on <${elementName}>`);
      return attributes;
    }
    cursor = match.index + match[0].length;
    const [, name, , value] = match;
    if (name.includes(':')) errors.push(`${path}: namespaced attribute ${name} is forbidden`);
    if (!allowedAttributes.has(name)) errors.push(`${path}: attribute ${name} is not allowed on release SVGs`);
    if (attributes.has(name)) errors.push(`${path}: duplicate ${name} attribute on <${elementName}>`);
    attributes.set(name, value);
  }

  if (raw.slice(cursor).trim()) errors.push(`${path}: malformed or unquoted attribute syntax on <${elementName}>`);
  return attributes;
}

export function validateStrictSvgDocument(source, path) {
  const errors = [];
  if (typeof source !== 'string') return [`${path}: SVG source must be text`];
  if (Buffer.byteLength(source, 'utf8') > MAX_SVG_BYTES) errors.push(`${path}: SVG exceeds the 64 KiB release limit`);
  if (source.includes('\0')) errors.push(`${path}: NUL bytes are forbidden`);
  if (/<!|<\?/.test(source)) errors.push(`${path}: comments, declarations, entities, CDATA, and processing instructions are forbidden`);

  const tagPattern = /<(\/?)([A-Za-z_][A-Za-z0-9_.:-]*)([^<>]*)>/g;
  const stack = [];
  let cursor = 0;
  let elementCount = 0;
  let rootCount = 0;
  let rootClosed = false;

  for (const match of source.matchAll(tagPattern)) {
    const between = source.slice(cursor, match.index);
    if (/[<>]/.test(between)) errors.push(`${path}: malformed XML markup`);
    if (between.trim() && stack.at(-1) !== 'title') errors.push(`${path}: text content is only allowed inside <title>`);
    cursor = match.index + match[0].length;

    const closing = match[1] === '/';
    const name = match[2];
    let raw = match[3];
    if (stack.length === 0) {
      if (rootClosed) errors.push(`${path}: tags are forbidden after the root <svg> closes`);
      else if (rootCount === 0 && (closing || name !== 'svg')) errors.push(`${path}: the first and only top-level element must be <svg>`);
    }
    if (name.includes(':')) errors.push(`${path}: namespaced element <${name}> is forbidden`);
    if (!allowedElements.has(name)) errors.push(`${path}: element <${name}> is not allowed on release SVGs`);

    if (closing) {
      if (raw.trim()) errors.push(`${path}: closing tag </${name}> cannot contain attributes`);
      const opened = stack.pop();
      if (opened !== name) errors.push(`${path}: unbalanced XML tag </${name}>`);
      if (opened === 'svg' && name === 'svg' && stack.length === 0) rootClosed = true;
      continue;
    }

    const selfClosing = /\/\s*$/.test(raw);
    if (selfClosing) raw = raw.replace(/\/\s*$/, '');
    elementCount += 1;
    const attributes = parseAttributes(raw, name, path, errors);

    if (name === 'svg') {
      rootCount += 1;
      if (stack.length !== 0 || rootCount !== 1) errors.push(`${path}: SVG must have exactly one top-level root`);
      if (attributes.get('xmlns') !== SVG_NAMESPACE) errors.push(`${path}: root xmlns must equal ${SVG_NAMESPACE}`);
    } else if (attributes.has('xmlns')) {
      errors.push(`${path}: xmlns is only allowed on the root <svg>`);
    }

    for (const paintName of ['fill', 'stroke', 'color']) {
      const value = attributes.get(paintName);
      if (value !== undefined && !allowedPaint.has(value)) errors.push(`${path}: ${paintName}="${value}" is not an allowed paint token`);
    }
    for (const value of attributes.values()) {
      if (/url\s*\(/i.test(value)) errors.push(`${path}: url() references are forbidden`);
      if (/#[0-9a-f]{3,8}\b|\b(?:rgb|hsl)a?\s*\(/i.test(value)) errors.push(`${path}: hard-coded colors are forbidden`);
    }
    if (attributes.has('transform') && attributes.get('transform') !== 'translate(12 12) scale(.76)') {
      errors.push(`${path}: only the canonical maskable-core transform is allowed`);
    }
    if (attributes.has('data-maskable-core') && attributes.get('data-maskable-core') !== 'true') {
      errors.push(`${path}: data-maskable-core must equal true`);
    }
    if (attributes.has('data-maskable-safe-zone') && attributes.get('data-maskable-safe-zone') !== '80') {
      errors.push(`${path}: data-maskable-safe-zone must equal 80`);
    }
    if ((attributes.get('d')?.length ?? 0) > 32 * 1024) errors.push(`${path}: path data exceeds the 32 KiB complexity limit`);

    if (!selfClosing) stack.push(name);
    else if (name === 'svg' && stack.length === 0) rootClosed = true;
  }

  const tail = source.slice(cursor);
  if (/[<>]/.test(tail) || tail.trim()) errors.push(`${path}: malformed content after the SVG root`);
  if (rootCount !== 1) errors.push(`${path}: SVG must contain exactly one root element`);
  if (elementCount > 256) errors.push(`${path}: SVG exceeds the 256-element complexity limit`);
  if (stack.length) errors.push(`${path}: unclosed XML tag <${stack.at(-1)}>`);
  return [...new Set(errors)];
}

export function assertStrictSvgDocument(source, path) {
  const errors = validateStrictSvgDocument(source, path);
  if (errors.length) throw new Error(errors.join('\n'));
}

export const svgContract = Object.freeze({
  allowedAttributes: Object.freeze([...allowedAttributes]),
  allowedElements: Object.freeze([...allowedElements]),
  maxBytes: MAX_SVG_BYTES,
  namespace: SVG_NAMESPACE,
});
