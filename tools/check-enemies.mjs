import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '..');
const rootReal = await realpath(root);
const args = process.argv.slice(2);
if (args[0] === '--') args.shift();
if (args.length > 1 || (args.length === 1 && args[0] !== '--targeted')) {
  throw new RangeError(`Usage: node tools/check-enemies.mjs [--targeted]; received: ${args.join(' ')}`);
}
const targetedOnly = args[0] === '--targeted';

const formations = ['scatter', 'phalanx', 'pincer', 'fortress', 'vanguard', 'lance'];
const mods = ['swarm', 'cavalry', 'walls', 'diagonals', 'queen', 'armor', 'race', 'shortClock', 'promoted', 'veteran', 'mirror', 'executioner'];
const aiProfiles = ['aggressive', 'defensive', 'crownGuard'];
const bosses = {
  twinQueens: { formation: 'lance', aiProfile: 'aggressive', mods: ['queen', 'diagonals'], trait: 'hex' },
  ironBastion: { formation: 'fortress', aiProfile: 'crownGuard', mods: ['walls', 'armor'], trait: 'guarded' },
  pawnstorm: { formation: 'vanguard', aiProfile: 'aggressive', mods: ['race', 'swarm', 'cavalry'], trait: 'summoner' }
};
const bossLayoutCounts = { twinQueens: 12, ironBastion: 12, pawnstorm: 18 };
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
  'manifest.webmanifest', 'manifest.zh-CN.webmanifest', 'manifest.ja.webmanifest'
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
if (!address || typeof address === 'string') throw new Error('Static server did not bind to a TCP port.');
expectedHost = `127.0.0.1:${address.port}`;
const url = `http://127.0.0.1:${address.port}/?qa`;

const installFastTimers = () => {
  const nativeSetTimeout = window.setTimeout.bind(window);
  window.setTimeout = (callback, delay = 0, ...timerArgs) => nativeSetTimeout(callback, Math.min(Number(delay) || 0, 12), ...timerArgs);
  localStorage.clear();
};
let browser = null;
let context = null;
let page = null;
const pageErrors = [];
const consoleErrors = [];
const externalRequests = [];
let qa = null;
let state = null;

function assertClean(label) {
  assert.deepEqual(pageErrors, [], `${label}: page errors: ${pageErrors.join('\n')}`);
  assert.deepEqual(consoleErrors, [], `${label}: console errors: ${consoleErrors.join('\n')}`);
  assert.deepEqual(externalRequests, [], `${label}: external requests: ${externalRequests.join('\n')}`);
}

const contractInput = (overrides = {}) => ({
  id: 'qa-enemy-contract',
  depth: 4,
  elite: false,
  final: false,
  boss: null,
  mods: [],
  trait: null,
  formation: 'scatter',
  aiProfile: 'defensive',
  layoutSeed: 0x13579bdf,
  reward: 1,
  ...overrides
});
const materialize = overrides => qa('materializeContract', contractInput(overrides));
const layoutKey = piece => `${piece.y}:${piece.x}:${piece.type}:${piece.veteran ? 1 : 0}`;
const normalizedLayout = layout => layout.map(piece => ({
  type: piece.type,
  x: piece.x,
  y: piece.y,
  veteran: Boolean(piece.veteran)
})).sort((left, right) => layoutKey(left).localeCompare(layoutKey(right)));
const runtimeBlackLayout = snapshot => normalizedLayout(snapshot.pieces
  .filter(piece => piece.alive && piece.color === 'b'));
const normalizedIntent = snapshot => {
  if (!snapshot.intent) return null;
  const actor = snapshot.pieces.find(piece => piece.id === snapshot.intent.pieceId);
  const captured = snapshot.pieces.find(piece => piece.id === snapshot.intent.captureId);
  return {
    actorType: actor?.type ?? null,
    actorVeteran: Boolean(actor?.veteran),
    fromX: snapshot.intent.fromX,
    fromY: snapshot.intent.fromY,
    x: snapshot.intent.x,
    y: snapshot.intent.y,
    capture: captured ? `${captured.color}:${captured.type}:${captured.x},${captured.y}` : null
  };
};

async function waitForPlayerOrTerminal(timeout = 5000) {
  await page.waitForFunction(() => {
    const snapshot = window.__CB_TEST__.state();
    return snapshot.phase === 'player' || snapshot.phase === 'result' || snapshot.phase === 'reward'
      || snapshot.phase === 'contract' || snapshot.phase === 'promotion'
      || snapshot.run?.stage === 'reward' || snapshot.run?.stage === 'contract';
  }, null, { timeout, polling: 5 });
}

