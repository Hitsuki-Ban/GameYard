import { COLORS, ENEMY_DEFINITIONS, FIELD } from "./catalog.js";
import { angleTo, lerp } from "./math.js";
import { bulletSpeed, emitAimedFan, emitFan, emitRing } from "./projectile-patterns.js";

function requireRng(rng) {
  if (typeof rng?.next !== "function" || typeof rng?.range !== "function") {
    throw new TypeError("Enemy mechanics require next and range RNG ports.");
  }
}

function chance(rng, probability) {
  return rng.next() < probability;
}

export function createEnemyState({ type, options, stageIndex, rng }) {
  requireRng(rng);
  const definition = ENEMY_DEFINITIONS[type];
  if (definition === undefined) throw new RangeError(`Unknown enemy type: ${type}`);
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("Enemy options must be an object.");
  }
  if (!Number.isSafeInteger(stageIndex) || stageIndex < 0 || stageIndex > 2) {
    throw new RangeError("Enemy stageIndex must be 0, 1, or 2.");
  }
  const x = options.x ?? rng.range(50, FIELD.width - 50);
  const y = options.y ?? -40;
  const armored = Boolean(options.armored);
  const hp = definition.hp * (armored ? 1.45 : 1) * (1 + stageIndex * 0.09);
  return {
    type,
    x,
    y,
    originX: options.originX ?? x,
    originY: options.originY ?? y,
    vx: options.vx ?? 0,
    vy: options.vy ?? 0,
    speed: options.speed ?? 120,
    targetY: options.targetY ?? rng.range(105, 260),
    amp: options.amp ?? 72,
    phase: options.phase ?? rng.range(0, FIELD.tau),
    side: options.side ?? (x < FIELD.width / 2 ? 1 : -1),
    hp,
    maxHp: hp,
    radius: definition.radius * (armored ? 1.08 : 1),
    score: definition.score,
    color: options.color ?? (chance(rng, 0.5) ? COLORS.pink : COLORS.cyan),
    age: 0,
    fireTimer: options.fireDelay ?? rng.range(0.35, 1.1),
    auxTimer: rng.range(1.2, 2.2),
    rotation: rng.range(0, FIELD.tau),
    spin: rng.range(-1.5, 1.5),
    dead: false,
    entered: false,
    splitShots: Boolean(options.splitShots),
    revenge: Boolean(options.revenge),
    mirror: Boolean(options.mirror),
    armored,
    finalEscort: Boolean(options.finalEscort),
    contactDamage: true,
  };
}

function requirePorts(ports) {
  for (const name of ["spawnEnemyBullet", "spawnEnemy", "spawnLaser"]) {
    if (typeof ports?.[name] !== "function") throw new TypeError(`Enemy port ${name} is required.`);
  }
}

