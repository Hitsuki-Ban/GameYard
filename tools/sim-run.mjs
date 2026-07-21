import { createReadStream, realpathSync, statSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');
const REAL_PROJECT_ROOT = realpathSync(PROJECT_ROOT);
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'reports');
const MAX_RUNS = 10000;
const POLICIES = new Set(['greedy', 'random']);
const FAILURE_CODES = new Set([
  'crown_broken',
  'turns_exhausted',
  'no_legal_moves',
  'qa',
  'simulation_timeout',
  'simulation_error'
]);
const MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8']
]);

function fail(message) {
  throw new Error(`${message}\nUsage: pnpm sim -- --runs <1-${MAX_RUNS}> --policy <greedy|random> --seed-base <1-4294967295>`);
}

function parseUnsignedInteger(flag, raw, min, max) {
  if (!/^(0|[1-9]\d*)$/.test(raw ?? '')) fail(`${flag} must be an integer from ${min} to ${max}.`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(`${flag} must be an integer from ${min} to ${max}.`);
  return value;
}

function parseArgs(argv) {
  if (argv[0] === '--') argv = argv.slice(1);
  const values = new Map();
  const accepted = new Set(['--runs', '--policy', '--seed-base']);
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const raw = argv[index + 1];
    if (!accepted.has(flag)) fail(`Unknown argument: ${flag ?? '<missing>'}.`);
    if (raw === undefined || raw.startsWith('--')) fail(`${flag} requires a value.`);
    if (values.has(flag)) fail(`${flag} may only be provided once.`);
    values.set(flag, raw);
  }
  for (const flag of accepted) if (!values.has(flag)) fail(`Missing required argument: ${flag}.`);
  const policy = values.get('--policy');
  if (!POLICIES.has(policy)) fail('--policy must be either greedy or random.');
  return {
    runs: parseUnsignedInteger('--runs', values.get('--runs'), 1, MAX_RUNS),
    policy,
    seedBase: parseUnsignedInteger('--seed-base', values.get('--seed-base'), 1, 0xffffffff)
  };
}

function botRandomFactory(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
}

function botSeed(runSeed) {
  let value = (runSeed ^ 0x9e3779b9) >>> 0;
  return value || 0x6d2b79f5;
}

function pickIndex(length, random) {
  if (!Number.isInteger(length) || length <= 0) throw new RangeError('Cannot choose from an empty collection.');
  return Math.min(length - 1, Math.floor(random() * length));
}

function runSeedAt(seedBase, index) {
  return ((seedBase - 1 + index) % 0xffffffff) + 1;
}

function percentile(sorted, fraction) {
  if (!sorted.length) return 0;
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return Math.round((sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)) * 100) / 100;
}

function ratio(numerator, denominator) {
  return denominator ? Math.round((numerator / denominator) * 10000) / 10000 : 0;
}

function mean(values) {
  return values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100 : 0;
}

function createCounter(keys = []) {
  return Object.fromEntries(keys.map(key => [key, 0]));
}