async function previewLayout() {
  return page.locator('.contract-card').first().evaluate(card => {
    const cells = [...card.querySelectorAll('.board-preview span')];
    return {
      cellCount: cells.length,
      coordinates: cells.map(cell => `${cell.dataset.x},${cell.dataset.y}`),
      pieces: cells.filter(cell => cell.classList.contains('enemy')).map(cell => ({
        type: cell.dataset.type,
        x: Number(cell.dataset.x),
        y: Number(cell.dataset.y),
        veteran: cell.dataset.veteran === 'true'
      }))
    };
  });
}

async function assertPreviewToBattle(contract, label) {
  await qa('startRun', 1000 + contract.layoutSeed);
  await qa('fast', true);
  await qa('showContracts', [contract]);
  const preview = await previewLayout();
  assert.equal(preview.cellCount, 40, `${label}: preview must have exactly 40 cells`);
  assert.equal(new Set(preview.coordinates).size, 40, `${label}: preview coordinates must be unique`);
  assert.deepEqual(normalizedLayout(preview.pieces), normalizedLayout(contract.enemyLayout), `${label}: preview diverged from canonical layout`);
  await qa('selectContract', 0);
  await waitForPlayerOrTerminal();
  const battle = await state();
  assert.equal(battle.phase, 'player', `${label}: selected contract did not start a player hand`);
  assert.deepEqual(runtimeBlackLayout(battle), normalizedLayout(contract.enemyLayout), `${label}: runtime diverged from preview layout`);
  assert.ok((await qa('moves')).length > 0, `${label}: battle start has no legal white move`);
  assertClean(label);
}

async function testRegistriesAndLayouts() {
  assert.deepEqual(await qa('formations'), formations);
  assert.deepEqual(await qa('mods'), mods);
  assert.deepEqual(await qa('aiProfiles'), aiProfiles);
  await qa('startRun', 999);
  await qa('fast', true);

  for (const [index, formation] of formations.entries()) {
    const contract = await materialize({ id: `qa-formation-${formation}`, formation, layoutSeed: 200 + index });
    await assertPreviewToBattle(contract, `formation ${formation}`);
  }

  const modCases = ['race', 'promoted', 'veteran', 'mirror', 'executioner'];
  for (const [index, mod] of modCases.entries()) {
    const contract = await materialize({ id: `qa-mod-${mod}`, formation: formations[index + 1], mods: [mod], layoutSeed: 300 + index });
    await assertPreviewToBattle(contract, `mod ${mod}`);
  }

  for (const [index, [boss, definition]] of Object.entries(bosses).entries()) {
    const contract = await materialize({
      id: `qa-boss-${boss}`,
      depth: 8,
      elite: true,
      final: true,
      boss,
      mods: [...definition.mods],
      trait: definition.trait,
      formation: definition.formation,
      aiProfile: definition.aiProfile,
      layoutSeed: 400 + index,
      reward: 0
    });
    assert.equal(contract.enemyLayout.length, bossLayoutCounts[boss], `boss ${boss} canonical layout count`);
    await assertPreviewToBattle(contract, `boss ${boss}`);
  }
}

