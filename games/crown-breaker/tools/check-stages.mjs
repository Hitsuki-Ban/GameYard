import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, realpath, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const projectRoot = resolve(import.meta.dirname, '..');
const root = resolve(import.meta.dirname, '../../../.gameyard/testkit/games/crown-breaker');
const rootReal = await realpath(root);
const actAssets = Object.freeze([
  'assets/acts/outer.svg',
  'assets/acts/outer-particles.svg',
  'assets/acts/gallery.svg',
  'assets/acts/gallery-particles.svg',
  'assets/acts/throne.svg',
  'assets/acts/throne-particles.svg',
]);
const contentTypes = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
});
const stages = Object.freeze([
  { act: 'outer', depth: 3, seeds: [0x13572468, 0x24681357] },
  { act: 'gallery', depth: 5, seeds: [0x31415926, 0x27182818] },
  { act: 'throne', depth: 7, seeds: [0x5a17c0de, 0x7e57c0de] },
]);

function normalizedEnemyCoordinates(snapshot) {
  return snapshot.pieces
    .filter(piece => piece.alive && piece.color === 'b')
    .map(piece => ({ type: piece.type, x: piece.x, y: piece.y, veteran: Boolean(piece.veteran) }))
    .sort((left, right) => `${left.y}:${left.x}:${left.type}`.localeCompare(`${right.y}:${right.x}:${right.type}`));
}

