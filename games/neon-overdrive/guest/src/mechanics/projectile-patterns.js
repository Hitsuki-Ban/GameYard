import { COLORS, FIELD } from "./catalog.js";
import { angleTo, clamp } from "./math.js";

function assertRank(rank) {
  if (!Number.isFinite(rank)) throw new TypeError("Pattern rank must be finite.");
}

function assertBulletPort(ports) {
  if (typeof ports?.spawnEnemyBullet !== "function") {
    throw new TypeError("Pattern spawnEnemyBullet port is required.");
  }
}

export function bulletCount(base, rank) {
  if (!Number.isFinite(base) || base <= 0)
    throw new RangeError("Bullet base count must be positive.");
  assertRank(rank);
  return Math.max(1, Math.round(base * (0.62 + rank * 0.68)));
}

export function bulletSpeed(base, rank) {
  if (!Number.isFinite(base) || base < 0)
    throw new RangeError("Bullet base speed must not be negative.");
  assertRank(rank);
  return base * (0.82 + rank * 0.34);
}

export function emitRing({ x, y, count, speed, offset, options, rank, ports }) {
  assertBulletPort(ports);
  if (![x, y, count, speed, offset].every(Number.isFinite) || options === null) {
    throw new TypeError("Ring pattern requires finite geometry and an options object.");
  }
  const actual = bulletCount(count, rank);
  for (let index = 0; index < actual; index += 1) {
    const angle = offset + (index / actual) * FIELD.tau;
    ports.spawnEnemyBullet({
      x,
      y,
      angle,
      speed: bulletSpeed(speed, rank),
      color: options.color ?? (index % 2 ? COLORS.pink : COLORS.cyan),
      shape: options.shape ?? "orb",
      radius: options.radius ?? 6,
      curve: options.curve ?? 0,
      accel: options.accel ?? 0,
      wobble: options.wobble ?? 0,
      wobbleFreq: options.wobbleFreq ?? 0,
      splitTime: options.splitTime ?? 0,
      splitCount: options.splitCount ?? 0,
      splitSpeed: options.splitSpeed ?? 0,
      delay: (options.delayStep ?? 0) * index,
      bounce: options.bounce,
      maxBounces: options.maxBounces,
    });
  }
}

export function emitFan({ x, y, baseAngle, count, spread, speed, options, rank, ports }) {
  assertBulletPort(ports);
  if (![x, y, baseAngle, count, spread, speed].every(Number.isFinite) || options === null) {
    throw new TypeError("Fan pattern requires finite geometry and an options object.");
  }
  const actual = bulletCount(count, rank);
  for (let index = 0; index < actual; index += 1) {
    const amount = actual === 1 ? 0.5 : index / (actual - 1);
    const angle = baseAngle - spread / 2 + spread * amount;
    ports.spawnEnemyBullet({
      x,
      y,
      angle,
      speed: bulletSpeed(speed * (1 + (options.speedVariance ?? 0) * (amount - 0.5)), rank),
      color: options.color ?? (index % 2 ? COLORS.pink : COLORS.cyan),
      shape: options.shape ?? "needle",
      radius: options.radius ?? 5.5,
      curve: options.curve ?? 0,
      accel: options.accel ?? 0,
      wobble: options.wobble ?? 0,
      wobbleFreq: options.wobbleFreq ?? 0,
      delay: (options.delayStep ?? 0) * index,
      bounce: options.bounce,
      maxBounces: options.maxBounces,
    });
  }
}

export function emitAimedFan({ x, y, count, spread, speed, options, rank, player, ports }) {
  if (
    player === null ||
    typeof player !== "object" ||
    ![player.x, player.y, player.vx, player.vy].every(Number.isFinite)
  ) {
    throw new TypeError("Aimed fan requires finite player position and velocity.");
  }
  const lead = options.lead ?? 0;
  emitFan({
    x,
    y,
    baseAngle: angleTo(x, y, player.x + player.vx * lead, player.y + player.vy * lead),
    count,
    spread,
    speed,
    options,
    rank,
    ports,
  });
}

export function emitBulletWall({ gapX, gapWidth, speed, color, stagger, rank, ports }) {
  assertBulletPort(ports);
  if (![gapX, gapWidth, speed, stagger].every(Number.isFinite) || typeof color !== "string") {
    throw new TypeError("Bullet wall requires explicit finite values and color.");
  }
  const spacing = 27 / (0.88 + rank * 0.16);
  let index = 0;
  for (let x = 12; x <= FIELD.width - 12; x += spacing) {
    if (Math.abs(x - gapX) < gapWidth / 2) continue;
    ports.spawnEnemyBullet({
      x,
      y: -18 - (index % 2) * stagger,
      angle: Math.PI / 2,
      speed: bulletSpeed(speed, rank),
      color: index % 3 === 0 ? COLORS.cyan : color,
      shape: index % 2 ? "diamond" : "needle",
      radius: 6,
      wobble: index % 3 === 0 ? 0.18 : 0,
      wobbleFreq: 2.2,
    });
    index += 1;
  }
}

