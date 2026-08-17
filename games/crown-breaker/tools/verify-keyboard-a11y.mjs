import assert from 'node:assert/strict';
import { createReadStream, realpathSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');
const TESTKIT_ROOT = path.resolve(PROJECT_ROOT, '../../.gameyard/testkit/games/crown-breaker');
const REAL_TESTKIT_ROOT = realpathSync(TESTKIT_ROOT);
const MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml']
]);

function createStaticServer() {
  const rootPrefix = `${TESTKIT_ROOT}${path.sep}`;
  const realRootPrefix = `${REAL_TESTKIT_ROOT}${path.sep}`;
  return createServer((request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' });
      response.end();
      return;
    }
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const target = path.resolve(TESTKIT_ROOT, relative);
    if (relative.split(/[\\/]/).some(segment => segment.startsWith('.'))
      || (target !== TESTKIT_ROOT && !target.startsWith(rootPrefix))) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }
    let realTarget;
    let file;
    try {
      realTarget = realpathSync(target);
      file = statSync(realTarget);
    } catch {
      response.writeHead(404);
      response.end('Not found');
      return;
    }
    if ((realTarget !== REAL_TESTKIT_ROOT && !realTarget.startsWith(realRootPrefix)) || !file.isFile()) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Type': MIME_TYPES.get(path.extname(realTarget).toLowerCase()) || 'application/octet-stream'
    });
    if (request.method === 'HEAD') response.end();
    else createReadStream(realTarget).pipe(response);
  });
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Static server did not bind to a TCP port.');
  return `http://127.0.0.1:${address.port}/`;
}

