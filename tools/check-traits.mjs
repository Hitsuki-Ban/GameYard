import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '..');
const rootReal = await realpath(root);
const cliArguments = process.argv.slice(2);
if (cliArguments[0] === '--') cliArguments.shift();
if (cliArguments.length > 1 || (cliArguments.length === 1 && cliArguments[0] !== '--targeted')) {
  throw new RangeError(`Unknown arguments: ${cliArguments.join(' ')}`);
}
const targetedOnly = cliArguments[0] === '--targeted';
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
};
const webAssets = new Set([
  'index.html', 'styles.css', 'i18n.js', 'game.js', 'sw.js', 'icon.svg', 'icon-192.png', 'icon-512.png',
  'manifest.webmanifest', 'manifest.zh-CN.webmanifest', 'manifest.ja.webmanifest',
  'assets/acts/outer.svg', 'assets/acts/outer-particles.svg',
  'assets/acts/gallery.svg', 'assets/acts/gallery-particles.svg',
  'assets/acts/throne.svg', 'assets/acts/throne-particles.svg'
]);
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
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    if (!webAssets.has(relative)) throw new Error('Asset is not in the QA allowlist.');
    const file = resolve(root, relative);
    if (file !== root && !file.startsWith(`${root}${sep}`)) throw new Error('Path escapes project root.');
    const fileReal = await realpath(file);
    if (fileReal !== rootReal && !fileReal.startsWith(`${rootReal}${sep}`)) throw new Error('Resolved path escapes project root.');
    const info = await stat(fileReal);
    if (!info.isFile()) throw new Error('Not a file.');
    response.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    if (request.method === 'HEAD') response.end();
    else response.end(await readFile(fileReal));
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
});

await new Promise((resolveListen, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolveListen);
});

const address = server.address();
expectedHost = `127.0.0.1:${address.port}`;
const url = `http://127.0.0.1:${address.port}/?qa`;
const expectedOrigin = new URL(url).origin;
const externalRequests = [];
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ serviceWorkers: 'block' });
const blockExternalRequests = async browserContext => {
  await browserContext.route('**/*', async route => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.origin !== expectedOrigin) {
      externalRequests.push(requestUrl.href);
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });
};
await blockExternalRequests(context);
const installFastTimers = () => {
  const nativeSetTimeout = window.setTimeout.bind(window);
  window.setTimeout = (callback, delay = 0, ...args) => nativeSetTimeout(callback, Math.min(Number(delay) || 0, 12), ...args);
};
await context.addInitScript(installFastTimers);
const page = await context.newPage();
page.on('pageerror', error => { throw error; });
const expectedTraits = [
  'guarded', 'phantom', 'chains', 'hex', 'summoner', 'thorns', 'tithe', 'mist',
  'berserk', 'rampart', 'swift', 'echo', 'gravity', 'possession', 'lockstep'
];

const piece = (id, color, type, x, y, extra = {}) => ({ id, color, type, x, y, ...extra });
const basePieces = () => [
  piece('wk', 'w', 'k', 7, 7, { uid: 'king' }),
  piece('wr', 'w', 'r', 6, 7, { uid: 'rook' }),
  piece('wp', 'w', 'p', 4, 6, { uid: 'pawn-a' }),
  piece('bk', 'b', 'k', 0, 0),
  piece('bp', 'b', 'p', 3, 1)
];
const config = overrides => ({
  trait: null,
  spoils: {},
  pieces: basePieces(),
  enemyHP: 2,
  enemyHPMax: 2,
  turnsLeft: 20,
  moveCount: 0,
  enemyTurns: 0,
  enemyCycles: 0,
  battleCharges: {},
  rngState: 12345,
  shield: 3,
  mods: [],
  aiProfile: 'defensive',
  ...overrides
});
const contractFixture = (trait, elite = false, index = 0) => ({
  id: `qa-trait-${index}`,
  depth: 2,
  elite,
  final: false,
  boss: null,
  mods: [],
  trait,
  formation: 'scatter',
  aiProfile: 'defensive',
  layoutSeed: index + 1,
  reward: elite ? 2 : 1
});
const qa = (method, ...args) => page.evaluate(([name, values]) => window.__CB_TEST__[name](...values), [method, args]);
const state = () => qa('state');
const configure = overrides => qa('configureBattle', config(overrides));
const waitForSettled = () => page.waitForFunction(() => {
  const value = window.__CB_TEST__.state();
  return !value.active || value.phase === 'player' || value.phase === 'result';
}, null, { timeout: 3000 });