async function testModSemantics() {
  const baseline = await materialize({ id: 'qa-baseline', formation: 'phalanx', layoutSeed: 501 });
  const promoted = await materialize({ id: 'qa-promoted', formation: 'phalanx', mods: ['promoted'], layoutSeed: 501 });
  const count = (contract, type) => contract.enemyLayout.filter(piece => piece.type === type).length;
  assert.equal(promoted.enemyLayout.length, baseline.enemyLayout.length, 'promoted must not change enemy count');
  assert.equal(count(promoted, 'q'), count(baseline, 'q') + 1, 'promoted must convert one planned pawn into a queen');
  assert.equal(count(promoted, 'p'), count(baseline, 'p') - 1, 'promoted must consume one planned pawn');

  const earlyLance = await materialize({ id: 'qa-lance-depth-2', depth: 2, formation: 'lance', layoutSeed: 507 });
  const unlockedLance = await materialize({ id: 'qa-lance-depth-3', depth: 3, formation: 'lance', layoutSeed: 507 });
  const queenLance = await materialize({ id: 'qa-lance-depth-2-queen', depth: 2, formation: 'lance', mods: ['queen'], layoutSeed: 507 });
  const promotedLance = await materialize({ id: 'qa-lance-depth-2-promoted', depth: 2, formation: 'lance', mods: ['promoted'], layoutSeed: 507 });
  assert.equal(count(earlyLance, 'q'), 0, 'lance depth 2 must not include its template queen');
  assert.ok(count(unlockedLance, 'q') > 0, 'lance depth 3 must include its unlocked template queen');
  assert.ok(count(queenLance, 'q') > 0, 'queen mod must allow a queen at lance depth 2');
  assert.ok(count(promotedLance, 'q') > 0, 'promoted mod must allow a queen at lance depth 2');

  const phalanxCases = [
    { label: 'normal depth 5', depth: 5, elite: false, layoutSeed: 505, reward: 1 },
    { label: 'elite depth 8', depth: 8, elite: true, layoutSeed: 506, reward: 2 }
  ];
  for (const entry of phalanxCases) {
    const phalanxBase = await materialize({
      id: `qa-phalanx-${entry.depth}-${entry.elite ? 'elite' : 'normal'}`,
      depth: entry.depth,
      elite: entry.elite,
      formation: 'phalanx',
      layoutSeed: entry.layoutSeed,
      reward: entry.reward
    });
    const basePawns = phalanxBase.enemyLayout.filter(piece => piece.type === 'p');
    const baseRearPieces = phalanxBase.enemyLayout.filter(piece => piece.type !== 'k' && piece.type !== 'p');
    assert.ok(basePawns.length > 0, `phalanx ${entry.label} must contain pawns`);
    assert.ok(baseRearPieces.length > 0, `phalanx ${entry.label} must contain non-pawn defenders`);
    assert.ok(basePawns.every(piece => [2, 3].includes(piece.y)), `phalanx ${entry.label} pawns must occupy y=2/3`);
    assert.ok(baseRearPieces.every(piece => [0, 1].includes(piece.y)), `phalanx ${entry.label} non-pawn defenders must occupy y=0/1`);

    const phalanxPromoted = await materialize({
      id: `qa-phalanx-${entry.depth}-${entry.elite ? 'elite' : 'normal'}-promoted`,
      depth: entry.depth,
      elite: entry.elite,
      formation: 'phalanx',
      mods: ['promoted'],
      layoutSeed: entry.layoutSeed,
      reward: entry.reward
    });
    assert.equal(phalanxPromoted.enemyLayout.length, phalanxBase.enemyLayout.length, `phalanx ${entry.label} promoted changed total count`);
    const bySquare = layout => new Map(layout.map(piece => [`${piece.x},${piece.y}`, { type: piece.type, veteran: piece.veteran }]));
    const baseSquares = bySquare(phalanxBase.enemyLayout);
    const promotedSquares = bySquare(phalanxPromoted.enemyLayout);
    assert.deepEqual([...promotedSquares.keys()].sort(), [...baseSquares.keys()].sort(), `phalanx ${entry.label} promoted changed occupied coordinates`);
    const replacements = [...baseSquares].filter(([square, original]) => {
      const replacement = promotedSquares.get(square);
      return replacement.type !== original.type || replacement.veteran !== original.veteran;
    });
    assert.equal(replacements.length, 1, `phalanx ${entry.label} promoted must replace exactly one piece in place`);
    const [replacementSquare, original] = replacements[0];
    const replacement = promotedSquares.get(replacementSquare);
    assert.equal(original.type, 'p', `phalanx ${entry.label} promoted source must be a pawn`);
    assert.equal(replacement.type, 'q', `phalanx ${entry.label} promoted target must be a queen`);
    assert.ok([2, 3].includes(Number(replacementSquare.split(',')[1])), `phalanx ${entry.label} promoted queen must remain on y=2/3`);
  }

  const raceBase = await materialize({ id: 'qa-race-base', formation: 'scatter', layoutSeed: 504 });
  const race = await materialize({ id: 'qa-race', formation: 'scatter', mods: ['race'], layoutSeed: 504 });
  const swarm = await materialize({ id: 'qa-swarm', formation: 'scatter', mods: ['swarm'], layoutSeed: 504 });
  const baseCounts = new Map();
  raceBase.enemyLayout.forEach(entry => {
    const key = layoutKey(entry);
    baseCounts.set(key, (baseCounts.get(key) || 0) + 1);
  });
  const raceAdditions = race.enemyLayout.filter(entry => {
    const key = layoutKey(entry);
    const remaining = baseCounts.get(key) || 0;
    if (!remaining) return true;
    baseCounts.set(key, remaining - 1);
    return false;
  });
  assert.equal(raceAdditions.length, 3, 'race must add exactly three enemies');
  assert.ok(raceAdditions.every(entry => entry.type === 'p' && [3, 4].includes(entry.y)), 'race additions must be pawns on ranks y=3/4');
  assert.notDeepEqual(normalizedLayout(race.enemyLayout), normalizedLayout(swarm.enemyLayout), 'race and swarm must produce different layouts for the same formation and seed');

  const veteran = await materialize({ id: 'qa-veteran', formation: 'fortress', mods: ['veteran'], layoutSeed: 502 });
  const veteranAgain = await materialize({ id: 'qa-veteran', formation: 'fortress', mods: ['veteran'], layoutSeed: 502 });
  assert.deepEqual(veteran, veteranAgain, 'veteran selection must be deterministic');
  const veteranPieces = veteran.enemyLayout.filter(piece => piece.veteran);
  assert.ok(veteranPieces.length > 0, 'veteran must mark at least one enemy');
  assert.equal(new Set(veteranPieces.map(piece => piece.type)).size, 1, 'veteran must mark every piece of one deterministic type');
  assert.equal(veteran.enemyLayout.filter(piece => piece.type === veteranPieces[0].type).length, veteranPieces.length, 'all enemies of the veteran type must be marked');

  await qa('startRun', 503);
  const rosterTypes = [...new Set((await state()).run.roster.filter(member => member.type !== 'k').map(member => member.type))].sort();
  const mirror = await materialize({ id: 'qa-mirror', formation: 'lance', mods: ['mirror'], layoutSeed: 503 });
  const mirrorBase = await materialize({ id: 'qa-mirror-base', formation: 'lance', layoutSeed: 503 });
  assert.equal(mirror.enemyLayout.length - mirrorBase.enemyLayout.length, rosterTypes.length, 'mirror must add one enemy per current non-king roster type');
  for (const type of ['p', 'n', 'b', 'r', 'q']) {
    const expectedDelta = rosterTypes.includes(type) ? 1 : 0;
    assert.equal(count(mirror, type) - count(mirrorBase, type), expectedDelta, `mirror delta for ${type}`);
  }
}

