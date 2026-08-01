(() => {
  'use strict';
  const PLO = window.PLO = window.PLO || {};

  const CONFIG = Object.freeze({
    VERSION: '1.1.0',
    COLS: 7,
    VISIBLE_ROWS: 12,
    HIDDEN_ROWS: 2,
    ROWS: 14,
    CENTER_COL: 3,
    COLORS: 4,
    MAX_CP: 999,
    CAST_MIN_CP: 100,
    BASE_GRAVITY_MS: 820,
    MIN_GRAVITY_MS: 180,
    SOFT_DROP_MS: 45,
    LOCK_DELAY_MS: 420,
    CLEAR_FLASH_MS: 190,
    FALL_SETTLE_MS: 150,
    SPAWN_DELAY_MS: 100,
    ATTACK_TRAVEL_MS: 650,
    BLITZ_SECONDS: 90,
    PULSE_BASE_CHANCE: 0.032,
    PULSE_PITY_START: 14,
    PULSE_PITY_STEP: 0.012,
    PULSE_MAX_CHANCE: 0.16,
    REGULAR_CP: 2,
    PULSE_CP: 100,
    STORAGE_KEY: 'pulse-link-overdrive.save.v1',
    COLOR_HEX: ['#19d7ff', '#ff4fd8', '#a8ff45', '#ffc94a'],
    COLOR_DARK: ['#05739f', '#972278', '#4a8e1f', '#a86f14'],
    COLOR_LIGHT: ['#d8fbff', '#ffd7f7', '#edffd3', '#fff2bf'],
    ROT_OFFSETS: Object.freeze([
      Object.freeze([[0, 0], [0, -1]]),
      Object.freeze([[0, 0], [1, 0]]),
      Object.freeze([[0, 0], [0, 1]]),
      Object.freeze([[0, 0], [-1, 0]])
    ]),
    DIFFICULTY: Object.freeze([
      Object.freeze({ name: 'SOFT', aiStep: 210, noise: 80, lookahead: 0, gravityScale: 1.06, decisionDelay: 420 }),
      Object.freeze({ name: 'CORE', aiStep: 145, noise: 34, lookahead: 0, gravityScale: 1.0, decisionDelay: 250 }),
      Object.freeze({ name: 'HARD', aiStep: 95, noise: 12, lookahead: 1, gravityScale: .94, decisionDelay: 130 }),
      Object.freeze({ name: 'APEX', aiStep: 62, noise: 2.5, lookahead: 1, gravityScale: .88, decisionDelay: 70 })
    ]),
    PROFILES: Object.freeze([
      Object.freeze({ id: 'rush', label: 'RUSH', attackAt: 100, defendDanger: .72, chainWeight: .8, pulseWeight: .85, centerPenalty: 1.0, attackBias: 1.3 }),
      Object.freeze({ id: 'vault', label: 'VAULT', attackAt: 360, defendDanger: .62, chainWeight: 1.0, pulseWeight: 1.1, centerPenalty: 1.2, attackBias: .7 }),
      Object.freeze({ id: 'weaver', label: 'WEAVER', attackAt: 210, defendDanger: .67, chainWeight: 1.45, pulseWeight: 1.2, centerPenalty: 1.0, attackBias: .85 }),
      Object.freeze({ id: 'mirror', label: 'MIRROR', attackAt: 170, defendDanger: .60, chainWeight: 1.1, pulseWeight: 1.0, centerPenalty: 1.15, attackBias: 1.0 }),
      Object.freeze({ id: 'apex', label: 'APEX', attackAt: 140, defendDanger: .52, chainWeight: 1.55, pulseWeight: 1.25, centerPenalty: 1.45, attackBias: 1.15 })
    ])
  });

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const invLerp = (a, b, v) => clamp((v - a) / (b - a || 1), 0, 1);
  const smoothstep = t => t * t * (3 - 2 * t);
  const easeOutCubic = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const easeOutBack = t => {
    t = clamp(t, 0, 1);
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  };
  const mod = (n, m) => ((n % m) + m) % m;
  const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
  const formatTime = sec => {
    sec = Math.max(0, Math.ceil(sec));
    return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
  };
  const deepCloneGrid = grid => grid.map(row => row.map(cell => cell ? { ...cell } : null));

  class RNG {
    constructor(seed = Date.now()) {
      let s = Number(seed) || 1;
      this.state = (s >>> 0) || 0x9e3779b9;
      this._gauss = null;
    }
    nextUint() {
      let x = this.state;
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      this.state = x >>> 0;
      return this.state;
    }
    next() { return this.nextUint() / 4294967296; }
    int(min, max) { return Math.floor(this.next() * (max - min + 1)) + min; }
    chance(p) { return this.next() < p; }
    pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
    weighted(weights) {
      let total = 0;
      for (const w of weights) total += Math.max(0, w);
      if (total <= 0) return 0;
      let r = this.next() * total;
      for (let i = 0; i < weights.length; i++) {
        r -= Math.max(0, weights[i]);
        if (r <= 0) return i;
      }
      return weights.length - 1;
    }
    gaussian(mean = 0, sd = 1) {
      if (this._gauss !== null) {
        const g = this._gauss;
        this._gauss = null;
        return mean + g * sd;
      }
      let u = 0, v = 0;
      while (u === 0) u = this.next();
      while (v === 0) v = this.next();
      const mag = Math.sqrt(-2 * Math.log(u));
      const z0 = mag * Math.cos(2 * Math.PI * v);
      this._gauss = mag * Math.sin(2 * Math.PI * v);
      return mean + z0 * sd;
    }
    fork(salt = 0) { return new RNG((this.nextUint() ^ (salt >>> 0) ^ 0x85ebca6b) >>> 0); }
  }

  class EventBus {
    constructor() { this.listeners = new Map(); }
    on(type, handler) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type).add(handler);
      return () => this.off(type, handler);
    }
    off(type, handler) { this.listeners.get(type)?.delete(handler); }
    emit(type, payload = {}) {
      const set = this.listeners.get(type);
      if (!set) return;
      for (const handler of [...set]) {
        try { handler(payload); } catch (err) { console.error(`[PLO event:${type}]`, err); }
      }
    }
    clear() { this.listeners.clear(); }
  }

  const DEFAULT_SAVE = Object.freeze({
    version: 1,
    settings: Object.freeze({ sfx: .8, music: .45, shake: true, reducedMotion: false, glyphs: true, haptics: true, localeMode: 'auto' }),
    stats: Object.freeze({ wins: 0, losses: 0, matches: 0, bestChain: 0, highScore: 0, pressureSent: 0, rank: 0 }),
    tutorialComplete: false,
    selectedMode: 'duel',
    difficulty: 1
  });

  const hasExactKeys = (value, keys) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const actual = Object.keys(value).sort();
    const expected = [...keys].sort();
    return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
  };
  const isFiniteRange = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
  const isWholeRange = (value, min, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= min && value <= max;
  const validateSaveData = value => {
    if (!hasExactKeys(value, ['version','settings','stats','tutorialComplete','selectedMode','difficulty'])) return false;
    if (value.version !== DEFAULT_SAVE.version || typeof value.tutorialComplete !== 'boolean') return false;
    if (!['duel','blitz','lab'].includes(value.selectedMode) || !isWholeRange(value.difficulty, 0, 3)) return false;
    const settings = value.settings;
    if (!hasExactKeys(settings, ['sfx','music','shake','reducedMotion','glyphs','haptics','localeMode'])) return false;
    if (!isFiniteRange(settings.sfx, 0, 1) || !isFiniteRange(settings.music, 0, 1)) return false;
    if (![settings.shake,settings.reducedMotion,settings.glyphs,settings.haptics].every(item => typeof item === 'boolean')) return false;
    if (!['auto','zh-CN','ja','en'].includes(settings.localeMode)) return false;
    const stats = value.stats;
    if (!hasExactKeys(stats, ['wins','losses','matches','bestChain','highScore','pressureSent','rank'])) return false;
    return Object.values(stats).every(item => isWholeRange(item, 0));
  };

  class SaveStore {
    constructor(key = CONFIG.STORAGE_KEY, storage) {
      this.key = key;
      this.storage = storage;
      this.available = true;
      this.recovery = null;
      this.statusListeners = new Set();
      this.data = this.load();
    }
    get storageTarget() { return this.storage === undefined ? window.localStorage : this.storage; }
    setRecovery(recovery) {
      if (this.recovery === recovery) return;
      this.recovery = recovery;
      for (const listener of [...this.statusListeners]) {
        try { listener(recovery); } catch (error) { console.error('Save status listener failed.', error); }
      }
    }
    subscribeStatus(listener) {
      if (typeof listener !== 'function') throw new TypeError('Save status listener must be a function.');
      this.statusListeners.add(listener);
      return () => this.statusListeners.delete(listener);
    }
    dismissRecovery() { this.setRecovery(null); }
    load() {
      let raw;
      try {
        raw = this.storageTarget.getItem(this.key);
      } catch (err) {
        this.available = false;
        this.setRecovery('unavailable');
        console.warn('Persistent storage is unavailable; progress will remain in memory.');
        return this.makeDefault();
      }
      if (raw === null) return this.makeDefault();
      try {
        const parsed = JSON.parse(raw);
        if (!validateSaveData(parsed)) throw new TypeError('Save data does not match the current schema.');
        return parsed;
      } catch (err) {
        const repaired = this.makeDefault();
        try {
          this.storageTarget.setItem(this.key, JSON.stringify(repaired));
          this.setRecovery('repaired');
          console.warn('Invalid local save was replaced with a clean save.', err);
        } catch (storageError) {
          this.available = false;
          this.setRecovery('unavailable');
          console.warn('Invalid local save could not be repaired because storage is unavailable.', storageError);
        }
        return repaired;
      }
    }
    makeDefault() {
      return {
        version: DEFAULT_SAVE.version,
        settings: { ...DEFAULT_SAVE.settings },
        stats: { ...DEFAULT_SAVE.stats },
        tutorialComplete: DEFAULT_SAVE.tutorialComplete,
        selectedMode: DEFAULT_SAVE.selectedMode,
        difficulty: DEFAULT_SAVE.difficulty
      };
    }
    save() {
      if (!this.available) return;
      try { this.storageTarget.setItem(this.key, JSON.stringify(this.data)); }
      catch (err) {
        this.available = false;
        this.setRecovery('unavailable');
        console.warn('Persistent storage became unavailable; continuing in memory.', err);
      }
    }
    patch(partial) {
      this.data = { ...this.data, ...partial };
      this.save();
    }
    patchSettings(partial) {
      this.data.settings = { ...this.data.settings, ...partial };
      this.save();
    }
    patchStats(partial) {
      this.data.stats = { ...this.data.stats, ...partial };
      this.save();
    }
    resetTutorial() { this.data.tutorialComplete = false; this.save(); }
    clear() { this.data = this.makeDefault(); this.save(); }
  }

  const makeCell = (kind = 'normal', color = 0, meta = {}) => ({
    kind,
    color: kind === 'pulse' ? -1 : color,
    id: meta.id ?? 0,
    born: meta.born ?? performance.now(),
    fallFrom: meta.fallFrom ?? null,
    flash: 0,
    wobble: meta.wobble ?? 0
  });

  PLO.CONFIG = CONFIG;
  PLO.RNG = RNG;
  PLO.EventBus = EventBus;
  PLO.SaveStore = SaveStore;
  PLO.validateSaveData = validateSaveData;
  PLO.makeCell = makeCell;
  PLO.util = { clamp, lerp, invLerp, smoothstep, easeOutCubic, easeOutBack, mod, dist, formatTime, deepCloneGrid };
})();
