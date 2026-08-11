import assert from "node:assert/strict";

import {
  BOSS_DEFINITIONS,
  DEFAULT_MODIFIERS,
  UPGRADES,
  applyUpgrade,
  buildStorySchedule,
  bulletCount,
  createBossState,
  createDirectorState,
  createEnemyState,
  pointSegmentDistance,
  resetBossPhase,
  segmentCircleHit,
  stepBossPattern,
  stepDirector,
  stepEnemyPattern,
} from "./index.js";

assert.deepEqual(
  UPGRADES.map(({ id, max }) => [id, max]),
  [
    ["voltage", 4],
    ["satellite", 4],
    ["echo", 3],
    ["magnet", 3],
    ["nova", 3],
    ["armor", 2],
    ["hunter", 3],
    ["recycler", 3],
    ["chain", 3],
    ["missile", 3],
    ["arc", 3],
    ["mercy", 1],
  ],
);
assert.deepEqual(
  BOSS_DEFINITIONS.map((boss) => boss.phases.length),
  [3, 3, 4],
);
assert.deepEqual(
  [0, 1, 2].map((stage) => buildStorySchedule(stage).length),
  [64, 68, 94],
);
assert.deepEqual(
  [0, 1, 2].map((stage) => buildStorySchedule(stage).at(-1).time),
  [46.9, 52, 62],
);
assert.equal(pointSegmentDistance(2, 3, 0, 0, 4, 0), 3);
assert.equal(segmentCircleHit(0, 0, 4, 0, 2, 1, 1), true);
assert.equal(segmentCircleHit(0, 0, 4, 0, 2, 1.01, 1), false);
assert.equal(bulletCount(18, 0), 11);
assert.equal(bulletCount(18, 1), 23);

const armor = applyUpgrade({
  upgradeId: "armor",
  currentLevel: 0,
  modifiers: { ...DEFAULT_MODIFIERS },
  shield: 2,
  maxShield: 3,
});
assert.deepEqual(
  { bonus: armor.modifiers.maxShieldBonus, shield: armor.shield, maxShield: armor.maxShield },
  { bonus: 1, shield: 3, maxShield: 4 },
);

function makePorts() {
  const calls = [];
  return {
    calls,
    spawnEnemy(type, options) {
      calls.push(["enemy", type, options]);
    },
    clearEnemies(withExplosion) {
      calls.push(["clear", withExplosion]);
    },
    spawnBoss(id, challenge) {
      calls.push(["boss", id, challenge]);
    },
  };
}

const rng = { integer: () => 0, range: (min, max) => (min + max) / 2 };
const rush = createDirectorState(0);
const rushPorts = makePorts();
stepDirector({
  state: rush,
  dt: 1 / 60,
  mode: "rush",
  stageIndex: 0,
  modeTimer: 135,
  sequenceLock: false,
  bossActive: false,
  rng,
  ports: rushPorts,
});
assert.equal(rush.rushBossesSpawned, 1);
assert.deepEqual(rushPorts.calls.slice(-2), [
  ["clear", false],
  ["boss", 0, true],
]);

const endless = createDirectorState(0);
endless.time = 70 - 1 / 60;
endless.waveClock = 1;
const endlessPorts = makePorts();
stepDirector({
  state: endless,
  dt: 1 / 60,
  mode: "endless",
  stageIndex: 0,
  modeTimer: 0,
  sequenceLock: false,
  bossActive: false,
  rng,
  ports: endlessPorts,
});
assert.equal(endless.endlessBossesSpawned, 1);
assert.deepEqual(endlessPorts.calls, [
  ["clear", false],
  ["boss", 1, true],
]);

const patternRng = { next: () => 0.25, integer: () => 0, range: (min, max) => (min + max) / 2 };
const player = { x: 270, y: 780, vx: 0, vy: 0 };
const patternPorts = {
  spawnEnemyBullet() {},
  spawnEnemy() {},
  spawnLaser() {},
};
for (const type of ["scout", "diver", "spinner", "turret", "orbiter", "carrier", "elite"]) {
  const enemy = createEnemyState({
    type,
    options: { x: 270, y: 100, targetY: 100, fireDelay: 0 },
    stageIndex: 0,
    rng: patternRng,
  });
  stepEnemyPattern({ enemy, dt: 1 / 60, rank: 0.5, player, rng: patternRng, ports: patternPorts });
}
for (let bossId = 0; bossId < BOSS_DEFINITIONS.length; bossId += 1) {
  const boss = createBossState({
    id: bossId,
    mode: "story",
    runTime: 0,
    statsHits: 0,
    challenge: false,
  });
  boss.intro = 0;
  for (let phaseIndex = 0; phaseIndex < boss.phases.length; phaseIndex += 1) {
    resetBossPhase({ boss, phaseIndex, statsHits: 0, runTime: 0 });
    stepBossPattern({ boss, dt: 1 / 60, rank: 0.5, player, rng: patternRng, ports: patternPorts });
  }
}

console.log("Neon mechanics parity checks passed.");
