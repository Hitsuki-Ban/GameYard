import { COLORS, FIELD } from "./catalog.js";
import { angleTo, clamp, lerp, wrapAngle } from "./math.js";

function assertRng(rng) {
  if (typeof rng?.range !== "function")
    throw new TypeError("Player effects require a range RNG port.");
}

export function getDronePositions({ player, droneCount }) {
  if (
    player === null ||
    typeof player !== "object" ||
    ![player.x, player.y].every(Number.isFinite) ||
    typeof player.focus !== "boolean"
  ) {
    throw new TypeError("Drone positions require finite player position and focus state.");
  }
  if (!Number.isSafeInteger(droneCount) || droneCount < 0 || droneCount > 6) {
    throw new RangeError("Drone count must be an integer from 0 through 6.");
  }
  const positions = [];
  for (let index = 0; index < droneCount; index += 1) {
    const centered = index - (droneCount - 1) / 2;
    if (player.focus) {
      positions.push({
        x: player.x + centered * 22,
        y: player.y + 20 + Math.abs(centered) * 2,
        angle: 0,
      });
    } else {
      const arc = droneCount === 1 ? 0 : centered / Math.max(1, (droneCount - 1) / 2);
      positions.push({
        x: player.x + arc * (34 + droneCount * 2),
        y: player.y + 18 + Math.abs(arc) * 16,
        angle: arc * 0.11,
      });
    }
  }
  return positions;
}

export function buildPlayerShotPattern({ player, droneCount, overdriveActive }) {
  if (
    player === null ||
    typeof player !== "object" ||
    ![player.x, player.y, player.power].every(Number.isFinite) ||
    typeof player.focus !== "boolean"
  ) {
    throw new TypeError("Player shot pattern requires finite player state.");
  }
  if (!Number.isSafeInteger(player.power) || player.power < 1 || player.power > 5) {
    throw new RangeError("Player power must be an integer from 1 through 5.");
  }
  if (typeof overdriveActive !== "boolean") throw new TypeError("overdriveActive must be boolean.");
  const baseDamage = 10 * (1 + (player.power - 1) * 0.16) * (overdriveActive ? 1.85 : 1);
  const offsets = player.focus
    ? player.power >= 4
      ? [-10, -5, 0, 5, 10]
      : player.power >= 2
        ? [-7, 0, 7]
        : [0]
    : player.power >= 4
      ? [-20, -10, 0, 10, 20]
      : player.power >= 2
        ? [-13, 0, 13]
        : [0];
  const bullets = offsets.map((offset, index) => {
    const spread = player.focus ? offset * 0.003 : offset * 0.012;
    return {
      x: player.x + offset * 0.62,
      y: player.y - 20 - Math.abs(offset) * 0.05,
      vx: Math.sin(spread) * 980,
      vy: -Math.cos(spread) * 980,
      radius: overdriveActive ? 5.3 : 3.4,
      damage: baseDamage * (index === Math.floor(offsets.length / 2) ? 1.15 : 0.86),
      color: overdriveActive ? (index % 2 ? COLORS.pink : COLORS.cyan) : COLORS.cyan,
      type: overdriveActive ? "lance" : "shot",
      pierce: overdriveActive ? 2 : 0,
      life: 1.3,
    };
  });
  const drones = getDronePositions({ player, droneCount });
  for (let index = 0; index < drones.length; index += 1) {
    const drone = drones[index];
    const angle = -Math.PI / 2 + drone.angle;
    bullets.push({
      x: drone.x,
      y: drone.y - 8,
      vx: Math.cos(angle) * 890,
      vy: Math.sin(angle) * 890,
      radius: overdriveActive ? 4.2 : 2.8,
      damage: baseDamage * 0.56,
      color: index % 2 ? COLORS.pinkSoft : COLORS.violet,
      type: "option",
      pierce: overdriveActive ? 1 : 0,
      life: 1.4,
    });
  }
  return bullets;
}