async function resetRun(seed = 12345) {
  await qa('startRun', seed);
  await qa('fast', true);
}

async function forceEnemy(pieceRef, x, y) {
  await qa('forceEnemyMove', pieceRef, x, y);
  await waitForSettled();
}

async function testStrictConfiguration() {
  await resetRun();
  const before = await state();
  await assert.rejects(
    () => configure({ unexpected: true }),
    /unsupported field/
  );
  const after = await state();
  assert.deepEqual(after.pieces, before.pieces, 'rejected configureBattle must be atomic');
  await assert.rejects(() => qa('setTrait', 'missing'), /Unknown trait/);
  for (const poisoned of ['constructor', 'toString', '__proto__']) {
    await assert.rejects(() => qa('setTrait', poisoned), /Unknown trait/);
    await assert.rejects(() => qa('setSpoil', poisoned, 1), /Unknown spoil/);
    await assert.rejects(() => qa('applyRelic', poisoned), /Unknown relic/);
    await assert.rejects(() => qa('selectReward', poisoned), /Unknown relic/);
  }
  await qa('showContracts', [await qa('materializeContract', contractFixture('gravity'))]);
  await assert.rejects(() => qa('selectContract', 'constructor'), /integer/);
  await assert.rejects(() => qa('selectContract', -1), /out of range/);
  await assert.rejects(() => qa('selectContract', 1), /out of range/);
  await assert.rejects(() => configure({ battleCharges: { unknownCharge: 1 } }), /Unknown battle charge/);
  await configure({});
  await qa('play', 'wr', 6, 6);
  await assert.rejects(() => configure({}), /stable battle phase/);
  await waitForSettled();
  await configure({});
  console.log('  strict QA configuration: passed');
}

async function testPhantomCrownCollision() {
  await configure({
    trait: 'phantom',
    shield: 2,
    pieces: [piece('wk', 'w', 'k', 1, 1), piece('wr', 'w', 'r', 7, 7), piece('bk', 'b', 'k', 0, 0)]
  });
  await forceEnemy('bk', 1, 1);
  const value = await state();
  const whiteKing = value.pieces.find(entry => entry.id === 'wk');
  assert.deepEqual([whiteKing.x, whiteKing.y], [1, 1], 'phantom crown shift must not change the actual shield-break square');
  console.log('  phantom black-crown collision square: passed');
}

