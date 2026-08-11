import { COLORS, FIELD } from "./catalog.js";
import { angleTo, lerp } from "./math.js";
import {
  bulletCount,
  bulletSpeed,
  emitAimedFan,
  emitBulletWall,
  emitFan,
  emitRing,
} from "./projectile-patterns.js";

export const BOSS_DEFINITIONS = Object.freeze(
  [
    {
      name: "AELLA // THE FEED",
      color: COLORS.pink,
      phases: [
        { name: "INFINITE SCROLL", hp: 4700, duration: 24 },
        { name: "RED DOT HUNGER", hp: 5600, duration: 26 },
        { name: "FEED COLLAPSE", hp: 6800, duration: 30 },
      ],
    },
    {
      name: "MIRROR SAINT",
      color: COLORS.cyan,
      phases: [
        { name: "TWIN REFLECTION", hp: 6100, duration: 27 },
        { name: "GLASS LATTICE", hp: 7200, duration: 29 },
        { name: "KALEIDOSCOPE END", hp: 8500, duration: 32 },
      ],
    },
    {
      name: "THE ALGORITHM",
      color: COLORS.gold,
      phases: [
        { name: "PREDICTIVE DESIRE", hp: 7200, duration: 29 },
        { name: "PERFECT CORRIDOR", hp: 8200, duration: 31 },
        { name: "GOLDEN ENGAGEMENT", hp: 9300, duration: 34 },
        { name: "ZERO SUN // FINAL", hp: 11200, duration: 40 },
      ],
    },
  ].map((boss) =>
    Object.freeze({
      ...boss,
      phases: Object.freeze(boss.phases.map((phase) => Object.freeze(phase))),
    }),
  ),
);

export function getBossDefinition(id) {
  if (!Number.isSafeInteger(id) || id < 0 || id >= BOSS_DEFINITIONS.length) {
    throw new RangeError("Boss id must be 0, 1, or 2.");
  }
  return BOSS_DEFINITIONS[id];
}

export function createBossState({ id, mode, runTime, statsHits, challenge }) {
  const definition = getBossDefinition(id);
  if (!new Set(["story", "rush", "endless"]).has(mode)) {
    throw new RangeError(`Unknown boss mode: ${mode}`);
  }
  if (![runTime, statsHits].every(Number.isFinite) || statsHits < 0) {
    throw new RangeError("Boss runTime and statsHits must be finite and non-negative.");
  }
  if (typeof challenge !== "boolean") throw new TypeError("Boss challenge must be boolean.");
  const hpScale =
    mode === "rush" ? 0.72 : mode === "endless" ? 0.88 + Math.min(0.6, runTime / 420) : 1;
  return {
    id,
    name: definition.name,
    color: definition.color,
    phases: definition.phases,
    phaseIndex: 0,
    phaseAge: 0,
    age: 0,
    intro: 2.2,
    x: FIELD.width / 2,
    y: -90,
    targetX: FIELD.width / 2,
    targetY: 145,
    radius: id === 2 ? 58 : 52,
    rotation: 0,
    spin: id % 2 ? -0.35 : 0.42,
    timers: {},
    challenge,
    hpScale,
    hp: definition.phases[0].hp * hpScale,
    maxHp: definition.phases[0].hp * hpScale,
    phaseStartHits: statsHits,
    phaseStartTime: runTime,
    phaseTimeout: false,
  };
}

export function resetBossPhase({ boss, phaseIndex, statsHits, runTime }) {
  if (boss === null || typeof boss !== "object") throw new TypeError("Boss state is required.");
  if (!Number.isSafeInteger(phaseIndex) || phaseIndex < 0 || phaseIndex >= boss.phases.length) {
    throw new RangeError("Boss phase index is out of range.");
  }
  if (![statsHits, runTime].every(Number.isFinite)) {
    throw new TypeError("Boss phase reset requires finite statsHits and runTime.");
  }
  boss.phaseIndex = phaseIndex;
  boss.phaseAge = 0;
  boss.timers = {};
  boss.phaseTimeout = false;
  boss.maxHp = boss.phases[phaseIndex].hp * boss.hpScale;
  boss.hp = boss.maxHp;
  boss.phaseStartHits = statsHits;
  boss.phaseStartTime = runTime;
  boss.targetX = FIELD.width / 2;
  boss.targetY = 145 + phaseIndex * 8;
}