export function buildMissilePattern({ player, missilePower, overdriveActive }) {
  if (
    player === null ||
    typeof player !== "object" ||
    ![player.x, player.y].every(Number.isFinite)
  ) {
    throw new TypeError("Missile pattern requires finite player position.");
  }
  if (!Number.isFinite(missilePower) || missilePower <= 0) {
    throw new RangeError("Missile power must be positive.");
  }
  if (typeof overdriveActive !== "boolean") throw new TypeError("overdriveActive must be boolean.");
  const count = overdriveActive ? 2 : 1;
  const missiles = [];
  for (let index = 0; index < count; index += 1) {
    const side = index % 2 ? 1 : -1;
    missiles.push({
      x: player.x + side * 18,
      y: player.y + 3,
      vx: side * 90,
      vy: -310,
      radius: 6,
      damage: 42 * missilePower * (overdriveActive ? 1.35 : 1),
      color: COLORS.gold,
      type: "missile",
      turnRate: 5.3,
      speed: 430,
      life: 3,
      pierce: 0,
    });
  }
  return missiles;
}

export function steerMissile({ missile, target, dt }) {
  if (
    missile === null ||
    typeof missile !== "object" ||
    ![missile.x, missile.y, missile.vx, missile.vy, missile.turnRate, missile.speed].every(
      Number.isFinite,
    )
  ) {
    throw new TypeError("Missile steering requires finite missile state.");
  }
  if (
    target === null ||
    typeof target !== "object" ||
    ![target.x, target.y].every(Number.isFinite)
  ) {
    throw new TypeError("Missile steering requires a finite target.");
  }
  if (!Number.isFinite(dt) || dt <= 0) throw new RangeError("Missile dt must be positive.");
  const desired = angleTo(missile.x, missile.y, target.x, target.y);
  const current = Math.atan2(missile.vy, missile.vx);
  const difference = wrapAngle(desired - current);
  const next = current + clamp(difference, -missile.turnRate * dt, missile.turnRate * dt);
  return {
    vx: Math.cos(next) * missile.speed,
    vy: Math.sin(next) * missile.speed,
    rotation: next + Math.PI / 2,
  };
}

export function missileImpact({ baseDamage, missilePower }) {
  if (![baseDamage, missilePower].every(Number.isFinite) || baseDamage < 0 || missilePower <= 0) {
    throw new RangeError("Missile impact requires non-negative damage and positive power.");
  }
  return {
    directDamage: baseDamage,
    splashDamage: baseDamage * 0.62,
    splashRadius: 58 + missilePower * 9,
    explosionScale: 0.75 * missilePower,
  };
}

export function buildArcParticles({ x1, y1, x2, y2, level, rng }) {
  assertRng(rng);
  if (![x1, y1, x2, y2].every(Number.isFinite))
    throw new TypeError("Arc endpoints must be finite.");
  if (!Number.isSafeInteger(level) || level < 1 || level > 3) {
    throw new RangeError("Arc level must be an integer from 1 through 3.");
  }
  const count = 7 + level * 2;
  const segments = [];
  let previousX = x1;
  let previousY = y1;
  for (let index = 1; index <= count; index += 1) {
    const amount = index / count;
    const nextX = lerp(x1, x2, amount) + (index === count ? 0 : rng.range(-10, 10));
    const nextY = lerp(y1, y2, amount) + (index === count ? 0 : rng.range(-10, 10));
    const angle = Math.atan2(nextY - previousY, nextX - previousX);
    segments.push({
      x: (previousX + nextX) / 2,
      y: (previousY + nextY) / 2,
      vx: Math.cos(angle) * (Math.hypot(nextX - previousX, nextY - previousY) / 0.12) * 0.04,
      vy: Math.sin(angle) * (Math.hypot(nextX - previousX, nextY - previousY) / 0.12) * 0.04,
      life: 0.13,
      size: 2.2 + level * 0.35,
      color: index % 2 ? COLORS.cyan : COLORS.violet,
      type: "line",
      drag: 9,
      rotation: angle,
    });
    previousX = nextX;
    previousY = nextY;
  }
  return segments;
}

export function arcTrigger({ grazeCount, arcLevel }) {
  if (!Number.isSafeInteger(grazeCount) || grazeCount < 0) {
    throw new RangeError("Graze count must be a non-negative integer.");
  }
  if (!Number.isSafeInteger(arcLevel) || arcLevel < 0 || arcLevel > 3) {
    throw new RangeError("Arc level must be an integer from 0 through 3.");
  }
  return {
    triggered: arcLevel > 0 && grazeCount % Math.max(2, 6 - arcLevel) === 0,
    damage: 32 * arcLevel,
  };
}

export function overdriveStartDamage(novaLevel) {
  if (!Number.isSafeInteger(novaLevel) || novaLevel < 0 || novaLevel > 3) {
    throw new RangeError("Nova level must be an integer from 0 through 3.");
  }
  return 230 + novaLevel * 60;
}