async function testStrictAtomicRejection() {
  await qa('startRun', 700);
  const valid = await materialize({ id: 'qa-atomic-valid', layoutSeed: 701 });
  await qa('showContracts', [valid]);
  const stable = await state();
  const assertAtomicReject = async (operation, label, expectedState = stable) => {
    await assert.rejects(operation, undefined, label);
    assert.deepEqual(await state(), expectedState, `${label}: rejection mutated state`);
  };

  const excessiveMods = ['swarm', 'cavalry', 'walls', 'diagonals', 'queen'];
  await assertAtomicReject(() => qa('materializeContract', { ...contractInput(), mods: excessiveMods }), 'materializeContract five mods');
  await assertAtomicReject(() => qa('showContracts', [{ ...valid, mods: excessiveMods }]), 'showContracts five mods');

  for (const invalid of ['unknown', 'constructor', 'toString', '__proto__']) {
    await assertAtomicReject(() => qa('materializeContract', { ...contractInput(), formation: invalid }), `formation ${invalid}`);
    await assertAtomicReject(() => qa('materializeContract', { ...contractInput(), aiProfile: invalid }), `profile ${invalid}`);
    await assertAtomicReject(() => qa('materializeContract', { ...contractInput(), mods: [invalid] }), `mod ${invalid}`);
  }
  for (const field of ['id', 'depth', 'elite', 'final', 'boss', 'mods', 'trait', 'formation', 'aiProfile', 'layoutSeed', 'reward']) {
    const missing = contractInput();
    delete missing[field];
    await assertAtomicReject(() => qa('materializeContract', missing), `missing input ${field}`);
  }
  await assert.rejects(() => page.evaluate(() => {
    const poisoned = Object.create({ formation: 'scatter' });
    Object.assign(poisoned, {
      id: 'poisoned', depth: 2, elite: false, final: false, boss: null, mods: [], trait: null,
      aiProfile: 'defensive', layoutSeed: 1, reward: 1
    });
    return window.__CB_TEST__.materializeContract(poisoned);
  }), /plain object/);
  assert.deepEqual(await state(), stable, 'prototype rejection mutated state');
  await assertAtomicReject(() => qa('showContracts', [{ ...valid, formation: 'unknown' }]), 'showContracts unknown formation');
  await assertAtomicReject(() => qa('showContracts', [{ ...valid, aiProfile: 'constructor' }]), 'showContracts constructor profile');
  await assertAtomicReject(() => qa('showContracts', [{ ...valid, mods: ['toString'] }]), 'showContracts toString mod');
  await assertAtomicReject(() => qa('showContracts', [{ ...valid, surprise: true }]), 'showContracts extra field');
  await assertAtomicReject(() => qa('showContracts', [{ ...valid, formation: 'fortress' }]), 'showContracts stale layout after formation change');
  for (const mod of ['promoted', 'veteran', 'mirror']) {
    await assertAtomicReject(() => qa('showContracts', [{ ...valid, mods: [mod] }]), `showContracts stale layout after ${mod} change`);
  }
  const missingLayout = { ...valid };
  delete missingLayout.enemyLayout;
  await assertAtomicReject(() => qa('showContracts', [missingLayout]), 'showContracts missing enemyLayout');

  await qa('startRun', 702);
  await qa('fast', true);
  await waitForPlayerOrTerminal();
  const normalStable = await state();
  const duplicateModsConfig = battleConfig(normalStable.aiProfile, normalStable.pieces, {
    trait: normalStable.run.currentContract.trait,
    mods: ['swarm', 'swarm'],
    rngState: normalStable.run.rngState,
    shield: normalStable.shield
  });
  await assertAtomicReject(
    () => qa('configureBattle', duplicateModsConfig),
    'configureBattle duplicate mods',
    normalStable
  );

  const bossDefinition = bosses.twinQueens;
  const bossContract = await materialize({
    id: 'qa-atomic-boss',
    depth: 8,
    elite: true,
    final: true,
    boss: 'twinQueens',
    mods: [...bossDefinition.mods],
    trait: bossDefinition.trait,
    formation: bossDefinition.formation,
    aiProfile: bossDefinition.aiProfile,
    layoutSeed: 703,
    reward: 0
  });
  await qa('showContracts', [bossContract]);
  await qa('selectContract', 0);
  await waitForPlayerOrTerminal();
  const bossStable = await state();
  assert.equal(bossStable.run.currentContract.boss, 'twinQueens', 'boss atomic fixture did not enter the requested boss contract');
  const bossConfig = battleConfig(bossDefinition.aiProfile, bossStable.pieces, {
    trait: bossDefinition.trait,
    mods: [...bossDefinition.mods],
    rngState: bossStable.run.rngState,
    shield: bossStable.shield
  });
  await assertAtomicReject(
    () => qa('configureBattle', { ...bossConfig, mods: ['walls', 'armor'] }),
    'configureBattle boss mods mismatch',
    bossStable
  );
  await assertAtomicReject(
    () => qa('configureBattle', { ...bossConfig, aiProfile: 'crownGuard' }),
    'configureBattle boss profile mismatch',
    bossStable
  );
  await assertAtomicReject(
    () => qa('setTrait', 'guarded'),
    'setTrait boss definition mismatch',
    bossStable
  );
}