function compareAsciiIds(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function summarize(results) {
  const wins = results.filter(result => result.outcome === 'win').length;
  const scores = results.map(result => result.score).sort((a, b) => a - b);
  const depths = results.map(result => result.depthReached);
  const failureCodes = createCounter([...FAILURE_CODES].sort(compareAsciiIds));
  const depthDistribution = {};
  const routeData = {
    normal: { encounters: 0, battleWins: 0, runSelections: 0, runWins: 0 },
    elite: { encounters: 0, battleWins: 0, runSelections: 0, runWins: 0 }
  };
  const traitData = {};
  const formationData = {};
  const modData = {};
  const aiProfileData = {};

  const recordEncounter = (target, id, won) => {
    target[id] ||= { encounters: 0, battleWins: 0 };
    target[id].encounters += 1;
    if (won) target[id].battleWins += 1;
  };

  for (const result of results) {
    if (result.failureCode) failureCodes[result.failureCode] += 1;
    depthDistribution[result.depthReached] = (depthDistribution[result.depthReached] || 0) + 1;
    for (const kind of ['normal', 'elite']) {
      const selected = result.route[kind];
      if (selected > 0) routeData[kind].runSelections += 1;
      if (result.outcome === 'win' && selected > 0) routeData[kind].runWins += 1;
    }
    for (const battle of result.battles) {
      if (battle.routeSelected) {
        const kind = battle.elite ? 'elite' : 'normal';
        routeData[kind].encounters += 1;
        if (battle.outcome === 'win') routeData[kind].battleWins += 1;
      }
      if (battle.trait) {
        recordEncounter(traitData, battle.trait, battle.outcome === 'win');
      }
      recordEncounter(formationData, battle.formation, battle.outcome === 'win');
      recordEncounter(aiProfileData, battle.aiProfile, battle.outcome === 'win');
      for (const mod of battle.mods) recordEncounter(modData, mod, battle.outcome === 'win');
    }
  }

  const routes = Object.fromEntries(Object.entries(routeData).map(([kind, data]) => [kind, {
    ...data,
    battleWinRate: ratio(data.battleWins, data.encounters),
    runWinRate: ratio(data.runWins, data.runSelections)
  }]));
  const encounterSummary = data => Object.fromEntries(Object.entries(data)
    .sort(([a], [b]) => compareAsciiIds(a, b))
    .map(([id, entry]) => [id, { ...entry, winRate: ratio(entry.battleWins, entry.encounters) }]));

  return {
    runs: results.length,
    wins,
    losses: results.length - wins,
    winRate: ratio(wins, results.length),
    depth: {
      mean: mean(depths),
      max: Math.max(...depths),
      distribution: Object.fromEntries(Object.entries(depthDistribution).sort(([a], [b]) => Number(a) - Number(b)))
    },
    failureCodes,
    score: {
      min: scores[0],
      p25: percentile(scores, 0.25),
      median: percentile(scores, 0.5),
      p75: percentile(scores, 0.75),
      p90: percentile(scores, 0.9),
      max: scores.at(-1),
      mean: mean(scores)
    },
    routes,
    traits: encounterSummary(traitData),
    formations: encounterSummary(formationData),
    mods: encounterSummary(modData),
    aiProfiles: encounterSummary(aiProfileData)
  };
}

function markdownReport(report) {
  const { config, summary, runs } = report;
  const rows = [
    '# CROWN//BREAKER Balance Simulation',
    '',
    `- Runs: ${config.runs}`,
    `- Policy: ${config.policy}`,
    `- Seed base: ${config.seedBase}`,
    '',
    '## Summary',
    '',
    '| Metric | Value |',
    '| --- | ---: |',
    `| Wins | ${summary.wins} |`,
    `| Losses | ${summary.losses} |`,
    `| Win rate | ${(summary.winRate * 100).toFixed(2)}% |`,
    `| Mean depth reached | ${summary.depth.mean} |`,
    `| Maximum depth reached | ${summary.depth.max} |`,
    `| Mean score | ${summary.score.mean} |`,
    `| Score p25 / median / p75 / p90 | ${summary.score.p25} / ${summary.score.median} / ${summary.score.p75} / ${summary.score.p90} |`,
    '',
    '## Failure codes',
    '',
    '| Code | Count |',
    '| --- | ---: |',
    ...Object.entries(summary.failureCodes).map(([code, count]) => `| ${code} | ${count} |`),
    '',
    '## Routes',
    '',
    '| Route | Encounters | Battle wins | Battle win rate | Runs selecting | Winning runs | Run win rate |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...Object.entries(summary.routes).map(([kind, data]) => `| ${kind} | ${data.encounters} | ${data.battleWins} | ${(data.battleWinRate * 100).toFixed(2)}% | ${data.runSelections} | ${data.runWins} | ${(data.runWinRate * 100).toFixed(2)}% |`),
    '',
    '## Traits',
    '',
    '| Trait | Encounters | Battle wins | Win rate |',
    '| --- | ---: | ---: | ---: |',
    ...Object.entries(summary.traits).map(([trait, data]) => `| ${trait} | ${data.encounters} | ${data.battleWins} | ${(data.winRate * 100).toFixed(2)}% |`),
    '',
    '## Formations',
    '',
    '| Formation | Encounters | Battle wins | Win rate |',
    '| --- | ---: | ---: | ---: |',
    ...Object.entries(summary.formations).map(([formation, data]) => `| ${formation} | ${data.encounters} | ${data.battleWins} | ${(data.winRate * 100).toFixed(2)}% |`),
    '',
    '## Mods',
    '',
    '| Mod | Encounters | Battle wins | Win rate |',
    '| --- | ---: | ---: | ---: |',
    ...Object.entries(summary.mods).map(([mod, data]) => `| ${mod} | ${data.encounters} | ${data.battleWins} | ${(data.winRate * 100).toFixed(2)}% |`),
    '',
    '## AI profiles',
    '',
    '| AI profile | Encounters | Battle wins | Win rate |',
    '| --- | ---: | ---: | ---: |',
    ...Object.entries(summary.aiProfiles).map(([profile, data]) => `| ${profile} | ${data.encounters} | ${data.battleWins} | ${(data.winRate * 100).toFixed(2)}% |`),
    '',
    '## Runs',
    '',
    '| # | Seed | Outcome | Failure | Depth | Score | Normal | Elite |',
    '| ---: | ---: | --- | --- | ---: | ---: | ---: | ---: |',
    ...runs.map(result => `| ${result.index + 1} | ${result.seed} | ${result.outcome} | ${result.failureCode ?? ''} | ${result.depthReached} | ${result.score} | ${result.route.normal} | ${result.route.elite} |`),
    ''
  ];
  return rows.join('\n');
}

function createStaticServer() {
  const rootPrefix = `${PROJECT_ROOT}${path.sep}`;
  const realRootPrefix = `${REAL_PROJECT_ROOT}${path.sep}`;
  return createServer((request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' });
      response.end();
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    } catch {
      response.writeHead(400);
      response.end('Bad request');
      return;
    }
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const target = path.resolve(PROJECT_ROOT, relative);
    const hiddenSegment = relative.split(/[\\/]/).some(segment => segment.startsWith('.'));
    if (hiddenSegment || (target !== PROJECT_ROOT && !target.startsWith(rootPrefix))) {
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
    if (realTarget !== REAL_PROJECT_ROOT && !realTarget.startsWith(realRootPrefix)) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }
    if (!file.isFile()) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Type': MIME_TYPES.get(path.extname(target).toLowerCase()) || 'application/octet-stream'
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
  return `http://127.0.0.1:${address.port}/?qa`;
}

async function closeServer(server) {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

async function waitForHook(page) {
  await page.waitForFunction(() => Boolean(globalThis.__CB_TEST__), null, { timeout: 10000, polling: 10 });
}

async function readState(page) {
  return page.evaluate(() => globalThis.__CB_TEST__.state());
}

async function driveRun(page, index, seed, policy) {
  const moveRandom = botRandomFactory(botSeed(seed));
  const decisionRandom = botRandomFactory((botSeed(seed) ^ 0xa511e9b3) >>> 0 || 0x9e3779b9);
  await page.evaluate(runSeed => {
    globalThis.__CB_TEST__.fast(true);
    globalThis.__CB_TEST__.startRun(runSeed);
  }, seed);

  const battles = [];
  const seenDepths = new Set();
  const selectedRouteDepths = new Set();
  const route = { normal: 0, elite: 0 };
  const deadline = Date.now() + 120000;
  let recommendationChecked = false;
  let state = await readState(page);

  while (Date.now() < deadline) {
    state = await readState(page);
    const current = state.run?.currentContract;
    const depth = Number(state.run?.battle || 0);
    if (depth > 0 && current && !seenDepths.has(depth)) {
      seenDepths.add(depth);
      battles.push({
        depth,
        elite: Boolean(current.elite),
        trait: current.trait || null,
        formation: current.formation,
        mods: [...current.mods],
        aiProfile: current.aiProfile,
        routeSelected: selectedRouteDepths.has(depth),
        outcome: 'pending'
      });
    }

    if (state.phase === 'result') break;

    if (state.phase === 'promotion') {
      const modalReady = await page.evaluate(() => document.querySelector('#promotion-modal.active') !== null);
      if (!modalReady) {
        await page.waitForTimeout(2);
        continue;
      }
      await page.evaluate(() => globalThis.__CB_TEST__.promote('q'));
      continue;
    }

    if (state.phase === 'reward' || state.run?.stage === 'reward') {
      const modalReady = await page.evaluate(() => document.querySelector('#reward-modal.active') !== null);
      if (!modalReady) {
        await page.waitForTimeout(2);
        continue;
      }
      const rewards = state.run?.pendingRewards || [];
      if (!rewards.length) throw new Error('Reward phase has no reward choices.');
      await page.evaluate(id => globalThis.__CB_TEST__.selectReward(id), rewards[0].id);
      continue;
    }

    if (state.phase === 'contract' || state.run?.stage === 'contract') {
      const modalReady = await page.evaluate(() => document.querySelector('#contract-modal.active') !== null);
      if (!modalReady) {
        await page.waitForTimeout(2);
        continue;
      }
      const contracts = state.run?.pendingContracts || [];
      if (!contracts.length) throw new Error('Contract phase has no contract choices.');
      const choice = pickIndex(contracts.length, decisionRandom);
      const selected = contracts[choice];
      if (!selected.final) {
        route[selected.elite ? 'elite' : 'normal'] += 1;
        selectedRouteDepths.add(Number(selected.depth));
      }
      await page.evaluate(contractIndex => globalThis.__CB_TEST__.selectContract(contractIndex), choice);
      continue;
    }

    if (state.active && state.phase === 'player') {
      if (state.hype >= 100 && state.overdriveMoves <= 0) await page.evaluate(() => globalThis.__CB_TEST__.overdrive());
      let move;
      if (policy === 'greedy' && !recommendationChecked) {
        const probe = await page.evaluate(() => {
          const rngBefore = globalThis.__CB_TEST__.state().run.rngState;
          const first = globalThis.__CB_TEST__.recommend();
          const second = globalThis.__CB_TEST__.recommend();
          const rngAfter = globalThis.__CB_TEST__.state().run.rngState;
          return { first, second, rngBefore, rngAfter };
        });
        if (probe.rngBefore !== probe.rngAfter || JSON.stringify(probe.first) !== JSON.stringify(probe.second)) {
          throw new Error('QA recommendation is not deterministic or consumed the run RNG.');
        }
        recommendationChecked = true;
        move = probe.first;
      } else if (policy === 'greedy') {
        move = await page.evaluate(() => globalThis.__CB_TEST__.recommend());
      } else {
        move = await page.evaluate(() => {
          const moves = globalThis.__CB_TEST__.moves();
          return moves;
        }).then(moves => moves.length ? moves[pickIndex(moves.length, moveRandom)] : null);
      }
      if (!move) {
        await page.evaluate(() => globalThis.__CB_TEST__.forceFail('no_legal_moves'));
        continue;
      }
      const accepted = await page.evaluate(candidate => globalThis.__CB_TEST__.play(candidate.uid || candidate.pieceId, candidate.x, candidate.y), move);
      if (!accepted) throw new Error('The selected move was rejected by the game.');
      continue;
    }

    await page.waitForTimeout(2);
  }

  state = await readState(page);
  let failureCode = state.failureReason || null;
  if (state.phase !== 'result') failureCode = 'simulation_timeout';
  if (failureCode && !FAILURE_CODES.has(failureCode)) failureCode = 'simulation_error';
  const outcome = failureCode ? 'loss' : 'win';
  if (battles.length) {
    const wonCount = outcome === 'win' ? battles.length : Math.max(0, battles.length - 1);
    battles.forEach((battle, battleIndex) => { battle.outcome = battleIndex < wonCount ? 'win' : 'loss'; });
  }
  return {
    index,
    seed,
    policy,
    outcome,
    failureCode,
    depthReached: Number(state.run?.battle || battles.at(-1)?.depth || 1),
    score: Math.max(0, Math.floor(Number(state.score || 0))),
    promotions: Math.max(0, Math.floor(Number(state.run?.promotions || 0))),
    captures: Math.max(0, Math.floor(Number(state.run?.captures || state.run?.battleStartMeta?.captures || 0))),
    maxCombo: Math.max(0, Math.floor(Number(state.run?.maxCombo || 0))),
    route,
    traits: [...new Set(battles.map(battle => battle.trait).filter(Boolean))],
    formations: [...new Set(battles.map(battle => battle.formation))],
    mods: [...new Set(battles.flatMap(battle => battle.mods))],
    aiProfiles: [...new Set(battles.map(battle => battle.aiProfile))],
    battles
  };
}

async function runSimulation(config) {
  const server = createStaticServer();
  let browser;
  try {
    const url = await listen(server);
    try {
      browser = await chromium.launch({ headless: true });
    } catch (error) {
      throw new Error(`Chromium could not start. Install it with \"pnpm exec playwright install chromium\".\n${error.message}`);
    }
    const results = new Array(config.runs);
    const workerCount = Math.min(config.runs, 3);
    const workers = Array.from({ length: workerCount }, async (_, workerIndex) => {
      const context = await browser.newContext({ serviceWorkers: 'block' });
      try {
        const page = await context.newPage();
        await page.addInitScript(() => {
          const nativeSetTimeout = globalThis.setTimeout.bind(globalThis);
          globalThis.setTimeout = (callback, delay = 0, ...args) => nativeSetTimeout(callback, Math.min(Math.max(Number(delay) || 0, 0), 4), ...args);
          localStorage.clear();
        });
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await waitForHook(page);
        for (let index = workerIndex; index < config.runs; index += workerCount) {
          const seed = runSeedAt(config.seedBase, index);
          try {
            results[index] = await driveRun(page, index, seed, config.policy);
          } catch (error) {
            const state = await readState(page).catch(() => null);
            results[index] = {
              index,
              seed,
              policy: config.policy,
              outcome: 'loss',
              failureCode: 'simulation_error',
              depthReached: Number(state?.run?.battle || 1),
              score: Math.max(0, Math.floor(Number(state?.score || 0))),
              promotions: Math.max(0, Math.floor(Number(state?.run?.promotions || 0))),
              captures: Math.max(0, Math.floor(Number(state?.run?.captures || 0))),
              maxCombo: Math.max(0, Math.floor(Number(state?.run?.maxCombo || 0))),
              route: { normal: 0, elite: 0 },
              traits: [],
              formations: [],
              mods: [],
              aiProfiles: [],
              battles: [],
              error: error.message
            };
          }
        }
      } finally {
        await context.close();
      }
    });
    await Promise.all(workers);
    return results;
  } finally {
    if (browser) await browser.close();
    if (server.listening) await closeServer(server);
  }
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  const results = await runSimulation(config);
  const infrastructureFailures = results.filter(result => ['simulation_error', 'simulation_timeout'].includes(result.failureCode));
  if (infrastructureFailures.length) {
    const details = infrastructureFailures
      .map(result => `seed ${result.seed}: ${result.failureCode}${result.error ? ` (${result.error})` : ''}`)
      .join('\n');
    throw new Error(`Simulation infrastructure failed for ${infrastructureFailures.length} run(s):\n${details}`);
  }
  const report = {
    schemaVersion: 2,
    config,
    summary: summarize(results),
    runs: results
  };
  const date = new Date().toISOString().slice(0, 10);
  const stem = `sim-${date}-${config.policy}-${config.runs}-${config.seedBase}`;
  const jsonPath = path.join(OUTPUT_DIR, `${stem}.json`);
  const markdownPath = path.join(OUTPUT_DIR, `${stem}.md`);
  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(markdownPath, markdownReport(report), 'utf8');
  process.stdout.write(`${path.relative(PROJECT_ROOT, jsonPath)}\n${path.relative(PROJECT_ROOT, markdownPath)}\n`);
}

main().catch(error => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