export function createEnemyBullet(options) {
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("Enemy bullet options must be an object.");
  }
  const angle = options.angle ?? Math.atan2(options.vy ?? 1, options.vx ?? 0);
  const speed = options.speed ?? (Math.hypot(options.vx ?? 0, options.vy ?? 0) || 120);
  const x = options.x ?? FIELD.width / 2;
  const y = options.y ?? 0;
  return {
    x,
    y,
    prevX: x,
    prevY: y,
    angle,
    speed,
    vx: options.vx ?? Math.cos(angle) * speed,
    vy: options.vy ?? Math.sin(angle) * speed,
    ax: options.ax ?? 0,
    ay: options.ay ?? 0,
    accel: options.accel ?? 0,
    curve: options.curve ?? 0,
    wobble: options.wobble ?? 0,
    wobbleFreq: options.wobbleFreq ?? 0,
    radius: options.radius ?? 6,
    color: options.color ?? COLORS.pink,
    shape: options.shape ?? "orb",
    age: 0,
    life: options.life ?? 10,
    delay: options.delay ?? 0,
    alpha: options.alpha ?? 1,
    scale: options.scale ?? 1,
    rotation: options.rotation ?? angle + Math.PI / 2,
    spin: options.spin ?? 0,
    grazed: false,
    cancellable: options.cancellable !== false,
    splitTime: options.splitTime ?? 0,
    splitCount: options.splitCount ?? 0,
    splitSpeed: options.splitSpeed ?? 0,
    splitDone: false,
    bounce: Boolean(options.bounce),
    bounces: 0,
    maxBounces: options.maxBounces ?? 1,
  };
}

export function stepEnemyBullet({ bullet, dt, rank, overdriveActive, ports }) {
  if (bullet === null || typeof bullet !== "object")
    throw new TypeError("Enemy bullet state is required.");
  if (!Number.isFinite(dt) || dt <= 0) throw new RangeError("Enemy bullet dt must be positive.");
  if (typeof overdriveActive !== "boolean") throw new TypeError("overdriveActive must be boolean.");
  assertBulletPort(ports);
  const timeScale = overdriveActive ? 0.72 : 1;
  bullet.age += dt;
  bullet.rotation += bullet.spin * dt;
  if (bullet.delay > 0) {
    bullet.delay -= dt;
    return false;
  }
  bullet.prevX = bullet.x;
  bullet.prevY = bullet.y;
  bullet.speed += bullet.accel * dt * timeScale;
  bullet.angle += bullet.curve * dt * timeScale;
  const wobble = bullet.wobble ? Math.sin(bullet.age * bullet.wobbleFreq) * bullet.wobble : 0;
  bullet.vx = Math.cos(bullet.angle + wobble) * bullet.speed + bullet.ax * bullet.age;
  bullet.vy = Math.sin(bullet.angle + wobble) * bullet.speed + bullet.ay * bullet.age;
  bullet.x += bullet.vx * dt * timeScale;
  bullet.y += bullet.vy * dt * timeScale;
  if (bullet.bounce && bullet.bounces < bullet.maxBounces) {
    if ((bullet.x < 10 && bullet.vx < 0) || (bullet.x > FIELD.width - 10 && bullet.vx > 0)) {
      bullet.angle = Math.PI - bullet.angle;
      bullet.x = clamp(bullet.x, 10, FIELD.width - 10);
      bullet.bounces += 1;
    }
    if ((bullet.y < 10 && bullet.vy < 0) || (bullet.y > FIELD.height - 10 && bullet.vy > 0)) {
      bullet.angle = -bullet.angle;
      bullet.y = clamp(bullet.y, 10, FIELD.height - 10);
      bullet.bounces += 1;
    }
  }
  if (bullet.splitTime > 0 && !bullet.splitDone && bullet.age >= bullet.splitTime) {
    bullet.splitDone = true;
    const count = bullet.splitCount || 3;
    for (let index = 0; index < count; index += 1) {
      ports.spawnEnemyBullet({
        x: bullet.x,
        y: bullet.y,
        angle: bullet.angle + (index - (count - 1) / 2) * 0.42,
        speed: bulletSpeed(bullet.splitSpeed || 110, rank),
        color: bullet.color,
        shape: "needle",
        radius: Math.max(4.2, bullet.radius - 1.4),
        curve: -bullet.curve * 0.7,
      });
    }
    bullet.speed *= 0.62;
    bullet.curve *= -0.5;
  }
  return (
    bullet.age > bullet.life ||
    bullet.x < -90 ||
    bullet.x > FIELD.width + 90 ||
    bullet.y < -100 ||
    bullet.y > FIELD.height + 100
  );
}