async function testOriginalTraits() {
  await configure({
    trait: 'guarded',
    pieces: [piece('wk', 'w', 'k', 7, 7), piece('wr', 'w', 'r', 0, 2), piece('bk', 'b', 'k', 0, 0), piece('bp', 'b', 'p', 1, 0)]
  });
  assert.ok(!(await qa('moves', 'wr')).some(move => move.captureId === 'bk'), 'guarded trait must protect an escorted crown');
  await forceEnemy('bp', 1, 2);
  assert.ok((await qa('moves', 'wr')).some(move => move.captureId === 'bk'), 'guarded crown capture must return after its escort leaves');
  for (const level of [1, 2]) {
    await configure({
      spoils: { guarded: level },
      pieces: [
        piece('wk', 'w', 'k', 4, 7), piece('wp', 'w', 'p', 4, 6), piece('bk', 'b', 'k', 0, 0),
        piece('br-pawn', 'b', 'r', 0, 6), piece('br-king', 'b', 'r', 0, 7)
      ]
    });
    assert.ok(!(await qa('moves', 'br-pawn')).some(move => move.captureId === 'wp'));
    assert.equal((await qa('moves', 'br-king')).some(move => move.captureId === 'wk'), level === 1, `guarded spoil Lv${level} king threshold`);
  }

  for (const level of [1, 2]) {
    await configure({
      spoils: { phantom: level },
      battleCharges: { phantomEscape: level - 1 },
      shield: 2,
      pieces: [piece('wk', 'w', 'k', 0, 7), piece('wr', 'w', 'r', 7, 7), piece('bk', 'b', 'k', 7, 0), piece('br', 'b', 'r', 0, 0)]
    });
    await forceEnemy('br', 0, 7);
    const escaped = await state();
    assert.equal(escaped.shield, 2);
    assert.equal(escaped.battleCharges.phantomEscape, level);
    await configure({
      spoils: { phantom: level },
      battleCharges: { phantomEscape: level },
      shield: 2,
      pieces: [piece('wk', 'w', 'k', 0, 7), piece('wr', 'w', 'r', 7, 7), piece('bk', 'b', 'k', 7, 0), piece('br', 'b', 'r', 0, 0)]
    });
    await forceEnemy('br', 0, 7);
    assert.equal((await state()).shield, 1, `phantom spoil Lv${level} must exhaust after exactly ${level} escapes`);
  }

  await configure({ trait: 'phantom' });
  const crownBefore = (await state()).pieces.find(entry => entry.id === 'bk');
  await forceEnemy('bp', 3, 2);
  const crownAfter = (await state()).pieces.find(entry => entry.id === 'bk');
  assert.notDeepEqual([crownAfter.x, crownAfter.y], [crownBefore.x, crownBefore.y], 'phantom trait must shift the crown after an ordinary black action');

  await configure({
    trait: 'chains',
    pieces: [piece('wk', 'w', 'k', 7, 7), piece('wr', 'w', 'r', 0, 7), piece('bk', 'b', 'k', 7, 0)]
  });
  assert.equal(Math.max(...(await qa('moves', 'wr')).map(move => Math.abs(move.x))), 3);
  for (const [level, range] of [[1, 3], [2, 2]]) {
    await configure({
      spoils: { chains: level },
      pieces: [piece('wk', 'w', 'k', 7, 7), piece('bk', 'b', 'k', 7, 0), piece('br', 'b', 'r', 0, 0)]
    });
    assert.equal(Math.max(...(await qa('moves', 'br')).map(move => Math.max(Math.abs(move.x), Math.abs(move.y)))), range);
  }

  const captureHype = async (trait, level) => {
    await configure({
      trait,
      spoils: level ? { hex: level } : {},
      pieces: [piece('wk', 'w', 'k', 7, 7), piece('wr', 'w', 'r', 6, 7), piece('bk', 'b', 'k', 0, 0), piece('bp', 'b', 'p', 6, 6)]
    });
    await qa('play', 'wr', 6, 6);
    await waitForSettled();
    return (await state()).hype;
  };
  const normalHype = await captureHype(null, 0);
  assert.equal(await captureHype('hex', 0), normalHype / 2);
  assert.equal(await captureHype(null, 1), normalHype * 1.5);
  assert.equal(await captureHype(null, 2), normalHype * 2);

  await configure({ trait: 'summoner', enemyTurns: 2 });
  let before = (await state()).pieces.filter(entry => entry.alive && entry.color === 'b' && entry.type === 'p').length;
  await forceEnemy('bp', 3, 2);
  let after = (await state()).pieces.filter(entry => entry.alive && entry.color === 'b' && entry.type === 'p').length;
  assert.equal(after, before + 1);
  for (const [level, moveCount] of [[1, 2], [2, 1]]) {
    await configure({ spoils: { summoner: level }, moveCount });
    before = (await state()).pieces.filter(entry => entry.alive && entry.color === 'w' && entry.type === 'p').length;
    await qa('play', 'wr', 6, 6);
    await waitForSettled();
    after = (await state()).pieces.filter(entry => entry.alive && entry.color === 'w' && entry.type === 'p').length;
    assert.equal(after, before + 1, `summoner spoil Lv${level} threshold`);
  }
  console.log('  original guarded/phantom/chains/hex/summoner trait + Lv1/Lv2 spoils: passed');
}

