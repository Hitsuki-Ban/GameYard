import { clamp, distanceSquared } from "./math.js";

function assertGeometry(values) {
  if (!values.every(Number.isFinite)) throw new TypeError("Geometry requires finite numbers.");
}

export function closestPointOnSegment(px, py, x1, y1, x2, y2) {
  assertGeometry([px, py, x1, y1, x2, y2]);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy || 1;
  const amount = clamp(((px - x1) * dx + (py - y1) * dy) / lengthSquared, 0, 1);
  return { x: x1 + dx * amount, y: y1 + dy * amount, amount };
}

export function pointSegmentDistance(px, py, x1, y1, x2, y2) {
  const point = closestPointOnSegment(px, py, x1, y1, x2, y2);
  return Math.hypot(px - point.x, py - point.y);
}

export function segmentCircleHit(x1, y1, x2, y2, cx, cy, radius) {
  assertGeometry([x1, y1, x2, y2, cx, cy, radius]);
  if (radius < 0) throw new RangeError("Circle radius must not be negative.");
  const point = closestPointOnSegment(cx, cy, x1, y1, x2, y2);
  return distanceSquared(point.x, point.y, cx, cy) <= radius * radius;
}

export function laserSegment(laser) {
  if (
    laser === null ||
    typeof laser !== "object" ||
    ![laser.cx, laser.cy, laser.angle, laser.length].every(Number.isFinite) ||
    laser.length < 0
  ) {
    throw new TypeError("Laser segment requires finite cx, cy, angle, and non-negative length.");
  }
  const half = laser.length / 2;
  const dx = Math.cos(laser.angle) * half;
  const dy = Math.sin(laser.angle) * half;
  return { x1: laser.cx - dx, y1: laser.cy - dy, x2: laser.cx + dx, y2: laser.cy + dy };
}