async function testRetryRefreshDeterminism() {
  const contract = await materialize({
    id: 'qa-determinism', formation: 'scatter', mods: ['veteran', 'mirror'], aiProfile: 'crownGuard', layoutSeed: 0x2468ace
  });
  await qa('startRun', 802);
  await qa('fast', true);
  await qa('showContracts', [contract]);
  await qa('selectContract', 0);
  await waitForPlayerOrTerminal();
  const initial = await state();
  assert.deepEqual(runtimeBlackLayout(initial), normalizedLayout(contract.enemyLayout));
  const initialIntent = initial.intent;
  const initialRng = initial.run.rngState;
  await qa('retry');
  await waitForPlayerOrTerminal();
  const retried = await state();
  assert.deepEqual(retried.run.currentContract.enemyLayout, contract.enemyLayout, 'retry changed canonical layout');
  assert.deepEqual(runtimeBlackLayout(retried), normalizedLayout(contract.enemyLayout), 'retry changed runtime layout');
  assert.deepEqual(retried.intent, initialIntent, 'retry changed first enemy intent');
  assert.equal(retried.run.rngState, initialRng, 'retry changed post-intent RNG state');

  const materializedAgain = await materialize({
    id: 'qa-determinism', formation: 'scatter', mods: ['veteran', 'mirror'], aiProfile: 'crownGuard', layoutSeed: 0x2468ace
  });
  assert.deepEqual(materializedAgain, contract, 'repeated materialization changed the contract');

  const selectSnapshot = async () => {
    await qa('startRun', 802);
    await qa('fast', true);
    await qa('showContracts', [contract]);
    await qa('selectContract', 0);
    await waitForPlayerOrTerminal();
    const snapshot = await state();
    return { layout: runtimeBlackLayout(snapshot), intent: normalizedIntent(snapshot), rngState: snapshot.run.rngState };
  };
  assert.deepEqual(await selectSnapshot(), await selectSnapshot(), 'repeated selection changed layout, intent, or RNG state');
}