async function testThorns() {
  await configure({
    trait: 'thorns',
    pieces: [piece('wk', 'w', 'k', 7, 7), piece('wr', 'w', 'r', 0, 1), piece('bk', 'b', 'k', 0, 0)],
    enemyHP: 2,
    enemyHPMax: 2
  });
  await qa('play', 'wr', 0, 0);
  await waitForSettled();
  let value = await state();
  const rook = value.pieces.find(entry => entry.id === 'wr');
  assert.ok(rook.stunUntil > value.moveCount, 'thorns trait must stun the crown breaker for the next hand');

  await configure({
    spoils: { thorns: 1 },
    pieces: [piece('wk', 'w', 'k', 7, 7), piece('wp', 'w', 'p', 1, 1), piece('bk', 'b', 'k', 0, 0)],
    enemyHP: 2,
    enemyHPMax: 2
  });
  await forceEnemy('bk', 1, 1);
  value = await state();
  assert.equal(value.enemyHP, 1, 'thorns spoil must turn a black-king capture into one real crown break');
  assert.equal(value.battleCharges.thornsRevenge, 1);
  assert.equal(value.run.crownBreaks, 1);
  assert.equal(value.active, true, 'a multi-layer crown must respawn after thorns revenge');

  await configure({
    spoils: { thorns: 1 },
    pieces: [piece('wk', 'w', 'k', 7, 7), piece('wp', 'w', 'p', 1, 1), piece('bk', 'b', 'k', 0, 0)],
    enemyHP: 1,
    enemyHPMax: 1
  });
  await forceEnemy('bk', 1, 1);
  value = await state();
  assert.equal(value.enemyHP, 0, 'final thorns revenge must clear the final crown layer');
  assert.equal(value.active, false, 'final thorns revenge must enter production battle settlement');
  await page.waitForTimeout(150);
  await resetRun(12346);

  for (const level of [1, 2]) {
    await configure({
      spoils: { thorns: level },
      pieces: [
        piece('wk', 'w', 'k', 7, 7), piece('wp1', 'w', 'p', 1, 2), piece('wp2', 'w', 'p', 3, 2),
        piece('bk', 'b', 'k', 7, 0), piece('br1', 'b', 'r', 1, 0), piece('br2', 'b', 'r', 3, 0)
      ]
    });
    await forceEnemy('br1', 1, 2);
    await forceEnemy('br2', 3, 2);
    value = await state();
    assert.equal(value.pieces.find(entry => entry.id === 'br1').alive, false);
    assert.equal(value.pieces.find(entry => entry.id === 'br2').alive, level === 1, `thorns Lv${level} charge count`);
  }
  console.log('  thorns trait/spoil: passed');
}

async function crownScore(trait, spoilLevel) {
  await configure({
    trait,
    spoils: spoilLevel ? { tithe: spoilLevel } : {},
    pieces: [piece('wk', 'w', 'k', 7, 7), piece('wr', 'w', 'r', 0, 1), piece('bk', 'b', 'k', 0, 0)],
    enemyHP: 2,
    enemyHPMax: 2
  });
  await qa('forceCrownBreak');
  await waitForSettled();
  return (await state()).score;
}

async function testTithe() {
  const normal = await crownScore(null, 0);
  assert.equal(await crownScore('tithe', 0), Math.round(normal * 0.6));
  assert.equal(await crownScore(null, 1), Math.round(normal * 1.3));
  assert.equal(await crownScore(null, 2), Math.round(normal * 1.6));
  console.log('  tithe trait/spoil crown scoring: passed');
}

async function testMist() {
  await configure({ trait: 'mist' });
  assert.equal(await page.locator('#intent-key').evaluate(element => element.classList.contains('show')), false);

  const captureCounts = [];
  for (const level of [0, 1, 2]) {
    let captures = 0;
    for (let seed = 1; seed <= 80; seed += 1) {
      await configure({
        spoils: level ? { mist: level } : {},
        rngState: seed,
        pieces: [
          piece('wk', 'w', 'k', 7, 7), piece('wr', 'w', 'p', 3, 3),
          piece('bk', 'b', 'k', 0, 0), piece('bq', 'b', 'q', 3, 0)
        ]
      });
      const intent = (await state()).intent;
      if (intent?.captureId === 'wr') captures += 1;
    }
    captureCounts.push(captures);
  }
  assert.ok(captureCounts[0] >= captureCounts[1] && captureCounts[1] >= captureCounts[2], `mist capture priority must decrease by level: ${captureCounts.join('/')}`);
  assert.ok(captureCounts[0] > captureCounts[2], `mist Lv2 must measurably reduce non-king capture choice: ${captureCounts.join('/')}`);
  console.log(`  mist trait/spoil: passed (capture intents ${captureCounts.join('/')})`);
}

async function testBerserk() {
  for (const [level, farX] of [[1, 5], [2, 4]]) {
    await configure({
      spoils: { berserk: level },
      pieces: [piece('wk', 'w', 'k', 7, 7), piece('bk', 'b', 'k', 0, 0)]
    });
    const moves = await qa('moves', 'wk');
    assert.ok(moves.some(move => move.x === farX && move.y === farX), `berserk spoil Lv${level} king range`);
  }
  await configure({
    trait: 'berserk',
    pieces: [piece('wk', 'w', 'k', 4, 4), piece('bk', 'b', 'k', 4, 2), piece('br', 'b', 'r', 0, 0)]
  });
  assert.equal((await state()).intent.pieceId, 'bk', 'berserk trait must prioritize an attacking crown move');
  console.log('  berserk trait/spoil: passed');
}