function tick(boss, name, interval, dt, initial = true) {
  if (!(name in boss.timers)) boss.timers[name] = initial ? 0 : interval;
  boss.timers[name] -= dt;
  if (boss.timers[name] <= 0) {
    boss.timers[name] += interval;
    return true;
  }
  return false;
}

function move(boss, x, y, dt, responsiveness) {
  boss.x = lerp(boss.x, x, 1 - Math.exp(-responsiveness * dt));
  boss.y = lerp(boss.y, y, 1 - Math.exp(-responsiveness * dt));
}

function assertInputs(boss, dt, rank, player, rng, ports) {
  if (boss === null || typeof boss !== "object") throw new TypeError("Boss state is required.");
  if (!Number.isFinite(dt) || dt <= 0) throw new RangeError("Boss dt must be positive.");
  if (!Number.isFinite(rank)) throw new TypeError("Boss rank must be finite.");
  if (
    player === null ||
    typeof player !== "object" ||
    ![player.x, player.y, player.vx, player.vy].every(Number.isFinite)
  ) {
    throw new TypeError("Boss player target requires finite position and velocity.");
  }
  if (typeof rng?.range !== "function") throw new TypeError("Boss requires a range RNG port.");
  for (const name of ["spawnEnemyBullet", "spawnLaser"]) {
    if (typeof ports?.[name] !== "function") throw new TypeError(`Boss port ${name} is required.`);
  }
}

export function stepBossPattern({ boss, dt, rank, player, rng, ports }) {
  assertInputs(boss, dt, rank, player, rng, ports);
  boss.age += dt;
  boss.rotation += boss.spin * dt;
  if (boss.intro > 0) {
    boss.intro -= dt;
    move(boss, FIELD.width / 2, 145, dt, 1.8);
    return { phaseComplete: false, phaseTimeout: false };
  }
  boss.phaseAge += dt;
  const phase = boss.phases[boss.phaseIndex];
  if (boss.hp <= 0 || boss.phaseAge >= phase.duration) {
    boss.phaseTimeout = boss.phaseAge >= phase.duration && boss.hp > 0;
    return { phaseComplete: true, phaseTimeout: boss.phaseTimeout };
  }
  if (boss.id === 0) stepAella(boss, dt, rank, player, ports);
  else if (boss.id === 1) stepMirror(boss, dt, rank, player, rng, ports);
  else stepAlgorithm(boss, dt, rank, player, ports);
  return { phaseComplete: false, phaseTimeout: false };
}