const battleConfig = (profile, pieces, overrides = {}) => ({
  trait: null,
  spoils: {},
  pieces,
  enemyHP: 2,
  enemyHPMax: 2,
  turnsLeft: 20,
  moveCount: 0,
  enemyTurns: 0,
  enemyCycles: 0,
  battleCharges: {},
  rngState: 0x12345678,
  shield: 3,
  mods: [],
  aiProfile: profile,
  ...overrides
});
const piece = (id, color, type, x, y, extra = {}) => ({ id, color, type, x, y, ...extra });

async function testAiProfiles() {
  const pieces = [
    piece('wk', 'w', 'k', 7, 7, { uid: 'king' }),
    piece('wp', 'w', 'p', 4, 4, { uid: 'pawn-a' }),
    piece('wr', 'w', 'r', 0, 4, { uid: 'rook' }),
    piece('bk', 'b', 'k', 4, 0),
    piece('br', 'b', 'r', 4, 2),
    piece('bn', 'b', 'n', 6, 2)
  ];
  await qa('startRun', 901);
  const intents = {};
  for (const profile of aiProfiles) {
    await qa('configureBattle', battleConfig(profile, pieces));
    const firstState = await state();
    const first = normalizedIntent(firstState);
    await qa('configureBattle', battleConfig(profile, pieces));
    const second = normalizedIntent(await state());
    assert.deepEqual(first, second, `${profile} intent must be repeatable for a fixed board and RNG`);
    intents[profile] = `${first.actorType}:${first.fromX},${first.fromY}->${first.x},${first.y}:${first.capture}`;
  }
  assert.equal(new Set(Object.values(intents)).size, 3, `AI profiles must choose three distinct concrete intents: ${JSON.stringify(intents)}`);
  console.log(`  profile intents: ${aiProfiles.map(profile => `${profile}=${intents[profile]}`).join(' | ')}`);

  const crownCapture = [
    piece('wk', 'w', 'k', 4, 4, { uid: 'king' }),
    piece('wp', 'w', 'p', 7, 6, { uid: 'pawn-a' }),
    piece('bk', 'b', 'k', 0, 0),
    piece('br', 'b', 'r', 4, 0)
  ];
  for (const profile of aiProfiles) {
    await qa('configureBattle', battleConfig(profile, crownCapture));
    assert.equal((await state()).intent.captureId, 'wk', `${profile} must give king capture absolute priority`);
  }
}

async function testVeteranAndExecutionerRuntime() {
  const plainPieces = [
    piece('wk', 'w', 'k', 7, 7, { uid: 'king' }),
    piece('wp', 'w', 'p', 6, 6, { uid: 'pawn-a' }),
    piece('bk', 'b', 'k', 0, 0),
    piece('br-veteran', 'b', 'r', 3, 0),
    piece('br-plain', 'b', 'r', 5, 0)
  ];
  let veteranWitness = null;
  for (let rngState = 1; rngState <= 128 && !veteranWitness; rngState++) {
    await qa('configureBattle', battleConfig('defensive', plainPieces, { rngState }));
    const plainIntent = (await state()).intent;
    const markedPieces = plainPieces.map(entry => entry.id === 'br-veteran' ? { ...entry, veteran: true } : entry);
    await qa('configureBattle', battleConfig('defensive', markedPieces, { mods: ['veteran'], rngState }));
    const veteranIntent = (await state()).intent;
    if (plainIntent.pieceId !== 'br-veteran' && veteranIntent.pieceId === 'br-veteran') {
      veteranWitness = { rngState, plain: plainIntent.pieceId, veteran: veteranIntent.pieceId };
    }
  }
  assert.ok(veteranWitness, 'veteran marking must measurably change deterministic AI priority');

  const executionerPieces = [
    piece('wk', 'w', 'k', 7, 7, { uid: 'king' }),
    piece('wp', 'w', 'p', 3, 3, { uid: 'pawn-a' }),
    piece('bk', 'b', 'k', 0, 0),
    piece('br', 'b', 'r', 3, 0)
  ];
  await qa('configureBattle', battleConfig('aggressive', executionerPieces, { mods: ['executioner'] }));
  await qa('setCombo', 9);
  await qa('forceEnemyMove', 'br', 3, 3);
  await page.waitForFunction(() => window.__CB_TEST__.state().combo === 0, null, { timeout: 3000, polling: 2 });
  assert.equal((await state()).combo, 0, 'executioner capture must clear the combo');
}