async function testRampart() {
  await configure({ trait: 'rampart', enemyTurns: 2 });
  let before = (await state()).pieces.filter(entry => entry.alive && entry.color === 'b' && entry.type === 'p').length;
  await forceEnemy('bp', 3, 2);
  let after = (await state()).pieces.filter(entry => entry.alive && entry.color === 'b' && entry.type === 'p').length;
  assert.equal(after, before + 1, 'rampart trait must spawn beside the crown on enemy hand 3');

  for (const level of [1, 2]) {
    await configure({
      spoils: { rampart: level },
      pieces: [piece('wk', 'w', 'k', 7, 7), piece('wr', 'w', 'r', 0, 1), piece('bk', 'b', 'k', 0, 0)],
      enemyHP: 2,
      enemyHPMax: 2
    });
    before = (await state()).pieces.filter(entry => entry.alive && entry.color === 'w' && entry.type === 'p').length;
    await qa('play', 'wr', 0, 0);
    await waitForSettled();
    after = (await state()).pieces.filter(entry => entry.alive && entry.color === 'w' && entry.type === 'p').length;
    assert.equal(after, before + level, `rampart spoil Lv${level} reinforcement count`);
  }
  console.log('  rampart trait/spoil: passed');
}

async function testSwift() {
  await configure({
    trait: 'swift',
    pieces: [piece('wk', 'w', 'k', 7, 7), piece('bk', 'b', 'k', 0, 0), piece('bp', 'b', 'p', 3, 2, { hasMoved: true, dashUsed: 1000 })]
  });
  assert.ok((await qa('moves', 'bp')).some(move => move.y === 4), 'swift trait must allow a true unlimited black pawn double-step');

  await configure({
    spoils: { swift: 1 },
    pieces: [piece('wk', 'w', 'k', 7, 7), piece('wp', 'w', 'p', 3, 6, { hasMoved: true, dashUsed: 1 }), piece('bk', 'b', 'k', 0, 0)]
  });
  assert.ok((await qa('moves', 'wp')).some(move => move.y === 4));
  await configure({
    spoils: { swift: 1 },
    pieces: [piece('wk', 'w', 'k', 7, 7), piece('wp', 'w', 'p', 3, 6, { hasMoved: true, dashUsed: 2 }), piece('bk', 'b', 'k', 0, 0)]
  });
  assert.ok(!(await qa('moves', 'wp')).some(move => move.y === 4));
  await configure({
    spoils: { swift: 2 },
    pieces: [piece('wk', 'w', 'k', 7, 7), piece('wp', 'w', 'p', 3, 6, { hasMoved: true, dashUsed: 1000 }), piece('bk', 'b', 'k', 0, 0)]
  });
  assert.ok((await qa('moves', 'wp')).some(move => move.y === 4), 'swift spoil Lv2 must remain unlimited past 99 uses');
  console.log('  swift trait/spoil: passed');
}

async function testEcho() {
  await configure({
    trait: 'echo',
    enemyTurns: 2,
    shield: 2,
    pieces: [
      piece('wk', 'w', 'k', 1, 1), piece('wr', 'w', 'r', 7, 7),
      piece('bk', 'b', 'k', 7, 0), piece('bp-hit', 'b', 'p', 0, 0), piece('bp-echo', 'b', 'p', 5, 1)
    ]
  });
  await forceEnemy('bp-hit', 1, 1);
  const value = await state();
  assert.equal(value.enemyTurns, 3, 'shield-breaking black action must count toward enemyTurns');
  assert.equal(value.shield, 1);
  const echoMoved = value.pieces.some(entry => (entry.id === 'bp-echo' && (entry.x !== 5 || entry.y !== 1))
    || (entry.id === 'bk' && (entry.x !== 7 || entry.y !== 0)));
  assert.equal(echoMoved, true, 'echo must still execute after a non-final shield break');

  for (const [level, startingMove] of [[1, 3], [2, 2]]) {
    await configure({ spoils: { echo: level }, moveCount: startingMove });
    await qa('play', 'wr', 6, 6);
    await waitForSettled();
    assert.equal((await state()).bonusActions, 1, `echo spoil Lv${level} threshold`);
  }

  await configure({
    trait: 'echo',
    spoils: { thorns: 1 },
    enemyTurns: 2,
    pieces: [piece('wk', 'w', 'k', 7, 7), piece('wp', 'w', 'p', 1, 1), piece('bk', 'b', 'k', 0, 0), piece('br', 'b', 'r', 6, 0)],
    enemyHP: 2,
    enemyHPMax: 2
  });
  await forceEnemy('bk', 1, 1);
  const interruptedEcho = await state();
  assert.equal(interruptedEcho.enemyTurns, 3);
  assert.equal(interruptedEcho.enemyHP, 1);
  assert.equal(interruptedEcho.pieces.find(entry => entry.id === 'br').x, 6, 'a real thorns crown break must end the enemy sequence instead of adding echo after settlement');
  console.log('  echo trait/spoil: passed');
}

