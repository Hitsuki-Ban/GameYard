import { COLORS } from "../mechanics/catalog.js";

const TAU = Math.PI * 2;
const BULLET_SHAPES = Object.freeze(["orb", "needle", "diamond", "star"]);
const PICKUP_TYPES = Object.freeze({ score: COLORS.gold, drive: COLORS.cyan });

function colorWithAlpha(hex, alpha) {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

function makeBullet(document, color, shape) {
  const canvas = document.createElement("canvas");
  canvas.width = 48;
  canvas.height = 48;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("Neon SpriteBank requires Canvas 2D.");
  context.translate(24, 24);
  context.shadowColor = color;
  context.shadowBlur = 12;
  context.fillStyle = color;
  context.strokeStyle = "#ffffff";
  context.lineWidth = 1.1;
  context.globalCompositeOperation = "lighter";

  if (shape === "needle") {
    context.beginPath();
    context.moveTo(0, -16);
    context.quadraticCurveTo(7, -3, 0, 15);
    context.quadraticCurveTo(-7, -3, 0, -16);
    context.fill();
    context.globalAlpha = 0.7;
    context.stroke();
  } else if (shape === "diamond") {
    context.rotate(Math.PI / 4);
    context.fillRect(-7, -7, 14, 14);
    context.globalAlpha = 0.66;
    context.strokeRect(-6.5, -6.5, 13, 13);
  } else if (shape === "star") {
    context.beginPath();
    for (let index = 0; index < 10; index += 1) {
      const angle = -Math.PI / 2 + (index * Math.PI) / 5;
      const radius = index % 2 === 0 ? 14 : 5.5;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.closePath();
    context.fill();
    context.globalAlpha = 0.72;
    context.stroke();
  } else if (shape === "orb") {
    const gradient = context.createRadialGradient(-3, -4, 1, 0, 0, 13);
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(0.22, color);
    gradient.addColorStop(1, colorWithAlpha(color, 0.06));
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(0, 0, 13, 0, TAU);
    context.fill();
    context.globalAlpha = 0.55;
    context.beginPath();
    context.arc(0, 0, 8.5, 0, TAU);
    context.stroke();
  } else {
    throw new RangeError(`Unknown Neon bullet sprite shape: ${shape}`);
  }
  return canvas;
}

function makePickup(document, color) {
  const canvas = document.createElement("canvas");
  canvas.width = 40;
  canvas.height = 40;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("Neon SpriteBank requires Canvas 2D.");
  context.translate(20, 20);
  context.rotate(Math.PI / 4);
  context.fillStyle = color;
  context.strokeStyle = "#ffffff";
  context.shadowColor = color;
  context.shadowBlur = 12;
  context.globalCompositeOperation = "lighter";
  context.fillRect(-7, -7, 14, 14);
  context.globalAlpha = 0.7;
  context.strokeRect(-5, -5, 10, 10);
  return canvas;
}

function makeGlow(document, color) {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("Neon SpriteBank requires Canvas 2D.");
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, colorWithAlpha(color, 0.42));
  gradient.addColorStop(0.2, colorWithAlpha(color, 0.24));
  gradient.addColorStop(0.55, colorWithAlpha(color, 0.09));
  gradient.addColorStop(1, colorWithAlpha(color, 0));
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  return canvas;
}

export function createSpriteBank(document) {
  const bullets = new Map();
  const pickups = new Map();
  const glows = new Map();
  for (const color of Object.values(COLORS)) {
    glows.set(color, makeGlow(document, color));
    for (const shape of BULLET_SHAPES) {
      bullets.set(`${color}-${shape}`, makeBullet(document, color, shape));
    }
  }
  for (const [type, color] of Object.entries(PICKUP_TYPES)) {
    pickups.set(type, makePickup(document, color));
  }

  return {
    bullet(color, shape) {
      const sprite = bullets.get(`${color}-${shape}`);
      if (sprite === undefined) {
        throw new RangeError(`No Neon bullet sprite for ${color}/${shape}.`);
      }
      return sprite;
    },
    pickup(type) {
      const sprite = pickups.get(type);
      if (sprite === undefined) throw new RangeError(`Unknown Neon pickup type: ${type}`);
      return sprite;
    },
    glow(color) {
      const sprite = glows.get(color);
      if (sprite === undefined) throw new RangeError(`No Neon glow sprite for ${color}.`);
      return sprite;
    },
    dispose() {
      for (const canvas of [...bullets.values(), ...pickups.values(), ...glows.values()]) {
        canvas.width = 1;
        canvas.height = 1;
      }
      bullets.clear();
      pickups.clear();
      glows.clear();
    },
  };
}
