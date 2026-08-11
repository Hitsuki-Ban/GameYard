import { COLORS, FIELD } from "./mechanics/catalog.js";
import { getDronePositions } from "./mechanics/player-effects.js";
import { createRng } from "./rng.js";
import { createSpriteBank } from "./render/sprite-bank.js";

const TAU = FIELD.tau;
const W = FIELD.width;
const H = FIELD.height;
const PRESENTATION_SEED = 0x4e454f4e;
const ENEMY_TYPES = new Set(["scout", "diver", "spinner", "turret", "orbiter", "carrier", "elite"]);
const SCREEN_TYPES = new Set(["title", "playing", "upgrade", "result"]);
const PARTICLE_TYPES = new Set(["spark", "ring", "line"]);
const PLAYER_BULLET_TYPES = new Set(["missile", "shot", "lance", "option"]);

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (from, to, amount) => from + (to - from) * amount;
const easeOutCubic = (amount) => 1 - (1 - clamp(amount, 0, 1)) ** 3;
const easeInOutCubic = (amount) =>
  amount < 0.5 ? 4 * amount ** 3 : 1 - (-2 * amount + 2) ** 3 / 2;

function colorWithAlpha(hex, alpha) {
  if (!/^#[0-9a-f]{6}$/iu.test(hex)) throw new TypeError(`Invalid Neon color: ${hex}`);
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

function position(entity, alpha) {
  return {
    x: lerp(entity.prevX, entity.x, alpha),
    y: lerp(entity.prevY, entity.y, alpha),
  };
}

function floaterText(floater) {
  switch (floater.textId) {
    case "rush":
      return `RUSH ${floater.value}`;
    case "shieldBreak":
      return "SHIELD BREAK";
    case "firstSave":
      return "FIRST SAVE";
    case "autoSave":
      return "AUTO SAVE";
    case "pulse":
      return "PULSE";
    case "power":
      return `POWER ${floater.value}`;
    case "breakGuard":
      return "BREAK GUARD";
    case "rebootGuard":
      return "REBOOT GUARD";
    case "noHitBreak":
      return "NO HIT BREAK";
    case "timeBreak":
      return "TIME BREAK";
    case "phaseBreak":
      return "PHASE BREAK";
    case "phaseBonus":
      return `PHASE +${floater.value}`;
    default:
      throw new RangeError(`Unknown Neon floater text id: ${floater.textId}`);
  }
}

function promptText(prompt) {
  switch (prompt.textId) {
    case "buildDrive":
      return "BUILD DRIVE";
    case "move":
      return "MOVE // AUTO FIRE";
    case "graze":
      return "GRAZE // BUILD DRIVE";
    case "drop":
      return "PRESS SPACE // DROP";
    default:
      throw new RangeError(`Unknown Neon world prompt text id: ${prompt.textId}`);
  }
}

function bannerTitle(banner) {
  switch (banner.titleId) {
    case "warning":
      return "WARNING";
    case "bossErased":
      return "BOSS ERASED";
    case "phase":
      return `PHASE ${banner.value}`;
    case "act":
      if (![1, 2, 3].includes(banner.value)) {
        throw new RangeError(`Unknown Neon act number: ${banner.value}`);
      }
      return `ACT ${["I", "II", "III"][banner.value - 1]}`;
    case "overdrive":
      return "OVERDRIVE";
    case "autoDrop":
      return "AUTO DROP";
    case "rageReboot":
      return "RAGE REBOOT";
    case "rush":
      if (banner.value !== 180) throw new RangeError(`Unknown Neon rush value: ${banner.value}`);
      return "RUSH 180";
    case "endless":
      return "ENDLESS";
    default:
      throw new RangeError(`Unknown Neon banner title id: ${banner.titleId}`);
  }
}

function bannerDetail(banner) {
  switch (banner.detailId) {
    case "boss0":
      return "AELLA // THE FEED";
    case "boss1":
      return "MIRROR SAINT";
    case "boss2":
      return "THE ALGORITHM";
    case "breakScreen":
      return "BREAK THE SCREEN";
    case "sector":
      return `SECTOR ${banner.value}`;
    case "reserve":
      return `${banner.value} RESERVE`;
    case "stage0":
      return "SYNAPSE CITY";
    case "stage1":
      return "GLASS TEMPLE";
    case "stage2":
      return "ZERO SUN";
    case "noBrakes":
      return "NO BRAKES / HIGH SCORE";
    case "rankNeverSleeps":
      return "RANK NEVER SLEEPS";
    default:
      throw new RangeError(`Unknown Neon banner detail id: ${banner.detailId}`);
  }
}

function requireCanvas(document) {
  const canvas = document.getElementById("gameCanvas");
  if (!(canvas instanceof document.defaultView.HTMLCanvasElement)) {
    throw new Error("Neon renderer requires #gameCanvas.");
  }
  return canvas;
}

export function createRenderer(document) {
  const canvas = requireCanvas(document);
  const context = canvas.getContext("2d", { alpha: false, desynchronized: true });
  if (context === null) throw new Error("Neon Overdrive requires Canvas 2D.");
  canvas.width = W;
  canvas.height = H;

  const sprites = createSpriteBank(document);
  const rng = createRng(PRESENTATION_SEED);
  const stars = Array.from({ length: 92 }, () => ({
    x: rng.range(0, W),
    y: rng.range(0, H),
    z: rng.range(0.2, 1),
    tw: rng.range(0, TAU),
  }));
  const cityBlocks = Array.from({ length: 18 }, (_, index) => ({
    x: index * 36 - 20,
    width: rng.range(24, 58),
    height: rng.range(70, 240),
    seed: rng.range(0, 100),
  }));
  let disposed = false;

  function drawGlow(color, x, y, diameter, opacity = 1) {
    context.save();
    context.globalAlpha *= opacity;
    context.drawImage(sprites.glow(color), x - diameter / 2, y - diameter / 2, diameter, diameter);
    context.restore();
  }

  function strokeGlow(color, lineWidth, spread) {
    const alpha = context.globalAlpha;
    context.save();
    context.strokeStyle = color;
    context.globalAlpha = alpha * 0.08;
    context.lineWidth = lineWidth + spread * 1.6;
    context.stroke();
    context.globalAlpha = alpha * 0.17;
    context.lineWidth = lineWidth + spread * 0.75;
    context.stroke();
    context.restore();
    context.lineWidth = lineWidth;
    context.stroke();
  }

  function fillTextGlow(text, x, y, color, spread) {
    const alpha = context.globalAlpha;
    context.save();
    context.strokeStyle = color;
    context.globalAlpha = alpha * 0.1;
    context.lineWidth = spread * 1.5;
    context.strokeText(text, x, y);
    context.globalAlpha = alpha * 0.2;
    context.lineWidth = spread * 0.7;
    context.strokeText(text, x, y);
    context.restore();
    context.fillText(text, x, y);
  }

  function drawCityBackground(time) {
    const horizon = 325;
    context.save();
    context.globalAlpha = 0.16;
    context.strokeStyle = COLORS.cyan;
    context.lineWidth = 1;
    const scroll = (time * 85) % 54;
    for (let y = horizon; y < H + 60; y += 54) {
      const amount = (y - horizon + scroll) / (H - horizon);
      const projectedY = horizon + amount * amount * (H - horizon);
      context.beginPath();
      context.moveTo(0, projectedY);
      context.lineTo(W, projectedY);
      context.stroke();
    }
    for (let index = -6; index <= 6; index += 1) {
      context.beginPath();
      context.moveTo(W / 2, horizon);
      context.lineTo(W / 2 + index * 110, H);
      context.stroke();
    }
    context.restore();

    context.save();
    context.globalAlpha = 0.22;
    for (let side = 0; side < 2; side += 1) {
      for (let index = 0; index < cityBlocks.length; index += 1) {
        const block = cityBlocks[index];
        const sourceX = side === 0 ? block.x - 120 : W - block.x + 90;
        const parallax = (time * (8 + (index % 3) * 2)) % (W + 160);
        const x = side === 0 ? sourceX - parallax * 0.06 : sourceX + parallax * 0.06;
        const y = horizon - block.height;
        context.fillStyle = index % 2 ? "rgba(18,32,65,0.75)" : "rgba(25,14,51,0.8)";
        context.fillRect(x, y, block.width, block.height + 12);
        context.fillStyle =
          index % 3 ? colorWithAlpha(COLORS.cyan, 0.38) : colorWithAlpha(COLORS.pink, 0.38);
        const rows = Math.floor(block.height / 22);
        for (let row = 0; row < rows; row += 1) {
          if ((row + index) % 3 === 0) {
            context.fillRect(x + 6, y + 9 + row * 20, Math.max(2, block.width - 12), 2);
          }
        }
      }
    }
    context.restore();
  }

  function drawGlassBackground(time) {
    context.save();
    context.translate(W / 2, H * 0.45);
    context.globalCompositeOperation = "lighter";
    for (let layer = 0; layer < 7; layer += 1) {
      const radius = 90 + layer * 62 + Math.sin(time * 0.6 + layer) * 12;
      const sides = 5 + (layer % 4);
      context.rotate((layer % 2 ? 1 : -1) * time * 0.025);
      context.strokeStyle =
        layer % 2 ? colorWithAlpha(COLORS.cyan, 0.1) : colorWithAlpha(COLORS.violet, 0.1);
      context.lineWidth = 1.2;
      context.beginPath();
      for (let index = 0; index <= sides; index += 1) {
        const angle = (index / sides) * TAU;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius * 0.72;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.stroke();
    }
    context.restore();

    context.save();
    context.globalAlpha = 0.07;
    context.fillStyle = COLORS.cyan;
    const offset = (time * 18) % 90;
    for (let y = -90 + offset; y < H; y += 90) {
      context.beginPath();
      context.moveTo(0, y + 50);
      context.lineTo(W / 2, y);
      context.lineTo(W, y + 50);
      context.lineTo(W / 2, y + 100);
      context.closePath();
      context.fill();
    }
    context.restore();
  }

  function drawZeroSunBackground(time) {
    const x = W / 2;
    const y = 255;
    context.save();
    const glow = context.createRadialGradient(x, y, 0, x, y, 205);
    glow.addColorStop(0, "rgba(255,247,214,0.75)");
    glow.addColorStop(0.08, "rgba(255,61,76,0.48)");
    glow.addColorStop(0.36, "rgba(255,24,91,0.10)");
    glow.addColorStop(1, "rgba(255,0,80,0)");
    context.fillStyle = glow;
    context.fillRect(x - 220, y - 220, 440, 440);
    context.globalCompositeOperation = "lighter";
    context.strokeStyle = colorWithAlpha(COLORS.red, 0.17);
    context.lineWidth = 1.2;
    for (let index = 0; index < 10; index += 1) {
      const radius = 62 + index * 30 + Math.sin(time * 0.8 + index) * 7;
      context.beginPath();
      context.ellipse(x, y, radius, radius * 0.42, time * 0.06 * (index % 2 ? 1 : -1), 0, TAU);
      context.stroke();
    }
    context.globalCompositeOperation = "source-over";
    context.fillStyle = "#020208";
    context.beginPath();
    context.arc(x, y, 47 + Math.sin(time * 1.8) * 3, 0, TAU);
    context.fill();
    context.restore();

    context.save();
    context.globalAlpha = 0.12;
    context.strokeStyle = COLORS.gold;
    for (let index = 0; index < 24; index += 1) {
      const angle = (index / 24) * TAU + time * 0.09;
      context.beginPath();
      context.moveTo(x + Math.cos(angle) * 75, y + Math.sin(angle) * 75);
      context.lineTo(x + Math.cos(angle) * 340, y + Math.sin(angle) * 340);
      context.stroke();
    }
    context.restore();
  }

  function drawBackground(state, time) {
    const themes = [
      ["#05040d", "#0b0a28", "#061a23"],
      ["#040817", "#071f34", "#160b2d"],
      ["#080309", "#24070e", "#0a061a"],
    ];
    const theme = themes[state.stage];
    if (theme === undefined) throw new RangeError(`Unknown Neon stage: ${state.stage}`);
    const gradient = context.createLinearGradient(0, 0, 0, H);
    gradient.addColorStop(0, theme[0]);
    gradient.addColorStop(0.55, theme[1]);
    gradient.addColorStop(1, theme[2]);
    context.fillStyle = gradient;
    context.fillRect(0, 0, W, H);

    const speedBoost = 1 + state.rank * 1.2 + (state.overdrive > 0 ? 1.5 : 0);
    context.save();
    context.globalCompositeOperation = "lighter";
    for (const star of stars) {
      const y = ((star.y + time * (24 + star.z * 90) * speedBoost) % (H + 30)) - 15;
      const x = star.x + Math.sin(time * 0.23 + star.tw) * star.z * 7;
      context.globalAlpha = 0.15 + star.z * 0.62;
      context.fillStyle =
        state.stage === 2 && star.z > 0.66
          ? COLORS.red
          : state.stage === 1
            ? COLORS.cyanSoft
            : COLORS.white;
      context.fillRect(x, y, Math.max(0.8, star.z * 1.7), 1 + star.z * (4 + state.rank * 8));
    }
    context.restore();

    if (state.stage === 0) drawCityBackground(time);
    else if (state.stage === 1) drawGlassBackground(time);
    else if (state.stage === 2) drawZeroSunBackground(time);
    else throw new RangeError(`Unknown Neon stage: ${state.stage}`);

    const vignette = context.createRadialGradient(
      W / 2,
      H * 0.48,
      H * 0.12,
      W / 2,
      H * 0.48,
      H * 0.72,
    );
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,0.62)");
    context.fillStyle = vignette;
    context.fillRect(0, 0, W, H);
  }

  function drawPickups(pickups) {
    if (pickups.length === 0) return;
    context.save();
    context.globalCompositeOperation = "lighter";
    for (const item of pickups) {
      const sprite = sprites.pickup(item.type);
      const pulse = 18 + Math.sin(item.age * 8) * 2;
      context.save();
      context.translate(item.x, item.y);
      context.rotate(item.rotation);
      context.globalAlpha = clamp(item.life, 0, 1);
      context.drawImage(sprite, -pulse, -pulse, pulse * 2, pulse * 2);
      context.restore();
    }
    context.restore();
  }

  function drawEnemyBullets(bullets, alpha) {
    if (bullets.length === 0) return;
    context.save();
    context.globalCompositeOperation = "lighter";
    for (const bullet of bullets) {
      const sprite = sprites.bullet(bullet.color, bullet.shape);
      const size = bullet.radius * (bullet.shape === "needle" ? 4.4 : 3.6) * bullet.scale;
      const opacity = bullet.delay > 0 ? clamp(1 - bullet.delay * 2.4, 0.12, 0.55) : bullet.alpha;
      const point = position(bullet, alpha);
      context.save();
      context.translate(point.x, point.y);
      context.rotate(bullet.rotation);
      context.globalAlpha = opacity;
      context.drawImage(sprite, -size / 2, -size / 2, size, size);
      context.restore();
    }
    context.restore();
  }

  function drawLasers(lasers, time) {
    if (lasers.length === 0) return;
    context.save();
    context.globalCompositeOperation = "lighter";
    for (const laser of lasers) {
      const half = laser.length / 2;
      const dx = Math.cos(laser.angle) * half;
      const dy = Math.sin(laser.angle) * half;
      const x1 = laser.cx - dx;
      const y1 = laser.cy - dy;
      const x2 = laser.cx + dx;
      const y2 = laser.cy + dy;
      if (laser.age < laser.warning) {
        const progress = laser.age / laser.warning;
        context.save();
        context.setLineDash([12, 10]);
        context.lineDashOffset = -time * 80;
        context.strokeStyle = colorWithAlpha(laser.color, 0.24 + progress * 0.48);
        context.lineWidth = 2 + progress * 2;
        context.beginPath();
        context.moveTo(x1, y1);
        context.lineTo(x2, y2);
        context.stroke();
        context.restore();
      } else {
        const remaining = clamp((laser.life - laser.age) / Math.max(0.01, laser.active), 0, 1);
        const pulse = 0.86 + Math.sin(laser.pulse) * 0.14;
        context.strokeStyle = colorWithAlpha(laser.color, 0.18 * remaining);
        context.lineWidth = laser.width * 3.2 * pulse;
        context.beginPath();
        context.moveTo(x1, y1);
        context.lineTo(x2, y2);
        context.stroke();
        context.strokeStyle = colorWithAlpha(laser.color, 0.66 * remaining);
        context.lineWidth = laser.width * 1.45 * pulse;
        context.beginPath();
        context.moveTo(x1, y1);
        context.lineTo(x2, y2);
        context.stroke();
        context.strokeStyle = colorWithAlpha(COLORS.white, 0.88 * remaining);
        context.lineWidth = Math.max(2, laser.width * 0.34 * pulse);
        context.beginPath();
        context.moveTo(x1, y1);
        context.lineTo(x2, y2);
        context.stroke();
      }
    }
    context.restore();
  }

  function drawEnemies(enemies, alpha) {
    if (enemies.length === 0) return;
    context.save();
    context.globalCompositeOperation = "lighter";
    for (const enemy of enemies) {
      if (!ENEMY_TYPES.has(enemy.type))
        throw new RangeError(`Unknown Neon enemy type: ${enemy.type}`);
      const point = position(enemy, alpha);
      context.save();
      context.translate(point.x, point.y);
      context.rotate(enemy.rotation * 0.35);
      const health = clamp(enemy.hp / enemy.maxHp, 0, 1);
      context.globalAlpha = point.y < -10 ? clamp((point.y + 50) / 40, 0, 1) : 1;
      drawGlow(enemy.color, 0, 0, enemy.radius * (enemy.armored ? 4.2 : 3.4), 0.72);
      context.strokeStyle = enemy.color;
      context.fillStyle = colorWithAlpha(enemy.color, 0.16 + health * 0.09);
      context.lineWidth = enemy.armored ? 2.3 : 1.5;

      if (enemy.type === "scout") {
        context.beginPath();
        context.moveTo(0, 18);
        context.lineTo(-13, -11);
        context.lineTo(-5, -7);
        context.lineTo(0, -17);
        context.lineTo(5, -7);
        context.lineTo(13, -11);
        context.closePath();
        context.fill();
        context.stroke();
        context.fillStyle = COLORS.white;
        context.fillRect(-2, -4, 4, 8);
      } else if (enemy.type === "diver") {
        context.rotate(enemy.side > 0 ? -Math.PI / 2 : Math.PI / 2);
        context.beginPath();
        context.moveTo(20, 0);
        context.lineTo(-9, -13);
        context.lineTo(-3, 0);
        context.lineTo(-9, 13);
        context.closePath();
        context.fill();
        context.stroke();
        context.beginPath();
        context.arc(-3, 0, 4, 0, TAU);
        context.fillStyle = COLORS.white;
        context.fill();
      } else if (enemy.type === "spinner") {
        for (let index = 0; index < 4; index += 1) {
          context.rotate(Math.PI / 2);
          context.beginPath();
          context.moveTo(5, 0);
          context.lineTo(23, -6);
          context.lineTo(18, 5);
          context.closePath();
          context.fill();
          context.stroke();
        }
        context.beginPath();
        context.arc(0, 0, 10, 0, TAU);
        context.fillStyle = colorWithAlpha(COLORS.white, 0.78);
        context.fill();
        context.strokeStyle = enemy.color;
        context.stroke();
      } else if (enemy.type === "turret") {
        context.rotate(Math.PI / 4);
        context.fillRect(-15, -15, 30, 30);
        context.strokeRect(-15, -15, 30, 30);
        context.rotate(-Math.PI / 4);
        context.fillStyle = colorWithAlpha(COLORS.white, 0.68);
        context.fillRect(-4, -4, 8, 17);
        context.strokeStyle = enemy.color;
        context.beginPath();
        context.arc(0, 0, 9, 0, TAU);
        context.stroke();
      } else if (enemy.type === "orbiter") {
        context.beginPath();
        context.arc(0, 0, 16, 0, TAU);
        context.fill();
        context.stroke();
        for (let index = 0; index < 3; index += 1) {
          const angle = (index / 3) * TAU + enemy.age * enemy.side;
          context.beginPath();
          context.arc(Math.cos(angle) * 24, Math.sin(angle) * 24, 4, 0, TAU);
          context.fillStyle = index % 2 ? COLORS.pink : COLORS.cyan;
          context.fill();
        }
        context.fillStyle = COLORS.white;
        context.beginPath();
        context.arc(0, 0, 5, 0, TAU);
        context.fill();
      } else if (enemy.type === "carrier") {
        context.beginPath();
        context.moveTo(0, 40);
        context.lineTo(-38, 14);
        context.lineTo(-30, -27);
        context.lineTo(-9, -18);
        context.lineTo(0, -36);
        context.lineTo(9, -18);
        context.lineTo(30, -27);
        context.lineTo(38, 14);
        context.closePath();
        context.fill();
        context.stroke();
        context.strokeStyle = colorWithAlpha(COLORS.white, 0.55);
        context.beginPath();
        context.moveTo(-25, 8);
        context.lineTo(0, 23);
        context.lineTo(25, 8);
        context.stroke();
        context.fillStyle = COLORS.white;
        context.beginPath();
        context.arc(0, -3, 9, 0, TAU);
        context.fill();
      } else if (enemy.type === "elite") {
        for (let index = 0; index < 6; index += 1) {
          const angle = (index / 6) * TAU;
          context.beginPath();
          context.moveTo(Math.cos(angle) * 10, Math.sin(angle) * 10);
          context.lineTo(Math.cos(angle - 0.18) * 34, Math.sin(angle - 0.18) * 34);
          context.lineTo(Math.cos(angle + 0.18) * 34, Math.sin(angle + 0.18) * 34);
          context.closePath();
          context.fill();
          context.stroke();
        }
        context.beginPath();
        context.arc(0, 0, 14, 0, TAU);
        context.fillStyle = colorWithAlpha(COLORS.white, 0.75);
        context.fill();
        context.strokeStyle = enemy.color;
        context.stroke();
      }

      if (enemy.armored) {
        context.strokeStyle = colorWithAlpha(COLORS.gold, 0.7);
        context.lineWidth = 1.5;
        context.beginPath();
        context.arc(0, 0, enemy.radius + 7 + Math.sin(enemy.age * 4) * 2, 0, TAU);
        context.stroke();
      }
      context.restore();

      if (enemy.type === "carrier" || enemy.type === "elite") {
        context.save();
        context.globalCompositeOperation = "source-over";
        context.fillStyle = "rgba(255,255,255,0.08)";
        context.fillRect(point.x - enemy.radius, point.y + enemy.radius + 9, enemy.radius * 2, 3);
        context.fillStyle = enemy.color;
        context.fillRect(
          point.x - enemy.radius,
          point.y + enemy.radius + 9,
          enemy.radius * 2 * health,
          3,
        );
        context.restore();
      }
    }
    context.restore();
  }

  function drawBoss(boss, alpha) {
    if (boss === null) return;
    if (![0, 1, 2].includes(boss.id)) throw new RangeError(`Unknown Neon boss id: ${boss.id}`);
    const point = position(boss, alpha);
    context.save();
    context.translate(point.x, point.y);
    context.globalCompositeOperation = "lighter";
    context.globalAlpha = boss.intro > 0 ? clamp(1 - boss.intro / 2.2, 0, 1) : 1;
    const pulse = 1 + Math.sin(boss.age * 4) * 0.04;
    context.scale(pulse, pulse);
    context.rotate(boss.rotation * 0.25);
    drawGlow(boss.color, 0, 0, boss.radius * 3.1, 0.85);
    context.strokeStyle = boss.color;
    context.fillStyle = colorWithAlpha(boss.color, 0.13);
    context.lineWidth = 2;

    if (boss.id === 0) {
      for (let index = 0; index < 8; index += 1) {
        const angle = (index / 8) * TAU;
        context.save();
        context.rotate(angle + Math.sin(boss.age * 0.7) * 0.12);
        context.beginPath();
        context.moveTo(16, 0);
        context.quadraticCurveTo(53, -17, 72, 0);
        context.quadraticCurveTo(53, 17, 16, 0);
        context.fill();
        context.stroke();
        context.restore();
      }
      context.beginPath();
      context.arc(0, 0, 31, 0, TAU);
      context.fill();
      context.stroke();
      context.strokeStyle = colorWithAlpha(COLORS.white, 0.72);
      context.beginPath();
      context.arc(0, 0, 18, 0, TAU);
      context.stroke();
      context.fillStyle = COLORS.white;
      context.beginPath();
      context.arc(Math.sin(boss.age * 1.7) * 7, 0, 7, 0, TAU);
      context.fill();
    } else if (boss.id === 1) {
      for (const side of [-1, 1]) {
        context.save();
        context.scale(side, 1);
        context.beginPath();
        context.moveTo(0, -48);
        context.lineTo(66, -15);
        context.lineTo(49, 36);
        context.lineTo(16, 52);
        context.lineTo(25, 12);
        context.closePath();
        context.fill();
        context.stroke();
        context.restore();
      }
      context.rotate(-boss.rotation * 0.8);
      context.beginPath();
      for (let index = 0; index < 6; index += 1) {
        const angle = (index / 6) * TAU;
        const x = Math.cos(angle) * 30;
        const y = Math.sin(angle) * 30;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.closePath();
      context.fill();
      context.stroke();
      context.fillStyle = COLORS.white;
      context.beginPath();
      context.arc(0, 0, 9, 0, TAU);
      context.fill();
    } else {
      for (let ring = 0; ring < 3; ring += 1) {
        context.save();
        context.rotate((ring % 2 ? -1 : 1) * boss.age * (0.23 + ring * 0.07));
        context.strokeStyle = ring === 1 ? COLORS.red : ring === 2 ? COLORS.gold : boss.color;
        const radius = 35 + ring * 23;
        for (let index = 0; index < 9 + ring * 2; index += 1) {
          const angle = (index / (9 + ring * 2)) * TAU;
          context.beginPath();
          context.moveTo(Math.cos(angle) * (radius - 10), Math.sin(angle) * (radius - 10));
          context.lineTo(
            Math.cos(angle - 0.09) * (radius + 12),
            Math.sin(angle - 0.09) * (radius + 12),
          );
          context.lineTo(
            Math.cos(angle + 0.09) * (radius + 12),
            Math.sin(angle + 0.09) * (radius + 12),
          );
          context.closePath();
          context.fill();
          context.stroke();
        }
        context.restore();
      }
      context.fillStyle = "#020208";
      context.beginPath();
      context.arc(0, 0, 24, 0, TAU);
      context.fill();
      context.strokeStyle = COLORS.white;
      context.beginPath();
      context.arc(0, 0, 16 + Math.sin(boss.age * 5) * 3, 0, TAU);
      context.stroke();
    }
    context.restore();

    if (boss.intro <= 0) {
      context.save();
      context.globalCompositeOperation = "lighter";
      context.strokeStyle = colorWithAlpha(boss.color, 0.18);
      context.lineWidth = 1;
      for (let index = 0; index < 3; index += 1) {
        context.beginPath();
        context.arc(
          point.x,
          point.y,
          boss.radius + 16 + index * 13 + Math.sin(boss.age * 1.3 + index) * 4,
          0,
          TAU,
        );
        context.stroke();
      }
      context.restore();
    }
  }

  function drawPlayerBullets(bullets, alpha) {
    if (bullets.length === 0) return;
    context.save();
    context.globalCompositeOperation = "lighter";
    context.lineCap = "round";
    for (const bullet of bullets) {
      if (!PLAYER_BULLET_TYPES.has(bullet.type)) {
        throw new RangeError(`Unknown Neon player bullet type: ${bullet.type}`);
      }
      const point = position(bullet, alpha);
      if (bullet.type === "missile") {
        context.save();
        context.translate(point.x, point.y);
        context.rotate(bullet.rotation);
        drawGlow(COLORS.gold, 0, 0, 34, 0.8);
        context.fillStyle = COLORS.gold;
        context.beginPath();
        context.moveTo(0, -10);
        context.lineTo(5, 7);
        context.lineTo(0, 4);
        context.lineTo(-5, 7);
        context.closePath();
        context.fill();
        context.restore();
      } else {
        context.strokeStyle = bullet.color;
        const lineWidth = bullet.radius * (bullet.type === "lance" ? 1.4 : 0.9);
        context.lineWidth = lineWidth;
        context.globalAlpha = 0.82;
        context.beginPath();
        context.moveTo(point.x, point.y + (bullet.type === "lance" ? 20 : 10));
        context.lineTo(point.x - bullet.vx * 0.016, point.y - bullet.vy * 0.016);
        strokeGlow(bullet.color, lineWidth, bullet.type === "lance" ? 13 : 7);
        context.globalAlpha = 1;
      }
    }
    context.restore();
  }

  function drawParticles(particles) {
    if (particles.length === 0) return;
    context.save();
    context.globalCompositeOperation = "lighter";
    context.lineCap = "round";
    for (const particle of particles) {
      if (!PARTICLE_TYPES.has(particle.type))
        throw new RangeError(`Unknown Neon particle type: ${particle.type}`);
      const ratio = clamp(particle.life / particle.maxLife, 0, 1);
      context.globalAlpha = ratio * particle.alpha;
      context.strokeStyle = particle.color;
      context.fillStyle = particle.color;
      if (particle.type === "ring") {
        const radius = particle.targetRadius * easeOutCubic(1 - ratio);
        context.lineWidth = Math.max(0.5, particle.lineWidth * ratio);
        context.beginPath();
        context.arc(particle.x, particle.y, radius, 0, TAU);
        strokeGlow(particle.color, Math.max(0.5, particle.lineWidth * ratio), 10);
      } else if (particle.type === "line") {
        context.save();
        context.translate(particle.x, particle.y);
        context.rotate(particle.rotation);
        context.lineWidth = Math.max(0.5, particle.size * ratio);
        context.beginPath();
        context.moveTo(-particle.size * 2.4, 0);
        context.lineTo(particle.size * 2.4, 0);
        strokeGlow(particle.color, Math.max(0.5, particle.size * ratio), 6);
        context.restore();
      } else {
        const size = Math.max(0.4, particle.size * (0.35 + ratio * 0.8));
        drawGlow(particle.color, particle.x, particle.y, size * 5 + 8, 0.55);
        context.beginPath();
        context.arc(particle.x, particle.y, size, 0, TAU);
        context.fill();
      }
    }
    context.restore();
  }

  function drawPlayer(state, alpha, time) {
    const player = state.player;
    const point = position(player, alpha);
    const overdrive = state.overdrive > 0;
    const pulse = 0.5 + Math.sin(player.auraPulse * (overdrive ? 11 : 5)) * 0.5;
    const flicker = player.invulnerable > 0 && Math.floor(player.invulnerable * 24) % 2 === 0;
    context.save();
    context.globalCompositeOperation = "lighter";

    if (overdrive) {
      const aura = context.createRadialGradient(
        point.x,
        point.y,
        4,
        point.x,
        point.y,
        86 + pulse * 15,
      );
      aura.addColorStop(0, colorWithAlpha(COLORS.white, 0.4));
      aura.addColorStop(0.18, colorWithAlpha(COLORS.cyan, 0.24));
      aura.addColorStop(0.55, colorWithAlpha(COLORS.pink, 0.12));
      aura.addColorStop(1, colorWithAlpha(COLORS.pink, 0));
      context.fillStyle = aura;
      context.beginPath();
      context.arc(point.x, point.y, 104, 0, TAU);
      context.fill();
      context.save();
      context.translate(point.x, point.y);
      context.rotate(-time * 1.7);
      context.strokeStyle = colorWithAlpha(COLORS.pink, 0.5);
      context.lineWidth = 1.5;
      context.setLineDash([9, 13]);
      context.lineDashOffset = time * 42;
      context.beginPath();
      context.arc(0, 0, 48 + pulse * 5, 0, TAU);
      context.stroke();
      context.rotate(time * 3.2);
      context.strokeStyle = colorWithAlpha(COLORS.cyan, 0.58);
      context.beginPath();
      context.arc(0, 0, 67 - pulse * 4, 0, TAU);
      context.stroke();
      context.restore();
    }

    const renderedPlayer = { ...player, x: point.x, y: point.y };
    const drones = getDronePositions({ player: renderedPlayer, droneCount: state.mods.drones });
    for (let index = 0; index < drones.length; index += 1) {
      const drone = drones[index];
      const color = index % 2 ? COLORS.pink : COLORS.violet;
      context.save();
      context.translate(drone.x, drone.y);
      context.rotate(time * (index % 2 ? -3.2 : 3.2) + index);
      drawGlow(color, 0, 0, overdrive ? 58 : 42, 0.82);
      context.strokeStyle = color;
      context.fillStyle = colorWithAlpha(color, overdrive ? 0.32 : 0.18);
      context.lineWidth = 1.4;
      context.beginPath();
      context.moveTo(0, -9);
      context.lineTo(7, 0);
      context.lineTo(0, 9);
      context.lineTo(-7, 0);
      context.closePath();
      context.fill();
      context.stroke();
      context.fillStyle = COLORS.white;
      context.globalAlpha = 0.72 + pulse * 0.28;
      context.beginPath();
      context.arc(0, 0, 2.2, 0, TAU);
      context.fill();
      context.restore();
    }

    context.save();
    context.translate(point.x, point.y);
    context.rotate(player.tilt * 0.24);
    context.globalAlpha = flicker ? 0.28 : 1;
    if (player.invulnerable > 0) {
      context.strokeStyle = colorWithAlpha(COLORS.white, 0.22 + pulse * 0.42);
      const lineWidth = 1.4;
      context.lineWidth = lineWidth;
      context.beginPath();
      context.arc(0, 0, 27 + pulse * 4, 0, TAU);
      strokeGlow(COLORS.cyan, lineWidth, 17);
    }
    drawGlow(overdrive ? COLORS.pink : COLORS.cyan, 0, 3, overdrive ? 86 : 64, 0.88);
    const exhaust = 18 + Math.abs(Math.sin(time * 24)) * 12 + (overdrive ? 18 : 0);
    const exhaustGradient = context.createLinearGradient(0, 9, 0, 9 + exhaust);
    exhaustGradient.addColorStop(0, colorWithAlpha(COLORS.white, 0.95));
    exhaustGradient.addColorStop(0.25, colorWithAlpha(overdrive ? COLORS.pink : COLORS.cyan, 0.86));
    exhaustGradient.addColorStop(1, colorWithAlpha(overdrive ? COLORS.pink : COLORS.cyan, 0));
    context.fillStyle = exhaustGradient;
    context.beginPath();
    context.moveTo(-6, 10);
    context.quadraticCurveTo(-1, 15 + exhaust, 0, 17 + exhaust);
    context.quadraticCurveTo(1, 15 + exhaust, 6, 10);
    context.closePath();
    context.fill();
    context.fillStyle = colorWithAlpha(overdrive ? COLORS.pink : COLORS.cyan, 0.19);
    context.strokeStyle = overdrive ? COLORS.pinkSoft : COLORS.cyanSoft;
    context.lineWidth = 1.7;
    context.beginPath();
    context.moveTo(0, -25);
    context.lineTo(8, -5);
    context.lineTo(23, 13);
    context.lineTo(7, 9);
    context.lineTo(0, 20);
    context.lineTo(-7, 9);
    context.lineTo(-23, 13);
    context.lineTo(-8, -5);
    context.closePath();
    context.fill();
    context.stroke();
    context.strokeStyle = colorWithAlpha(COLORS.white, 0.68);
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(0, -17);
    context.lineTo(0, 12);
    context.moveTo(-17, 9);
    context.lineTo(-5, 1);
    context.moveTo(17, 9);
    context.lineTo(5, 1);
    context.stroke();
    context.fillStyle = COLORS.white;
    drawGlow(overdrive ? COLORS.gold : COLORS.cyan, 0, -3, 34, 0.9);
    context.beginPath();
    context.arc(0, -3, overdrive ? 5.7 : 4.3, 0, TAU);
    context.fill();
    context.fillStyle = overdrive ? COLORS.gold : COLORS.cyan;
    context.beginPath();
    context.arc(0, -3, 2.2, 0, TAU);
    context.fill();
    context.restore();

    if (player.focus || state.gameSettings.showHitbox) {
      context.save();
      context.globalCompositeOperation = "source-over";
      context.translate(point.x, point.y);
      context.globalAlpha = flicker ? 0.35 : 1;
      context.fillStyle = COLORS.white;
      drawGlow(COLORS.red, 0, 0, player.radius * 5 + 18, 0.75);
      context.beginPath();
      context.arc(0, 0, player.radius, 0, TAU);
      context.fill();
      context.strokeStyle = COLORS.red;
      context.lineWidth = 1.3;
      context.beginPath();
      context.arc(0, 0, player.radius + 3.2, 0, TAU);
      context.stroke();
      context.restore();
    }
    if (player.focus) {
      context.save();
      context.globalCompositeOperation = "source-over";
      context.translate(point.x, point.y);
      context.globalAlpha = flicker ? 0.35 : 1;
      context.strokeStyle = colorWithAlpha(COLORS.cyan, 0.2 + pulse * 0.18);
      context.lineWidth = 1;
      context.setLineDash([5, 8]);
      context.lineDashOffset = -time * 25;
      context.beginPath();
      context.arc(0, 0, state.mods.grazeRadius, 0, TAU);
      context.stroke();
      context.restore();
    }
    context.restore();
  }

  function drawFloaters(floaters) {
    if (floaters.length === 0) return;
    context.save();
    context.globalCompositeOperation = "source-over";
    context.textAlign = "center";
    context.textBaseline = "middle";
    for (const floater of floaters) {
      const ratio = clamp(floater.life / floater.maxLife, 0, 1);
      const appear = clamp((1 - ratio) * 6, 0, 1);
      context.globalAlpha = Math.min(appear, ratio * 1.8);
      context.font = `800 ${Math.max(9, floater.size)}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
      context.lineWidth = Math.max(2, floater.size * 0.26);
      context.strokeStyle = "rgba(2,2,10,0.88)";
      const text = floaterText(floater);
      context.strokeText(text, floater.x, floater.y);
      context.fillStyle = floater.color;
      fillTextGlow(text, floater.x, floater.y, floater.color, 8);
    }
    context.restore();
  }

  function drawOverdrive(state, time) {
    const strength = clamp(state.overdrive / state.mods.overdriveDuration, 0, 1);
    const pulse = 0.5 + Math.sin(time * 13) * 0.5;
    context.save();
    context.globalCompositeOperation = "screen";
    const edge = context.createRadialGradient(W / 2, H / 2, H * 0.18, W / 2, H / 2, H * 0.68);
    edge.addColorStop(0, "rgba(0,0,0,0)");
    edge.addColorStop(0.62, colorWithAlpha(COLORS.cyan, 0.025 + pulse * 0.018));
    edge.addColorStop(1, colorWithAlpha(COLORS.pink, 0.11 + pulse * 0.045));
    context.fillStyle = edge;
    context.fillRect(0, 0, W, H);
    context.globalAlpha = 0.055 + pulse * 0.04;
    context.fillStyle = COLORS.cyan;
    for (let y = (time * 180) % 8; y < H; y += 8) context.fillRect(0, y, W, 1);
    context.globalAlpha = 0.16 + pulse * 0.09;
    context.strokeStyle = COLORS.pink;
    context.lineWidth = 2;
    const inset = 9 + pulse * 4;
    context.strokeRect(inset, inset, W - inset * 2, H - inset * 2);
    context.globalAlpha = 0.08 + strength * 0.08;
    context.fillStyle = COLORS.white;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = "900 52px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    context.fillText("OVERDRIVE", W / 2, H * 0.72);
    context.restore();
  }

  function drawBanner(banner) {
    if (banner === null) return;
    const elapsed = banner.maxTime - banner.time;
    const enter = easeOutCubic(clamp(elapsed / 0.48, 0, 1));
    const exit = easeInOutCubic(clamp(banner.time / 0.55, 0, 1));
    const opacity = Math.min(enter, exit);
    const slide = (1 - enter) * 70 - (1 - exit) * 35;
    const y = H * 0.315;
    context.save();
    context.globalCompositeOperation = "source-over";
    context.translate(slide, 0);
    context.globalAlpha = opacity;
    const band = context.createLinearGradient(0, y - 58, 0, y + 55);
    band.addColorStop(0, "rgba(3,3,14,0)");
    band.addColorStop(0.35, "rgba(3,3,14,0.72)");
    band.addColorStop(0.65, "rgba(3,3,14,0.72)");
    band.addColorStop(1, "rgba(3,3,14,0)");
    context.fillStyle = band;
    context.fillRect(0, y - 70, W, 140);
    context.strokeStyle = colorWithAlpha(COLORS.cyan, 0.58);
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(48, y - 36);
    context.lineTo(188, y - 36);
    context.moveTo(W - 188, y - 36);
    context.lineTo(W - 48, y - 36);
    context.stroke();
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = "900 38px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    context.fillStyle = COLORS.white;
    const title = bannerTitle(banner);
    fillTextGlow(title, W / 2, y - 4, COLORS.cyan, 18);
    context.font = "700 14px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    context.fillStyle = COLORS.pinkSoft;
    const detail = bannerDetail(banner);
    fillTextGlow(detail, W / 2, y + 32, COLORS.pink, 9);
    context.restore();
  }

  function drawWorldPrompt(prompt, player, time) {
    if (prompt === null) return;
    const elapsed = prompt.maxTime - prompt.time;
    const enter = easeOutCubic(clamp(elapsed / 0.25, 0, 1));
    const exit = clamp(prompt.time / 0.35, 0, 1);
    const opacity = Math.min(enter, exit);
    const pulse = 0.5 + Math.sin(time * 9) * 0.5;
    const y = clamp(player.y - 92, 150, H - 180);
    context.save();
    context.globalCompositeOperation = "source-over";
    context.globalAlpha = opacity;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = "900 16px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    context.lineWidth = 5;
    context.strokeStyle = "rgba(1,1,8,0.9)";
    const text = promptText(prompt);
    context.strokeText(text, player.x, y);
    context.fillStyle = prompt.color;
    fillTextGlow(text, player.x, y, prompt.color, 12 + pulse * 10);
    context.strokeStyle = colorWithAlpha(prompt.color, 0.45 + pulse * 0.3);
    context.lineWidth = 1.4;
    context.beginPath();
    context.moveTo(player.x - 78 - pulse * 8, y + 17);
    context.lineTo(player.x - 22, y + 17);
    context.moveTo(player.x + 22, y + 17);
    context.lineTo(player.x + 78 + pulse * 8, y + 17);
    context.stroke();
    context.restore();
  }

  function drawFlash(flash, reducedMotion) {
    if (flash === null) return;
    context.save();
    context.globalCompositeOperation = "screen";
    context.globalAlpha = clamp(flash.amount * (reducedMotion ? 0.22 : 1), 0, 0.86);
    context.fillStyle = flash.color;
    context.fillRect(0, 0, W, H);
    context.restore();
  }

  return {
    canvas,
    render(state, alpha, settings) {
      if (disposed) throw new Error("Neon renderer is disposed.");
      if (!SCREEN_TYPES.has(state.screen)) {
        throw new RangeError(`Unknown Neon screen: ${state.screen}`);
      }
      if (!Number.isFinite(alpha) || alpha < 0 || alpha >= 1) {
        throw new RangeError("Neon render interpolation must be in [0, 1).");
      }
      if (!Number.isFinite(state.presentationTime) || state.presentationTime < 0) {
        throw new RangeError("Neon presentation time must be a finite non-negative number.");
      }
      const time = settings.motion.reduced ? 0 : state.presentationTime;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.globalAlpha = 1;
      context.globalCompositeOperation = "source-over";
      drawBackground(state, time);

      const shake = settings.motion.screenShake && !settings.motion.reduced ? state.shake : 0;
      context.save();
      if (shake > 0) {
        const presentationFrame = Math.round(state.presentationTime * 60) >>> 0;
        const shakeRng = createRng((PRESENTATION_SEED ^ presentationFrame) >>> 0);
        context.translate(shakeRng.range(-shake, shake), shakeRng.range(-shake, shake));
      }
      drawPickups(state.pickups);
      drawEnemyBullets(state.enemyBullets, alpha);
      drawLasers(state.lasers, time);
      drawEnemies(state.enemies, alpha);
      drawBoss(state.boss, alpha);
      drawPlayerBullets(state.playerBullets, alpha);
      drawParticles(state.particles);
      if (state.screen !== "title") drawPlayer(state, alpha, time);
      drawFloaters(state.floaters);
      context.restore();

      if (state.overdrive > 0) drawOverdrive(state, time);
      drawBanner(state.banner);
      drawWorldPrompt(state.worldPrompt, state.player, time);
      drawFlash(state.flash, settings.motion.reduced);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      sprites.dispose();
      stars.length = 0;
      cityBlocks.length = 0;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      canvas.width = 1;
      canvas.height = 1;
    },
  };
}
