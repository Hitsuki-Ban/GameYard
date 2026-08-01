import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

if (process.argv.length !== 2) {
  throw new Error('Usage: pnpm render:assets (this command accepts no arguments)');
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = path.join(root, 'previews', 'assets-sheet.png');
const pieceTypes = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'];
const bosses = ['twin-queens', 'iron-bastion', 'pawnstorm'];
const traits = ['guarded', 'phantom', 'chains', 'hex', 'summoner', 'thorns', 'tithe', 'mist', 'berserk', 'rampart', 'swift', 'echo', 'gravity', 'possession', 'lockstep'];
const formations = ['scatter', 'phalanx', 'pincer', 'fortress', 'vanguard', 'lance'];
const acts = ['outer', 'gallery', 'throne'];
const ui = ['turns', 'shield', 'crown', 'combo', 'energy', 'relic'];

const allowed = new Map([
  ['/previews/assets.html', ['previews/assets.html', 'text/html; charset=utf-8']],
  ['/previews/assets.css', ['previews/assets.css', 'text/css; charset=utf-8']],
  ['/previews/assets.js', ['previews/assets.js', 'text/javascript; charset=utf-8']],
  ...pieceTypes.flatMap((type) => ['white', 'black'].map((side) => [`/assets/pieces/${side}-${type}.svg`, [`assets/pieces/${side}-${type}.svg`, 'image/svg+xml']])),
  ...bosses.map((id) => [`/assets/bosses/${id}.svg`, [`assets/bosses/${id}.svg`, 'image/svg+xml']]),
  ...traits.map((id) => [`/assets/traits/${id}.svg`, [`assets/traits/${id}.svg`, 'image/svg+xml']]),
  ...formations.map((id) => [`/assets/formations/${id}.svg`, [`assets/formations/${id}.svg`, 'image/svg+xml']]),
  ...acts.flatMap((id) => [
    [`/assets/acts/${id}.svg`, [`assets/acts/${id}.svg`, 'image/svg+xml']],
    [`/assets/acts/${id}-particles.svg`, [`assets/acts/${id}-particles.svg`, 'image/svg+xml']]
  ]),
  ...ui.map((id) => [`/assets/ui/${id}.svg`, [`assets/ui/${id}.svg`, 'image/svg+xml']]),
  ['/assets/brand/logo.svg', ['assets/brand/logo.svg', 'image/svg+xml']],
  ['/assets/brand/app-icon.svg', ['assets/brand/app-icon.svg', 'image/svg+xml']]
]);

const server = createServer(async (request, response) => {
  try {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Method Not Allowed');
      return;
    }
    const rawPath = (request.url ?? '').split(/[?#]/, 1)[0];
    const decodedPath = decodeURIComponent(rawPath);
    if (decodedPath.includes('\\') || decodedPath.includes('\0') || decodedPath.split('/').some((segment) => segment === '.' || segment === '..')) {
      response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Invalid path');
      return;
    }
    const entry = allowed.get(decodedPath);
    if (!entry) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not Found');
      return;
    }
    const [relativePath, contentType] = entry;
    const absolutePath = path.join(root, ...relativePath.split('/'));
    const body = await readFile(absolutePath);
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Length': body.byteLength,
      'Content-Type': contentType,
      'X-Content-Type-Options': 'nosniff'
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) {
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(error instanceof Error ? error.message : String(error));
  }
});

let browser;
try {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Preview server did not expose a TCP port');
  const origin = `http://127.0.0.1:${address.port}`;
  const diagnostics = [];

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') diagnostics.push(`console.${message.type()}: ${message.text()}`);
  });
  page.on('pageerror', (error) => diagnostics.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (request) => diagnostics.push(`requestfailed: ${request.url()} — ${request.failure()?.errorText ?? 'unknown error'}`));
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) {
      diagnostics.push(`blocked non-loopback request: ${url.href}`);
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });

  await page.goto(`${origin}/previews/assets.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__ASSET_PREVIEW_READY__ === true || Boolean(window.__ASSET_PREVIEW_ERROR__));
  const previewError = await page.evaluate(() => window.__ASSET_PREVIEW_ERROR__);
  if (previewError) throw new Error(`Preview boot failed: ${previewError}`);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  if (diagnostics.length) throw new Error(`Browser diagnostics:\n${diagnostics.join('\n')}`);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await page.screenshot({ path: outputPath, fullPage: true, type: 'png' });
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }));
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const mobileLayout = await page.evaluate(() => {
      const heading = document.querySelector('h1');
      return {
        clientWidth: document.documentElement.clientWidth,
        headingClientWidth: heading?.clientWidth ?? 0,
        headingScrollWidth: heading?.scrollWidth ?? 0,
        scrollWidth: document.documentElement.scrollWidth,
      };
    });
    if (mobileLayout.scrollWidth !== mobileLayout.clientWidth) {
      throw new Error(`Asset preview overflows horizontally at ${width}px (${mobileLayout.scrollWidth}px document width)`);
    }
    if (mobileLayout.headingScrollWidth > mobileLayout.headingClientWidth) {
      throw new Error(`Asset preview heading clips at ${width}px (${mobileLayout.headingScrollWidth}px content in ${mobileLayout.headingClientWidth}px box)`);
    }
  }
  if (diagnostics.length) throw new Error(`Browser diagnostics after responsive checks:\n${diagnostics.join('\n')}`);
  process.stdout.write(`Rendered ${path.relative(root, outputPath)} at ${dimensions.width}x${dimensions.height}; 390/320px layouts have no horizontal overflow.\n`);
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(() => resolve()));
}