function createStaticServer() {
  let expectedHost = null;
  const server = createServer(async (request, response) => {
    try {
      if (!['GET', 'HEAD'].includes(request.method)) {
        response.writeHead(405, { allow: 'GET, HEAD', 'content-type': 'text/plain; charset=utf-8' });
        response.end('Method not allowed');
        return;
      }
      if (request.headers.host !== expectedHost) {
        response.writeHead(421, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Misdirected request');
        return;
      }

      const rawPath = new URL(request.url, 'http://127.0.0.1').pathname;
      const pathname = decodeURIComponent(rawPath);
      if (pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').some(segment => segment === '.' || segment === '..')) {
        response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Invalid path');
        return;
      }
      const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
      const file = resolve(root, relative);
      if (file !== root && !file.startsWith(`${root}${sep}`)) throw new Error('Path escapes project root.');
      const fileReal = await realpath(file);
      if (fileReal !== rootReal && !fileReal.startsWith(`${rootReal}${sep}`)) throw new Error('Resolved path escapes project root.');
      const fileStat = await stat(fileReal);
      if (!fileStat.isFile()) throw new Error('Not a file.');
      const body = await readFile(fileReal);
      response.writeHead(200, {
        'cache-control': 'no-store',
        'content-length': body.byteLength,
        'content-type': contentTypes[extname(fileReal)] || 'application/octet-stream',
        'x-content-type-options': 'nosniff',
      });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch (error) {
      response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      response.end(error instanceof Error ? error.message : String(error));
    }
  });
  return {
    server,
    setExpectedHost(value) { expectedHost = value; },
  };
}

export async function runStageChecks({ writeScreenshots }) {
  if (typeof writeScreenshots !== 'boolean') throw new TypeError('writeScreenshots must be a boolean.');
  const { server, setExpectedHost } = createStaticServer();
  let browser = null;
  let context = null;
  const diagnostics = [];
  const externalRequests = [];

  try {
    await new Promise((resolveListen, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolveListen);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Stage QA server did not bind to a TCP port.');
    const host = `127.0.0.1:${address.port}`;
    const origin = `http://${host}`;
    setExpectedHost(host);

    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
      serviceWorkers: 'block',
    });
    await context.addInitScript(() => {
      const storageGuard = 'crownBreaker.stageQa.storageInitialized';
      if (sessionStorage.getItem(storageGuard) !== 'true') {
        localStorage.clear();
        sessionStorage.setItem(storageGuard, 'true');
      }
    });
    await context.route('**/*', async route => {
      const requestUrl = new URL(route.request().url());
      if (requestUrl.origin !== origin) {
        externalRequests.push(requestUrl.href);
        await route.abort('blockedbyclient');
        return;
      }
      await route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', error => diagnostics.push(`pageerror: ${error.stack || error.message}`));
    page.on('console', message => {
      if (message.type() === 'error') diagnostics.push(`console.error: ${message.text()}`);
    });
    page.on('requestfailed', request => {
      if (new URL(request.url()).origin === origin) {
        diagnostics.push(`requestfailed: ${request.url()} — ${request.failure()?.errorText ?? 'unknown error'}`);
      }
    });

    await page.goto(`${origin}/`, { waitUntil: 'networkidle' });
    try {
      await page.waitForFunction(() => window.__CB_HOST__?.ready === true && Boolean(window.__CB_TEST__), null, { timeout: 5000 });
    } catch (error) {
      throw new Error(`CrownBreaker testkit did not initialize. ${diagnostics.join(' | ')}`, { cause: error });
    }
    const hookShape = await page.evaluate(() => ({
      startSetpiece: typeof window.__CB_TEST__.startSetpiece,
      materializeSetpiece: typeof window.__CB_TEST__.materializeSetpiece,
      acts: typeof window.__CB_TEST__.acts,
      state: typeof window.__CB_TEST__.state,
    }));
    assert.deepEqual(hookShape, {
      startSetpiece: 'function',
      materializeSetpiece: 'function',
      acts: 'function',
      state: 'function',
    }, 'required stage QA hooks are missing');
    const actDefinitions = await page.evaluate(() => window.__CB_TEST__.acts());
    assert.deepEqual(actDefinitions.map(act => ({ themeKey: act.themeKey, setpieceDepth: act.setpieceDepth })), [
      { themeKey: 'outer', setpieceDepth: 3 },
      { themeKey: 'gallery', setpieceDepth: 5 },
      { themeKey: 'throne', setpieceDepth: 7 },
    ], 'act registry theme/setpiece mapping mismatch');
    for (const act of actDefinitions) {
      assert.equal(typeof act.flavorKeys?.intro, 'string', `${act.themeKey}: intro flavor key is missing`);
      assert.equal(typeof act.flavorKeys?.victory, 'string', `${act.themeKey}: victory flavor key is missing`);
      assert.equal(typeof act.flavorKeys?.setpieceName, 'string', `${act.themeKey}: setpiece name key is missing`);
      assert.equal(typeof act.flavorKeys?.setpieceLine, 'string', `${act.themeKey}: setpiece line key is missing`);
    }

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(() => window.__CB_TEST__.fast(true));
    const applicationReducedMotion = await page.evaluate(() => ({
      mediaMatches: matchMedia('(prefers-reduced-motion: reduce)').matches,
      motion: document.querySelector('#app')?.dataset.motion,
      particleAnimation: getComputedStyle(document.querySelector('#act-particles')).animationName,
    }));
    assert.equal(applicationReducedMotion.mediaMatches, false, 'application reduced-motion check requires no OS preference');
    assert.equal(applicationReducedMotion.motion, 'reduced', 'application reduced-motion setting did not update #app');
    assert.equal(applicationReducedMotion.particleAnimation, 'none', 'application reduced-motion setting did not freeze stage particles');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => window.__CB_TEST__.fast(true));

    const queuedTutorials = await page.evaluate(() => {
      window.__CB_TEST__.startSetpiece(5, 0x13579BDF);
      const afterStart = window.__CB_TEST__.tutorial();
      const selected = window.__CB_TEST__.selectPiece('pawn-a');
      const afterSelect = window.__CB_TEST__.tutorial();
      window.__CB_TEST__.retry();
      const afterRetry = window.__CB_TEST__.tutorial();
      return { afterStart, selected, afterSelect, afterRetry };
    });
    assert.equal(queuedTutorials.selected, true, 'tutorial regression fixture could not select pawn-a');
    assert.equal(queuedTutorials.afterStart.seen.intent, false, 'intent tutorial was persisted before display');
    assert.ok(queuedTutorials.afterStart.queue.some(message => message.seenFlag === 'intent'), 'intent tutorial was not queued behind the opening messages');
    assert.equal(queuedTutorials.afterSelect.seen.select, false, 'move tutorial was persisted before display');
    assert.ok(queuedTutorials.afterSelect.queue.some(message => message.seenFlag === 'select'), 'move tutorial was not queued after fast selection');
    assert.equal(queuedTutorials.afterRetry.seen.intent, false, 'retry persisted an undisplayed intent tutorial');
    assert.equal(queuedTutorials.afterRetry.seen.select, false, 'retry persisted an undisplayed move tutorial');
    const retryMessages = [queuedTutorials.afterRetry.current, ...queuedTutorials.afterRetry.queue].filter(Boolean);
    assert.ok(retryMessages.some(message => message.key === 'tutorial.select'), 'retry lost the first-selection tutorial');
    assert.ok(retryMessages.some(message => message.seenFlag === 'intent'), 'retry lost the queued intent tutorial');

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__CB_HOST__?.ready === true && Boolean(window.__CB_TEST__), null, { timeout: 5000 });
    await page.locator('#btn-continue').click();
    await page.waitForFunction(() => window.__CB_TEST__.state().screen === 'playing', null, { timeout: 5000 });
    const refreshedTutorials = await page.evaluate(() => window.__CB_TEST__.tutorial());
    assert.equal(refreshedTutorials.seen.intent, false, 'refresh persisted an undisplayed intent tutorial');
    assert.equal(refreshedTutorials.seen.select, false, 'refresh persisted an undisplayed move tutorial');
    const refreshedMessages = [refreshedTutorials.current, ...refreshedTutorials.queue].filter(Boolean);
    assert.ok(refreshedMessages.some(message => message.key === 'tutorial.select'), 'refresh lost the first-selection tutorial');
    assert.ok(refreshedMessages.some(message => message.seenFlag === 'intent'), 'refresh lost the queued intent tutorial');

    if (writeScreenshots) await mkdir(resolve(projectRoot, 'previews'), { recursive: true });
    for (const stage of stages) {
      const snapshots = [];
      for (const [seedIndex, seed] of stage.seeds.entries()) {
        await page.evaluate(({ depth, runSeed }) => window.__CB_TEST__.startSetpiece(depth, runSeed), { depth: stage.depth, runSeed: seed });
        await page.waitForFunction(({ expectedAct, expectedDepth }) => {
          const snapshot = window.__CB_TEST__.state();
          return snapshot.screen === 'playing'
            && snapshot.active === true
            && snapshot.run?.currentContract?.depth === expectedDepth
            && snapshot.act === expectedAct
            && snapshot.appAct === expectedAct;
        }, { expectedAct: stage.act, expectedDepth: stage.depth }, { timeout: 5000, polling: 10 });
        await page.evaluate(async () => {
          await document.fonts.ready;
          await new Promise(resolveTimer => setTimeout(resolveTimer, 200));
          await new Promise(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(resolveFrame)));
        });

        const snapshot = await page.evaluate(() => window.__CB_TEST__.state());
        assert.equal(snapshot.act, stage.act, `${stage.act}: state().act mismatch`);
        assert.equal(snapshot.appAct, stage.act, `${stage.act}: state().appAct mismatch`);
        assert.equal(await page.locator('#app').getAttribute('data-act'), stage.act, `${stage.act}: #app data-act mismatch`);
        assert.equal(snapshot.run.currentContract.depth, stage.depth, `${stage.act}: contract depth mismatch`);
        assert.equal(snapshot.run.currentContract.id.startsWith('setpiece-'), true, `${stage.act}: canonical setpiece id is missing`);
        const materialized = await page.evaluate(depth => window.__CB_TEST__.materializeSetpiece(depth), stage.depth);
        assert.equal(materialized.before, materialized.after, `${stage.act}: materializing a fixed setpiece consumed Run RNG`);
        assert.deepEqual(materialized.contract, snapshot.run.currentContract, `${stage.act}: materialized setpiece differs from the active contract`);
        snapshots.push({
          contract: snapshot.run.currentContract,
          coordinates: normalizedEnemyCoordinates(snapshot),
        });

        const reducedMotion = await page.evaluate(async () => {
          const backdrop = document.querySelector('#act-backdrop');
          const particles = document.querySelector('#act-particles');
          if (!(backdrop instanceof HTMLElement)) throw new Error('#act-backdrop is missing.');
          if (!(particles instanceof HTMLElement)) throw new Error('#act-particles is missing.');
          const backdropStyle = getComputedStyle(backdrop);
          const first = getComputedStyle(particles);
          const before = first.transform;
          const durations = first.animationDuration.split(',').map(value => {
            const trimmed = value.trim();
            if (trimmed.endsWith('ms')) return Number.parseFloat(trimmed);
            if (trimmed.endsWith('s')) return Number.parseFloat(trimmed) * 1000;
            return Number.NaN;
          });
          await new Promise(resolveTimer => setTimeout(resolveTimer, 80));
          return {
            matches: matchMedia('(prefers-reduced-motion: reduce)').matches,
            durations,
            before,
            after: getComputedStyle(particles).transform,
            backdropImage: `${backdropStyle.backgroundImage} ${backdropStyle.maskImage} ${backdropStyle.webkitMaskImage}`,
            particleImage: `${first.backgroundImage} ${first.maskImage} ${first.webkitMaskImage}`,
            particleDisplay: first.display,
            particleVisibility: first.visibility,
            particleOpacity: Number.parseFloat(first.opacity),
          };
        });
        assert.equal(reducedMotion.matches, true, `${stage.act}: reduced-motion media query is not active`);
        assert.notEqual(reducedMotion.backdropImage, 'none none none', `${stage.act}: bundled backdrop asset is not active`);
        assert.notEqual(reducedMotion.particleImage, 'none none none', `${stage.act}: bundled particle asset is not active`);
        assert.notEqual(reducedMotion.particleDisplay, 'none', `${stage.act}: particle layer is removed under reduced motion`);
        assert.notEqual(reducedMotion.particleVisibility, 'hidden', `${stage.act}: particle layer is hidden under reduced motion`);
        assert.ok(reducedMotion.particleOpacity > 0, `${stage.act}: particle layer is transparent under reduced motion`);
        assert.ok(reducedMotion.durations.length > 0 && reducedMotion.durations.every(value => Number.isFinite(value) && value <= 1), `${stage.act}: particle animation is not reduced to 1ms or less`);
        assert.equal(reducedMotion.after, reducedMotion.before, `${stage.act}: particle layer moved under reduced motion`);

        if (writeScreenshots && seedIndex === 0) {
          await page.waitForTimeout(1000);
          await page.evaluate(() => new Promise(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(resolveFrame))));
          await page.screenshot({
            path: resolve(projectRoot, 'previews', `stage-${stage.act}.png`),
            type: 'png',
          });
        }
      }
      assert.deepEqual(snapshots[1].contract, snapshots[0].contract, `${stage.act}: fixed setpiece contract changed across run seeds`);
      assert.deepEqual(snapshots[1].coordinates, snapshots[0].coordinates, `${stage.act}: fixed setpiece coordinates changed across run seeds`);
    }

    assert.deepEqual(externalRequests, [], `external requests were attempted:\n${externalRequests.join('\n')}`);
    assert.deepEqual(diagnostics, [], `browser diagnostics:\n${diagnostics.join('\n')}`);
    process.stdout.write(`Stage checks passed (3 acts, deterministic setpieces, reduced motion${writeScreenshots ? ', 3 screenshots' : ''}).\n`);
  } finally {
    await context?.close();
    await browser?.close();
    await new Promise(resolveClose => server.close(resolveClose));
  }
}

const directEntry = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (directEntry) {
  if (process.argv.length !== 2) throw new RangeError('Usage: vp run crown-breaker#check:stages (this command accepts no arguments)');
  await runStageChecks({ writeScreenshots: false });
}