async function closeServer(server) {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

async function state(page) {
  return page.evaluate(() => globalThis.__CB_TEST__.state());
}

async function waitForPhase(page, phases) {
  await page.waitForFunction(
    accepted => accepted.includes(globalThis.__CB_TEST__.state().phase),
    phases,
    { timeout: 5000, polling: 20 }
  );
}

async function moveCursor(page, target) {
  const cursor = (await state(page)).keyboardCursor;
  assert.ok(cursor, 'The keyboard board cursor must exist.');
  const horizontal = target.x > cursor.x ? 'ArrowRight' : 'ArrowLeft';
  const vertical = target.y > cursor.y ? 'ArrowDown' : 'ArrowUp';
  for (let count = Math.abs(target.x - cursor.x); count > 0; count--) await page.keyboard.press(horizontal);
  for (let count = Math.abs(target.y - cursor.y); count > 0; count--) await page.keyboard.press(vertical);
}

async function applyLocale(page, preference, resolved) {
  await page.evaluate(
    locale => globalThis.__CB_HOST__.send('locale.apply', { locale }),
    { preference, resolved }
  );
  await page.waitForFunction(value => document.documentElement.lang === value, resolved === 'zh-Hans' ? 'zh-CN' : resolved);
}

async function assertActiveDialog(page, id) {
  assert.deepEqual(await page.evaluate(modalId => {
    const modal = document.querySelector(`#${modalId}`);
    return {
      active: modal.classList.contains('active'),
      modal: globalThis.__CB_TEST__.state().activeModal,
      role: modal.getAttribute('role'),
      ariaModal: modal.getAttribute('aria-modal'),
      focusedInside: modal.contains(document.activeElement),
      backgroundInert: document.querySelector('#game-canvas').inert
    };
  }, id), {
    active: true,
    modal: id,
    role: 'dialog',
    ariaModal: 'true',
    focusedInside: true,
    backgroundInert: true
  });
}

async function runJourney(page) {
  await page.waitForFunction(
    () => globalThis.__CB_HOST__?.ready === true && Boolean(globalThis.__CB_TEST__),
    null,
    { timeout: 10000, polling: 20 }
  );
  assert.deepEqual(await page.evaluate(() => ({
    lang: document.documentElement.lang,
    ready: document.documentElement.dataset.i18nReady,
    title: document.title
  })), {
    lang: 'en',
    ready: 'true',
    title: 'CROWN//BREAKER — Promotion Run'
  });

  await page.click('#btn-training');
  await page.waitForFunction(() => document.activeElement?.id === 'game-canvas');
  assert.equal(await page.getAttribute('#game-canvas', 'role'), 'application');
  assert.match(await page.getAttribute('#game-canvas', 'aria-keyshortcuts'), /ArrowUp.*Enter.*Space.*Escape/);
  assert.match(await page.textContent('#board-announcer'), /pawn/i);

  await page.keyboard.press('Enter');
  assert.ok((await state(page)).selectedId, 'Enter must select the cursor piece.');
  await page.keyboard.press('Escape');
  assert.equal((await state(page)).selectedId, null, 'Escape must cancel selection before requesting pause.');
  assert.equal((await state(page)).paused, false);

  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => {
    const snapshot = globalThis.__CB_TEST__.state();
    return snapshot.phase === 'player' && snapshot.moveCount === 1;
  });

  await page.keyboard.press('Escape');
  await page.waitForFunction(() => globalThis.__CB_TEST__.state().paused === true);
  assert.deepEqual(await page.evaluate(() => ({
    modal: globalThis.__CB_TEST__.state().activeModal,
    focused: document.activeElement?.id,
    inert: document.querySelector('#game-canvas').inert,
    modalRole: document.querySelector('#pause-modal').getAttribute('role'),
    modalFlag: document.querySelector('#pause-modal').getAttribute('aria-modal')
  })), {
    modal: 'pause-modal',
    focused: 'btn-resume',
    inert: true,
    modalRole: 'dialog',
    modalFlag: 'true'
  });
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'btn-quit');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'btn-resume');
  await page.click('#btn-pause-settings');
  assert.equal((await state(page)).activeModal, 'info-modal');
  await page.keyboard.press('Escape');
  assert.equal((await state(page)).activeModal, 'pause-modal');
  await page.click('#btn-resume');
  await page.waitForFunction(() => !globalThis.__CB_TEST__.state().paused && document.activeElement?.id === 'game-canvas');

  await applyLocale(page, 'ja', 'ja');
  assert.match(await page.textContent('#board-announcer'), /マス|味方|移動/);
  await applyLocale(page, 'zh-Hans', 'zh-Hans');
  assert.match(await page.textContent('#board-announcer'), /棋|己方|空格|游标|落子/);
  await applyLocale(page, 'en', 'en');

  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await waitForPhase(page, ['promotion']);
  await assertActiveDialog(page, 'promotion-modal');
  await page.evaluate(() => globalThis.__CB_HOST__.send('lifecycle.pause'));
  await page.waitForFunction(() => globalThis.__CB_TEST__.state().paused);
  await assertActiveDialog(page, 'promotion-modal');
  await page.evaluate(() => globalThis.__CB_HOST__.send('lifecycle.resume'));
  await page.waitForFunction(() => !globalThis.__CB_TEST__.state().paused);
  await assertActiveDialog(page, 'promotion-modal');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await waitForPhase(page, ['player']);
  await page.waitForFunction(() => document.activeElement?.id === 'game-canvas');

  await page.keyboard.press('Enter');
  await moveCursor(page, { x: 7, y: 0 });
  await page.keyboard.press('Enter');
  await waitForPhase(page, ['result']);
  await assertActiveDialog(page, 'training-result-modal');

  await page.click('#btn-training-run');
  await page.waitForFunction(() => globalThis.__CB_TEST__.state().mode === 'run' && document.activeElement?.id === 'game-canvas');
  await page.evaluate(() => globalThis.__CB_TEST__.forceFail('qa'));
  await assertActiveDialog(page, 'fail-modal');
  await page.keyboard.press('Escape');
  await assertActiveDialog(page, 'fail-modal');
  await page.click('#btn-fail-retry');
  await page.waitForFunction(() => globalThis.__CB_TEST__.state().phase === 'player' && document.activeElement?.id === 'game-canvas');

  await page.evaluate(() => {
    globalThis.__CB_TEST__.fast(true);
    if (!globalThis.__CB_TEST__.finishBattle()) throw new Error('The first run battle could not be completed.');
  });
  await page.waitForFunction(() => globalThis.__CB_TEST__.state().activeModal === 'reward-modal', null, { timeout: 5000 });
  await assertActiveDialog(page, 'reward-modal');
  await page.locator('.reward-card').first().click();
  await page.waitForFunction(() => globalThis.__CB_TEST__.state().activeModal === 'contract-modal');
  await assertActiveDialog(page, 'contract-modal');
  await page.locator('.contract-card').first().click();
  await page.waitForFunction(() => globalThis.__CB_TEST__.state().phase === 'player' && document.activeElement?.id === 'game-canvas');

  await page.evaluate(() => {
    globalThis.__CB_TEST__.startBoss('twinQueens');
    globalThis.__CB_TEST__.fast(true);
    if (!globalThis.__CB_TEST__.finishBattle()) throw new Error('The final run battle could not be completed.');
  });
  await page.waitForFunction(() => globalThis.__CB_TEST__.state().activeModal === 'run-result-modal', null, { timeout: 5000 });
  await assertActiveDialog(page, 'run-result-modal');
  await page.keyboard.press('Escape');
  await assertActiveDialog(page, 'run-result-modal');
}

const sourceHtml = await readFile(path.join(PROJECT_ROOT, 'index.html'), 'utf8');
const sourceCss = await readFile(path.join(PROJECT_ROOT, 'styles.css'), 'utf8');
assert.match(sourceHtml, /<html lang="und" data-i18n-ready="false">/);
assert.match(sourceHtml, /<title data-i18n="meta\.title">CROWN\/\/BREAKER<\/title>/);
assert.match(sourceCss, /html\[data-i18n-ready="false"\] body\s*\{\s*visibility:\s*hidden;/);

const server = createStaticServer();
let browser;
try {
  const url = await listen(server);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(() => localStorage.clear());
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await runJourney(page);
  assert.deepEqual(errors, [], `Browser errors: ${errors.join('\n')}`);
  console.log('Keyboard-only Training and modal accessibility checks passed.');
} finally {
  if (browser) await browser.close();
  await closeServer(server);
}
