export function clamp(value, min, max) {
  if (![value, min, max].every(Number.isFinite) || min > max) {
    throw new RangeError("clamp requires finite bounds with min <= max.");
  }
  return Math.max(min, Math.min(max, value));
}

export function lerp(start, end, amount) {
  if (![start, end, amount].every(Number.isFinite)) {
    throw new TypeError("lerp requires finite numbers.");
  }
  return start + (end - start) * amount;
}

export function distanceSquared(ax, ay, bx, by) {
  if (![ax, ay, bx, by].every(Number.isFinite)) {
    throw new TypeError("distanceSquared requires finite coordinates.");
  }
  return (ax - bx) ** 2 + (ay - by) ** 2;
}

export function angleTo(ax, ay, bx, by) {
  if (![ax, ay, bx, by].every(Number.isFinite)) {
    throw new TypeError("angleTo requires finite coordinates.");
  }
  return Math.atan2(by - ay, bx - ax);
}

export function wrapAngle(angle) {
  if (!Number.isFinite(angle)) throw new TypeError("wrapAngle requires a finite angle.");
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}