function stepAella(boss, dt, rank, player, ports) {
  const time = boss.phaseAge;
  const bulletPorts = { spawnEnemyBullet: ports.spawnEnemyBullet };
  if (boss.phaseIndex === 0) {
    move(
      boss,
      FIELD.width / 2 + Math.sin(time * 0.78) * 175,
      145 + Math.sin(time * 1.21) * 24,
      dt,
      2.8,
    );
    if (tick(boss, "ring", 0.72 - rank * 0.08, dt)) {
      emitRing({
        x: boss.x,
        y: boss.y + 10,
        count: 18,
        speed: 128,
        offset: time * 0.56,
        options: {
          color: Math.floor(time) % 2 ? COLORS.pink : COLORS.cyan,
          shape: "orb",
          radius: 5.6,
          curve: Math.sin(time * 0.7) * 0.09,
        },
        rank,
        ports: bulletPorts,
      });
    }
    if (tick(boss, "aim", 1.32, dt)) {
      emitAimedFan({
        x: boss.x,
        y: boss.y + 18,
        count: 7,
        spread: 0.82,
        speed: 215,
        options: { color: COLORS.gold, shape: "needle", radius: 5.2, speedVariance: 0.12 },
        rank,
        player,
        ports: bulletPorts,
      });
    }
  } else if (boss.phaseIndex === 1) {
    move(
      boss,
      FIELD.width / 2 + Math.sin(time * 0.42) * 72,
      118 + Math.sin(time * 0.9) * 14,
      dt,
      2.5,
    );
    if (tick(boss, "wall", 0.92 - rank * 0.08, dt)) {
      emitBulletWall({
        gapX: FIELD.width / 2 + Math.sin(time * 1.07) * 172,
        gapWidth: 118 - rank * 18,
        speed: 170,
        color: Math.floor(time * 2) % 2 ? COLORS.pink : COLORS.red,
        stagger: 6,
        rank,
        ports: bulletPorts,
      });
    }
    if (tick(boss, "laser", 3.55, dt, false)) {
      const shift = Math.sin(time * 0.65) * 65;
      ports.spawnLaser({
        cx: FIELD.width * 0.27 + shift,
        cy: FIELD.height / 2,
        angle: Math.PI / 2,
        length: FIELD.height * 1.25,
        width: 23,
        warning: 0.9,
        active: 0.62,
        color: COLORS.red,
      });
      ports.spawnLaser({
        cx: FIELD.width * 0.73 + shift,
        cy: FIELD.height / 2,
        angle: Math.PI / 2,
        length: FIELD.height * 1.25,
        width: 23,
        warning: 0.9,
        active: 0.62,
        color: COLORS.pink,
      });
    }
    if (tick(boss, "aim", 1.7, dt)) {
      emitAimedFan({
        x: boss.x,
        y: boss.y + 20,
        count: 9,
        spread: 1,
        speed: 190,
        options: { color: COLORS.cyan, shape: "diamond", radius: 5.3, curve: 0.05 },
        rank,
        player,
        ports: bulletPorts,
      });
    }
  } else {
    move(
      boss,
      FIELD.width / 2 + Math.sin(time * 0.95) * 185,
      155 + Math.sin(time * 1.4) * 38,
      dt,
      3.1,
    );
    if (tick(boss, "spiral", 0.092 - rank * 0.015, dt)) {
      const angle = time * 3.25;
      for (const side of [-1, 1]) {
        ports.spawnEnemyBullet({
          x: boss.x + side * 48,
          y: boss.y + 16,
          angle: Math.PI / 2 + Math.sin(angle) * 1.15 + side * 0.32,
          speed: bulletSpeed(142, rank),
          color: side < 0 ? COLORS.pink : COLORS.cyan,
          shape: "needle",
          radius: 5.1,
          curve: side * (0.14 + Math.sin(time * 0.4) * 0.06),
          accel: 8,
        });
      }
    }
    if (tick(boss, "aim", 1.25, dt)) {
      emitAimedFan({
        x: boss.x,
        y: boss.y + 22,
        count: 9,
        spread: 0.92,
        speed: 235,
        options: { color: COLORS.gold, shape: "star", radius: 5.1, speedVariance: 0.2 },
        rank,
        player,
        ports: bulletPorts,
      });
    }
    if (tick(boss, "ring", 2.65, dt, false)) {
      emitRing({
        x: boss.x,
        y: boss.y,
        count: 30,
        speed: 118,
        offset: time * 0.31,
        options: {
          color: COLORS.red,
          shape: "orb",
          radius: 5.8,
          curve: Math.sin(time) * 0.08,
          accel: 12,
        },
        rank,
        ports: bulletPorts,
      });
    }
  }
}