const moveSet = moves => moves.map(move => `${move.x},${move.y}`).sort();

async function testGravity() {
  const knightPieces = [piece('wk', 'w', 'k', 7, 7), piece('wn', 'w', 'n', 4, 4), piece('bk', 'b', 'k', 0, 0)];
  await configure({ trait: 'gravity', pieces: knightPieces });
  assert.deepEqual(moveSet(await qa('moves', 'wn')), ['2,3', '2,5', '6,3', '6,5']);

  const blackKnightPieces = [piece('wk', 'w', 'k', 7, 7), piece('bk', 'b', 'k', 0, 0), piece('bn', 'b', 'n', 4, 3)];
  await configure({ spoils: { gravity: 1 }, pieces: blackKnightPieces });
  assert.deepEqual(moveSet(await qa('moves', 'bn')), ['2,2', '2,4', '3,1', '5,1', '6,2', '6,4']);
  await configure({ spoils: { gravity: 2 }, pieces: blackKnightPieces });
  assert.deepEqual(moveSet(await qa('moves', 'bn')), ['2,2', '2,4', '6,2', '6,4']);
  console.log('  gravity trait/spoil exact knight moves: passed');
}

async function testPossession() {
  await configure({
    trait: 'possession',
    pieces: [
      piece('wk', 'w', 'k', 7, 7), piece('wb', 'w', 'b', 2, 2), piece('bk', 'b', 'k', 0, 0),
      piece('bp-z', 'b', 'p', 1, 0), piece('bp-a', 'b', 'p', 0, 1), piece('bp-far', 'b', 'p', 6, 1)
    ],
    enemyHP: 2,
    enemyHPMax: 2
  });
  await qa('play', 'wb', 0, 0);
  await waitForSettled();
  let value = await state();
  assert.equal(value.pieces.find(entry => entry.id === 'bp-a').type, 'n', 'possession tie must use black pawn id');
  assert.equal(value.pieces.find(entry => entry.id === 'bp-z').type, 'p');
  assert.equal(value.battleCharges.possessionCrown, 1);

  for (const level of [1, 2]) {
    await configure({
      spoils: { possession: level },
      pieces: [
        piece('wk', 'w', 'k', 7, 7, { uid: 'king' }),
        piece('source', 'w', 'p', 4, 4, { uid: 'pawn-source' }),
        piece('near-z', 'w', 'p', 3, 5, { uid: 'pawn-b' }),
        piece('near-a', 'w', 'p', 5, 5, { uid: 'pawn-a' }),
        piece('far', 'w', 'p', 0, 7, { uid: 'pawn-c' }),
        piece('bk', 'b', 'k', 0, 0)
      ]
    });
    await qa('openPromotion', 'source');
    await qa('promote', 'q');
    value = await state();
    assert.equal(value.pieces.find(entry => entry.id === 'near-a').type, 'n');
    assert.equal(value.pieces.find(entry => entry.id === 'near-z').type, level === 2 ? 'n' : 'p');
    assert.equal(value.pieces.find(entry => entry.id === 'far').type, 'p');
    assert.equal(value.run.promotions, level + 1, `possession spoil Lv${level} promotion accounting`);
    assert.equal(value.battleCharges.possessionPromotion, 1);
    const promotedRoster = Object.fromEntries(value.run.roster.map(member => [member.uid, member.type]));
    assert.equal(promotedRoster['pawn-a'], 'n');
    assert.equal(promotedRoster['pawn-b'], level === 2 ? 'n' : 'p');
    await qa('retry');
    await waitForSettled();
    value = await state();
    assert.equal(value.pieces.find(entry => entry.id === 'near-a').type, 'p', 'retry must restore pre-possession board');
    assert.equal(value.run.roster.find(member => member.uid === 'pawn-a').type, 'p', 'retry must restore pre-possession roster');
  }
  console.log('  possession trait/spoil target, permanence and retry: passed');
}