async function testLocalizedContractCards() {
  await qa('startRun', 1001);
  const contract = await materialize({
    id: 'qa-localized-card',
    formation: 'scatter',
    aiProfile: 'aggressive',
    mods: ['promoted', 'veteran', 'mirror', 'executioner'],
    layoutSeed: 1002
  });
  for (const locale of ['en', 'zh-CN', 'ja']) {
    await qa('setLanguage', locale);
    await qa('showContracts', [contract]);
    const actual = await page.locator('.contract-card').first().evaluate(card => ({
      formation: card.querySelector('.contract-formation b')?.textContent ?? '',
      profile: card.querySelector('.contract-profile b')?.textContent ?? '',
      mods: [...card.querySelectorAll('.contract-mods .mod b')].map(node => node.textContent ?? '')
    }));
    const expected = await page.evaluate(activeLocale => {
      const translate = key => globalThis.CrownBreakerI18n.translate(activeLocale, key);
      return {
        formation: translate('formation.scatter.name'),
        profile: translate('aiProfile.aggressive.name'),
        mods: ['promoted', 'veteran', 'mirror', 'executioner'].map(id => translate(`contract.${id}.name`))
      };
    }, locale);
    assert.ok(actual.formation.includes(expected.formation), `${locale}: formation name is missing from route card`);
    assert.ok(actual.profile.includes(expected.profile), `${locale}: AI profile name is missing from route card`);
    assert.deepEqual(actual.mods, expected.mods, `${locale}: four new modifier names differ on route card`);
  }
}

async function completeBattleWithRecommendedMove(label) {
  let recommendedMovePlayed = false;
  for (;;) {
    await waitForPlayerOrTerminal();
    const snapshot = await state();
    if (snapshot.failureReason === 'no_legal_moves') throw new Error(`${label}: no_legal_moves`);
    if (snapshot.phase === 'result' || snapshot.phase === 'reward' || snapshot.run?.stage === 'reward') return;
    if (snapshot.phase === 'promotion') {
      await qa('promote', 'q');
      continue;
    }
    assert.equal(snapshot.phase, 'player', `${label}: expected a player phase`);
    const moves = await qa('moves');
    assert.ok(moves.length > 0, `${label}: player phase has no legal move`);
    if (!recommendedMovePlayed) {
      const recommended = await qa('recommend');
      assert.ok(recommended, `${label}: recommend returned no move`);
      assert.ok(moves.some(move => move.pieceId === recommended.pieceId && move.x === recommended.x && move.y === recommended.y),
        `${label}: recommended move is not legal`);
      assert.equal(await qa('play', recommended.pieceId, recommended.x, recommended.y), true, `${label}: recommended move was rejected`);
      recommendedMovePlayed = true;
      continue;
    }
    assert.equal(await qa('finishBattle'), true, `${label}: narrow QA battle completion failed`);
  }
}

async function chooseRewardsUntilContract(label) {
  for (;;) {
    await page.waitForFunction(() => {
      const snapshot = window.__CB_TEST__.state();
      return snapshot.run?.stage === 'reward' || snapshot.run?.stage === 'contract' || snapshot.phase === 'result';
    }, null, { timeout: 5000, polling: 5 });
    const snapshot = await state();
    if (snapshot.phase === 'result') {
      throw new Error(`${label}: run ended before route selection (failureReason=${snapshot.failureReason ?? 'none'}, shield=${snapshot.shield}, depth=${snapshot.run?.battle ?? 'unknown'})`);
    }
    if (snapshot.run.stage === 'contract') return snapshot;
    assert.ok(Array.isArray(snapshot.run.pendingRewards) && snapshot.run.pendingRewards.length, `${label}: reward draft is empty`);
    await qa('selectReward', snapshot.run.pendingRewards[0].id);
  }
}

