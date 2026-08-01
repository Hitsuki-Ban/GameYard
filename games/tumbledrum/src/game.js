(function () {
  'use strict';

  const TD = (window.TD = window.TD || {});
  const CONTENT = TD.CONTENT;
  const I18N = TD.I18N;
  if (!CONTENT || !I18N) throw new Error('TUMBLEDRUM requires content.js and i18n.js before game.js.');
  const W = CONTENT.W;
  const H = CONTENT.H;
  const TAU = Math.PI * 2;
  const FIXED_DT = 1 / 120;
  const SAVE_KEY = 'gameyard.game.tumbledrum.save.v1';
  const SAVE_SCHEMA_VERSION = 1;
  const STAMP_IDS = ['sweet', 'combo', 'parade', 'perfect', 'boss', 'endless'];
  const TITLE_ACTIONS = [
    { id: 'campaign', x: 450, y: 960, radius: 112 },
    { id: 'endless', x: 700, y: 1000, radius: 80 },
    { id: 'settings', x: 815, y: 88, radius: 58 }
  ];
  const SETTINGS_ROWS = [
    { key: 'contrast', y: 510, icon: 'contrast', type: 'toggle' },
    { key: 'fullscreen', y: 760, icon: 'fullscreen', type: 'action' }
  ];

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const invLerp = (a, b, v) => clamp((v - a) / (b - a), 0, 1);
  const smoothstep = (t) => t * t * (3 - 2 * t);
  const easeOutBack = (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  };
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const distance = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
  const signNonZero = (v) => (v < 0 ? -1 : 1);

  function hashFloat(n) {
    const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  class RNG {
    constructor(seed) {
      this.state = (seed >>> 0) || 1;
    }

    next() {
      let t = (this.state += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    range(min, max) {
      return min + (max - min) * this.next();
    }

    int(min, max) {
      return Math.floor(this.range(min, max + 1));
    }

    pick(array) {
      return array[Math.floor(this.next() * array.length)];
    }
  }

  function defaultSave() {
    return {
      schemaVersion: SAVE_SCHEMA_VERSION,
      bestCampaign: 0,
      bestEndless: 0,
      cleared: false,
      contrast: false,
      stamps: Object.fromEntries(STAMP_IDS.map((id) => [id, false]))
    };
  }

  function parseSave(value) {
    if (value === null) return defaultSave();
    let parsed;
    try {
      parsed = JSON.parse(value);
    } catch (error) {
      throw new TypeError(`TUMBLEDRUM save is not valid JSON: ${error.message}`);
    }
    const expectedKeys = ['bestCampaign', 'bestEndless', 'cleared', 'contrast', 'schemaVersion', 'stamps'];
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new TypeError('TUMBLEDRUM save must be an object.');
    }
    const actualKeys = Object.keys(parsed).sort();
    if (
      actualKeys.length !== expectedKeys.length ||
      actualKeys.some((key, index) => key !== expectedKeys[index])
    ) {
      throw new TypeError(`TUMBLEDRUM save must contain exactly: ${expectedKeys.join(', ')}.`);
    }
    if (parsed.schemaVersion !== SAVE_SCHEMA_VERSION) {
      throw new RangeError(`Unsupported TUMBLEDRUM save schema: ${String(parsed.schemaVersion)}.`);
    }
    if (!Number.isSafeInteger(parsed.bestCampaign) || parsed.bestCampaign < 0) {
      throw new TypeError('TUMBLEDRUM bestCampaign must be a non-negative safe integer.');
    }
    if (!Number.isSafeInteger(parsed.bestEndless) || parsed.bestEndless < 0) {
      throw new TypeError('TUMBLEDRUM bestEndless must be a non-negative safe integer.');
    }
    if (typeof parsed.cleared !== 'boolean' || typeof parsed.contrast !== 'boolean') {
      throw new TypeError('TUMBLEDRUM cleared and contrast fields must be booleans.');
    }
    if (!parsed.stamps || typeof parsed.stamps !== 'object' || Array.isArray(parsed.stamps)) {
      throw new TypeError('TUMBLEDRUM stamps must be an object.');
    }
    const stampKeys = Object.keys(parsed.stamps).sort();
    const expectedStampKeys = [...STAMP_IDS].sort();
    if (
      stampKeys.length !== expectedStampKeys.length ||
      stampKeys.some((key, index) => key !== expectedStampKeys[index]) ||
      expectedStampKeys.some((key) => typeof parsed.stamps[key] !== 'boolean')
    ) {
      throw new TypeError(`TUMBLEDRUM stamps must contain exactly: ${expectedStampKeys.join(', ')}.`);
    }
    return parsed;
  }

  function circleRectCollision(ball, rect, padding) {
    const p = padding || 0;
    const left = rect.x - p;
    const top = rect.y - p;
    const right = rect.x + rect.w + p;
    const bottom = rect.y + rect.h + p;
    const nearestX = clamp(ball.x, left, right);
    const nearestY = clamp(ball.y, top, bottom);
    let dx = ball.x - nearestX;
    let dy = ball.y - nearestY;
    const r = ball.r;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) return null;
    if (d2 > 0.00001) {
      const d = Math.sqrt(d2);
      return { nx: dx / d, ny: dy / d, overlap: r - d };
    }

    const dl = Math.abs(ball.x - left);
    const dr = Math.abs(right - ball.x);
    const dt = Math.abs(ball.y - top);
    const db = Math.abs(bottom - ball.y);
    const min = Math.min(dl, dr, dt, db);
    if (min === dl) return { nx: -1, ny: 0, overlap: r + dl };
    if (min === dr) return { nx: 1, ny: 0, overlap: r + dr };
    if (min === dt) return { nx: 0, ny: -1, overlap: r + dt };
    return { nx: 0, ny: 1, overlap: r + db };
  }

  function circleOrientedRectCollision(ball, rect) {
    const rotation = rect.rot || 0;
    if (Math.abs(rotation) < 0.00001) return circleRectCollision(ball, rect, 0);
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const dx = ball.x - cx;
    const dy = ball.y - cy;
    const localBall = {
      x: dx * cos + dy * sin + rect.w / 2,
      y: -dx * sin + dy * cos + rect.h / 2,
      r: ball.r
    };
    const hit = circleRectCollision(localBall, { x: 0, y: 0, w: rect.w, h: rect.h }, 0);
    if (!hit) return null;
    return {
      nx: hit.nx * cos - hit.ny * sin,
      ny: hit.nx * sin + hit.ny * cos,
      overlap: hit.overlap
    };
  }

  function aabbOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function orientedRectCorners(rect) {
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    const halfW = rect.w / 2;
    const halfH = rect.h / 2;
    const rotation = rect.rot || 0;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    return [
      [-halfW, -halfH],
      [halfW, -halfH],
      [halfW, halfH],
      [-halfW, halfH]
    ].map(([x, y]) => ({
      x: cx + x * cos - y * sin,
      y: cy + x * sin + y * cos
    }));
  }

  function orientedRectsOverlap(a, b) {
    const cornersA = orientedRectCorners(a);
    const cornersB = orientedRectCorners(b);
    const rotations = [a.rot || 0, b.rot || 0];
    const axes = [];
    for (const rotation of rotations) {
      axes.push({ x: Math.cos(rotation), y: Math.sin(rotation) });
      axes.push({ x: -Math.sin(rotation), y: Math.cos(rotation) });
    }
    for (const axis of axes) {
      let minA = Infinity;
      let maxA = -Infinity;
      let minB = Infinity;
      let maxB = -Infinity;
      for (const point of cornersA) {
        const projection = point.x * axis.x + point.y * axis.y;
        minA = Math.min(minA, projection);
        maxA = Math.max(maxA, projection);
      }
      for (const point of cornersB) {
        const projection = point.x * axis.x + point.y * axis.y;
        minB = Math.min(minB, projection);
        maxB = Math.max(maxB, projection);
      }
      if (maxA <= minB || maxB <= minA) return false;
    }
    return true;
  }

  class Game {
    constructor(canvas, statusEl, context, bridge) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
      this.statusEl = statusEl;
      this.context = context;
      this.bridge = bridge;
      this.resources = bridge.resources;
      this.lifecycle = 'booting';
      this.disposed = false;
      this.hostPaused = true;
      this.hostInputEnabled = false;
      this.inputEnabled = false;
      this.cancelFrame = null;
      this.cancelOrientationTimer = null;
      this.events = [];
      this.dpr = 1;
      this.scale = 1;
      this.lastFrame = performance.now();
      this.accumulator = 0;
      this.time = 0;
      this.state = 'title';
      this.paused = false;
      this.mode = 'campaign';
      this.keys = Object.create(null);
      this.pointer = { x: W / 2, y: H / 2, active: false, down: false, type: 'mouse', movedAt: 0 };
      this.gamepad = {
        axis: 0,
        action: false,
        pause: false,
        prevAction: false,
        prevPause: false,
        navX: 0,
        navY: 0,
        prevNavX: 0,
        prevNavY: 0
      };
      this.titleIndex = 0;
      this.settingsIndex = 0;
      this.menuIndex = 0;
      this.keyboardNavigationActive = false;
      this.shake = 0;
      this.shakeX = 0;
      this.shakeY = 0;
      this.rng = new RNG(0x51a7c0de);
      this.grain = [];
      this.stitches = [];
      this._makeBackdropData();

      this.settings = {
        audio: context.settings.audio.master > 0 && context.settings.audio.sfx > 0,
        music: context.settings.audio.master > 0 && context.settings.audio.music > 0,
        shake: context.settings.motion.screenShake,
        motion: !context.settings.motion.reduced,
        contrast: false
      };
      I18N.setLocale(context.locale.resolved);
      this.save = parseSave(localStorage.getItem(SAVE_KEY));
      this.settings.contrast = this.save.contrast;
      this.audio = new TD.AudioEngine(context.settings.audio);
      this.resources.register(() => this.terminateResources());
      this.currentStatus = null;
      this.removeLocaleListener = I18N.onChange(() => this.handleLocaleChange());

      this.particles = [];
      this.rings = [];
      this.popups = [];
      this.streamers = [];
      this.powerups = [];
      this.stampNotice = null;
      this.titleDemo = null;
      this.palette = CONTENT.PALETTES[0];
      this.resetTitleDemo();
      this.installEvents();
      this.resize();
      this.setStatus('status.title');
      this.draw();
    }

    _makeBackdropData() {
      const rng = new RNG(0x9f31a2);
      for (let i = 0; i < 320; i += 1) {
        this.grain.push({
          x: rng.range(34, W - 34),
          y: rng.range(28, H - 28),
          a: rng.range(0.015, 0.055),
          s: rng.range(0.5, 2.2)
        });
      }
      for (let i = 0; i < 38; i += 1) {
        this.stitches.push({
          x: rng.range(48, W - 48),
          y: rng.range(120, H - 80),
          r: rng.range(-0.35, 0.35)
        });
      }
    }

    installEvents() {
      const map = (event) => {
        const rect = this.canvas.getBoundingClientRect();
        this.pointer.x = clamp(((event.clientX - rect.left) / rect.width) * W, 0, W);
        this.pointer.y = clamp(((event.clientY - rect.top) / rect.height) * H, 0, H);
        this.pointer.active = true;
        this.pointer.type = event.pointerType || 'mouse';
        this.pointer.movedAt = performance.now();
      };

      this.resources.listen(this.canvas, 'pointermove', (event) => {
        if (!this.inputEnabled) return;
        map(event);
        this.keyboardNavigationActive = false;
        if (event.pointerType === 'touch') event.preventDefault();
      });

      this.resources.listen(this.canvas, 'pointerdown', (event) => {
        if (!this.inputEnabled) return;
        map(event);
        this.keyboardNavigationActive = false;
        this.pointer.down = true;
        this.canvas.focus({ preventScroll: true });
        this.canvas.setPointerCapture?.(event.pointerId);
        event.preventDefault();
      });

      this.resources.listen(this.canvas, 'pointerup', (event) => {
        if (!this.inputEnabled) return;
        map(event);
        const shouldActivate = this.pointer.down;
        this.pointer.down = false;
        void this.audio.unlock();
        if (shouldActivate) this.actionAt(this.pointer.x, this.pointer.y);
        event.preventDefault();
      });

      this.resources.listen(this.canvas, 'pointercancel', () => this.releaseAllInput());
      this.resources.listen(this.canvas, 'lostpointercapture', () => this.releaseAllInput());
      this.resources.listen(this.canvas, 'contextmenu', (event) => event.preventDefault());

      this.resources.listen(window, 'keydown', (event) => {
        if (!this.inputEnabled) return;
        const key = event.key.toLowerCase();
        this.keys[key] = true;
        if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' ', 'enter', 'a', 'd', 'p', 'escape', 'f'].includes(key)) {
          event.preventDefault();
        }
        if (event.repeat) return;
        if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'a', 'd', ' ', 'enter'].includes(key)) {
          this.keyboardNavigationActive = true;
        }

        if (key === 'escape' && this.state === 'settings') {
          this.closeSettings();
        } else if (
          this.state === 'title' &&
          ['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'a', 'd'].includes(key)
        ) {
          const direction = key === 'arrowleft' || key === 'arrowup' || key === 'a' ? -1 : 1;
          this.moveTitleSelection(direction);
        } else if (this.state === 'settings' && (key === 'arrowup' || key === 'arrowdown')) {
          this.moveSettingsSelection(key === 'arrowup' ? -1 : 1);
        } else if (
          this.state === 'settings' &&
          ['arrowleft', 'arrowright', 'a', 'd'].includes(key)
        ) {
          const direction = key === 'arrowleft' || key === 'a' ? -1 : 1;
          this.adjustSelectedSetting(direction);
        } else if (
          this.state === 'upgrade' &&
          ['arrowleft', 'arrowright', 'a', 'd'].includes(key)
        ) {
          const direction = key === 'arrowleft' || key === 'a' ? -1 : 1;
          const count = Math.max(1, this.upgradeOffers.length);
          this.menuIndex = (this.menuIndex + direction + count) % count;
        } else if (key === ' ' || key === 'enter') {
          this.audio.unlock();
          this.actionKeyboard();
        } else if (key === 'escape' || key === 'p') {
          this.togglePause();
        } else if (key === 'f') {
          this.toggleFullscreen();
        }
      });

      this.resources.listen(window, 'keyup', (event) => {
        this.keys[event.key.toLowerCase()] = false;
      });

      this.resources.listen(window, 'blur', () => this.releaseAllInput());
      this.resources.listen(window, 'resize', () => this.resize());
      this.resources.listen(window, 'orientationchange', () => {
        this.cancelOrientationTimer?.();
        this.cancelOrientationTimer = this.resources.timeout(() => {
          this.cancelOrientationTimer = null;
          this.resize();
        }, 120);
      });
    }

    resize() {
      this.dpr = clamp(window.devicePixelRatio || 1, 1, 2.5);
      this.canvas.width = Math.round(W * this.dpr);
      this.canvas.height = Math.round(H * this.dpr);
      const scale = Math.min(window.innerWidth / W, window.innerHeight / H);
      this.scale = scale;
      this.canvas.style.width = `${Math.floor(W * scale)}px`;
      this.canvas.style.height = `${Math.floor(H * scale)}px`;
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.ctx.imageSmoothingEnabled = true;
    }

    markReady() {
      this.lifecycle = 'ready';
    }

    scheduleFrame() {
      if (this.cancelFrame || this.disposed || this.hostPaused) return;
      this.cancelFrame = this.resources.animationFrame((timestamp) => this.loop(timestamp));
    }

    stopFrameLoop() {
      this.cancelFrame?.();
      this.cancelFrame = null;
    }

    applyHostSettings(settings) {
      this.context = { ...this.context, settings };
      this.settings.audio = settings.audio.master > 0 && settings.audio.sfx > 0;
      this.settings.music = settings.audio.master > 0 && settings.audio.music > 0;
      this.settings.shake = settings.motion.screenShake;
      this.settings.motion = !settings.motion.reduced;
      if (!this.settings.motion) {
        this.streamers.length = 0;
        for (const ball of this.balls || []) ball.trail.length = 0;
      }
      this.audio.setSettings(settings.audio);
      this.record(
        'info',
        'settings.applied',
        `Applied Host settings revision ${settings.revision}: master=${settings.audio.master}, music=${settings.audio.music}, sfx=${settings.audio.sfx}, reduced=${settings.motion.reduced}, shake=${settings.motion.screenShake}.`
      );
    }

    applyHostLocale(locale) {
      this.context = { ...this.context, locale };
      I18N.setLocale(locale.resolved);
      this.record('info', 'locale.applied', `Applied Host locale ${locale.resolved}.`);
    }

    setInputEnabled(enabled) {
      this.hostInputEnabled = enabled;
      this.syncInputState();
    }

    syncInputState() {
      const enabled = this.hostInputEnabled && !this.hostPaused && !this.disposed;
      if (this.inputEnabled === enabled) return;
      this.inputEnabled = enabled;
      if (!enabled) this.releaseAllInput();
    }

    releaseAllInput() {
      this.keys = Object.create(null);
      this.pointer.active = false;
      this.pointer.down = false;
      Object.assign(this.gamepad, {
        axis: 0,
        action: false,
        pause: false,
        prevAction: false,
        prevPause: false,
        navX: 0,
        navY: 0,
        prevNavX: 0,
        prevNavY: 0
      });
    }

    async hostPause() {
      this.hostPaused = true;
      this.paused = true;
      this.stopFrameLoop();
      this.syncInputState();
      this.releaseAllInput();
      await this.audio.setPaused(true);
      this.lifecycle = 'paused';
      this.bridge.emitLifecycleState('paused');
      this.setStatus('status.paused');
    }

    async hostResume() {
      if (this.disposed) return;
      this.hostPaused = false;
      this.paused = false;
      this.syncInputState();
      await this.audio.setPaused(false);
      this.lastFrame = performance.now();
      this.lifecycle = 'active';
      this.bridge.emitLifecycleState('active');
      this.scheduleFrame();
      this.setStatus(this.state === 'title' ? 'status.title' : 'status.resumed');
    }

    record(level, code, message) {
      const event = { timestampMs: Date.now(), level, code, message };
      this.events.push(event);
      if (this.events.length > 32) this.events.shift();
      this.bridge.emitDiagnostic(event);
    }

    diagnosticSnapshot() {
      return {
        lifecycle: this.lifecycle,
        settingsRevision: this.context.settings.revision,
        inputEnabled: this.inputEnabled,
        events: [...this.events]
      };
    }

    async dispose() {
      if (this.disposed) return;
      this.lifecycle = 'disposing';
      this.bridge.emitLifecycleState('disposing');
      this.disposed = true;
      this.stopFrameLoop();
      this.cancelOrientationTimer?.();
      this.cancelOrientationTimer = null;
      this.releaseAllInput();
      this.removeLocaleListener();
      await this.audio.dispose();
      this.lifecycle = 'disposed';
      this.bridge.emitLifecycleState('disposed');
    }

    terminateResources() {
      if (this.disposed) return;
      this.disposed = true;
      this.lifecycle = 'disposed';
      this.stopFrameLoop();
      this.cancelOrientationTimer?.();
      this.cancelOrientationTimer = null;
      this.releaseAllInput();
      this.removeLocaleListener();
      void this.audio.dispose();
    }

    loop(now) {
      this.cancelFrame = null;
      if (this.disposed || this.hostPaused) return;
      const raw = (now - this.lastFrame) / 1000;
      const dt = clamp(raw, 0, 0.05);
      this.lastFrame = now;
      this.pollGamepad();
      if (!this.paused) {
        this.accumulator += dt;
        let guard = 0;
        while (this.accumulator >= FIXED_DT && guard < 8) {
          this.update(FIXED_DT);
          this.accumulator -= FIXED_DT;
          guard += 1;
        }
      } else {
        this.updateAmbient(dt);
      }
      this.draw();
      this.scheduleFrame();
    }

    update(dt) {
      this.time += dt;
      this.updateAmbient(dt);
      switch (this.state) {
        case 'title':
          this.updateTitle(dt);
          break;
        case 'playing':
          this.updatePlaying(dt);
          break;
        case 'stageClear':
          this.updateStageClear(dt);
          break;
        case 'upgrade':
          this.updateUpgrade(dt);
          break;
        case 'upgradeChosen':
          this.updateUpgradeChosen(dt);
          break;
        case 'retry':
          this.updateRetry(dt);
          break;
        case 'bossDefeat':
          this.updateBossDefeat(dt);
          break;
        case 'victory':
          this.updateVictory(dt);
          break;
        case 'gameover':
          this.updateGameover(dt);
          break;
        case 'settings':
          break;
        default:
          break;
      }
      this.audio.update(dt, this);
    }

    updateAmbient(dt) {
      this.shake *= Math.exp(-dt * 15);
      if (this.shake < 0.01) this.shake = 0;
      const shakeAmount = this.settings.shake && this.settings.motion ? this.shake : 0;
      this.shakeX = (Math.random() * 2 - 1) * shakeAmount;
      this.shakeY = (Math.random() * 2 - 1) * shakeAmount;

      for (let i = this.particles.length - 1; i >= 0; i -= 1) {
        const p = this.particles[i];
        p.life -= dt;
        if (p.life <= 0) {
          this.particles.splice(i, 1);
          continue;
        }
        const drag = Math.pow(p.drag == null ? 0.985 : p.drag, dt * 60);
        p.vx *= drag;
        p.vy *= drag;
        p.vy += (p.gravity || 0) * dt;
        if (p.flutter) {
          p.vx += Math.sin(this.time * p.flutter + p.phase) * 18 * dt;
          p.rot += Math.sin(this.time * p.flutter * 0.7 + p.phase) * dt;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += (p.vr || 0) * dt;
      }

      for (let i = this.rings.length - 1; i >= 0; i -= 1) {
        this.rings[i].t += dt;
        if (this.rings[i].t >= this.rings[i].duration) this.rings.splice(i, 1);
      }

      for (let i = this.popups.length - 1; i >= 0; i -= 1) {
        const p = this.popups[i];
        p.t += dt;
        p.y -= 42 * dt;
        if (p.t >= p.duration) this.popups.splice(i, 1);
      }

      for (let i = this.streamers.length - 1; i >= 0; i -= 1) {
        const s = this.streamers[i];
        s.life -= dt;
        s.y += s.vy * dt;
        s.x += Math.sin(this.time * s.freq + s.phase) * s.swing * dt;
        s.rot += s.vr * dt;
        if (s.life <= 0 || s.y > H + 80) this.streamers.splice(i, 1);
      }

      if (this.stampNotice) {
        this.stampNotice.t += dt;
        if (this.stampNotice.t > 2.8) this.stampNotice = null;
      }
    }

    pollGamepad() {
      if (!this.inputEnabled) {
        this.releaseAllInput();
        return;
      }
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      let pad = null;
      for (let i = 0; i < pads.length; i += 1) {
        if (pads[i]) {
          pad = pads[i];
          break;
        }
      }
      if (!pad) {
        this.gamepad.axis = 0;
        this.gamepad.prevAction = false;
        this.gamepad.prevPause = false;
        this.gamepad.prevNavX = 0;
        this.gamepad.prevNavY = 0;
        return;
      }
      const stick = Math.abs(pad.axes[0] || 0) > 0.18 ? pad.axes[0] : 0;
      const dpadX = (pad.buttons[15] && pad.buttons[15].pressed ? 1 : 0) -
        (pad.buttons[14] && pad.buttons[14].pressed ? 1 : 0);
      const dpadY = (pad.buttons[13] && pad.buttons[13].pressed ? 1 : 0) -
        (pad.buttons[12] && pad.buttons[12].pressed ? 1 : 0);
      const horizontal = clamp(stick + dpadX, -1, 1);
      this.gamepad.axis = horizontal;
      this.gamepad.navX = horizontal > 0.55 ? 1 : horizontal < -0.55 ? -1 : 0;
      this.gamepad.navY = dpadY > 0 ? 1 : dpadY < 0 ? -1 : 0;
      const action = !!(pad.buttons[0] && pad.buttons[0].pressed);
      const pause = !!(pad.buttons[9] && pad.buttons[9].pressed);
      if (this.gamepad.navX && !this.gamepad.prevNavX) {
        this.keyboardNavigationActive = true;
        this.handleMenuNavigation(this.gamepad.navX, 0);
      }
      if (this.gamepad.navY && !this.gamepad.prevNavY) {
        this.keyboardNavigationActive = true;
        this.handleMenuNavigation(0, this.gamepad.navY);
      }
      if (action && !this.gamepad.prevAction) {
        this.keyboardNavigationActive = true;
        this.audio.unlock();
        this.actionKeyboard();
      }
      if (pause && !this.gamepad.prevPause) this.togglePause();
      this.gamepad.prevAction = action;
      this.gamepad.prevPause = pause;
      this.gamepad.prevNavX = this.gamepad.navX;
      this.gamepad.prevNavY = this.gamepad.navY;
    }

    handleMenuNavigation(horizontal, vertical) {
      if (this.state === 'title') {
        const direction = horizontal || vertical;
        if (direction) this.moveTitleSelection(direction);
      } else if (this.state === 'settings') {
        if (vertical) this.moveSettingsSelection(vertical);
        else if (horizontal) this.adjustSelectedSetting(horizontal);
      } else if (this.state === 'upgrade' && horizontal) {
        const count = Math.max(1, this.upgradeOffers.length);
        this.menuIndex = (this.menuIndex + horizontal + count) % count;
      }
    }

    moveTitleSelection(direction) {
      this.titleIndex = (this.titleIndex + direction + TITLE_ACTIONS.length) % TITLE_ACTIONS.length;
    }

    moveSettingsSelection(direction) {
      this.settingsIndex = (this.settingsIndex + direction + SETTINGS_ROWS.length) % SETTINGS_ROWS.length;
      this.setStatus('status.settings');
    }

    adjustSelectedSetting(direction) {
      const row = SETTINGS_ROWS[this.settingsIndex];
      if (row.type === 'toggle') {
        this.setSetting(row.key, direction > 0);
      }
    }

    activateSelectedSetting() {
      const row = SETTINGS_ROWS[this.settingsIndex];
      if (row.type === 'toggle') {
        this.toggleSetting(row.key);
      } else if (row.key === 'fullscreen') {
        this.toggleFullscreen();
      }
    }

    activateTitleSelection() {
      const action = TITLE_ACTIONS[this.titleIndex].id;
      if (action === 'campaign') this.startRun('campaign');
      else if (action === 'endless') this.startRun('endless');
      else this.openSettings();
    }

    openSettings() {
      this.state = 'settings';
      this.settingsIndex = 0;
      this.setStatus('status.settings');
    }

    closeSettings() {
      this.returnToTitle();
    }

    togglePause() {
      if (!['playing', 'stageClear'].includes(this.state)) return;
      this.bridge.requestLifecycleChange(this.hostPaused ? 'resume' : 'pause');
    }

    resumeFromPause() {
      if (this.hostPaused) this.bridge.requestLifecycleChange('resume');
    }

    returnToTitle() {
      this.paused = false;
      this.state = 'title';
      this.resetTitleDemo();
      this.setStatus('status.title');
    }

    toggleFullscreen() {
      this.bridge.requestHostAction('fullscreen.enter');
    }

    actionKeyboard() {
      if (this.paused) {
        this.resumeFromPause();
        return;
      }
      switch (this.state) {
        case 'title':
          this.activateTitleSelection();
          break;
        case 'playing':
          if (this.paradeReady) this.activateParade();
          else this.launchStuckBalls();
          break;
        case 'upgrade':
          this.chooseUpgrade(this.menuIndex);
          break;
        case 'settings':
          this.activateSelectedSetting();
          break;
        case 'victory':
          this.returnToTitle();
          break;
        case 'gameover':
          this.startRun('endless');
          break;
        default:
          break;
      }
    }

    actionAt(x, y) {
      if (this.paused) {
        if (distance(x, y, 450, 560) < 130) {
          this.resumeFromPause();
        } else if (distance(x, y, 145, 1040) < 68) {
          this.returnToTitle();
        }
        return;
      }

      if (this.state === 'title') {
        const selected = TITLE_ACTIONS.findIndex((item) => distance(x, y, item.x, item.y) < item.radius);
        if (selected >= 0) {
          this.titleIndex = selected;
          this.activateTitleSelection();
        }
        return;
      }

      if (this.state === 'settings') {
        if (distance(x, y, 815, 82) < 56) {
          this.closeSettings();
          return;
        }
        const index = SETTINGS_ROWS.findIndex((row) => Math.abs(y - row.y) < 54 && x > 160 && x < 760);
        if (index < 0) return;
        this.settingsIndex = index;
        const row = SETTINGS_ROWS[index];
        if (row.type === 'toggle') {
          this.toggleSetting(row.key);
        } else {
          this.toggleFullscreen();
        }
        return;
      }

      if (this.state === 'playing') {
        if (this.paradeReady && distance(x, y, 808, 1090) < 74) this.activateParade();
        else this.launchStuckBalls();
        return;
      }

      if (this.state === 'upgrade') {
        const centers = this.upgradeCenters(this.upgradeOffers.length);
        let selected = -1;
        for (let i = 0; i < centers.length; i += 1) {
          if (Math.abs(x - centers[i]) < 110 && y > 360 && y < 760) selected = i;
        }
        if (selected >= 0) this.chooseUpgrade(selected);
        return;
      }

      if (this.state === 'victory') {
        if (distance(x, y, 450, 1000) < 105) {
          this.returnToTitle();
        } else if (distance(x, y, 700, 1020) < 75) {
          this.startRun('endless');
        }
        return;
      }

      if (this.state === 'gameover') {
        if (distance(x, y, 450, 970) < 105) this.startRun('endless');
        else if (distance(x, y, 165, 1040) < 70) {
          this.returnToTitle();
        }
      }
    }

    toggleSetting(key) {
      this.setSetting(key, !this.settings[key]);
    }

    setSetting(key, value) {
      const row = SETTINGS_ROWS.find((item) => item.key === key);
      if (!row || row.type !== 'toggle') throw new Error(`Unknown toggle setting: ${key}`);
      const enabled = !!value;
      this.settings.contrast = enabled;
      this.save.contrast = enabled;
      this.persistSave();
      this.setStatus('status.settingSelection', {
        settingKey: key,
        enabled
      });
      this.audio.sfx('stamp');
    }

    handleLocaleChange() {
      I18N.syncDocument();
      if (this.currentStatus && this.currentStatus.key === 'status.languageChanged') {
        this.currentStatus = { key: 'status.settings', params: {} };
      }
      this.renderStatus();
    }

    resetTitleDemo() {
      const demoBricks = [];
      for (let r = 0; r < 2; r += 1) {
        for (let c = 0; c < 5; c += 1) {
          demoBricks.push({
            x: 172 + c * 112,
            y: 410 + r * 72,
            w: 92,
            h: 44,
            alive: true,
            seed: 100 + c + r * 7,
            variant: (c + r) % 4
          });
        }
      }
      this.titleDemo = {
        paddleX: 450,
        targetX: 450,
        ball: { x: 450, y: 720, vx: 370, vy: -420, r: 11 },
        bricks: demoBricks,
        resetTimer: 0,
        hits: 0
      };
    }

    updateTitle(dt) {
      const d = this.titleDemo;
      const recentPointer = performance.now() - this.pointer.movedAt < 3500;
      d.targetX = recentPointer ? this.pointer.x : 450 + Math.sin(this.time * 0.72) * 230;
      d.paddleX = lerp(d.paddleX, clamp(d.targetX, 150, 750), 1 - Math.exp(-dt * 11));
      const ball = d.ball;
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      if (ball.x < 72 + ball.r) {
        ball.x = 72 + ball.r;
        ball.vx = Math.abs(ball.vx);
      }
      if (ball.x > W - 72 - ball.r) {
        ball.x = W - 72 - ball.r;
        ball.vx = -Math.abs(ball.vx);
      }
      if (ball.y < 330 + ball.r) {
        ball.y = 330 + ball.r;
        ball.vy = Math.abs(ball.vy);
      }
      if (ball.vy > 0 && ball.y + ball.r > 815 && ball.y < 850 && Math.abs(ball.x - d.paddleX) < 112) {
        const rel = clamp((ball.x - d.paddleX) / 112, -1, 1);
        const speed = Math.hypot(ball.vx, ball.vy);
        const angle = -Math.PI / 2 + rel * 0.86;
        ball.vx = Math.cos(angle) * speed;
        ball.vy = Math.sin(angle) * speed;
        ball.y = 815 - ball.r;
        if (Math.abs(rel) < 0.2) this.audio.sfx('sweet', 0.35);
      }
      for (const brick of d.bricks) {
        if (!brick.alive) continue;
        const hit = circleRectCollision(ball, brick, 0);
        if (!hit) continue;
        brick.alive = false;
        ball.x += hit.nx * hit.overlap;
        ball.y += hit.ny * hit.overlap;
        const dot = ball.vx * hit.nx + ball.vy * hit.ny;
        ball.vx -= 2 * dot * hit.nx;
        ball.vy -= 2 * dot * hit.ny;
        this.spawnPaperBurst(brick.x + brick.w / 2, brick.y + brick.h / 2, CONTENT.PALETTES[0].paper, 7, 0.45);
        d.hits += 1;
        break;
      }
      if (ball.y > 900) {
        ball.x = d.paddleX;
        ball.y = 760;
        ball.vx = this.rng.range(-340, 340);
        ball.vy = -460;
      }
      if (!d.bricks.some((b) => b.alive)) {
        d.resetTimer += dt;
        if (d.resetTimer > 1.2) this.resetTitleDemo();
      }
    }

    startRun(mode) {
      this.mode = mode;
      this.paused = false;
      this.score = 0;
      this.comboCount = 0;
      this.comboGrace = 0;
      this.hype = 0;
      this.paradeReady = false;
      this.paradeReadyTimer = 0;
      this.paradeTimer = 0;
      this.paradeSpawnClock = 0;
      this.runUpgrades = {
        wide: 0,
        sweet: 0,
        pierce: 0,
        blast: 0,
        parade: 0,
        swarm: 0,
        reserve: 0,
        fan: 0,
        magnet: 0
      };
      this.totalSweetHits = 0;
      this.totalDrains = 0;
      this.stageIndex = 0;
      this.endlessWave = 1;
      this.stageFailCount = 0;
      this.skillEstimate = 0;
      this.runStart = performance.now();
      if (mode === 'campaign') this.loadStage(0, false, false);
      else this.loadEndlessWave(1, false);
    }

    loadStage(index, retry, preserveReserve) {
      this.stageIndex = index;
      const stage = CONTENT.buildStage(index);
      this.prepareStage(stage, !!retry, !!preserveReserve);
    }

    loadEndlessWave(wave, preserveReserve) {
      this.endlessWave = wave;
      const seed = 0xabc000 + wave * 1337;
      const rng = new RNG(seed);
      const stage = CONTENT.makeEndlessStage(wave, () => rng.next());
      this.prepareStage(stage, false, !!preserveReserve);
      if (wave > (this.save.bestEndless || 0)) {
        this.save.bestEndless = wave;
        this.persistSave();
      }
    }

    prepareStage(stage, retry, preserveReserve) {
      this.state = 'playing';
      this.stage = stage;
      this.palette = CONTENT.PALETTES[stage.act || 0];
      this.bricks = stage.bricks.map((spec, index) => this.makeBrick(spec, index));
      this.balls = [];
      this.powerups.length = 0;
      this.rings.length = 0;
      this.popups.length = 0;
      this.streamers.length = 0;
      this.comboCount = 0;
      this.comboGrace = 0;
      this.timeSinceBreak = 0;
      this.drainsThisStage = 0;
      this.sweetHitsStage = 0;
      this.stageScoreStart = this.score;
      this.ballResetTimer = -1;
      this.clearTimer = 0;
      this.introTimer = 1.05;
      this.tempWideTimer = 0;
      this.paradeTimer = 0;
      this.paradeReady = false;
      this.paradeReadyTimer = 0;
      this.hype = Math.min(this.hype || 0, 35);
      const assist = this.mode === 'campaign' ? clamp(this.stageFailCount * 0.13 - this.skillEstimate * 0.025, 0, 0.38) : 0;
      this.assist = assist;
      const baseWidth = 176 + this.runUpgrades.wide * 26;
      this.paddle = {
        x: 450,
        targetX: 450,
        vx: 0,
        width: baseWidth * (1 + assist * 0.48),
        targetWidth: baseWidth * (1 + assist * 0.48),
        baseWidth,
        h: 30,
        y: 1082,
        hitPulse: 0,
        sweetPulse: 0,
        wheel: 0
      };

      if (!preserveReserve || this.reserve == null) {
        this.reserve = 2 + this.runUpgrades.reserve;
      }
      this.safety = this.runUpgrades.fan + (retry ? 1 : 0);
      this.boss = stage.boss ? this.createBoss() : null;
      this.createStuckBall();
      if (this.mode === 'campaign') {
        this.setStatus('status.campaignStage', {
          current: Math.min(this.stageIndex + 1, CONTENT.stageCount),
          total: CONTENT.stageCount
        });
      } else {
        this.setStatus('status.endlessWave', { wave: this.endlessWave });
      }
    }

    makeBrick(spec, index) {
      const hpMap = { paper: 1, clay: 2, wood: 3, bomb: 1, spinner: 2, bell: 1, anchor: 2, gift: 1 };
      const hp = hpMap[spec.type] || 1;
      return Object.assign({}, spec, {
        id: `${this.stage ? this.stage.id : 'stage'}-${index}-${Math.floor(this.rng.next() * 1e6)}`,
        baseX: spec.x,
        baseY: spec.y,
        x: spec.x,
        y: spec.y,
        hp,
        maxHp: hp,
        destroyed: false,
        falling: false,
        vx: 0,
        vy: 0,
        vr: 0,
        rot: spec.rotation || 0,
        hitFlash: 0,
        seed: index * 17 + (this.stageIndex || this.endlessWave || 1) * 101 + 7,
        fallCooldown: 0,
        impactCount: 0,
        required: spec.required !== false
      });
    }

    createBoss() {
      return {
        x: 450,
        y: 410,
        coreR: 80,
        hp: 24,
        maxHp: 24,
        coreOpen: false,
        openTimer: 0,
        attackTimer: 4.4,
        phase: 0,
        hitFlash: 0,
        phaseFlash: 0,
        defeated: false,
        defeatTimer: 0,
        sealCycle: 0
      };
    }

    createStuckBall() {
      this.balls.push({
        id: `ball-${Math.floor(this.rng.next() * 1e9)}`,
        x: this.paddle.x,
        y: this.paddle.y - 22,
        vx: 0,
        vy: 0,
        r: 12,
        stuck: true,
        alive: true,
        autoServe: 1.05 + this.introTimer,
        chargeTimer: 0,
        pierce: 0,
        shockReady: false,
        lastBrickId: null,
        lastBrickTimer: 0,
        paddleCooldown: 0,
        bossCooldown: 0,
        trail: [],
        hueVariant: this.rng.int(0, 2)
      });
    }

    launchStuckBalls() {
      let launched = false;
      for (const ball of this.balls) {
        if (!ball.stuck) continue;
        const aim = clamp((this.pointer.x - W / 2) / (W / 2), -1, 1) * 0.36;
        const angle = -Math.PI / 2 + aim + this.rng.range(-0.07, 0.07);
        const speed = this.currentBallSpeed();
        ball.vx = Math.cos(angle) * speed;
        ball.vy = Math.sin(angle) * speed;
        ball.stuck = false;
        launched = true;
      }
      if (launched) this.audio.sfx('serve');
    }

    currentBallSpeed() {
      const base = this.stage ? this.stage.speed : 620;
      return base * (1 - this.assist * 0.22);
    }

    updatePlaying(dt) {
      this.introTimer = Math.max(0, this.introTimer - dt);
      this.timeSinceBreak += dt;
      this.updatePaddle(dt);
      this.updateBricks(dt);
      this.updatePowerups(dt);
      this.updateBalls(dt);
      this.updateBoss(dt);

      if (this.comboGrace > 0) {
        this.comboGrace -= dt;
        if (this.comboGrace <= 0 && this.comboCount > 0) {
          this.comboCount = Math.floor(this.comboCount * 0.5);
          if (this.comboCount < 3) this.comboCount = 0;
          this.comboGrace = this.comboCount > 0 ? 1.4 : 0;
        }
      }

      if (this.paradeReady) {
        this.paradeReadyTimer += dt;
        if (this.paradeReadyTimer > 3.4) this.activateParade();
      }

      if (this.paradeTimer > 0) {
        this.paradeTimer -= dt;
        this.paradeSpawnClock += dt;
        if (this.settings.motion && Math.random() < dt * 11) this.spawnStreamer();
        if (this.paradeTimer <= 0) {
          this.paradeTimer = 0;
          for (const ball of this.balls) {
            ball.chargeTimer = Math.min(ball.chargeTimer, 1.2);
            ball.pierce = Math.min(ball.pierce, 1);
          }
        }
      }

      if (this.balls.length === 0 && this.ballResetTimer < 0 && this.state === 'playing') {
        this.ballResetTimer = 0.48;
      }
      if (this.ballResetTimer >= 0) {
        this.ballResetTimer -= dt;
        if (this.ballResetTimer <= 0) {
          this.ballResetTimer = -1;
          this.handleVolleyLost();
        }
      }

      if (!this.stage.boss && this.requiredRemaining() === 0 && this.state === 'playing') {
        this.enterStageClear();
      }
    }

    updatePaddle(dt) {
      const p = this.paddle;
      let keyboard = 0;
      if (this.keys.arrowleft || this.keys.a) keyboard -= 1;
      if (this.keys.arrowright || this.keys.d) keyboard += 1;
      keyboard += this.gamepad.axis;
      if (Math.abs(keyboard) > 0.05) {
        p.targetX += keyboard * 720 * dt;
        this.pointer.active = false;
      } else if (this.pointer.active) {
        p.targetX = this.pointer.x;
      }
      const wideMultiplier = this.tempWideTimer > 0 ? 1.38 : 1;
      const paradeMultiplier = this.paradeTimer > 0 ? 1.22 : 1;
      p.targetWidth = p.baseWidth * (1 + this.assist * 0.48) * wideMultiplier * paradeMultiplier;
      p.width = lerp(p.width, p.targetWidth, 1 - Math.exp(-dt * 8));
      p.targetX = clamp(p.targetX, 58 + p.width / 2, W - 58 - p.width / 2);
      const old = p.x;
      p.x = lerp(p.x, p.targetX, 1 - Math.exp(-dt * 24));
      p.vx = (p.x - old) / Math.max(dt, 0.0001);
      p.hitPulse = Math.max(0, p.hitPulse - dt * 5.5);
      p.sweetPulse = Math.max(0, p.sweetPulse - dt * 4.2);
      p.wheel += p.vx * dt * 0.012;
      if (this.tempWideTimer > 0) this.tempWideTimer -= dt;
    }

    updateBricks(dt) {
      for (const brick of this.bricks) {
        if (brick.destroyed) continue;
        brick.hitFlash = Math.max(0, brick.hitFlash - dt * 7);
        brick.fallCooldown = Math.max(0, brick.fallCooldown - dt);
        if (brick.falling) {
          brick.vy += 570 * dt;
          brick.x += brick.vx * dt;
          brick.y += brick.vy * dt;
          brick.rot += brick.vr * dt;
          if (brick.fallCooldown <= 0) {
            for (const other of this.bricks) {
              if (other === brick || other.destroyed || other.falling) continue;
              if (!orientedRectsOverlap(brick, other)) continue;
              brick.fallCooldown = 0.16;
              brick.impactCount += 1;
              this.damageBrickDirect(other, 1, brick.x + brick.w / 2, brick.y + brick.h / 2, 'cascade');
              this.spawnImpactDust(brick.x + brick.w / 2, brick.y + brick.h, 6, this.palette.rope);
              if (brick.impactCount >= 2 || brick.type === 'paper') {
                this.destroyBrick(brick, null, 'cascade');
              }
              break;
            }
          }
          if (brick.y > H - 115) this.destroyBrick(brick, null, 'cascade');
        } else if (brick.motion) {
          const m = brick.motion;
          const offset = Math.sin(this.time * m.speed + (m.phase || 0)) * m.amp;
          brick.x = brick.baseX + (m.axis === 'x' ? offset : 0);
          brick.y = brick.baseY + (m.axis === 'y' ? offset : 0);
        }
      }
    }

    updatePowerups(dt) {
      for (let i = this.powerups.length - 1; i >= 0; i -= 1) {
        const p = this.powerups[i];
        p.vy += 80 * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        const paddleRect = {
          x: this.paddle.x - this.paddle.width / 2,
          y: this.paddle.y - 16,
          w: this.paddle.width,
          h: 45
        };
        const rect = { x: p.x - p.r, y: p.y - p.r, w: p.r * 2, h: p.r * 2 };
        if (aabbOverlap(rect, paddleRect)) {
          this.collectPowerup(p);
          this.powerups.splice(i, 1);
        } else if (p.y > H + 50) {
          this.powerups.splice(i, 1);
        }
      }
    }

    updateBalls(dt) {
      for (let i = this.balls.length - 1; i >= 0; i -= 1) {
        const ball = this.balls[i];
        if (!ball.alive) {
          this.balls.splice(i, 1);
          continue;
        }
        ball.paddleCooldown = Math.max(0, ball.paddleCooldown - dt);
        ball.lastBrickTimer = Math.max(0, ball.lastBrickTimer - dt);
        ball.bossCooldown = Math.max(0, ball.bossCooldown - dt);
        if (ball.chargeTimer > 0) ball.chargeTimer -= dt;
        if (ball.stuck) {
          ball.x = this.paddle.x;
          ball.y = this.paddle.y - 23;
          ball.autoServe -= dt;
          if (ball.autoServe <= 0 && this.introTimer <= 0) this.launchStuckBalls();
          continue;
        }

        if (this.settings.motion) {
          ball.trail.unshift({ x: ball.x, y: ball.y, life: 1 });
          if (ball.trail.length > (ball.chargeTimer > 0 ? 12 : 5)) ball.trail.length = ball.chargeTimer > 0 ? 12 : 5;
          for (const t of ball.trail) t.life *= 0.84;
        }

        let speed = Math.hypot(ball.vx, ball.vy);
        const steps = clamp(Math.ceil((speed * dt) / (ball.r * 0.72)), 1, 6);
        const sdt = dt / steps;
        for (let step = 0; step < steps && ball.alive; step += 1) {
          if (this.boss && this.boss.phase >= 1 && !this.boss.defeated) {
            ball.vx += Math.sin(this.time * 1.4 + ball.y * 0.006) * (this.boss.phase === 2 ? 44 : 24) * sdt;
          }
          ball.x += ball.vx * sdt;
          ball.y += ball.vy * sdt;

          if (ball.x - ball.r < 54) {
            ball.x = 54 + ball.r;
            ball.vx = Math.abs(ball.vx);
            this.spawnImpactDust(ball.x - ball.r, ball.y, 2, this.palette.paper);
          } else if (ball.x + ball.r > W - 54) {
            ball.x = W - 54 - ball.r;
            ball.vx = -Math.abs(ball.vx);
            this.spawnImpactDust(ball.x + ball.r, ball.y, 2, this.palette.paper);
          }
          if (ball.y - ball.r < 128) {
            ball.y = 128 + ball.r;
            ball.vy = Math.abs(ball.vy);
            this.spawnImpactDust(ball.x, ball.y - ball.r, 2, this.palette.paper);
          }

          this.collidePaddle(ball);
          this.collideBricks(ball);
          this.collideBoss(ball);

          if (ball.y - ball.r > H + 30) {
            ball.alive = false;
            this.totalDrains += 1;
            this.drainsThisStage += 1;
            this.audio.sfx('miss');
            this.spawnDrain(ball.x);
          }
        }

        if (!ball.alive) continue;
        speed = Math.hypot(ball.vx, ball.vy);
        const maxSpeed = this.mode === 'endless' ? 1050 : 980;
        if (speed > maxSpeed) {
          ball.vx = (ball.vx / speed) * maxSpeed;
          ball.vy = (ball.vy / speed) * maxSpeed;
          speed = maxSpeed;
        }
        if (Math.abs(ball.vy) < 175) {
          ball.vy = signNonZero(ball.vy || -1) * 175;
          const newSpeed = Math.hypot(ball.vx, ball.vy);
          ball.vx *= speed / newSpeed;
          ball.vy *= speed / newSpeed;
        }
        if (Math.abs(ball.vx) < 55) ball.vx += signNonZero(ball.x - W / 2) * 35;
        this.applyLastTargetAssist(ball, dt);
      }
    }

    collidePaddle(ball) {
      if (ball.vy <= 0 || ball.paddleCooldown > 0) return;
      const p = this.paddle;
      const rect = {
        x: p.x - p.width / 2 - 7,
        y: p.y - p.h / 2 - 5,
        w: p.width + 14,
        h: p.h + 18
      };
      const hit = circleRectCollision(ball, rect, 0);
      if (!hit || hit.ny > -0.12) return;
      ball.y = rect.y - ball.r - 0.5;
      const rel = clamp((ball.x - p.x) / (p.width / 2), -1, 1);
      const speed = clamp(Math.hypot(ball.vx, ball.vy) * 1.008, this.currentBallSpeed() * 0.96, 980);
      const angle = -Math.PI / 2 + rel * 1.03;
      ball.vx = Math.cos(angle) * speed + p.vx * 0.13;
      ball.vy = Math.sin(angle) * speed;
      ball.paddleCooldown = 0.075;
      p.hitPulse = 1;
      this.comboGrace = Math.max(this.comboGrace, 1.7);
      const sweetThreshold = 0.18 + this.runUpgrades.sweet * 0.04;
      if (Math.abs(rel) <= sweetThreshold) {
        this.chargeBall(ball);
        p.sweetPulse = 1;
        this.sweetHitsStage += 1;
        this.totalSweetHits += 1;
        this.gainHype(7);
        this.audio.sfx('sweet', 1);
        this.addShake(7);
        this.spawnRing(ball.x, p.y - 8, 26, 145, this.palette.gold, 0.28, 7);
        this.spawnDrumBurst(ball.x, p.y - 4, 14);
        this.unlockStamp('sweet');
      } else {
        this.audio.sfx('paddle');
        this.spawnImpactDust(ball.x, p.y - 10, 5, this.palette.paper);
      }
    }

    chargeBall(ball) {
      ball.chargeTimer = Math.max(ball.chargeTimer, 2.8 + this.runUpgrades.pierce * 0.45);
      ball.pierce = Math.max(ball.pierce, 2 + this.runUpgrades.pierce);
      ball.shockReady = true;
    }

    collideBricks(ball) {
      for (const brick of this.bricks) {
        if (brick.destroyed) continue;
        if (ball.lastBrickId === brick.id && ball.lastBrickTimer > 0) continue;
        const hit = circleOrientedRectCollision(ball, brick);
        if (!hit) continue;
        ball.lastBrickId = brick.id;
        ball.lastBrickTimer = 0.055;
        brick.hitFlash = 1;

        if (brick.type === 'spinner') {
          const direction = ((ball.x - (brick.x + brick.w / 2)) * (ball.y - (brick.y + brick.h / 2)) >= 0 ? 1 : -1);
          const angle = direction * 0.38;
          const c = Math.cos(angle);
          const s = Math.sin(angle);
          const vx = ball.vx * c - ball.vy * s;
          const vy = ball.vx * s + ball.vy * c;
          ball.vx = vx;
          ball.vy = vy;
          brick.rot += direction * 0.5;
          this.audio.sfx('spinner');
        }

        const pass = this.hitBrick(brick, ball, hit);
        if (!pass) {
          ball.x += hit.nx * (hit.overlap + 0.5);
          ball.y += hit.ny * (hit.overlap + 0.5);
          const dot = ball.vx * hit.nx + ball.vy * hit.ny;
          if (dot < 0) {
            ball.vx -= 2 * dot * hit.nx;
            ball.vy -= 2 * dot * hit.ny;
          }
        }
        break;
      }
    }

    hitBrick(brick, ball, hit) {
      const wasCharged = ball.chargeTimer > 0;
      const centerX = brick.x + brick.w / 2;
      const centerY = brick.y + brick.h / 2;
      if (ball.shockReady && wasCharged) {
        ball.shockReady = false;
        this.microShock(centerX, centerY, ball, brick);
      }
      brick.hp -= 1;
      if (brick.hp <= 0) {
        this.destroyBrick(brick, ball, 'ball');
      } else {
        this.spawnMaterialHit(brick, hit.nx, hit.ny, 4);
        this.audio.sfx(brick.type === 'clay' ? 'clay' : brick.type === 'wood' ? 'wood' : brick.type, 0.45);
        this.addShake(brick.type === 'wood' ? 3.5 : 2);
      }
      if (wasCharged && ball.pierce > 0 && brick.destroyed) {
        ball.pierce -= 1;
        return true;
      }
      return false;
    }

    damageBrickDirect(brick, damage, x, y, source) {
      if (!brick || brick.destroyed) return;
      brick.hp -= damage;
      brick.hitFlash = 1;
      if (brick.hp <= 0) this.destroyBrick(brick, null, source || 'effect');
      else this.spawnImpactDust(x, y, 4, this.palette.clay);
    }

    destroyBrick(brick, ball, source) {
      if (!brick || brick.destroyed) return;
      brick.destroyed = true;
      const x = brick.x + brick.w / 2;
      const y = brick.y + brick.h / 2;
      const baseScores = { paper: 100, clay: 180, wood: 280, bomb: 220, spinner: 260, bell: 360, anchor: 440, gift: 240 };
      const base = baseScores[brick.type] || 100;
      const playerCaused = source === 'ball' || source === 'cascade' || source === 'explosion';
      if (playerCaused) {
        this.comboCount += 1;
        this.comboGrace = 3.6;
        const mult = this.comboMultiplier();
        const points = Math.round(base * mult);
        this.score += points;
        this.timeSinceBreak = 0;
        this.gainHype(brick.type === 'bell' ? 18 : brick.type === 'anchor' ? 7 : 2.3 + (ball && ball.chargeTimer > 0 ? 1.4 : 0));
        if (this.comboCount >= 8 && (this.comboCount % 5 === 0 || brick.type === 'bell')) {
          this.popups.push({ x, y, value: points, t: 0, duration: 0.8, seed: brick.seed });
        }
        if (this.comboCount >= 25) this.unlockStamp('combo');
      }

      this.spawnMaterialBreak(brick);
      this.audio.sfx(
        brick.type === 'paper' || brick.type === 'gift' ? 'paper' : brick.type === 'anchor' ? 'rope' : brick.type,
        brick.type === 'wood' || brick.type === 'anchor' ? 1 : 0.7
      );

      if (brick.type === 'bomb') {
        this.explode(x, y, 106 + this.runUpgrades.blast * 24, ball);
      } else if (brick.type === 'anchor' && brick.group) {
        this.releaseGroup(brick.group, x, y);
      } else if (brick.type === 'gift') {
        this.spawnPowerup(x, y, brick.gift || 'multi');
      } else if (brick.type === 'bell') {
        this.spawnRing(x, y, 20, 150, this.palette.gold, 0.55, 5);
        this.audio.sfx('bell');
      }
      this.addShake(brick.type === 'bomb' ? 12 : brick.type === 'anchor' ? 8 : brick.type === 'wood' ? 4 : 2.5);
    }

    comboMultiplier() {
      if (this.comboCount >= 35) return 8;
      if (this.comboCount >= 20) return 5;
      if (this.comboCount >= 10) return 3;
      if (this.comboCount >= 5) return 2;
      return 1;
    }

    microShock(x, y, ball, originBrick) {
      const radius = 62 + this.runUpgrades.blast * 8;
      this.spawnRing(x, y, 12, radius, this.palette.gold, 0.24, 5);
      this.spawnImpactDust(x, y, 9, this.palette.gold);
      for (const other of this.bricks) {
        if (other === originBrick || other.destroyed || other.type === 'wood' || other.type === 'anchor') continue;
        const d = distance(x, y, other.x + other.w / 2, other.y + other.h / 2);
        if (d < radius) this.damageBrickDirect(other, 1, x, y, 'explosion');
      }
      if (ball) ball.pierce = Math.max(ball.pierce, 1);
    }

    explode(x, y, radius, ball) {
      this.spawnRing(x, y, 18, radius * 1.18, this.palette.red, 0.42, 11);
      this.spawnRing(x, y, 10, radius * 0.72, this.palette.gold, 0.28, 7);
      this.spawnDrumBurst(x, y, 28);
      this.audio.sfx('bomb');
      this.addShake(15);
      for (const other of this.bricks) {
        if (other.destroyed) continue;
        const d = distance(x, y, other.x + other.w / 2, other.y + other.h / 2);
        if (d <= radius) {
          const damage = d < radius * 0.48 ? 2 : 1;
          this.damageBrickDirect(other, damage, x, y, 'explosion');
        }
      }
      if (ball) {
        const dx = ball.x - x;
        const dy = ball.y - y;
        const d = Math.max(1, Math.hypot(dx, dy));
        ball.vx += (dx / d) * 80;
        ball.vy += (dy / d) * 80;
      }
    }

    releaseGroup(group, x, y) {
      this.spawnRing(x, y, 15, 120, this.palette.rope, 0.38, 6);
      for (const brick of this.bricks) {
        if (brick.destroyed || brick.group !== group || !brick.linked) continue;
        brick.falling = true;
        brick.required = false;
        brick.vx = this.rng.range(-70, 70);
        brick.vy = this.rng.range(20, 95);
        brick.vr = this.rng.range(-2.2, 2.2);
      }
    }

    spawnPowerup(x, y, type) {
      this.powerups.push({
        x,
        y,
        vy: 120,
        r: 26,
        type,
        rot: 0,
        vr: this.rng.range(-1.2, 1.2),
        seed: this.rng.int(0, 99999)
      });
      this.spawnRing(x, y, 10, 70, this.palette.cream, 0.3, 4);
    }

    collectPowerup(powerup) {
      this.audio.sfx('pickup');
      this.spawnRing(powerup.x, powerup.y, 12, 115, this.palette.gold, 0.35, 7);
      this.spawnPaperBurst(powerup.x, powerup.y, this.palette.cream, 14, 0.7);
      switch (powerup.type) {
        case 'multi':
          this.spawnMultiball(2);
          break;
        case 'wide':
          this.tempWideTimer = Math.max(this.tempWideTimer, 12);
          break;
        case 'shield':
          this.safety += 1;
          break;
        case 'charge':
          for (const ball of this.balls) this.chargeBall(ball);
          break;
        default:
          break;
      }
    }

    spawnMultiball(count) {
      const source = this.balls.find((b) => !b.stuck) || this.balls[0];
      if (!source) return;
      const speed = Math.max(this.currentBallSpeed(), Math.hypot(source.vx, source.vy));
      const baseAngle = Math.atan2(source.vy || -speed, source.vx || 0);
      for (let i = 0; i < count; i += 1) {
        const offset = (i - (count - 1) / 2) * 0.34 + (i % 2 ? 0.12 : -0.12);
        const angle = baseAngle + offset;
        this.balls.push({
          id: `ball-${Math.floor(this.rng.next() * 1e9)}`,
          x: source.x,
          y: source.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          r: 12,
          stuck: false,
          alive: true,
          autoServe: 0,
          chargeTimer: this.paradeTimer > 0 ? this.paradeTimer : Math.max(0, source.chargeTimer - 0.4),
          pierce: this.paradeTimer > 0 ? 2 + this.runUpgrades.pierce : Math.max(0, source.pierce - 1),
          shockReady: false,
          lastBrickId: null,
          lastBrickTimer: 0,
          paddleCooldown: 0.08,
          bossCooldown: 0,
          trail: [],
          hueVariant: this.rng.int(0, 2)
        });
      }
    }

    gainHype(amount) {
      if (this.paradeTimer > 0) return;
      const factor = 1 + this.runUpgrades.magnet * 0.18;
      this.hype = clamp(this.hype + amount * factor, 0, 100);
      if (this.hype >= 100 && !this.paradeReady) {
        this.paradeReady = true;
        this.paradeReadyTimer = 0;
        this.audio.sfx('bell');
        this.spawnRing(808, 1095, 24, 95, this.palette.gold, 0.55, 8);
      }
    }

    activateParade() {
      if (!this.paradeReady || this.state !== 'playing') return;
      this.paradeReady = false;
      this.paradeReadyTimer = 0;
      this.hype = 0;
      this.paradeTimer = 8 + this.runUpgrades.parade * 2;
      this.paradeSpawnClock = 0;
      this.tempWideTimer = Math.max(this.tempWideTimer, this.paradeTimer);
      for (const ball of this.balls) {
        ball.chargeTimer = this.paradeTimer;
        ball.pierce = Math.max(ball.pierce, 3 + this.runUpgrades.pierce);
        ball.shockReady = true;
      }
      this.spawnMultiball(2 + this.runUpgrades.swarm);
      this.audio.sfx('parade');
      this.addShake(18);
      for (let i = 0; i < 20; i += 1) this.spawnStreamer(true);
      this.unlockStamp('parade');
    }

    spawnStreamer(burst) {
      if (!this.settings.motion || this.streamers.length >= 120) return;
      const colors = [this.palette.red, this.palette.gold, this.palette.cream, this.palette.green, this.palette.plum];
      this.streamers.push({
        x: burst ? this.rng.range(80, W - 80) : this.rng.range(50, W - 50),
        y: burst ? this.rng.range(80, 260) : 100,
        vy: this.rng.range(90, 180),
        swing: this.rng.range(20, 65),
        freq: this.rng.range(1.8, 4.3),
        phase: this.rng.range(0, TAU),
        life: this.rng.range(2.4, 4.8),
        maxLife: 4.8,
        color: this.rng.pick(colors),
        w: this.rng.range(5, 11),
        h: this.rng.range(38, 85),
        rot: this.rng.range(-0.8, 0.8),
        vr: this.rng.range(-1.4, 1.4)
      });
    }

    handleVolleyLost() {
      this.comboCount = 0;
      this.comboGrace = 0;
      this.hype = Math.max(0, this.hype - 18);
      if (this.safety > 0) {
        this.safety -= 1;
        const x = clamp(this.lastDrainX || this.paddle.x, 120, W - 120);
        const speed = this.currentBallSpeed();
        this.balls.push({
          id: `ball-${Math.floor(this.rng.next() * 1e9)}`,
          x,
          y: H - 120,
          vx: this.rng.range(-180, 180),
          vy: -Math.sqrt(Math.max(1, speed * speed - 180 * 180)),
          r: 12,
          stuck: false,
          alive: true,
          autoServe: 0,
          chargeTimer: 1.8,
          pierce: 1,
          shockReady: true,
          lastBrickId: null,
          lastBrickTimer: 0,
          paddleCooldown: 0.15,
          bossCooldown: 0,
          trail: [],
          hueVariant: 0
        });
        this.spawnSafetyFan(x, H - 90);
        this.audio.sfx('pickup');
        return;
      }

      this.reserve -= 1;
      if (this.reserve >= 0) {
        this.createStuckBall();
        return;
      }

      if (this.mode === 'campaign') {
        this.stageFailCount += 1;
        this.retryTimer = 0;
        this.state = 'retry';
        this.setStatus('status.retry');
      } else {
        this.enterGameover();
      }
    }

    requiredRemaining() {
      if (!Array.isArray(this.bricks)) return 0;
      return this.bricks.reduce((sum, b) => sum + (!b.destroyed && b.required ? 1 : 0), 0);
    }

    applyLastTargetAssist(ball, dt) {
      if (this.stage.boss || ball.stuck || ball.vy > 0 || this.timeSinceBreak < 2.1) return;
      const required = this.bricks.filter((b) => !b.destroyed && b.required);
      if (required.length === 0 || required.length > 3) return;
      let target = required[0];
      let best = Infinity;
      for (const b of required) {
        const d = distance(ball.x, ball.y, b.x + b.w / 2, b.y + b.h / 2);
        if (d < best) {
          best = d;
          target = b;
        }
      }
      const tx = target.x + target.w / 2 - ball.x;
      const ty = target.y + target.h / 2 - ball.y;
      const d = Math.max(1, Math.hypot(tx, ty));
      const speed = Math.hypot(ball.vx, ball.vy);
      const blend = 0.21 * dt;
      ball.vx = lerp(ball.vx, (tx / d) * speed, blend);
      ball.vy = lerp(ball.vy, (ty / d) * speed, blend);
    }

    updateBoss(dt) {
      if (!this.boss || this.boss.defeated || this.state !== 'playing') return;
      const boss = this.boss;
      boss.hitFlash = Math.max(0, boss.hitFlash - dt * 5);
      boss.phaseFlash = Math.max(0, boss.phaseFlash - dt * 2.5);
      const seals = this.bricks.filter((b) => !b.destroyed && b.bossSeal);
      if (!boss.coreOpen && seals.length === 0) {
        boss.coreOpen = true;
        boss.openTimer = 7.4;
        boss.phaseFlash = 1;
        this.audio.sfx('boss');
        this.spawnRing(boss.x, boss.y + 10, 35, 170, this.palette.gold, 0.55, 11);
        this.addShake(14);
      }
      if (boss.coreOpen) {
        boss.openTimer -= dt;
        if (boss.openTimer <= 0 && boss.hp > 0) {
          boss.coreOpen = false;
          boss.sealCycle += 1;
          this.spawnBossSeals(boss.phase === 0 ? 2 : boss.phase === 1 ? 3 : 4);
        }
      }
      boss.attackTimer -= dt;
      if (boss.attackTimer <= 0) {
        boss.attackTimer = Math.max(2.7, 4.8 - boss.phase * 0.7);
        this.spawnBossLanterns(2 + boss.phase);
      }
      const newPhase = boss.hp > 16 ? 0 : boss.hp > 8 ? 1 : 2;
      if (newPhase !== boss.phase) {
        boss.phase = newPhase;
        boss.phaseFlash = 1;
        boss.attackTimer = 1.3;
        this.audio.sfx('boss');
        this.addShake(16);
        for (let i = 0; i < 12; i += 1) this.spawnStreamer(true);
      }
    }

    spawnBossSeals(count) {
      const positions = [
        [135, 620],
        [653, 620],
        [250, 760],
        [538, 760]
      ];
      for (let i = 0; i < count; i += 1) {
        const pos = positions[(i + this.boss.sealCycle) % positions.length];
        const spec = {
          type: 'anchor',
          x: pos[0],
          y: pos[1],
          w: 112,
          h: 68,
          required: true,
          bossSeal: true,
          group: `boss-cycle-${this.boss.sealCycle}-${i}`
        };
        const brick = this.makeBrick(spec, this.bricks.length + i);
        brick.y -= 80;
        brick.baseY = pos[1];
        brick.motion = { axis: 'y', amp: 16, speed: 1.6, phase: i * 1.7 };
        this.bricks.push(brick);
        this.spawnRing(pos[0] + 56, pos[1] + 34, 10, 72, this.palette.rope, 0.3, 5);
      }
    }

    spawnBossLanterns(count) {
      for (let i = 0; i < count; i += 1) {
        const x = 180 + (i + 0.5) * (540 / count) + this.rng.range(-35, 35);
        const spec = {
          type: i === count - 1 && this.boss.phase >= 1 ? 'bell' : 'paper',
          x: x - 43,
          y: 180 + this.rng.range(-20, 40),
          w: 86,
          h: i === count - 1 && this.boss.phase >= 1 ? 62 : 46,
          required: false,
          variant: i % 4,
          motion: {
            axis: 'y',
            amp: 46 + this.boss.phase * 18,
            speed: 0.75 + i * 0.11,
            phase: i * 1.3
          },
          bossSpawn: true
        };
        this.bricks.push(this.makeBrick(spec, this.bricks.length + i));
      }
    }

    collideBoss(ball) {
      const boss = this.boss;
      if (!boss || !boss.coreOpen || boss.defeated || ball.bossCooldown > 0) return;
      const dx = ball.x - boss.x;
      const dy = ball.y - (boss.y + 18);
      const min = ball.r + boss.coreR;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min) return;
      const d = Math.max(1, Math.sqrt(d2));
      const nx = dx / d;
      const ny = dy / d;
      ball.x = boss.x + nx * (min + 1);
      ball.y = boss.y + 18 + ny * (min + 1);
      const dot = ball.vx * nx + ball.vy * ny;
      if (dot < 0) {
        ball.vx -= 2 * dot * nx;
        ball.vy -= 2 * dot * ny;
      }
      ball.bossCooldown = 0.12;
      const damage = ball.chargeTimer > 0 ? 2 : 1;
      boss.hp = Math.max(0, boss.hp - damage);
      boss.hitFlash = 1;
      this.comboCount += 1;
      this.comboGrace = 3.8;
      this.score += 550 * this.comboMultiplier() * damage;
      this.gainHype(5 * damage);
      this.spawnRing(boss.x, boss.y + 18, 22, 125, this.palette.gold, 0.3, 8);
      this.spawnPaperBurst(ball.x, ball.y, this.palette.cream, 14, 0.9);
      this.audio.sfx('sweet', 0.75);
      this.addShake(9);
      if (boss.hp <= 0) this.enterBossDefeat();
    }

    enterBossDefeat() {
      if (!this.boss || this.boss.defeated) return;
      this.boss.defeated = true;
      this.boss.defeatTimer = 0;
      this.state = 'bossDefeat';
      this.audio.sfx('boss');
      this.audio.sfx('clear');
      this.addShake(24);
      for (let i = 0; i < 45; i += 1) this.spawnStreamer(true);
      this.unlockStamp('boss');
      this.setStatus('status.bossDefeat');
    }

    enterStageClear() {
      this.state = 'stageClear';
      this.clearTimer = 0;
      this.audio.sfx('clear');
      this.addShake(10);
      if (this.drainsThisStage === 0) this.unlockStamp('perfect');
      if (this.mode === 'campaign') {
        const sweetRate = this.sweetHitsStage / Math.max(1, this.sweetHitsStage + this.drainsThisStage * 2 + 4);
        this.skillEstimate = clamp(this.skillEstimate * 0.7 + sweetRate * 6 - this.drainsThisStage * 0.3, -2, 6);
      }
      for (let i = 0; i < 18; i += 1) this.spawnStreamer(true);
    }

    updateStageClear(dt) {
      this.clearTimer += dt;
      for (const ball of this.balls) {
        ball.vx *= Math.pow(0.96, dt * 60);
        ball.vy *= Math.pow(0.96, dt * 60);
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;
      }
      if (this.settings.motion && Math.random() < dt * 18) this.spawnStreamer(true);
      if (this.clearTimer < 2.55) return;

      if (this.mode === 'campaign') {
        const next = this.stageIndex + 1;
        this.stageFailCount = 0;
        if (next >= CONTENT.stageCount) {
          this.enterVictory();
          return;
        }
        if (next % 2 === 0) {
          this.enterUpgrade({ type: 'campaign', index: next });
        } else {
          this.loadStage(next, false, false);
        }
      } else {
        const completed = this.endlessWave;
        const next = completed + 1;
        if (completed >= 10) this.unlockStamp('endless');
        if (completed % 5 === 0) this.reserve = Math.min(this.reserve + 1, 4 + this.runUpgrades.reserve);
        if (completed % 2 === 0) {
          this.enterUpgrade({ type: 'endless', wave: next });
        } else {
          this.loadEndlessWave(next, true);
        }
      }
    }

    upgradeCenters(count) {
      if (count === 1) return [450];
      if (count === 2) return [330, 570];
      if (count === 3) return [225, 450, 675];
      throw new RangeError(`Unsupported upgrade offer count: ${count}`);
    }

    enterUpgrade(next) {
      const available = CONTENT.UPGRADES.filter((u) => (this.runUpgrades[u.id] || 0) < u.max);
      if (available.length === 0) {
        this.continueAfterUpgrade(next);
        return;
      }
      const pool = available.slice();
      const offers = [];
      while (offers.length < Math.min(3, available.length)) {
        const index = Math.floor(this.rng.next() * pool.length);
        offers.push(pool.splice(index, 1)[0]);
      }
      this.upgradeOffers = offers;
      this.nextAfterUpgrade = next;
      this.upgradeTimer = 0;
      this.menuIndex = Math.floor(offers.length / 2);
      this.state = 'upgrade';
      this.setStatus('status.upgrade');
    }

    updateUpgrade(dt) {
      this.upgradeTimer += dt;
      if (
        this.pointer.active &&
        !this.keyboardNavigationActive &&
        this.pointer.y > 360 &&
        this.pointer.y < 760
      ) {
        const centers = this.upgradeCenters(this.upgradeOffers.length);
        let best = 0;
        let bestDist = Infinity;
        centers.forEach((x, i) => {
          const d = Math.abs(this.pointer.x - x);
          if (d < bestDist) {
            bestDist = d;
            best = i;
          }
        });
        this.menuIndex = best;
      }
    }

    chooseUpgrade(index) {
      if (this.state !== 'upgrade') return;
      const offer = this.upgradeOffers[index];
      if (!offer) return;
      const before = this.runUpgrades[offer.id] || 0;
      if (before >= offer.max) throw new Error(`Upgrade offer "${offer.id}" is already at its cap.`);
      this.runUpgrades[offer.id] = before + 1;
      if (offer.id === 'reserve' && this.mode === 'endless') this.reserve += 1;
      this.chosenUpgrade = offer;
      this.chosenUpgradeIndex = index;
      this.upgradeChosenTimer = 0;
      this.state = 'upgradeChosen';
      this.audio.sfx('stamp');
      this.addShake(9);
    }

    updateUpgradeChosen(dt) {
      this.upgradeChosenTimer += dt;
      if (this.upgradeChosenTimer < 0.9) return;
      this.continueAfterUpgrade(this.nextAfterUpgrade);
    }

    continueAfterUpgrade(next) {
      if (next.type === 'campaign') this.loadStage(next.index, false, false);
      else this.loadEndlessWave(next.wave, true);
    }

    updateRetry(dt) {
      this.retryTimer += dt;
      if (this.retryTimer > 1.6) {
        this.loadStage(this.stageIndex, true, false);
      }
    }

    updateBossDefeat(dt) {
      this.boss.defeatTimer += dt;
      for (const ball of this.balls) {
        ball.vx *= Math.pow(0.94, dt * 60);
        ball.vy *= Math.pow(0.94, dt * 60);
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;
      }
      if (this.settings.motion && Math.random() < dt * 28) this.spawnStreamer(true);
      if (this.boss.defeatTimer > 3.8) this.enterVictory();
    }

    enterVictory() {
      this.state = 'victory';
      this.victoryTimer = 0;
      this.save.cleared = true;
      this.save.bestCampaign = Math.max(this.save.bestCampaign || 0, Math.round(this.score));
      this.persistSave();
      this.setStatus('status.victory', { score: Math.round(this.score) });
    }

    updateVictory(dt) {
      this.victoryTimer += dt;
      if (this.settings.motion && Math.random() < dt * 13) this.spawnStreamer(true);
    }

    enterGameover() {
      this.state = 'gameover';
      this.gameoverTimer = 0;
      const reached = this.endlessWave;
      this.save.bestEndless = Math.max(this.save.bestEndless || 0, reached);
      this.persistSave();
      this.setStatus('status.gameover', { wave: reached });
    }

    updateGameover(dt) {
      this.gameoverTimer += dt;
    }

    persistSave() {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.save));
    }

    unlockStamp(id) {
      let changed = false;
      if (id === 'endless' && (this.save.bestEndless || 0) < 10) {
        this.save.bestEndless = 10;
        changed = true;
      }
      if (!this.save.stamps[id]) {
        this.save.stamps[id] = true;
        changed = true;
        this.stampNotice = { id, t: 0 };
        this.audio.sfx('stamp');
      }
      if (changed) this.persistSave();
    }

    effectCount(count) {
      return this.settings.motion ? count : Math.max(1, Math.ceil(count * 0.3));
    }

    pushParticle(particle) {
      this.particles.push(particle);
      const limit = this.settings.motion ? 720 : 180;
      if (this.particles.length > limit) {
        this.particles.splice(0, this.particles.length - limit);
      }
    }

    spawnDrain(x) {
      this.lastDrainX = x;
      const total = this.effectCount(10);
      for (let i = 0; i < total; i += 1) {
        this.pushParticle({
          x: x + this.rng.range(-20, 20),
          y: H - 65,
          vx: this.rng.range(-70, 70),
          vy: this.rng.range(-100, -20),
          gravity: 180,
          drag: 0.98,
          life: this.rng.range(0.5, 0.9),
          maxLife: 0.9,
          size: this.rng.range(4, 9),
          rot: this.rng.range(0, TAU),
          vr: this.rng.range(-4, 4),
          kind: 'paper',
          color: this.palette.plum,
          flutter: this.rng.range(3, 6),
          phase: this.rng.range(0, TAU)
        });
      }
    }

    spawnSafetyFan(x, y) {
      this.spawnRing(x, y, 20, 155, this.palette.cream, 0.45, 8);
      const total = this.effectCount(16);
      for (let i = 0; i < total; i += 1) {
        const a = Math.PI + (i / Math.max(1, total - 1)) * Math.PI;
        this.pushParticle({
          x,
          y,
          vx: Math.cos(a) * this.rng.range(90, 210),
          vy: Math.sin(a) * this.rng.range(90, 210),
          gravity: 80,
          drag: 0.985,
          life: 0.8,
          maxLife: 0.8,
          size: this.rng.range(8, 15),
          rot: a,
          vr: this.rng.range(-2, 2),
          kind: 'fan',
          color: i % 2 ? this.palette.cream : this.palette.red
        });
      }
    }

    spawnMaterialHit(brick, nx, ny, count) {
      const x = brick.x + brick.w / 2 + nx * brick.w * 0.35;
      const y = brick.y + brick.h / 2 + ny * brick.h * 0.35;
      const color = brick.type === 'clay' ? this.palette.clay : brick.type === 'wood' ? this.palette.wood : this.palette.paper;
      const total = this.effectCount(count);
      for (let i = 0; i < total; i += 1) {
        this.pushParticle({
          x,
          y,
          vx: nx * this.rng.range(40, 110) + this.rng.range(-50, 50),
          vy: ny * this.rng.range(40, 110) + this.rng.range(-50, 50),
          gravity: brick.type === 'paper' ? 130 : 360,
          drag: 0.985,
          life: this.rng.range(0.22, 0.5),
          maxLife: 0.5,
          size: this.rng.range(3, 8),
          rot: this.rng.range(0, TAU),
          vr: this.rng.range(-8, 8),
          kind: brick.type === 'wood' ? 'splinter' : brick.type === 'clay' ? 'shard' : 'paper',
          color,
          flutter: brick.type === 'paper' ? this.rng.range(3, 6) : 0,
          phase: this.rng.range(0, TAU)
        });
      }
    }

    spawnMaterialBreak(brick) {
      const x = brick.x + brick.w / 2;
      const y = brick.y + brick.h / 2;
      if (brick.type === 'paper' || brick.type === 'gift' || brick.type === 'bell' || brick.type === 'spinner') {
        this.spawnPaperBurst(x, y, this.brickColor(brick), brick.type === 'paper' ? 12 : 16, 1);
      } else if (brick.type === 'clay' || brick.type === 'anchor') {
        const total = this.effectCount(13);
        for (let i = 0; i < total; i += 1) {
          const a = this.rng.range(0, TAU);
          const speed = this.rng.range(70, 250);
          this.pushParticle({
            x,
            y,
            vx: Math.cos(a) * speed,
            vy: Math.sin(a) * speed - 30,
            gravity: 520,
            drag: 0.99,
            life: this.rng.range(0.45, 0.95),
            maxLife: 0.95,
            size: this.rng.range(5, 13),
            rot: this.rng.range(0, TAU),
            vr: this.rng.range(-7, 7),
            kind: 'shard',
            color: brick.type === 'anchor' ? this.palette.rope : this.palette.clay
          });
        }
      } else if (brick.type === 'wood') {
        const total = this.effectCount(16);
        for (let i = 0; i < total; i += 1) {
          const a = this.rng.range(0, TAU);
          const speed = this.rng.range(80, 280);
          this.pushParticle({
            x,
            y,
            vx: Math.cos(a) * speed,
            vy: Math.sin(a) * speed - 20,
            gravity: 430,
            drag: 0.988,
            life: this.rng.range(0.45, 0.9),
            maxLife: 0.9,
            size: this.rng.range(4, 11),
            rot: a,
            vr: this.rng.range(-8, 8),
            kind: 'splinter',
            color: this.palette.wood
          });
        }
      }
    }

    spawnPaperBurst(x, y, color, count, power) {
      const total = this.effectCount(count);
      for (let i = 0; i < total; i += 1) {
        const a = this.rng.range(0, TAU);
        const speed = this.rng.range(60, 210) * (power || 1);
        this.pushParticle({
          x: x + this.rng.range(-6, 6),
          y: y + this.rng.range(-6, 6),
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed - 30,
          gravity: 170,
          drag: 0.985,
          life: this.rng.range(0.55, 1.2),
          maxLife: 1.2,
          size: this.rng.range(5, 12),
          rot: this.rng.range(0, TAU),
          vr: this.rng.range(-6, 6),
          kind: 'paper',
          color,
          flutter: this.rng.range(2.5, 6),
          phase: this.rng.range(0, TAU)
        });
      }
    }

    spawnDrumBurst(x, y, count) {
      const colors = [this.palette.red, this.palette.gold, this.palette.cream];
      const total = this.effectCount(count);
      for (let i = 0; i < total; i += 1) {
        const a = (i / total) * TAU + this.rng.range(-0.08, 0.08);
        const speed = this.rng.range(80, 260);
        this.pushParticle({
          x,
          y,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed,
          gravity: 120,
          drag: 0.982,
          life: this.rng.range(0.35, 0.8),
          maxLife: 0.8,
          size: this.rng.range(3, 8),
          rot: a,
          vr: this.rng.range(-4, 4),
          kind: 'paper',
          color: colors[i % colors.length],
          flutter: 4,
          phase: i
        });
      }
    }

    spawnImpactDust(x, y, count, color) {
      const total = this.effectCount(count);
      for (let i = 0; i < total; i += 1) {
        this.pushParticle({
          x: x + this.rng.range(-8, 8),
          y: y + this.rng.range(-8, 8),
          vx: this.rng.range(-80, 80),
          vy: this.rng.range(-80, 50),
          gravity: 200,
          drag: 0.96,
          life: this.rng.range(0.16, 0.38),
          maxLife: 0.38,
          size: this.rng.range(2, 5),
          rot: 0,
          vr: 0,
          kind: 'dust',
          color
        });
      }
    }

    spawnRing(x, y, r0, r1, color, duration, width) {
      this.rings.push({ x, y, r0, r1, color, duration, width, t: 0 });
    }

    addShake(amount) {
      if (!this.settings.shake || !this.settings.motion) return;
      this.shake = Math.min(28, Math.max(this.shake, amount));
    }

    brickColor(brick) {
      const variants = [this.palette.red, this.palette.paper, this.palette.green, this.palette.plum];
      if (brick.type === 'clay') return this.palette.clay;
      if (brick.type === 'wood') return this.palette.wood;
      if (brick.type === 'bomb') return this.palette.red;
      if (brick.type === 'bell') return this.palette.gold;
      if (brick.type === 'anchor') return this.palette.rope;
      return variants[(brick.variant || 0) % variants.length];
    }

    draw() {
      const ctx = this.ctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const palette = this.palette || CONTENT.PALETTES[0];
      this.drawBackdrop(ctx, palette);

      if (this.state === 'title') this.drawTitle(ctx);
      else if (this.state === 'settings') this.drawSettings(ctx);
      else if (this.state === 'upgrade' || this.state === 'upgradeChosen') this.drawUpgrade(ctx);
      else if (this.state === 'victory') this.drawVictory(ctx);
      else if (this.state === 'gameover') this.drawGameover(ctx);
      else {
        this.drawGameScene(ctx);
        if (this.state === 'retry') this.drawRetry(ctx);
      }

      if (this.paused) this.drawPause(ctx);
      if (this.stampNotice) this.drawStampNotice(ctx);
      this.drawVignette(ctx);
    }

    drawBackdrop(ctx, palette) {
      ctx.fillStyle = this.settings.contrast ? '#12161b' : palette.cloth;
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      ctx.globalAlpha = this.settings.contrast ? 0.14 : 0.08;
      ctx.strokeStyle = palette.cloth2;
      ctx.lineWidth = 2;
      for (let x = 80; x < W; x += 88) {
        ctx.beginPath();
        ctx.moveTo(x, 100);
        ctx.lineTo(x + Math.sin(x) * 5, H - 70);
        ctx.stroke();
      }
      for (const g of this.grain) {
        ctx.globalAlpha = g.a;
        ctx.fillStyle = (Math.floor(g.x + g.y) % 2) ? palette.paper : palette.ink;
        ctx.fillRect(g.x, g.y, g.s, g.s);
      }
      ctx.restore();

      ctx.save();
      ctx.strokeStyle = palette.rope;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.24;
      for (const s of this.stitches) {
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.r);
        ctx.beginPath();
        ctx.moveTo(-5, -3);
        ctx.lineTo(5, 3);
        ctx.moveTo(-5, 3);
        ctx.lineTo(5, -3);
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();

      this.drawWoodFrame(ctx, palette);
    }

    drawWoodFrame(ctx, palette) {
      ctx.fillStyle = palette.wood2;
      ctx.fillRect(0, 0, 54, H);
      ctx.fillRect(W - 54, 0, 54, H);
      ctx.fillRect(0, 0, W, 98);
      ctx.fillRect(0, H - 58, W, 58);
      ctx.fillStyle = palette.wood;
      ctx.fillRect(10, 0, 30, H);
      ctx.fillRect(W - 40, 0, 30, H);
      ctx.fillRect(0, 10, W, 64);
      ctx.fillRect(0, H - 42, W, 26);
      ctx.strokeStyle = palette.rope;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(52, 118);
      ctx.quadraticCurveTo(W / 2, 150, W - 52, 118);
      ctx.stroke();
      const flagColors = [palette.red, palette.gold, palette.cream, palette.green, palette.plum];
      for (let i = 0; i < 11; i += 1) {
        const x = 74 + i * 75;
        const y = 121 + Math.sin((i / 10) * Math.PI) * 22;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate((i - 5) * 0.012);
        ctx.fillStyle = flagColors[i % flagColors.length];
        ctx.beginPath();
        ctx.moveTo(-18, 0);
        ctx.lineTo(19, 0);
        ctx.lineTo(13, 38);
        ctx.lineTo(0, 29);
        ctx.lineTo(-13, 38);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = palette.ink;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }
    }

    drawVignette(ctx) {
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 34;
      ctx.strokeRect(20, 20, W - 40, H - 40);
      ctx.restore();
    }

    drawGameScene(ctx) {
      ctx.save();
      ctx.translate(this.shakeX, this.shakeY);
      if (this.boss) this.drawBoss(ctx);
      this.drawRopes(ctx);
      for (const brick of this.bricks) {
        if (!brick.destroyed) this.drawBrick(ctx, brick);
      }
      for (const p of this.powerups) this.drawPowerup(ctx, p);
      for (const ball of this.balls) this.drawBall(ctx, ball);
      if (this.paddle) this.drawPaddle(ctx);
      this.drawParticles(ctx);
      this.drawRings(ctx);
      this.drawPopups(ctx);
      ctx.restore();

      this.drawStreamers(ctx);
      this.drawHUD(ctx);
      if (this.introTimer > 0 && this.state === 'playing') this.drawStageIntro(ctx);
      if (this.state === 'stageClear') this.drawClearOverlay(ctx);
      if (this.state === 'bossDefeat') this.drawBossDefeatOverlay(ctx);
    }

    drawRopes(ctx) {
      ctx.save();
      ctx.strokeStyle = this.palette.rope;
      ctx.lineWidth = 4;
      ctx.globalAlpha = 0.78;
      ctx.lineCap = 'round';
      for (const anchor of this.bricks) {
        if (anchor.destroyed || anchor.type !== 'anchor' || !anchor.group) continue;
        const ax = anchor.x + anchor.w / 2;
        const ay = anchor.y + anchor.h / 2;
        for (const linked of this.bricks) {
          if (linked.destroyed || linked.group !== anchor.group || !linked.linked) continue;
          const lx = linked.x + linked.w / 2;
          const ly = linked.y + linked.h / 2;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.quadraticCurveTo((ax + lx) / 2 + Math.sin(linked.seed) * 18, (ay + ly) / 2 + 28, lx, ly);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    roughRectPath(ctx, w, h, seed, jitter) {
      const j = jitter || 4;
      const r = (n) => (hashFloat(seed * 17 + n) - 0.5) * j;
      ctx.beginPath();
      ctx.moveTo(-w / 2 + r(1), -h / 2 + r(2));
      ctx.lineTo(0 + r(3), -h / 2 + r(4));
      ctx.lineTo(w / 2 + r(5), -h / 2 + r(6));
      ctx.lineTo(w / 2 + r(7), 0 + r(8));
      ctx.lineTo(w / 2 + r(9), h / 2 + r(10));
      ctx.lineTo(0 + r(11), h / 2 + r(12));
      ctx.lineTo(-w / 2 + r(13), h / 2 + r(14));
      ctx.lineTo(-w / 2 + r(15), 0 + r(16));
      ctx.closePath();
    }

    drawBrick(ctx, brick) {
      const x = brick.x + brick.w / 2;
      const y = brick.y + brick.h / 2;
      const requiredLeft = this.requiredRemaining();
      const targetPulse = brick.required && requiredLeft <= 3 ? 1 + Math.sin(this.time * 6 + brick.seed) * 0.045 : 1;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(brick.rot || 0);
      ctx.scale(targetPulse, targetPulse);
      const hitScale = 1 + brick.hitFlash * 0.035;
      ctx.scale(hitScale, 1 / hitScale);

      ctx.save();
      ctx.translate(4, 6);
      ctx.fillStyle = 'rgba(20,15,12,0.42)';
      this.roughRectPath(ctx, brick.w, brick.h, brick.seed, brick.type === 'paper' ? 5 : 2.5);
      ctx.fill();
      ctx.restore();

      switch (brick.type) {
        case 'paper':
          this.drawPaperBrick(ctx, brick);
          break;
        case 'clay':
          this.drawClayBrick(ctx, brick);
          break;
        case 'wood':
          this.drawWoodBrick(ctx, brick);
          break;
        case 'bomb':
          this.drawBombBrick(ctx, brick);
          break;
        case 'spinner':
          this.drawSpinnerBrick(ctx, brick);
          break;
        case 'bell':
          this.drawBellBrick(ctx, brick);
          break;
        case 'anchor':
          this.drawAnchorBrick(ctx, brick);
          break;
        case 'gift':
          this.drawGiftBrick(ctx, brick);
          break;
        default:
          this.drawPaperBrick(ctx, brick);
          break;
      }

      if (brick.required) this.drawKnotStamp(ctx, brick.w / 2 - 14, -brick.h / 2 + 14, 10, requiredLeft <= 3);
      if (brick.hitFlash > 0) {
        ctx.save();
        ctx.globalAlpha = brick.hitFlash * 0.6;
        ctx.fillStyle = this.palette.white;
        this.roughRectPath(ctx, brick.w, brick.h, brick.seed + 31, 3);
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    }

    drawPaperBrick(ctx, brick) {
      const color = this.brickColor(brick);
      ctx.fillStyle = color;
      this.roughRectPath(ctx, brick.w, brick.h, brick.seed, 5);
      ctx.fill();
      ctx.strokeStyle = this.palette.ink;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.globalAlpha = 0.34;
      ctx.strokeStyle = this.palette.cream;
      ctx.lineWidth = 2;
      for (let i = -1; i <= 1; i += 1) {
        ctx.beginPath();
        ctx.moveTo((i * brick.w) / 4, -brick.h / 2 + 5);
        ctx.lineTo((i * brick.w) / 4 + Math.sin(brick.seed + i) * 2, brick.h / 2 - 5);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = this.palette.ink;
      ctx.fillRect(-brick.w * 0.34, -brick.h / 2 - 4, brick.w * 0.68, 4);
      ctx.fillRect(-brick.w * 0.28, brick.h / 2, brick.w * 0.56, 4);
    }

    drawClayBrick(ctx, brick) {
      ctx.fillStyle = this.palette.clay2;
      this.roughRectPath(ctx, brick.w, brick.h, brick.seed, 2.5);
      ctx.fill();
      ctx.save();
      ctx.translate(0, -4);
      ctx.fillStyle = this.palette.clay;
      this.roughRectPath(ctx, brick.w - 5, brick.h - 5, brick.seed + 5, 2.5);
      ctx.fill();
      ctx.strokeStyle = this.palette.ink;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = this.palette.clay2;
      ctx.lineWidth = 3;
      if (brick.hp < brick.maxHp || brick.hitFlash > 0.4) {
        ctx.beginPath();
        ctx.moveTo(-12, -brick.h / 2 + 4);
        ctx.lineTo(-3, -5);
        ctx.lineTo(-18, 8);
        ctx.lineTo(8, brick.h / 2 - 3);
        ctx.moveTo(-3, -5);
        ctx.lineTo(18, -14);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(-brick.w / 2 + 14, 0);
        ctx.lineTo(brick.w / 2 - 14, 0);
        ctx.stroke();
      }
    }

    drawWoodBrick(ctx, brick) {
      ctx.fillStyle = this.palette.wood2;
      this.roughRectPath(ctx, brick.w, brick.h, brick.seed, 2);
      ctx.fill();
      ctx.save();
      ctx.translate(0, -3);
      ctx.fillStyle = this.palette.wood;
      this.roughRectPath(ctx, brick.w - 4, brick.h - 4, brick.seed + 3, 2);
      ctx.fill();
      ctx.strokeStyle = this.palette.ink;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = this.palette.wood2;
      ctx.lineWidth = 2;
      for (let i = -1; i <= 1; i += 1) {
        ctx.beginPath();
        ctx.moveTo(-brick.w / 2 + 7, (i * brick.h) / 4);
        ctx.quadraticCurveTo(0, (i * brick.h) / 4 + Math.sin(brick.seed + i) * 3, brick.w / 2 - 7, (i * brick.h) / 4);
        ctx.stroke();
      }
      ctx.fillStyle = this.palette.rope;
      ctx.fillRect(-brick.w / 2 + 16, -brick.h / 2, 9, brick.h);
      ctx.fillRect(brick.w / 2 - 25, -brick.h / 2, 9, brick.h);
      if (brick.hp < brick.maxHp) {
        ctx.strokeStyle = this.palette.ink;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(-6, -brick.h / 2 + 4);
        ctx.lineTo(4, -2);
        ctx.lineTo(-8, brick.h / 2 - 4);
        ctx.stroke();
      }
    }

    drawBombBrick(ctx, brick) {
      const pulse = 1 + Math.sin(this.time * 8 + brick.seed) * 0.025;
      ctx.scale(pulse, pulse);
      ctx.fillStyle = this.palette.red2;
      this.roughRectPath(ctx, brick.w, brick.h, brick.seed, 3);
      ctx.fill();
      ctx.strokeStyle = this.palette.ink;
      ctx.lineWidth = 3;
      ctx.stroke();
      const r = Math.min(brick.w, brick.h) * 0.36;
      ctx.fillStyle = this.palette.cream;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = this.palette.ink;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = this.palette.red;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.42, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = this.palette.gold;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(r * 0.65, -r * 0.65);
      ctx.quadraticCurveTo(r * 1.3, -r * 1.35, r * 1.6, -r * 0.65);
      ctx.stroke();
      ctx.fillStyle = this.palette.gold;
      ctx.beginPath();
      ctx.arc(r * 1.62, -r * 0.66, 4 + Math.sin(this.time * 13) * 1.5, 0, TAU);
      ctx.fill();
    }

    drawSpinnerBrick(ctx, brick) {
      ctx.rotate(this.time * 1.7 + brick.seed * 0.03 + brick.rot);
      ctx.fillStyle = this.palette.wood2;
      ctx.beginPath();
      ctx.arc(0, 0, brick.w * 0.19, 0, TAU);
      ctx.fill();
      const colors = [this.palette.red, this.palette.cream, this.palette.green, this.palette.gold];
      for (let i = 0; i < 4; i += 1) {
        ctx.save();
        ctx.rotate((i * Math.PI) / 2);
        ctx.fillStyle = colors[i];
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(brick.w * 0.42, -brick.h * 0.14, brick.w * 0.36, -brick.h * 0.42);
        ctx.quadraticCurveTo(brick.w * 0.1, -brick.h * 0.34, 0, 0);
        ctx.fill();
        ctx.strokeStyle = this.palette.ink;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = this.palette.gold;
      ctx.beginPath();
      ctx.arc(0, 0, brick.w * 0.11, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = this.palette.ink;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    drawBellBrick(ctx, brick) {
      ctx.fillStyle = this.palette.paper;
      this.roughRectPath(ctx, brick.w, brick.h, brick.seed, 4);
      ctx.fill();
      ctx.strokeStyle = this.palette.ink;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.save();
      ctx.translate(0, 2);
      ctx.fillStyle = this.palette.gold;
      ctx.beginPath();
      ctx.moveTo(-20, 15);
      ctx.quadraticCurveTo(-24, -16, 0, -23);
      ctx.quadraticCurveTo(24, -16, 20, 15);
      ctx.lineTo(27, 20);
      ctx.lineTo(-27, 20);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = this.palette.ink;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 22, 6, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    drawAnchorBrick(ctx, brick) {
      ctx.fillStyle = this.palette.wood2;
      this.roughRectPath(ctx, brick.w, brick.h, brick.seed, 3);
      ctx.fill();
      ctx.strokeStyle = this.palette.ink;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = this.palette.rope;
      ctx.beginPath();
      ctx.arc(0, 0, Math.min(brick.w, brick.h) * 0.34, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = this.palette.ink;
      ctx.lineWidth = 3;
      ctx.stroke();
      this.drawKnotStamp(ctx, 0, 0, 19, false, true);
      ctx.strokeStyle = this.palette.rope;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(-brick.w / 2 + 8, -brick.h / 2 + 7);
      ctx.lineTo(brick.w / 2 - 8, brick.h / 2 - 7);
      ctx.moveTo(brick.w / 2 - 8, -brick.h / 2 + 7);
      ctx.lineTo(-brick.w / 2 + 8, brick.h / 2 - 7);
      ctx.stroke();
    }

    drawGiftBrick(ctx, brick) {
      ctx.fillStyle = this.palette.cream;
      this.roughRectPath(ctx, brick.w, brick.h, brick.seed, 5);
      ctx.fill();
      ctx.strokeStyle = this.palette.ink;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = this.palette.red;
      ctx.fillRect(-7, -brick.h / 2, 14, brick.h);
      ctx.fillRect(-brick.w / 2, -7, brick.w, 14);
      ctx.save();
      ctx.translate(0, 0);
      this.drawIcon(ctx, brick.gift || 'multi', 0, 0, 24, this.palette.ink);
      ctx.restore();
    }

    drawKnotStamp(ctx, x, y, size, pulse, dark) {
      ctx.save();
      ctx.translate(x, y);
      const scale = pulse ? 1 + Math.sin(this.time * 7) * 0.1 : 1;
      ctx.scale(scale, scale);
      ctx.fillStyle = dark ? this.palette.ink : this.palette.white;
      ctx.beginPath();
      ctx.arc(0, 0, size, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = dark ? this.palette.white : this.palette.ink;
      ctx.lineWidth = Math.max(1.5, size * 0.16);
      for (let i = 0; i < 4; i += 1) {
        ctx.save();
        ctx.rotate((i * Math.PI) / 2);
        ctx.beginPath();
        ctx.ellipse(0, -size * 0.32, size * 0.22, size * 0.42, 0, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    }

    drawBall(ctx, ball) {
      for (let i = ball.trail.length - 1; i >= 0; i -= 1) {
        const t = ball.trail[i];
        ctx.save();
        ctx.globalAlpha = t.life * (ball.chargeTimer > 0 ? 0.32 : 0.12);
        ctx.fillStyle = ball.chargeTimer > 0 ? this.palette.gold : this.palette.paper;
        ctx.beginPath();
        ctx.arc(t.x, t.y, ball.r * (0.25 + t.life * 0.45), 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      ctx.save();
      ctx.translate(ball.x, ball.y);
      if (ball.chargeTimer > 0) {
        ctx.strokeStyle = this.palette.gold;
        ctx.lineWidth = 4;
        ctx.globalAlpha = 0.65 + Math.sin(this.time * 12 + ball.x) * 0.15;
        ctx.beginPath();
        ctx.arc(0, 0, ball.r + 7, 0, TAU);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = this.palette.ink;
      ctx.beginPath();
      ctx.arc(3, 5, ball.r + 1, 0, TAU);
      ctx.fill();
      ctx.fillStyle = this.palette.gold;
      ctx.beginPath();
      ctx.arc(0, 0, ball.r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = this.palette.ink;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.fillStyle = this.palette.cream;
      ctx.beginPath();
      ctx.arc(-4, -5, ball.r * 0.32, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    drawPaddle(ctx) {
      const p = this.paddle;
      const pulse = p.hitPulse;
      const sweet = p.sweetPulse;
      const yScale = 1 - pulse * 0.15;
      const xScale = 1 + pulse * 0.08;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(xScale, yScale);
      ctx.fillStyle = this.palette.ink;
      ctx.beginPath();
      ctx.arc(-p.width * 0.35, 23, 18, 0, TAU);
      ctx.arc(p.width * 0.35, 23, 18, 0, TAU);
      ctx.fill();
      ctx.fillStyle = this.palette.wood;
      ctx.fillRect(-p.width / 2 - 10, 3, p.width + 20, 22);
      ctx.strokeStyle = this.palette.ink;
      ctx.lineWidth = 4;
      ctx.strokeRect(-p.width / 2 - 10, 3, p.width + 20, 22);
      ctx.fillStyle = this.palette.red2;
      this.roughRectPath(ctx, p.width, p.h, 77, 4);
      ctx.fill();
      ctx.strokeStyle = this.palette.ink;
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.fillStyle = this.palette.cream;
      this.roughRectPath(ctx, p.width - 18, p.h - 10, 91, 3);
      ctx.fill();
      ctx.strokeStyle = this.palette.red;
      ctx.lineWidth = 4;
      ctx.stroke();
      const sweetWidth = p.width * (0.18 + this.runUpgrades.sweet * 0.04) * 2;
      ctx.fillStyle = this.palette.gold;
      ctx.fillRect(-sweetWidth / 2, -p.h / 2 + 4, sweetWidth, p.h - 8);
      ctx.strokeStyle = this.palette.ink;
      ctx.lineWidth = 2;
      ctx.strokeRect(-sweetWidth / 2, -p.h / 2 + 4, sweetWidth, p.h - 8);
      if (sweet > 0) {
        ctx.globalAlpha = sweet * 0.65;
        ctx.strokeStyle = this.palette.gold;
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.arc(0, 0, 38 + (1 - sweet) * 80, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawPowerup(ctx, p) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      const pulse = 1 + Math.sin(this.time * 7 + p.seed) * 0.07;
      ctx.scale(pulse, pulse);
      ctx.fillStyle = this.palette.ink;
      this.roughRectPath(ctx, 54, 54, p.seed, 5);
      ctx.fill();
      ctx.translate(0, -4);
      ctx.fillStyle = this.palette.cream;
      this.roughRectPath(ctx, 50, 50, p.seed + 2, 5);
      ctx.fill();
      ctx.strokeStyle = this.palette.red;
      ctx.lineWidth = 4;
      ctx.stroke();
      this.drawIcon(ctx, p.type, 0, 0, 27, this.palette.ink);
      ctx.restore();
    }

    drawParticles(ctx) {
      for (const p of this.particles) {
        const alpha = clamp(p.life / p.maxLife, 0, 1);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot || 0);
        ctx.fillStyle = p.color;
        if (p.kind === 'shard') {
          ctx.beginPath();
          ctx.moveTo(-p.size * 0.6, p.size * 0.5);
          ctx.lineTo(0, -p.size);
          ctx.lineTo(p.size * 0.7, p.size * 0.45);
          ctx.closePath();
          ctx.fill();
        } else if (p.kind === 'splinter') {
          ctx.fillRect(-p.size * 1.2, -p.size * 0.18, p.size * 2.4, p.size * 0.36);
        } else if (p.kind === 'fan') {
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.arc(0, 0, p.size, -0.65, 0.65);
          ctx.closePath();
          ctx.fill();
        } else if (p.kind === 'dust') {
          ctx.beginPath();
          ctx.arc(0, 0, p.size, 0, TAU);
          ctx.fill();
        } else {
          ctx.fillRect(-p.size * 0.55, -p.size * 0.35, p.size * 1.1, p.size * 0.7);
        }
        ctx.restore();
      }
    }

    drawRings(ctx) {
      for (const ring of this.rings) {
        const t = clamp(ring.t / ring.duration, 0, 1);
        ctx.save();
        ctx.globalAlpha = (1 - t) * 0.82;
        ctx.strokeStyle = ring.color;
        ctx.lineWidth = ring.width * (1 - t * 0.35);
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, lerp(ring.r0, ring.r1, easeOutCubic(t)), 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
    }

    drawPopups(ctx) {
      for (const p of this.popups) {
        const t = p.t / p.duration;
        ctx.save();
        ctx.globalAlpha = 1 - smoothstep(t);
        ctx.translate(p.x, p.y);
        ctx.rotate((hashFloat(p.seed) - 0.5) * 0.12);
        ctx.fillStyle = this.palette.cream;
        this.roughRectPath(ctx, 86, 40, p.seed, 4);
        ctx.fill();
        ctx.strokeStyle = this.palette.ink;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = this.palette.ink;
        ctx.font = `700 20px ${I18N.fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(I18N.formatNumber(p.value), 0, 1);
        ctx.restore();
      }
    }

    drawStreamers(ctx) {
      for (const s of this.streamers) {
        const alpha = clamp(s.life / s.maxLife, 0, 1);
        ctx.save();
        ctx.globalAlpha = Math.min(1, alpha * 1.8);
        ctx.translate(s.x, s.y);
        ctx.rotate(s.rot);
        ctx.fillStyle = s.color;
        ctx.fillRect(-s.w / 2, -s.h / 2, s.w, s.h);
        ctx.restore();
      }
    }

    drawHUD(ctx) {
      this.drawReserve(ctx);
      this.drawProgressRope(ctx);
      this.drawScoreTag(ctx);
      this.drawHypeGong(ctx);
      if (this.comboCount >= 5) this.drawCombo(ctx);
      if (this.boss) this.drawBossHealth(ctx);
    }

    drawReserve(ctx) {
      const count = Math.max(0, this.reserve + 1);
      for (let i = 0; i < count; i += 1) {
        ctx.save();
        ctx.translate(86 + i * 32, 92);
        ctx.fillStyle = this.palette.red;
        ctx.beginPath();
        ctx.arc(0, 0, 11, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = this.palette.ink;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = this.palette.cream;
        ctx.beginPath();
        ctx.arc(-3, -3, 3, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      for (let i = 0; i < this.safety; i += 1) {
        ctx.save();
        ctx.translate(88 + i * 30, 124);
        this.drawIcon(ctx, 'shield', 0, 0, 15, this.palette.cream);
        ctx.restore();
      }
    }

    drawProgressRope(ctx) {
      ctx.save();
      ctx.strokeStyle = this.palette.rope;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(230, 94);
      ctx.lineTo(665, 94);
      ctx.stroke();
      if (this.mode === 'campaign') {
        const total = CONTENT.stageCount;
        for (let i = 0; i < total; i += 1) {
          const x = lerp(236, 659, i / (total - 1));
          const current = i === this.stageIndex;
          ctx.fillStyle = i < this.stageIndex ? this.palette.red : current ? this.palette.gold : this.palette.wood2;
          ctx.beginPath();
          ctx.arc(x, 94, current ? 10 : 7, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = this.palette.ink;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      } else {
        const visible = 9;
        for (let i = 0; i < visible; i += 1) {
          const x = lerp(236, 659, i / (visible - 1));
          const relative = i - 4;
          const wave = this.endlessWave + relative;
          ctx.fillStyle = relative < 0 ? this.palette.red : relative === 0 ? this.palette.gold : this.palette.wood2;
          ctx.beginPath();
          ctx.arc(x, 94, relative === 0 ? 11 : 7, 0, TAU);
          ctx.fill();
          if (relative === 0) {
            ctx.fillStyle = this.palette.ink;
            ctx.font = `700 15px ${I18N.fontFamily}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(I18N.formatNumber(wave), x, 95);
          }
        }
      }
      ctx.restore();
    }

    drawScoreTag(ctx) {
      ctx.save();
      ctx.translate(780, 91);
      ctx.rotate(-0.025);
      ctx.fillStyle = this.palette.cream;
      this.roughRectPath(ctx, 145, 58, 554, 5);
      ctx.fill();
      ctx.strokeStyle = this.palette.ink;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = this.palette.ink;
      ctx.font = `700 25px ${I18N.fontFamily}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(I18N.formatNumber(Math.round(this.score || 0)), 0, 2);
      ctx.restore();
    }

    drawHypeGong(ctx) {
      const x = 808;
      const y = 1090;
      const r = 46;
      ctx.save();
      ctx.translate(x, y);
      const pulse = this.paradeReady ? 1 + Math.sin(this.time * 8) * 0.09 : 1;
      ctx.scale(pulse, pulse);
      for (let i = 0; i < 12; i += 1) {
        const filled = i < Math.ceil((this.hype / 100) * 12) || this.paradeReady || this.paradeTimer > 0;
        ctx.save();
        ctx.rotate((i / 12) * TAU);
        ctx.fillStyle = filled ? this.palette.gold : this.palette.wood2;
        ctx.fillRect(-3, -r - 15, 6, 14);
        ctx.restore();
      }
      ctx.fillStyle = this.palette.wood2;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = this.palette.rope;
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.fillStyle = this.paradeReady || this.paradeTimer > 0 ? this.palette.gold : this.palette.red2;
      ctx.beginPath();
      ctx.arc(0, 0, r - 10, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = this.palette.ink;
      ctx.lineWidth = 3;
      ctx.stroke();
      this.drawIcon(ctx, this.paradeTimer > 0 ? 'multi' : 'drum', 0, 0, 24, this.palette.ink);
      ctx.restore();
    }

    drawCombo(ctx) {
      const mult = this.comboMultiplier();
      ctx.save();
      ctx.translate(450, 151);
      const wobble = Math.sin(this.time * 5) * 0.03;
      ctx.rotate(wobble);
      ctx.fillStyle = this.palette.cream;
      this.roughRectPath(ctx, 120, 48, 404, 5);
      ctx.fill();
      ctx.strokeStyle = this.palette.ink;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = this.palette.red2;
      ctx.font = `800 27px ${I18N.fontFamily}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`×${I18N.formatNumber(mult)}`, 0, 1);
      ctx.restore();
    }

    drawBossHealth(ctx) {
      const boss = this.boss;
      if (!boss) return;
      ctx.save();
      const x = boss.x;
      const y = boss.y + 18;
      const segments = 24;
      for (let i = 0; i < segments; i += 1) {
        const a = (i / segments) * TAU - Math.PI / 2;
        const active = i < boss.hp;
        ctx.save();
        ctx.translate(x + Math.cos(a) * 108, y + Math.sin(a) * 108);
        ctx.rotate(a + Math.PI / 2);
        ctx.fillStyle = active ? this.palette.red : this.palette.wood2;
        ctx.fillRect(-3, -8, 6, 16);
        ctx.restore();
      }
      ctx.restore();
    }

    drawStageIntro(ctx) {
      const t = clamp(1 - this.introTimer / 1.05, 0, 1);
      const alpha = Math.sin(t * Math.PI);
      ctx.save();
      ctx.globalAlpha = alpha * 0.88;
      ctx.translate(450, 600);
      ctx.scale(0.8 + easeOutBack(t) * 0.2, 0.8 + easeOutBack(t) * 0.2);
      ctx.fillStyle = this.palette.cream;
      this.roughRectPath(ctx, 260, 100, 808, 7);
      ctx.fill();
      ctx.strokeStyle = this.palette.ink;
      ctx.lineWidth = 5;
      ctx.stroke();
      if (this.stage.boss) {
        this.drawIcon(ctx, 'target', 0, 0, 42, this.palette.red2);
      } else if (this.mode === 'endless') {
        ctx.fillStyle = this.palette.ink;
        ctx.font = `800 50px ${I18N.fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(I18N.formatNumber(this.endlessWave), 0, 2);
      } else {
        for (let i = 0; i < 3; i += 1) {
          ctx.fillStyle = i <= Math.floor(this.stageIndex / 4) ? this.palette.red : this.palette.wood2;
          ctx.beginPath();
          ctx.arc((i - 1) * 52, 0, 15, 0, TAU);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    drawClearOverlay(ctx) {
      const t = clamp(this.clearTimer / 1.1, 0, 1);
      ctx.save();
      ctx.globalAlpha = t * 0.88;
      ctx.translate(450, 570);
      ctx.scale(easeOutBack(t), easeOutBack(t));
      ctx.fillStyle = this.palette.cream;
      ctx.beginPath();
      for (let i = 0; i < 16; i += 1) {
        const a = (i / 16) * TAU;
        const r = i % 2 ? 72 : 105;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = this.palette.red2;
      ctx.lineWidth = 8;
      ctx.stroke();
      this.drawKnotStamp(ctx, 0, 0, 38, false, true);
      ctx.restore();
    }

    drawBoss(ctx) {
      const b = this.boss;
      if (!b) return;
      const t = b.defeated ? b.defeatTimer : 0;
      const pieceShift = this.settings.motion ? easeOutCubic(clamp(t / 2.8, 0, 1)) : 0;
      ctx.save();
      ctx.translate(b.x, b.y);
      const bob = b.defeated ? 0 : Math.sin(this.time * (1.3 + b.phase * 0.2)) * 5;
      ctx.translate(0, bob);

      const drawPiece = (ox, oy, rot, fn) => {
        ctx.save();
        ctx.translate(ox * pieceShift, oy * pieceShift);
        ctx.rotate(rot * pieceShift);
        fn();
        ctx.restore();
      };

      drawPiece(-170, -90, -0.45, () => {
        ctx.fillStyle = this.palette.red2;
        ctx.beginPath();
        ctx.moveTo(-40, -45);
        ctx.lineTo(-175, -115);
        ctx.lineTo(-132, 15);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = this.palette.ink;
        ctx.lineWidth = 7;
        ctx.stroke();
      });
      drawPiece(170, -90, 0.45, () => {
        ctx.fillStyle = this.palette.red2;
        ctx.beginPath();
        ctx.moveTo(40, -45);
        ctx.lineTo(175, -115);
        ctx.lineTo(132, 15);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = this.palette.ink;
        ctx.lineWidth = 7;
        ctx.stroke();
      });

      drawPiece(0, 0, 0.18, () => {
        ctx.fillStyle = this.palette.ink;
        ctx.beginPath();
        ctx.ellipse(0, 18, 235, 178, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = this.palette.cream;
        ctx.beginPath();
        ctx.ellipse(0, 8, 222, 165, 0, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = this.palette.red2;
        ctx.lineWidth = 13;
        ctx.stroke();

        ctx.fillStyle = this.palette.red;
        ctx.beginPath();
        ctx.moveTo(-200, -10);
        ctx.quadraticCurveTo(-130, -120, -70, -92);
        ctx.quadraticCurveTo(0, -155, 70, -92);
        ctx.quadraticCurveTo(130, -120, 200, -10);
        ctx.quadraticCurveTo(120, -34, 90, 36);
        ctx.quadraticCurveTo(0, 4, -90, 36);
        ctx.quadraticCurveTo(-120, -34, -200, -10);
        ctx.fill();
        ctx.strokeStyle = this.palette.ink;
        ctx.lineWidth = 6;
        ctx.stroke();

        ctx.strokeStyle = this.palette.ink;
        ctx.lineWidth = 14;
        ctx.lineCap = 'round';
        ctx.beginPath();
        if (b.coreOpen) {
          ctx.moveTo(-120, -20);
          ctx.quadraticCurveTo(-80, 30, -35, -10);
          ctx.moveTo(120, -20);
          ctx.quadraticCurveTo(80, 30, 35, -10);
        } else {
          ctx.moveTo(-130, 5);
          ctx.quadraticCurveTo(-80, -35, -30, 2);
          ctx.moveTo(130, 5);
          ctx.quadraticCurveTo(80, -35, 30, 2);
        }
        ctx.stroke();

        ctx.fillStyle = this.palette.plum;
        ctx.beginPath();
        ctx.ellipse(0, 38, 58, 45, 0, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = this.palette.ink;
        ctx.lineWidth = 6;
        ctx.stroke();

        if (b.coreOpen) {
          const pulse = 1 + Math.sin(this.time * 7) * 0.045;
          ctx.save();
          ctx.translate(0, 18);
          ctx.scale(pulse, pulse);
          ctx.fillStyle = this.palette.wood2;
          ctx.beginPath();
          ctx.arc(0, 0, b.coreR, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = this.palette.ink;
          ctx.lineWidth = 7;
          ctx.stroke();
          ctx.fillStyle = this.palette.gold;
          ctx.beginPath();
          ctx.arc(0, 0, b.coreR - 14, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = this.palette.red2;
          ctx.lineWidth = 8;
          ctx.stroke();
          this.drawIcon(ctx, 'drum', 0, 0, 36, this.palette.ink);
          ctx.restore();
        }
      });

      if (b.phase >= 1 && !b.defeated) {
        ctx.strokeStyle = this.palette.cream;
        ctx.lineWidth = 5;
        ctx.globalAlpha = 0.45;
        for (let i = 0; i < 4 + b.phase * 2; i += 1) {
          const y = -180 + i * 62;
          ctx.beginPath();
          ctx.moveTo(-330, y);
          ctx.bezierCurveTo(-190, y + Math.sin(this.time * 2 + i) * 35, 190, y - Math.sin(this.time * 2 + i) * 35, 330, y);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      if (b.hitFlash > 0) {
        ctx.globalAlpha = b.hitFlash * 0.45;
        ctx.fillStyle = this.palette.white;
        ctx.beginPath();
        ctx.ellipse(0, 8, 224, 166, 0, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    drawBossDefeatOverlay(ctx) {
      const t = clamp(this.boss.defeatTimer / 3.6, 0, 1);
      ctx.save();
      ctx.globalAlpha = clamp((t - 0.25) * 1.8, 0, 0.7);
      ctx.fillStyle = this.palette.cream;
      ctx.fillRect(54, 128, W - 108, H - 186);
      ctx.restore();
    }

    drawRetry(ctx) {
      const t = clamp(this.retryTimer / 1.6, 0, 1);
      const close = Math.sin(t * Math.PI);
      ctx.save();
      ctx.fillStyle = this.palette.cream;
      ctx.strokeStyle = this.palette.ink;
      ctx.lineWidth = 6;
      const width = (W / 2) * close;
      ctx.fillRect(54, 128, width, H - 186);
      ctx.fillRect(W - 54 - width, 128, width, H - 186);
      ctx.strokeRect(54, 128, width, H - 186);
      ctx.strokeRect(W - 54 - width, 128, width, H - 186);
      if (close > 0.72) {
        ctx.translate(450, 600);
        this.drawIcon(ctx, 'shield', 0, 0, 55, this.palette.red2);
      }
      ctx.restore();
    }

    drawTitle(ctx) {
      const p = CONTENT.PALETTES[0];
      const d = this.titleDemo;
      ctx.save();
      ctx.translate(0, 0);
      for (const brick of d.bricks) {
        if (!brick.alive) continue;
        this.drawBrick(ctx, {
          type: 'paper',
          x: brick.x,
          y: brick.y,
          w: brick.w,
          h: brick.h,
          seed: brick.seed,
          variant: brick.variant,
          required: false,
          hitFlash: 0,
          hp: 1,
          maxHp: 1,
          rot: 0
        });
      }
      this.drawBall(ctx, Object.assign({ trail: [], chargeTimer: 0 }, d.ball));
      const savedPaddle = this.paddle;
      this.paddle = {
        x: d.paddleX,
        y: 830,
        width: 220,
        baseWidth: 220,
        targetWidth: 220,
        h: 30,
        hitPulse: 0,
        sweetPulse: 0,
        wheel: 0
      };
      this.palette = p;
      this.runUpgrades = this.runUpgrades || { sweet: 0 };
      this.drawPaddle(ctx);
      this.paddle = savedPaddle;
      ctx.restore();

      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `900 86px ${I18N.fontFamily}`;
      ctx.fillStyle = p.red2;
      ctx.fillText('TUMBLEDRUM', 456, 228);
      ctx.fillStyle = p.cream;
      ctx.fillText('TUMBLEDRUM', 450, 220);
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 3;
      ctx.strokeText('TUMBLEDRUM', 450, 220);
      ctx.font = `700 22px ${I18N.fontFamily}`;
      ctx.fillStyle = p.gold;
      ctx.fillText(I18N.t('title.subtitle'), 450, 286);
      ctx.restore();

      this.drawMenuDrum(
        ctx,
        450,
        960,
        92,
        'play',
        this.save.bestCampaign || 0,
        distance(this.pointer.x, this.pointer.y, 450, 960) < 112 ||
          (this.keyboardNavigationActive && this.titleIndex === 0)
      );
      this.drawMenuDrum(
        ctx,
        700,
        1000,
        58,
        'infinity',
        this.save.bestEndless || 0,
        distance(this.pointer.x, this.pointer.y, 700, 1000) < 80 ||
          (this.keyboardNavigationActive && this.titleIndex === 1)
      );
      this.drawGearButton(
        ctx,
        815,
        88,
        distance(this.pointer.x, this.pointer.y, 815, 88) < 58 ||
          (this.keyboardNavigationActive && this.titleIndex === 2)
      );
      this.drawStampCabinet(ctx);

      if (performance.now() - this.pointer.movedAt > 4500) {
        this.drawHandCue(ctx, d.paddleX + 80, 880);
      }
    }

    drawMenuDrum(ctx, x, y, r, icon, value, hover) {
      ctx.save();
      ctx.translate(x, y);
      const pulse = hover ? 1.05 + Math.sin(this.time * 7) * 0.035 : 1;
      ctx.scale(pulse, pulse);
      ctx.fillStyle = this.palette.wood2;
      ctx.beginPath();
      ctx.arc(6, 8, r + 8, 0, TAU);
      ctx.fill();
      ctx.fillStyle = this.palette.red2;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = this.palette.rope;
      ctx.lineWidth = Math.max(5, r * 0.1);
      ctx.stroke();
      ctx.fillStyle = this.palette.cream;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.72, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = this.palette.ink;
      ctx.lineWidth = 4;
      ctx.stroke();
      this.drawIcon(ctx, icon, 0, -8, r * 0.35, this.palette.ink);
      if (value > 0) {
        ctx.fillStyle = this.palette.ink;
        ctx.font = `700 ${Math.max(13, r * 0.17)}px ${I18N.fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(I18N.formatNumber(Number(value)), 0, r * 0.43);
      }
      ctx.restore();
    }

    drawGearButton(ctx, x, y, hover) {
      ctx.save();
      ctx.translate(x, y);
      const s = hover ? 1.08 : 1;
      ctx.scale(s, s);
      ctx.fillStyle = this.palette.cream;
      ctx.beginPath();
      ctx.arc(0, 0, 38, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = this.palette.ink;
      ctx.lineWidth = 4;
      ctx.stroke();
      this.drawIcon(ctx, 'gear', 0, 0, 22, this.palette.ink);
      ctx.restore();
    }

    drawStampCabinet(ctx) {
      ctx.save();
      ctx.translate(112, 1015);
      ctx.fillStyle = this.palette.wood2;
      this.roughRectPath(ctx, 132, 112, 121, 4);
      ctx.fill();
      ctx.strokeStyle = this.palette.rope;
      ctx.lineWidth = 4;
      ctx.stroke();
      const ids = ['sweet', 'combo', 'parade', 'perfect', 'boss', 'endless'];
      ids.forEach((id, i) => {
        const x = (i % 3 - 1) * 38;
        const y = (Math.floor(i / 3) - 0.5) * 42;
        ctx.save();
        ctx.translate(x, y);
        ctx.globalAlpha = this.save.stamps[id] ? 1 : 0.22;
        ctx.fillStyle = this.palette.red;
        ctx.beginPath();
        ctx.arc(0, 0, 14, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = this.palette.cream;
        ctx.lineWidth = 2;
        ctx.stroke();
        this.drawIcon(ctx, this.stampIcon(id), 0, 0, 8, this.palette.cream);
        ctx.restore();
      });
      ctx.restore();
    }

    stampIcon(id) {
      return {
        sweet: 'target',
        combo: 'multi',
        parade: 'drum',
        perfect: 'shield',
        boss: 'bomb',
        endless: 'infinity'
      }[id] || 'target';
    }

    drawHandCue(ctx, x, y) {
      ctx.save();
      ctx.globalAlpha = 0.6 + Math.sin(this.time * 4) * 0.16;
      ctx.translate(x + Math.sin(this.time * 2) * 70, y);
      ctx.fillStyle = this.palette.cream;
      ctx.strokeStyle = this.palette.ink;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-12, 22);
      ctx.lineTo(-15, -12);
      ctx.quadraticCurveTo(-12, -25, -4, -12);
      ctx.lineTo(-4, -32);
      ctx.quadraticCurveTo(0, -42, 5, -30);
      ctx.lineTo(5, -12);
      ctx.lineTo(12, -25);
      ctx.quadraticCurveTo(18, -30, 18, -18);
      ctx.lineTo(17, 4);
      ctx.quadraticCurveTo(14, 22, -12, 22);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    drawSettings(ctx) {
      ctx.save();
      ctx.translate(450, 600);
      ctx.fillStyle = this.palette.wood2;
      this.roughRectPath(ctx, 700, 980, 902, 9);
      ctx.fill();
      ctx.strokeStyle = this.palette.rope;
      ctx.lineWidth = 8;
      ctx.stroke();
      ctx.restore();
      this.drawGearButton(ctx, 815, 82, true);
      ctx.save();
      ctx.translate(815, 82);
      ctx.strokeStyle = this.palette.red2;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(-14, -14);
      ctx.lineTo(14, 14);
      ctx.moveTo(14, -14);
      ctx.lineTo(-14, 14);
      ctx.stroke();
      ctx.restore();

      for (let i = 0; i < SETTINGS_ROWS.length; i += 1) {
        const row = SETTINGS_ROWS[i];
        const selected = this.keyboardNavigationActive && this.settingsIndex === i;
        this.drawSettingRow(
          ctx,
          row.y,
          row.icon,
          row.type === 'action' ? null : !!this.settings[row.key],
          selected
        );
      }
    }

    drawSettingFocus(ctx, seed) {
      ctx.strokeStyle = this.palette.red;
      ctx.lineWidth = 4;
      this.roughRectPath(ctx, 610, 88, seed, 4);
      ctx.stroke();
    }

    drawSettingRow(ctx, y, icon, on, selected) {
      ctx.save();
      ctx.translate(450, y);
      if (selected) this.drawSettingFocus(ctx, y);
      ctx.strokeStyle = this.palette.rope;
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-180, 0);
      ctx.lineTo(180, 0);
      ctx.stroke();
      ctx.fillStyle = this.palette.cream;
      ctx.beginPath();
      ctx.arc(-245, 0, 42, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = this.palette.ink;
      ctx.lineWidth = 4;
      ctx.stroke();
      this.drawIcon(ctx, icon, -245, 0, 24, this.palette.ink);
      if (on == null) {
        ctx.fillStyle = this.palette.gold;
        ctx.beginPath();
        ctx.arc(0, 0, 30 + Math.sin(this.time * 4) * 3, 0, TAU);
        ctx.fill();
        this.drawIcon(ctx, 'play', 0, 0, 16, this.palette.ink);
      } else {
        const x = on ? 145 : -145;
        ctx.fillStyle = on ? this.palette.gold : this.palette.red2;
        ctx.beginPath();
        ctx.arc(x, 0, 32, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = this.palette.ink;
        ctx.lineWidth = 4;
        ctx.stroke();
        this.drawKnotStamp(ctx, x, 0, 14, false, true);
      }
      ctx.restore();
    }

    drawUpgrade(ctx) {
      ctx.save();
      ctx.fillStyle = 'rgba(18,15,13,0.36)';
      ctx.fillRect(54, 98, W - 108, H - 156);
      ctx.restore();
      const centers = this.upgradeCenters(this.upgradeOffers.length);
      for (let i = 0; i < centers.length; i += 1) {
        const selected = i === this.menuIndex;
        const chosen = this.state === 'upgradeChosen' && i === this.chosenUpgradeIndex;
        this.drawUpgradeCharm(ctx, centers[i], 520, this.upgradeOffers[i], selected, chosen);
      }
      ctx.save();
      ctx.strokeStyle = this.palette.rope;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(95, 215);
      ctx.quadraticCurveTo(450, 270, 805, 215);
      ctx.stroke();
      ctx.restore();
    }

    drawUpgradeCharm(ctx, x, y, upgrade, selected, chosen) {
      if (!upgrade) return;
      const level = this.runUpgrades[upgrade.id] || 0;
      const swing = this.settings.motion ? Math.sin(this.time * 1.6 + x * 0.01) * 0.035 : 0;
      const chosenT = chosen ? clamp(this.upgradeChosenTimer / 0.45, 0, 1) : 0;
      ctx.save();
      ctx.strokeStyle = this.palette.rope;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(x, 215);
      ctx.quadraticCurveTo(x + Math.sin(x) * 20, 350, x, y - 150);
      ctx.stroke();
      ctx.translate(x, y);
      ctx.rotate(swing);
      const scale = (selected ? 1.06 + Math.sin(this.time * 6) * 0.025 : 1) + chosenT * 0.18;
      ctx.scale(scale, scale);
      ctx.fillStyle = this.palette.ink;
      ctx.beginPath();
      ctx.moveTo(-96, -130);
      ctx.lineTo(96, -130);
      ctx.lineTo(112, 62);
      ctx.lineTo(0, 138);
      ctx.lineTo(-112, 62);
      ctx.closePath();
      ctx.fill();
      ctx.save();
      ctx.translate(0, -7);
      ctx.fillStyle = selected ? this.palette.cream : this.palette.paper;
      ctx.beginPath();
      ctx.moveTo(-90, -124);
      ctx.lineTo(90, -124);
      ctx.lineTo(105, 56);
      ctx.lineTo(0, 128);
      ctx.lineTo(-105, 56);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = selected ? this.palette.red2 : this.palette.rope;
      ctx.lineWidth = selected ? 7 : 4;
      ctx.stroke();
      ctx.restore();
      this.drawIcon(ctx, upgrade.icon, 0, -16, 52 + Math.sin(this.time * 4 + x) * 3, this.palette.ink);
      for (let i = 0; i < upgrade.max; i += 1) {
        ctx.fillStyle = i < level ? this.palette.red : this.palette.wood2;
        ctx.beginPath();
        ctx.arc((i - (upgrade.max - 1) / 2) * 28, 82, 9, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = this.palette.ink;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      if (chosen) {
        ctx.globalAlpha = 1 - chosenT;
        ctx.strokeStyle = this.palette.red;
        ctx.lineWidth = 12;
        ctx.beginPath();
        ctx.arc(0, -10, 65 + chosenT * 90, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawPause(ctx) {
      ctx.save();
      ctx.fillStyle = 'rgba(20,18,17,0.76)';
      ctx.fillRect(54, 98, W - 108, H - 156);
      this.drawMenuDrum(ctx, 450, 560, 112, 'play', 0, true);
      this.drawMenuDrum(ctx, 145, 1040, 52, 'home', 0, false);
      ctx.restore();
    }

    drawVictory(ctx) {
      ctx.save();
      ctx.translate(450, 420);
      const t = clamp(this.victoryTimer / 1.2, 0, 1);
      ctx.scale(easeOutBack(t), easeOutBack(t));
      ctx.fillStyle = this.palette.cream;
      ctx.beginPath();
      for (let i = 0; i < 24; i += 1) {
        const a = (i / 24) * TAU;
        const r = i % 2 ? 150 : 200;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = this.palette.red2;
      ctx.lineWidth = 12;
      ctx.stroke();
      this.drawKnotStamp(ctx, 0, -28, 65, false, true);
      ctx.fillStyle = this.palette.ink;
      ctx.font = `900 46px ${I18N.fontFamily}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(I18N.formatNumber(Math.round(this.score)), 0, 88);
      ctx.restore();
      this.drawMenuDrum(ctx, 450, 1000, 86, 'home', 0, distance(this.pointer.x, this.pointer.y, 450, 1000) < 105);
      this.drawMenuDrum(ctx, 700, 1020, 58, 'infinity', this.save.bestEndless || 0, distance(this.pointer.x, this.pointer.y, 700, 1020) < 75);
      this.drawStreamers(ctx);
    }

    drawGameover(ctx) {
      ctx.save();
      ctx.translate(450, 420);
      ctx.rotate(-0.06);
      ctx.fillStyle = this.palette.wood2;
      this.roughRectPath(ctx, 420, 300, 733, 10);
      ctx.fill();
      ctx.strokeStyle = this.palette.rope;
      ctx.lineWidth = 8;
      ctx.stroke();
      ctx.fillStyle = this.palette.cream;
      ctx.font = `900 112px ${I18N.fontFamily}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(I18N.formatNumber(this.endlessWave), 0, -35);
      this.drawIcon(ctx, 'infinity', 0, 78, 44, this.palette.gold);
      ctx.restore();
      this.drawMenuDrum(ctx, 450, 970, 88, 'play', 0, distance(this.pointer.x, this.pointer.y, 450, 970) < 105);
      this.drawMenuDrum(ctx, 165, 1040, 52, 'home', 0, distance(this.pointer.x, this.pointer.y, 165, 1040) < 70);
    }

    drawStampNotice(ctx) {
      const n = this.stampNotice;
      const tIn = clamp(n.t / 0.35, 0, 1);
      const tOut = clamp((2.8 - n.t) / 0.5, 0, 1);
      ctx.save();
      ctx.globalAlpha = Math.min(tIn, tOut);
      ctx.translate(760, 210);
      ctx.rotate(-0.08);
      ctx.scale(easeOutBack(tIn), easeOutBack(tIn));
      ctx.fillStyle = this.palette.cream;
      this.roughRectPath(ctx, 180, 130, 919, 7);
      ctx.fill();
      ctx.strokeStyle = this.palette.red2;
      ctx.lineWidth = 7;
      ctx.stroke();
      ctx.fillStyle = this.palette.red;
      ctx.beginPath();
      ctx.arc(0, 0, 40, 0, TAU);
      ctx.fill();
      this.drawIcon(ctx, this.stampIcon(n.id), 0, 0, 24, this.palette.cream);
      ctx.restore();
    }

    drawIcon(ctx, id, x, y, size, color) {
      ctx.save();
      ctx.translate(x, y);
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = Math.max(2, size * 0.14);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      switch (id) {
        case 'play':
          ctx.beginPath();
          ctx.moveTo(-size * 0.42, -size * 0.58);
          ctx.lineTo(size * 0.62, 0);
          ctx.lineTo(-size * 0.42, size * 0.58);
          ctx.closePath();
          ctx.fill();
          break;
        case 'home':
          ctx.beginPath();
          ctx.moveTo(-size * 0.62, -size * 0.05);
          ctx.lineTo(0, -size * 0.62);
          ctx.lineTo(size * 0.62, -size * 0.05);
          ctx.lineTo(size * 0.48, -size * 0.05);
          ctx.lineTo(size * 0.48, size * 0.58);
          ctx.lineTo(-size * 0.48, size * 0.58);
          ctx.lineTo(-size * 0.48, -size * 0.05);
          ctx.closePath();
          ctx.fill();
          break;
        case 'infinity':
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.bezierCurveTo(-size * 0.25, -size * 0.55, -size * 0.75, -size * 0.55, -size * 0.75, 0);
          ctx.bezierCurveTo(-size * 0.75, size * 0.55, -size * 0.25, size * 0.55, 0, 0);
          ctx.bezierCurveTo(size * 0.25, -size * 0.55, size * 0.75, -size * 0.55, size * 0.75, 0);
          ctx.bezierCurveTo(size * 0.75, size * 0.55, size * 0.25, size * 0.55, 0, 0);
          ctx.stroke();
          break;
        case 'gear':
          for (let i = 0; i < 8; i += 1) {
            ctx.save();
            ctx.rotate((i / 8) * TAU);
            ctx.fillRect(-size * 0.11, -size * 0.95, size * 0.22, size * 0.38);
            ctx.restore();
          }
          ctx.beginPath();
          ctx.arc(0, 0, size * 0.58, 0, TAU);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(0, 0, size * 0.22, 0, TAU);
          ctx.fill();
          break;
        case 'language':
          ctx.beginPath();
          ctx.arc(0, 0, size * 0.75, 0, TAU);
          ctx.stroke();
          ctx.beginPath();
          ctx.ellipse(0, 0, size * 0.34, size * 0.75, 0, 0, TAU);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(-size * 0.68, -size * 0.26);
          ctx.quadraticCurveTo(0, -size * 0.05, size * 0.68, -size * 0.26);
          ctx.moveTo(-size * 0.68, size * 0.26);
          ctx.quadraticCurveTo(0, size * 0.05, size * 0.68, size * 0.26);
          ctx.stroke();
          break;
        case 'speaker':
          ctx.beginPath();
          ctx.moveTo(-size * 0.65, -size * 0.25);
          ctx.lineTo(-size * 0.25, -size * 0.25);
          ctx.lineTo(size * 0.2, -size * 0.62);
          ctx.lineTo(size * 0.2, size * 0.62);
          ctx.lineTo(-size * 0.25, size * 0.25);
          ctx.lineTo(-size * 0.65, size * 0.25);
          ctx.closePath();
          ctx.fill();
          ctx.beginPath();
          ctx.arc(size * 0.15, 0, size * 0.45, -0.7, 0.7);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(size * 0.15, 0, size * 0.75, -0.6, 0.6);
          ctx.stroke();
          break;
        case 'music':
          ctx.beginPath();
          ctx.moveTo(-size * 0.15, -size * 0.65);
          ctx.lineTo(size * 0.55, -size * 0.82);
          ctx.lineTo(size * 0.55, size * 0.25);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(-size * 0.32, size * 0.42, size * 0.28, 0, TAU);
          ctx.arc(size * 0.38, size * 0.24, size * 0.28, 0, TAU);
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(-size * 0.15, -size * 0.65);
          ctx.lineTo(-size * 0.15, size * 0.42);
          ctx.moveTo(-size * 0.15, -size * 0.35);
          ctx.lineTo(size * 0.55, -size * 0.52);
          ctx.stroke();
          break;
        case 'shake':
          ctx.strokeRect(-size * 0.55, -size * 0.42, size * 1.1, size * 0.84);
          ctx.beginPath();
          ctx.moveTo(-size * 0.9, -size * 0.25);
          ctx.lineTo(-size * 0.7, 0);
          ctx.lineTo(-size * 0.9, size * 0.25);
          ctx.moveTo(size * 0.9, -size * 0.25);
          ctx.lineTo(size * 0.7, 0);
          ctx.lineTo(size * 0.9, size * 0.25);
          ctx.stroke();
          break;
        case 'motion':
          ctx.beginPath();
          ctx.arc(0, 0, size * 0.65, 0.3, 5.5);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(size * 0.45, -size * 0.55);
          ctx.lineTo(size * 0.78, -size * 0.45);
          ctx.lineTo(size * 0.63, -size * 0.18);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(0, 0, size * 0.22, 0, TAU);
          ctx.fill();
          break;
        case 'contrast':
          ctx.beginPath();
          ctx.arc(0, 0, size * 0.72, 0, TAU);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(0, 0, size * 0.64, Math.PI / 2, -Math.PI / 2);
          ctx.closePath();
          ctx.fill();
          break;
        case 'fullscreen':
          ctx.beginPath();
          ctx.moveTo(-size * 0.7, -size * 0.2);
          ctx.lineTo(-size * 0.7, -size * 0.7);
          ctx.lineTo(-size * 0.2, -size * 0.7);
          ctx.moveTo(size * 0.2, -size * 0.7);
          ctx.lineTo(size * 0.7, -size * 0.7);
          ctx.lineTo(size * 0.7, -size * 0.2);
          ctx.moveTo(size * 0.7, size * 0.2);
          ctx.lineTo(size * 0.7, size * 0.7);
          ctx.lineTo(size * 0.2, size * 0.7);
          ctx.moveTo(-size * 0.2, size * 0.7);
          ctx.lineTo(-size * 0.7, size * 0.7);
          ctx.lineTo(-size * 0.7, size * 0.2);
          ctx.stroke();
          break;
        case 'paddle':
        case 'wide':
          ctx.fillRect(-size * 0.78, -size * 0.16, size * 1.56, size * 0.32);
          ctx.beginPath();
          ctx.arc(-size * 0.48, size * 0.34, size * 0.17, 0, TAU);
          ctx.arc(size * 0.48, size * 0.34, size * 0.17, 0, TAU);
          ctx.fill();
          break;
        case 'target':
          ctx.beginPath();
          ctx.arc(0, 0, size * 0.72, 0, TAU);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(0, 0, size * 0.34, 0, TAU);
          ctx.fill();
          break;
        case 'pierce':
        case 'charge':
          ctx.beginPath();
          ctx.moveTo(-size * 0.78, 0);
          ctx.lineTo(size * 0.45, 0);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(size * 0.2, -size * 0.38);
          ctx.lineTo(size * 0.78, 0);
          ctx.lineTo(size * 0.2, size * 0.38);
          ctx.closePath();
          ctx.fill();
          ctx.beginPath();
          ctx.arc(-size * 0.45, 0, size * 0.25, 0, TAU);
          ctx.fill();
          break;
        case 'bomb':
          ctx.beginPath();
          ctx.arc(0, size * 0.08, size * 0.55, 0, TAU);
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(size * 0.25, -size * 0.42);
          ctx.quadraticCurveTo(size * 0.55, -size * 0.8, size * 0.72, -size * 0.48);
          ctx.stroke();
          break;
        case 'drum':
          ctx.beginPath();
          ctx.arc(0, 0, size * 0.65, 0, TAU);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(0, 0, size * 0.25, 0, TAU);
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(-size * 0.58, -size * 0.58);
          ctx.lineTo(size * 0.58, size * 0.58);
          ctx.moveTo(size * 0.58, -size * 0.58);
          ctx.lineTo(-size * 0.58, size * 0.58);
          ctx.stroke();
          break;
        case 'multi':
          ctx.beginPath();
          ctx.arc(-size * 0.42, 0, size * 0.3, 0, TAU);
          ctx.arc(size * 0.42, 0, size * 0.3, 0, TAU);
          ctx.arc(0, -size * 0.43, size * 0.3, 0, TAU);
          ctx.fill();
          break;
        case 'bead':
          ctx.beginPath();
          ctx.arc(0, 0, size * 0.58, 0, TAU);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(-size * 0.2, -size * 0.2, size * 0.12, 0, TAU);
          ctx.fillStyle = this.palette ? this.palette.cream : '#fff';
          ctx.fill();
          break;
        case 'shield':
          ctx.beginPath();
          ctx.moveTo(0, -size * 0.72);
          ctx.lineTo(size * 0.62, -size * 0.42);
          ctx.lineTo(size * 0.48, size * 0.35);
          ctx.lineTo(0, size * 0.76);
          ctx.lineTo(-size * 0.48, size * 0.35);
          ctx.lineTo(-size * 0.62, -size * 0.42);
          ctx.closePath();
          ctx.fill();
          break;
        case 'scrap':
          for (let i = 0; i < 4; i += 1) {
            ctx.save();
            ctx.rotate((i / 4) * TAU + this.time * 0.4);
            ctx.fillRect(size * 0.22, -size * 0.12, size * 0.48, size * 0.24);
            ctx.restore();
          }
          ctx.beginPath();
          ctx.arc(0, 0, size * 0.22, 0, TAU);
          ctx.fill();
          break;
        default:
          ctx.beginPath();
          ctx.arc(0, 0, size * 0.55, 0, TAU);
          ctx.fill();
          break;
      }
      ctx.restore();
    }

    setStatus(key, params) {
      this.currentStatus = { key, params: params || {} };
      this.renderStatus();
    }

    renderStatus() {
      if (!this.statusEl || !this.currentStatus) return;
      this.statusEl.textContent = I18N.t(this.currentStatus.key, this.currentStatus.params);
    }

    debugSnapshot() {
      return {
        state: this.state,
        mode: this.mode,
        score: Math.round(this.score || 0),
        stageIndex: this.stageIndex,
        endlessWave: this.endlessWave,
        balls: this.balls ? this.balls.length : 0,
        bricks: this.bricks ? this.bricks.filter((b) => !b.destroyed).length : 0,
        required: this.bricks ? this.requiredRemaining() : 0,
        audioReady: !!this.audio.ready,
        locale: I18N.locale,
        assist: this.assist || 0,
        skillEstimate: this.skillEstimate || 0
      };
    }
  }

  TD.Game = Game;
})();
