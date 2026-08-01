(() => {
  "use strict";
  const PLO = window.PLO;
  const { CONFIG } = PLO;
  const { clamp, lerp, smoothstep, easeOutCubic, easeOutBack } = PLO.util;

  function roundedRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  class Renderer {
    constructor(canvas, bus, audio, settings, i18n, resources, dom = {}) {
      if (!i18n) throw new Error("Renderer requires an I18n instance.");
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
      this.bus = bus;
      this.audio = audio;
      this.settings = settings;
      this.i18n = i18n;
      this.resources = resources;
      this.dom = dom;
      this.width = 0;
      this.height = 0;
      this.dpr = 1;
      this.time = 0;
      this.lastTime = performance.now();
      this.layout = null;
      this.hitRegions = [];
      this.particles = [];
      this.shockwaves = [];
      this.floats = [];
      this.rings = [];
      this.shields = [];
      this.globalShake = 0;
      this.flash = 0;
      this.backgroundBursts = [];
      this.idleBlobs = Array.from({ length: 18 }, (_, i) => ({
        x: (i * 0.173 + 0.07) % 1,
        y: (i * 0.327 + 0.11) % 1,
        r: 12 + (i % 5) * 7,
        speed: 0.05 + (i % 4) * 0.018,
        phase: i * 1.61,
        color: i % CONFIG.COLORS,
      }));
      this.unsubscribe = [];
      this.bindEvents();
      this.resize();
      this.stopResize = this.resources.listen(window, "resize", () => this.resize());
    }

    setSettings(settings) {
      this.settings = settings;
    }

    bindEvents() {
      const on = (type, fn) => this.unsubscribe.push(this.bus.on(type, fn));
      on("pieceMove", (e) => {
        if (e.player.isHuman) this.audio?.move();
      });
      on("pieceRotate", (e) => {
        if (e.player.isHuman) this.audio?.rotate();
      });
      on("softDrop", (e) => {
        if (e.player.isHuman) this.audio?.softDrop();
      });
      on("hardDrop", (e) => {
        this.audio?.hardDrop(e.distance);
        this.addBoardShake(e.player, 0.12 + Math.min(0.18, e.distance * 0.008));
        const l = this.layoutFor(e.player);
        if (l && e.positions?.length) {
          const p = this.gridToScreen(l, e.positions[0].x, e.positions[0].y);
          this.addShockwave(
            p.x,
            p.y,
            l.cell * 0.6,
            CONFIG.COLOR_HEX[e.positions[0].cell.color] || "#ffffff",
            0.28,
          );
        }
      });
      on("pieceLock", () => this.audio?.lock());
      on("clearStart", (e) => {
        this.audio?.clear(e.chain, e.clear.cells.length);
        this.addBoardShake(e.player, 0.11 + e.chain * 0.065 + e.clear.pulse * 0.08);
        const l = this.layoutFor(e.player);
        if (!l) return;
        const center = this.clearCenter(l, e.clear.cells);
        if (e.chain >= 2) {
          this.addFloat(
            center.x,
            center.y - l.cell * 0.3,
            this.i18n.t("canvas.chain", { chain: e.chain }),
            "#ffffff",
            0.95 + e.chain * 0.08,
            1.0,
          );
          this.addShockwave(center.x, center.y, l.cell * (1.3 + e.chain * 0.25), "#ffffff", 0.45);
        }
        if (e.counter)
          this.addFloat(
            center.x,
            center.y + l.cell * 0.45,
            this.i18n.t("canvas.counter"),
            "#ffc94a",
            0.72,
            0.8,
          );
      });
      on("clearResolved", (e) => {
        const l = this.layoutFor(e.player);
        if (!l) return;
        for (const item of e.clear.cells) {
          const p = this.gridToScreen(l, item.x, item.y);
          const color = item.cell.kind === "pulse" ? "#ffffff" : CONFIG.COLOR_HEX[item.cell.color];
          this.burst(
            p.x,
            p.y,
            color,
            item.cell.kind === "pulse" ? 26 : 10,
            item.cell.kind === "pulse" ? 2 : 1,
          );
          this.addShockwave(
            p.x,
            p.y,
            l.cell * (item.cell.kind === "pulse" ? 1.3 : 0.65),
            color,
            item.cell.kind === "pulse" ? 0.42 : 0.25,
          );
        }
        if (e.clear.pulse > 0) {
          this.audio?.pulse();
          const center = this.clearCenter(
            l,
            e.clear.cells.filter((c) => c.cell.kind === "pulse"),
          );
          this.addFloat(
            center.x,
            center.y,
            `+${e.clear.pulse * CONFIG.PULSE_CP}`,
            "#fff4ae",
            1.0,
            0.95,
          );
          this.flash = Math.max(this.flash, this.settings.reducedMotion ? 0.08 : 0.28);
        }
      });
      on("energy", (e) => {
        const l = this.layoutFor(e.player);
        if (!l) return;
        const p = this.energyPosition(e.player);
        this.rings.push({
          x: p.x,
          y: p.y,
          life: 0.5,
          max: 0.5,
          color: e.clear.pulse ? "#fff4ae" : "#19d7ff",
          fromRadius: 6,
          toRadius: 44,
        });
      });
      on("attackLaunch", (e) => {
        this.audio?.attack(e.lines);
        this.globalShake = Math.max(this.globalShake, 0.12 + e.lines * 0.035);
        this.announce(
          this.i18n.t(e.from.isHuman ? "canvas.overdrive" : "canvas.incoming"),
          e.from.isHuman ? "#ffc94a" : "#ff486f",
        );
        const p = this.energyPosition(e.from);
        this.addShockwave(p.x, p.y, 90 + e.lines * 12, "#ffc94a", 0.48);
      });
      on("attackImpact", (e) => {
        this.audio?.rise(e.lines);
        this.globalShake = Math.max(this.globalShake, 0.22 + e.lines * 0.06);
        const l = this.layoutFor(e.player);
        if (l) {
          this.addShockwave(l.x + l.w / 2, l.y + l.h, l.w * 0.7, "#ff4f94", 0.55);
          for (let i = 0; i < 20 + e.lines * 5; i++)
            this.spawnParticle(l.x + Math.random() * l.w, l.y + l.h, "#ff6a93", {
              vy: -80 - Math.random() * 180,
              vx: (Math.random() - 0.5) * 120,
              size: 2 + Math.random() * 5,
              life: 0.5 + Math.random() * 0.4,
              gravity: 220,
            });
        }
      });
      on("projectileCanceled", (e) => {
        this.audio?.cancel();
        const p = this.energyPosition(e.player);
        this.addShockwave(p.x, p.y, 78, "#8ffbff", 0.38);
      });
      on("defense", (e) => {
        this.audio?.defense(e.units);
        const l = this.layoutFor(e.player);
        if (l) this.shields.push({ player: e.player, life: 0.62, max: 0.62, power: e.units });
        this.announce(this.i18n.t(e.player.isHuman ? "canvas.guard" : "canvas.blocked"), "#8ffbff");
      });
      on("purge", (e) => {
        const l = this.layoutFor(e.player);
        if (!l) return;
        for (const item of e.removed) {
          const p = this.gridToScreen(l, item.x, item.y);
          this.burst(p.x, p.y, "#9effff", 5, 0.7);
        }
      });
      on("rise", (e) => {
        this.addBoardShake(e.player, 0.28 + e.lines * 0.07);
      });
      on("invalid", () => this.audio?.error());
      on("countdown", (e) => this.audio?.countdown(e.value));
      on("matchStart", () => this.announce(this.i18n.t("canvas.matchStart"), "#ffffff"));
      on("tutorialStage", (e) => {
        if (e.stage === 4) this.announce("100", "#fff4ae");
      });
      on("tutorialComplete", () => this.announce(this.i18n.t("canvas.tutorialSync"), "#a8ff45"));
      on("matchEnd", (e) => {
        if (e.winner.isHuman) this.audio?.win();
        else this.audio?.lose();
        this.globalShake = Math.max(this.globalShake, 0.42);
        this.flash = Math.max(this.flash, 0.3);
      });
    }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      this.width = Math.max(1, rect.width);
      this.height = Math.max(1, rect.height);
      this.dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
      const cw = Math.round(this.width * this.dpr),
        ch = Math.round(this.height * this.dpr);
      if (this.canvas.width !== cw || this.canvas.height !== ch) {
        this.canvas.width = cw;
        this.canvas.height = ch;
      }
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }

    render(game, screen = "title", now = performance.now()) {
      const dt = Math.min(0.05, Math.max(0, (now - this.lastTime) / 1000));
      this.lastTime = now;
      this.time += dt;
      this.updateEffects(dt);
      this.layout = game ? this.computeLayout() : null;
      this.hitRegions = [];

      const ctx = this.ctx;
      ctx.save();
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      const shakeScale = this.settings.shake && !this.settings.reducedMotion ? this.globalShake : 0;
      const sx = (Math.random() - 0.5) * 16 * shakeScale;
      const sy = (Math.random() - 0.5) * 12 * shakeScale;
      ctx.translate(sx, sy);
      this.drawBackground(game, screen);
      if (game && screen !== "title") this.drawGame(game);
      else this.drawTitleAmbient();
      this.drawProjectiles(game);
      this.drawEffects();
      if (this.flash > 0.001) {
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = clamp(this.flash, 0, 0.48);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(-20, -20, this.width + 40, this.height + 40);
        ctx.globalCompositeOperation = "source-over";
      }
      ctx.restore();
    }

    updateEffects(dt) {
      this.globalShake = Math.max(0, this.globalShake - dt * 1.8);
      this.flash = Math.max(0, this.flash - dt * 1.7);
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.life -= dt;
        if (p.life <= 0) {
          this.particles.splice(i, 1);
          continue;
        }
        p.vx *= Math.pow(p.drag, dt * 60);
        p.vy *= Math.pow(p.drag, dt * 60);
        p.vy += p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
      }
      for (const list of [
        this.shockwaves,
        this.floats,
        this.rings,
        this.shields,
        this.backgroundBursts,
      ]) {
        for (let i = list.length - 1; i >= 0; i--) {
          list[i].life -= dt;
          if (list[i].life <= 0) list.splice(i, 1);
        }
      }
    }

    computeLayout() {
      const w = this.width,
        h = this.height;
      const landscape = w / h > 1.12;
      const layouts = { landscape, players: {}, controls: {}, center: { x: w / 2, y: h / 2 } };
      if (landscape) {
        const gap = Math.max(150, Math.min(250, w * 0.19));
        const cell = Math.max(
          24,
          Math.min(58, (h - 108) / CONFIG.VISIBLE_ROWS, (w - gap - 70) / (CONFIG.COLS * 2)),
        );
        const bw = CONFIG.COLS * cell,
          bh = CONFIG.VISIBLE_ROWS * cell;
        const total = bw * 2 + gap;
        const x0 = (w - total) / 2;
        const y = Math.max(54, (h - bh) / 2 + 8);
        layouts.players.player = { x: x0, y, cell, w: bw, h: bh, side: "left", scale: 1 };
        layouts.players.cpu = { x: x0 + bw + gap, y, cell, w: bw, h: bh, side: "right", scale: 1 };
        const cx = w / 2;
        layouts.controls.attack = { x: cx, y: h * 0.43, r: Math.min(47, cell * 0.9) };
        layouts.controls.defense = { x: cx, y: h * 0.65, r: Math.min(43, cell * 0.82) };
        layouts.center = { x: cx, y: h * 0.54 };
      } else {
        const touchReserve = 105;
        const pCell = Math.max(
          20,
          Math.min(
            45,
            (w - 34) / CONFIG.COLS,
            (h * 0.51 - touchReserve * 0.15) / CONFIG.VISIBLE_ROWS,
          ),
        );
        const pW = CONFIG.COLS * pCell,
          pH = CONFIG.VISIBLE_ROWS * pCell;
        const px = (w - pW) / 2;
        const py = Math.max(h * 0.43, h - touchReserve - pH - 10);
        const cCell = Math.max(
          13,
          Math.min(27, (w - 150) / CONFIG.COLS, (py - 104) / CONFIG.VISIBLE_ROWS),
        );
        const cW = CONFIG.COLS * cCell,
          cH = CONFIG.VISIBLE_ROWS * cCell;
        const cx = (w - cW) / 2,
          cy = Math.max(46, (py - cH - 94) / 2 + 38);
        layouts.players.cpu = {
          x: cx,
          y: cy,
          cell: cCell,
          w: cW,
          h: cH,
          side: "top",
          scale: cCell / pCell,
        };
        layouts.players.player = {
          x: px,
          y: py,
          cell: pCell,
          w: pW,
          h: pH,
          side: "bottom",
          scale: 1,
        };
        const controlY = py - 44;
        layouts.controls.attack = { x: w / 2 - 49, y: controlY, r: 35 };
        layouts.controls.defense = { x: w / 2 + 49, y: controlY, r: 35 };
        layouts.center = { x: w / 2, y: controlY };
      }
      return layouts;
    }

    layoutFor(player) {
      return this.layout?.players?.[player?.id] || null;
    }

    drawBackground(game, screen) {
      const ctx = this.ctx,
        w = this.width,
        h = this.height;
      const danger = game
        ? Math.max(game.player.board.dangerRatio(), game.cpu.board.dangerRatio() * 0.65)
        : 0;
      const intensity = game?.globalIntensity || 0;
      const base = ctx.createRadialGradient(
        w * 0.5,
        h * 0.38,
        10,
        w * 0.5,
        h * 0.45,
        Math.max(w, h) * 0.8,
      );
      base.addColorStop(0, danger > 0.65 ? `rgba(62,12,48,1)` : `rgba(25,23,77,1)`);
      base.addColorStop(0.42, "#0b0b2a");
      base.addColorStop(1, "#04040e");
      ctx.fillStyle = base;
      ctx.fillRect(-30, -30, w + 60, h + 60);

      // Aurora ribbons.
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      for (let i = 0; i < 3; i++) {
        const phase = this.time * (0.08 + i * 0.025) + i * 2.4;
        const grad = ctx.createLinearGradient(0, 0, w, 0);
        grad.addColorStop(0, "rgba(25,215,255,0)");
        grad.addColorStop(0.35, `rgba(25,215,255,${0.035 + intensity * 0.025})`);
        grad.addColorStop(0.65, `rgba(255,79,216,${0.04 + intensity * 0.03})`);
        grad.addColorStop(1, "rgba(255,79,216,0)");
        ctx.strokeStyle = grad;
        ctx.lineWidth = 60 + i * 25;
        ctx.globalAlpha = 0.58;
        ctx.beginPath();
        ctx.moveTo(-80, h * (0.18 + i * 0.16));
        for (let x = 0; x <= w + 80; x += 80)
          ctx.lineTo(
            x,
            h * (0.2 + i * 0.16) +
              Math.sin(x * 0.006 + phase) * 35 +
              Math.sin(x * 0.002 - phase) * 24,
          );
        ctx.stroke();
      }
      ctx.restore();

      // Horizon and perspective grid.
      const horizon = h * (screen === "title" ? 0.72 : 0.66);
      ctx.save();
      ctx.strokeStyle = `rgba(86,174,255,${screen === "title" ? 0.105 : 0.07})`;
      ctx.lineWidth = 1;
      for (let i = 0; i < 15; i++) {
        const t = i / 14;
        const yy = lerp(horizon, h + 20, t * t);
        ctx.globalAlpha = (1 - t) * 0.55 + 0.1;
        ctx.beginPath();
        ctx.moveTo(0, yy);
        ctx.lineTo(w, yy);
        ctx.stroke();
      }
      for (let i = -8; i <= 8; i++) {
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        ctx.moveTo(w / 2, horizon);
        ctx.lineTo(w / 2 + i * w * 0.14, h + 20);
        ctx.stroke();
      }
      ctx.restore();

      // Dust motes.
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      for (let i = 0; i < 45; i++) {
        const x = ((i * 83.17 + this.time * (6 + (i % 5))) % (w + 40)) - 20;
        const y = (i * 47.31 + Math.sin(this.time * 0.2 + i) * 30) % h;
        const a = 0.08 + (i % 7) * 0.015;
        ctx.globalAlpha = a;
        ctx.fillStyle = i % 4 === 0 ? "#ff8ee9" : "#a8f7ff";
        ctx.fillRect(x, y, 1 + (i % 3 === 0), 1 + (i % 3 === 0));
      }
      ctx.restore();

      if (danger > 0.55) {
        ctx.save();
        ctx.globalAlpha = (danger - 0.55) * 0.42 * (0.65 + 0.35 * Math.sin(this.time * 8));
        const g = ctx.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, Math.max(w, h) * 0.72);
        g.addColorStop(0, "rgba(255,45,88,0)");
        g.addColorStop(1, "rgba(255,30,73,.9)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }
    }

    drawTitleAmbient() {
      const ctx = this.ctx,
        w = this.width,
        h = this.height;
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.globalCompositeOperation = "screen";
      for (const b of this.idleBlobs) {
        const x = b.x * w + Math.sin(this.time * b.speed + b.phase) * 50;
        const y = b.y * h + Math.cos(this.time * b.speed * 0.8 + b.phase) * 35;
        const pulse = 1 + Math.sin(this.time * 0.7 + b.phase) * 0.08;
        this.drawBlob(
          { kind: "normal", color: b.color, id: b.color + 1, wobble: b.phase },
          x,
          y,
          b.r * 2 * pulse,
          { alpha: 0.35, face: false, glyph: true },
        );
      }
      ctx.restore();
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = 0.28;
      const cx = w / 2,
        cy = h * 0.38;
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = i === 1 ? "#ff4fd8" : "#19d7ff";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(
          cx,
          cy,
          120 + i * 44 + Math.sin(this.time + i) * 5,
          this.time * (i % 2 ? -0.12 : 0.1) + i,
          Math.PI * 1.25 + this.time * (i % 2 ? -0.12 : 0.1) + i,
        );
        ctx.stroke();
      }
      ctx.restore();
    }

    drawGame(game) {
      const ctx = this.ctx;
      for (const player of [game.cpu, game.player]) {
        const l = this.layoutFor(player);
        if (!l) continue;
        const shake = this.settings.shake && !this.settings.reducedMotion ? player.board.shake : 0;
        ctx.save();
        ctx.translate((Math.random() - 0.5) * 9 * shake, (Math.random() - 0.5) * 7 * shake);
        this.drawBoard(player, l);
        ctx.restore();
      }
      this.drawCentralHUD(game);
      this.drawCountdown(game);
      this.drawTutorial(game);
    }

    drawBoard(player, l) {
      const ctx = this.ctx,
        board = player.board,
        c = l.cell;
      const danger = board.dangerRatio();
      ctx.save();
      ctx.shadowColor = player.isHuman ? "rgba(25,215,255,.25)" : "rgba(255,79,216,.2)";
      ctx.shadowBlur = 26;
      roundedRect(ctx, l.x - 8, l.y - 8, l.w + 16, l.h + 16, Math.max(12, c * 0.28));
      const pg = ctx.createLinearGradient(l.x, l.y, l.x, l.y + l.h);
      pg.addColorStop(0, "rgba(24,28,72,.86)");
      pg.addColorStop(1, "rgba(5,7,25,.94)");
      ctx.fillStyle = pg;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle =
        danger > 0.62
          ? `rgba(255,72,111,${0.5 + danger * 0.4})`
          : player.isHuman
            ? "rgba(120,239,255,.42)"
            : "rgba(255,133,230,.34)";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Header.
      const headerY = l.y - 23;
      ctx.fillStyle = player.isHuman ? "#a8f8ff" : "#ffd0f4";
      ctx.font = `900 ${Math.max(9, c * 0.22)}px ui-sans-serif,system-ui`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(player.isHuman ? this.i18n.t("canvas.player") : player.name, l.x, headerY);
      ctx.textAlign = "right";
      ctx.fillStyle = "rgba(224,232,255,.72)";
      ctx.font = `800 ${Math.max(8, c * 0.18)}px ui-monospace,monospace`;
      ctx.fillText(this.i18n.formatNumber(player.score), l.x + l.w, headerY);

      // Board clip and danger spine.
      ctx.save();
      roundedRect(ctx, l.x, l.y, l.w, l.h, Math.max(8, c * 0.18));
      ctx.clip();
      const boardBg = ctx.createLinearGradient(l.x, l.y, l.x + l.w, l.y + l.h);
      boardBg.addColorStop(0, "rgba(4,10,34,.9)");
      boardBg.addColorStop(1, "rgba(10,4,27,.92)");
      ctx.fillStyle = boardBg;
      ctx.fillRect(l.x, l.y, l.w, l.h);
      const centerX = l.x + CONFIG.CENTER_COL * c;
      const pulse = 0.45 + 0.25 * Math.sin(this.time * (danger > 0.6 ? 8 : 2.5));
      const dg = ctx.createLinearGradient(centerX, 0, centerX + c, 0);
      dg.addColorStop(0, "rgba(255,72,111,0)");
      dg.addColorStop(0.5, `rgba(255,72,111,${0.055 + danger * 0.14 * pulse})`);
      dg.addColorStop(1, "rgba(255,72,111,0)");
      ctx.fillStyle = dg;
      ctx.fillRect(centerX, l.y, c, l.h);
      ctx.strokeStyle = `rgba(255,91,126,${0.18 + danger * 0.35 * pulse})`;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 7]);
      ctx.strokeRect(centerX + 0.5, l.y + 0.5, c - 1, l.h - 1);
      ctx.setLineDash([]);

      // Grid.
      ctx.strokeStyle = "rgba(156,223,255,.065)";
      ctx.lineWidth = 1;
      for (let x = 1; x < CONFIG.COLS; x++) {
        ctx.beginPath();
        ctx.moveTo(l.x + x * c, l.y);
        ctx.lineTo(l.x + x * c, l.y + l.h);
        ctx.stroke();
      }
      for (let y = 1; y < CONFIG.VISIBLE_ROWS; y++) {
        ctx.beginPath();
        ctx.moveTo(l.x, l.y + y * c);
        ctx.lineTo(l.x + l.w, l.y + y * c);
        ctx.stroke();
      }

      // Incoming row bed / rise animation.
      const rise = board.riseVisual;
      let riseOffset = 0;
      if (rise) riseOffset = easeOutCubic(clamp(rise.timer / rise.total, 0, 1)) * rise.lines * c;
      for (let y = 0; y < CONFIG.ROWS; y++) {
        for (let x = 0; x < CONFIG.COLS; x++) {
          const cell = board.grid[y][x];
          if (!cell) continue;
          let drawY = y;
          if (cell.fallFrom != null && board.resolution?.phase === "fall") {
            const progress = 1 - clamp(board.resolution.timer / board.resolution.total, 0, 1);
            drawY = lerp(cell.fallFrom, y, easeOutCubic(progress));
          }
          const sx = l.x + (x + 0.5) * c,
            sy = l.y + (drawY - CONFIG.HIDDEN_ROWS + 0.5) * c + riseOffset;
          let scale = 1;
          if (cell.flash > 0)
            scale = 0.82 + Math.sin((1 - cell.flash) * Math.PI * 5) * 0.14 + cell.flash * 0.15;
          this.drawBlob(cell, sx, sy, c * 0.9, {
            alpha: 1,
            scale,
            flash: cell.flash,
            glyph: this.settings.glyphs,
          });
        }
      }

      // Ghost and active piece.
      if (board.active) {
        const ghost = board.getGhostPositions();
        for (const p of ghost) {
          const sx = l.x + (p.x + 0.5) * c,
            sy = l.y + (p.y - CONFIG.HIDDEN_ROWS + 0.5) * c;
          this.drawBlob(p.cell, sx, sy, c * 0.86, {
            alpha: 0.16,
            outline: true,
            face: false,
            glyph: this.settings.glyphs,
          });
        }
        const active = board.activePositions();
        if (active.length === 2) {
          const a = this.gridToScreen(l, active[0].x, active[0].y),
            b = this.gridToScreen(l, active[1].x, active[1].y);
          ctx.save();
          ctx.strokeStyle = "rgba(255,255,255,.3)";
          ctx.lineWidth = c * 0.17;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
          ctx.restore();
        }
        for (const p of active) {
          const sx = l.x + (p.x + 0.5) * c,
            sy = l.y + (p.y - CONFIG.HIDDEN_ROWS + 0.5) * c;
          this.drawBlob(p.cell, sx, sy, c * 0.93, {
            alpha: 1,
            active: true,
            glyph: this.settings.glyphs,
          });
        }
      }

      // Incoming pressure arrows.
      const incoming = player.game.getIncomingLines(player) + board.pendingLines;
      if (incoming > 0) {
        const a = 0.45 + 0.45 * Math.sin(this.time * 9);
        ctx.globalAlpha = a;
        ctx.fillStyle = "#ff557f";
        for (let x = 0; x < CONFIG.COLS; x++) {
          const px = l.x + (x + 0.5) * c,
            py = l.y + l.h - 8;
          ctx.beginPath();
          ctx.moveTo(px, py - 11);
          ctx.lineTo(px - 5, py - 3);
          ctx.lineTo(px + 5, py - 3);
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.restore();

      // Top danger cap.
      const capX = l.x + (CONFIG.CENTER_COL + 0.5) * c;
      ctx.save();
      ctx.translate(capX, l.y - 5);
      ctx.fillStyle = danger > 0.5 ? "#ff5b7e" : "rgba(255,91,126,.55)";
      ctx.shadowColor = "#ff486f";
      ctx.shadowBlur = danger * 16;
      ctx.beginPath();
      ctx.moveTo(0, 9);
      ctx.lineTo(-7, -2);
      ctx.lineTo(7, -2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      this.drawNextQueue(player, l);
      this.drawBoardStatus(player, l);
      ctx.restore();
    }

    drawNextQueue(player, l) {
      const ctx = this.ctx,
        c = l.cell,
        queue = player.board.nextQueue.slice(0, 3);
      if (!queue.length) return;
      let x, y;
      if (this.layout.landscape) {
        if (player.isHuman) {
          x = l.x - 30;
          y = l.y + 12;
        } else {
          x = l.x + l.w + 30;
          y = l.y + 12;
        }
      } else {
        x = l.x + l.w + 18;
        y = l.y + 10;
        if (player.id === "cpu") {
          x = l.x + l.w + 14;
        }
      }
      ctx.save();
      ctx.globalAlpha = 0.82;
      queue.forEach((pair, i) => {
        const size = Math.max(8, c * (i === 0 ? 0.32 : 0.25));
        const yy = y + i * c * 0.78;
        this.drawBlob(pair[0], x, yy, size * 2, {
          alpha: 1,
          face: false,
          glyph: this.settings.glyphs,
        });
        this.drawBlob(pair[1], x, yy + size * 1.45, size * 2, {
          alpha: 1,
          face: false,
          glyph: this.settings.glyphs,
        });
      });
      ctx.restore();
    }

    drawBoardStatus(player, l) {
      const ctx = this.ctx,
        c = l.cell;
      const incoming = player.game.getIncomingLines(player) + player.board.pendingLines;
      if (incoming > 0) {
        const x = player.isHuman ? l.x + l.w + 8 : l.x - 8;
        ctx.save();
        ctx.textAlign = player.isHuman ? "left" : "right";
        ctx.textBaseline = "bottom";
        ctx.font = `950 ${Math.max(14, c * 0.34)}px ui-monospace,monospace`;
        ctx.fillStyle = "#ff6387";
        ctx.shadowColor = "#ff486f";
        ctx.shadowBlur = 10;
        ctx.fillText(`▲${incoming}`, x, l.y + l.h);
        ctx.restore();
      }
      if (player.lastChain >= 2 && player.recentChainTimer > 0) {
        ctx.save();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#ffffff";
        ctx.font = `950 ${Math.max(13, c * 0.3)}px ui-sans-serif,system-ui`;
        ctx.shadowColor = "#19d7ff";
        ctx.shadowBlur = 10;
        ctx.fillText(`${player.lastChain}×`, l.x + l.w / 2, l.y + l.h + 18);
        ctx.restore();
      }
    }

    drawCentralHUD(game) {
      const p = game.player;
      const cp = p.displayCp;
      const attack = this.layout.controls.attack,
        defense = this.layout.controls.defense;
      this.drawCastButton(attack, "attack", cp, p, game);
      this.drawCastButton(defense, "defense", cp, p, game);
      this.hitRegions.push({ type: "attack", ...attack }, { type: "defense", ...defense });

      // Shared CP readout.
      const ctx = this.ctx;
      const x = this.layout.center.x;
      const y = this.layout.landscape ? (attack.y + defense.y) / 2 : this.layout.center.y;
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `950 ${this.layout.landscape ? 26 : 14}px ui-monospace,monospace`;
      ctx.fillStyle = cp >= 100 ? "#ffffff" : "#8791b4";
      ctx.shadowColor = cp >= 100 ? "#19d7ff" : "transparent";
      ctx.shadowBlur = cp >= 100 ? 12 : 0;
      ctx.fillText(this.i18n.formatNumber(Math.round(cp)), x, y);
      ctx.font = `800 ${this.layout.landscape ? 8 : 7}px ui-sans-serif,system-ui`;
      ctx.fillStyle = "rgba(194,207,239,.65)";
      ctx.shadowBlur = 0;
      ctx.fillText(this.i18n.t("canvas.energy"), x, y + (this.layout.landscape ? 19 : 13));
      ctx.restore();
    }

    drawCastButton(b, type, cp, player, game) {
      const ctx = this.ctx,
        ready = cp >= CONFIG.CAST_MIN_CP;
      const isAttack = type === "attack";
      const color = isAttack ? "#ffc94a" : "#59f1ff";
      const pending = game.getIncomingLines(player) + player.board.pendingLines;
      const emphasis =
        ready && (isAttack ? true : pending > 0 || player.board.dangerRatio() > 0.55);
      const pulse = 1 + (emphasis ? Math.sin(this.time * 6) * 0.045 : 0);
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.scale(pulse, pulse);
      ctx.globalAlpha = ready ? 1 : 0.5;
      ctx.shadowColor = ready ? color : "transparent";
      ctx.shadowBlur = ready ? (emphasis ? 26 : 13) : 0;
      const g = ctx.createRadialGradient(-b.r * 0.28, -b.r * 0.32, 2, 0, 0, b.r);
      g.addColorStop(0, ready ? "rgba(255,255,255,.28)" : "rgba(255,255,255,.09)");
      g.addColorStop(0.3, isAttack ? "rgba(104,64,16,.92)" : "rgba(10,76,94,.92)");
      g.addColorStop(1, "rgba(6,8,28,.96)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 2;
      ctx.strokeStyle = ready ? color : "rgba(166,181,218,.25)";
      ctx.stroke();
      const charge = clamp(cp / 100, 0, 1);
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.arc(0, 0, b.r + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * charge);
      ctx.stroke();
      if (cp > 100) {
        const tiers = clamp(1 + Math.floor((cp - 100) / 125), 1, 7);
        for (let i = 0; i < tiers; i++) {
          const a = -Math.PI / 2 + (i / Math.max(1, tiers)) * Math.PI * 2;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * (b.r + 9), Math.sin(a) * (b.r + 9), 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.strokeStyle = ready ? "#ffffff" : "#8b94b6";
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = Math.max(2, b.r * 0.075);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (isAttack) {
        const r = b.r * 0.42;
        ctx.beginPath();
        for (let i = 0; i < 16; i++) {
          const a = (i * Math.PI) / 8 - Math.PI / 2,
            rr = i % 2 === 0 ? r : r * 0.52;
          const x = Math.cos(a) * rr,
            y = Math.sin(a) * rr;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-r * 0.18, r * 0.5);
        ctx.lineTo(r * 0.45, -r * 0.28);
        ctx.moveTo(r * 0.12, -r * 0.3);
        ctx.lineTo(r * 0.48, -r * 0.31);
        ctx.lineTo(r * 0.46, r * 0.05);
        ctx.stroke();
      } else {
        const r = b.r * 0.42;
        ctx.beginPath();
        ctx.moveTo(0, -r);
        ctx.lineTo(r * 0.78, -r * 0.62);
        ctx.lineTo(r * 0.65, r * 0.35);
        ctx.quadraticCurveTo(0, r, -r * 0.65, r * 0.35);
        ctx.lineTo(-r * 0.78, -r * 0.62);
        ctx.closePath();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-r * 0.36, 0);
        ctx.lineTo(-r * 0.08, r * 0.28);
        ctx.lineTo(r * 0.4, -r * 0.34);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawCountdown(game) {
      if (game.state !== "countdown") return;
      const ctx = this.ctx;
      const value = Math.ceil(game.countdown);
      const text = value > 0 ? String(value) : this.i18n.t("canvas.countdownStart");
      const phase = 1 - (game.countdown % 1);
      const scale = 0.55 + easeOutBack(clamp(phase, 0, 1)) * 0.55;
      ctx.save();
      ctx.translate(this.width / 2, this.height / 2);
      ctx.scale(scale, scale);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `1000 ${Math.min(150, this.height * 0.18)}px ui-sans-serif,system-ui`;
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = value > 0 ? "#19d7ff" : "#ff4fd8";
      ctx.shadowBlur = 30;
      ctx.globalAlpha = clamp(1 - phase * 0.72, 0.2, 1);
      ctx.fillText(text, 0, 0);
      ctx.restore();
    }

    drawTutorial(game) {
      const t = game.tutorial;
      if (!t?.active || game.state !== "playing") return;
      const ctx = this.ctx,
        l = this.layoutFor(game.player),
        c = l.cell;
      const alpha = 0.62 + 0.34 * Math.sin(this.time * 5);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = "#ffffff";
      ctx.fillStyle = "#ffffff";
      ctx.lineWidth = Math.max(3, c * 0.07);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.shadowColor = "#19d7ff";
      ctx.shadowBlur = 14;
      if (t.stage === 0) {
        const y = l.y + l.h * 0.38,
          x = l.x + l.w / 2;
        this.drawChevron(ctx, x - c * 1.25, y, c * 0.28, "left");
        this.drawChevron(ctx, x + c * 1.25, y, c * 0.28, "right");
        ctx.beginPath();
        ctx.moveTo(x - c * 0.7, y);
        ctx.lineTo(x + c * 0.7, y);
        ctx.stroke();
      } else if (t.stage === 1) {
        const a = game.player.board.activePositions();
        if (a.length) {
          const p = this.gridToScreen(l, a[0].x, a[0].y);
          ctx.beginPath();
          ctx.arc(p.x, p.y, c * 0.78, -Math.PI * 0.25, Math.PI * 1.35);
          ctx.stroke();
          this.drawChevron(ctx, p.x + c * 0.13, p.y - c * 0.76, c * 0.18, "right");
        }
      } else if (t.stage === 2 || t.stage === 3) {
        const x = l.x + 4.5 * c,
          y = l.y + l.h - c * 0.45;
        for (let i = 0; i < 3; i++)
          this.drawChevron(ctx, x, y - c * (2.2 - i * 0.5), c * 0.22, "down");
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(l.x + 4 * c + 4, l.y + l.h - c + 4, c - 8, c - 8);
        ctx.setLineDash([]);
      } else if (t.stage === 4) {
        const b = this.layout.controls.attack;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r + 13 + Math.sin(this.time * 5) * 4, 0, Math.PI * 2);
        ctx.stroke();
      } else if (t.stage === 5) {
        const from = this.energyPosition(game.cpu),
          to = this.energyPosition(game.player);
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      } else if (t.stage === 6) {
        const b = this.layout.controls.defense;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r + 13 + Math.sin(this.time * 6) * 4, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawChevron(ctx, x, y, r, dir) {
      ctx.save();
      ctx.translate(x, y);
      const rot = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[dir] || 0;
      ctx.rotate(rot);
      ctx.beginPath();
      ctx.moveTo(-r * 0.6, -r);
      ctx.lineTo(r * 0.45, 0);
      ctx.lineTo(-r * 0.6, r);
      ctx.stroke();
      ctx.restore();
    }

    drawBlob(cell, cx, cy, size, opts = {}) {
      const ctx = this.ctx;
      if (!cell || size <= 0) return;
      const alpha = opts.alpha ?? 1,
        scale = opts.scale ?? 1;
      const kind = cell.kind || "normal";
      const color = kind === "pulse" ? "#fff8c7" : CONFIG.COLOR_HEX[cell.color] || "#ffffff";
      const dark = kind === "pulse" ? "#cf8d21" : CONFIG.COLOR_DARK[cell.color] || "#777777";
      const light = kind === "pulse" ? "#ffffff" : CONFIG.COLOR_LIGHT[cell.color] || "#ffffff";
      const phase = this.time * 2.2 + (cell.wobble || cell.color || 0);
      const wobble = this.settings.reducedMotion ? 0 : Math.sin(phase) * 0.025;
      const r = size * 0.5;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(scale * (1 + wobble), scale * (1 - wobble * 0.65));
      ctx.globalAlpha *= alpha;
      if (opts.outline) {
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1.5, size * 0.055);
        ctx.setLineDash([size * 0.12, size * 0.08]);
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.87, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
        return;
      }
      ctx.shadowColor = color;
      ctx.shadowBlur = opts.active ? size * 0.22 : size * 0.1;
      const grad = ctx.createRadialGradient(
        -r * 0.32,
        -r * 0.35,
        r * 0.04,
        r * 0.08,
        r * 0.12,
        r * 1.15,
      );
      grad.addColorStop(0, light);
      grad.addColorStop(0.18, color);
      grad.addColorStop(0.72, color);
      grad.addColorStop(1, dark);
      ctx.fillStyle = grad;
      this.blobPath(ctx, r, cell.id || 0);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(255,255,255,.48)";
      ctx.lineWidth = Math.max(1, size * 0.028);
      this.blobPath(ctx, r * 0.97, cell.id || 0);
      ctx.stroke();

      // Gloss.
      ctx.globalAlpha *= 0.38;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.ellipse(-r * 0.23, -r * 0.32, r * 0.25, r * 0.13, -0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = alpha;

      if (kind === "pulse") this.drawPulseGlyph(ctx, r, phase);
      else if (opts.glyph !== false) this.drawColorGlyph(ctx, r, cell.color);
      if (opts.face !== false) this.drawFace(ctx, r, kind, cell.color);

      if ((opts.flash || 0) > 0) {
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = clamp((1 - opts.flash) * 1.3, 0, 0.8);
        ctx.fillStyle = "#ffffff";
        this.blobPath(ctx, r, cell.id || 0);
        ctx.fill();
      }
      ctx.restore();
    }

    blobPath(ctx, r, id) {
      const n = (id % 7) * 0.012;
      ctx.beginPath();
      ctx.moveTo(0, -r * (0.96 + n));
      ctx.bezierCurveTo(r * 0.58, -r * 1.02, r * 1.02, -r * 0.56, r * (0.96 - n), 0);
      ctx.bezierCurveTo(r * 1.01, r * 0.56, r * 0.55, r * (0.98 + n), 0, r * 0.96);
      ctx.bezierCurveTo(-r * 0.58, r * (1.02 - n), -r * 1.0, r * 0.55, -r * 0.96, 0);
      ctx.bezierCurveTo(-r * 1.02, -r * 0.56, -r * 0.56, -r * (0.98 + n), 0, -r * (0.96 + n));
      ctx.closePath();
    }

    drawColorGlyph(ctx, r, color) {
      ctx.save();
      ctx.globalAlpha = 0.24;
      ctx.strokeStyle = "#081126";
      ctx.fillStyle = "#081126";
      ctx.lineWidth = Math.max(1.5, r * 0.09);
      ctx.lineCap = "round";
      if (color === 0) {
        for (const [x, y, s] of [
          [-0.36, -0.02, 0.13],
          [0.28, -0.25, 0.09],
          [0.34, 0.27, 0.12],
          [-0.2, 0.34, 0.08],
        ]) {
          ctx.beginPath();
          ctx.arc(r * x, r * y, r * s, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else if (color === 1) {
        ctx.beginPath();
        ctx.moveTo(-r * 0.58, r * 0.38);
        ctx.lineTo(r * 0.5, -r * 0.52);
        ctx.moveTo(-r * 0.34, r * 0.55);
        ctx.lineTo(r * 0.63, -r * 0.3);
        ctx.stroke();
      } else if (color === 2) {
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.43, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.16, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(-r * 0.5, 0);
        ctx.lineTo(r * 0.5, 0);
        ctx.moveTo(0, -r * 0.5);
        ctx.lineTo(0, r * 0.5);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawPulseGlyph(ctx, r, phase) {
      const ctx2 = ctx;
      ctx2.save();
      ctx2.globalAlpha = 0.65;
      ctx2.fillStyle = "#8d5610";
      ctx2.strokeStyle = "#ffffff";
      ctx2.lineWidth = r * 0.07;
      ctx2.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i * Math.PI) / 5 - Math.PI / 2,
          rr = i % 2 === 0 ? r * 0.46 : r * 0.21;
        const x = Math.cos(a) * rr,
          y = Math.sin(a) * rr;
        if (i === 0) ctx2.moveTo(x, y);
        else ctx2.lineTo(x, y);
      }
      ctx2.closePath();
      ctx2.fill();
      ctx2.stroke();
      ctx2.globalAlpha = 0.75;
      ctx2.strokeStyle = "#ffffff";
      ctx2.beginPath();
      ctx2.arc(0, 0, r * 0.72, phase * 0.25, phase * 0.25 + Math.PI * 1.35);
      ctx2.stroke();
      ctx2.restore();
    }

    drawFace(ctx, r, kind, color) {
      ctx.save();
      ctx.fillStyle = "#071026";
      ctx.strokeStyle = "#071026";
      ctx.lineWidth = Math.max(1.5, r * 0.09);
      ctx.lineCap = "round";
      const eyeY = -r * 0.05,
        dx = r * 0.27;
      if (kind === "pulse") {
        for (const ex of [-dx, dx]) {
          ctx.beginPath();
          for (let i = 0; i < 8; i++) {
            const a = (i * Math.PI) / 4,
              rr = i % 2 === 0 ? r * 0.105 : r * 0.045;
            const x = ex + Math.cos(a) * rr,
              y = eyeY + Math.sin(a) * rr;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.fill();
        }
      } else if (color === 1) {
        ctx.beginPath();
        ctx.moveTo(-dx - r * 0.09, eyeY - r * 0.04);
        ctx.lineTo(-dx + r * 0.09, eyeY + r * 0.04);
        ctx.moveTo(dx - r * 0.09, eyeY + r * 0.04);
        ctx.lineTo(dx + r * 0.09, eyeY - r * 0.04);
        ctx.stroke();
      } else if (color === 2) {
        ctx.beginPath();
        ctx.roundRect?.(-dx - r * 0.095, eyeY - r * 0.045, r * 0.19, r * 0.09, r * 0.04);
        ctx.fill();
        ctx.beginPath();
        ctx.roundRect?.(dx - r * 0.095, eyeY - r * 0.045, r * 0.19, r * 0.09, r * 0.04);
        ctx.fill();
      } else if (color === 3) {
        for (const ex of [-dx, dx]) {
          ctx.save();
          ctx.translate(ex, eyeY);
          ctx.rotate(Math.PI / 4);
          ctx.fillRect(-r * 0.07, -r * 0.07, r * 0.14, r * 0.14);
          ctx.restore();
        }
      } else {
        for (const ex of [-dx, dx]) {
          ctx.beginPath();
          ctx.ellipse(ex, eyeY, r * 0.075, r * 0.11, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.arc(ex - r * 0.02, eyeY - r * 0.035, r * 0.024, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#071026";
        }
      }
      ctx.beginPath();
      ctx.arc(0, r * 0.25, r * 0.19, 0.18 * Math.PI, 0.82 * Math.PI);
      ctx.stroke();
      ctx.restore();
    }

    drawProjectiles(game) {
      if (!game || !game.projectiles.length) return;
      const ctx = this.ctx;
      for (const p of game.projectiles) {
        const from = this.energyPosition(p.from),
          to = this.energyPosition(p.target);
        if (!from || !to) continue;
        const t = clamp(p.elapsed / p.duration, 0, 1),
          e = smoothstep(t);
        const arc =
          -Math.min(this.height * 0.24, 120 + p.originalLines * 10) * (p.from.isHuman ? -1 : 1);
        const cx = (from.x + to.x) / 2,
          cy = (from.y + to.y) / 2 + arc;
        const point = (q) => {
          const a = (1 - q) * (1 - q),
            b = 2 * (1 - q) * q,
            c = q * q;
          return { x: a * from.x + b * cx + c * to.x, y: a * from.y + b * cy + c * to.y };
        };
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        for (let i = 0; i < 4; i++) {
          const q0 = clamp(e - i * 0.035 - 0.18, 0, 1),
            q1 = clamp(e - i * 0.02, 0, 1);
          const a = point(q0),
            b = point(q1);
          ctx.globalAlpha = (1 - i * 0.18) * (p.lines > 0 ? 1 : 0.35);
          ctx.strokeStyle = i % 2 ? "#ff4fd8" : "#ffc94a";
          ctx.lineWidth = Math.max(2, 10 - i * 2 + p.lines);
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.quadraticCurveTo(cx, cy, b.x, b.y);
          ctx.stroke();
        }
        const head = point(e);
        ctx.globalAlpha = 1;
        ctx.fillStyle = p.lines > 0 ? "#ffffff" : "#8da0b8";
        ctx.shadowColor = p.lines > 0 ? "#ffbd5d" : "#8da0b8";
        ctx.shadowBlur = 24;
        ctx.beginPath();
        ctx.arc(head.x, head.y, 8 + p.lines * 1.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#2c1231";
        ctx.font = `950 ${10 + p.lines}px ui-monospace,monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(p.lines), head.x, head.y + 1);
        ctx.restore();
      }
    }

    drawEffects() {
      const ctx = this.ctx;
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      for (const r of this.shockwaves) {
        const t = 1 - r.life / r.max;
        ctx.globalAlpha = (1 - t) * 0.7;
        ctx.strokeStyle = r.color;
        ctx.lineWidth = lerp(6, 1, t);
        ctx.beginPath();
        ctx.arc(r.x, r.y, lerp(r.start, r.radius, easeOutCubic(t)), 0, Math.PI * 2);
        ctx.stroke();
      }
      for (const r of this.rings) {
        const t = 1 - r.life / r.max;
        ctx.globalAlpha = (1 - t) * 0.8;
        ctx.strokeStyle = r.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(r.x, r.y, lerp(r.fromRadius, r.toRadius, easeOutCubic(t)), 0, Math.PI * 2);
        ctx.stroke();
      }
      for (const p of this.particles) {
        const a = clamp(p.life / p.max, 0, 1);
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        if (p.kind === "diamond") {
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      for (const s of this.shields) {
        const l = this.layoutFor(s.player);
        if (!l) continue;
        const t = 1 - s.life / s.max;
        ctx.globalAlpha = (1 - t) * 0.55;
        ctx.strokeStyle = "#8ffbff";
        ctx.lineWidth = lerp(8, 2, t);
        ctx.shadowColor = "#19d7ff";
        ctx.shadowBlur = 22;
        roundedRect(
          ctx,
          l.x - lerp(5, 26, t),
          l.y - lerp(5, 26, t),
          l.w + lerp(10, 52, t),
          l.h + lerp(10, 52, t),
          18 + 20 * t,
        );
        ctx.stroke();
      }
      ctx.restore();
      for (const f of this.floats) {
        const t = 1 - f.life / f.max;
        ctx.save();
        ctx.globalAlpha = clamp((1 - t) * 4, 0, 1) * clamp(f.life * 3, 0, 1);
        ctx.translate(f.x, f.y - 40 * easeOutCubic(t));
        ctx.scale(
          lerp(0.7, f.scale, easeOutBack(clamp(t * 2, 0, 1))),
          lerp(0.7, f.scale, easeOutBack(clamp(t * 2, 0, 1))),
        );
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = `1000 ${f.size}px ui-sans-serif,system-ui`;
        ctx.fillStyle = f.color;
        ctx.shadowColor = f.color;
        ctx.shadowBlur = 18;
        ctx.fillText(f.text, 0, 0);
        ctx.restore();
      }
    }

    gridToScreen(l, x, y) {
      return { x: l.x + (x + 0.5) * l.cell, y: l.y + (y - CONFIG.HIDDEN_ROWS + 0.5) * l.cell };
    }
    clearCenter(l, cells) {
      if (!cells?.length) return { x: l.x + l.w / 2, y: l.y + l.h / 2 };
      let x = 0,
        y = 0;
      for (const c of cells) {
        const p = this.gridToScreen(l, c.x, c.y);
        x += p.x;
        y += p.y;
      }
      return { x: x / cells.length, y: y / cells.length };
    }
    energyPosition(player) {
      if (!this.layout || !player) return { x: this.width / 2, y: this.height / 2 };
      if (player.isHuman) return { x: this.layout.center.x, y: this.layout.center.y };
      const l = this.layoutFor(player);
      return { x: l.x + l.w / 2, y: l.y - 22 };
    }
    addBoardShake(player, amount) {
      if (player?.board) player.board.shake = Math.min(1, player.board.shake + amount);
    }
    spawnParticle(x, y, color, opts = {}) {
      this.particles.push({
        x,
        y,
        color,
        vx: opts.vx ?? (Math.random() - 0.5) * 160,
        vy: opts.vy ?? (Math.random() - 0.5) * 180,
        gravity: opts.gravity ?? 180,
        drag: opts.drag ?? 0.96,
        life: opts.life ?? 0.65,
        max: opts.life ?? 0.65,
        size: opts.size ?? 2 + Math.random() * 4,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 8,
        kind: opts.kind ?? (Math.random() > 0.55 ? "diamond" : "circle"),
      });
    }
    burst(x, y, color, count = 12, power = 1) {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2,
          s = (45 + Math.random() * 170) * power;
        this.spawnParticle(x, y, color, {
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s,
          gravity: 120 + Math.random() * 160,
          life: 0.35 + Math.random() * 0.5,
          size: 1.5 + Math.random() * 4 * power,
        });
      }
    }
    addShockwave(x, y, radius, color = "#fff", life = 0.35) {
      this.shockwaves.push({ x, y, radius, start: 4, color, life, max: life });
    }
    addFloat(x, y, text, color = "#fff", scale = 1, life = 0.8) {
      this.floats.push({
        x,
        y,
        text,
        color,
        scale,
        life,
        max: life,
        size: clamp(22 * scale, 16, 54),
      });
    }
    announce(text, color = "#fff") {
      const el = this.dom.announcer;
      if (!el) return;
      el.textContent = text;
      el.style.color = color;
      el.classList.remove("show");
      void el.offsetWidth;
      el.classList.add("show");
    }

    hitTest(x, y) {
      for (let i = this.hitRegions.length - 1; i >= 0; i--) {
        const r = this.hitRegions[i];
        if (Math.hypot(x - r.x, y - r.y) <= r.r * 1.15) return r.type;
      }
      return null;
    }

    destroy() {
      this.stopResize();
      for (const unsubscribe of this.unsubscribe.splice(0)) unsubscribe();
      this.particles.length = 0;
      this.shockwaves.length = 0;
      this.floats.length = 0;
      this.rings.length = 0;
      this.shields.length = 0;
      this.backgroundBursts.length = 0;
    }
  }

  PLO.Renderer = Renderer;
})();