function stepMirror(boss, dt, rank, player, rng, ports) {
  const time = boss.phaseAge;
  const bulletPorts = { spawnEnemyBullet: ports.spawnEnemyBullet };
  if (boss.phaseIndex === 0) {
    move(
      boss,
      FIELD.width / 2 + Math.sin(time * 0.55) * 85,
      142 + Math.sin(time * 1.05) * 24,
      dt,
      2.6,
    );
    if (tick(boss, "mirror", 0.15 - rank * 0.02, dt)) {
      const wave = Math.sin(time * 2.2) * 1.05;
      for (const side of [-1, 1]) {
        ports.spawnEnemyBullet({
          x: boss.x + side * 62,
          y: boss.y + 12,
          angle: Math.PI / 2 + side * wave,
          speed: bulletSpeed(142 + Math.sin(time * 1.7) * 18, rank),
          color: side < 0 ? COLORS.cyan : COLORS.pink,
          shape: "diamond",
          radius: 5.4,
          curve: -side * 0.19,
        });
      }
    }
    if (tick(boss, "ring", 1.05, dt)) {
      emitRing({
        x: boss.x,
        y: boss.y,
        count: 16,
        speed: 112,
        offset: -time * 0.48,
        options: { color: COLORS.violet, shape: "orb", radius: 5.2, curve: 0.08 },
        rank,
        ports: bulletPorts,
      });
    }
    if (tick(boss, "aim", 1.7, dt)) {
      emitAimedFan({
        x: boss.x,
        y: boss.y + 15,
        count: 7,
        spread: 0.62,
        speed: 220,
        options: { color: COLORS.gold, shape: "needle", radius: 5.2 },
        rank,
        player,
        ports: bulletPorts,
      });
    }
  } else if (boss.phaseIndex === 1) {
    move(boss, FIELD.width / 2, 124 + Math.sin(time * 0.7) * 18, dt, 2.8);
    if (tick(boss, "grid", 1.02, dt)) {
      emitBulletWall({
        gapX: FIELD.width / 2 + Math.sin(time * 0.78) * 145,
        gapWidth: 104,
        speed: 160,
        color: Math.floor(time) % 2 ? COLORS.cyan : COLORS.violet,
        stagger: 10,
        rank,
        ports: bulletPorts,
      });
    }
    if (tick(boss, "cross", 3.2, dt, false)) {
      const base = time * 0.22;
      ports.spawnLaser({
        cx: FIELD.width / 2,
        cy: FIELD.height * 0.48,
        angle: base,
        length: FIELD.height * 1.4,
        width: 19,
        warning: 1,
        active: 0.9,
        rotSpeed: 0.17,
        color: COLORS.cyan,
      });
      ports.spawnLaser({
        cx: FIELD.width / 2,
        cy: FIELD.height * 0.48,
        angle: base + Math.PI / 2,
        length: FIELD.height * 1.4,
        width: 19,
        warning: 1,
        active: 0.9,
        rotSpeed: 0.17,
        color: COLORS.pink,
      });
    }
    if (tick(boss, "fan", 0.82, dt)) {
      emitFan({
        x: boss.x,
        y: boss.y + 20,
        baseAngle: Math.PI / 2 + Math.sin(time * 0.9) * 0.7,
        count: 7,
        spread: 1.15,
        speed: 182,
        options: {
          color: COLORS.gold,
          shape: "needle",
          radius: 5,
          curve: Math.sin(time) * 0.04,
        },
        rank,
        ports: bulletPorts,
      });
    }
  } else {
    if (tick(boss, "move", 2.8, dt)) {
      boss.targetX = rng.range(110, FIELD.width - 110);
      boss.targetY = rng.range(105, 230);
    }
    move(boss, boss.targetX, boss.targetY, dt, 1.85);
    if (tick(boss, "kaleido", 0.78 - rank * 0.07, dt)) {
      const alternate = Math.floor(time / 0.78) % 2 ? 1 : -1;
      emitRing({
        x: boss.x,
        y: boss.y,
        count: 24,
        speed: 126,
        offset: time * 0.83,
        options: {
          color: alternate > 0 ? COLORS.pink : COLORS.cyan,
          shape: alternate > 0 ? "diamond" : "orb",
          radius: 5.4,
          curve: alternate * 0.16,
          splitTime: 1.75,
          splitCount: 2,
          splitSpeed: 105,
        },
        rank,
        ports: bulletPorts,
      });
    }
    if (tick(boss, "edges", 2.35, dt, false)) {
      const count = bulletCount(9, rank);
      for (let index = 0; index < count; index += 1) {
        const y = 120 + (index * (FIELD.height - 260)) / Math.max(1, count - 1);
        for (const x of [-18, FIELD.width + 18]) {
          ports.spawnEnemyBullet({
            x,
            y,
            angle: angleTo(x, y, player.x, player.y) + rng.range(-0.16, 0.16),
            speed: bulletSpeed(170, rank),
            color: x < 0 ? COLORS.cyan : COLORS.pink,
            shape: "star",
            radius: 5.1,
            curve: x < 0 ? 0.05 : -0.05,
          });
        }
      }
    }
    if (tick(boss, "aim", 1.42, dt)) {
      emitAimedFan({
        x: boss.x,
        y: boss.y,
        count: 11,
        spread: 1.08,
        speed: 220,
        options: { color: COLORS.gold, shape: "needle", radius: 5.2, speedVariance: 0.18 },
        rank,
        player,
        ports: bulletPorts,
      });
    }
  }
}

