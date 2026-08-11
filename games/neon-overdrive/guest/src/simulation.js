import { createRng } from "./rng.js";
import {
  COLORS,
  UPGRADES,
  applyUpgrade,
  arcTrigger,
  buildArcParticles,
  buildMissilePattern,
  buildNovaFinisher,
  buildPlayerShotPattern,
  createDefaultModifiers,
  createBossState,
  createDirectorState,
  createEnemyBullet,
  createEnemyState,
  createLaser,
  createPickup,
  emitRing,
  laserSegment,
  missileImpact,
  overdriveStartDamage,
  pointSegmentDistance,
  resetBossPhase,
  segmentCircleHit,
  steerMissile,
  stepEnemyBullet,
  stepEnemyPattern,
  stepBossPattern,
  stepDirector,
  stepLaser,
  stepPickup,
} from "./mechanics/index.js";

export const WORLD_WIDTH = 540;
export const WORLD_HEIGHT = 960;
export const FIXED_STEP_SECONDS = 1 / 60;
const OVERDRIVE_ZERO_EPSILON = FIXED_STEP_SECONDS * 1e-9;

const MODES = new Set(["story", "rush", "endless"]);
const GAME_FX_DENSITIES = new Set([1, 0.68, 0.38]);
const BULLET_CANCEL_REASONS = new Set([
  "transition",
  "guard",
  "hit",
  "phase",
  "boss",
  "drive",
  "finisher",
]);
const PENDING_SEQUENCE_TICKS = Object.freeze({
  storyUpgrade: 138,
  storyVictory: 180,
  modeResume: 126,
  runDefeat: 69,
});
const HIT_STOP_TICKS = Object.freeze({
  overdrive: 5,
  playerHit: 6,
  bossPhase: 8,
  bossDefeat: 14,
});
const HYPE_GRADES = Object.freeze([
  { minimum: 96, grade: "SSS" },
  { minimum: 82, grade: "SS" },
  { minimum: 66, grade: "S" },
  { minimum: 48, grade: "A" },
  { minimum: 26, grade: "B" },
  { minimum: 0, grade: "C" },
]);
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distanceSquared(left, right) {
  return (left.x - right.x) ** 2 + (left.y - right.y) ** 2;
}

function deepCopy(value) {
  return JSON.parse(JSON.stringify(value));
}

function exactKeys(value, expected) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === expected.length &&
    expected.every((key) => Object.hasOwn(value, key))
  );
}

function hypeGrade(chain, overdrive) {
  const effective = chain + (overdrive > 0 ? 18 : 0);
  return HYPE_GRADES.find(({ minimum }) => effective >= minimum).grade;
}