async function testLockstep() {
  await configure({ trait: 'lockstep', spoils: { echo: 1 }, moveCount: 3 });
  await qa('play', 'wr', 6, 6);
  await waitForSettled();
  assert.deepEqual(await qa('moves', 'wr'), [], 'lockstep trait must block the same piece during a bonus action');
  await qa('play', 'wp', 4, 5);
  await waitForSettled();
  assert.ok((await qa('moves', 'wr')).length > 0, 'lockstep trait must release after another player action');

  for (const level of [1, 2]) {
    await configure({
      spoils: { lockstep: level },
      pieces: [
        piece('wk', 'w', 'k', 7, 7), piece('bk', 'b', 'k', 7, 0),
        piece('br-a', 'b', 'r', 0, 0), piece('br-b', 'b', 'r', 2, 0), piece('br-c', 'b', 'r', 4, 0)
      ]
    });
    await forceEnemy('br-a', 0, 1);
    assert.deepEqual(await qa('moves', 'br-a'), [], `lockstep spoil Lv${level} first locked cycle`);
    await forceEnemy('br-b', 2, 1);
    if (level === 1) assert.ok((await qa('moves', 'br-a')).length > 0);
    else {
      assert.deepEqual(await qa('moves', 'br-a'), []);
      await forceEnemy('br-c', 4, 1);
      assert.ok((await qa('moves', 'br-a')).length > 0);
    }
  }

  for (const level of [1, 2]) {
    await configure({
      spoils: { lockstep: level },
      pieces: [piece('wk', 'w', 'k', 7, 7), piece('wr', 'w', 'r', 6, 7), piece('bk', 'b', 'k', 0, 0)]
    });
    await forceEnemy('bk', 0, 1);
    assert.deepEqual(await qa('moves', 'bk'), []);
    await qa('play', 'wr', 6, 6);
    await waitForSettled();
    let lockedState = await state();
    assert.equal(lockedState.enemyCycles, 2);
    if (level === 1) {
      assert.ok((await qa('moves', 'bk')).length > 0, 'Lv1 sole black piece must recover after one regular pass cycle');
    } else {
      assert.deepEqual(await qa('moves', 'bk'), []);
      await qa('play', 'wr', 6, 5);
      await waitForSettled();
      lockedState = await state();
      assert.equal(lockedState.enemyCycles, 3);
      assert.ok((await qa('moves', 'bk')).length > 0, 'Lv2 sole black piece must recover after two regular pass cycles');
    }
  }

  await configure({
    trait: 'echo',
    spoils: { lockstep: 1 },
    enemyTurns: 2,
    pieces: [
      piece('wk', 'w', 'k', 7, 7), piece('bk', 'b', 'k', 7, 0),
      piece('br-a', 'b', 'r', 0, 0), piece('br-b', 'b', 'r', 2, 0)
    ]
  });
  await forceEnemy('br-a', 0, 1);
  const echoState = await state();
  assert.equal(echoState.enemyTurns, 3, 'echo bonus must not advance enemyTurns');
  assert.equal(echoState.enemyCycles, 1, 'echo bonus must not advance regular enemy cycles');
  assert.ok(echoState.pieces.filter(entry => entry.color === 'b' && entry.enemyLockUntil > 0).length >= 2, 'normal and echo actors must both receive lockstep spoil');
  console.log('  lockstep trait/spoil cycles and echo: passed');
}

async function testRetryAndLocales() {
  await configure({ trait: null, rngState: 424242 });
  await qa('setTrait', 'mist');
  const configured = await state();
  await qa('retry');
  await waitForSettled();
  const retried = await state();
  assert.equal(retried.trait, 'mist');
  assert.deepEqual(retried.pieces, configured.pieces, 'retry must preserve configured pieces');
  assert.deepEqual(retried.intent, configured.intent, 'retry must preserve recomputed intent');
  assert.equal(retried.run.rngState, configured.run.rngState, 'retry must preserve post-intent RNG state');

  const localeCases = [
    ['en', 'gravity', 'Gravity', 'Already mastered'],
    ['zh-CN', 'possession', '凭依', '已掌握'],
    ['ja', 'lockstep', '戒歩', '習得済み']
  ];
  for (const [locale, traitId, traitName, mastered] of localeCases) {
    await qa('setLanguage', locale);
    await qa('setTrait', traitId);
    await qa('setSpoil', traitId, 1);
    assert.match(await page.locator('#trait-chip').innerText(), new RegExp(traitName));
    let spoilChip = page.locator('#spoils-rail .spoil-chip').filter({ hasText: traitName });
    assert.match(await spoilChip.innerText(), /Lv1/);
    assert.ok((await spoilChip.getAttribute('title')).length > 5);
    await qa('showContracts', [await qa('materializeContract', contractFixture(traitId, false))]);
    assert.match(await page.locator('.contract-card .reward-line.gold').innerText(), /Lv2/);
    await qa('setSpoil', traitId, 2);
    await qa('showContracts', [await qa('materializeContract', contractFixture(traitId, true))]);
    assert.match(await page.locator('.contract-card .reward-line.gold').innerText(), new RegExp(mastered));
    spoilChip = page.locator('#spoils-rail .spoil-chip').filter({ hasText: traitName });
    assert.match(await spoilChip.innerText(), /Lv2/);
  }
  console.log('  retry + en/zh-CN/ja HUD, route rewards and spoil rail: passed');
}