export function stepEnemyPattern({ enemy, dt, rank, player, rng, ports }) {
  requireRng(rng);
  requirePorts(ports);
  if (enemy === null || typeof enemy !== "object") throw new TypeError("Enemy state is required.");
  if (!Number.isFinite(dt) || dt <= 0) throw new RangeError("Enemy dt must be positive.");
  if (!Number.isFinite(rank)) throw new TypeError("Enemy rank must be finite.");
  if (player === null || typeof player !== "object")
    throw new TypeError("Enemy player target is required.");
  enemy.age += dt;
  enemy.rotation += enemy.spin * dt;
  enemy.fireTimer -= dt;
  enemy.auxTimer -= dt;
  const bulletPorts = { spawnEnemyBullet: ports.spawnEnemyBullet };

  if (enemy.type === "scout") {
    enemy.y += enemy.speed * dt;
    enemy.x = enemy.originX + Math.sin(enemy.age * 2.2 + enemy.phase) * enemy.amp;
    if (enemy.fireTimer <= 0 && enemy.y > 45 && enemy.y < FIELD.height * 0.64) {
      enemy.fireTimer += 1.35 - rank * 0.42;
      emitAimedFan({
        x: enemy.x,
        y: enemy.y + 8,
        count: 3 + (rank > 0.72 ? 2 : 0),
        spread: 0.32,
        speed: 175,
        options: { color: enemy.color, shape: "needle", radius: 5 },
        rank,
        player,
        ports: bulletPorts,
      });
    }
  } else if (enemy.type === "diver") {
    enemy.x += enemy.side * (150 + rank * 60) * dt;
    enemy.y += (78 + Math.sin(enemy.age * 2.8 + enemy.phase) * 42) * dt;
    if (enemy.fireTimer <= 0 && enemy.y > 55 && enemy.y < FIELD.height * 0.72) {
      enemy.fireTimer += 0.92 - rank * 0.2;
      ports.spawnEnemyBullet({
        x: enemy.x,
        y: enemy.y,
        angle: angleTo(enemy.x, enemy.y, player.x, player.y),
        speed: bulletSpeed(205, rank),
        color: enemy.color,
        shape: "diamond",
        radius: 5.5,
        curve: enemy.mirror ? enemy.side * 0.32 : 0,
      });
    }
  } else if (enemy.type === "spinner") {
    if (!enemy.entered) {
      enemy.y = lerp(enemy.y, enemy.targetY, 1 - Math.pow(0.02, dt));
      if (Math.abs(enemy.y - enemy.targetY) < 3) enemy.entered = true;
    } else {
      enemy.x += Math.sin(enemy.age * 1.45 + enemy.phase) * 26 * dt;
      enemy.y += Math.sin(enemy.age * 1.1 + enemy.phase) * 7 * dt;
    }
    if (enemy.fireTimer <= 0 && enemy.y > 40) {
      enemy.fireTimer += 1.32 - rank * 0.24;
      emitRing({
        x: enemy.x,
        y: enemy.y,
        count: 12,
        speed: 135,
        offset: enemy.rotation,
        options: {
          color: enemy.color,
          shape: "orb",
          radius: 5.5,
          curve: enemy.spin * 0.055,
          splitTime: enemy.splitShots ? 1.65 : 0,
          splitCount: enemy.splitShots ? 3 : 0,
          splitSpeed: enemy.splitShots ? 105 : 0,
        },
        rank,
        ports: bulletPorts,
      });
    }
  } else if (enemy.type === "turret") {
    if (!enemy.entered) {
      enemy.y = lerp(enemy.y, enemy.targetY, 1 - Math.pow(0.026, dt));
      if (Math.abs(enemy.y - enemy.targetY) < 3) enemy.entered = true;
    } else enemy.x += Math.sin(enemy.age * 0.95 + enemy.phase) * 18 * dt;
    if (enemy.fireTimer <= 0 && enemy.y > 35) {
      enemy.fireTimer += 0.78 - rank * 0.14;
      emitAimedFan({
        x: enemy.x,
        y: enemy.y + 12,
        count: 5,
        spread: 0.65,
        speed: 185,
        options: { color: enemy.color, shape: "needle", radius: 5.4, speedVariance: 0.18 },
        rank,
        player,
        ports: bulletPorts,
      });
    }
    if (enemy.auxTimer <= 0 && enemy.entered) {
      enemy.auxTimer += 2.8;
      emitRing({
        x: enemy.x,
        y: enemy.y,
        count: 8,
        speed: 105,
        offset: enemy.rotation,
        options: {
          color: enemy.color === COLORS.cyan ? COLORS.pink : COLORS.cyan,
          shape: "diamond",
          radius: 5,
          curve: enemy.spin * -0.08,
        },
        rank,
        ports: bulletPorts,
      });
    }
  } else if (enemy.type === "orbiter") {
    if (!enemy.entered) {
      enemy.x += enemy.side * 170 * dt;
      enemy.y += Math.sin(enemy.age * 2 + enemy.phase) * 20 * dt;
      if ((enemy.side > 0 && enemy.x > 105) || (enemy.side < 0 && enemy.x < FIELD.width - 105)) {
        enemy.entered = true;
      }
    } else {
      const radius = 150 + Math.sin(enemy.phase) * 32;
      const angle = enemy.age * enemy.side * 0.66 + enemy.phase;
      enemy.x = lerp(enemy.x, FIELD.width / 2 + Math.cos(angle) * radius, 1 - Math.pow(0.01, dt));
      enemy.y = lerp(enemy.y, 225 + Math.sin(angle) * radius * 0.45, 1 - Math.pow(0.01, dt));
    }
    if (enemy.fireTimer <= 0 && enemy.y > 35) {
      enemy.fireTimer += 1.05 - rank * 0.18;
      emitFan({
        x: enemy.x,
        y: enemy.y,
        baseAngle: Math.PI / 2 + enemy.side * 0.22,
        count: 5,
        spread: 1,
        speed: 150,
        options: { color: enemy.color, shape: "diamond", radius: 5.2, curve: enemy.side * 0.18 },
        rank,
        ports: bulletPorts,
      });
    }
  } else if (enemy.type === "carrier") {
    if (!enemy.entered) {
      enemy.y = lerp(enemy.y, enemy.targetY, 1 - Math.pow(0.018, dt));
      if (Math.abs(enemy.y - enemy.targetY) < 4) enemy.entered = true;
    } else {
      enemy.x += Math.sin(enemy.age * 0.62 + enemy.phase) * 22 * dt;
      enemy.y += Math.sin(enemy.age * 0.73) * 5 * dt;
    }
    if (enemy.fireTimer <= 0 && enemy.y > 20) {
      enemy.fireTimer += 1.05 - rank * 0.15;
      emitRing({
        x: enemy.x,
        y: enemy.y + 12,
        count: 14,
        speed: 112 + (enemy.armored ? 20 : 0),
        offset: enemy.rotation,
        options: {
          color: chance(rng, 0.5) ? COLORS.pink : COLORS.cyan,
          shape: "orb",
          radius: 6.2,
          curve: Math.sin(enemy.age) * 0.1,
        },
        rank,
        ports: bulletPorts,
      });
      emitAimedFan({
        x: enemy.x,
        y: enemy.y + 18,
        count: 5,
        spread: 0.45,
        speed: 205,
        options: { color: COLORS.gold, shape: "needle", radius: 5.4 },
        rank,
        player,
        ports: bulletPorts,
      });
    }
    if (enemy.auxTimer <= 0 && enemy.entered) {
      enemy.auxTimer += enemy.finalEscort ? 1.25 : 2.15;
      const side = chance(rng, 0.5) ? -1 : 1;
      ports.spawnEnemy("scout", {
        x: enemy.x + side * 26,
        y: enemy.y + 18,
        originX: enemy.x + side * 26,
        amp: 90,
        phase: rng.range(0, FIELD.tau),
        speed: 150,
        revenge: enemy.revenge || enemy.finalEscort,
      });
    }
  } else if (enemy.type === "elite") {
    if (!enemy.entered) {
      enemy.y = lerp(enemy.y, enemy.targetY, 1 - Math.pow(0.02, dt));
      if (Math.abs(enemy.y - enemy.targetY) < 4) enemy.entered = true;
    } else {
      enemy.x =
        FIELD.width / 2 +
        Math.sin(enemy.age * 0.72 + enemy.phase) * (125 + Math.sin(enemy.phase) * 40);
      enemy.y = enemy.targetY + Math.sin(enemy.age * 1.2 + enemy.phase) * 36;
    }
    if (enemy.fireTimer <= 0 && enemy.y > 25) {
      enemy.fireTimer += 0.66 - rank * 0.12;
      emitRing({
        x: enemy.x,
        y: enemy.y,
        count: 10,
        speed: 155,
        offset: enemy.rotation * 0.7,
        options: {
          color: enemy.color,
          shape: "diamond",
          radius: 5.6,
          curve: Math.sin(enemy.age * 0.7) * 0.12,
        },
        rank,
        ports: bulletPorts,
      });
      emitAimedFan({
        x: enemy.x,
        y: enemy.y,
        count: 7,
        spread: 0.82,
        speed: 220,
        options: { color: COLORS.gold, shape: "needle", radius: 5.2, speedVariance: 0.14 },
        rank,
        player,
        ports: bulletPorts,
      });
    }
    if (enemy.auxTimer <= 0 && enemy.entered) {
      enemy.auxTimer += 2.25;
      ports.spawnLaser({
        cx: enemy.x,
        cy: FIELD.height / 2,
        angle: Math.PI / 2 + Math.sin(enemy.age) * 0.16,
        length: FIELD.height * 1.2,
        width: 18,
        warning: 0.72,
        active: 0.45,
        color: enemy.color,
      });
    }
  } else throw new RangeError(`Unknown enemy type: ${enemy.type}`);

  return enemy.y > FIELD.height + 100 || enemy.x < -130 || enemy.x > FIELD.width + 130;
}
