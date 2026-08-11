(() => {
  'use strict';

  const W = 540;
  const H = 960;
  const TAU = Math.PI * 2;
  const FIXED_DT = 1 / 60;
  const SAVE_KEY = 'neon-overdrive-save-v1';

  const COLORS = {
    cyan: '#00f7ff',
    cyanSoft: '#76fbff',
    pink: '#ff2bd6',
    pinkSoft: '#ff86e9',
    violet: '#8062ff',
    gold: '#ffd95a',
    red: '#ff355e',
    orange: '#ff8a4c',
    green: '#5bffb0',
    white: '#f7fbff',
    blue: '#4b80ff',
    ink: '#05040d'
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const invLerp = (a, b, v) => clamp((v - a) / (b - a), 0, 1);
  const rand = (min = 0, max = 1) => min + Math.random() * (max - min);
  const randInt = (min, max) => Math.floor(rand(min, max + 1));
  const chance = (p) => Math.random() < p;
  const sqr = (v) => v * v;
  const dist2 = (ax, ay, bx, by) => sqr(ax - bx) + sqr(ay - by);
  const angleTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
  const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const easeInOutCubic = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const formatScore = (score) => Math.max(0, Math.floor(score)).toString().padStart(9, '0');
  const colorWithAlpha = (hex, alpha) => {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    const n = parseInt(full, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  };

  function loadSave() {
    const fallback = {
      best: { story: 0, rush: 0, endless: 0 },
      unlockedEndless: false,
      settings: {
        master: 0.82,
        music: 0.72,
        fxDensity: 1,
        screenShake: true,
        flashes: true,
        showHitbox: false,
        autoGuard: true
      }
    };
    try {
      const parsed = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (!parsed) return fallback;
      return {
        best: { ...fallback.best, ...(parsed.best || {}) },
        unlockedEndless: Boolean(parsed.unlockedEndless),
        settings: { ...fallback.settings, ...(parsed.settings || {}) }
      };
    } catch {
      return fallback;
    }
  }

  function persistSave(save) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    } catch {
      // Storage can be disabled in privacy modes. The game remains fully playable.
    }
  }

  class Input {
    constructor(canvas) {
      this.canvas = canvas;
      this.keys = new Set();
      this.pressed = new Set();
      this.released = new Set();
      this.pointer = {
        x: W / 2,
        y: H * 0.8,
        active: false,
        inside: false,
        moved: false,
        type: 'mouse',
        id: null,
        offsetX: 0,
        offsetY: 0
      };
      this.actionPulse = false;
      this.lastDevice = 'keyboard';
      this.gamepad = { x: 0, y: 0, focus: false, action: false, pause: false };
      this.prevGamepad = { action: false, pause: false };
      this.bind();
    }

    bind() {
      window.addEventListener('keydown', (event) => {
        const code = event.code;
        const target = event.target instanceof HTMLElement ? event.target : null;
        const interactive = Boolean(target?.closest('button, input, select, textarea'));
        if (interactive && code !== 'Escape') return;
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code)) {
          event.preventDefault();
        }
        if (!this.keys.has(code)) this.pressed.add(code);
        this.keys.add(code);
        this.lastDevice = 'keyboard';
      }, { passive: false });

      window.addEventListener('keyup', (event) => {
        this.keys.delete(event.code);
        this.released.add(event.code);
      });

      window.addEventListener('blur', () => {
        this.keys.clear();
        this.pressed.clear();
        this.released.clear();
        this.pointer.active = false;
      });

      const updatePointer = (event) => {
        const rect = this.canvas.getBoundingClientRect();
        this.pointer.x = clamp((event.clientX - rect.left) / rect.width * W, 0, W);
        this.pointer.y = clamp((event.clientY - rect.top) / rect.height * H, 0, H);
        this.pointer.type = event.pointerType || 'mouse';
        this.pointer.inside = true;
        this.pointer.moved = true;
        this.lastDevice = this.pointer.type === 'touch' ? 'touch' : 'mouse';
      };

      this.canvas.addEventListener('pointerenter', (event) => {
        updatePointer(event);
        this.pointer.inside = true;
      });
      this.canvas.addEventListener('pointerleave', () => {
        if (!this.pointer.active) this.pointer.inside = false;
      });
      this.canvas.addEventListener('pointermove', updatePointer, { passive: true });
      this.canvas.addEventListener('pointerdown', (event) => {
        updatePointer(event);
        this.pointer.active = true;
        this.pointer.id = event.pointerId;
        this.canvas.setPointerCapture?.(event.pointerId);
        if (event.button === 2) this.keys.add('ShiftRight');
      });
      this.canvas.addEventListener('pointerup', (event) => {
        updatePointer(event);
        this.pointer.active = false;
        if (event.button === 0 && this.pointer.type !== 'touch') this.actionPulse = true;
        if (event.button === 2) this.keys.delete('ShiftRight');
        if (this.pointer.id === event.pointerId) this.pointer.id = null;
      });
      this.canvas.addEventListener('pointercancel', () => {
        this.pointer.active = false;
        this.pointer.id = null;
      });
      this.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    }

    consume(code) {
      if (this.pressed.has(code)) {
        this.pressed.delete(code);
        return true;
      }
      return false;
    }

    consumeAny(codes) {
      for (const code of codes) {
        if (this.consume(code)) return true;
      }
      return false;
    }

    consumeAction() {
      if (this.actionPulse) {
        this.actionPulse = false;
        return true;
      }
      if (this.consumeAny(['Space', 'Enter', 'KeyZ'])) return true;
      if (this.gamepad.action && !this.prevGamepad.action) return true;
      return false;
    }

    consumePause() {
      if (this.consumeAny(['Escape', 'KeyP'])) return true;
      if (this.gamepad.pause && !this.prevGamepad.pause) return true;
      return false;
    }

    isFocus() {
      return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.keys.has('KeyX') || this.gamepad.focus;
    }

    keyboardVector() {
      let x = 0;
      let y = 0;
      if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) x -= 1;
      if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) x += 1;
      if (this.keys.has('ArrowUp') || this.keys.has('KeyW')) y -= 1;
      if (this.keys.has('ArrowDown') || this.keys.has('KeyS')) y += 1;
      if (x || y) {
        const len = Math.hypot(x, y) || 1;
        x /= len;
        y /= len;
        this.lastDevice = 'keyboard';
      }
      return { x, y };
    }

    pollGamepad() {
      this.prevGamepad.action = this.gamepad.action;
      this.prevGamepad.pause = this.gamepad.pause;
      const pads = navigator.getGamepads?.() || [];
      const pad = [...pads].find(Boolean);
      if (!pad) {
        this.gamepad.x = 0;
        this.gamepad.y = 0;
        this.gamepad.focus = false;
        this.gamepad.action = false;
        this.gamepad.pause = false;
        return;
      }
      const dead = 0.18;
      const axisX = Math.abs(pad.axes[0] || 0) > dead ? pad.axes[0] : 0;
      const axisY = Math.abs(pad.axes[1] || 0) > dead ? pad.axes[1] : 0;
      const dpadX = (pad.buttons[15]?.pressed ? 1 : 0) - (pad.buttons[14]?.pressed ? 1 : 0);
      const dpadY = (pad.buttons[13]?.pressed ? 1 : 0) - (pad.buttons[12]?.pressed ? 1 : 0);
      this.gamepad.x = clamp(axisX + dpadX, -1, 1);
      this.gamepad.y = clamp(axisY + dpadY, -1, 1);
      this.gamepad.focus = Boolean(pad.buttons[4]?.pressed || pad.buttons[6]?.pressed);
      this.gamepad.action = Boolean(pad.buttons[0]?.pressed || pad.buttons[7]?.pressed);
      this.gamepad.pause = Boolean(pad.buttons[9]?.pressed);
      if (Math.abs(this.gamepad.x) + Math.abs(this.gamepad.y) > 0.1 || this.gamepad.action) {
        this.lastDevice = 'gamepad';
      }
    }

    gamepadVector() {
      let { x, y } = this.gamepad;
      const len = Math.hypot(x, y);
      if (len > 1) {
        x /= len;
        y /= len;
      }
      return { x, y };
    }

    endFrame() {
      this.released.clear();
      this.pointer.moved = false;
    }
  }

  class AudioEngine {
    constructor(save) {
      this.settings = save.settings;
      this.ctx = null;
      this.master = null;
      this.musicGain = null;
      this.sfxGain = null;
      this.compressor = null;
      this.noiseBuffer = null;
      this.started = false;
      this.musicActive = false;
      this.schedulerId = null;
      this.nextStepTime = 0;
      this.step = 0;
      this.bpm = 150;
      this.stage = 0;
      this.intensity = 0.25;
      this.overdrive = false;
      this.lastGraze = 0;
      this.lastShotAccent = 0;
      this.rootSets = [
        [55, 65.41, 73.42, 82.41, 98],
        [49, 58.27, 65.41, 73.42, 87.31],
        [46.25, 55, 61.74, 69.3, 82.41]
      ];
    }

    async unlock() {
      if (!this.ctx) this.init();
      if (this.ctx.state === 'suspended') {
        try { await this.ctx.resume(); } catch { /* ignored */ }
      }
      this.started = true;
      if (!this.schedulerId) {
        this.nextStepTime = this.ctx.currentTime + 0.06;
        this.schedulerId = window.setInterval(() => this.scheduler(), 35);
      }
    }

    init() {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx({ latencyHint: 'interactive' });
      this.master = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -12;
      this.compressor.knee.value = 14;
      this.compressor.ratio.value = 8;
      this.compressor.attack.value = 0.002;
      this.compressor.release.value = 0.18;
      this.musicGain.connect(this.compressor);
      this.sfxGain.connect(this.compressor);
      this.compressor.connect(this.master);
      this.master.connect(this.ctx.destination);
      this.applySettings();
      this.noiseBuffer = this.makeNoiseBuffer();
    }

    makeNoiseBuffer() {
      const length = Math.floor(this.ctx.sampleRate * 1.2);
      const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < length; i += 1) {
        const white = Math.random() * 2 - 1;
        last = last * 0.82 + white * 0.18;
        data[i] = last;
      }
      return buffer;
    }

    applySettings() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.master.gain.setTargetAtTime(this.settings.master, t, 0.02);
      this.musicGain.gain.setTargetAtTime(this.settings.music * 0.42, t, 0.03);
      this.sfxGain.gain.setTargetAtTime(0.72, t, 0.03);
    }

    setMusicActive(active) {
      this.musicActive = active;
    }

    setStage(stage) {
      this.stage = clamp(stage, 0, 2);
    }

    setIntensity(value, overdrive = false) {
      this.intensity = clamp(value, 0, 1);
      this.overdrive = overdrive;
    }

    scheduler() {
      if (!this.ctx || !this.started) return;
      const secondsPerBeat = 60 / this.bpm;
      const stepDuration = secondsPerBeat / 4;
      while (this.nextStepTime < this.ctx.currentTime + 0.14) {
        this.scheduleStep(this.step, this.nextStepTime, stepDuration);
        this.nextStepTime += stepDuration;
        this.step = (this.step + 1) % 64;
      }
    }

    scheduleStep(step, time, stepDuration) {
      if (!this.musicActive) {
        if (step % 16 === 0) {
          const roots = this.rootSets[this.stage];
          this.tone(roots[0] * 2, time, 0.55, 0.015, 'sine', this.musicGain, 0.004, 0.5);
          this.tone(roots[2] * 2, time + 0.09, 0.4, 0.008, 'sine', this.musicGain, 0.004, 0.4);
        }
        return;
      }

      const local = step % 16;
      const roots = this.rootSets[this.stage];
      const intensity = this.intensity;
      const bassPattern = [0, null, null, 0, 2, null, 1, null, 0, null, 3, null, 2, null, 4, null];
      const arpPattern = [0, 2, 4, 1, 3, 4, 2, 1, 0, 3, 4, 2, 1, 4, 3, 2];

      if ([0, 4, 8, 12].includes(local)) this.kick(time, 0.16 + intensity * 0.08);
      if ([4, 12].includes(local)) this.snare(time, 0.08 + intensity * 0.055);
      if (local % 2 === 0 || intensity > 0.62) this.hat(time, 0.018 + intensity * 0.018, local % 4 === 2);

      const bassNote = bassPattern[local];
      if (bassNote !== null) {
        const f = roots[bassNote] * (this.overdrive ? 2 : 1);
        this.tone(f, time, stepDuration * 1.9, 0.035 + intensity * 0.025, 'sawtooth', this.musicGain, 0.002, 0.08);
      }

      if (intensity > 0.32 && (local % 2 === 1 || this.overdrive)) {
        const octave = this.overdrive ? 8 : 4;
        const f = roots[arpPattern[local]] * octave;
        this.tone(f, time, stepDuration * 0.8, 0.008 + intensity * 0.012, local % 4 === 1 ? 'square' : 'triangle', this.musicGain, 0.002, 0.06);
      }

      if (this.overdrive && local % 4 === 0) {
        this.tone(roots[(local / 4) % roots.length] * 8, time + 0.025, stepDuration * 2.2, 0.018, 'sine', this.musicGain, 0.002, 0.12);
      }
    }

    tone(freq, time, duration, gainValue, type = 'sine', destination = this.sfxGain, attack = 0.004, release = 0.08, detune = 0) {
      if (!this.ctx || !destination) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(Math.max(20, freq), time);
      osc.detune.setValueAtTime(detune, time);
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, gainValue), time + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + duration + release);
      osc.connect(gain);
      gain.connect(destination);
      osc.start(time);
      osc.stop(time + duration + release + 0.02);
    }

    noise(time, duration, gainValue, highpass = 1000, destination = this.sfxGain) {
      if (!this.ctx || !this.noiseBuffer || !destination) return;
      const source = this.ctx.createBufferSource();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();
      source.buffer = this.noiseBuffer;
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(highpass, time);
      gain.gain.setValueAtTime(Math.max(0.0002, gainValue), time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(destination);
      source.start(time);
      source.stop(time + duration + 0.02);
    }

    kick(time, amount) {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(125, time);
      osc.frequency.exponentialRampToValueAtTime(42, time + 0.12);
      gain.gain.setValueAtTime(amount, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.16);
      osc.connect(gain);
      gain.connect(this.musicGain);
      osc.start(time);
      osc.stop(time + 0.18);
    }

    snare(time, amount) {
      this.noise(time, 0.11, amount, 900, this.musicGain);
      this.tone(185, time, 0.05, amount * 0.25, 'triangle', this.musicGain, 0.001, 0.06);
    }

    hat(time, amount, open) {
      this.noise(time, open ? 0.08 : 0.026, amount, 5200, this.musicGain);
    }

    sfx(name, value = 1) {
      if (!this.ctx || !this.started) return;
      const t = this.ctx.currentTime;
      switch (name) {
        case 'select':
          this.tone(440, t, 0.03, 0.045 * value, 'square', this.sfxGain, 0.001, 0.04);
          this.tone(880, t + 0.035, 0.05, 0.035 * value, 'sine', this.sfxGain, 0.001, 0.06);
          break;
        case 'graze':
          if (t - this.lastGraze < 0.045) break;
          this.lastGraze = t;
          this.tone(1100 + rand(-90, 140), t, 0.025, 0.026 * value, 'sine', this.sfxGain, 0.001, 0.035);
          break;
        case 'kill':
          this.noise(t, 0.06, 0.05 * value, 1500, this.sfxGain);
          this.tone(110 + rand(-8, 18), t, 0.05, 0.05 * value, 'sawtooth', this.sfxGain, 0.001, 0.07);
          break;
        case 'bigKill':
          this.noise(t, 0.16, 0.13 * value, 350, this.sfxGain);
          this.tone(86, t, 0.14, 0.11 * value, 'sawtooth', this.sfxGain, 0.002, 0.18);
          this.tone(172, t + 0.025, 0.1, 0.06 * value, 'square', this.sfxGain, 0.002, 0.14);
          break;
        case 'driveReady':
          this.tone(330, t, 0.12, 0.07, 'sine', this.sfxGain, 0.003, 0.08);
          this.tone(660, t + 0.08, 0.12, 0.08, 'sine', this.sfxGain, 0.003, 0.1);
          this.tone(1320, t + 0.16, 0.18, 0.07, 'triangle', this.sfxGain, 0.003, 0.16);
          break;
        case 'drive':
          this.noise(t, 0.42, 0.22, 180, this.sfxGain);
          for (let i = 0; i < 7; i += 1) {
            this.tone(82.4 * Math.pow(2, i / 7), t + i * 0.035, 0.22, 0.07, i % 2 ? 'square' : 'sawtooth', this.sfxGain, 0.002, 0.18);
          }
          break;
        case 'pulse':
          this.noise(t, 0.2, 0.12, 350, this.sfxGain);
          this.tone(120, t, 0.17, 0.1, 'sine', this.sfxGain, 0.001, 0.18);
          this.tone(480, t, 0.09, 0.05, 'triangle', this.sfxGain, 0.001, 0.12);
          break;
        case 'hit':
          this.noise(t, 0.32, 0.21, 120, this.sfxGain);
          this.tone(72, t, 0.28, 0.19, 'sawtooth', this.sfxGain, 0.002, 0.25);
          break;
        case 'phase':
          this.tone(220, t, 0.1, 0.08, 'square', this.sfxGain, 0.001, 0.08);
          this.tone(440, t + 0.08, 0.12, 0.08, 'square', this.sfxGain, 0.001, 0.1);
          this.tone(880, t + 0.16, 0.2, 0.09, 'sine', this.sfxGain, 0.002, 0.2);
          break;
        case 'warning':
          this.tone(196, t, 0.11, 0.08, 'square', this.sfxGain, 0.001, 0.04);
          this.tone(196, t + 0.18, 0.11, 0.08, 'square', this.sfxGain, 0.001, 0.04);
          break;
        case 'shotAccent':
          if (t - this.lastShotAccent < 0.12) break;
          this.lastShotAccent = t;
          this.tone(780, t, 0.018, 0.018, 'square', this.sfxGain, 0.001, 0.025);
          break;
        case 'victory':
          [0, 4, 7, 12].forEach((semi, i) => {
            this.tone(220 * Math.pow(2, semi / 12), t + i * 0.12, 0.3, 0.09, 'triangle', this.sfxGain, 0.004, 0.24);
          });
          break;
        default:
          break;
      }
    }
  }

  class SpriteBank {
    constructor() {
      this.bullets = new Map();
      this.pickups = new Map();
      const colors = Object.values(COLORS);
      for (const color of colors) {
        for (const shape of ['orb', 'needle', 'diamond', 'star']) {
          this.bullets.set(`${color}-${shape}`, this.makeBullet(color, shape));
        }
      }
      this.pickups.set('score', this.makePickup(COLORS.gold));
      this.pickups.set('drive', this.makePickup(COLORS.cyan));
    }

    makeBullet(color, shape) {
      const canvas = document.createElement('canvas');
      canvas.width = 48;
      canvas.height = 48;
      const ctx = canvas.getContext('2d');
      ctx.translate(24, 24);
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.fillStyle = color;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.1;
      ctx.globalCompositeOperation = 'lighter';

      if (shape === 'needle') {
        ctx.beginPath();
        ctx.moveTo(0, -16);
        ctx.quadraticCurveTo(7, -3, 0, 15);
        ctx.quadraticCurveTo(-7, -3, 0, -16);
        ctx.fill();
        ctx.globalAlpha = 0.7;
        ctx.stroke();
      } else if (shape === 'diamond') {
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-7, -7, 14, 14);
        ctx.globalAlpha = 0.66;
        ctx.strokeRect(-6.5, -6.5, 13, 13);
      } else if (shape === 'star') {
        ctx.beginPath();
        for (let i = 0; i < 10; i += 1) {
          const a = -Math.PI / 2 + i * Math.PI / 5;
          const r = i % 2 === 0 ? 14 : 5.5;
          const x = Math.cos(a) * r;
          const y = Math.sin(a) * r;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 0.72;
        ctx.stroke();
      } else {
        const grad = ctx.createRadialGradient(-3, -4, 1, 0, 0, 13);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.22, color);
        grad.addColorStop(1, colorWithAlpha(color, 0.06));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, 13, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.arc(0, 0, 8.5, 0, TAU);
        ctx.stroke();
      }
      return canvas;
    }

    makePickup(color) {
      const canvas = document.createElement('canvas');
      canvas.width = 40;
      canvas.height = 40;
      const ctx = canvas.getContext('2d');
      ctx.translate(20, 20);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = color;
      ctx.strokeStyle = '#ffffff';
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillRect(-7, -7, 14, 14);
      ctx.globalAlpha = 0.7;
      ctx.strokeRect(-5, -5, 10, 10);
      return canvas;
    }
  }

  const UPGRADES = [
    {
      id: 'voltage', name: '高压狂热', icon: '⚡', accent: COLORS.cyan,
      desc: '主炮射速提高 22%，火力反馈更密集。', max: 4,
      apply: (mods) => { mods.fireRate *= 1.22; }
    },
    {
      id: 'satellite', name: '伴飞星群', icon: '✦', accent: COLORS.violet,
      desc: '增加一枚伴飞炮；最多形成六机齐射。', max: 4,
      apply: (mods) => { mods.drones = Math.min(6, mods.drones + 1); }
    },
    {
      id: 'echo', name: '余响延长', icon: '∞', accent: COLORS.pink,
      desc: 'OVERDRIVE 持续时间增加 1.6 秒。', max: 3,
      apply: (mods) => { mods.overdriveDuration += 1.6; }
    },
    {
      id: 'magnet', name: '危险磁场', icon: '◎', accent: COLORS.green,
      desc: '擦弹范围与充能效率提高，危险更容易变成资源。', max: 3,
      apply: (mods) => { mods.grazeRadius += 4; mods.grazeGain *= 1.2; }
    },
    {
      id: 'nova', name: '终幕新星', icon: '☼', accent: COLORS.gold,
      desc: '超载结束时追加全屏伤害与二次爆炸。', max: 3,
      apply: (mods) => { mods.nova += 1; }
    },
    {
      id: 'armor', name: '复合护层', icon: '⬡', accent: COLORS.cyanSoft,
      desc: '最大护盾 +1，并立即补满一格。', max: 2,
      apply: (mods, game) => {
        mods.maxShieldBonus += 1;
        game.maxShield += 1;
        game.shield = Math.min(game.maxShield, game.shield + 1);
      }
    },
    {
      id: 'hunter', name: '贴脸猎杀', icon: '➤', accent: COLORS.red,
      desc: '近距离攻击与 RUSH 结算大幅强化。', max: 3,
      apply: (mods) => { mods.closeDamage += 0.24; mods.rushScore += 0.3; }
    },
    {
      id: 'recycler', name: '保险回收', icon: '⟳', accent: COLORS.orange,
      desc: '自动保险消耗降低，并扩大紧急清弹范围。', max: 3,
      apply: (mods) => { mods.guardCost = Math.max(18, mods.guardCost - 5); mods.guardRadius += 22; }
    },
    {
      id: 'chain', name: '连锁锁存', icon: '⌁', accent: COLORS.pinkSoft,
      desc: 'CHAIN 衰减减慢 28%，失误后的保留量提高。', max: 3,
      apply: (mods) => { mods.chainDecay *= 0.72; mods.chainRetention += 0.08; }
    },
    {
      id: 'missile', name: '追迹饱和', icon: '⌖', accent: COLORS.gold,
      desc: '追踪弹发射频率与爆炸范围提高。', max: 3,
      apply: (mods) => { mods.missileRate *= 1.28; mods.missilePower *= 1.18; }
    },
    {
      id: 'arc', name: '擦弹电弧', icon: 'ϟ', accent: COLORS.violet,
      desc: '连续擦弹会向最近敌人释放自动电弧。', max: 3,
      apply: (mods) => { mods.arcLevel += 1; }
    },
    {
      id: 'mercy', name: '重启协议', icon: '✚', accent: COLORS.green,
      desc: '每幕首次真实受击无损，并触发大范围反击。', max: 1,
      apply: (mods) => { mods.freeGuard = true; }
    }
  ];

  class StageDirector {
    constructor(game) {
      this.game = game;
      this.time = 0;
      this.events = [];
      this.index = 0;
      this.bossAt = 50;
      this.bossSpawned = false;
      this.endlessClock = 0;
      this.endlessWave = 0;
    }

    start(stage) {
      this.time = 0;
      this.index = 0;
      this.bossSpawned = false;
      this.events = this.buildStage(stage);
      this.bossAt = [52, 60, 70][stage] || 58;
      this.endlessClock = 0;
    }

    at(events, t, fn) {
      events.push({ t, fn });
    }

    repeat(events, start, count, interval, fn) {
      for (let i = 0; i < count; i += 1) this.at(events, start + i * interval, () => fn(i));
    }

    buildStage(stage) {
      const e = [];
      const g = this.game;
      if (stage === 0) {
        this.repeat(e, 1.2, 6, 0.42, (i) => g.spawnEnemy('scout', {
          x: i % 2 ? 70 : W - 70, y: -30, originX: i % 2 ? 70 : W - 70,
          amp: 64, phase: i * 0.7, speed: 105, color: i % 2 ? COLORS.cyan : COLORS.pink
        }));
        this.repeat(e, 5.2, 8, 0.28, (i) => g.spawnEnemy('scout', {
          x: 54 + i * 60, y: -25 - (i % 2) * 20, originX: 54 + i * 60,
          amp: 24, phase: i, speed: 125, fireDelay: 0.7 + i * 0.08
        }));
        this.repeat(e, 9.2, 3, 1.2, (i) => g.spawnEnemy('spinner', {
          x: 135 + i * 135, y: -40, targetY: 150 + (i % 2) * 55, phase: i * 1.7
        }));
        this.repeat(e, 14.0, 10, 0.33, (i) => g.spawnEnemy('diver', {
          x: i % 2 ? -35 : W + 35, y: 90 + (i % 5) * 72, side: i % 2 ? 1 : -1, phase: i
        }));
        this.at(e, 19.0, () => g.spawnEnemy('carrier', { x: W / 2, y: -70, targetY: 180 }));
        this.repeat(e, 20.3, 8, 0.46, (i) => g.spawnEnemy('scout', {
          x: 45 + (i % 4) * 150, y: -30 - Math.floor(i / 4) * 55,
          originX: 45 + (i % 4) * 150, amp: 50, phase: i * 0.6, speed: 115
        }));
        this.repeat(e, 27.0, 4, 1.0, (i) => g.spawnEnemy('turret', {
          x: i % 2 ? 115 : W - 115, y: -45, targetY: 130 + (i % 2) * 170, phase: i
        }));
        this.repeat(e, 32.3, 12, 0.24, (i) => g.spawnEnemy('scout', {
          x: i % 2 ? 35 : W - 35, y: -20 - (i % 3) * 20,
          originX: i % 2 ? 35 : W - 35, amp: 155, phase: i * 0.32, speed: 150
        }));
        this.at(e, 37.0, () => g.spawnEnemy('elite', { x: W / 2, y: -70, targetY: 210, phase: 0 }));
        this.repeat(e, 39.0, 8, 0.5, (i) => g.spawnEnemy('diver', {
          x: i % 2 ? -30 : W + 30, y: 80 + (i % 4) * 115, side: i % 2 ? 1 : -1, phase: i * 0.7
        }));
        this.repeat(e, 45.0, 3, 0.95, (i) => g.spawnEnemy('spinner', {
          x: 105 + i * 165, y: -42, targetY: 125 + i * 62, phase: i * 2
        }));
      } else if (stage === 1) {
        this.repeat(e, 1.0, 12, 0.28, (i) => g.spawnEnemy('scout', {
          x: 30 + (i % 6) * 96, y: -30 - Math.floor(i / 6) * 70,
          originX: 30 + (i % 6) * 96, amp: 36, phase: i * 0.9, speed: 142
        }));
        this.repeat(e, 5.3, 4, 0.92, (i) => g.spawnEnemy('orbiter', {
          x: i % 2 ? -35 : W + 35, y: 160 + (i % 2) * 120, side: i % 2 ? 1 : -1, phase: i * 1.4
        }));
        this.repeat(e, 10.0, 6, 0.72, (i) => g.spawnEnemy('turret', {
          x: 75 + (i % 3) * 195, y: -50 - Math.floor(i / 3) * 80,
          targetY: 110 + (i % 3) * 90, phase: i * 0.8
        }));
        this.at(e, 16.0, () => g.spawnEnemy('carrier', { x: 145, y: -70, targetY: 185, phase: 1 }));
        this.at(e, 17.1, () => g.spawnEnemy('carrier', { x: W - 145, y: -70, targetY: 240, phase: 2 }));
        this.repeat(e, 21.5, 14, 0.25, (i) => g.spawnEnemy('diver', {
          x: i % 2 ? -35 : W + 35, y: 70 + (i % 7) * 78,
          side: i % 2 ? 1 : -1, phase: i * 0.45, mirror: true
        }));
        this.repeat(e, 27.5, 5, 0.85, (i) => g.spawnEnemy('spinner', {
          x: 75 + i * 97, y: -45, targetY: 125 + Math.sin(i) * 55, phase: i * 1.1, splitShots: true
        }));
        this.at(e, 34.0, () => g.spawnEnemy('elite', { x: 150, y: -65, targetY: 180, phase: 2 }));
        this.at(e, 34.7, () => g.spawnEnemy('elite', { x: W - 150, y: -65, targetY: 245, phase: 3 }));
        this.repeat(e, 39.5, 16, 0.26, (i) => g.spawnEnemy('scout', {
          x: 40 + (i % 8) * 66, y: -25 - Math.floor(i / 8) * 55,
          originX: 40 + (i % 8) * 66, amp: 92, phase: i * 0.5, speed: 165, revenge: true
        }));
        this.repeat(e, 45.5, 6, 0.8, (i) => g.spawnEnemy(i % 2 ? 'turret' : 'orbiter', {
          x: i % 2 ? 90 : W - 90, y: -45, targetY: 120 + (i % 3) * 135,
          side: i % 2 ? 1 : -1, phase: i
        }));
        this.at(e, 52.0, () => g.spawnEnemy('carrier', { x: W / 2, y: -80, targetY: 200, phase: 4, armored: true }));
      } else {
        this.repeat(e, 0.9, 18, 0.22, (i) => g.spawnEnemy('scout', {
          x: 25 + (i % 9) * 61, y: -25 - Math.floor(i / 9) * 60,
          originX: 25 + (i % 9) * 61, amp: 82, phase: i * 0.52, speed: 175, revenge: true
        }));
        this.repeat(e, 6.2, 8, 0.64, (i) => g.spawnEnemy('orbiter', {
          x: i % 2 ? -40 : W + 40, y: 95 + (i % 4) * 120,
          side: i % 2 ? 1 : -1, phase: i * 0.9, revenge: true
        }));
        this.repeat(e, 12.0, 6, 0.76, (i) => g.spawnEnemy('spinner', {
          x: 55 + i * 86, y: -45, targetY: 100 + (i % 3) * 90,
          phase: i * 1.6, splitShots: true, revenge: true
        }));
        this.at(e, 18.0, () => g.spawnEnemy('elite', { x: W / 2, y: -80, targetY: 170, phase: 5, armored: true }));
        this.repeat(e, 20.0, 16, 0.25, (i) => g.spawnEnemy('diver', {
          x: i % 2 ? -38 : W + 38, y: 60 + (i % 8) * 82,
          side: i % 2 ? 1 : -1, phase: i * 0.61, mirror: true, revenge: true
        }));
        this.at(e, 27.5, () => g.spawnEnemy('carrier', { x: 130, y: -80, targetY: 175, phase: 5, armored: true }));
        this.at(e, 28.2, () => g.spawnEnemy('carrier', { x: W - 130, y: -80, targetY: 240, phase: 6, armored: true }));
        this.repeat(e, 34.0, 10, 0.48, (i) => g.spawnEnemy('turret', {
          x: i % 2 ? 78 : W - 78, y: -50 - (i % 3) * 25,
          targetY: 90 + (i % 5) * 128, phase: i * 0.77, revenge: true
        }));
        this.repeat(e, 42.0, 20, 0.2, (i) => g.spawnEnemy('scout', {
          x: i % 2 ? 42 : W - 42, y: -20 - (i % 4) * 16,
          originX: i % 2 ? 42 : W - 42, amp: 190, phase: i * 0.29,
          speed: 190, revenge: true
        }));
        this.at(e, 48.0, () => g.spawnEnemy('elite', { x: 110, y: -70, targetY: 155, phase: 7, armored: true }));
        this.at(e, 48.6, () => g.spawnEnemy('elite', { x: W - 110, y: -70, targetY: 240, phase: 8, armored: true }));
        this.repeat(e, 54.0, 10, 0.57, (i) => g.spawnEnemy(i % 3 === 0 ? 'spinner' : 'diver', {
          x: i % 2 ? -35 : W + 35, y: 75 + (i % 5) * 120,
          side: i % 2 ? 1 : -1, phase: i, splitShots: true, revenge: true
        }));
        this.at(e, 62.0, () => g.spawnEnemy('carrier', { x: W / 2, y: -90, targetY: 185, phase: 9, armored: true, finalEscort: true }));
      }
      return e.sort((a, b) => a.t - b.t);
    }

    update(dt) {
      const g = this.game;
      if (g.sequenceLock || g.boss) return;
      if (g.mode === 'story') {
        this.time += dt;
        while (this.index < this.events.length && this.events[this.index].t <= this.time) {
          this.events[this.index].fn();
          this.index += 1;
        }
        if (!this.bossSpawned && this.time >= this.bossAt) {
          this.bossSpawned = true;
          g.spawnBoss(g.stageIndex);
        }
      } else if (g.mode === 'rush') {
        this.updateRush(dt);
      } else {
        this.updateEndless(dt);
      }
    }

    updateRush(dt) {
      const g = this.game;
      this.time += dt;
      this.endlessClock -= dt;
      if (this.endlessClock <= 0) {
        this.endlessWave += 1;
        const wave = this.endlessWave;
        const typeCycle = ['scout', 'diver', 'spinner', 'turret', 'orbiter', 'elite'];
        const type = typeCycle[wave % typeCycle.length];
        const count = type === 'elite' ? 1 : type === 'turret' || type === 'spinner' ? 3 : 7;
        for (let i = 0; i < count; i += 1) {
          g.spawnEnemy(type, {
            x: count === 1 ? W / 2 : 45 + i * (W - 90) / Math.max(1, count - 1),
            y: -45 - (i % 3) * 30,
            originX: 45 + i * (W - 90) / Math.max(1, count - 1),
            targetY: 110 + (i % 3) * 95,
            side: i % 2 ? 1 : -1,
            phase: wave * 0.8 + i,
            speed: 135 + wave * 2.2,
            revenge: wave > 8
          });
        }
        this.endlessClock = Math.max(1.55, 3.4 - wave * 0.035);
      }
      const marker = Math.floor((180 - g.modeTimer) / 45);
      if (!g.boss && marker > g.rushBossesSpawned && marker <= 3) {
        g.rushBossesSpawned = marker;
        g.clearEnemies(false);
        g.spawnBoss((marker - 1) % 3, true);
      }
    }

    updateEndless(dt) {
      const g = this.game;
      this.time += dt;
      this.endlessClock -= dt;
      if (this.endlessClock <= 0) {
        this.endlessWave += 1;
        const sector = Math.floor(this.time / 70);
        const roll = randInt(0, 5);
        const type = ['scout', 'diver', 'spinner', 'turret', 'orbiter', 'carrier'][roll];
        const count = type === 'carrier' ? 1 : type === 'spinner' || type === 'turret' ? 3 + Math.min(2, sector) : 6 + Math.min(8, sector * 2);
        for (let i = 0; i < count; i += 1) {
          g.spawnEnemy(type, {
            x: count === 1 ? rand(110, W - 110) : 35 + i * (W - 70) / Math.max(1, count - 1),
            y: -50 - (i % 4) * 28,
            originX: 35 + i * (W - 70) / Math.max(1, count - 1),
            targetY: 100 + (i % 4) * 105,
            side: i % 2 ? 1 : -1,
            phase: this.endlessWave * 0.73 + i,
            speed: 140 + sector * 12,
            revenge: sector >= 1,
            armored: sector >= 3
          });
        }
        this.endlessClock = Math.max(1.25, 3.1 - sector * 0.18);
      }
      const sector = Math.floor(this.time / 70);
      if (!g.boss && sector > g.endlessBossesSpawned) {
        g.endlessBossesSpawned = sector;
        g.clearEnemies(false);
        g.spawnBoss(sector % 3, true);
      }
    }
  }

  class Game {
    constructor(canvas, input, audio, save) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
      this.input = input;
      this.audio = audio;
      this.save = save;
      this.sprites = new SpriteBank();
      this.director = new StageDirector(this);

      this.state = 'title';
      this.mode = 'story';
      this.stageIndex = 0;
      this.backgroundTime = 0;
      this.runTime = 0;
      this.modeTimer = 0;
      this.rushBossesSpawned = 0;
      this.endlessBossesSpawned = 0;
      this.reboots = 0;
      this.score = 0;
      this.displayScore = 0;
      this.chain = 0;
      this.chainHold = 0;
      this.maxMultiplier = 1;
      this.drive = 0;
      this.driveReadyTime = 0;
      this.overdriveTime = 0;
      this.overdriveMax = 0;
      this.overdriveGuard = false;
      this.shield = 3;
      this.maxShield = 3;
      this.rank = 0.24;
      this.rankTarget = 0.24;
      this.rankPenalty = 0;
      this.noHitTime = 0;
      this.hitStop = 0;
      this.flash = 0;
      this.flashColor = COLORS.white;
      this.shake = 0;
      this.sequenceLock = false;
      this.pendingAction = null;
      this.pendingTimer = 0;
      this.banner = null;
      this.toastTimer = 0;
      this.worldPrompt = null;
      this.boss = null;
      this.player = this.createPlayer();
      this.mods = this.createMods();
      this.upgradeLevels = {};
      this.freeGuardUsed = false;
      this.stageMercyUsed = false;
      this.firstDriveUsed = false;
      this.tutorial = { moved: false, graze: false, drivePrompted: false, autoFire: false };

      this.enemies = [];
      this.enemyBullets = [];
      this.playerBullets = [];
      this.particles = [];
      this.pickups = [];
      this.lasers = [];
      this.floaters = [];
      this.freeEnemyBullets = [];
      this.freePlayerBullets = [];
      this.freeParticles = [];
      this.freePickups = [];
      this.freeEnemies = [];
      this.freeLasers = [];
      this.stars = Array.from({ length: 92 }, () => ({
        x: rand(0, W), y: rand(0, H), z: rand(0.2, 1), tw: rand(0, TAU)
      }));
      this.cityBlocks = Array.from({ length: 18 }, (_, i) => ({
        x: i * 36 - 20, w: rand(24, 58), h: rand(70, 240), seed: rand(0, 100)
      }));
      this.stats = this.createStats();
      this.ui = this.cacheUI();
      this.hudAccumulator = 0;
      this.setupUI();
      this.applySettingsToUI();
      this.updateTitleBest();
      this.resizeCanvas();
      window.addEventListener('resize', () => this.resizeCanvas());
    }

    createPlayer() {
      return {
        x: W / 2,
        y: H * 0.82,
        prevX: W / 2,
        prevY: H * 0.82,
        vx: 0,
        vy: 0,
        radius: 4,
        grazeRadius: 25,
        invuln: 0,
        shotTimer: 0,
        missileTimer: 0,
        power: 1,
        focus: false,
        tilt: 0,
        pointerOffsetSet: false,
        moveDistance: 0,
        auraPulse: 0,
        trailTimer: 0
      };
    }

    createMods() {
      return {
        fireRate: 1,
        drones: 2,
        overdriveDuration: 6.2,
        grazeRadius: 25,
        grazeGain: 1,
        nova: 0,
        maxShieldBonus: 0,
        closeDamage: 0,
        rushScore: 0,
        guardCost: 32,
        guardRadius: 145,
        chainDecay: 1,
        chainRetention: 0,
        missileRate: 1,
        missilePower: 1,
        arcLevel: 0,
        freeGuard: false
      };
    }

    createStats() {
      return {
        graze: 0,
        kills: 0,
        hits: 0,
        guards: 0,
        drives: 0,
        bulletsCancelled: 0,
        bosses: 0,
        reboots: 0,
        maxChain: 1,
        startTime: performance.now()
      };
    }

    cacheUI() {
      return {
        hud: $('#hud'),
        score: $('#score-value'),
        hype: $('#hype-grade'),
        mode: $('#mode-label'),
        stage: $('#stage-label'),
        bossHud: $('#boss-hud'),
        bossName: $('#boss-name'),
        bossPhase: $('#boss-phase'),
        bossFill: $('#boss-bar-fill'),
        shields: $('#shield-pips'),
        drive: $('#drive-value'),
        driveBar: $('#drive-bar'),
        driveFill: $('#drive-bar-fill'),
        chain: $('#chain-value'),
        sideSync: $('#side-sync'),
        sideThreat: $('#side-threat'),
        sideChain: $('#side-chain'),
        danger: $('#danger-vignette'),
        touchDrive: $('#touch-drive'),
        toast: $('#toast'),
        title: $('#title-screen'),
        modeScreen: $('#mode-screen'),
        settingsScreen: $('#settings-screen'),
        creditsScreen: $('#credits-screen'),
        pauseScreen: $('#pause-screen'),
        upgradeScreen: $('#upgrade-screen'),
        upgradeCards: $('#upgrade-cards'),
        resultScreen: $('#gameover-screen'),
        resultEyebrow: $('#result-eyebrow'),
        resultTitle: $('#result-title'),
        resultScore: $('#result-score'),
        resultChain: $('#result-chain'),
        resultGraze: $('#result-graze'),
        resultKills: $('#result-kills'),
        resultGrade: $('#result-grade'),
        newRecord: $('#new-record'),
        bestTitle: $('#best-score-title')
      };
    }

    setupUI() {
      const openOnly = (target) => {
        [this.ui.title, this.ui.modeScreen, this.ui.settingsScreen, this.ui.creditsScreen,
          this.ui.pauseScreen, this.ui.upgradeScreen, this.ui.resultScreen].forEach((el) => {
          el.classList.toggle('overlay-visible', el === target);
        });
      };

      $('#ignite-button').addEventListener('click', () => {
        this.audio.unlock();
        this.audio.sfx('select');
        this.startRun(this.mode);
      });

      $('#mode-button').addEventListener('click', () => {
        this.audio.unlock();
        this.audio.sfx('select');
        openOnly(this.ui.modeScreen);
      });

      $('#settings-button').addEventListener('click', () => {
        this.audio.unlock();
        this.audio.sfx('select');
        this.applySettingsToUI();
        openOnly(this.ui.settingsScreen);
      });

      $('#credits-button').addEventListener('click', () => {
        this.audio.unlock();
        this.audio.sfx('select');
        openOnly(this.ui.creditsScreen);
      });

      $$('.back-title').forEach((button) => button.addEventListener('click', () => {
        this.audio.sfx('select');
        openOnly(this.ui.title);
      }));

      $$('.mode-card').forEach((card) => {
        card.addEventListener('click', () => {
          if (card.disabled) return;
          this.audio.unlock();
          this.audio.sfx('select');
          this.mode = card.dataset.mode;
          $$('.mode-card').forEach((el) => el.classList.toggle('selected', el === card));
        });
      });

      $('#mode-confirm').addEventListener('click', () => {
        this.audio.sfx('select');
        openOnly(this.ui.title);
        this.updateTitleBest();
      });

      const rangeOutput = (id, outId) => {
        const input = $(id);
        const output = $(outId);
        input.addEventListener('input', () => {
          output.value = Math.round(Number(input.value) * 100);
        });
      };
      rangeOutput('#master-volume', '#master-volume-output');
      rangeOutput('#music-volume', '#music-volume-output');

      $('#settings-save').addEventListener('click', () => {
        this.readSettingsFromUI();
        this.audio.applySettings();
        this.audio.sfx('select');
        persistSave(this.save);
        openOnly(this.ui.title);
      });

      $('#resume-button').addEventListener('click', () => this.resume());
      $('#restart-button').addEventListener('click', () => {
        this.audio.sfx('select');
        this.startRun(this.mode);
      });
      $('#quit-button').addEventListener('click', () => {
        this.audio.sfx('select');
        this.returnToTitle();
      });
      $('#result-retry').addEventListener('click', () => {
        this.audio.unlock();
        this.audio.sfx('select');
        this.startRun(this.mode);
      });
      $('#result-title-button').addEventListener('click', () => {
        this.audio.sfx('select');
        this.returnToTitle();
      });

      this.ui.touchDrive.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.audio.unlock();
        if (this.state === 'playing') this.tryDrive();
      });
      this.ui.touchDrive.addEventListener('keydown', (event) => {
        if (event.code === 'Enter' || event.code === 'Space') {
          event.preventDefault();
          if (this.state === 'playing') this.tryDrive();
        }
      });

      window.addEventListener('keydown', (event) => {
        const titleVisible = this.ui.title.classList.contains('overlay-visible');
        const target = event.target instanceof HTMLElement ? event.target : null;
        const interactive = Boolean(target?.closest('button, input, select, textarea'));
        if (this.state === 'title' && titleVisible && !interactive && ['Enter', 'Space', 'KeyZ'].includes(event.code)) {
          event.preventDefault();
          this.audio.unlock();
          this.startRun(this.mode);
        }
        if (this.state === 'upgrade' && ['Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3'].includes(event.code)) {
          const index = Number(event.code.slice(-1)) - 1;
          const card = this.currentUpgradeChoices?.[index];
          if (card) this.chooseUpgrade(card);
        }
      }, { passive: false });

      document.addEventListener('visibilitychange', () => {
        if (document.hidden && this.state === 'playing') this.pause();
      });

      const endlessCard = $('#endless-mode-card');
      endlessCard.disabled = !this.save.unlockedEndless;
      if (this.save.unlockedEndless) $('#endless-mode-note').textContent = '无限扇区 · Rank 持续攀升';
    }

    applySettingsToUI() {
      const s = this.save.settings;
      $('#master-volume').value = s.master;
      $('#music-volume').value = s.music;
      $('#master-volume-output').value = Math.round(s.master * 100);
      $('#music-volume-output').value = Math.round(s.music * 100);
      $('#fx-density').value = String(s.fxDensity);
      $('#screen-shake').checked = s.screenShake;
      $('#flash-effects').checked = s.flashes;
      $('#show-hitbox').checked = s.showHitbox;
      $('#auto-guard').checked = s.autoGuard;
    }

    readSettingsFromUI() {
      const s = this.save.settings;
      s.master = Number($('#master-volume').value);
      s.music = Number($('#music-volume').value);
      s.fxDensity = Number($('#fx-density').value);
      s.screenShake = $('#screen-shake').checked;
      s.flashes = $('#flash-effects').checked;
      s.showHitbox = $('#show-hitbox').checked;
      s.autoGuard = $('#auto-guard').checked;
    }

    resizeCanvas() {
      this.ctx.imageSmoothingEnabled = true;
      this.ctx.imageSmoothingQuality = 'high';
    }

    updateTitleBest() {
      this.ui.bestTitle.textContent = `BEST ${formatScore(this.save.best[this.mode] || 0)}`;
      const endlessCard = $('#endless-mode-card');
      endlessCard.disabled = !this.save.unlockedEndless;
      if (this.save.unlockedEndless) $('#endless-mode-note').textContent = '无限扇区 · Rank 持续攀升';
    }

    hideAllOverlays() {
      [this.ui.title, this.ui.modeScreen, this.ui.settingsScreen, this.ui.creditsScreen,
        this.ui.pauseScreen, this.ui.upgradeScreen, this.ui.resultScreen].forEach((el) => {
        el.classList.remove('overlay-visible');
      });
    }

    startRun(mode = 'story') {
      this.mode = mode;
      this.hideAllOverlays();
      this.state = 'playing';
      this.ui.hud.classList.remove('hud-hidden');
      this.audio.setMusicActive(true);
      this.audio.unlock();
      this.clearAllEntities();
      this.stageIndex = 0;
      this.runTime = 0;
      this.modeTimer = mode === 'rush' ? 180 : 0;
      this.rushBossesSpawned = 0;
      this.endlessBossesSpawned = 0;
      this.reboots = mode === 'story' ? 4 : 0;
      this.score = 0;
      this.displayScore = 0;
      this.chain = 0;
      this.chainHold = 0;
      this.maxMultiplier = 1;
      this.drive = 0;
      this.driveReadyTime = 0;
      this.overdriveTime = 0;
      this.overdriveMax = 0;
      this.overdriveGuard = false;
      this.maxShield = 3;
      this.shield = 3;
      this.rank = mode === 'rush' ? 0.48 : mode === 'endless' ? 0.42 : 0.22;
      this.rankTarget = this.rank;
      this.rankPenalty = 0;
      this.noHitTime = 0;
      this.hitStop = 0;
      this.flash = 0;
      this.shake = 0;
      this.sequenceLock = false;
      this.pendingAction = null;
      this.pendingTimer = 0;
      this.boss = null;
      this.player = this.createPlayer();
      this.mods = this.createMods();
      this.upgradeLevels = {};
      this.stats = this.createStats();
      this.freeGuardUsed = false;
      this.stageMercyUsed = false;
      this.firstDriveUsed = false;
      this.tutorial = { moved: false, graze: false, drivePrompted: false, autoFire: false };
      this.currentUpgradeChoices = null;
      this.startStage(0, true);
      this.canvas.focus({ preventScroll: true });
    }

    startStage(index, first = false) {
      this.stageIndex = clamp(index, 0, 2);
      this.clearAllEntities();
      this.boss = null;
      this.sequenceLock = false;
      this.pendingAction = null;
      this.pendingTimer = 0;
      this.freeGuardUsed = false;
      this.stageMercyUsed = false;
      this.player.x = W / 2;
      this.player.y = H * 0.82;
      this.player.prevX = this.player.x;
      this.player.prevY = this.player.y;
      this.player.vx = 0;
      this.player.vy = 0;
      this.player.invuln = first ? 2.0 : 2.7;
      this.player.power = Math.max(this.player.power, 1 + index);
      this.player.shotTimer = 0;
      this.drive = first ? 0 : Math.max(this.drive, 22);
      this.chain = first ? 0 : Math.min(this.chain, 45);
      this.chainHold = 1.6;
      if (!first) this.shield = Math.min(this.maxShield, this.shield + 1);
      this.director.start(this.stageIndex);
      this.audio.setStage(this.stageIndex);
      const titles = [
        ['ACT I', 'SYNAPSE CITY'],
        ['ACT II', 'GLASS TEMPLE'],
        ['ACT III', 'ZERO SUN']
      ];
      if (this.mode === 'story') {
        this.showBanner(titles[this.stageIndex][0], titles[this.stageIndex][1], 3.1);
      } else if (first && this.mode === 'rush') {
        this.showBanner('RUSH 180', 'NO BRAKES / HIGH SCORE', 3.1);
      } else if (first) {
        this.showBanner('ENDLESS', 'RANK NEVER SLEEPS', 3.1);
      }
      this.updateHUD(true);
    }

    returnToTitle() {
      this.state = 'title';
      this.audio.setMusicActive(false);
      this.audio.setIntensity(0.2, false);
      this.clearAllEntities();
      this.boss = null;
      this.ui.hud.classList.add('hud-hidden');
      this.hideAllOverlays();
      this.ui.title.classList.add('overlay-visible');
      this.updateTitleBest();
    }

    pause() {
      if (this.state !== 'playing') return;
      this.state = 'paused';
      this.ui.pauseScreen.classList.add('overlay-visible');
      this.audio.setMusicActive(false);
    }

    resume() {
      if (this.state !== 'paused') return;
      this.audio.unlock();
      this.audio.sfx('select');
      this.state = 'playing';
      this.ui.pauseScreen.classList.remove('overlay-visible');
      this.audio.setMusicActive(true);
      this.canvas.focus({ preventScroll: true });
    }

    showToast(text, duration = 1.5) {
      this.ui.toast.textContent = text;
      this.ui.toast.classList.add('visible');
      this.toastTimer = duration;
    }

    showBanner(title, subtitle, duration = 2.8) {
      this.banner = { title, subtitle, time: duration, max: duration };
    }

    update(dt) {
      this.backgroundTime += dt;
      this.input.pollGamepad();

      if (this.toastTimer > 0) {
        this.toastTimer -= dt;
        if (this.toastTimer <= 0) this.ui.toast.classList.remove('visible');
      }
      if (this.banner) {
        this.banner.time -= dt;
        if (this.banner.time <= 0) this.banner = null;
      }
      this.flash = Math.max(0, this.flash - dt * 2.8);
      this.shake = Math.max(0, this.shake - dt * 26);

      if (this.state === 'title') {
        this.displayScore = lerp(this.displayScore, this.save.best[this.mode] || 0, 1 - Math.pow(0.001, dt));
        this.updateTitleAttract(dt);
        this.input.endFrame();
        return;
      }

      if (this.state === 'paused') {
        if (this.input.consumePause()) this.resume();
        this.input.endFrame();
        return;
      }

      if (this.state !== 'playing') {
        this.updateParticles(dt * 0.55);
        this.updateFloaters(dt);
        this.input.endFrame();
        return;
      }

      if (this.input.consumePause()) {
        this.pause();
        this.input.endFrame();
        return;
      }

      if (this.input.consumeAction()) this.tryDrive();

      if (this.hitStop > 0) {
        this.hitStop -= dt;
        this.updateParticles(dt * 0.3);
        this.updateFloaters(dt * 0.3);
        this.updateHUD();
        this.input.endFrame();
        return;
      }

      this.runTime += dt;
      this.noHitTime += dt;
      if (this.mode === 'rush') {
        this.modeTimer -= dt;
        if (this.modeTimer <= 0) {
          this.modeTimer = 0;
          this.finishRun(true, 'TIME COMPLETE');
          this.input.endFrame();
          return;
        }
      }

      if (this.pendingAction) {
        this.pendingTimer -= dt;
        if (this.pendingTimer <= 0) {
          const action = this.pendingAction;
          this.pendingAction = null;
          this.sequenceLock = false;
          action();
          if (this.state !== 'playing') {
            this.input.endFrame();
            return;
          }
        }
      }

      this.updatePlayer(dt);
      this.director.update(dt);
      this.updateBoss(dt);
      this.updateEnemies(dt);
      this.updatePlayerBullets(dt);
      this.updateEnemyBullets(dt);
      this.updateLasers(dt);
      this.updatePickups(dt);
      this.updateParticles(dt);
      this.updateFloaters(dt);
      this.handleCollisions();
      this.updateScoring(dt);
      this.updateRank(dt);
      this.updateSequencePrompts(dt);

      this.displayScore = lerp(this.displayScore, this.score, 1 - Math.pow(0.0001, dt));
      const intensity = clamp(0.18 + this.rank * 0.48 + this.chain / 180 + (this.boss ? 0.12 : 0), 0.15, 1);
      this.audio.setIntensity(intensity, this.overdriveTime > 0);

      this.hudAccumulator -= dt;
      if (this.hudAccumulator <= 0) {
        this.hudAccumulator = 1 / 30;
        this.updateHUD();
      }
      this.input.endFrame();
    }

    updateTitleAttract(dt) {
      for (const star of this.stars) {
        star.y += (22 + star.z * 54) * dt;
        star.tw += dt * (1 + star.z * 2);
        if (star.y > H + 5) {
          star.y = -5;
          star.x = rand(0, W);
          star.z = rand(0.2, 1);
        }
      }
    }

    updateSequencePrompts(dt) {
      if (!this.tutorial.moved && this.player.moveDistance > 24) {
        this.tutorial.moved = true;
        if (!this.tutorial.autoFire) {
          this.tutorial.autoFire = true;
          this.showToast('AUTO FIRE // ONLINE', 1.6);
        }
      }

      if (this.drive >= 100 && this.overdriveTime <= 0) {
        this.driveReadyTime += dt;
        if (!this.tutorial.drivePrompted) {
          this.tutorial.drivePrompted = true;
          this.worldPrompt = { text: 'PRESS SPACE // DROP', time: 3.2, max: 3.2, color: COLORS.pink };
          this.audio.sfx('driveReady');
        }
        if (!this.firstDriveUsed && this.driveReadyTime > 2.45) this.activateOverdrive(true);
      } else {
        this.driveReadyTime = 0;
      }

      if (this.worldPrompt) {
        this.worldPrompt.time -= dt;
        if (this.worldPrompt.time <= 0) this.worldPrompt = null;
      }
    }

    updatePlayer(dt) {
      const p = this.player;
      p.prevX = p.x;
      p.prevY = p.y;
      p.invuln = Math.max(0, p.invuln - dt);
      p.auraPulse += dt;
      p.focus = this.input.isFocus();

      const keyboard = this.input.keyboardVector();
      const gamepad = this.input.gamepadVector();
      let dx = keyboard.x || keyboard.y ? keyboard.x : gamepad.x;
      let dy = keyboard.x || keyboard.y ? keyboard.y : gamepad.y;
      const pointer = this.input.pointer;
      const pointerControl = (pointer.type === 'touch' && pointer.active) ||
        (pointer.type === 'mouse' && pointer.inside && this.input.lastDevice === 'mouse');

      if (pointerControl) {
        if (pointer.type === 'touch' && !p.pointerOffsetSet) {
          pointer.offsetX = p.x - pointer.x;
          pointer.offsetY = p.y - pointer.y;
          p.pointerOffsetSet = true;
        }
        const tx = pointer.x + (pointer.type === 'touch' ? pointer.offsetX : 0);
        const ty = pointer.y + (pointer.type === 'touch' ? pointer.offsetY : 0);
        const responsiveness = p.focus ? 18 : 25;
        const desiredVx = (tx - p.x) * responsiveness;
        const desiredVy = (ty - p.y) * responsiveness;
        const maxSpeed = p.focus ? 260 : 620;
        p.vx = lerp(p.vx, clamp(desiredVx, -maxSpeed, maxSpeed), 1 - Math.pow(0.00003, dt));
        p.vy = lerp(p.vy, clamp(desiredVy, -maxSpeed, maxSpeed), 1 - Math.pow(0.00003, dt));
      } else if (Math.abs(dx) + Math.abs(dy) > 0.01) {
        p.pointerOffsetSet = false;
        const speed = p.focus ? 178 : 345;
        p.vx = lerp(p.vx, dx * speed, 1 - Math.pow(0.00008, dt));
        p.vy = lerp(p.vy, dy * speed, 1 - Math.pow(0.00008, dt));
      } else {
        if (!pointer.active) p.pointerOffsetSet = false;
        p.vx *= Math.pow(0.0008, dt);
        p.vy *= Math.pow(0.0008, dt);
      }

      p.x = clamp(p.x + p.vx * dt, 24, W - 24);
      p.y = clamp(p.y + p.vy * dt, 82, H - 54);
      p.moveDistance += Math.hypot(p.x - p.prevX, p.y - p.prevY);
      p.tilt = lerp(p.tilt, clamp(p.vx / 430, -1, 1), 1 - Math.pow(0.002, dt));

      p.trailTimer -= dt;
      if (p.trailTimer <= 0) {
        p.trailTimer = this.overdriveTime > 0 ? 0.012 : 0.026;
        this.spawnParticle({
          x: p.x + rand(-5, 5), y: p.y + 17,
          vx: -p.vx * 0.08 + rand(-12, 12), vy: 115 + rand(0, 55),
          life: rand(0.24, 0.48), size: rand(2, 5),
          color: this.overdriveTime > 0 ? (chance(0.5) ? COLORS.pink : COLORS.cyan) : COLORS.cyan,
          type: 'spark', drag: 1.4
        });
      }

      p.shotTimer -= dt;
      const rate = (this.overdriveTime > 0 ? 0.045 : 0.082) / this.mods.fireRate;
      while (p.shotTimer <= 0) {
        p.shotTimer += rate;
        this.firePlayerShot();
      }

      p.missileTimer -= dt;
      const missileRate = (this.overdriveTime > 0 ? 0.28 : 0.68) / this.mods.missileRate;
      if (p.missileTimer <= 0) {
        p.missileTimer += missileRate;
        this.fireMissiles();
      }

      if (this.overdriveTime > 0) {
        this.overdriveTime -= dt;
        this.drive = clamp(this.overdriveTime / this.overdriveMax * 100, 0, 100);
        if (this.overdriveTime <= 0) {
          this.overdriveTime = 0;
          this.endOverdrive();
        }
      }
    }

    getDronePositions() {
      const p = this.player;
      const count = this.mods.drones;
      const positions = [];
      if (count <= 0) return positions;
      for (let i = 0; i < count; i += 1) {
        const centered = i - (count - 1) / 2;
        if (p.focus) {
          positions.push({ x: p.x + centered * 22, y: p.y + 20 + Math.abs(centered) * 2, angle: 0 });
        } else {
          const arc = count === 1 ? 0 : centered / Math.max(1, (count - 1) / 2);
          positions.push({
            x: p.x + arc * (34 + count * 2),
            y: p.y + 18 + Math.abs(arc) * 16,
            angle: arc * 0.11
          });
        }
      }
      return positions;
    }

    firePlayerShot() {
      const p = this.player;
      const power = p.power;
      const focus = p.focus;
      const over = this.overdriveTime > 0;
      const baseDamage = 10 * (1 + (power - 1) * 0.16) * (over ? 1.85 : 1);
      const patterns = focus
        ? (power >= 4 ? [-10, -5, 0, 5, 10] : power >= 2 ? [-7, 0, 7] : [0])
        : (power >= 4 ? [-20, -10, 0, 10, 20] : power >= 2 ? [-13, 0, 13] : [0]);

      patterns.forEach((offset, index) => {
        const spread = focus ? offset * 0.003 : offset * 0.012;
        this.spawnPlayerBullet({
          x: p.x + offset * 0.62,
          y: p.y - 20 - Math.abs(offset) * 0.05,
          vx: Math.sin(spread) * 980,
          vy: -Math.cos(spread) * 980,
          radius: over ? 5.3 : 3.4,
          damage: baseDamage * (index === Math.floor(patterns.length / 2) ? 1.15 : 0.86),
          color: over ? (index % 2 ? COLORS.pink : COLORS.cyan) : COLORS.cyan,
          type: over ? 'lance' : 'shot',
          pierce: over ? 2 : 0,
          life: 1.3
        });
      });

      const drones = this.getDronePositions();
      for (let i = 0; i < drones.length; i += 1) {
        const d = drones[i];
        const angle = -Math.PI / 2 + d.angle;
        this.spawnPlayerBullet({
          x: d.x, y: d.y - 8,
          vx: Math.cos(angle) * 890,
          vy: Math.sin(angle) * 890,
          radius: over ? 4.2 : 2.8,
          damage: baseDamage * 0.56,
          color: i % 2 ? COLORS.pinkSoft : COLORS.violet,
          type: 'option',
          pierce: over ? 1 : 0,
          life: 1.4
        });
      }
    }

    fireMissiles() {
      const count = this.overdriveTime > 0 ? 2 : 1;
      for (let i = 0; i < count; i += 1) {
        const side = i % 2 ? 1 : -1;
        this.spawnPlayerBullet({
          x: this.player.x + side * 18,
          y: this.player.y + 3,
          vx: side * 90,
          vy: -310,
          radius: 6,
          damage: 42 * this.mods.missilePower * (this.overdriveTime > 0 ? 1.35 : 1),
          color: COLORS.gold,
          type: 'missile',
          turnRate: 5.3,
          speed: 430,
          life: 3,
          pierce: 0
        });
      }
    }

    tryDrive() {
      if (this.state !== 'playing') return;
      this.audio.unlock();
      if (this.overdriveTime > 0) {
        if (this.overdriveTime > 0.65) {
          const remaining = this.overdriveTime / this.overdriveMax;
          this.score += Math.floor(15000 * remaining * this.multiplier());
          this.overdriveTime = 0;
          this.endOverdrive(true);
        }
        return;
      }
      if (this.drive >= 99.5) {
        this.activateOverdrive(false);
      } else if (this.drive >= this.mods.guardCost * 0.9) {
        this.pulseGuard(false);
      } else {
        this.worldPrompt = { text: 'BUILD DRIVE', time: 0.8, max: 0.8, color: COLORS.cyan };
      }
    }

    activateOverdrive(auto = false) {
      if (this.overdriveTime > 0 || this.drive < 99) return;
      this.firstDriveUsed = true;
      this.stats.drives += 1;
      this.overdriveMax = this.mods.overdriveDuration;
      this.overdriveTime = this.overdriveMax;
      this.overdriveGuard = true;
      this.drive = 100;
      this.chain = Math.max(this.chain, 72);
      this.chainHold = 4;
      this.player.invuln = Math.max(this.player.invuln, 0.72);
      this.cancelBullets(W / 2, H / 2, 1200, 'drive', true);
      this.clearLasers();
      this.damageAllEnemies(230 + this.mods.nova * 60);
      this.flashScreen(COLORS.white, 0.52);
      this.addShake(16);
      this.hitStop = Math.max(this.hitStop, 0.08);
      this.audio.sfx('drive');
      this.showBanner(auto ? 'AUTO DROP' : 'OVERDRIVE', 'BREAK THE SCREEN', 1.45);
      this.spawnRadialBurst(this.player.x, this.player.y, 90, COLORS.cyan, COLORS.pink);
      this.rankPenalty = Math.max(0, this.rankPenalty - 0.08);
    }

    endOverdrive(manual = false) {
      const cancelled = this.cancelBullets(W / 2, H / 2, 1200, 'finisher', true);
      this.clearLasers();
      const novaDamage = 320 + this.mods.nova * 260 + cancelled * (0.12 + this.mods.nova * 0.05);
      this.damageAllEnemies(novaDamage);
      this.spawnRadialBurst(this.player.x, this.player.y, 120 + this.mods.nova * 30, COLORS.pink, COLORS.gold);
      this.flashScreen(manual ? COLORS.gold : COLORS.pink, 0.36);
      this.addShake(14 + this.mods.nova * 4);
      this.audio.sfx('pulse');
      this.drive = 0;
      this.overdriveGuard = false;
      this.chainHold = 2.2;
      if (this.mods.nova > 0) {
        for (let i = 0; i < this.mods.nova * 3; i += 1) {
          const angle = i / Math.max(1, this.mods.nova * 3) * TAU;
          this.spawnExplosion(
            this.player.x + Math.cos(angle) * rand(55, 180),
            this.player.y + Math.sin(angle) * rand(55, 180),
            1.1,
            i % 2 ? COLORS.gold : COLORS.pink
          );
        }
      }
    }

    pulseGuard(auto = false) {
      if (this.overdriveTime > 0) return;
      const cost = auto ? this.mods.guardCost : Math.max(18, this.mods.guardCost - 3);
      if (this.drive < cost) return;
      this.drive = Math.max(0, this.drive - cost);
      this.player.invuln = Math.max(this.player.invuln, auto ? 1.05 : 0.68);
      const radius = this.mods.guardRadius * (auto ? 1.08 : 1);
      const cancelled = this.cancelBullets(this.player.x, this.player.y, radius, 'guard', false);
      this.damageEnemiesInRadius(this.player.x, this.player.y, radius * 0.88, 85 + cancelled * 0.8);
      this.stats.guards += 1;
      this.chain = Math.min(100, this.chain + 8 + cancelled * 0.08);
      this.chainHold = 1.3;
      this.spawnRingParticle(this.player.x, this.player.y, radius, auto ? COLORS.gold : COLORS.cyan, 0.5, 5);
      this.flashScreen(auto ? COLORS.gold : COLORS.cyan, auto ? 0.22 : 0.14);
      this.addShake(auto ? 10 : 6);
      this.audio.sfx('pulse');
      this.floatText(this.player.x, this.player.y - 44, auto ? 'AUTO SAVE' : 'PULSE', auto ? COLORS.gold : COLORS.cyan, 15);
    }

    updateScoring(dt) {
      if (this.overdriveTime > 0) {
        this.chain = Math.max(this.chain, 70);
        this.chainHold = Math.max(this.chainHold, 0.4);
      } else {
        const ambientCharge = (this.boss ? 0.72 : 0.48) + (!this.firstDriveUsed ? 0.42 : 0);
        this.drive = Math.min(100, this.drive + ambientCharge * dt);
        if (!this.firstDriveUsed && this.runTime > 12) {
          const firstPeakFloor = clamp((this.runTime - 12) / 8 * 100, 0, 100);
          this.drive = Math.max(this.drive, firstPeakFloor);
        }
        if (this.chainHold > 0) {
          this.chainHold -= dt;
        } else {
          this.chain = Math.max(0, this.chain - 9.8 * this.mods.chainDecay * dt);
        }
      }
      const mult = this.multiplier();
      this.maxMultiplier = Math.max(this.maxMultiplier, mult);
      this.stats.maxChain = Math.max(this.stats.maxChain, mult);
    }

    multiplier() {
      const base = 1 + this.chain * 0.04;
      return base * (this.overdriveTime > 0 ? 2 : 1);
    }

    hypeGrade() {
      const effective = this.chain + (this.overdriveTime > 0 ? 18 : 0);
      if (effective >= 96) return 'SSS';
      if (effective >= 82) return 'SS';
      if (effective >= 66) return 'S';
      if (effective >= 48) return 'A';
      if (effective >= 26) return 'B';
      return 'C';
    }

    updateRank(dt) {
      const stageBase = this.mode === 'story'
        ? 0.2 + this.stageIndex * 0.1
        : this.mode === 'rush'
          ? 0.46 + (180 - this.modeTimer) / 180 * 0.24
          : 0.4 + Math.min(0.35, this.runTime / 360 * 0.35);
      const performance = clamp(this.chain / 100 * 0.22 + this.noHitTime / 90 * 0.14 + (this.overdriveTime > 0 ? 0.09 : 0), 0, 0.38);
      this.rankPenalty = Math.max(0, this.rankPenalty - dt * 0.014);
      this.rankTarget = clamp(stageBase + performance - this.rankPenalty, 0.16, 1);
      this.rank = lerp(this.rank, this.rankTarget, 1 - Math.pow(0.16, dt));
    }

    bulletCount(base) {
      const scale = 0.62 + this.rank * 0.68;
      return Math.max(1, Math.round(base * scale));
    }

    bulletSpeed(base) {
      return base * (0.82 + this.rank * 0.34);
    }

    flashScreen(color, amount) {
      if (!this.save.settings.flashes) amount *= 0.22;
      this.flashColor = color;
      this.flash = Math.max(this.flash, amount);
    }

    addShake(amount) {
      if (!this.save.settings.screenShake) return;
      this.shake = Math.max(this.shake, amount);
    }

    damageAllEnemies(damage) {
      for (const enemy of this.enemies) enemy.hp -= damage;
      if (this.boss) this.boss.hp -= damage;
    }

    damageEnemiesInRadius(x, y, radius, damage) {
      const rr = radius * radius;
      for (const enemy of this.enemies) {
        if (dist2(x, y, enemy.x, enemy.y) <= rr + enemy.radius * enemy.radius) enemy.hp -= damage;
      }
      if (this.boss && dist2(x, y, this.boss.x, this.boss.y) <= rr + this.boss.radius * this.boss.radius) {
        this.boss.hp -= damage;
      }
    }

    spawnRadialBurst(x, y, count, colorA, colorB) {
      const density = this.save.settings.fxDensity;
      const actual = Math.floor(count * density);
      for (let i = 0; i < actual; i += 1) {
        const a = rand(0, TAU);
        const speed = rand(80, 650);
        this.spawnParticle({
          x, y,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed,
          life: rand(0.35, 1.1),
          size: rand(1.5, 6),
          color: i % 2 ? colorA : colorB,
          type: chance(0.24) ? 'line' : 'spark',
          drag: rand(1.2, 3.4)
        });
      }
      for (let i = 0; i < 4; i += 1) {
        this.spawnRingParticle(x, y, 90 + i * 55, i % 2 ? colorA : colorB, 0.55 + i * 0.1, 4 - i * 0.5);
      }
    }

    spawnEnemy(type, options = {}) {
      const e = this.freeEnemies.pop() || {};
      const base = {
        scout: { hp: 46, radius: 15, score: 520 },
        diver: { hp: 58, radius: 16, score: 680 },
        spinner: { hp: 155, radius: 23, score: 1650 },
        turret: { hp: 185, radius: 24, score: 1950 },
        orbiter: { hp: 130, radius: 20, score: 1450 },
        carrier: { hp: 610, radius: 40, score: 6200 },
        elite: { hp: 430, radius: 32, score: 4800 }
      }[type] || { hp: 80, radius: 18, score: 800 };
      e.type = type;
      e.x = options.x ?? rand(50, W - 50);
      e.y = options.y ?? -40;
      e.originX = options.originX ?? e.x;
      e.originY = options.originY ?? e.y;
      e.vx = options.vx ?? 0;
      e.vy = options.vy ?? 0;
      e.speed = options.speed ?? 120;
      e.targetY = options.targetY ?? rand(105, 260);
      e.amp = options.amp ?? 72;
      e.phase = options.phase ?? rand(0, TAU);
      e.side = options.side ?? (e.x < W / 2 ? 1 : -1);
      e.hp = base.hp * (options.armored ? 1.45 : 1) * (1 + this.stageIndex * 0.09);
      e.maxHp = e.hp;
      e.radius = base.radius * (options.armored ? 1.08 : 1);
      e.score = base.score;
      e.color = options.color ?? (chance(0.5) ? COLORS.pink : COLORS.cyan);
      e.age = 0;
      e.fireTimer = options.fireDelay ?? rand(0.35, 1.1);
      e.auxTimer = rand(1.2, 2.2);
      e.rotation = rand(0, TAU);
      e.spin = rand(-1.5, 1.5);
      e.dead = false;
      e.entered = false;
      e.splitShots = Boolean(options.splitShots);
      e.revenge = Boolean(options.revenge);
      e.mirror = Boolean(options.mirror);
      e.armored = Boolean(options.armored);
      e.finalEscort = Boolean(options.finalEscort);
      e.contactDamage = true;
      this.enemies.push(e);
      return e;
    }

    spawnEnemyBullet(options = {}) {
      if (this.enemyBullets.length >= 2600) return null;
      const b = this.freeEnemyBullets.pop() || {};
      const angle = options.angle ?? Math.atan2(options.vy ?? 1, options.vx ?? 0);
      const speed = options.speed ?? (Math.hypot(options.vx ?? 0, options.vy ?? 0) || 120);
      b.x = options.x ?? W / 2;
      b.y = options.y ?? 0;
      b.prevX = b.x;
      b.prevY = b.y;
      b.angle = angle;
      b.speed = speed;
      b.vx = options.vx ?? Math.cos(angle) * speed;
      b.vy = options.vy ?? Math.sin(angle) * speed;
      b.ax = options.ax ?? 0;
      b.ay = options.ay ?? 0;
      b.accel = options.accel ?? 0;
      b.curve = options.curve ?? 0;
      b.wobble = options.wobble ?? 0;
      b.wobbleFreq = options.wobbleFreq ?? 0;
      b.radius = options.radius ?? 6;
      b.color = options.color ?? COLORS.pink;
      b.shape = options.shape ?? 'orb';
      b.age = 0;
      b.life = options.life ?? 10;
      b.delay = options.delay ?? 0;
      b.alpha = options.alpha ?? 1;
      b.scale = options.scale ?? 1;
      b.rotation = options.rotation ?? angle + Math.PI / 2;
      b.spin = options.spin ?? 0;
      b.grazed = false;
      b.cancellable = options.cancellable !== false;
      b.splitTime = options.splitTime ?? 0;
      b.splitCount = options.splitCount ?? 0;
      b.splitSpeed = options.splitSpeed ?? 0;
      b.splitDone = false;
      b.bounce = Boolean(options.bounce);
      b.bounces = 0;
      b.maxBounces = options.maxBounces ?? 1;
      this.enemyBullets.push(b);
      return b;
    }

    spawnPlayerBullet(options = {}) {
      if (this.playerBullets.length >= 420) return null;
      const b = this.freePlayerBullets.pop() || {};
      b.x = options.x ?? this.player.x;
      b.y = options.y ?? this.player.y;
      b.prevX = b.x;
      b.prevY = b.y;
      b.vx = options.vx ?? 0;
      b.vy = options.vy ?? -800;
      b.radius = options.radius ?? 3;
      b.damage = options.damage ?? 10;
      b.color = options.color ?? COLORS.cyan;
      b.type = options.type ?? 'shot';
      b.life = options.life ?? 1.5;
      b.age = 0;
      b.pierce = options.pierce ?? 0;
      b.turnRate = options.turnRate ?? 0;
      b.speed = options.speed ?? Math.hypot(b.vx, b.vy);
      b.rotation = Math.atan2(b.vy, b.vx) + Math.PI / 2;
      b.target = null;
      this.playerBullets.push(b);
      return b;
    }

    spawnParticle(options = {}) {
      const maxParticles = Math.floor(950 * this.save.settings.fxDensity);
      if (this.particles.length >= Math.max(160, maxParticles)) return null;
      const p = this.freeParticles.pop() || {};
      p.x = options.x ?? 0;
      p.y = options.y ?? 0;
      p.vx = options.vx ?? 0;
      p.vy = options.vy ?? 0;
      p.life = options.life ?? 0.5;
      p.maxLife = p.life;
      p.size = options.size ?? 3;
      p.color = options.color ?? COLORS.white;
      p.type = options.type ?? 'spark';
      p.drag = options.drag ?? 0;
      p.gravity = options.gravity ?? 0;
      p.rotation = options.rotation ?? rand(0, TAU);
      p.spin = options.spin ?? rand(-5, 5);
      p.alpha = options.alpha ?? 1;
      p.targetRadius = options.targetRadius ?? 0;
      p.lineWidth = options.lineWidth ?? 2;
      this.particles.push(p);
      return p;
    }

    spawnRingParticle(x, y, radius, color, life = 0.55, lineWidth = 3) {
      return this.spawnParticle({ x, y, life, size: 0, color, type: 'ring', targetRadius: radius, lineWidth });
    }

    spawnPickup(options = {}) {
      if (this.pickups.length >= 220) return null;
      const p = this.freePickups.pop() || {};
      p.x = options.x ?? 0;
      p.y = options.y ?? 0;
      p.vx = options.vx ?? rand(-70, 70);
      p.vy = options.vy ?? rand(-180, -40);
      p.type = options.type ?? 'score';
      p.value = options.value ?? 120;
      p.age = 0;
      p.life = options.life ?? 5;
      p.rotation = rand(0, TAU);
      this.pickups.push(p);
      return p;
    }

    spawnLaser(options = {}) {
      if (this.lasers.length >= 24) return null;
      const l = this.freeLasers.pop() || {};
      l.cx = options.cx ?? W / 2;
      l.cy = options.cy ?? H / 2;
      l.angle = options.angle ?? Math.PI / 2;
      l.length = options.length ?? H * 1.3;
      l.width = options.width ?? 22;
      l.warning = options.warning ?? 0.85;
      l.active = options.active ?? 0.8;
      l.age = 0;
      l.life = l.warning + l.active;
      l.rotSpeed = options.rotSpeed ?? 0;
      l.color = options.color ?? COLORS.red;
      l.cancellable = options.cancellable !== false;
      l.pulse = options.pulse ?? 0;
      this.lasers.push(l);
      this.audio.sfx('warning', 0.65);
      return l;
    }

    removeSwap(array, index, freeList) {
      const item = array[index];
      const last = array.pop();
      if (index < array.length) array[index] = last;
      freeList.push(item);
      return item;
    }

    clearAllEntities() {
      while (this.enemies.length) this.freeEnemies.push(this.enemies.pop());
      while (this.enemyBullets.length) this.freeEnemyBullets.push(this.enemyBullets.pop());
      while (this.playerBullets.length) this.freePlayerBullets.push(this.playerBullets.pop());
      while (this.particles.length) this.freeParticles.push(this.particles.pop());
      while (this.pickups.length) this.freePickups.push(this.pickups.pop());
      while (this.lasers.length) this.freeLasers.push(this.lasers.pop());
      this.floaters.length = 0;
    }

    clearEnemies(withExplosion = true) {
      for (let i = this.enemies.length - 1; i >= 0; i -= 1) {
        const e = this.enemies[i];
        if (withExplosion) this.spawnExplosion(e.x, e.y, e.radius / 24, e.color);
        this.removeSwap(this.enemies, i, this.freeEnemies);
      }
    }

    clearLasers() {
      while (this.lasers.length) this.freeLasers.push(this.lasers.pop());
    }

    spawnRing(x, y, count, speed, offset = 0, options = {}) {
      const actual = this.bulletCount(count);
      for (let i = 0; i < actual; i += 1) {
        const a = offset + i / actual * TAU;
        this.spawnEnemyBullet({
          x, y, angle: a, speed: this.bulletSpeed(speed),
          color: options.color ?? (i % 2 ? COLORS.pink : COLORS.cyan),
          shape: options.shape ?? 'orb',
          radius: options.radius ?? 6,
          curve: options.curve ?? 0,
          accel: options.accel ?? 0,
          wobble: options.wobble ?? 0,
          wobbleFreq: options.wobbleFreq ?? 0,
          splitTime: options.splitTime ?? 0,
          splitCount: options.splitCount ?? 0,
          splitSpeed: options.splitSpeed ?? 0,
          delay: (options.delayStep ?? 0) * i,
          bounce: options.bounce,
          maxBounces: options.maxBounces
        });
      }
    }

    spawnFan(x, y, baseAngle, count, spread, speed, options = {}) {
      const actual = this.bulletCount(count);
      for (let i = 0; i < actual; i += 1) {
        const t = actual === 1 ? 0.5 : i / (actual - 1);
        const a = baseAngle - spread / 2 + spread * t;
        this.spawnEnemyBullet({
          x, y, angle: a, speed: this.bulletSpeed(speed * (1 + (options.speedVariance ?? 0) * (t - 0.5))),
          color: options.color ?? (i % 2 ? COLORS.pink : COLORS.cyan),
          shape: options.shape ?? 'needle',
          radius: options.radius ?? 5.5,
          curve: options.curve ?? 0,
          accel: options.accel ?? 0,
          wobble: options.wobble ?? 0,
          wobbleFreq: options.wobbleFreq ?? 0,
          delay: (options.delayStep ?? 0) * i,
          bounce: options.bounce,
          maxBounces: options.maxBounces
        });
      }
    }

    spawnAimedFan(x, y, count, spread, speed, options = {}) {
      const lead = options.lead ?? 0;
      const tx = this.player.x + this.player.vx * lead;
      const ty = this.player.y + this.player.vy * lead;
      this.spawnFan(x, y, angleTo(x, y, tx, ty), count, spread, speed, options);
    }

    spawnBulletWall(gapX, gapWidth, speed, color = COLORS.pink, stagger = 0) {
      const spacing = 27 / (0.88 + this.rank * 0.16);
      let index = 0;
      for (let x = 12; x <= W - 12; x += spacing) {
        if (Math.abs(x - gapX) < gapWidth / 2) continue;
        this.spawnEnemyBullet({
          x, y: -18 - (index % 2) * stagger,
          angle: Math.PI / 2,
          speed: this.bulletSpeed(speed),
          color: index % 3 === 0 ? COLORS.cyan : color,
          shape: index % 2 ? 'diamond' : 'needle',
          radius: 6,
          wobble: index % 3 === 0 ? 0.18 : 0,
          wobbleFreq: 2.2
        });
        index += 1;
      }
    }

    cancelBullets(x, y, radius, reason = 'cancel', full = false) {
      const rr = radius * radius;
      const rewarding = reason !== 'hit' && reason !== 'transition';
      let count = 0;
      for (let i = this.enemyBullets.length - 1; i >= 0; i -= 1) {
        const b = this.enemyBullets[i];
        if (!b.cancellable) continue;
        if (full || dist2(x, y, b.x, b.y) <= rr) {
          count += 1;
          if (rewarding && count % 3 === 0 && this.pickups.length < 170) {
            this.spawnPickup({
              x: b.x, y: b.y,
              vx: rand(-60, 60), vy: rand(-100, 20),
              type: reason === 'guard' ? 'drive' : 'score',
              value: reason === 'guard' ? 45 : 95
            });
          }
          if (count <= 240 || count % 4 === 0) {
            this.spawnParticle({
              x: b.x, y: b.y,
              vx: rand(-50, 50), vy: rand(-50, 50),
              life: rand(0.18, 0.45), size: rand(2, 5),
              color: b.color, type: 'spark', drag: 2.5
            });
          }
          this.removeSwap(this.enemyBullets, i, this.freeEnemyBullets);
        }
      }
      if (count > 0) {
        this.stats.bulletsCancelled += count;
        if (rewarding) {
          const value = count * (reason === 'drive' || reason === 'finisher' ? 135 : 45) * this.multiplier();
          this.score += Math.floor(value);
          this.chain = Math.min(100, this.chain + Math.min(24, count * 0.045));
          this.chainHold = Math.max(this.chainHold, 1.1);
        }
      }
      return count;
    }

    updateEnemies(dt) {
      for (let i = this.enemies.length - 1; i >= 0; i -= 1) {
        const e = this.enemies[i];
        e.age += dt;
        e.rotation += e.spin * dt;
        e.fireTimer -= dt;
        e.auxTimer -= dt;

        if (e.hp <= 0) {
          this.killEnemy(i);
          continue;
        }

        switch (e.type) {
          case 'scout': {
            e.y += e.speed * dt;
            e.x = e.originX + Math.sin(e.age * 2.2 + e.phase) * e.amp;
            if (e.fireTimer <= 0 && e.y > 45 && e.y < H * 0.64) {
              e.fireTimer += 1.35 - this.rank * 0.42;
              this.spawnAimedFan(e.x, e.y + 8, 3 + (this.rank > 0.72 ? 2 : 0), 0.32, 175, {
                color: e.color, shape: 'needle', radius: 5
              });
            }
            break;
          }
          case 'diver': {
            const horizontal = e.side * (150 + this.rank * 60);
            e.x += horizontal * dt;
            e.y += (78 + Math.sin(e.age * 2.8 + e.phase) * 42) * dt;
            if (e.fireTimer <= 0 && e.y > 55 && e.y < H * 0.72) {
              e.fireTimer += 0.92 - this.rank * 0.2;
              this.spawnEnemyBullet({
                x: e.x, y: e.y, angle: angleTo(e.x, e.y, this.player.x, this.player.y),
                speed: this.bulletSpeed(205), color: e.color,
                shape: 'diamond', radius: 5.5, curve: e.mirror ? e.side * 0.32 : 0
              });
            }
            break;
          }
          case 'spinner': {
            if (!e.entered) {
              e.y = lerp(e.y, e.targetY, 1 - Math.pow(0.02, dt));
              if (Math.abs(e.y - e.targetY) < 3) e.entered = true;
            } else {
              e.x += Math.sin(e.age * 1.45 + e.phase) * 26 * dt;
              e.y += Math.sin(e.age * 1.1 + e.phase) * 7 * dt;
            }
            if (e.fireTimer <= 0 && e.y > 40) {
              e.fireTimer += 1.32 - this.rank * 0.24;
              this.spawnRing(e.x, e.y, 12, 135, e.rotation, {
                color: e.color, shape: 'orb', radius: 5.5,
                curve: e.spin * 0.055,
                splitTime: e.splitShots ? 1.65 : 0,
                splitCount: e.splitShots ? 3 : 0,
                splitSpeed: e.splitShots ? 105 : 0
              });
            }
            break;
          }
          case 'turret': {
            if (!e.entered) {
              e.y = lerp(e.y, e.targetY, 1 - Math.pow(0.026, dt));
              if (Math.abs(e.y - e.targetY) < 3) e.entered = true;
            } else {
              e.x += Math.sin(e.age * 0.95 + e.phase) * 18 * dt;
            }
            if (e.fireTimer <= 0 && e.y > 35) {
              e.fireTimer += 0.78 - this.rank * 0.14;
              this.spawnAimedFan(e.x, e.y + 12, 5, 0.65, 185, {
                color: e.color, shape: 'needle', radius: 5.4,
                speedVariance: 0.18
              });
            }
            if (e.auxTimer <= 0 && e.entered) {
              e.auxTimer += 2.8;
              this.spawnRing(e.x, e.y, 8, 105, e.rotation, {
                color: e.color === COLORS.cyan ? COLORS.pink : COLORS.cyan,
                shape: 'diamond', radius: 5, curve: e.spin * -0.08
              });
            }
            break;
          }
          case 'orbiter': {
            if (!e.entered) {
              e.x += e.side * 170 * dt;
              e.y += Math.sin(e.age * 2 + e.phase) * 20 * dt;
              if ((e.side > 0 && e.x > 105) || (e.side < 0 && e.x < W - 105)) e.entered = true;
            } else {
              const cx = W / 2;
              const cy = 225;
              const r = 150 + Math.sin(e.phase) * 32;
              const a = e.age * e.side * 0.66 + e.phase;
              e.x = lerp(e.x, cx + Math.cos(a) * r, 1 - Math.pow(0.01, dt));
              e.y = lerp(e.y, cy + Math.sin(a) * r * 0.45, 1 - Math.pow(0.01, dt));
            }
            if (e.fireTimer <= 0 && e.y > 35) {
              e.fireTimer += 1.05 - this.rank * 0.18;
              this.spawnFan(e.x, e.y, Math.PI / 2 + e.side * 0.22, 5, 1.0, 150, {
                color: e.color, shape: 'diamond', radius: 5.2, curve: e.side * 0.18
              });
            }
            break;
          }
          case 'carrier': {
            if (!e.entered) {
              e.y = lerp(e.y, e.targetY, 1 - Math.pow(0.018, dt));
              if (Math.abs(e.y - e.targetY) < 4) e.entered = true;
            } else {
              e.x += Math.sin(e.age * 0.62 + e.phase) * 22 * dt;
              e.y += Math.sin(e.age * 0.73) * 5 * dt;
            }
            if (e.fireTimer <= 0 && e.y > 20) {
              e.fireTimer += 1.05 - this.rank * 0.15;
              this.spawnRing(e.x, e.y + 12, 14, 112 + (e.armored ? 20 : 0), e.rotation, {
                color: chance(0.5) ? COLORS.pink : COLORS.cyan,
                shape: 'orb', radius: 6.2,
                curve: Math.sin(e.age) * 0.1
              });
              this.spawnAimedFan(e.x, e.y + 18, 5, 0.45, 205, {
                color: COLORS.gold, shape: 'needle', radius: 5.4
              });
            }
            if (e.auxTimer <= 0 && e.entered) {
              e.auxTimer += e.finalEscort ? 1.25 : 2.15;
              const side = chance(0.5) ? -1 : 1;
              this.spawnEnemy('scout', {
                x: e.x + side * 26, y: e.y + 18, originX: e.x + side * 26,
                amp: 90, phase: rand(0, TAU), speed: 150, revenge: e.revenge || e.finalEscort
              });
            }
            break;
          }
          case 'elite': {
            if (!e.entered) {
              e.y = lerp(e.y, e.targetY, 1 - Math.pow(0.02, dt));
              if (Math.abs(e.y - e.targetY) < 4) e.entered = true;
            } else {
              e.x = W / 2 + Math.sin(e.age * 0.72 + e.phase) * (125 + Math.sin(e.phase) * 40);
              e.y = e.targetY + Math.sin(e.age * 1.2 + e.phase) * 36;
            }
            if (e.fireTimer <= 0 && e.y > 25) {
              e.fireTimer += 0.66 - this.rank * 0.12;
              this.spawnRing(e.x, e.y, 10, 155, e.rotation * 0.7, {
                color: e.color, shape: 'diamond', radius: 5.6,
                curve: Math.sin(e.age * 0.7) * 0.12
              });
              this.spawnAimedFan(e.x, e.y, 7, 0.82, 220, {
                color: COLORS.gold, shape: 'needle', radius: 5.2, speedVariance: 0.14
              });
            }
            if (e.auxTimer <= 0 && e.entered) {
              e.auxTimer += 2.25;
              this.spawnLaser({
                cx: e.x, cy: H / 2, angle: Math.PI / 2 + Math.sin(e.age) * 0.16,
                length: H * 1.2, width: 18, warning: 0.72, active: 0.45,
                color: e.color
              });
            }
            break;
          }
          default:
            break;
        }

        if (e.y > H + 100 || e.x < -130 || e.x > W + 130) {
          this.removeSwap(this.enemies, i, this.freeEnemies);
        }
      }
    }

    killEnemy(index) {
      const e = this.enemies[index];
      const distance = Math.hypot(e.x - this.player.x, e.y - this.player.y);
      const rush = clamp(6 - Math.floor(Math.max(0, distance - 42) / 70), 1, 5);
      const scoreGain = e.score * (1 + (rush - 1) * (0.32 + this.mods.rushScore * 0.15)) * this.multiplier();
      this.score += Math.floor(scoreGain);
      this.drive = Math.min(100, this.drive + (1.8 + rush * 0.92) * this.mods.grazeGain);
      this.chain = Math.min(100, this.chain + 3.4 + rush * 1.12);
      this.chainHold = 1.25;
      this.stats.kills += 1;
      this.spawnExplosion(e.x, e.y, e.radius / 22, e.color);
      this.floatText(e.x, e.y - e.radius, `RUSH ${rush}`, rush >= 4 ? COLORS.gold : e.color, 8 + rush);
      this.audio.sfx(e.type === 'carrier' || e.type === 'elite' ? 'bigKill' : 'kill', clamp(e.radius / 25, 0.7, 1.3));
      this.addShake(e.type === 'carrier' || e.type === 'elite' ? 7 : 2.5);

      const targetPower = this.stats.kills >= 125 ? 5 : this.stats.kills >= 72 ? 4 : this.stats.kills >= 34 ? 3 : this.stats.kills >= 12 ? 2 : 1;
      if (targetPower > this.player.power) {
        this.player.power = targetPower;
        this.showToast(`POWER ${targetPower}`, 1.15);
        this.audio.sfx('phase', 0.65);
      }

      const revenge = e.revenge || this.rank > 0.76;
      if (revenge && e.type !== 'scout') {
        this.spawnRing(e.x, e.y, e.type === 'carrier' || e.type === 'elite' ? 10 : 5, 125, rand(0, TAU), {
          color: COLORS.red, shape: 'star', radius: 5.2, accel: 20
        });
      }

      if (e.type === 'carrier' || e.type === 'elite') {
        for (let k = 0; k < 8; k += 1) {
          this.spawnPickup({
            x: e.x + rand(-e.radius, e.radius), y: e.y + rand(-e.radius, e.radius),
            vx: rand(-110, 110), vy: rand(-220, -50), type: 'score', value: 220
          });
        }
      }
      this.removeSwap(this.enemies, index, this.freeEnemies);
    }

    updateEnemyBullets(dt) {
      const timeScale = this.overdriveTime > 0 ? 0.72 : 1;
      for (let i = this.enemyBullets.length - 1; i >= 0; i -= 1) {
        const b = this.enemyBullets[i];
        b.age += dt;
        b.rotation += b.spin * dt;
        if (b.delay > 0) {
          b.delay -= dt;
          continue;
        }
        b.prevX = b.x;
        b.prevY = b.y;
        b.speed += b.accel * dt * timeScale;
        b.angle += b.curve * dt * timeScale;
        const wobble = b.wobble ? Math.sin(b.age * b.wobbleFreq) * b.wobble : 0;
        b.vx = Math.cos(b.angle + wobble) * b.speed + b.ax * b.age;
        b.vy = Math.sin(b.angle + wobble) * b.speed + b.ay * b.age;
        b.x += b.vx * dt * timeScale;
        b.y += b.vy * dt * timeScale;

        if (b.bounce && b.bounces < b.maxBounces) {
          if ((b.x < 10 && b.vx < 0) || (b.x > W - 10 && b.vx > 0)) {
            b.angle = Math.PI - b.angle;
            b.x = clamp(b.x, 10, W - 10);
            b.bounces += 1;
          }
          if ((b.y < 10 && b.vy < 0) || (b.y > H - 10 && b.vy > 0)) {
            b.angle = -b.angle;
            b.y = clamp(b.y, 10, H - 10);
            b.bounces += 1;
          }
        }

        if (b.splitTime > 0 && !b.splitDone && b.age >= b.splitTime) {
          b.splitDone = true;
          const count = b.splitCount || 3;
          for (let k = 0; k < count; k += 1) {
            const a = b.angle + (k - (count - 1) / 2) * 0.42;
            this.spawnEnemyBullet({
              x: b.x, y: b.y, angle: a,
              speed: this.bulletSpeed(b.splitSpeed || 110),
              color: b.color, shape: 'needle', radius: Math.max(4.2, b.radius - 1.4),
              curve: -b.curve * 0.7
            });
          }
          b.speed *= 0.62;
          b.curve *= -0.5;
        }

        if (b.age > b.life || b.x < -90 || b.x > W + 90 || b.y < -100 || b.y > H + 100) {
          this.removeSwap(this.enemyBullets, i, this.freeEnemyBullets);
        }
      }
    }

    findNearestTarget(x, y) {
      let best = null;
      let bestD = Infinity;
      if (this.boss) {
        best = this.boss;
        bestD = dist2(x, y, this.boss.x, this.boss.y);
      }
      for (const e of this.enemies) {
        const d = dist2(x, y, e.x, e.y);
        if (d < bestD) {
          best = e;
          bestD = d;
        }
      }
      return best;
    }

    updatePlayerBullets(dt) {
      for (let i = this.playerBullets.length - 1; i >= 0; i -= 1) {
        const b = this.playerBullets[i];
        b.age += dt;
        b.life -= dt;
        b.prevX = b.x;
        b.prevY = b.y;
        if (b.type === 'missile') {
          if (!b.target || b.target.hp <= 0 || b.age % 0.18 < dt) b.target = this.findNearestTarget(b.x, b.y);
          if (b.target) {
            const desired = angleTo(b.x, b.y, b.target.x, b.target.y);
            const current = Math.atan2(b.vy, b.vx);
            const diff = wrapAngle(desired - current);
            const next = current + clamp(diff, -b.turnRate * dt, b.turnRate * dt);
            b.vx = Math.cos(next) * b.speed;
            b.vy = Math.sin(next) * b.speed;
            b.rotation = next + Math.PI / 2;
          }
          if (Math.floor(b.age * 30) % 2 === 0) {
            this.spawnParticle({
              x: b.x, y: b.y + 5, vx: rand(-18, 18), vy: rand(30, 90),
              life: rand(0.14, 0.28), size: rand(1.5, 3.2), color: COLORS.gold, type: 'spark', drag: 1.8
            });
          }
        }
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.life <= 0 || b.x < -45 || b.x > W + 45 || b.y < -70 || b.y > H + 70) {
          this.removeSwap(this.playerBullets, i, this.freePlayerBullets);
        }
      }
    }

    updateLasers(dt) {
      for (let i = this.lasers.length - 1; i >= 0; i -= 1) {
        const l = this.lasers[i];
        l.age += dt;
        l.angle += l.rotSpeed * dt;
        l.pulse += dt * 8;
        if (l.age >= l.life) this.removeSwap(this.lasers, i, this.freeLasers);
      }
    }

    updatePickups(dt) {
      const p = this.player;
      for (let i = this.pickups.length - 1; i >= 0; i -= 1) {
        const item = this.pickups[i];
        item.age += dt;
        item.life -= dt;
        item.rotation += dt * 4;
        const d = Math.hypot(p.x - item.x, p.y - item.y);
        if (item.age > 0.24 || d < 150) {
          const a = angleTo(item.x, item.y, p.x, p.y);
          const pull = clamp(230 + (160 - Math.min(160, d)) * 7, 230, 980);
          item.vx = lerp(item.vx, Math.cos(a) * pull, 1 - Math.pow(0.001, dt));
          item.vy = lerp(item.vy, Math.sin(a) * pull, 1 - Math.pow(0.001, dt));
        } else {
          item.vy += 260 * dt;
        }
        item.x += item.vx * dt;
        item.y += item.vy * dt;
        if (d < 18) {
          if (item.type === 'drive' && this.overdriveTime <= 0) this.drive = Math.min(100, this.drive + 0.45);
          this.score += Math.floor(item.value * this.multiplier());
          this.removeSwap(this.pickups, i, this.freePickups);
        } else if (item.life <= 0 || item.y > H + 80) {
          this.removeSwap(this.pickups, i, this.freePickups);
        }
      }
    }

    updateParticles(dt) {
      for (let i = this.particles.length - 1; i >= 0; i -= 1) {
        const p = this.particles[i];
        p.life -= dt;
        p.rotation += p.spin * dt;
        if (p.type !== 'ring') {
          const damping = Math.exp(-p.drag * dt);
          p.vx *= damping;
          p.vy = p.vy * damping + p.gravity * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
        }
        if (p.life <= 0) this.removeSwap(this.particles, i, this.freeParticles);
      }
    }

    updateFloaters(dt) {
      for (let i = this.floaters.length - 1; i >= 0; i -= 1) {
        const f = this.floaters[i];
        f.life -= dt;
        f.y += f.vy * dt;
        f.vy *= Math.pow(0.06, dt);
        if (f.life <= 0) this.floaters.splice(i, 1);
      }
    }

    segmentCircleHit(x1, y1, x2, y2, cx, cy, radius) {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len2 = dx * dx + dy * dy || 1;
      const t = clamp(((cx - x1) * dx + (cy - y1) * dy) / len2, 0, 1);
      const px = x1 + dx * t;
      const py = y1 + dy * t;
      return dist2(px, py, cx, cy) <= radius * radius;
    }

    pointSegmentDistance(px, py, x1, y1, x2, y2) {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len2 = dx * dx + dy * dy || 1;
      const t = clamp(((px - x1) * dx + (py - y1) * dy) / len2, 0, 1);
      const x = x1 + dx * t;
      const y = y1 + dy * t;
      return Math.hypot(px - x, py - y);
    }

    handleCollisions() {
      this.handlePlayerShotCollisions();
      this.handlePlayerDangerCollisions();
    }

    handlePlayerShotCollisions() {
      for (let i = this.playerBullets.length - 1; i >= 0; i -= 1) {
        const b = this.playerBullets[i];
        let hit = null;
        let hitEnemyIndex = -1;

        if (this.boss && this.segmentCircleHit(b.prevX, b.prevY, b.x, b.y, this.boss.x, this.boss.y, this.boss.radius + b.radius)) {
          hit = this.boss;
        } else {
          for (let j = this.enemies.length - 1; j >= 0; j -= 1) {
            const e = this.enemies[j];
            if (this.segmentCircleHit(b.prevX, b.prevY, b.x, b.y, e.x, e.y, e.radius + b.radius)) {
              hit = e;
              hitEnemyIndex = j;
              break;
            }
          }
        }

        if (!hit) continue;
        const proximity = 1 - clamp(Math.hypot(this.player.x - hit.x, this.player.y - hit.y) / 250, 0, 1);
        const damage = b.damage * (1 + this.mods.closeDamage * proximity);

        if (b.type === 'missile') {
          const radius = 58 + this.mods.missilePower * 9;
          this.damageEnemiesInRadius(b.x, b.y, radius, damage * 0.62);
          hit.hp -= damage;
          this.spawnExplosion(b.x, b.y, 0.75 * this.mods.missilePower, COLORS.gold);
          this.addShake(2.6);
          this.removeSwap(this.playerBullets, i, this.freePlayerBullets);
          continue;
        }

        hit.hp -= damage;
        if (hit === this.boss && chance(0.18)) this.hitStop = Math.max(this.hitStop, 0.008);
        this.spawnParticle({
          x: b.x, y: b.y,
          vx: rand(-55, 55), vy: rand(-80, 35),
          life: rand(0.08, 0.18), size: rand(1.5, 3.5),
          color: b.color, type: 'spark', drag: 2.2
        });
        if (chance(0.12)) this.audio.sfx('shotAccent');

        if (b.pierce > 0) {
          b.pierce -= 1;
          b.damage *= 0.72;
          b.x += b.vx * 0.012;
          b.y += b.vy * 0.012;
        } else {
          this.removeSwap(this.playerBullets, i, this.freePlayerBullets);
        }

        if (hitEnemyIndex >= 0 && this.enemies[hitEnemyIndex]?.hp <= 0) {
          // Enemy death is resolved in updateEnemies to preserve a single scoring path.
        }
      }
    }

    handlePlayerDangerCollisions() {
      const p = this.player;
      let dangerProximity = 0;
      for (let i = this.enemyBullets.length - 1; i >= 0; i -= 1) {
        const b = this.enemyBullets[i];
        if (b.delay > 0) continue;
        const d2 = dist2(p.x, p.y, b.x, b.y);
        const hitRadius = p.radius + Math.min(4.8, b.radius * 0.48);
        const grazeRadius = this.mods.grazeRadius + b.radius * 0.72;
        if (d2 < sqr(70 + b.radius)) dangerProximity = Math.max(dangerProximity, 1 - Math.sqrt(d2) / 75);

        if (d2 <= hitRadius * hitRadius && p.invuln <= 0) {
          this.handlePlayerHit(b.x, b.y);
          if (this.state !== 'playing') return;
          break;
        }
        if (!b.grazed && d2 <= grazeRadius * grazeRadius) {
          b.grazed = true;
          this.onGraze(b);
        }
      }

      for (const l of this.lasers) {
        if (l.age < l.warning) continue;
        const half = l.length / 2;
        const dx = Math.cos(l.angle) * half;
        const dy = Math.sin(l.angle) * half;
        const distance = this.pointSegmentDistance(p.x, p.y, l.cx - dx, l.cy - dy, l.cx + dx, l.cy + dy);
        dangerProximity = Math.max(dangerProximity, 1 - distance / (l.width * 2.6));
        if (distance <= l.width / 2 + p.radius && p.invuln <= 0) {
          this.handlePlayerHit(p.x, p.y);
          if (this.state !== 'playing') return;
          break;
        }
      }

      for (const e of this.enemies) {
        if (e.contactDamage && dist2(p.x, p.y, e.x, e.y) <= sqr(p.radius + e.radius * 0.72) && p.invuln <= 0) {
          this.handlePlayerHit(e.x, e.y);
          e.hp -= e.maxHp * 0.34;
          if (this.state !== 'playing') return;
          break;
        }
      }
      if (this.boss && dist2(p.x, p.y, this.boss.x, this.boss.y) <= sqr(p.radius + this.boss.radius * 0.72) && p.invuln <= 0) {
        this.handlePlayerHit(this.boss.x, this.boss.y);
        if (this.state !== 'playing') return;
      }

      this.ui.danger.style.opacity = String(clamp(dangerProximity * 0.5, 0, 0.52));
    }

    onGraze(bullet) {
      const gain = (1.2 + bullet.radius * 0.08) * this.mods.grazeGain;
      if (this.overdriveTime <= 0) this.drive = Math.min(100, this.drive + gain);
      else this.overdriveTime = Math.min(this.overdriveMax + 2.2, this.overdriveTime + 0.022 * this.mods.grazeGain);
      this.chain = Math.min(100, this.chain + 1.05 + this.mods.arcLevel * 0.05);
      this.chainHold = Math.max(this.chainHold, 0.72);
      this.score += Math.floor((85 + bullet.radius * 12) * this.multiplier());
      this.stats.graze += 1;
      this.player.auraPulse = 0;
      this.audio.sfx('graze');
      const a = angleTo(bullet.x, bullet.y, this.player.x, this.player.y);
      for (let i = 0; i < Math.ceil(3 * this.save.settings.fxDensity); i += 1) {
        this.spawnParticle({
          x: this.player.x + Math.cos(a) * 12,
          y: this.player.y + Math.sin(a) * 12,
          vx: Math.cos(a + rand(-0.8, 0.8)) * rand(50, 180),
          vy: Math.sin(a + rand(-0.8, 0.8)) * rand(50, 180),
          life: rand(0.18, 0.38), size: rand(1.5, 4),
          color: bullet.color, type: 'line', drag: 2.1
        });
      }

      if (!this.tutorial.graze) {
        this.tutorial.graze = true;
        this.showToast('CLOSE CALL + DRIVE', 1.55);
      }

      if (this.mods.arcLevel > 0 && this.stats.graze % Math.max(2, 6 - this.mods.arcLevel) === 0) {
        const target = this.findNearestTarget(this.player.x, this.player.y);
        if (target) {
          target.hp -= 32 * this.mods.arcLevel;
          this.spawnArc(this.player.x, this.player.y, target.x, target.y, this.mods.arcLevel);
        }
      }
    }

    spawnArc(x1, y1, x2, y2, level = 1) {
      const segments = 7 + level * 2;
      let px = x1;
      let py = y1;
      for (let i = 1; i <= segments; i += 1) {
        const t = i / segments;
        const nx = lerp(x1, x2, t) + (i === segments ? 0 : rand(-10, 10));
        const ny = lerp(y1, y2, t) + (i === segments ? 0 : rand(-10, 10));
        const mx = (px + nx) / 2;
        const my = (py + ny) / 2;
        const speed = Math.hypot(nx - px, ny - py) / 0.12;
        const angle = Math.atan2(ny - py, nx - px);
        this.spawnParticle({
          x: mx, y: my,
          vx: Math.cos(angle) * speed * 0.04,
          vy: Math.sin(angle) * speed * 0.04,
          life: 0.13, size: 2.2 + level * 0.35,
          color: i % 2 ? COLORS.cyan : COLORS.violet,
          type: 'line', drag: 9, rotation: angle
        });
        px = nx;
        py = ny;
      }
      this.audio.sfx('graze', 0.7);
    }

    handlePlayerHit(x, y) {
      const p = this.player;
      if (p.invuln > 0) return;

      if (this.overdriveTime > 0 && this.overdriveGuard) {
        this.overdriveGuard = false;
        p.invuln = 1.1;
        this.overdriveTime = Math.max(1.1, this.overdriveTime - 1.5);
        const cancelled = this.cancelBullets(p.x, p.y, 205, 'guard', false);
        this.damageEnemiesInRadius(p.x, p.y, 190, 110 + cancelled);
        this.spawnRingParticle(p.x, p.y, 205, COLORS.gold, 0.55, 6);
        this.floatText(p.x, p.y - 50, 'BREAK GUARD', COLORS.gold, 16);
        this.flashScreen(COLORS.gold, 0.28);
        this.addShake(10);
        this.audio.sfx('pulse');
        return;
      }

      if (this.save.settings.autoGuard && !this.stageMercyUsed) {
        this.stageMercyUsed = true;
        p.invuln = 1.15;
        const cancelled = this.cancelBullets(p.x, p.y, 188, 'guard', false);
        this.damageEnemiesInRadius(p.x, p.y, 170, 90 + cancelled * 0.7);
        this.stats.guards += 1;
        this.spawnRingParticle(p.x, p.y, 188, COLORS.cyan, 0.52, 5);
        this.floatText(p.x, p.y - 50, 'FIRST SAVE', COLORS.cyan, 15);
        this.flashScreen(COLORS.cyan, 0.2);
        this.addShake(8);
        this.audio.sfx('pulse');
        return;
      }

      if (this.mods.freeGuard && !this.freeGuardUsed) {
        this.freeGuardUsed = true;
        p.invuln = 1.35;
        this.cancelBullets(p.x, p.y, 260, 'guard', false);
        this.damageEnemiesInRadius(p.x, p.y, 240, 180);
        this.spawnRadialBurst(p.x, p.y, 60, COLORS.green, COLORS.cyan);
        this.floatText(p.x, p.y - 50, 'REBOOT GUARD', COLORS.green, 16);
        this.flashScreen(COLORS.green, 0.32);
        this.addShake(12);
        this.audio.sfx('pulse');
        return;
      }

      if (this.save.settings.autoGuard && this.overdriveTime <= 0 && this.drive >= this.mods.guardCost) {
        this.pulseGuard(true);
        return;
      }

      this.shield -= 1;
      this.stats.hits += 1;
      this.noHitTime = 0;
      this.rankPenalty = Math.min(0.42, this.rankPenalty + 0.15);
      const retention = clamp(0.28 + this.mods.chainRetention, 0.2, 0.72);
      this.chain *= retention;
      this.chainHold = 0.7;
      this.drive = Math.max(18, this.drive * 0.68);
      p.invuln = 2.25;
      p.vx *= -0.3;
      p.vy = 120;
      this.cancelBullets(W / 2, H / 2, 1200, 'hit', true);
      this.clearLasers();
      this.spawnRadialBurst(p.x, p.y, 80, COLORS.red, COLORS.white);
      this.flashScreen(COLORS.red, 0.62);
      this.addShake(21);
      this.hitStop = 0.1;
      this.audio.sfx('hit');
      this.floatText(p.x, p.y - 54, 'SHIELD BREAK', COLORS.red, 17);

      if (this.shield <= 0) {
        if (this.mode === 'story' && this.reboots > 0) {
          this.reboots -= 1;
          this.stats.reboots += 1;
          this.shield = this.maxShield;
          this.score = Math.floor(this.score * 0.9);
          this.chain *= 0.2;
          this.rankPenalty = Math.min(0.5, this.rankPenalty + 0.16);
          p.invuln = 3.2;
          this.drive = 100;
          this.showBanner('RAGE REBOOT', `${this.reboots} RESERVE`, 1.8);
          this.activateOverdrive(true);
          return;
        }
        this.shield = 0;
        this.sequenceLock = true;
        this.pendingAction = () => this.finishRun(false, 'SIGNAL LOST');
        this.pendingTimer = 1.15;
        this.audio.setIntensity(0.1, false);
      }
    }

    spawnExplosion(x, y, scale = 1, color = COLORS.pink) {
      const count = Math.floor((20 + scale * 18) * this.save.settings.fxDensity);
      for (let i = 0; i < count; i += 1) {
        const a = rand(0, TAU);
        const speed = rand(40, 270) * (0.7 + scale * 0.45);
        this.spawnParticle({
          x: x + rand(-4, 4), y: y + rand(-4, 4),
          vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
          life: rand(0.22, 0.72) * (0.75 + scale * 0.25),
          size: rand(1.5, 5.5) * (0.7 + scale * 0.24),
          color: i % 4 === 0 ? COLORS.white : i % 3 === 0 ? COLORS.gold : color,
          type: i % 5 === 0 ? 'line' : 'spark', drag: rand(1.2, 3.8)
        });
      }
      this.spawnRingParticle(x, y, 45 + scale * 38, color, 0.35 + scale * 0.08, 3 + scale);
    }

    floatText(x, y, text, color = COLORS.white, size = 11) {
      if (this.floaters.length >= 80) this.floaters.shift();
      this.floaters.push({ x, y, text, color, size, life: 0.75, maxLife: 0.75, vy: -55 });
    }

    bossDefinitions(id) {
      const defs = [
        {
          name: 'AELLA // THE FEED', color: COLORS.pink,
          phases: [
            { name: 'INFINITE SCROLL', hp: 4700, duration: 24 },
            { name: 'RED DOT HUNGER', hp: 5600, duration: 26 },
            { name: 'FEED COLLAPSE', hp: 6800, duration: 30 }
          ]
        },
        {
          name: 'MIRROR SAINT', color: COLORS.cyan,
          phases: [
            { name: 'TWIN REFLECTION', hp: 6100, duration: 27 },
            { name: 'GLASS LATTICE', hp: 7200, duration: 29 },
            { name: 'KALEIDOSCOPE END', hp: 8500, duration: 32 }
          ]
        },
        {
          name: 'THE ALGORITHM', color: COLORS.gold,
          phases: [
            { name: 'PREDICTIVE DESIRE', hp: 7200, duration: 29 },
            { name: 'PERFECT CORRIDOR', hp: 8200, duration: 31 },
            { name: 'GOLDEN ENGAGEMENT', hp: 9300, duration: 34 },
            { name: 'ZERO SUN // FINAL', hp: 11200, duration: 40 }
          ]
        }
      ];
      return defs[clamp(id, 0, defs.length - 1)];
    }

    spawnBoss(id, challenge = false) {
      const def = this.bossDefinitions(id);
      this.clearEnemies(false);
      this.cancelBullets(W / 2, H / 2, 1200, 'transition', true);
      this.clearLasers();
      const hpScale = this.mode === 'rush' ? 0.72 : this.mode === 'endless' ? 0.88 + Math.min(0.6, this.runTime / 420) : 1;
      this.boss = {
        id,
        name: def.name,
        color: def.color,
        phases: def.phases,
        phaseIndex: 0,
        phaseAge: 0,
        age: 0,
        intro: 2.2,
        x: W / 2,
        y: -90,
        targetX: W / 2,
        targetY: 145,
        radius: id === 2 ? 58 : 52,
        rotation: 0,
        spin: id % 2 ? -0.35 : 0.42,
        timers: {},
        challenge,
        hpScale,
        hp: def.phases[0].hp * hpScale,
        maxHp: def.phases[0].hp * hpScale,
        phaseStartHits: this.stats.hits,
        phaseStartTime: this.runTime,
        phaseTimeout: false
      };
      this.sequenceLock = false;
      this.showBanner('WARNING', def.name, 2.2);
      this.audio.sfx('warning');
      this.ui.bossHud.classList.remove('boss-hud-hidden');
    }

    setBossPhase(index) {
      const b = this.boss;
      if (!b) return;
      b.phaseIndex = index;
      b.phaseAge = 0;
      b.timers = {};
      b.phaseTimeout = false;
      const phase = b.phases[index];
      b.maxHp = phase.hp * b.hpScale;
      b.hp = b.maxHp;
      b.phaseStartHits = this.stats.hits;
      b.phaseStartTime = this.runTime;
      b.targetX = W / 2;
      b.targetY = 145 + index * 8;
      this.showBanner(`PHASE ${index + 1}`, phase.name, 1.65);
      this.audio.sfx('phase');
      this.flashScreen(b.color, 0.22);
    }

    bossTick(name, interval, dt, initial = true) {
      const b = this.boss;
      if (!(name in b.timers)) b.timers[name] = initial ? 0 : interval;
      b.timers[name] -= dt;
      if (b.timers[name] <= 0) {
        b.timers[name] += interval;
        return true;
      }
      return false;
    }

    moveBoss(x, y, dt, responsiveness = 2.2) {
      const b = this.boss;
      b.x = lerp(b.x, x, 1 - Math.exp(-responsiveness * dt));
      b.y = lerp(b.y, y, 1 - Math.exp(-responsiveness * dt));
    }

    updateBoss(dt) {
      const b = this.boss;
      if (!b) return;
      b.age += dt;
      b.rotation += b.spin * dt;

      if (b.intro > 0) {
        b.intro -= dt;
        this.moveBoss(W / 2, 145, dt, 1.8);
        return;
      }

      b.phaseAge += dt;
      const phase = b.phases[b.phaseIndex];
      if (b.hp <= 0 || b.phaseAge >= phase.duration) {
        b.phaseTimeout = b.phaseAge >= phase.duration && b.hp > 0;
        this.advanceBossPhase();
        return;
      }

      if (b.id === 0) this.updateBossAella(dt);
      else if (b.id === 1) this.updateBossMirror(dt);
      else this.updateBossAlgorithm(dt);
    }

    updateBossAella(dt) {
      const b = this.boss;
      const t = b.phaseAge;
      if (b.phaseIndex === 0) {
        this.moveBoss(W / 2 + Math.sin(t * 0.78) * 175, 145 + Math.sin(t * 1.21) * 24, dt, 2.8);
        if (this.bossTick('ring', 0.72 - this.rank * 0.08, dt)) {
          this.spawnRing(b.x, b.y + 10, 18, 128, t * 0.56, {
            color: Math.floor(t) % 2 ? COLORS.pink : COLORS.cyan,
            shape: 'orb', radius: 5.6,
            curve: Math.sin(t * 0.7) * 0.09
          });
        }
        if (this.bossTick('aim', 1.32, dt)) {
          this.spawnAimedFan(b.x, b.y + 18, 7, 0.82, 215, {
            color: COLORS.gold, shape: 'needle', radius: 5.2, speedVariance: 0.12
          });
        }
      } else if (b.phaseIndex === 1) {
        this.moveBoss(W / 2 + Math.sin(t * 0.42) * 72, 118 + Math.sin(t * 0.9) * 14, dt, 2.5);
        if (this.bossTick('wall', 0.92 - this.rank * 0.08, dt)) {
          const gap = W / 2 + Math.sin(t * 1.07) * 172;
          this.spawnBulletWall(gap, 118 - this.rank * 18, 170, Math.floor(t * 2) % 2 ? COLORS.pink : COLORS.red, 6);
        }
        if (this.bossTick('laser', 3.55, dt, false)) {
          const shift = Math.sin(t * 0.65) * 65;
          this.spawnLaser({ cx: W * 0.27 + shift, cy: H / 2, angle: Math.PI / 2, length: H * 1.25, width: 23, warning: 0.9, active: 0.62, color: COLORS.red });
          this.spawnLaser({ cx: W * 0.73 + shift, cy: H / 2, angle: Math.PI / 2, length: H * 1.25, width: 23, warning: 0.9, active: 0.62, color: COLORS.pink });
        }
        if (this.bossTick('aim', 1.7, dt)) {
          this.spawnAimedFan(b.x, b.y + 20, 9, 1.0, 190, { color: COLORS.cyan, shape: 'diamond', radius: 5.3, curve: 0.05 });
        }
      } else {
        this.moveBoss(W / 2 + Math.sin(t * 0.95) * 185, 155 + Math.sin(t * 1.4) * 38, dt, 3.1);
        if (this.bossTick('spiral', 0.092 - this.rank * 0.015, dt)) {
          const a = t * 3.25;
          const emit = 48;
          for (const side of [-1, 1]) {
            this.spawnEnemyBullet({
              x: b.x + side * emit, y: b.y + 16,
              angle: Math.PI / 2 + Math.sin(a) * 1.15 + side * 0.32,
              speed: this.bulletSpeed(142),
              color: side < 0 ? COLORS.pink : COLORS.cyan,
              shape: 'needle', radius: 5.1,
              curve: side * (0.14 + Math.sin(t * 0.4) * 0.06), accel: 8
            });
          }
        }
        if (this.bossTick('aim', 1.25, dt)) {
          this.spawnAimedFan(b.x, b.y + 22, 9, 0.92, 235, { color: COLORS.gold, shape: 'star', radius: 5.1, speedVariance: 0.2 });
        }
        if (this.bossTick('ring', 2.65, dt, false)) {
          this.spawnRing(b.x, b.y, 30, 118, t * 0.31, { color: COLORS.red, shape: 'orb', radius: 5.8, curve: Math.sin(t) * 0.08, accel: 12 });
        }
      }
    }

    updateBossMirror(dt) {
      const b = this.boss;
      const t = b.phaseAge;
      if (b.phaseIndex === 0) {
        this.moveBoss(W / 2 + Math.sin(t * 0.55) * 85, 142 + Math.sin(t * 1.05) * 24, dt, 2.6);
        if (this.bossTick('mirror', 0.15 - this.rank * 0.02, dt)) {
          const wave = Math.sin(t * 2.2) * 1.05;
          for (const side of [-1, 1]) {
            this.spawnEnemyBullet({
              x: b.x + side * 62, y: b.y + 12,
              angle: Math.PI / 2 + side * wave,
              speed: this.bulletSpeed(142 + Math.sin(t * 1.7) * 18),
              color: side < 0 ? COLORS.cyan : COLORS.pink,
              shape: 'diamond', radius: 5.4,
              curve: -side * 0.19
            });
          }
        }
        if (this.bossTick('ring', 1.05, dt)) {
          this.spawnRing(b.x, b.y, 16, 112, -t * 0.48, { color: COLORS.violet, shape: 'orb', radius: 5.2, curve: 0.08 });
        }
        if (this.bossTick('aim', 1.7, dt)) {
          this.spawnAimedFan(b.x, b.y + 15, 7, 0.62, 220, { color: COLORS.gold, shape: 'needle', radius: 5.2 });
        }
      } else if (b.phaseIndex === 1) {
        this.moveBoss(W / 2, 124 + Math.sin(t * 0.7) * 18, dt, 2.8);
        if (this.bossTick('grid', 1.02, dt)) {
          const gap = W / 2 + Math.sin(t * 0.78) * 145;
          this.spawnBulletWall(gap, 104, 160, Math.floor(t) % 2 ? COLORS.cyan : COLORS.violet, 10);
        }
        if (this.bossTick('cross', 3.2, dt, false)) {
          const base = t * 0.22;
          this.spawnLaser({ cx: W / 2, cy: H * 0.48, angle: base, length: H * 1.4, width: 19, warning: 1.0, active: 0.9, rotSpeed: 0.17, color: COLORS.cyan });
          this.spawnLaser({ cx: W / 2, cy: H * 0.48, angle: base + Math.PI / 2, length: H * 1.4, width: 19, warning: 1.0, active: 0.9, rotSpeed: 0.17, color: COLORS.pink });
        }
        if (this.bossTick('fan', 0.82, dt)) {
          this.spawnFan(b.x, b.y + 20, Math.PI / 2 + Math.sin(t * 0.9) * 0.7, 7, 1.15, 182, { color: COLORS.gold, shape: 'needle', radius: 5, curve: Math.sin(t) * 0.04 });
        }
      } else {
        if (this.bossTick('move', 2.8, dt)) {
          b.targetX = rand(110, W - 110);
          b.targetY = rand(105, 230);
        }
        this.moveBoss(b.targetX, b.targetY, dt, 1.85);
        if (this.bossTick('kaleido', 0.78 - this.rank * 0.07, dt)) {
          const alt = Math.floor(t / 0.78) % 2 ? 1 : -1;
          this.spawnRing(b.x, b.y, 24, 126, t * 0.83, {
            color: alt > 0 ? COLORS.pink : COLORS.cyan,
            shape: alt > 0 ? 'diamond' : 'orb', radius: 5.4,
            curve: alt * 0.16,
            splitTime: 1.75,
            splitCount: 2,
            splitSpeed: 105
          });
        }
        if (this.bossTick('edges', 2.35, dt, false)) {
          const count = this.bulletCount(9);
          for (let i = 0; i < count; i += 1) {
            const y = 120 + i * (H - 260) / Math.max(1, count - 1);
            for (const x of [-18, W + 18]) {
              this.spawnEnemyBullet({
                x, y,
                angle: angleTo(x, y, this.player.x, this.player.y) + rand(-0.16, 0.16),
                speed: this.bulletSpeed(170),
                color: x < 0 ? COLORS.cyan : COLORS.pink,
                shape: 'star', radius: 5.1, curve: x < 0 ? 0.05 : -0.05
              });
            }
          }
        }
        if (this.bossTick('aim', 1.42, dt)) {
          this.spawnAimedFan(b.x, b.y, 11, 1.08, 220, { color: COLORS.gold, shape: 'needle', radius: 5.2, speedVariance: 0.18 });
        }
      }
    }

    updateBossAlgorithm(dt) {
      const b = this.boss;
      const t = b.phaseAge;
      if (b.phaseIndex === 0) {
        this.moveBoss(W / 2 + Math.sin(t * 0.63) * 165, 135 + Math.sin(t * 1.15) * 30, dt, 2.8);
        if (this.bossTick('predict', 0.58 - this.rank * 0.06, dt)) {
          this.spawnAimedFan(b.x, b.y + 25, 7, 0.72, 225, {
            color: COLORS.gold, shape: 'needle', radius: 5.2,
            lead: 0.24 + this.rank * 0.22, speedVariance: 0.1
          });
        }
        if (this.bossTick('ring', 1.32, dt)) {
          this.spawnRing(b.x, b.y, 20, 122, t * 0.57, { color: COLORS.red, shape: 'orb', radius: 5.6, accel: 24, curve: Math.sin(t) * 0.06 });
        }
        if (this.bossTick('bounce', 2.4, dt, false)) {
          this.spawnFan(b.x, b.y, Math.PI / 2, 9, 2.2, 185, { color: COLORS.violet, shape: 'diamond', radius: 5.4, bounce: true, maxBounces: 1 });
        }
      } else if (b.phaseIndex === 1) {
        this.moveBoss(W / 2 + Math.sin(t * 0.32) * 52, 112, dt, 2.5);
        if (this.bossTick('wall', 0.76 - this.rank * 0.05, dt)) {
          const gap = W / 2 + Math.sin(t * 1.26) * 175;
          this.spawnBulletWall(gap, 96 - this.rank * 12, 184, Math.floor(t * 1.5) % 2 ? COLORS.red : COLORS.gold, 8);
        }
        if (this.bossTick('diag', 3.05, dt, false)) {
          const angle = Math.PI / 4 + Math.sin(t * 0.4) * 0.34;
          this.spawnLaser({ cx: W / 2, cy: H / 2, angle, length: H * 1.5, width: 22, warning: 0.95, active: 0.72, color: COLORS.red });
          this.spawnLaser({ cx: W / 2, cy: H / 2, angle: Math.PI - angle, length: H * 1.5, width: 22, warning: 0.95, active: 0.72, color: COLORS.gold });
        }
        if (this.bossTick('side', 1.15, dt)) {
          for (const side of [-1, 1]) {
            const x = side < 0 ? -12 : W + 12;
            const y = 170 + (Math.sin(t * 1.6 + side) * 0.5 + 0.5) * 400;
            this.spawnFan(x, y, side < 0 ? 0 : Math.PI, 5, 0.76, 178, { color: side < 0 ? COLORS.cyan : COLORS.pink, shape: 'star', radius: 5.1, curve: side * 0.06 });
          }
        }
      } else if (b.phaseIndex === 2) {
        this.moveBoss(W / 2 + Math.sin(t * 0.82) * 120, 150 + Math.sin(t * 1.3) * 44, dt, 3);
        if (this.bossTick('golden', 0.065 - this.rank * 0.008, dt)) {
          const golden = 2.399963229728653;
          const n = Math.floor(t / Math.max(0.045, 0.065 - this.rank * 0.008));
          const a = n * golden;
          for (let layer = 0; layer < 2; layer += 1) {
            this.spawnEnemyBullet({
              x: b.x, y: b.y,
              angle: a + layer * Math.PI,
              speed: this.bulletSpeed(118 + layer * 26),
              color: layer ? COLORS.pink : COLORS.gold,
              shape: layer ? 'diamond' : 'orb', radius: 5.2,
              curve: layer ? -0.11 : 0.11, accel: 18
            });
          }
        }
        if (this.bossTick('aim', 1.28, dt)) {
          this.spawnAimedFan(b.x, b.y + 22, 9, 0.92, 235, { color: COLORS.cyan, shape: 'needle', radius: 5.2, lead: 0.18 });
        }
        if (this.bossTick('ring', 2.25, dt, false)) {
          this.spawnRing(b.x, b.y, 34, 104, -t * 0.38, { color: COLORS.red, shape: 'star', radius: 5.2, curve: 0.07, accel: 16 });
        }
      } else {
        this.moveBoss(W / 2 + Math.sin(t * 0.96) * 180, 140 + Math.sin(t * 1.5) * 48, dt, 3.5);
        if (this.bossTick('finalRing', 0.55 - this.rank * 0.05, dt)) {
          const sign = Math.floor(t * 2) % 2 ? 1 : -1;
          this.spawnRing(b.x, b.y, 26, 135, t * sign * 0.77, {
            color: sign > 0 ? COLORS.gold : COLORS.pink,
            shape: sign > 0 ? 'orb' : 'diamond', radius: 5.4,
            curve: sign * 0.13, accel: 12
          });
        }
        if (this.bossTick('finalAim', 0.88, dt)) {
          this.spawnAimedFan(b.x, b.y + 24, 11, 1.1, 250, { color: COLORS.cyan, shape: 'needle', radius: 5.1, lead: 0.28, speedVariance: 0.18 });
        }
        if (this.bossTick('finalLaser', 2.85, dt, false)) {
          const a = t * 0.19;
          this.spawnLaser({ cx: W / 2, cy: H * 0.5, angle: a, length: H * 1.5, width: 20, warning: 0.86, active: 0.8, rotSpeed: 0.22, color: COLORS.gold });
          this.spawnLaser({ cx: W / 2, cy: H * 0.5, angle: a + Math.PI / 2, length: H * 1.5, width: 20, warning: 0.86, active: 0.8, rotSpeed: 0.22, color: COLORS.pink });
        }
        if (this.bossTick('finalWall', 1.42, dt, false)) {
          const gap = W / 2 + Math.sin(t * 1.7) * 178;
          this.spawnBulletWall(gap, 90, 200, COLORS.red, 4);
        }
      }
    }

    advanceBossPhase() {
      const b = this.boss;
      if (!b) return;
      const phase = b.phases[b.phaseIndex];
      const noHit = this.stats.hits === b.phaseStartHits;
      const timeRatio = clamp(1 - b.phaseAge / phase.duration, 0, 1);
      const phaseBonus = (24000 + b.phaseIndex * 8000) * (1 + timeRatio * 2) * (noHit ? 1.6 : 1) * this.multiplier();
      this.score += Math.floor(phaseBonus);
      this.cancelBullets(W / 2, H / 2, 1200, 'phase', true);
      this.clearLasers();
      this.spawnRadialBurst(b.x, b.y, 95, b.color, COLORS.gold);
      this.spawnExplosion(b.x, b.y, 2.2, b.color);
      this.flashScreen(COLORS.white, 0.46);
      this.addShake(19);
      this.hitStop = 0.12;
      this.audio.sfx('bigKill');
      this.shield = Math.min(this.maxShield, this.shield + 1);
      this.floatText(b.x, b.y - 70, noHit ? 'NO HIT BREAK' : (b.phaseTimeout ? 'TIME BREAK' : 'PHASE BREAK'), noHit ? COLORS.gold : b.color, 17);

      if (b.phaseIndex + 1 < b.phases.length) {
        this.setBossPhase(b.phaseIndex + 1);
      } else {
        this.defeatBoss();
      }
    }

    defeatBoss() {
      const b = this.boss;
      if (!b) return;
      const bx = b.x;
      const by = b.y;
      const color = b.color;
      const id = b.id;
      const challenge = b.challenge;
      this.score += Math.floor((90000 + id * 65000) * this.multiplier());
      this.stats.bosses += 1;
      this.cancelBullets(W / 2, H / 2, 1200, 'boss', true);
      this.clearLasers();
      this.spawnRadialBurst(bx, by, 170, color, COLORS.gold);
      for (let i = 0; i < 12; i += 1) {
        const a = i / 12 * TAU;
        this.spawnExplosion(bx + Math.cos(a) * rand(30, 130), by + Math.sin(a) * rand(30, 100), rand(0.7, 1.4), i % 2 ? color : COLORS.gold);
      }
      this.flashScreen(COLORS.white, 0.85);
      this.addShake(28);
      this.hitStop = 0.22;
      this.audio.sfx('victory');
      this.showBanner('BOSS ERASED', b.name, 2.2);
      this.boss = null;
      this.ui.bossHud.classList.add('boss-hud-hidden');
      this.sequenceLock = true;

      if (this.mode === 'story') {
        if (this.stageIndex < 2) {
          this.pendingTimer = 2.3;
          this.pendingAction = () => this.showUpgradeSelection();
        } else {
          this.pendingTimer = 3.0;
          this.pendingAction = () => this.finishRun(true, 'RITUAL COMPLETE');
        }
      } else {
        this.pendingTimer = 2.1;
        this.pendingAction = () => {
          this.sequenceLock = false;
          this.director.endlessClock = 1.2;
          if (this.mode === 'rush') {
            this.showToast(`BOSS ${this.stats.bosses} // CHAIN ON`, 1.4);
          } else {
            this.stageIndex = (this.stageIndex + 1) % 3;
            this.audio.setStage(this.stageIndex);
            this.showToast(`SECTOR ${this.endlessBossesSpawned + 1}`, 1.4);
          }
        };
      }
    }

    showUpgradeSelection() {
      if (this.state !== 'playing') return;
      this.state = 'upgrade';
      this.sequenceLock = true;
      this.audio.setMusicActive(false);
      const eligible = UPGRADES.filter((upgrade) => (this.upgradeLevels[upgrade.id] || 0) < upgrade.max);
      const pool = [...eligible];
      const choices = [];
      while (choices.length < 3 && pool.length) {
        const index = randInt(0, pool.length - 1);
        choices.push(pool.splice(index, 1)[0]);
      }
      while (choices.length < 3) choices.push(UPGRADES[randInt(0, UPGRADES.length - 1)]);
      this.currentUpgradeChoices = choices;
      this.ui.upgradeCards.innerHTML = '';
      choices.forEach((upgrade, index) => {
        const level = this.upgradeLevels[upgrade.id] || 0;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'upgrade-card';
        button.style.setProperty('--accent', upgrade.accent);
        button.innerHTML = `
          <span class="upgrade-icon">${upgrade.icon}</span>
          <strong>${upgrade.name}</strong>
          <p>${upgrade.desc}</p>
          <small>${index + 1} / LV ${level + 1}</small>
        `;
        button.addEventListener('click', () => this.chooseUpgrade(upgrade));
        this.ui.upgradeCards.appendChild(button);
      });
      this.ui.upgradeScreen.classList.add('overlay-visible');
      this.audio.sfx('phase');
    }

    chooseUpgrade(upgrade) {
      if (this.state !== 'upgrade') return;
      this.upgradeLevels[upgrade.id] = (this.upgradeLevels[upgrade.id] || 0) + 1;
      upgrade.apply(this.mods, this);
      this.ui.upgradeScreen.classList.remove('overlay-visible');
      this.audio.unlock();
      this.audio.sfx('drive');
      this.audio.setMusicActive(true);
      this.state = 'playing';
      this.sequenceLock = false;
      this.showToast(`${upgrade.icon} ${upgrade.name} // LV ${this.upgradeLevels[upgrade.id]}`, 1.8);
      this.startStage(this.stageIndex + 1, false);
      this.currentUpgradeChoices = null;
    }

    finishRun(victory, label = '') {
      if (this.state === 'result') return;
      this.state = 'result';
      this.sequenceLock = true;
      this.audio.setMusicActive(false);
      this.ui.hud.classList.add('hud-hidden');
      this.ui.danger.style.opacity = '0';
      const finalScore = Math.floor(this.score);
      const oldBest = this.save.best[this.mode] || 0;
      const isRecord = finalScore > oldBest;
      if (isRecord) this.save.best[this.mode] = finalScore;
      if (victory && this.mode === 'story') this.save.unlockedEndless = true;
      persistSave(this.save);

      this.ui.resultEyebrow.textContent = label || (victory ? 'RITUAL COMPLETE' : 'SIGNAL LOST');
      this.ui.resultTitle.textContent = victory ? (this.mode === 'rush' ? 'TIME CLEAR' : 'VICTORY') : 'GAME OVER';
      this.ui.resultScore.textContent = formatScore(finalScore);
      this.ui.resultChain.textContent = `x${this.stats.maxChain.toFixed(2)}`;
      this.ui.resultGraze.textContent = String(this.stats.graze);
      this.ui.resultKills.textContent = String(this.stats.kills);
      this.ui.resultGrade.textContent = this.finalGrade(victory);
      this.ui.newRecord.classList.toggle('visible', isRecord);
      this.hideAllOverlays();
      this.ui.resultScreen.classList.add('overlay-visible');
      this.updateTitleBest();
      if (victory) this.audio.sfx('victory');
    }

    finalGrade(victory) {
      const value = this.stats.maxChain * 14 + this.stats.graze * 0.035 + this.stats.bosses * 14 - this.stats.hits * 9 + (victory ? 18 : 0);
      if (value >= 130) return 'SSS';
      if (value >= 105) return 'SS';
      if (value >= 80) return 'S';
      if (value >= 58) return 'A';
      if (value >= 36) return 'B';
      return 'C';
    }

    updateHUD(force = false) {
      if (this.state === 'title' && !force) return;
      this.ui.score.textContent = formatScore(this.displayScore);
      const grade = this.hypeGrade();
      this.ui.hype.textContent = grade;
      this.ui.hype.className = `hype-grade grade-${grade.toLowerCase()}`;
      this.ui.mode.textContent = this.mode === 'story' ? 'STORY' : this.mode === 'rush' ? 'RUSH' : 'ENDLESS';
      if (this.mode === 'story') {
        this.ui.stage.textContent = `ACT ${this.stageIndex + 1}`;
      } else if (this.mode === 'rush') {
        const seconds = Math.ceil(this.modeTimer);
        const min = Math.floor(seconds / 60);
        const sec = String(seconds % 60).padStart(2, '0');
        this.ui.stage.textContent = `${min}:${sec}`;
      } else {
        this.ui.stage.textContent = `SECTOR ${Math.floor(this.runTime / 70) + 1}`;
      }

      const targetShieldCount = this.maxShield;
      if (this.ui.shields.children.length !== targetShieldCount) {
        this.ui.shields.innerHTML = Array.from({ length: targetShieldCount }, () => '<i></i>').join('');
      }
      [...this.ui.shields.children].forEach((pip, index) => pip.classList.toggle('empty', index >= this.shield));

      const driveValue = clamp(this.drive, 0, 100);
      this.ui.drive.textContent = `${Math.floor(driveValue)}%`;
      this.ui.driveFill.style.transform = `scaleX(${driveValue / 100})`;
      const ready = driveValue >= 99.5 && this.overdriveTime <= 0;
      this.ui.driveBar.classList.toggle('ready', ready);
      this.ui.touchDrive.classList.toggle('ready', ready);
      this.ui.chain.textContent = `x${this.multiplier().toFixed(2)}`;
      this.ui.sideChain.textContent = this.multiplier().toFixed(2);
      this.ui.sideSync.textContent = String(Math.floor(driveValue)).padStart(3, '0');
      this.ui.sideThreat.textContent = this.rank < 0.33 ? 'LOW' : this.rank < 0.55 ? 'RISING' : this.rank < 0.76 ? 'HIGH' : 'FATAL';

      if (this.boss) {
        this.ui.bossHud.classList.remove('boss-hud-hidden');
        this.ui.bossName.textContent = this.boss.name;
        this.ui.bossPhase.textContent = `PHASE ${this.boss.phaseIndex + 1}`;
        this.ui.bossFill.style.transform = `scaleX(${clamp(this.boss.hp / this.boss.maxHp, 0, 1)})`;
      } else {
        this.ui.bossHud.classList.add('boss-hud-hidden');
      }
    }

    render() {
      const ctx = this.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      this.drawBackground(ctx);

      const sx = this.save.settings.screenShake ? rand(-this.shake, this.shake) : 0;
      const sy = this.save.settings.screenShake ? rand(-this.shake, this.shake) : 0;
      ctx.save();
      ctx.translate(sx, sy);
      this.drawPickups(ctx);
      this.drawEnemyBullets(ctx);
      this.drawLasers(ctx);
      this.drawEnemies(ctx);
      this.drawBoss(ctx);
      this.drawPlayerBullets(ctx);
      this.drawParticles(ctx);
      if (this.state !== 'title') this.drawPlayer(ctx);
      this.drawFloaters(ctx);
      ctx.restore();

      if (this.overdriveTime > 0) this.drawOverdrivePost(ctx);
      if (this.banner) this.drawBanner(ctx);
      if (this.worldPrompt) this.drawWorldPrompt(ctx);
      if (this.flash > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = clamp(this.flash, 0, 0.86);
        ctx.fillStyle = this.flashColor;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
    }

    drawBackground(ctx) {
      const stage = this.stageIndex;
      const themes = [
        ['#05040d', '#0b0a28', '#061a23'],
        ['#040817', '#071f34', '#160b2d'],
        ['#080309', '#24070e', '#0a061a']
      ];
      const theme = themes[stage] || themes[0];
      const gradient = ctx.createLinearGradient(0, 0, 0, H);
      gradient.addColorStop(0, theme[0]);
      gradient.addColorStop(0.55, theme[1]);
      gradient.addColorStop(1, theme[2]);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, W, H);

      const speedBoost = 1 + this.rank * 1.2 + (this.overdriveTime > 0 ? 1.5 : 0);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const star of this.stars) {
        const y = ((star.y + this.backgroundTime * (24 + star.z * 90) * speedBoost) % (H + 30)) - 15;
        const x = star.x + Math.sin(this.backgroundTime * 0.23 + star.tw) * star.z * 7;
        const alpha = 0.15 + star.z * 0.62;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = stage === 2 && star.z > 0.66 ? COLORS.red : stage === 1 ? COLORS.cyanSoft : COLORS.white;
        const len = 1 + star.z * (4 + this.rank * 8);
        ctx.fillRect(x, y, Math.max(0.8, star.z * 1.7), len);
      }
      ctx.restore();

      if (stage === 0) this.drawCityBackground(ctx);
      else if (stage === 1) this.drawGlassBackground(ctx);
      else this.drawZeroSunBackground(ctx);

      const vignette = ctx.createRadialGradient(W / 2, H * 0.48, H * 0.12, W / 2, H * 0.48, H * 0.72);
      vignette.addColorStop(0, 'rgba(0,0,0,0)');
      vignette.addColorStop(1, 'rgba(0,0,0,0.62)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, W, H);
    }

    drawCityBackground(ctx) {
      const horizon = 325;
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.strokeStyle = COLORS.cyan;
      ctx.lineWidth = 1;
      const scroll = (this.backgroundTime * 85) % 54;
      for (let y = horizon; y < H + 60; y += 54) {
        const t = (y - horizon + scroll) / (H - horizon);
        const yy = horizon + t * t * (H - horizon);
        ctx.beginPath();
        ctx.moveTo(0, yy);
        ctx.lineTo(W, yy);
        ctx.stroke();
      }
      for (let i = -6; i <= 6; i += 1) {
        ctx.beginPath();
        ctx.moveTo(W / 2, horizon);
        ctx.lineTo(W / 2 + i * 110, H);
        ctx.stroke();
      }
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = 0.22;
      for (let side = 0; side < 2; side += 1) {
        for (let i = 0; i < this.cityBlocks.length; i += 1) {
          const block = this.cityBlocks[i];
          const x = side === 0 ? block.x - 120 : W - block.x + 90;
          const parallax = (this.backgroundTime * (8 + i % 3 * 2)) % (W + 160);
          const bx = side === 0 ? x - parallax * 0.06 : x + parallax * 0.06;
          const y = horizon - block.h;
          ctx.fillStyle = i % 2 ? 'rgba(18,32,65,0.75)' : 'rgba(25,14,51,0.8)';
          ctx.fillRect(bx, y, block.w, block.h + 12);
          ctx.fillStyle = i % 3 ? colorWithAlpha(COLORS.cyan, 0.38) : colorWithAlpha(COLORS.pink, 0.38);
          const rows = Math.floor(block.h / 22);
          for (let r = 0; r < rows; r += 1) {
            if ((r + i) % 3 === 0) ctx.fillRect(bx + 6, y + 9 + r * 20, Math.max(2, block.w - 12), 2);
          }
        }
      }
      ctx.restore();
    }

    drawGlassBackground(ctx) {
      ctx.save();
      ctx.translate(W / 2, H * 0.45);
      ctx.globalCompositeOperation = 'lighter';
      for (let layer = 0; layer < 7; layer += 1) {
        const radius = 90 + layer * 62 + Math.sin(this.backgroundTime * 0.6 + layer) * 12;
        const sides = 5 + (layer % 4);
        ctx.rotate((layer % 2 ? 1 : -1) * this.backgroundTime * 0.025);
        ctx.strokeStyle = layer % 2 ? colorWithAlpha(COLORS.cyan, 0.1) : colorWithAlpha(COLORS.violet, 0.1);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let i = 0; i <= sides; i += 1) {
          const a = i / sides * TAU;
          const x = Math.cos(a) * radius;
          const y = Math.sin(a) * radius * 0.72;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = 0.07;
      ctx.fillStyle = COLORS.cyan;
      const offset = (this.backgroundTime * 18) % 90;
      for (let y = -90 + offset; y < H; y += 90) {
        ctx.beginPath();
        ctx.moveTo(0, y + 50);
        ctx.lineTo(W / 2, y);
        ctx.lineTo(W, y + 50);
        ctx.lineTo(W / 2, y + 100);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    drawZeroSunBackground(ctx) {
      const cx = W / 2;
      const cy = 255;
      ctx.save();
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 205);
      glow.addColorStop(0, 'rgba(255,247,214,0.75)');
      glow.addColorStop(0.08, 'rgba(255,61,76,0.48)');
      glow.addColorStop(0.36, 'rgba(255,24,91,0.10)');
      glow.addColorStop(1, 'rgba(255,0,80,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(cx - 220, cy - 220, 440, 440);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = colorWithAlpha(COLORS.red, 0.17);
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 10; i += 1) {
        const r = 62 + i * 30 + Math.sin(this.backgroundTime * 0.8 + i) * 7;
        ctx.beginPath();
        ctx.ellipse(cx, cy, r, r * 0.42, this.backgroundTime * 0.06 * (i % 2 ? 1 : -1), 0, TAU);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#020208';
      ctx.beginPath();
      ctx.arc(cx, cy, 47 + Math.sin(this.backgroundTime * 1.8) * 3, 0, TAU);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = 0.12;
      ctx.strokeStyle = COLORS.gold;
      for (let i = 0; i < 24; i += 1) {
        const a = i / 24 * TAU + this.backgroundTime * 0.09;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * 75, cy + Math.sin(a) * 75);
        ctx.lineTo(cx + Math.cos(a) * 340, cy + Math.sin(a) * 340);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawPickups(ctx) {
      if (!this.pickups.length) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const item of this.pickups) {
        const sprite = this.sprites.pickups.get(item.type) || this.sprites.pickups.get('score');
        const pulse = 18 + Math.sin(item.age * 8) * 2;
        ctx.save();
        ctx.translate(item.x, item.y);
        ctx.rotate(item.rotation);
        ctx.globalAlpha = clamp(item.life, 0, 1);
        ctx.drawImage(sprite, -pulse, -pulse, pulse * 2, pulse * 2);
        ctx.restore();
      }
      ctx.restore();
    }

    drawEnemyBullets(ctx) {
      if (!this.enemyBullets.length) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const b of this.enemyBullets) {
        const sprite = this.sprites.bullets.get(`${b.color}-${b.shape}`) || this.sprites.bullets.get(`${COLORS.pink}-orb`);
        const size = b.radius * (b.shape === 'needle' ? 4.4 : 3.6) * b.scale;
        const alpha = b.delay > 0 ? clamp(1 - b.delay * 2.4, 0.12, 0.55) : b.alpha;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.rotation);
        ctx.globalAlpha = alpha;
        ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
        ctx.restore();
      }
      ctx.restore();
    }

    drawLasers(ctx) {
      if (!this.lasers.length) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const l of this.lasers) {
        const half = l.length / 2;
        const dx = Math.cos(l.angle) * half;
        const dy = Math.sin(l.angle) * half;
        const x1 = l.cx - dx;
        const y1 = l.cy - dy;
        const x2 = l.cx + dx;
        const y2 = l.cy + dy;
        if (l.age < l.warning) {
          const progress = l.age / l.warning;
          ctx.save();
          ctx.setLineDash([12, 10]);
          ctx.lineDashOffset = -this.backgroundTime * 80;
          ctx.strokeStyle = colorWithAlpha(l.color, 0.24 + progress * 0.48);
          ctx.lineWidth = 2 + progress * 2;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        } else {
          const remaining = clamp((l.life - l.age) / Math.max(0.01, l.active), 0, 1);
          const pulse = 0.86 + Math.sin(l.pulse) * 0.14;
          ctx.strokeStyle = colorWithAlpha(l.color, 0.18 * remaining);
          ctx.lineWidth = l.width * 3.2 * pulse;
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
          ctx.strokeStyle = colorWithAlpha(l.color, 0.66 * remaining);
          ctx.lineWidth = l.width * 1.45 * pulse;
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
          ctx.strokeStyle = colorWithAlpha(COLORS.white, 0.88 * remaining);
          ctx.lineWidth = Math.max(2, l.width * 0.34 * pulse);
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        }
      }
      ctx.restore();
    }

    drawEnemies(ctx) {
      if (!this.enemies.length) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const e of this.enemies) {
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(e.rotation * 0.35);
        const hurt = clamp(e.hp / e.maxHp, 0, 1);
        ctx.globalAlpha = e.y < -10 ? clamp((e.y + 50) / 40, 0, 1) : 1;
        ctx.shadowColor = e.color;
        ctx.shadowBlur = e.armored ? 20 : 12;
        ctx.strokeStyle = e.color;
        ctx.fillStyle = colorWithAlpha(e.color, 0.16 + hurt * 0.09);
        ctx.lineWidth = e.armored ? 2.3 : 1.5;

        if (e.type === 'scout') {
          ctx.beginPath();
          ctx.moveTo(0, 18);
          ctx.lineTo(-13, -11);
          ctx.lineTo(-5, -7);
          ctx.lineTo(0, -17);
          ctx.lineTo(5, -7);
          ctx.lineTo(13, -11);
          ctx.closePath();
          ctx.fill(); ctx.stroke();
          ctx.fillStyle = COLORS.white;
          ctx.fillRect(-2, -4, 4, 8);
        } else if (e.type === 'diver') {
          ctx.rotate(e.side > 0 ? -Math.PI / 2 : Math.PI / 2);
          ctx.beginPath();
          ctx.moveTo(20, 0);
          ctx.lineTo(-9, -13);
          ctx.lineTo(-3, 0);
          ctx.lineTo(-9, 13);
          ctx.closePath();
          ctx.fill(); ctx.stroke();
          ctx.beginPath();
          ctx.arc(-3, 0, 4, 0, TAU);
          ctx.fillStyle = COLORS.white;
          ctx.fill();
        } else if (e.type === 'spinner') {
          for (let k = 0; k < 4; k += 1) {
            ctx.rotate(Math.PI / 2);
            ctx.beginPath();
            ctx.moveTo(5, 0);
            ctx.lineTo(23, -6);
            ctx.lineTo(18, 5);
            ctx.closePath();
            ctx.fill(); ctx.stroke();
          }
          ctx.beginPath();
          ctx.arc(0, 0, 10, 0, TAU);
          ctx.fillStyle = colorWithAlpha(COLORS.white, 0.78);
          ctx.fill();
          ctx.strokeStyle = e.color;
          ctx.stroke();
        } else if (e.type === 'turret') {
          ctx.rotate(Math.PI / 4);
          ctx.fillRect(-15, -15, 30, 30);
          ctx.strokeRect(-15, -15, 30, 30);
          ctx.rotate(-Math.PI / 4);
          ctx.fillStyle = colorWithAlpha(COLORS.white, 0.68);
          ctx.fillRect(-4, -4, 8, 17);
          ctx.strokeStyle = e.color;
          ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); ctx.stroke();
        } else if (e.type === 'orbiter') {
          ctx.beginPath();
          ctx.arc(0, 0, 16, 0, TAU);
          ctx.fill(); ctx.stroke();
          for (let k = 0; k < 3; k += 1) {
            const a = k / 3 * TAU + e.age * e.side;
            ctx.beginPath();
            ctx.arc(Math.cos(a) * 24, Math.sin(a) * 24, 4, 0, TAU);
            ctx.fillStyle = k % 2 ? COLORS.pink : COLORS.cyan;
            ctx.fill();
          }
          ctx.fillStyle = COLORS.white;
          ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.fill();
        } else if (e.type === 'carrier') {
          ctx.beginPath();
          ctx.moveTo(0, 40);
          ctx.lineTo(-38, 14);
          ctx.lineTo(-30, -27);
          ctx.lineTo(-9, -18);
          ctx.lineTo(0, -36);
          ctx.lineTo(9, -18);
          ctx.lineTo(30, -27);
          ctx.lineTo(38, 14);
          ctx.closePath();
          ctx.fill(); ctx.stroke();
          ctx.strokeStyle = colorWithAlpha(COLORS.white, 0.55);
          ctx.beginPath();
          ctx.moveTo(-25, 8); ctx.lineTo(0, 23); ctx.lineTo(25, 8);
          ctx.stroke();
          ctx.fillStyle = COLORS.white;
          ctx.beginPath(); ctx.arc(0, -3, 9, 0, TAU); ctx.fill();
        } else {
          for (let k = 0; k < 6; k += 1) {
            const a = k / 6 * TAU;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * 10, Math.sin(a) * 10);
            ctx.lineTo(Math.cos(a - 0.18) * 34, Math.sin(a - 0.18) * 34);
            ctx.lineTo(Math.cos(a + 0.18) * 34, Math.sin(a + 0.18) * 34);
            ctx.closePath();
            ctx.fill(); ctx.stroke();
          }
          ctx.beginPath(); ctx.arc(0, 0, 14, 0, TAU);
          ctx.fillStyle = colorWithAlpha(COLORS.white, 0.75); ctx.fill();
          ctx.strokeStyle = e.color; ctx.stroke();
        }

        if (e.armored) {
          ctx.strokeStyle = colorWithAlpha(COLORS.gold, 0.7);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(0, 0, e.radius + 7 + Math.sin(e.age * 4) * 2, 0, TAU);
          ctx.stroke();
        }
        ctx.restore();

        if (e.type === 'carrier' || e.type === 'elite') {
          const ratio = clamp(e.hp / e.maxHp, 0, 1);
          ctx.save();
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = 'rgba(255,255,255,0.08)';
          ctx.fillRect(e.x - e.radius, e.y + e.radius + 9, e.radius * 2, 3);
          ctx.fillStyle = e.color;
          ctx.fillRect(e.x - e.radius, e.y + e.radius + 9, e.radius * 2 * ratio, 3);
          ctx.restore();
        }
      }
      ctx.restore();
    }

    drawBoss(ctx) {
      const b = this.boss;
      if (!b) return;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.globalCompositeOperation = 'lighter';
      const introAlpha = b.intro > 0 ? clamp(1 - b.intro / 2.2, 0, 1) : 1;
      ctx.globalAlpha = introAlpha;
      const pulse = 1 + Math.sin(b.age * 4) * 0.04;
      ctx.scale(pulse, pulse);
      ctx.rotate(b.rotation * 0.25);
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 28;
      ctx.strokeStyle = b.color;
      ctx.fillStyle = colorWithAlpha(b.color, 0.13);
      ctx.lineWidth = 2;

      if (b.id === 0) {
        for (let k = 0; k < 8; k += 1) {
          const a = k / 8 * TAU;
          ctx.save();
          ctx.rotate(a + Math.sin(b.age * 0.7) * 0.12);
          ctx.beginPath();
          ctx.moveTo(16, 0);
          ctx.quadraticCurveTo(53, -17, 72, 0);
          ctx.quadraticCurveTo(53, 17, 16, 0);
          ctx.fill(); ctx.stroke();
          ctx.restore();
        }
        ctx.beginPath(); ctx.arc(0, 0, 31, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = colorWithAlpha(COLORS.white, 0.72);
        ctx.beginPath(); ctx.arc(0, 0, 18, 0, TAU); ctx.stroke();
        ctx.fillStyle = COLORS.white;
        ctx.beginPath(); ctx.arc(Math.sin(b.age * 1.7) * 7, 0, 7, 0, TAU); ctx.fill();
      } else if (b.id === 1) {
        for (const side of [-1, 1]) {
          ctx.save();
          ctx.scale(side, 1);
          ctx.beginPath();
          ctx.moveTo(0, -48);
          ctx.lineTo(66, -15);
          ctx.lineTo(49, 36);
          ctx.lineTo(16, 52);
          ctx.lineTo(25, 12);
          ctx.closePath();
          ctx.fill(); ctx.stroke();
          ctx.restore();
        }
        ctx.rotate(-b.rotation * 0.8);
        ctx.beginPath();
        for (let k = 0; k < 6; k += 1) {
          const a = k / 6 * TAU;
          const x = Math.cos(a) * 30;
          const y = Math.sin(a) * 30;
          if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = COLORS.white;
        ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); ctx.fill();
      } else {
        for (let ring = 0; ring < 3; ring += 1) {
          ctx.save();
          ctx.rotate((ring % 2 ? -1 : 1) * b.age * (0.23 + ring * 0.07));
          ctx.strokeStyle = ring === 1 ? COLORS.red : ring === 2 ? COLORS.gold : b.color;
          const radius = 35 + ring * 23;
          for (let k = 0; k < 9 + ring * 2; k += 1) {
            const a = k / (9 + ring * 2) * TAU;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * (radius - 10), Math.sin(a) * (radius - 10));
            ctx.lineTo(Math.cos(a - 0.09) * (radius + 12), Math.sin(a - 0.09) * (radius + 12));
            ctx.lineTo(Math.cos(a + 0.09) * (radius + 12), Math.sin(a + 0.09) * (radius + 12));
            ctx.closePath();
            ctx.fill(); ctx.stroke();
          }
          ctx.restore();
        }
        ctx.fillStyle = '#020208';
        ctx.beginPath(); ctx.arc(0, 0, 24, 0, TAU); ctx.fill();
        ctx.strokeStyle = COLORS.white;
        ctx.beginPath(); ctx.arc(0, 0, 16 + Math.sin(b.age * 5) * 3, 0, TAU); ctx.stroke();
      }

      ctx.restore();

      if (b.intro <= 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = colorWithAlpha(b.color, 0.18);
        ctx.lineWidth = 1;
        for (let i = 0; i < 3; i += 1) {
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.radius + 16 + i * 13 + Math.sin(b.age * 1.3 + i) * 4, 0, TAU);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    drawPlayerBullets(ctx) {
      if (!this.playerBullets.length) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (const b of this.playerBullets) {
        if (b.type === 'missile') {
          ctx.save();
          ctx.translate(b.x, b.y);
          ctx.rotate(b.rotation);
          ctx.shadowColor = COLORS.gold;
          ctx.shadowBlur = 12;
          ctx.fillStyle = COLORS.gold;
          ctx.beginPath();
          ctx.moveTo(0, -10);
          ctx.lineTo(5, 7);
          ctx.lineTo(0, 4);
          ctx.lineTo(-5, 7);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        } else {
          ctx.strokeStyle = b.color;
          ctx.shadowColor = b.color;
          ctx.shadowBlur = b.type === 'lance' ? 13 : 7;
          ctx.lineWidth = b.radius * (b.type === 'lance' ? 1.4 : 0.9);
          ctx.globalAlpha = 0.82;
          ctx.beginPath();
          ctx.moveTo(b.x, b.y + (b.type === 'lance' ? 20 : 10));
          ctx.lineTo(b.x - b.vx * 0.016, b.y - b.vy * 0.016);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
      ctx.restore();
    }

    drawParticles(ctx) {
      if (!this.particles.length) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (const p of this.particles) {
        const ratio = clamp(p.life / p.maxLife, 0, 1);
        const alpha = ratio * p.alpha;
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = p.color;
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = p.type === 'ring' ? 10 : 6;
        if (p.type === 'ring') {
          const progress = 1 - ratio;
          const radius = p.targetRadius * easeOutCubic(progress);
          ctx.lineWidth = Math.max(0.5, p.lineWidth * ratio);
          ctx.beginPath();
          ctx.arc(p.x, p.y, radius, 0, TAU);
          ctx.stroke();
        } else if (p.type === 'line') {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rotation || Math.atan2(p.vy, p.vx));
          ctx.lineWidth = Math.max(0.5, p.size * ratio);
          ctx.beginPath();
          ctx.moveTo(-p.size * 2.4, 0);
          ctx.lineTo(p.size * 2.4, 0);
          ctx.stroke();
          ctx.restore();
        } else {
          const size = Math.max(0.4, p.size * (0.35 + ratio * 0.8));
          ctx.beginPath();
          ctx.arc(p.x, p.y, size, 0, TAU);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    drawPlayer(ctx) {
      const p = this.player;
      const flicker = p.invuln > 0 && Math.floor(p.invuln * 24) % 2 === 0;
      const over = this.overdriveTime > 0;
      const pulse = 0.5 + Math.sin(p.auraPulse * (over ? 11 : 5)) * 0.5;

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      if (over) {
        const aura = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, 86 + pulse * 15);
        aura.addColorStop(0, colorWithAlpha(COLORS.white, 0.4));
        aura.addColorStop(0.18, colorWithAlpha(COLORS.cyan, 0.24));
        aura.addColorStop(0.55, colorWithAlpha(COLORS.pink, 0.12));
        aura.addColorStop(1, colorWithAlpha(COLORS.pink, 0));
        ctx.fillStyle = aura;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 104, 0, TAU);
        ctx.fill();

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(-this.backgroundTime * 1.7);
        ctx.strokeStyle = colorWithAlpha(COLORS.pink, 0.5);
        ctx.lineWidth = 1.5;
        ctx.setLineDash([9, 13]);
        ctx.lineDashOffset = this.backgroundTime * 42;
        ctx.beginPath();
        ctx.arc(0, 0, 48 + pulse * 5, 0, TAU);
        ctx.stroke();
        ctx.rotate(this.backgroundTime * 3.2);
        ctx.strokeStyle = colorWithAlpha(COLORS.cyan, 0.58);
        ctx.beginPath();
        ctx.arc(0, 0, 67 - pulse * 4, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      const drones = this.getDronePositions();
      for (let i = 0; i < drones.length; i += 1) {
        const d = drones[i];
        const c = i % 2 ? COLORS.pink : COLORS.violet;
        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.rotate(this.backgroundTime * (i % 2 ? -3.2 : 3.2) + i);
        ctx.shadowColor = c;
        ctx.shadowBlur = over ? 20 : 12;
        ctx.strokeStyle = c;
        ctx.fillStyle = colorWithAlpha(c, over ? 0.32 : 0.18);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(0, -9);
        ctx.lineTo(7, 0);
        ctx.lineTo(0, 9);
        ctx.lineTo(-7, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = COLORS.white;
        ctx.globalAlpha = 0.72 + pulse * 0.28;
        ctx.beginPath();
        ctx.arc(0, 0, 2.2, 0, TAU);
        ctx.fill();
        ctx.restore();
      }

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.tilt * 0.24);
      ctx.globalAlpha = flicker ? 0.28 : 1;

      if (p.invuln > 0) {
        ctx.strokeStyle = colorWithAlpha(COLORS.white, 0.22 + pulse * 0.42);
        ctx.shadowColor = COLORS.cyan;
        ctx.shadowBlur = 17;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(0, 0, 27 + pulse * 4, 0, TAU);
        ctx.stroke();
      }

      ctx.shadowColor = over ? COLORS.pink : COLORS.cyan;
      ctx.shadowBlur = over ? 25 : 15;

      const exhaust = 18 + Math.abs(Math.sin(this.backgroundTime * 24)) * 12 + (over ? 18 : 0);
      const exhaustGradient = ctx.createLinearGradient(0, 9, 0, 9 + exhaust);
      exhaustGradient.addColorStop(0, colorWithAlpha(COLORS.white, 0.95));
      exhaustGradient.addColorStop(0.25, colorWithAlpha(over ? COLORS.pink : COLORS.cyan, 0.86));
      exhaustGradient.addColorStop(1, colorWithAlpha(over ? COLORS.pink : COLORS.cyan, 0));
      ctx.fillStyle = exhaustGradient;
      ctx.beginPath();
      ctx.moveTo(-6, 10);
      ctx.quadraticCurveTo(-1, 15 + exhaust, 0, 17 + exhaust);
      ctx.quadraticCurveTo(1, 15 + exhaust, 6, 10);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = colorWithAlpha(over ? COLORS.pink : COLORS.cyan, 0.19);
      ctx.strokeStyle = over ? COLORS.pinkSoft : COLORS.cyanSoft;
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      ctx.moveTo(0, -25);
      ctx.lineTo(8, -5);
      ctx.lineTo(23, 13);
      ctx.lineTo(7, 9);
      ctx.lineTo(0, 20);
      ctx.lineTo(-7, 9);
      ctx.lineTo(-23, 13);
      ctx.lineTo(-8, -5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = colorWithAlpha(COLORS.white, 0.68);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -17);
      ctx.lineTo(0, 12);
      ctx.moveTo(-17, 9);
      ctx.lineTo(-5, 1);
      ctx.moveTo(17, 9);
      ctx.lineTo(5, 1);
      ctx.stroke();

      ctx.fillStyle = COLORS.white;
      ctx.shadowColor = over ? COLORS.gold : COLORS.cyan;
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(0, -3, over ? 5.7 : 4.3, 0, TAU);
      ctx.fill();
      ctx.fillStyle = over ? COLORS.gold : COLORS.cyan;
      ctx.beginPath();
      ctx.arc(0, -3, 2.2, 0, TAU);
      ctx.fill();

      ctx.restore();

      if (p.focus || this.save.settings.showHitbox) {
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.translate(p.x, p.y);
        ctx.globalAlpha = flicker ? 0.35 : 1;
        ctx.fillStyle = COLORS.white;
        ctx.shadowColor = COLORS.red;
        ctx.shadowBlur = 9;
        ctx.beginPath();
        ctx.arc(0, 0, p.radius, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = COLORS.red;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.arc(0, 0, p.radius + 3.2, 0, TAU);
        ctx.stroke();
        if (p.focus) {
          ctx.strokeStyle = colorWithAlpha(COLORS.cyan, 0.2 + pulse * 0.18);
          ctx.lineWidth = 1;
          ctx.setLineDash([5, 8]);
          ctx.lineDashOffset = -this.backgroundTime * 25;
          ctx.beginPath();
          ctx.arc(0, 0, p.grazeRadius, 0, TAU);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.restore();
      }

      ctx.restore();
    }

    drawFloaters(ctx) {
      if (!this.floaters.length) return;
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const f of this.floaters) {
        const ratio = clamp(f.life / f.maxLife, 0, 1);
        const appear = clamp((1 - ratio) * 6, 0, 1);
        const alpha = Math.min(appear, ratio * 1.8);
        ctx.globalAlpha = alpha;
        ctx.font = `800 ${Math.max(9, f.size)}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
        ctx.lineWidth = Math.max(2, f.size * 0.26);
        ctx.strokeStyle = 'rgba(2,2,10,0.88)';
        ctx.strokeText(f.text, f.x, f.y);
        ctx.fillStyle = f.color;
        ctx.shadowColor = f.color;
        ctx.shadowBlur = 8;
        ctx.fillText(f.text, f.x, f.y);
      }
      ctx.restore();
    }

    drawOverdrivePost(ctx) {
      const strength = clamp(this.overdriveTime / Math.max(0.001, this.overdriveMax), 0, 1);
      const pulse = 0.5 + Math.sin(this.backgroundTime * 13) * 0.5;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';

      const edge = ctx.createRadialGradient(W / 2, H / 2, H * 0.18, W / 2, H / 2, H * 0.68);
      edge.addColorStop(0, 'rgba(0,0,0,0)');
      edge.addColorStop(0.62, colorWithAlpha(COLORS.cyan, 0.025 + pulse * 0.018));
      edge.addColorStop(1, colorWithAlpha(COLORS.pink, 0.11 + pulse * 0.045));
      ctx.fillStyle = edge;
      ctx.fillRect(0, 0, W, H);

      ctx.globalAlpha = 0.055 + pulse * 0.04;
      ctx.fillStyle = COLORS.cyan;
      for (let y = (this.backgroundTime * 180) % 8; y < H; y += 8) {
        ctx.fillRect(0, y, W, 1);
      }

      ctx.globalAlpha = 0.16 + pulse * 0.09;
      ctx.strokeStyle = COLORS.pink;
      ctx.lineWidth = 2;
      const inset = 9 + pulse * 4;
      ctx.strokeRect(inset, inset, W - inset * 2, H - inset * 2);

      ctx.globalAlpha = 0.08 + strength * 0.08;
      ctx.fillStyle = COLORS.white;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '900 52px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
      ctx.fillText('OVERDRIVE', W / 2, H * 0.72);
      ctx.restore();
    }

    drawBanner(ctx) {
      const b = this.banner;
      if (!b) return;
      const elapsed = b.max - b.time;
      const enter = easeOutCubic(clamp(elapsed / 0.48, 0, 1));
      const exit = easeInOutCubic(clamp(b.time / 0.55, 0, 1));
      const alpha = Math.min(enter, exit);
      const slide = (1 - enter) * 70 - (1 - exit) * 35;
      const y = H * 0.315;

      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.translate(slide, 0);
      ctx.globalAlpha = alpha;

      const band = ctx.createLinearGradient(0, y - 58, 0, y + 55);
      band.addColorStop(0, 'rgba(3,3,14,0)');
      band.addColorStop(0.35, 'rgba(3,3,14,0.72)');
      band.addColorStop(0.65, 'rgba(3,3,14,0.72)');
      band.addColorStop(1, 'rgba(3,3,14,0)');
      ctx.fillStyle = band;
      ctx.fillRect(0, y - 70, W, 140);

      ctx.strokeStyle = colorWithAlpha(COLORS.cyan, 0.58);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(48, y - 36);
      ctx.lineTo(188, y - 36);
      ctx.moveTo(W - 188, y - 36);
      ctx.lineTo(W - 48, y - 36);
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '900 38px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
      ctx.fillStyle = COLORS.white;
      ctx.shadowColor = COLORS.cyan;
      ctx.shadowBlur = 18;
      ctx.fillText(b.title, W / 2, y - 4);

      ctx.shadowBlur = 9;
      ctx.font = '700 14px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
      ctx.fillStyle = COLORS.pinkSoft;
      ctx.letterSpacing = '0.18em';
      ctx.fillText(b.subtitle, W / 2, y + 32);
      ctx.restore();
    }

    drawWorldPrompt(ctx) {
      const prompt = this.worldPrompt;
      if (!prompt) return;
      const elapsed = prompt.max - prompt.time;
      const enter = easeOutCubic(clamp(elapsed / 0.25, 0, 1));
      const exit = clamp(prompt.time / 0.35, 0, 1);
      const alpha = Math.min(enter, exit);
      const pulse = 0.5 + Math.sin(this.backgroundTime * 9) * 0.5;
      const y = clamp(this.player.y - 92, 150, H - 180);

      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = alpha;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '900 16px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(1,1,8,0.9)';
      ctx.strokeText(prompt.text, this.player.x, y);
      ctx.fillStyle = prompt.color;
      ctx.shadowColor = prompt.color;
      ctx.shadowBlur = 12 + pulse * 10;
      ctx.fillText(prompt.text, this.player.x, y);
      ctx.strokeStyle = colorWithAlpha(prompt.color, 0.45 + pulse * 0.3);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(this.player.x - 78 - pulse * 8, y + 17);
      ctx.lineTo(this.player.x - 22, y + 17);
      ctx.moveTo(this.player.x + 22, y + 17);
      ctx.lineTo(this.player.x + 78 + pulse * 8, y + 17);
      ctx.stroke();
      ctx.restore();
    }
  }

  const canvas = $('#game');
  const save = loadSave();
  const input = new Input(canvas);
  const audio = new AudioEngine(save);
  const game = new Game(canvas, input, audio, save);

  // Deliberately exposed for deterministic QA and accessibility tooling.
  window.__NEON_OVERDRIVE__ = game;

  let previousTime = performance.now();
  let accumulator = 0;
  const maxCatchUpSteps = 5;

  function frame(now) {
    const frameTime = Math.min(0.1, Math.max(0, (now - previousTime) / 1000));
    previousTime = now;
    accumulator += frameTime;

    let steps = 0;
    while (accumulator >= FIXED_DT && steps < maxCatchUpSteps) {
      game.update(FIXED_DT);
      accumulator -= FIXED_DT;
      steps += 1;
    }
    if (steps === maxCatchUpSteps) accumulator = 0;

    game.render();
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();