async function runTargetedScenarios() {
  console.log('CROWN//BREAKER trait checks');
  console.log('- targeted production scenarios');
  await testStrictConfiguration();
  await testPhantomCrownCollision();
  await testOriginalTraits();
  await testThorns();
  await testTithe();
  await testMist();
  await testBerserk();
  await testRampart();
  await testSwift();
  await testEcho();
  await testGravity();
  await testPossession();
  await testLockstep();
  await testRetryAndLocales();
}

async function runSeedSmoke() {
  console.log('- 15 traits × 100 seeds × first 3 player hands');
  const jobs = expectedTraits.flatMap(trait => Array.from({ length: 100 }, (_, index) => ({ trait, seed: index + 1 })));
  const shards = Array.from({ length: 6 }, () => []);
  jobs.forEach((job, index) => shards[index % shards.length].push(job));

  await Promise.all(shards.map(async (shard, workerIndex) => {
    const workerContext = await browser.newContext({ serviceWorkers: 'block' });
    await blockExternalRequests(workerContext);
    await workerContext.addInitScript(installFastTimers);
    const workerPage = await workerContext.newPage();
    let pageError = null;
    workerPage.on('pageerror', error => { pageError ||= error; });
    const workerQA = (method, ...args) => workerPage.evaluate(([name, values]) => window.__CB_TEST__[name](...values), [method, args]);
    const workerState = () => workerQA('state');
    const workerSettled = () => workerPage.waitForFunction(() => {
      const value = window.__CB_TEST__.state();
      return !value.active || value.phase === 'player' || value.phase === 'result';
    }, null, { timeout: 3000 });
    try {
      await workerPage.goto(url, { waitUntil: 'domcontentloaded' });
      await workerPage.waitForFunction(() => Boolean(window.__CB_TEST__));
      assert.deepEqual(await workerQA('traits'), expectedTraits);
      for (const { trait, seed } of shard) {
        if (pageError) throw pageError;
        await workerQA('startRun', seed);
        await workerQA('fast', true);
        await workerQA('setTrait', trait);
        for (let hand = 1; hand <= 3; hand += 1) {
          await workerSettled();
          const before = await workerState();
          if (before.failureReason === 'no_legal_moves') throw new Error(`no_legal_moves trait=${trait} seed=${seed} hand=${hand}`);
          if (!before.active || before.phase !== 'player') break;
          const moves = await workerQA('moves');
          if (!moves.length) throw new Error(`no_legal_moves trait=${trait} seed=${seed} hand=${hand}`);
          const move = moves[0];
          const played = await workerQA('play', move.pieceId, move.x, move.y);
          assert.equal(played, true, `legal move rejected trait=${trait} seed=${seed} hand=${hand}`);
          await workerSettled();
          const after = await workerState();
          if (after.failureReason === 'no_legal_moves') throw new Error(`no_legal_moves trait=${trait} seed=${seed} hand=${hand}`);
          if (pageError) throw pageError;
        }
      }
      console.log(`  worker ${workerIndex + 1}: ${shard.length} seeded battles passed`);
    } catch (error) {
      throw new Error(`seed worker ${workerIndex + 1} failed: ${error.message}`, { cause: error });
    } finally {
      await workerContext.close();
    }
  }));

  expectedTraits.forEach(trait => console.log(`  ${trait}: 100 seeds passed`));
}

try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__CB_TEST__));
  assert.deepEqual(await qa('traits'), expectedTraits, 'product trait registry must match the explicit 15-trait QA contract');
  await runTargetedScenarios();
  if (!targetedOnly) {
    await context.close();
    await runSeedSmoke();
  }
  assert.deepEqual(externalRequests, [], `external requests were attempted:\n${externalRequests.join('\n')}`);
  console.log('Trait checks passed.');
} finally {
  await browser.close();
  await new Promise(resolveClose => server.close(resolveClose));
}