function stepAlgorithm(boss, dt, rank, player, ports) {
  const time = boss.phaseAge;
  const bulletPorts = { spawnEnemyBullet: ports.spawnEnemyBullet };
  if (boss.phaseIndex === 0) {
    move(
      boss,
      FIELD.width / 2 + Math.sin(time * 0.63) * 165,
      135 + Math.sin(time * 1.15) * 30,
      dt,
      2.8,
    );
    if (tick(boss, "predict", 0.58 - rank * 0.06, dt)) {
      emitAimedFan({
        x: boss.x,
        y: boss.y + 25,
        count: 7,
        spread: 0.72,
        speed: 225,
        options: {
          color: COLORS.gold,
          shape: "needle",
          radius: 5.2,
          lead: 0.24 + rank * 0.22,
          speedVariance: 0.1,
        },
        rank,
        player,
        ports: bulletPorts,
      });
    }
    if (tick(boss, "ring", 1.32, dt)) {
      emitRing({
        x: boss.x,
        y: boss.y,
        count: 20,
        speed: 122,
        offset: time * 0.57,
        options: {
          color: COLORS.red,
          shape: "orb",
          radius: 5.6,
          accel: 24,
          curve: Math.sin(time) * 0.06,
        },
        rank,
        ports: bulletPorts,
      });
    }
    if (tick(boss, "bounce", 2.4, dt, false)) {
      emitFan({
        x: boss.x,
        y: boss.y,
        baseAngle: Math.PI / 2,
        count: 9,
        spread: 2.2,
        speed: 185,
        options: {
          color: COLORS.violet,
          shape: "diamond",
          radius: 5.4,
          bounce: true,
          maxBounces: 1,
        },
        rank,
        ports: bulletPorts,
      });
    }
  } else if (boss.phaseIndex === 1) {
    move(boss, FIELD.width / 2 + Math.sin(time * 0.32) * 52, 112, dt, 2.5);
    if (tick(boss, "wall", 0.76 - rank * 0.05, dt)) {
      emitBulletWall({
        gapX: FIELD.width / 2 + Math.sin(time * 1.26) * 175,
        gapWidth: 96 - rank * 12,
        speed: 184,
        color: Math.floor(time * 1.5) % 2 ? COLORS.red : COLORS.gold,
        stagger: 8,
        rank,
        ports: bulletPorts,
      });
    }
    if (tick(boss, "diag", 3.05, dt, false)) {
      const angle = Math.PI / 4 + Math.sin(time * 0.4) * 0.34;
      ports.spawnLaser({
        cx: FIELD.width / 2,
        cy: FIELD.height / 2,
        angle,
        length: FIELD.height * 1.5,
        width: 22,
        warning: 0.95,
        active: 0.72,
        color: COLORS.red,
      });
      ports.spawnLaser({
        cx: FIELD.width / 2,
        cy: FIELD.height / 2,
        angle: Math.PI - angle,
        length: FIELD.height * 1.5,
        width: 22,
        warning: 0.95,
        active: 0.72,
        color: COLORS.gold,
      });
    }
    if (tick(boss, "side", 1.15, dt)) {
      for (const side of [-1, 1]) {
        const x = side < 0 ? -12 : FIELD.width + 12;
        const y = 170 + (Math.sin(time * 1.6 + side) * 0.5 + 0.5) * 400;
        emitFan({
          x,
          y,
          baseAngle: side < 0 ? 0 : Math.PI,
          count: 5,
          spread: 0.76,
          speed: 178,
          options: {
            color: side < 0 ? COLORS.cyan : COLORS.pink,
            shape: "star",
            radius: 5.1,
            curve: side * 0.06,
          },
          rank,
          ports: bulletPorts,
        });
      }
    }
  } else if (boss.phaseIndex === 2) {
    move(
      boss,
      FIELD.width / 2 + Math.sin(time * 0.82) * 120,
      150 + Math.sin(time * 1.3) * 44,
      dt,
      3,
    );
    if (tick(boss, "golden", 0.065 - rank * 0.008, dt)) {
      const interval = Math.max(0.045, 0.065 - rank * 0.008);
      const angle = Math.floor(time / interval) * 2.399963229728653;
      for (let layer = 0; layer < 2; layer += 1) {
        ports.spawnEnemyBullet({
          x: boss.x,
          y: boss.y,
          angle: angle + layer * Math.PI,
          speed: bulletSpeed(118 + layer * 26, rank),
          color: layer ? COLORS.pink : COLORS.gold,
          shape: layer ? "diamond" : "orb",
          radius: 5.2,
          curve: layer ? -0.11 : 0.11,
          accel: 18,
        });
      }
    }
    if (tick(boss, "aim", 1.28, dt)) {
      emitAimedFan({
        x: boss.x,
        y: boss.y + 22,
        count: 9,
        spread: 0.92,
        speed: 235,
        options: { color: COLORS.cyan, shape: "needle", radius: 5.2, lead: 0.18 },
        rank,
        player,
        ports: bulletPorts,
      });
    }
    if (tick(boss, "ring", 2.25, dt, false)) {
      emitRing({
        x: boss.x,
        y: boss.y,
        count: 34,
        speed: 104,
        offset: -time * 0.38,
        options: { color: COLORS.red, shape: "star", radius: 5.2, curve: 0.07, accel: 16 },
        rank,
        ports: bulletPorts,
      });
    }
  } else {
    move(
      boss,
      FIELD.width / 2 + Math.sin(time * 0.96) * 180,
      140 + Math.sin(time * 1.5) * 48,
      dt,
      3.5,
    );
    if (tick(boss, "finalRing", 0.55 - rank * 0.05, dt)) {
      const sign = Math.floor(time * 2) % 2 ? 1 : -1;
      emitRing({
        x: boss.x,
        y: boss.y,
        count: 26,
        speed: 135,
        offset: time * sign * 0.77,
        options: {
          color: sign > 0 ? COLORS.gold : COLORS.pink,
          shape: sign > 0 ? "orb" : "diamond",
          radius: 5.4,
          curve: sign * 0.13,
          accel: 12,
        },
        rank,
        ports: bulletPorts,
      });
    }
    if (tick(boss, "finalAim", 0.88, dt)) {
      emitAimedFan({
        x: boss.x,
        y: boss.y + 24,
        count: 11,
        spread: 1.1,
        speed: 250,
        options: {
          color: COLORS.cyan,
          shape: "needle",
          radius: 5.1,
          lead: 0.28,
          speedVariance: 0.18,
        },
        rank,
        player,
        ports: bulletPorts,
      });
    }
    if (tick(boss, "finalLaser", 2.85, dt, false)) {
      const angle = time * 0.19;
      ports.spawnLaser({
        cx: FIELD.width / 2,
        cy: FIELD.height * 0.5,
        angle,
        length: FIELD.height * 1.5,
        width: 20,
        warning: 0.86,
        active: 0.8,
        rotSpeed: 0.22,
        color: COLORS.gold,
      });
      ports.spawnLaser({
        cx: FIELD.width / 2,
        cy: FIELD.height * 0.5,
        angle: angle + Math.PI / 2,
        length: FIELD.height * 1.5,
        width: 20,
        warning: 0.86,
        active: 0.8,
        rotSpeed: 0.22,
        color: COLORS.pink,
      });
    }
    if (tick(boss, "finalWall", 1.42, dt, false)) {
      emitBulletWall({
        gapX: FIELD.width / 2 + Math.sin(time * 1.7) * 178,
        gapWidth: 90,
        speed: 200,
        color: COLORS.red,
        stagger: 4,
        rank,
        ports: bulletPorts,
      });
    }
  }
}