export function createNeonSimulation({
  profile,
  storage,
  project,
  emitCue,
  emitEvent,
  seed = 0x4e454f4e,
}) {
  if (!Number.isSafeInteger(seed))
    throw new TypeError("Neon simulation seed must be a safe integer.");
  if (typeof emitEvent !== "function") {
    throw new TypeError("Neon simulation requires an explicit semantic event port.");
  }
  const rng = createRng(seed);
  const fxRng = createRng((seed ^ 0x46584546) >>> 0);
  const testkitEventBuffer = __GAMEYARD_TESTKIT__ ? [] : null;
  const state = {
    tick: 0,
    presentationTime: 0,
    hitStopTicks: 0,
    screen: "title",
    sequenceLock: false,
    pendingAction: null,
    pendingTicks: 0,
    mode: "story",
    selectedMode: "story",
    stage: 0,
    elapsed: 0,
    runTicks: 0,
    storyDirectorTicks: 0,
    endlessDirectorTicks: 0,
    modeTimer: 0,
    director: createDirectorState(0),
    score: 0,
    chain: 0,
    chainHold: 0,
    maxChain: 1,
    drive: 0,
    driveReadyTime: 0,
    drivePrompted: false,
    overdrive: 0,
    shield: 3,
    maxShield: 3,
    rank: 0.24,
    rankTarget: 0.24,
    rankPenalty: 0,
    noHitTime: 0,
    tutorial: { moved: false, graze: false, autoFire: false },
    stats: { bulletsCancelled: 0 },
    kills: 0,
    graze: 0,
    hits: 0,
    bosses: 0,
    reboots: 4,
    stageMercyUsed: false,
    freeGuardUsed: false,
    firstDriveUsed: false,
    overdriveMax: 0,
    overdriveGuard: false,
    input: { x: 0, y: 0, focus: false, pointer: null, drop: false },
    player: {
      x: 270,
      y: 788,
      prevX: 270,
      prevY: 788,
      radius: 4,
      invulnerable: 0,
      shotClock: 0,
      missileClock: 0,
      power: 1,
      focus: false,
      vx: 0,
      vy: 0,
      tilt: 0,
      moveDistance: 0,
      auraPulse: 0,
    },
    enemies: [],
    playerBullets: [],
    enemyBullets: [],
    particles: [],
    pickups: [],
    lasers: [],
    floaters: [],
    danger: 0,
    flash: null,
    shake: 0,
    banner: null,
    worldPrompt: null,
    boss: null,
    upgradeChoices: [],
    upgradeLevels: {},
    mods: createDefaultModifiers(),
    gameSettings: profile.settings,
    result: null,
  };
  let disposed = false;
  let lastProjection = "";
  let nextEntityId = 1;
  const pools = {
    enemies: [],
    playerBullets: [],
    enemyBullets: [],
    particles: [],
    pickups: [],
    lasers: [],
  };

  function pushEvent(type, detail = {}) {
    const event = { tick: state.tick, runTick: state.runTicks, type, ...detail };
    if (__GAMEYARD_TESTKIT__) {
      testkitEventBuffer.push(event);
      if (testkitEventBuffer.length > 2048) testkitEventBuffer.shift();
    }
    emitEvent({ ...event });
    if (type === "audio") emitCue(detail.cue);
  }

  function uiSnapshot() {
    const timer = Math.max(0, Math.ceil(state.modeTimer));
    const stageLabel =
      state.mode === "story"
        ? `ACT ${state.stage + 1}`
        : state.mode === "rush"
          ? `${Math.floor(timer / 60)}:${String(timer % 60).padStart(2, "0")}`
          : `SECTOR ${Math.floor(state.runTicks / (70 * 60)) + 1}`;
    const threat =
      state.rank < 0.33
        ? "LOW"
        : state.rank < 0.55
          ? "RISING"
          : state.rank < 0.76
            ? "HIGH"
            : "FATAL";
    return {
      screen: state.screen,
      mode: state.mode,
      selectedMode: state.selectedMode,
      stage: state.stage + 1,
      stageLabel,
      score: Math.floor(state.score),
      chain: multiplier(),
      drive: Math.floor(state.drive),
      driveReady: state.drive >= 99.5 && state.overdrive <= 0,
      shield: state.shield,
      maxShield: state.maxShield,
      rank: Number(state.rank.toFixed(2)),
      threat,
      hypeGrade: hypeGrade(state.chain, state.overdrive),
      danger: state.screen === "playing" ? state.danger : 0,
      boss:
        state.boss === null
          ? null
          : {
              name: state.boss.name,
              phase: state.boss.phaseIndex + 1,
              health: state.boss.hp,
              maxHealth: state.boss.maxHp,
            },
      timer,
      profile: deepCopy(profile),
      upgrades: state.upgradeChoices.map((upgrade) => ({
        id: upgrade.id,
        name: upgrade.name,
        icon: upgrade.icon,
        accent: upgrade.accent,
        detail: upgrade.description,
        level: (state.upgradeLevels[upgrade.id] ?? 0) + 1,
      })),
      result: state.result === null ? null : { ...state.result },
    };
  }

  function projectIfDirty(force = false) {
    const snapshot = uiSnapshot();
    const encoded = JSON.stringify(snapshot);
    if (!force && encoded === lastProjection) return;
    lastProjection = encoded;
    project(snapshot);
  }

  function resetRun(mode) {
    if (!MODES.has(mode)) throw new RangeError(`Unsupported Neon mode: ${mode}`);
    if (mode === "endless" && !profile.unlockedEndless) throw new Error("Endless mode is locked.");
    state.screen = "playing";
    state.sequenceLock = false;
    state.pendingAction = null;
    state.pendingTicks = 0;
    state.hitStopTicks = 0;
    state.mode = mode;
    state.selectedMode = mode;
    state.stage = 0;
    state.elapsed = 0;
    state.runTicks = 0;
    state.storyDirectorTicks = 0;
    state.endlessDirectorTicks = 0;
    state.modeTimer = mode === "rush" ? 180 : 0;
    state.director = createDirectorState(0);
    state.score = 0;
    state.chain = 0;
    state.chainHold = 0;
    state.maxChain = 1;
    state.drive = 0;
    state.driveReadyTime = 0;
    state.drivePrompted = false;
    state.overdrive = 0;
    state.overdriveMax = 0;
    state.overdriveGuard = false;
    state.shield = 3;
    state.maxShield = 3;
    state.rank = mode === "rush" ? 0.48 : mode === "endless" ? 0.42 : 0.22;
    state.rankTarget = state.rank;
    state.rankPenalty = 0;
    state.noHitTime = 0;
    state.tutorial = { moved: false, graze: false, autoFire: false };
    state.stats.bulletsCancelled = 0;
    state.kills = 0;
    state.graze = 0;
    state.hits = 0;
    state.bosses = 0;
    state.reboots = mode === "story" ? 4 : 0;
    state.stageMercyUsed = false;
    state.freeGuardUsed = false;
    state.firstDriveUsed = false;
    state.player = {
      x: 270,
      y: 788,
      prevX: 270,
      prevY: 788,
      radius: 4,
      invulnerable: 2,
      shotClock: 0,
      missileClock: 0,
      power: 1,
      focus: false,
      vx: 0,
      vy: 0,
      tilt: 0,
      moveDistance: 0,
      auraPulse: 0,
    };
    clearIntoPool(state.enemies, pools.enemies);
    clearIntoPool(state.playerBullets, pools.playerBullets);
    clearIntoPool(state.enemyBullets, pools.enemyBullets);
    clearIntoPool(state.particles, pools.particles);
    clearIntoPool(state.pickups, pools.pickups);
    clearIntoPool(state.lasers, pools.lasers);
    state.floaters.length = 0;
    state.danger = 0;
    state.flash = null;
    state.shake = 0;
    state.banner =
      mode === "story"
        ? { titleId: "act", detailId: "stage0", value: 1, time: 3.1, maxTime: 3.1 }
        : mode === "rush"
          ? { titleId: "rush", detailId: "noBrakes", value: 180, time: 3.1, maxTime: 3.1 }
          : {
              titleId: "endless",
              detailId: "rankNeverSleeps",
              value: 0,
              time: 3.1,
              maxTime: 3.1,
            };
    state.worldPrompt = null;
    state.boss = null;
    state.upgradeChoices.length = 0;
    state.upgradeLevels = {};
    state.mods = createDefaultModifiers();
    state.result = null;
    pushEvent("scene.changed", { scene: "playing" });
    pushEvent("run.started", { mode });
    pushEvent("audio", { cue: "select" });
    projectIfDirty(true);
  }

  function recycle(array, index, pool) {
    const removed = array[index];
    const tail = array.pop();
    if (index < array.length) array[index] = tail;
    pool.push(removed);
  }

  function clearIntoPool(array, pool) {
    while (array.length > 0) pool.push(array.pop());
  }

  function spawnEnemy(type = "scout", options = {}) {
    const created = createEnemyState({ type, options, stageIndex: state.stage, rng });
    const enemy = Object.assign(pools.enemies.pop() ?? {}, created, {
      id: nextEntityId++,
      prevX: created.x,
      prevY: created.y,
    });
    state.enemies.push(enemy);
    return enemy;
  }

  function spawnEnemyBullet(options) {
    if (state.enemyBullets.length >= 2600) return null;
    const created = createEnemyBullet(options);
    const bullet = Object.assign(pools.enemyBullets.pop() ?? {}, created, {
      id: nextEntityId++,
    });
    state.enemyBullets.push(bullet);
    return bullet;
  }

  function spawnPlayerBullet(options) {
    if (state.playerBullets.length >= 420) return null;
    const bullet = Object.assign(pools.playerBullets.pop() ?? {}, options, {
      id: nextEntityId++,
      prevX: options.x,
      prevY: options.y,
      age: 0,
      target: null,
      rotation: Math.atan2(options.vy, options.vx) + Math.PI / 2,
    });
    state.playerBullets.push(bullet);
    return bullet;
  }

  function spawnParticle(options) {
    const particleLimit = Math.max(160, Math.floor(950 * state.gameSettings.fxDensity));
    if (state.particles.length >= particleLimit) return null;
    const particle = Object.assign(pools.particles.pop() ?? {}, options, {
      id: nextEntityId++,
      maxLife: options.life,
      rotation: options.rotation ?? fxRng.range(0, Math.PI * 2),
      spin: options.spin ?? fxRng.range(-5, 5),
      drag: options.drag ?? 0,
      gravity: options.gravity ?? 0,
      alpha: options.alpha ?? 1,
      targetRadius: options.targetRadius ?? 0,
      lineWidth: options.lineWidth ?? 2,
    });
    state.particles.push(particle);
    return particle;
  }

  function spawnRingParticle(x, y, targetRadius, color, life, lineWidth) {
    return spawnParticle({
      x,
      y,
      vx: 0,
      vy: 0,
      life,
      size: 1,
      color,
      type: "ring",
      targetRadius,
      lineWidth,
      alpha: 1,
    });
  }

  function spawnPickup(options) {
    if (state.pickups.length >= 220) return null;
    const pickup = Object.assign(pools.pickups.pop() ?? {}, createPickup({ options, rng }), {
      id: nextEntityId++,
    });
    state.pickups.push(pickup);
    return pickup;
  }

  function spawnLaser(options) {
    if (state.lasers.length >= 24) return null;
    const laser = Object.assign(pools.lasers.pop() ?? {}, createLaser(options), {
      id: nextEntityId++,
    });
    state.lasers.push(laser);
    pushEvent("audio", { cue: "warning" });
    return laser;
  }

  function setPendingSequence(action, ticks) {
    if (!Object.hasOwn(PENDING_SEQUENCE_TICKS, action)) {
      throw new RangeError(`Unknown Neon pending sequence: ${action}`);
    }
    if (ticks !== PENDING_SEQUENCE_TICKS[action]) {
      throw new RangeError(`Neon pending sequence ${action} has an invalid duration.`);
    }
    if (state.pendingAction !== null) throw new Error("Neon pending sequence is already active.");
    state.sequenceLock = true;
    state.pendingAction = action;
    state.pendingTicks = ticks;
  }

  function advancePendingSequence() {
    if (state.pendingAction === null) return;
    state.pendingTicks -= 1;
    if (state.pendingTicks > 0) return;
    const action = state.pendingAction;
    state.pendingAction = null;
    state.pendingTicks = 0;
    state.sequenceLock = false;
    switch (action) {
      case "storyUpgrade":
        showUpgrade();
        break;
      case "storyVictory":
        finish(true, "RITUAL COMPLETE");
        break;
      case "modeResume":
        state.director.waveClock = 1.2;
        if (state.mode === "rush") {
          pushEvent("mode.resumed", { mode: "rush", bosses: state.bosses });
        } else if (state.mode === "endless") {
          state.stage = (state.stage + 1) % 3;
          pushEvent("mode.resumed", {
            mode: "endless",
            sector: state.director.endlessBossesSpawned + 1,
          });
        } else {
          throw new Error("Mode resume sequence requires Rush or Endless.");
        }
        projectIfDirty();
        break;
      case "runDefeat":
        finish(false, "SIGNAL LOST");
        break;
      default:
        throw new RangeError("Unknown Neon pending sequence reached execution.");
    }
  }

  function spawnBoss(id = state.stage, challenge = false) {
    if (!Number.isSafeInteger(id) || id < 0 || id > 2)
      throw new RangeError("Boss id must be 0, 1, or 2.");
    if (typeof challenge !== "boolean") throw new TypeError("Boss challenge must be boolean.");
    state.boss = createBossState({
      id,
      mode: state.mode,
      runTime: state.elapsed,
      statsHits: state.hits,
      challenge,
    });
    state.boss.prevX = state.boss.x;
    state.boss.prevY = state.boss.y;
    clearIntoPool(state.enemies, pools.enemies);
    cancelBullets(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 1200, "transition", true);
    clearIntoPool(state.lasers, pools.lasers);
    state.banner = {
      titleId: "warning",
      detailId: `boss${id}`,
      value: id,
      time: 2.2,
      maxTime: 2.2,
    };
    state.flash = { color: state.boss.color, amount: 0.18 };
    pushEvent("boss.entered", { id });
    pushEvent("audio", { cue: "warning" });
    projectIfDirty();
  }

  function updatePlayer(dt) {
    const player = state.player;
    player.prevX = player.x;
    player.prevY = player.y;
    const input = state.input;
    player.invulnerable = Math.max(0, player.invulnerable - dt);
    player.auraPulse += dt;
    player.focus = input.focus;
    if (input.pointer !== null) {
      const responsiveness = input.focus ? 18 : 25;
      const maxSpeed = input.focus ? 260 : 620;
      const desiredVx = (input.pointer.x - player.x) * responsiveness;
      const desiredVy = (input.pointer.y - player.y) * responsiveness;
      const smoothing = 1 - Math.pow(0.00003, dt);
      player.vx += (clamp(desiredVx, -maxSpeed, maxSpeed) - player.vx) * smoothing;
      player.vy += (clamp(desiredVy, -maxSpeed, maxSpeed) - player.vy) * smoothing;
    } else if (Math.abs(input.x) + Math.abs(input.y) > 0.01) {
      const length = Math.hypot(input.x, input.y) || 1;
      const speed = input.focus ? 178 : 345;
      const smoothing = 1 - Math.pow(0.00008, dt);
      player.vx += ((input.x / length) * speed - player.vx) * smoothing;
      player.vy += ((input.y / length) * speed - player.vy) * smoothing;
    } else {
      const damping = Math.pow(0.0008, dt);
      player.vx *= damping;
      player.vy *= damping;
    }
    player.x = clamp(player.x + player.vx * dt, 24, WORLD_WIDTH - 24);
    player.y = clamp(player.y + player.vy * dt, 82, WORLD_HEIGHT - 54);
    player.moveDistance += Math.hypot(player.x - player.prevX, player.y - player.prevY);
    player.tilt += (clamp(player.vx / 430, -1, 1) - player.tilt) * (1 - Math.pow(0.002, dt));
    if (!state.tutorial.moved && player.moveDistance > 24) {
      state.tutorial.moved = true;
      if (!state.tutorial.autoFire) {
        state.tutorial.autoFire = true;
        pushEvent("tutorial.autoFire");
      }
    }
    player.shotClock -= dt;
    const overdriveActive = state.overdrive > 0;
    const fireInterval = (overdriveActive ? 0.045 : 0.082) / state.mods.fireRate;
    while (player.shotClock <= 0) {
      for (const shot of buildPlayerShotPattern({
        player,
        droneCount: state.mods.drones,
        overdriveActive,
      }))
        spawnPlayerBullet(shot);
      player.shotClock += fireInterval;
    }
    player.missileClock -= dt;
    const missileInterval = (overdriveActive ? 0.28 : 0.68) / state.mods.missileRate;
    if (player.missileClock <= 0) {
      player.missileClock += missileInterval;
      for (const missile of buildMissilePattern({
        player,
        missilePower: state.mods.missilePower,
        overdriveActive,
      }))
        spawnPlayerBullet(missile);
    }
    if (state.tick % (overdriveActive ? 1 : 2) === 0) {
      spawnParticle({
        x: player.x + fxRng.range(-5, 5),
        y: player.y + 17,
        vx: -player.vx * 0.08 + fxRng.range(-12, 12),
        vy: fxRng.range(115, 170),
        life: fxRng.range(0.24, 0.48),
        size: fxRng.range(2, 5),
        color: overdriveActive ? (fxRng.next() < 0.5 ? COLORS.pink : COLORS.cyan) : COLORS.cyan,
        type: "spark",
        drag: 1.4,
      });
    }
  }

  function updateDirector(dt) {
    state.elapsed = state.runTicks / 60;
    if (state.mode === "rush") {
      state.modeTimer = Math.max(0, (180 * 60 - state.runTicks) / 60);
      if (state.runTicks >= 180 * 60) {
        finish(true, "TIME COMPLETE");
        return;
      }
    }
    if (state.boss === null && !state.sequenceLock) {
      if (state.mode === "endless") {
        state.endlessDirectorTicks += 1;
        state.director.time = (state.endlessDirectorTicks - 1) / 60;
      } else if (state.mode === "story") {
        state.storyDirectorTicks += 1;
        state.director.time = (state.storyDirectorTicks - 1) / 60;
      } else {
        state.director.time = (state.runTicks - 1) / 60;
      }
    }
    stepDirector({
      state: state.director,
      dt,
      mode: state.mode,
      stageIndex: state.stage,
      modeTimer: state.modeTimer,
      sequenceLock: state.sequenceLock,
      bossActive: state.boss !== null,
      rng,
      ports: {
        spawnEnemy,
        clearEnemies(withExplosion) {
          if (withExplosion) {
            for (const enemy of state.enemies) {
              spawnExplosion(enemy.x, enemy.y, enemy.radius / 28, enemy.color);
            }
          }
          clearIntoPool(state.enemies, pools.enemies);
        },
        spawnBoss,
      },
    });
  }

  function updateEnemies(dt) {
    for (let index = state.enemies.length - 1; index >= 0; index -= 1) {
      const enemy = state.enemies[index];
      if (enemy.hp <= 0) {
        destroyEnemy(index);
        continue;
      }
      enemy.prevX = enemy.x;
      enemy.prevY = enemy.y;
      const expired = stepEnemyPattern({
        enemy,
        dt,
        rank: state.rank,
        player: state.player,
        rng,
        ports: { spawnEnemyBullet, spawnEnemy, spawnLaser },
      });
      if (expired) recycle(state.enemies, index, pools.enemies);
    }
    if (state.boss !== null) {
      const boss = state.boss;
      boss.prevX = boss.x;
      boss.prevY = boss.y;
      const result = stepBossPattern({
        boss,
        dt,
        rank: state.rank,
        player: state.player,
        rng,
        ports: { spawnEnemyBullet, spawnLaser },
      });
      if (result.phaseComplete) advanceBossPhase();
    }
  }

  function multiplier() {
    return (1 + state.chain * 0.04) * (state.overdrive > 0 ? 2 : 1);
  }

  function spawnExplosion(x, y, scale, color) {
    const particleCount = Math.floor((20 + scale * 18) * state.gameSettings.fxDensity);
    for (let index = 0; index < particleCount; index += 1) {
      const angle = fxRng.range(0, Math.PI * 2);
      const speed = fxRng.range(40, 270) * (0.7 + scale * 0.45);
      spawnParticle({
        x: x + fxRng.range(-4, 4),
        y: y + fxRng.range(-4, 4),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: fxRng.range(0.22, 0.72) * (0.75 + scale * 0.25),
        size: fxRng.range(1.5, 5.5) * (0.7 + scale * 0.24),
        color: index % 4 === 0 ? COLORS.white : index % 3 === 0 ? COLORS.gold : color,
        type: index % 5 === 0 ? "line" : "spark",
        drag: fxRng.range(1.2, 3.8),
      });
    }
    spawnRingParticle(x, y, 45 + scale * 38, color, 0.35 + scale * 0.08, 3 + scale);
  }

  function spawnRadialBurst(x, y, count, colorA, colorB) {
    if (![x, y, count].every(Number.isFinite) || count <= 0) {
      throw new RangeError("Neon radial burst requires finite geometry and positive count.");
    }
    if (typeof colorA !== "string" || typeof colorB !== "string") {
      throw new TypeError("Neon radial burst requires two explicit colors.");
    }
    const actual = Math.floor(count * state.gameSettings.fxDensity);
    for (let index = 0; index < actual; index += 1) {
      const angle = fxRng.range(0, Math.PI * 2);
      const speed = fxRng.range(80, 650);
      spawnParticle({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: fxRng.range(0.35, 1.1),
        size: fxRng.range(1.5, 6),
        color: index % 2 ? colorA : colorB,
        type: fxRng.next() < 0.24 ? "line" : "spark",
        drag: fxRng.range(1.2, 3.4),
      });
    }
    for (let index = 0; index < 4; index += 1) {
      spawnRingParticle(
        x,
        y,
        90 + index * 55,
        index % 2 ? colorA : colorB,
        0.55 + index * 0.1,
        4 - index * 0.5,
      );
    }
  }

  function destroyEnemy(index) {
    const enemy = state.enemies[index];
    const distance = Math.hypot(enemy.x - state.player.x, enemy.y - state.player.y);
    const rush = clamp(6 - Math.floor(Math.max(0, distance - 42) / 70), 1, 5);
    const scoreGain =
      enemy.score * (1 + (rush - 1) * (0.32 + state.mods.rushScore * 0.15)) * multiplier();
    state.score += Math.floor(scoreGain);
    state.kills += 1;
    state.drive = Math.min(100, state.drive + (1.8 + rush * 0.92) * state.mods.grazeGain);
    state.chain = Math.min(100, state.chain + 3.4 + rush * 1.12);
    state.chainHold = 1.25;
    state.maxChain = Math.max(state.maxChain, multiplier());
    spawnExplosion(enemy.x, enemy.y, enemy.radius / 22, enemy.color);
    state.floaters.push({
      x: enemy.x,
      y: enemy.y - enemy.radius,
      textId: "rush",
      value: rush,
      color: rush >= 4 ? COLORS.gold : enemy.color,
      size: 8 + rush,
      life: 0.75,
      maxLife: 0.75,
      vy: -55,
    });
    pushEvent("enemy.destroyed", { kind: enemy.type, score: Math.floor(state.score) });
    pushEvent("audio", {
      cue: enemy.type === "carrier" || enemy.type === "elite" ? "bigKill" : "kill",
    });
    state.shake = Math.max(
      state.shake,
      enemy.type === "carrier" || enemy.type === "elite" ? 7 : 2.5,
    );
    const targetPower =
      state.kills >= 125
        ? 5
        : state.kills >= 72
          ? 4
          : state.kills >= 34
            ? 3
            : state.kills >= 12
              ? 2
              : 1;
    if (targetPower > state.player.power) {
      state.player.power = targetPower;
      pushEvent("power.increased", { power: targetPower });
      pushEvent("audio", { cue: "phase" });
    }
    if (enemy.type === "carrier" || enemy.type === "elite") {
      for (let pickupIndex = 0; pickupIndex < 8; pickupIndex += 1) {
        spawnPickup({
          x: enemy.x + rng.range(-enemy.radius, enemy.radius),
          y: enemy.y + rng.range(-enemy.radius, enemy.radius),
          vx: rng.range(-110, 110),
          vy: rng.range(-220, -50),
          type: "score",
          value: 220,
        });
      }
    }
    if ((enemy.revenge || state.rank > 0.76) && enemy.type !== "scout") {
      emitRing({
        x: enemy.x,
        y: enemy.y,
        count: enemy.type === "carrier" || enemy.type === "elite" ? 10 : 5,
        speed: 125,
        offset: rng.range(0, Math.PI * 2),
        options: { color: COLORS.red, shape: "star", radius: 5.2, accel: 20 },
        rank: state.rank,
        ports: { spawnEnemyBullet },
      });
    }
    recycle(state.enemies, index, pools.enemies);
  }

  function pulseGuard(auto) {
    if (state.overdrive > 0) return false;
    const cost = auto ? state.mods.guardCost : Math.max(18, state.mods.guardCost - 3);
    if (state.drive < cost) return false;
    state.drive = Math.max(0, state.drive - cost);
    state.player.invulnerable = Math.max(state.player.invulnerable, auto ? 1.05 : 0.68);
    const radius = state.mods.guardRadius * (auto ? 1.08 : 1);
    const cancelled = cancelBullets(state.player.x, state.player.y, radius, "guard", false);
    damageEnemiesInRadius(state.player.x, state.player.y, radius * 0.88, 85 + cancelled * 0.8);
    state.chain = Math.min(100, state.chain + 8 + cancelled * 0.08);
    state.chainHold = 1.3;
    spawnRingParticle(
      state.player.x,
      state.player.y,
      radius,
      auto ? COLORS.gold : COLORS.cyan,
      0.5,
      5,
    );
    state.flash = { color: auto ? COLORS.gold : COLORS.cyan, amount: auto ? 0.22 : 0.14 };
    state.shake = Math.max(state.shake, auto ? 10 : 6);
    state.floaters.push({
      x: state.player.x,
      y: state.player.y - 44,
      textId: auto ? "autoSave" : "pulse",
      value: cancelled,
      color: auto ? COLORS.gold : COLORS.cyan,
      size: 15,
      life: 0.75,
      maxLife: 0.75,
      vy: -55,
    });
    pushEvent(auto ? "guard.auto" : "guard.pulse", { cancelled });
    pushEvent("audio", { cue: "pulse" });
    return true;
  }

  function damagePlayer() {
    if (state.player.invulnerable > 0) return;
    if (state.overdrive > 0 && state.overdriveGuard) {
      state.overdriveGuard = false;
      state.player.invulnerable = 1.1;
      state.overdrive = Math.max(1.1, state.overdrive - 1.5);
      const cancelled = cancelBullets(state.player.x, state.player.y, 205, "guard", false);
      damageEnemiesInRadius(state.player.x, state.player.y, 190, 110 + cancelled);
      spawnRingParticle(state.player.x, state.player.y, 205, COLORS.gold, 0.55, 6);
      state.floaters.push({
        x: state.player.x,
        y: state.player.y - 50,
        textId: "breakGuard",
        value: cancelled,
        color: COLORS.gold,
        size: 16,
        life: 0.75,
        maxLife: 0.75,
        vy: -55,
      });
      state.flash = { color: COLORS.gold, amount: 0.28 };
      state.shake = Math.max(state.shake, 10);
      pushEvent("audio", { cue: "pulse" });
      return;
    }
    if (state.gameSettings.autoGuard && !state.stageMercyUsed) {
      state.stageMercyUsed = true;
      state.player.invulnerable = 1.15;
      const cancelled = cancelBullets(state.player.x, state.player.y, 188, "guard", false);
      damageEnemiesInRadius(state.player.x, state.player.y, 170, 90 + cancelled * 0.7);
      spawnRingParticle(state.player.x, state.player.y, 188, COLORS.cyan, 0.52, 5);
      state.floaters.push({
        x: state.player.x,
        y: state.player.y - 50,
        textId: "firstSave",
        value: cancelled,
        color: COLORS.cyan,
        size: 15,
        life: 0.75,
        maxLife: 0.75,
        vy: -55,
      });
      state.flash = { color: COLORS.cyan, amount: 0.2 };
      state.shake = Math.max(state.shake, 8);
      pushEvent("guard.firstSave");
      pushEvent("audio", { cue: "pulse" });
      projectIfDirty();
      return;
    }
    if (state.mods.freeGuard && !state.freeGuardUsed) {
      state.freeGuardUsed = true;
      state.player.invulnerable = 1.35;
      cancelBullets(state.player.x, state.player.y, 260, "guard", false);
      damageEnemiesInRadius(state.player.x, state.player.y, 240, 180);
      spawnRingParticle(state.player.x, state.player.y, 260, COLORS.green, 0.58, 6);
      spawnRadialBurst(state.player.x, state.player.y, 60, COLORS.green, COLORS.cyan);
      state.floaters.push({
        x: state.player.x,
        y: state.player.y - 50,
        textId: "rebootGuard",
        value: 1,
        color: COLORS.green,
        size: 16,
        life: 0.75,
        maxLife: 0.75,
        vy: -55,
      });
      state.flash = { color: COLORS.green, amount: 0.32 };
      state.shake = Math.max(state.shake, 12);
      pushEvent("audio", { cue: "pulse" });
      projectIfDirty();
      return;
    }
    if (state.gameSettings.autoGuard && state.overdrive <= 0 && pulseGuard(true)) {
      projectIfDirty();
      return;
    }
    state.shield -= 1;
    state.hits += 1;
    state.noHitTime = 0;
    state.rankPenalty = Math.min(0.42, state.rankPenalty + 0.15);
    state.chain *= clamp(0.28 + state.mods.chainRetention, 0.2, 0.72);
    state.chainHold = 0.7;
    state.drive = Math.max(18, state.drive * 0.68);
    state.player.invulnerable = 2.25;
    state.player.vx *= -0.3;
    state.player.vy = 120;
    cancelBullets(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 1200, "hit", true);
    clearIntoPool(state.lasers, pools.lasers);
    spawnRingParticle(state.player.x, state.player.y, 190, COLORS.red, 0.6, 7);
    spawnRadialBurst(state.player.x, state.player.y, 80, COLORS.red, COLORS.white);
    state.flash = { color: COLORS.red, amount: 0.62 };
    state.shake = Math.max(state.shake, 21);
    state.hitStopTicks = Math.max(state.hitStopTicks, HIT_STOP_TICKS.playerHit);
    state.floaters.push({
      x: state.player.x,
      y: state.player.y - 54,
      textId: "shieldBreak",
      value: state.shield,
      color: COLORS.red,
      size: 17,
      life: 0.75,
      maxLife: 0.75,
      vy: -55,
    });
    pushEvent("player.hit", { shield: state.shield });
    pushEvent("audio", { cue: "hit" });
    if (state.shield <= 0) {
      if (state.mode === "story" && state.reboots > 0) {
        state.reboots -= 1;
        state.shield = state.maxShield;
        state.score = Math.floor(state.score * 0.9);
        state.chain *= 0.2;
        state.rankPenalty = Math.min(0.5, state.rankPenalty + 0.16);
        state.player.invulnerable = 3.2;
        state.drive = 100;
        state.banner = {
          titleId: "rageReboot",
          detailId: "reserve",
          value: state.reboots,
          time: 1.8,
          maxTime: 1.8,
        };
        pushEvent("player.rebooted", { remaining: state.reboots });
        activateOverdrive(true);
      } else {
        state.shield = 0;
        setPendingSequence("runDefeat", PENDING_SEQUENCE_TICKS.runDefeat);
        projectIfDirty();
      }
    }
    projectIfDirty();
  }

  function findNearestTarget(x, y) {
    let target = state.boss;
    let bestDistance = target === null ? Infinity : distanceSquared({ x, y }, target);
    for (const enemy of state.enemies) {
      if (enemy.hp <= 0) continue;
      const distance = distanceSquared({ x, y }, enemy);
      if (distance < bestDistance) {
        target = enemy;
        bestDistance = distance;
      }
    }
    return target;
  }

  function damageEnemiesInRadius(x, y, radius, damage) {
    const radiusSquared = radius * radius;
    for (const enemy of state.enemies) {
      if (distanceSquared({ x, y }, enemy) <= radiusSquared + enemy.radius * enemy.radius) {
        enemy.hp -= damage;
      }
    }
    if (
      state.boss !== null &&
      distanceSquared({ x, y }, state.boss) <= radiusSquared + state.boss.radius * state.boss.radius
    ) {
      state.boss.hp -= damage;
    }
  }

  function onGraze(bullet) {
    const gain = (1.2 + bullet.radius * 0.08) * state.mods.grazeGain;
    if (state.overdrive <= 0) state.drive = Math.min(100, state.drive + gain);
    else
      state.overdrive = Math.min(
        state.overdriveMax + 2.2,
        state.overdrive + 0.022 * state.mods.grazeGain,
      );
    state.chain = Math.min(100, state.chain + 1.05 + state.mods.arcLevel * 0.05);
    state.chainHold = Math.max(state.chainHold, 0.72);
    state.score += Math.floor((85 + bullet.radius * 12) * multiplier());
    state.graze += 1;
    state.player.auraPulse = 0;
    if (!state.tutorial.graze) {
      state.tutorial.graze = true;
      pushEvent("tutorial.closeCall");
    }
    pushEvent("audio", { cue: "graze" });
    const grazeAngle = Math.atan2(state.player.y - bullet.y, state.player.x - bullet.x);
    for (let index = 0; index < Math.ceil(3 * state.gameSettings.fxDensity); index += 1) {
      const angle = grazeAngle + fxRng.range(-0.8, 0.8);
      const speed = fxRng.range(50, 180);
      spawnParticle({
        x: state.player.x + Math.cos(grazeAngle) * 12,
        y: state.player.y + Math.sin(grazeAngle) * 12,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: fxRng.range(0.18, 0.38),
        size: fxRng.range(1.5, 4),
        color: bullet.color,
        type: "line",
        drag: 2.1,
      });
    }
    const arc = arcTrigger({ grazeCount: state.graze, arcLevel: state.mods.arcLevel });
    if (arc.triggered) {
      const target = findNearestTarget(state.player.x, state.player.y);
      if (target !== null) {
        target.hp -= arc.damage;
        const particles = buildArcParticles({
          x1: state.player.x,
          y1: state.player.y,
          x2: target.x,
          y2: target.y,
          level: state.mods.arcLevel,
          rng: fxRng,
        });
        for (const particle of particles) spawnParticle(particle);
      }
    }
  }

  function updatePlayerBullets(dt) {
    for (let index = state.playerBullets.length - 1; index >= 0; index -= 1) {
      const bullet = state.playerBullets[index];
      bullet.age += dt;
      bullet.life -= dt;
      bullet.prevX = bullet.x;
      bullet.prevY = bullet.y;
      if (bullet.type === "missile") {
        if (bullet.target === null || bullet.target.hp <= 0 || bullet.age % 0.18 < dt) {
          bullet.target = findNearestTarget(bullet.x, bullet.y);
        }
        if (bullet.target !== null)
          Object.assign(bullet, steerMissile({ missile: bullet, target: bullet.target, dt }));
        if (Math.floor(bullet.age * 30) % 2 === 0) {
          spawnParticle({
            x: bullet.x,
            y: bullet.y + 5,
            vx: fxRng.range(-18, 18),
            vy: fxRng.range(30, 90),
            life: fxRng.range(0.14, 0.28),
            size: fxRng.range(1.5, 3.2),
            color: COLORS.gold,
            type: "spark",
            drag: 1.8,
          });
        }
      }
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      if (
        bullet.life <= 0 ||
        bullet.x < -45 ||
        bullet.x > WORLD_WIDTH + 45 ||
        bullet.y < -70 ||
        bullet.y > WORLD_HEIGHT + 70
      ) {
        recycle(state.playerBullets, index, pools.playerBullets);
        continue;
      }
      let hit = null;
      if (
        state.boss !== null &&
        segmentCircleHit(
          bullet.prevX,
          bullet.prevY,
          bullet.x,
          bullet.y,
          state.boss.x,
          state.boss.y,
          state.boss.radius + bullet.radius,
        )
      ) {
        hit = state.boss;
      } else {
        for (let enemyIndex = state.enemies.length - 1; enemyIndex >= 0; enemyIndex -= 1) {
          const enemy = state.enemies[enemyIndex];
          if (
            segmentCircleHit(
              bullet.prevX,
              bullet.prevY,
              bullet.x,
              bullet.y,
              enemy.x,
              enemy.y,
              enemy.radius + bullet.radius,
            )
          ) {
            hit = enemy;
            break;
          }
        }
      }
      if (hit !== null) {
        const proximity =
          1 - clamp(Math.hypot(state.player.x - hit.x, state.player.y - hit.y) / 250, 0, 1);
        const damage = bullet.damage * (1 + state.mods.closeDamage * proximity);
        if (bullet.type === "missile") {
          const impact = missileImpact({
            baseDamage: damage,
            missilePower: state.mods.missilePower,
          });
          damageEnemiesInRadius(bullet.x, bullet.y, impact.splashRadius, impact.splashDamage);
          hit.hp -= impact.directDamage;
          spawnExplosion(bullet.x, bullet.y, impact.explosionScale, COLORS.gold);
          state.shake = Math.max(state.shake, 2.6);
          recycle(state.playerBullets, index, pools.playerBullets);
          continue;
        }
        hit.hp -= damage;
        if (hit === state.boss && rng.next() < 0.18) {
          state.hitStopTicks = Math.max(state.hitStopTicks, 1);
        }
        spawnParticle({
          x: bullet.x,
          y: bullet.y,
          vx: fxRng.range(-55, 55),
          vy: fxRng.range(-80, 35),
          life: fxRng.range(0.08, 0.18),
          size: fxRng.range(1.5, 3.5),
          color: bullet.color,
          type: "spark",
          drag: 2.2,
        });
        if (rng.next() < 0.12) pushEvent("audio", { cue: "shotAccent" });
        if (bullet.pierce > 0) {
          bullet.pierce -= 1;
          bullet.damage *= 0.72;
          bullet.x += bullet.vx * 0.012;
          bullet.y += bullet.vy * 0.012;
        } else {
          recycle(state.playerBullets, index, pools.playerBullets);
          continue;
        }
      }
    }
  }

  function updateEnemyBullets(dt) {
    for (let index = state.enemyBullets.length - 1; index >= 0; index -= 1) {
      const bullet = state.enemyBullets[index];
      const expired = stepEnemyBullet({
        bullet,
        dt,
        rank: state.rank,
        overdriveActive: state.overdrive > 0,
        ports: { spawnEnemyBullet },
      });
      if (expired) {
        recycle(state.enemyBullets, index, pools.enemyBullets);
        continue;
      }
      if (bullet.delay > 0) continue;
      const hitRadius = state.player.radius + Math.min(4.8, bullet.radius * 0.48);
      if (
        segmentCircleHit(
          bullet.prevX,
          bullet.prevY,
          bullet.x,
          bullet.y,
          state.player.x,
          state.player.y,
          hitRadius,
        ) &&
        state.player.invulnerable <= 0
      ) {
        damagePlayer();
        return;
      } else if (
        !bullet.grazed &&
        distanceSquared(bullet, state.player) <=
          (state.mods.grazeRadius + bullet.radius * 0.72) ** 2
      ) {
        bullet.grazed = true;
        onGraze(bullet);
      }
    }
  }

  function updateSecondaryEntities(dt) {
    for (let index = state.lasers.length - 1; index >= 0; index -= 1) {
      const laser = state.lasers[index];
      if (stepLaser(laser, dt)) {
        recycle(state.lasers, index, pools.lasers);
        continue;
      }
      if (laser.age >= laser.warning && state.player.invulnerable <= 0) {
        const segment = laserSegment(laser);
        if (
          pointSegmentDistance(
            state.player.x,
            state.player.y,
            segment.x1,
            segment.y1,
            segment.x2,
            segment.y2,
          ) <=
          laser.width / 2 + state.player.radius
        ) {
          damagePlayer();
          if (state.screen !== "playing") return;
        }
      }
    }
    for (let index = state.pickups.length - 1; index >= 0; index -= 1) {
      const pickup = state.pickups[index];
      const result = stepPickup({ pickup, player: state.player, dt });
      if (result.collected) {
        if (pickup.type === "drive" && state.overdrive <= 0) {
          state.drive = Math.min(100, state.drive + 0.45);
        }
        state.score += Math.floor(pickup.value * multiplier());
        recycle(state.pickups, index, pools.pickups);
      } else if (result.expired) recycle(state.pickups, index, pools.pickups);
    }
    updateParticles(dt);
    updateFloaters(dt);
  }

  function updateContactDanger() {
    for (const enemy of state.enemies) {
      if (
        enemy.contactDamage &&
        state.player.invulnerable <= 0 &&
        distanceSquared(state.player, enemy) <= (state.player.radius + enemy.radius * 0.72) ** 2
      ) {
        damagePlayer();
        enemy.hp -= enemy.maxHp * 0.34;
        return;
      }
    }
    if (
      state.boss !== null &&
      state.player.invulnerable <= 0 &&
      distanceSquared(state.player, state.boss) <=
        (state.player.radius + state.boss.radius * 0.72) ** 2
    ) {
      damagePlayer();
    }
  }

  function calculateDanger() {
    let proximity = 0;
    for (const bullet of state.enemyBullets) {
      if (bullet.delay > 0) continue;
      const distance = Math.sqrt(distanceSquared(state.player, bullet));
      if (distance < 70 + bullet.radius) proximity = Math.max(proximity, 1 - distance / 75);
    }
    for (const laser of state.lasers) {
      if (laser.age < laser.warning) continue;
      const segment = laserSegment(laser);
      const distance = pointSegmentDistance(
        state.player.x,
        state.player.y,
        segment.x1,
        segment.y1,
        segment.x2,
        segment.y2,
      );
      proximity = Math.max(proximity, 1 - distance / (laser.width * 2.6));
    }
    return clamp(proximity * 0.5, 0, 0.52);
  }

  function updateParticles(dt) {
    for (let index = state.particles.length - 1; index >= 0; index -= 1) {
      const particle = state.particles[index];
      particle.life -= dt;
      particle.rotation += particle.spin * dt;
      if (particle.type !== "ring") {
        const damping = Math.exp(-particle.drag * dt);
        particle.vx *= damping;
        particle.vy = particle.vy * damping + particle.gravity * dt;
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
      }
      if (particle.life <= 0) recycle(state.particles, index, pools.particles);
    }
  }

  function updateFloaters(dt) {
    for (let index = state.floaters.length - 1; index >= 0; index -= 1) {
      const floater = state.floaters[index];
      floater.life -= dt;
      floater.y += floater.vy * dt;
      floater.vy *= Math.pow(0.06, dt);
      if (floater.life <= 0) state.floaters.splice(index, 1);
    }
  }

  function updateScoring(dt) {
    state.noHitTime += dt;
    if (state.overdrive > 0) {
      state.chain = Math.max(state.chain, 70);
      state.chainHold = Math.max(state.chainHold, 0.4);
    } else {
      state.drive = Math.min(
        100,
        state.drive +
          ((state.boss === null ? 0.48 : 0.72) + (state.firstDriveUsed ? 0 : 0.42)) * dt,
      );
      if (!state.firstDriveUsed && state.elapsed > 12) {
        const firstPeakFloor = clamp(((state.elapsed - 12) / 8) * 100, 0, 100);
        state.drive = Math.max(state.drive, firstPeakFloor);
      }
      if (state.chainHold > 0) state.chainHold -= dt;
      else state.chain = Math.max(0, state.chain - 9.8 * state.mods.chainDecay * dt);
    }
    const stageBase =
      state.mode === "story"
        ? 0.2 + state.stage * 0.1
        : state.mode === "rush"
          ? 0.46 + ((180 - state.modeTimer) / 180) * 0.24
          : 0.4 + Math.min(0.35, (state.elapsed / 360) * 0.35);
    const performance = clamp(
      (state.chain / 100) * 0.22 + (state.noHitTime / 90) * 0.14 + (state.overdrive > 0 ? 0.09 : 0),
      0,
      0.38,
    );
    state.rankPenalty = Math.max(0, state.rankPenalty - dt * 0.014);
    state.rankTarget = clamp(stageBase + performance - state.rankPenalty, 0.16, 1);
    state.rank += (state.rankTarget - state.rank) * (1 - Math.pow(0.16, dt));
    state.maxChain = Math.max(state.maxChain, multiplier());
    if (state.drive >= 100 && state.overdrive <= 0) {
      state.driveReadyTime += dt;
      if (!state.drivePrompted) {
        state.drivePrompted = true;
        state.worldPrompt = {
          textId: "drop",
          value: 100,
          time: 3.2,
          maxTime: 3.2,
          color: COLORS.pink,
        };
        pushEvent("audio", { cue: "driveReady" });
      }
      if (!state.firstDriveUsed && state.driveReadyTime > 2.45) activateOverdrive(true);
    } else {
      state.driveReadyTime = 0;
    }
  }

  function updateProjectiles(dt) {
    updatePlayerBullets(dt);
    updateEnemyBullets(dt);
    updateSecondaryEntities(dt);
    updateContactDanger();
    updateScoring(dt);
    state.danger = calculateDanger();
  }

  function updatePresentation(dt) {
    if (state.flash !== null) {
      state.flash.amount = Math.max(0, state.flash.amount - dt * 2.8);
      if (state.flash.amount === 0) state.flash = null;
    }
    state.shake = Math.max(0, state.shake - dt * 26);
    if (state.banner !== null) {
      state.banner.time = Math.max(0, state.banner.time - dt);
      if (state.banner.time === 0) state.banner = null;
    }
    if (state.worldPrompt !== null) {
      state.worldPrompt.time = Math.max(0, state.worldPrompt.time - dt);
      if (state.worldPrompt.time === 0) state.worldPrompt = null;
    }
  }

  function advanceBossPhase() {
    if (state.boss === null) return;
    const boss = state.boss;
    const phase = boss.phases[boss.phaseIndex];
    const noHit = state.hits === boss.phaseStartHits;
    const timeRatio = clamp(1 - boss.phaseAge / phase.duration, 0, 1);
    const phaseBonus =
      (24_000 + boss.phaseIndex * 8_000) * (1 + timeRatio * 2) * (noHit ? 1.6 : 1) * multiplier();
    state.score += Math.floor(phaseBonus);
    cancelBullets(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 1200, "phase", true);
    clearIntoPool(state.lasers, pools.lasers);
    spawnExplosion(boss.x, boss.y, 2.2, boss.color);
    spawnRadialBurst(boss.x, boss.y, 95, boss.color, COLORS.gold);
    state.flash = { color: COLORS.white, amount: 0.46 };
    state.shake = Math.max(state.shake, 19);
    state.hitStopTicks = Math.max(state.hitStopTicks, HIT_STOP_TICKS.bossPhase);
    state.shield = Math.min(state.maxShield, state.shield + 1);
    state.floaters.push({
      x: boss.x,
      y: boss.y - 70,
      textId: noHit ? "noHitBreak" : boss.phaseTimeout ? "timeBreak" : "phaseBreak",
      value: noHit ? 2 : boss.phaseTimeout ? 1 : 0,
      color: noHit ? COLORS.gold : boss.color,
      size: 17,
      life: 0.75,
      maxLife: 0.75,
      vy: -55,
    });
    pushEvent("boss.phase.completed", {
      id: boss.id,
      phase: boss.phaseIndex,
      noHit,
      timedOut: boss.phaseTimeout,
      bonus: Math.floor(phaseBonus),
    });
    pushEvent("audio", { cue: "bigKill" });
    if (boss.phaseIndex + 1 >= boss.phases.length) {
      defeatBoss();
      return;
    }
    pushEvent("audio", { cue: "phase" });
    const nextPhase = boss.phaseIndex + 1;
    resetBossPhase({ boss, phaseIndex: nextPhase, statsHits: state.hits, runTime: state.elapsed });
    state.banner = {
      titleId: "phase",
      detailId: `boss${boss.id}`,
      value: nextPhase + 1,
      time: 1.65,
      maxTime: 1.65,
    };
    state.flash = { color: boss.color, amount: 0.22 };
    projectIfDirty();
  }

  function defeatBoss() {
    if (state.boss === null) return;
    const boss = state.boss;
    const id = boss.id;
    state.score += Math.floor((90_000 + id * 65_000) * multiplier());
    state.bosses += 1;
    cancelBullets(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 1200, "boss", true);
    clearIntoPool(state.lasers, pools.lasers);
    for (let index = 0; index < 12; index += 1) {
      const angle = (index / 12) * Math.PI * 2;
      spawnExplosion(
        boss.x + Math.cos(angle) * fxRng.range(30, 130),
        boss.y + Math.sin(angle) * fxRng.range(30, 100),
        fxRng.range(0.7, 1.4),
        index % 2 ? boss.color : COLORS.gold,
      );
    }
    spawnRadialBurst(boss.x, boss.y, 170, boss.color, COLORS.gold);
    state.flash = { color: COLORS.white, amount: 0.85 };
    state.shake = Math.max(state.shake, 28);
    state.hitStopTicks = Math.max(state.hitStopTicks, HIT_STOP_TICKS.bossDefeat);
    state.banner = {
      titleId: "bossErased",
      detailId: `boss${id}`,
      value: id,
      time: 2.2,
      maxTime: 2.2,
    };
    state.boss = null;
    pushEvent("boss.destroyed", { id });
    pushEvent("audio", { cue: "victory" });
    if (state.mode === "story" && state.stage < 2) {
      setPendingSequence("storyUpgrade", PENDING_SEQUENCE_TICKS.storyUpgrade);
    } else if (state.mode === "story") {
      setPendingSequence("storyVictory", PENDING_SEQUENCE_TICKS.storyVictory);
    } else {
      setPendingSequence("modeResume", PENDING_SEQUENCE_TICKS.modeResume);
    }
    projectIfDirty();
  }

  function presentUpgradeChoices(choices) {
    if (!Array.isArray(choices) || choices.length !== 3 || new Set(choices).size !== 3) {
      throw new TypeError("Neon upgrade presentation requires three unique catalog entries.");
    }
    state.upgradeChoices = [...choices];
    state.screen = "upgrade";
    state.danger = 0;
    state.sequenceLock = true;
    pushEvent("scene.changed", { scene: "upgrade" });
    pushEvent("upgrade.offered", { ids: state.upgradeChoices.map((choice) => choice.id) });
    pushEvent("audio", { cue: "phase" });
    projectIfDirty();
  }

  function showUpgrade() {
    const pool = UPGRADES.filter((upgrade) => (state.upgradeLevels[upgrade.id] ?? 0) < upgrade.max);
    if (pool.length < 3)
      throw new Error("Neon upgrade catalog has fewer than three eligible cards.");
    const choices = [];
    while (choices.length < 3) {
      choices.push(pool.splice(rng.integer(0, pool.length - 1), 1)[0]);
    }
    presentUpgradeChoices(choices);
  }

  function chooseUpgrade(index) {
    if (state.screen !== "upgrade") throw new Error("No upgrade selection is active.");
    if (!Number.isSafeInteger(index) || index < 0 || index >= state.upgradeChoices.length) {
      throw new RangeError("Upgrade index must select a visible card.");
    }
    const choice = state.upgradeChoices[index];
    const applied = applyUpgrade({
      upgradeId: choice.id,
      currentLevel: state.upgradeLevels[choice.id] ?? 0,
      modifiers: state.mods,
      shield: state.shield,
      maxShield: state.maxShield,
    });
    state.upgradeLevels[choice.id] = applied.level;
    state.mods = applied.modifiers;
    state.shield = applied.shield;
    state.maxShield = applied.maxShield;
    state.stage += 1;
    state.stageMercyUsed = false;
    state.freeGuardUsed = false;
    state.storyDirectorTicks = 0;
    state.director = createDirectorState(state.stage);
    clearIntoPool(state.enemies, pools.enemies);
    clearIntoPool(state.playerBullets, pools.playerBullets);
    clearIntoPool(state.enemyBullets, pools.enemyBullets);
    clearIntoPool(state.pickups, pools.pickups);
    clearIntoPool(state.lasers, pools.lasers);
    clearIntoPool(state.particles, pools.particles);
    clearIntoPool(state.pickups, pools.pickups);
    clearIntoPool(state.lasers, pools.lasers);
    state.floaters.length = 0;
    state.player.x = WORLD_WIDTH / 2;
    state.player.y = WORLD_HEIGHT * 0.82;
    state.player.prevX = state.player.x;
    state.player.prevY = state.player.y;
    state.player.vx = 0;
    state.player.vy = 0;
    state.player.invulnerable = 2.7;
    state.player.power = Math.max(state.player.power, 1 + state.stage);
    state.player.shotClock = 0;
    state.player.missileClock = 0;
    state.drive = Math.max(state.drive, 22);
    state.chain = Math.min(state.chain, 45);
    state.chainHold = 1.6;
    state.shield = Math.min(state.maxShield, state.shield + 1);
    state.upgradeChoices = [];
    state.screen = "playing";
    state.sequenceLock = false;
    pushEvent("scene.changed", { scene: "playing" });
    state.banner = {
      titleId: "act",
      detailId: `stage${state.stage}`,
      value: state.stage + 1,
      time: 3.1,
      maxTime: 3.1,
    };
    pushEvent("upgrade.selected", { id: choice.id, level: applied.level });
    pushEvent("audio", { cue: "drive" });
    projectIfDirty();
  }

  function activateOverdrive(auto) {
    if (state.overdrive > 0 || state.drive < 99) return false;
    if (typeof auto !== "boolean")
      throw new TypeError("Overdrive activation requires auto boolean.");
    state.firstDriveUsed = true;
    state.overdriveMax = state.mods.overdriveDuration;
    state.overdrive = state.mods.overdriveDuration;
    state.overdriveGuard = true;
    state.hitStopTicks = Math.max(state.hitStopTicks, HIT_STOP_TICKS.overdrive);
    state.drive = 100;
    state.chain = Math.max(state.chain, 72);
    state.chainHold = 4;
    state.rankPenalty = Math.max(0, state.rankPenalty - 0.08);
    state.player.invulnerable = Math.max(state.player.invulnerable, 0.72);
    cancelBullets(state.player.x, state.player.y, 1200, "drive", true);
    clearIntoPool(state.lasers, pools.lasers);
    damageEnemiesInRadius(
      WORLD_WIDTH / 2,
      WORLD_HEIGHT / 2,
      1200,
      overdriveStartDamage(state.mods.nova),
    );
    spawnRadialBurst(state.player.x, state.player.y, 90, COLORS.cyan, COLORS.pink);
    state.flash = { color: COLORS.white, amount: 0.52 };
    state.shake = Math.max(state.shake, 16);
    state.banner = {
      titleId: auto ? "autoDrop" : "overdrive",
      detailId: "breakScreen",
      value: 0,
      time: 1.45,
      maxTime: 1.45,
    };
    pushEvent("overdrive.activated");
    pushEvent("audio", { cue: "drive" });
    return true;
  }

  function activateDrop() {
    if (state.screen !== "playing") return;
    if (state.overdrive > 0) {
      if (state.overdrive > 0.65) {
        const remaining = state.overdrive / state.overdriveMax;
        state.score += Math.floor(15000 * remaining * multiplier());
        endOverdrive(true);
      }
      return;
    }
    if (state.drive >= 99.5) {
      activateOverdrive(false);
    } else if (state.drive >= state.mods.guardCost * 0.9) {
      pulseGuard(false);
    } else {
      state.worldPrompt = {
        textId: "buildDrive",
        value: Math.floor(state.drive),
        time: 0.8,
        maxTime: 0.8,
        color: COLORS.cyan,
      };
    }
  }

  function cancelBullets(x, y, radius, reason, full) {
    if (!BULLET_CANCEL_REASONS.has(reason)) {
      throw new RangeError(`Unknown Neon bullet cancellation reason: ${reason}`);
    }
    if (typeof full !== "boolean") {
      throw new TypeError("Neon bullet cancellation requires an explicit full flag.");
    }
    const rewarding = reason !== "hit" && reason !== "transition";
    let cancelled = 0;
    const radiusSquared = radius * radius;
    for (let index = state.enemyBullets.length - 1; index >= 0; index -= 1) {
      const bullet = state.enemyBullets[index];
      if (!bullet.cancellable) continue;
      if (!full && distanceSquared({ x, y }, bullet) > radiusSquared) continue;
      cancelled += 1;
      if (rewarding && cancelled % 3 === 0 && state.pickups.length < 170) {
        spawnPickup({
          x: bullet.x,
          y: bullet.y,
          vx: rng.range(-60, 60),
          vy: rng.range(-100, 20),
          type: reason === "guard" ? "drive" : "score",
          value: reason === "guard" ? 45 : 95,
        });
      }
      if (cancelled <= 240 || cancelled % 4 === 0) {
        spawnParticle({
          x: bullet.x,
          y: bullet.y,
          vx: fxRng.range(-50, 50),
          vy: fxRng.range(-50, 50),
          life: fxRng.range(0.18, 0.45),
          size: fxRng.range(2, 5),
          color: bullet.color,
          type: "spark",
          drag: 2.5,
        });
      }
      recycle(state.enemyBullets, index, pools.enemyBullets);
    }
    if (cancelled > 0) {
      state.stats.bulletsCancelled += cancelled;
      if (rewarding) {
        const cancelValue =
          cancelled * (reason === "drive" || reason === "finisher" ? 135 : 45) * multiplier();
        state.score += Math.floor(cancelValue);
        state.chain = Math.min(100, state.chain + Math.min(24, cancelled * 0.045));
        state.chainHold = Math.max(state.chainHold, 1.1);
      }
    }
    return cancelled;
  }

  function endOverdrive(manual) {
    const cancelledBullets = cancelBullets(
      WORLD_WIDTH / 2,
      WORLD_HEIGHT / 2,
      1200,
      "finisher",
      true,
    );
    clearIntoPool(state.lasers, pools.lasers);
    const nova = buildNovaFinisher({
      player: state.player,
      novaLevel: state.mods.nova,
      cancelledBullets,
      rng: fxRng,
    });
    damageEnemiesInRadius(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 1200, nova.damage);
    spawnRadialBurst(
      state.player.x,
      state.player.y,
      120 + state.mods.nova * 30,
      COLORS.pink,
      COLORS.gold,
    );
    state.flash = { color: manual ? COLORS.gold : COLORS.pink, amount: 0.36 };
    state.shake = Math.max(state.shake, nova.shake);
    for (const explosion of nova.explosions) {
      spawnExplosion(explosion.x, explosion.y, explosion.scale, explosion.color);
    }
    state.overdrive = 0;
    state.drive = 0;
    state.overdriveGuard = false;
    state.chainHold = 2.2;
    pushEvent("audio", { cue: "pulse" });
  }

  function finish(victory, label) {
    if (state.screen === "result") return;
    const score = Math.max(0, Math.floor(state.score));
    const isRecord = score > profile.best[state.mode];
    if (isRecord) profile.best[state.mode] = score;
    if (victory && state.mode === "story") profile.unlockedEndless = true;
    storage.save(profile);
    const gradeValue =
      state.maxChain * 14 +
      state.graze * 0.035 +
      state.bosses * 14 -
      state.hits * 9 +
      (victory ? 18 : 0);
    const grade =
      gradeValue >= 130
        ? "SSS"
        : gradeValue >= 105
          ? "SS"
          : gradeValue >= 80
            ? "S"
            : gradeValue >= 58
              ? "A"
              : gradeValue >= 36
                ? "B"
                : "C";
    state.result = {
      victory,
      label,
      score,
      isRecord,
      kills: state.kills,
      graze: state.graze,
      chain: Number(state.maxChain.toFixed(2)),
      grade,
    };
    state.screen = "result";
    state.danger = 0;
    state.sequenceLock = true;
    state.pendingAction = null;
    state.pendingTicks = 0;
    state.upgradeChoices.length = 0;
    pushEvent("scene.changed", { scene: "result" });
    pushEvent("run.finished", { mode: state.mode, victory, score });
    if (victory) pushEvent("audio", { cue: "victory" });
    projectIfDirty();
  }

  function step(dt = FIXED_STEP_SECONDS) {
    if (disposed) throw new Error("Neon simulation is disposed.");
    if (dt !== FIXED_STEP_SECONDS)
      throw new RangeError("Neon simulation accepts only its 60 Hz fixed step.");
    state.presentationTime += dt;
    if (state.screen === "title") {
      updateParticles(dt);
      updateFloaters(dt);
      updatePresentation(dt);
      return;
    }
    if (state.screen === "upgrade" || state.screen === "result") {
      updateParticles(dt * 0.55);
      updateFloaters(dt);
      updatePresentation(dt * 0.55);
      return;
    }
    if (state.screen !== "playing") throw new RangeError(`Unknown Neon screen: ${state.screen}`);
    if (state.hitStopTicks > 0) {
      state.hitStopTicks -= 1;
      updateParticles(dt * 0.3);
      updateFloaters(dt * 0.3);
      updatePresentation(dt * 0.3);
      return;
    }
    state.tick += 1;
    state.runTicks += 1;
    advancePendingSequence();
    if (state.screen !== "playing") return;
    updatePlayer(dt);
    if (state.overdrive > 0) {
      const remaining = state.overdrive - dt;
      state.overdrive = Math.abs(remaining) <= OVERDRIVE_ZERO_EPSILON ? 0 : Math.max(0, remaining);
      state.drive = (state.overdrive / state.overdriveMax) * 100;
      if (state.overdrive === 0) endOverdrive(false);
    }
    updateDirector(dt);
    if (state.screen !== "playing") return;
    updateEnemies(dt);
    updateProjectiles(dt);
    updatePresentation(dt);
    if (state.tick % 3 === 0) projectIfDirty();
  }

  function command(commandValue) {
    if (disposed) throw new Error("Neon simulation is disposed.");
    if (
      commandValue === null ||
      typeof commandValue !== "object" ||
      Array.isArray(commandValue) ||
      typeof commandValue.type !== "string"
    ) {
      throw new TypeError("Neon command must be an explicit command object.");
    }
    switch (commandValue.type) {
      case "start":
        if (!exactKeys(commandValue, ["type", "mode"]))
          throw new TypeError("start requires exactly mode.");
        resetRun(commandValue.mode);
        break;
      case "selectMode":
        if (!exactKeys(commandValue, ["type", "mode"]) || !MODES.has(commandValue.mode))
          throw new TypeError("selectMode requires a valid mode.");
        if (commandValue.mode === "endless" && !profile.unlockedEndless)
          throw new Error("Endless mode is locked.");
        state.selectedMode = commandValue.mode;
        pushEvent("audio", { cue: "select" });
        projectIfDirty();
        break;
      case "move":
        if (
          !exactKeys(commandValue, ["type", "x", "y"]) ||
          !Number.isFinite(commandValue.x) ||
          !Number.isFinite(commandValue.y)
        )
          throw new TypeError("move requires finite x and y.");
        state.input.x = clamp(commandValue.x, -1, 1);
        state.input.y = clamp(commandValue.y, -1, 1);
        state.input.pointer = null;
        break;
      case "pointer":
        if (
          !exactKeys(commandValue, ["type", "x", "y"]) ||
          !Number.isFinite(commandValue.x) ||
          !Number.isFinite(commandValue.y)
        )
          throw new TypeError("pointer requires finite x and y.");
        state.input.pointer = {
          x: clamp(commandValue.x, 20, 520),
          y: clamp(commandValue.y, 48, 924),
        };
        break;
      case "focus":
        if (
          !exactKeys(commandValue, ["type", "active"]) ||
          typeof commandValue.active !== "boolean"
        )
          throw new TypeError("focus requires active boolean.");
        state.input.focus = commandValue.active;
        break;
      case "drop":
        if (
          !exactKeys(commandValue, ["type", "active"]) ||
          typeof commandValue.active !== "boolean"
        )
          throw new TypeError("drop requires active boolean.");
        if (commandValue.active && !state.input.drop) activateDrop();
        state.input.drop = commandValue.active;
        break;
      case "chooseUpgrade":
        if (!exactKeys(commandValue, ["type", "index"]))
          throw new TypeError("chooseUpgrade requires exactly index.");
        chooseUpgrade(commandValue.index);
        break;
      case "applyGameSettings": {
        if (
          !exactKeys(commandValue, ["type", "settings"]) ||
          !exactKeys(commandValue.settings, ["fxDensity", "showHitbox", "autoGuard"]) ||
          !GAME_FX_DENSITIES.has(commandValue.settings.fxDensity) ||
          typeof commandValue.settings.showHitbox !== "boolean" ||
          typeof commandValue.settings.autoGuard !== "boolean"
        ) {
          throw new TypeError("applyGameSettings requires exact current game settings.");
        }
        const gameSettings = {
          fxDensity: commandValue.settings.fxDensity,
          showHitbox: commandValue.settings.showHitbox,
          autoGuard: commandValue.settings.autoGuard,
        };
        profile.settings = gameSettings;
        state.gameSettings = gameSettings;
        storage.save(profile);
        projectIfDirty();
        break;
      }
      case "retry":
        if (!exactKeys(commandValue, ["type"]) || state.screen !== "result")
          throw new Error("retry is available only at result.");
        resetRun(state.mode);
        break;
      case "restart":
        if (!exactKeys(commandValue, ["type"]) || state.screen !== "playing") {
          throw new Error("restart is available only during a playing run.");
        }
        resetRun(state.mode);
        break;
      case "title":
        if (!exactKeys(commandValue, ["type"])) throw new TypeError("title has no payload.");
        state.screen = "title";
        state.danger = 0;
        state.sequenceLock = false;
        state.pendingAction = null;
        state.pendingTicks = 0;
        state.hitStopTicks = 0;
        state.overdrive = 0;
        state.overdriveMax = 0;
        state.overdriveGuard = false;
        state.result = null;
        clearIntoPool(state.enemies, pools.enemies);
        clearIntoPool(state.playerBullets, pools.playerBullets);
        clearIntoPool(state.enemyBullets, pools.enemyBullets);
        clearIntoPool(state.particles, pools.particles);
        clearIntoPool(state.pickups, pools.pickups);
        clearIntoPool(state.lasers, pools.lasers);
        state.floaters.length = 0;
        state.flash = null;
        state.shake = 0;
        state.banner = null;
        state.worldPrompt = null;
        state.boss = null;
        state.upgradeChoices.length = 0;
        pushEvent("scene.changed", { scene: "title" });
        pushEvent("audio", { cue: "select" });
        projectIfDirty();
        break;
      case "releaseAll":
        if (!exactKeys(commandValue, ["type"])) throw new TypeError("releaseAll has no payload.");
        state.input = { x: 0, y: 0, focus: false, pointer: null, drop: false };
        break;
      default:
        throw new RangeError(`Unknown Neon command: ${commandValue.type}`);
    }
  }

  projectIfDirty(true);
  return {
    state,
    step,
    command,
    setMovement(movement) {
      state.input.x = movement.x;
      state.input.y = movement.y;
      state.input.focus = movement.focus;
      state.input.pointer = movement.pointer;
    },
    ...(__GAMEYARD_TESTKIT__
      ? {
          observe() {
            return deepCopy({
              ...uiSnapshot(),
              tick: state.tick,
              elapsed: state.elapsed,
              player: state.player,
              mods: state.mods,
              upgradeLevels: state.upgradeLevels,
              counts: {
                enemies: state.enemies.length,
                enemyBullets: state.enemyBullets.length,
                playerBullets: state.playerBullets.length,
                particles: state.particles.length,
                pickups: state.pickups.length,
                lasers: state.lasers.length,
                floaters: state.floaters.length,
              },
              patterns: {
                enemyBullets: {
                  orb: state.enemyBullets.filter((bullet) => bullet.shape === "orb").length,
                  needle: state.enemyBullets.filter((bullet) => bullet.shape === "needle").length,
                  diamond: state.enemyBullets.filter((bullet) => bullet.shape === "diamond").length,
                  star: state.enemyBullets.filter((bullet) => bullet.shape === "star").length,
                },
                playerBullets: {
                  shot: state.playerBullets.filter((bullet) => bullet.type === "shot").length,
                  lance: state.playerBullets.filter((bullet) => bullet.type === "lance").length,
                  option: state.playerBullets.filter((bullet) => bullet.type === "option").length,
                  missile: state.playerBullets.filter((bullet) => bullet.type === "missile").length,
                },
                lasers: {
                  warning: state.lasers.filter((laser) => laser.age < laser.warning).length,
                  active: state.lasers.filter((laser) => laser.age >= laser.warning).length,
                },
              },
              simulationRng: rng.snapshot(),
            });
          },
          drainEvents() {
            return testkitEventBuffer
              .splice(0, testkitEventBuffer.length)
              .map((event) => ({ ...event }));
          },
          controls: Object.freeze({
            prepareDrive() {
              if (state.screen !== "playing") {
                throw new Error("Drive preparation requires a playing run.");
              }
              state.drive = 100;
              state.firstDriveUsed = true;
              state.overdrive = 0;
              state.overdriveMax = 0;
              state.overdriveGuard = false;
              state.driveReadyTime = 0;
              state.drivePrompted = false;
              projectIfDirty();
            },
            prepareGuardBoundary() {
              if (state.screen !== "playing") {
                throw new Error("Guard boundary preparation requires a playing run.");
              }
              state.drive = 99.25;
              state.overdrive = 0;
              state.overdriveMax = 0;
              state.overdriveGuard = false;
              projectIfDirty();
            },
            protectPlayer() {
              if (state.screen !== "playing") {
                throw new Error("Player protection requires a playing run.");
              }
              state.player.invulnerable = 600;
            },
            prepareResult(payload) {
              if (
                !exactKeys(payload, ["score", "chain", "maxChain", "bosses"]) ||
                !Number.isSafeInteger(payload.score) ||
                payload.score < 0 ||
                ![payload.chain, payload.maxChain].every(Number.isFinite) ||
                payload.chain < 0 ||
                payload.maxChain < 1 ||
                !Number.isSafeInteger(payload.bosses) ||
                payload.bosses < 0
              ) {
                throw new TypeError("Result preparation payload must be exact and valid.");
              }
              state.score = payload.score;
              state.chain = payload.chain;
              state.maxChain = payload.maxChain;
              state.bosses = payload.bosses;
              projectIfDirty();
            },
            spawnEnemy(payload) {
              if (!exactKeys(payload, ["kind", "x", "y", "health"]))
                throw new TypeError("Enemy payload must be exact.");
              const enemy = spawnEnemy(payload.kind, { x: payload.x, y: payload.y });
              enemy.hp = payload.health;
              enemy.maxHp = payload.health;
              enemy.originX = payload.x;
              enemy.targetY = payload.y;
              enemy.amp = 0;
              enemy.speed = 0;
              enemy.entered = true;
              enemy.contactDamage = false;
              projectIfDirty();
            },
            spawnPlayerBullet(payload) {
              if (
                !exactKeys(payload, [
                  "x",
                  "y",
                  "vx",
                  "vy",
                  "radius",
                  "damage",
                  "type",
                  "pierce",
                  "life",
                ]) ||
                ![
                  payload.x,
                  payload.y,
                  payload.vx,
                  payload.vy,
                  payload.radius,
                  payload.damage,
                  payload.pierce,
                  payload.life,
                ].every(Number.isFinite) ||
                typeof payload.type !== "string"
              ) {
                throw new TypeError("Player bullet payload must be exact and finite.");
              }
              spawnPlayerBullet({ ...payload, color: COLORS.cyan });
            },
            prepareGraze() {
              if (state.screen !== "playing") {
                throw new Error("Graze preparation requires a playing run.");
              }
              spawnEnemyBullet({
                x: state.player.x + 20,
                y: state.player.y,
                angle: 0,
                speed: 0,
                vx: 0,
                vy: 0,
                radius: 6,
                color: COLORS.pink,
                shape: "orb",
                life: 2,
              });
            },
            prepareThreat(rank) {
              if (state.screen !== "playing" || ![0.22, 0.48, 0.6, 0.8].includes(rank)) {
                throw new RangeError(
                  "Threat preparation requires playing and an exact supported rank checkpoint.",
                );
              }
              state.rank = rank;
              state.rankTarget = rank;
              projectIfDirty();
            },
            prepareCollisionPriority() {
              if (state.screen !== "playing") {
                throw new Error("Collision priority preparation requires a playing run.");
              }
              clearIntoPool(state.enemies, pools.enemies);
              clearIntoPool(state.enemyBullets, pools.enemyBullets);
              clearIntoPool(state.playerBullets, pools.playerBullets);
              clearIntoPool(state.lasers, pools.lasers);
              state.sequenceLock = true;
              state.pendingAction = null;
              state.pendingTicks = 0;
              state.gameSettings = { ...state.gameSettings, autoGuard: false };
              state.player.x = WORLD_WIDTH / 2;
              state.player.y = 788;
              state.player.prevX = state.player.x;
              state.player.prevY = state.player.y;
              state.player.vx = 0;
              state.player.vy = 0;
              state.player.invulnerable = 0;
              state.player.shotClock = 600;
              state.player.missileClock = 600;
              state.shield = 3;
              const enemy = spawnEnemy("scout", { x: state.player.x, y: state.player.y });
              Object.assign(enemy, {
                x: state.player.x,
                y: state.player.y,
                prevX: state.player.x,
                prevY: state.player.y,
                originX: state.player.x,
                hp: 100,
                maxHp: 100,
                speed: 0,
                amp: 0,
                fireTimer: 10,
                auxTimer: 10,
                contactDamage: true,
              });
              spawnEnemyBullet({
                x: state.player.x,
                y: state.player.y,
                angle: 0,
                speed: 0,
                vx: 0,
                vy: 0,
                radius: 6,
                color: COLORS.pink,
                shape: "orb",
                life: 2,
              });
              projectIfDirty();
            },
            prepareContactDamage() {
              if (state.screen !== "playing") {
                throw new Error("Contact damage preparation requires a playing run.");
              }
              clearIntoPool(state.enemies, pools.enemies);
              clearIntoPool(state.enemyBullets, pools.enemyBullets);
              clearIntoPool(state.playerBullets, pools.playerBullets);
              clearIntoPool(state.lasers, pools.lasers);
              state.sequenceLock = true;
              state.pendingAction = null;
              state.pendingTicks = 0;
              state.gameSettings = { ...state.gameSettings, autoGuard: false };
              state.player.x = WORLD_WIDTH / 2;
              state.player.y = 788;
              state.player.prevX = state.player.x;
              state.player.prevY = state.player.y;
              state.player.vx = 0;
              state.player.vy = 0;
              state.player.invulnerable = 0;
              state.player.shotClock = 600;
              state.player.missileClock = 600;
              state.shield = 3;
              const enemy = spawnEnemy("scout", { x: state.player.x, y: state.player.y });
              Object.assign(enemy, {
                x: state.player.x,
                y: state.player.y,
                prevX: state.player.x,
                prevY: state.player.y,
                originX: state.player.x,
                hp: 100,
                maxHp: 100,
                speed: 0,
                amp: 0,
                fireTimer: 10,
                auxTimer: 10,
                contactDamage: true,
              });
              projectIfDirty();
            },
            prepareReverseEnemyHit() {
              if (state.screen !== "playing") {
                throw new Error("Reverse enemy hit preparation requires a playing run.");
              }
              clearIntoPool(state.enemies, pools.enemies);
              clearIntoPool(state.enemyBullets, pools.enemyBullets);
              clearIntoPool(state.playerBullets, pools.playerBullets);
              clearIntoPool(state.lasers, pools.lasers);
              state.sequenceLock = true;
              state.pendingAction = null;
              state.pendingTicks = 0;
              state.player.invulnerable = 600;
              state.player.shotClock = 600;
              state.player.missileClock = 600;
              const first = spawnEnemy("scout", { x: WORLD_WIDTH / 2, y: 400 });
              Object.assign(first, {
                x: WORLD_WIDTH / 2,
                y: 400,
                prevX: WORLD_WIDTH / 2,
                prevY: 400,
                originX: WORLD_WIDTH / 2,
                hp: 100,
                maxHp: 100,
                speed: 0,
                amp: 0,
                fireTimer: 10,
                auxTimer: 10,
                contactDamage: false,
              });
              const second = spawnEnemy("elite", { x: WORLD_WIDTH / 2, y: 400 });
              Object.assign(second, {
                x: WORLD_WIDTH / 2,
                y: 400,
                prevX: WORLD_WIDTH / 2,
                prevY: 400,
                targetY: 400,
                phase: 0,
                hp: 200,
                maxHp: 200,
                entered: true,
                fireTimer: 10,
                auxTimer: 10,
                contactDamage: false,
              });
              spawnPlayerBullet({
                x: WORLD_WIDTH / 2,
                y: 460,
                vx: 0,
                vy: -7200,
                radius: 3,
                damage: 10,
                type: "shot",
                pierce: 0,
                life: 2,
                color: COLORS.cyan,
              });
              projectIfDirty();
            },
            preparePendingDeathAbsorption() {
              if (state.screen !== "playing") {
                throw new Error("Pending death absorption preparation requires a playing run.");
              }
              clearIntoPool(state.enemies, pools.enemies);
              clearIntoPool(state.enemyBullets, pools.enemyBullets);
              clearIntoPool(state.playerBullets, pools.playerBullets);
              clearIntoPool(state.lasers, pools.lasers);
              state.sequenceLock = true;
              state.pendingAction = null;
              state.pendingTicks = 0;
              state.player.invulnerable = 600;
              state.player.shotClock = 600;
              state.player.missileClock = 600;
              for (let enemyIndex = 0; enemyIndex < 2; enemyIndex += 1) {
                const enemy = spawnEnemy("scout", { x: WORLD_WIDTH / 2, y: 400 });
                Object.assign(enemy, {
                  x: WORLD_WIDTH / 2,
                  y: 400,
                  prevX: WORLD_WIDTH / 2,
                  prevY: 400,
                  originX: WORLD_WIDTH / 2,
                  hp: 1,
                  maxHp: 1,
                  speed: 0,
                  amp: 0,
                  fireTimer: 10,
                  auxTimer: 10,
                  contactDamage: false,
                });
              }
              for (let shotIndex = 0; shotIndex < 2; shotIndex += 1) {
                spawnPlayerBullet({
                  x: WORLD_WIDTH / 2,
                  y: 460,
                  vx: 0,
                  vy: -7200,
                  radius: 3,
                  damage: 10,
                  type: "shot",
                  pierce: 0,
                  life: 2,
                  color: COLORS.cyan,
                });
              }
              projectIfDirty();
            },
            preparePrunedPlayerShots() {
              if (state.screen !== "playing") {
                throw new Error("Pruned player shot preparation requires a playing run.");
              }
              clearIntoPool(state.enemies, pools.enemies);
              clearIntoPool(state.enemyBullets, pools.enemyBullets);
              clearIntoPool(state.playerBullets, pools.playerBullets);
              clearIntoPool(state.lasers, pools.lasers);
              state.sequenceLock = true;
              state.pendingAction = null;
              state.pendingTicks = 0;
              state.player.invulnerable = 600;
              state.player.shotClock = 600;
              state.player.missileClock = 600;
              const expiredTarget = spawnEnemy("scout", { x: 180, y: 400 });
              Object.assign(expiredTarget, {
                x: 180,
                y: 400,
                prevX: 180,
                prevY: 400,
                originX: 180,
                hp: 100,
                maxHp: 100,
                speed: 0,
                amp: 0,
                fireTimer: 10,
                auxTimer: 10,
                contactDamage: false,
              });
              const outsideTarget = spawnEnemy("scout", { x: 360, y: 20 });
              Object.assign(outsideTarget, {
                x: 360,
                y: 20,
                prevX: 360,
                prevY: 20,
                originX: 360,
                hp: 100,
                maxHp: 100,
                speed: 0,
                amp: 0,
                fireTimer: 10,
                auxTimer: 10,
                contactDamage: false,
              });
              spawnPlayerBullet({
                x: 180,
                y: 460,
                vx: 0,
                vy: -7200,
                radius: 3,
                damage: 10,
                type: "shot",
                pierce: 0,
                life: 0,
                color: COLORS.cyan,
              });
              spawnPlayerBullet({
                x: 360,
                y: 100,
                vx: 0,
                vy: -12000,
                radius: 3,
                damage: 10,
                type: "shot",
                pierce: 0,
                life: 2,
                color: COLORS.cyan,
              });
              projectIfDirty();
            },
            prepareDiverPowerKill() {
              if (state.screen !== "playing") {
                throw new Error("Diver power kill preparation requires a playing run.");
              }
              clearIntoPool(state.enemies, pools.enemies);
              clearIntoPool(state.enemyBullets, pools.enemyBullets);
              clearIntoPool(state.playerBullets, pools.playerBullets);
              clearIntoPool(state.pickups, pools.pickups);
              clearIntoPool(state.lasers, pools.lasers);
              state.sequenceLock = true;
              state.pendingAction = null;
              state.pendingTicks = 0;
              state.player.invulnerable = 600;
              state.player.shotClock = 600;
              state.player.missileClock = 600;
              state.rank = 0.8;
              state.rankTarget = 0.8;
              state.kills = 11;
              state.player.power = 1;
              state.shake = 0;
              const enemy = spawnEnemy("diver", { x: WORLD_WIDTH / 2, y: 400 });
              Object.assign(enemy, {
                x: WORLD_WIDTH / 2,
                y: 400,
                prevX: WORLD_WIDTH / 2,
                prevY: 400,
                phase: 0,
                hp: 1,
                maxHp: 1,
                side: 1,
                fireTimer: 10,
                auxTimer: 10,
                contactDamage: false,
                revenge: false,
              });
              spawnPlayerBullet({
                x: WORLD_WIDTH / 2,
                y: 460,
                vx: 0,
                vy: -7200,
                radius: 4,
                damage: 10,
                type: "shot",
                pierce: 0,
                life: 2,
                color: COLORS.cyan,
              });
              projectIfDirty();
            },
            prepareEliteKill() {
              if (state.screen !== "playing") {
                throw new Error("Elite kill preparation requires a playing run.");
              }
              clearIntoPool(state.enemies, pools.enemies);
              clearIntoPool(state.enemyBullets, pools.enemyBullets);
              clearIntoPool(state.playerBullets, pools.playerBullets);
              clearIntoPool(state.pickups, pools.pickups);
              clearIntoPool(state.lasers, pools.lasers);
              state.sequenceLock = true;
              state.pendingAction = null;
              state.pendingTicks = 0;
              state.player.invulnerable = 600;
              state.player.shotClock = 600;
              state.player.missileClock = 600;
              state.rank = 0.22;
              state.rankTarget = 0.22;
              state.kills = 0;
              state.shake = 0;
              const enemy = spawnEnemy("elite", { x: WORLD_WIDTH / 2, y: 400 });
              Object.assign(enemy, {
                x: WORLD_WIDTH / 2,
                y: 400,
                prevX: WORLD_WIDTH / 2,
                prevY: 400,
                targetY: 400,
                phase: 0,
                hp: 1,
                maxHp: 1,
                entered: true,
                fireTimer: 10,
                auxTimer: 10,
                contactDamage: false,
              });
              spawnPlayerBullet({
                x: WORLD_WIDTH / 2,
                y: 460,
                vx: 0,
                vy: -7200,
                radius: 4,
                damage: 10,
                type: "shot",
                pierce: 0,
                life: 2,
                color: COLORS.cyan,
              });
              projectIfDirty();
            },
            prepareBossMissileHit() {
              if (state.screen !== "playing" || state.boss === null) {
                throw new Error("Boss missile hit preparation requires an active boss.");
              }
              clearIntoPool(state.playerBullets, pools.playerBullets);
              state.player.shotClock = 600;
              state.player.missileClock = 600;
              spawnPlayerBullet({
                x: state.boss.x,
                y: state.boss.y + 20,
                vx: 0,
                vy: -310,
                radius: 6,
                damage: 42,
                color: COLORS.gold,
                type: "missile",
                turnRate: 5.3,
                speed: 430,
                life: 3,
                pierce: 0,
              });
            },
            prepareMissileFlight() {
              if (state.screen !== "playing") {
                throw new Error("Missile flight preparation requires a playing run.");
              }
              clearIntoPool(state.enemies, pools.enemies);
              clearIntoPool(state.enemyBullets, pools.enemyBullets);
              clearIntoPool(state.playerBullets, pools.playerBullets);
              clearIntoPool(state.particles, pools.particles);
              clearIntoPool(state.lasers, pools.lasers);
              state.boss = null;
              state.sequenceLock = true;
              state.pendingAction = null;
              state.pendingTicks = 0;
              state.player.shotClock = 600;
              state.player.missileClock = 600;
              spawnPlayerBullet({
                x: WORLD_WIDTH / 2,
                y: 520,
                vx: 90,
                vy: -310,
                radius: 6,
                damage: 42,
                color: COLORS.gold,
                type: "missile",
                turnRate: 5.3,
                speed: 430,
                life: 3,
                pierce: 0,
              });
              projectIfDirty();
            },
            prepareBossPhaseBreak() {
              if (state.screen !== "playing" || state.boss === null) {
                throw new Error("Boss phase break preparation requires an active boss.");
              }
              state.boss.hp = 0;
            },
            spawnBoss(id) {
              spawnBoss(id, false);
              state.boss.intro = 0;
              state.boss.x = state.boss.targetX;
              state.boss.y = state.boss.targetY;
              state.boss.prevX = state.boss.x;
              state.boss.prevY = state.boss.y;
              projectIfDirty();
            },
            damageBoss(amount) {
              if (state.boss === null || !Number.isFinite(amount) || amount <= 0)
                throw new RangeError("Boss damage requires an active boss and positive damage.");
              state.boss.hp -= amount;
              if (state.boss.hp <= 0) defeatBoss();
              projectIfDirty();
            },
            hitPlayer() {
              state.player.invulnerable = 0;
              damagePlayer();
              projectIfDirty();
            },
            showUpgrade() {
              showUpgrade();
              projectIfDirty();
            },
            offerUpgrades(ids) {
              if (
                !Array.isArray(ids) ||
                ids.length !== 3 ||
                new Set(ids).size !== 3 ||
                ids.some((id) => typeof id !== "string")
              ) {
                throw new TypeError("Upgrade offer requires three unique ids.");
              }
              const choices = ids.map((id) => {
                const upgrade = UPGRADES.find((candidate) => candidate.id === id);
                if (upgrade === undefined) throw new RangeError(`Unknown upgrade offer id: ${id}`);
                if ((state.upgradeLevels[id] ?? 0) >= upgrade.max) {
                  throw new RangeError(`Upgrade ${id} is already at maximum level.`);
                }
                return upgrade;
              });
              presentUpgradeChoices(choices);
              projectIfDirty();
            },
            finish,
          }),
        }
      : {}),
    snapshotResources() {
      return {
        pools:
          state.enemies.length +
          state.enemyBullets.length +
          state.playerBullets.length +
          state.particles.length +
          state.pickups.length +
          state.lasers.length +
          state.floaters.length +
          Object.values(pools).reduce((total, pool) => total + pool.length, 0),
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clearIntoPool(state.enemies, pools.enemies);
      clearIntoPool(state.enemyBullets, pools.enemyBullets);
      clearIntoPool(state.playerBullets, pools.playerBullets);
      clearIntoPool(state.particles, pools.particles);
      clearIntoPool(state.pickups, pools.pickups);
      clearIntoPool(state.lasers, pools.lasers);
      state.floaters.length = 0;
      state.upgradeChoices.length = 0;
      state.boss = null;
      if (__GAMEYARD_TESTKIT__) testkitEventBuffer.length = 0;
      for (const pool of Object.values(pools)) pool.length = 0;
    },
  };
}