async function routeContracts(formation, depth, formationIndex) {
  const profile = aiProfiles[(formationIndex + depth) % aiProfiles.length];
  const normal = await materialize({
    id: `qa-run-${formation}-${depth}-normal`, depth, elite: false, trait: null, formation, aiProfile: profile,
    mods: [mods[(formationIndex + depth) % 8]], layoutSeed: 2000 + formationIndex * 40 + depth * 2, reward: 1
  });
  const elite = await materialize({
    id: `qa-run-${formation}-${depth}-elite`, depth, elite: true, trait: 'guarded', formation, aiProfile: profile,
    mods: ['cavalry', 'walls', 'executioner'], layoutSeed: 2001 + formationIndex * 40 + depth * 2, reward: 2
  });
  return [normal, elite];
}

async function testEightBattleFormationRuns() {
  for (const [formationIndex, formation] of formations.entries()) {
    const seed = 1200 + formationIndex;
    const startedAt = Date.now();
    await qa('startRun', seed);
    await qa('fast', true);
    for (let depth = 1; depth <= 8; depth++) {
      await completeBattleWithRecommendedMove(`${formation} depth ${depth}`);
      if (depth === 8) break;
      const routeState = await chooseRewardsUntilContract(`${formation} depth ${depth}`);
      if (depth + 1 === 8) {
        assert.equal(routeState.run.pendingContracts.length, 1, `${formation}: final route must contain one natural boss`);
        assert.equal(routeState.run.pendingContracts[0].final, true, `${formation}: final route is not a boss contract`);
        await qa('selectContract', 0);
      } else {
        const choices = await routeContracts(formation, depth + 1, formationIndex);
        await qa('showContracts', choices);
        await qa('selectContract', 0);
      }
    }
    await page.waitForFunction(() => window.__CB_TEST__.state().phase === 'result', null, { timeout: 5000, polling: 5 });
    const completed = await state();
    assert.equal(completed.failureReason, null, `${formation}: fixed-seed eight-battle run failed`);
    assert.equal(completed.run.battle, 8, `${formation}: run did not complete eight battles`);
    assertClean(`${formation} full run`);
    console.log(`  formation=${formation} seed=${seed} depth=${completed.run.battle} result=clear elapsed=${Date.now() - startedAt}ms`);
  }
}

try {
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({ serviceWorkers: 'block' });
  await context.addInitScript(installFastTimers);
  const expectedOrigin = new URL(url).origin;
  await context.route('**/*', async route => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.origin !== expectedOrigin) {
      externalRequests.push(route.request().url());
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });
  page = await context.newPage();
  page.on('pageerror', error => pageErrors.push(error.stack || error.message));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  qa = (method, ...values) => page.evaluate(({ methodName, methodArgs }) => {
    const hook = window.__CB_TEST__;
    if (!hook || typeof hook[methodName] !== 'function') throw new Error(`Missing QA method: ${methodName}.`);
    return hook[methodName](...methodArgs);
  }, { methodName: method, methodArgs: values });
  state = () => qa('state');
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  try {
    await page.waitForFunction(() => Boolean(window.__CB_TEST__), null, { timeout: 5000 });
  } catch (error) {
    assertClean('browser initialization');
    throw error;
  }
  console.log('CROWN//BREAKER enemy archetype checks');
  console.log('- registries, canonical layouts, previews, selections, mods, and bosses');
  await testRegistriesAndLayouts();
  console.log('- strict rejection and retry determinism');
  await testStrictAtomicRejection();
  await testRetryRefreshDeterminism();
  console.log('- AI profiles, veteran priority, and executioner runtime behavior');
  await testAiProfiles();
  await testVeteranAndExecutionerRuntime();
  console.log('- en/zh-CN/ja route-card formation, profile, and new-mod copy');
  await testLocalizedContractCards();
  console.log('- promoted, mirror, veteran, and executioner semantics');
  await testModSemantics();
  assertClean('targeted checks');
  if (!targetedOnly) {
    console.log('- six fixed-seed eight-battle formation runs');
    await testEightBattleFormationRuns();
  }
  assertClean('final checks');
  console.log(`Enemy archetype checks PASS (${targetedOnly ? 'targeted' : 'full'}).`);
} finally {
  try {
    if (context) await context.close();
  } finally {
    try {
      if (browser) await browser.close();
    } finally {
      await new Promise(resolveClose => server.close(resolveClose));
    }
  }
}