export function buildNovaFinisher({ player, novaLevel, cancelledBullets, rng }) {
  assertRng(rng);
  if (
    player === null ||
    typeof player !== "object" ||
    ![player.x, player.y].every(Number.isFinite)
  ) {
    throw new TypeError("Nova finisher requires finite player position.");
  }
  if (!Number.isSafeInteger(novaLevel) || novaLevel < 0 || novaLevel > 3) {
    throw new RangeError("Nova level must be an integer from 0 through 3.");
  }
  if (!Number.isSafeInteger(cancelledBullets) || cancelledBullets < 0) {
    throw new RangeError("Cancelled bullet count must be a non-negative integer.");
  }
  const explosions = [];
  for (let index = 0; index < novaLevel * 3; index += 1) {
    const angle = (index / Math.max(1, novaLevel * 3)) * FIELD.tau;
    const distance = rng.range(55, 180);
    explosions.push({
      x: player.x + Math.cos(angle) * distance,
      y: player.y + Math.sin(angle) * distance,
      scale: 1.1,
      color: index % 2 ? COLORS.gold : COLORS.pink,
    });
  }
  return {
    damage: 320 + novaLevel * 260 + cancelledBullets * (0.12 + novaLevel * 0.05),
    shake: 14 + novaLevel * 4,
    explosions,
  };
}

export function createPickup({ options, rng }) {
  assertRng(rng);
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("Pickup options must be an object.");
  }
  return {
    x: options.x ?? 0,
    y: options.y ?? 0,
    vx: options.vx ?? rng.range(-70, 70),
    vy: options.vy ?? rng.range(-180, -40),
    type: options.type ?? "score",
    value: options.value ?? 120,
    age: 0,
    life: options.life ?? 5,
    rotation: rng.range(0, FIELD.tau),
  };
}

export function stepPickup({ pickup, player, dt }) {
  if (
    pickup === null ||
    typeof pickup !== "object" ||
    ![pickup.x, pickup.y, pickup.vx, pickup.vy, pickup.age, pickup.life].every(Number.isFinite)
  ) {
    throw new TypeError("Pickup step requires finite pickup state.");
  }
  if (
    player === null ||
    typeof player !== "object" ||
    ![player.x, player.y].every(Number.isFinite)
  ) {
    throw new TypeError("Pickup step requires finite player position.");
  }
  if (!Number.isFinite(dt) || dt <= 0) throw new RangeError("Pickup dt must be positive.");
  pickup.age += dt;
  pickup.life -= dt;
  pickup.rotation += dt * 4;
  const distance = Math.hypot(player.x - pickup.x, player.y - pickup.y);
  if (pickup.age > 0.24 || distance < 150) {
    const angle = angleTo(pickup.x, pickup.y, player.x, player.y);
    const pull = clamp(230 + (160 - Math.min(160, distance)) * 7, 230, 980);
    pickup.vx = lerp(pickup.vx, Math.cos(angle) * pull, 1 - Math.pow(0.001, dt));
    pickup.vy = lerp(pickup.vy, Math.sin(angle) * pull, 1 - Math.pow(0.001, dt));
  } else pickup.vy += 260 * dt;
  pickup.x += pickup.vx * dt;
  pickup.y += pickup.vy * dt;
  return { collected: distance < 18, expired: pickup.life <= 0 || pickup.y > FIELD.height + 80 };
}

export function createLaser(options) {
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("Laser options must be an object.");
  }
  const warning = options.warning ?? 0.85;
  const active = options.active ?? 0.8;
  return {
    cx: options.cx ?? FIELD.width / 2,
    cy: options.cy ?? FIELD.height / 2,
    angle: options.angle ?? Math.PI / 2,
    length: options.length ?? FIELD.height * 1.3,
    width: options.width ?? 22,
    warning,
    active,
    age: 0,
    life: warning + active,
    rotSpeed: options.rotSpeed ?? 0,
    color: options.color ?? COLORS.red,
    cancellable: options.cancellable !== false,
    pulse: options.pulse ?? 0,
  };
}

export function stepLaser(laser, dt) {
  if (laser === null || typeof laser !== "object") throw new TypeError("Laser state is required.");
  if (!Number.isFinite(dt) || dt <= 0) throw new RangeError("Laser dt must be positive.");
  laser.age += dt;
  laser.angle += laser.rotSpeed * dt;
  laser.pulse += dt * 8;
  return laser.age >= laser.life;
}
