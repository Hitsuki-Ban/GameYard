(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
  const now = () => performance.now();
  const formatScore = value => Math.max(0, Math.floor(value)).toString().padStart(6, '0');
  const formatSeed = value => (Number(value) >>> 0).toString(16).toUpperCase().padStart(8, '0');
  const sign = value => value === 0 ? 0 : value > 0 ? 1 : -1;
  const deepClone = value => JSON.parse(JSON.stringify(value));
  const I18N = globalThis.CrownBreakerI18n;
  if (!I18N || typeof I18N.translate !== 'function') throw new Error('CrownBreakerI18n must load before game.js.');

  const app = $('#app');
  const canvas = $('#game-canvas');
  const ctx = canvas.getContext('2d', { alpha: true });
  const flashEl = $('#flash');
  const titleScreen = $('#title-screen');
  const hud = $('#hud');
  const modalLayer = $('#modal-layer');
  const pauseModal = $('#pause-modal');
  const promotionModal = $('#promotion-modal');
  const rewardModal = $('#reward-modal');
  const contractModal = $('#contract-modal');
  const runResultModal = $('#run-result-modal');
  const failModal = $('#fail-modal');
  const trainingResultModal = $('#training-result-modal');
  const infoModal = $('#info-modal');
  const infoContent = $('#info-content');

  const VERSION = '3.1.0';
  const SAVE_KEY = 'crownBreaker.save.v2';
  const RUN_KEY = 'crownBreaker.run.v2';
  const SETTINGS_KEY = 'crownBreaker.settings.v2';

  const defaultSettings = {
    volume: 0.56,
    music: true,
    sfx: true,
    shake: true,
    flashes: true,
    hints: true,
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    languagePreference: 'system'
  };

  const defaultSave = {
    bestScore: 0,
    bestDaily: 0,
    runs: 0,
    clears: 0,
    totalCaptures: 0,
    totalPromotions: 0,
    discoveredRelics: [],
    tutorial: {
      select: false,
      move: false,
      intent: false,
      promotion: false,
      reward: false
    }
  };

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return deepClone(fallback);
      const parsed = JSON.parse(raw);
      return { ...deepClone(fallback), ...parsed };
    } catch (error) {
      console.warn('Local data could not be read.', error);
      return deepClone(fallback);
    }
  }

  let settings = loadJSON(SETTINGS_KEY, defaultSettings);
  I18N.assertPreference(settings.languagePreference);
  let localePreference = settings.languagePreference;
  let locale = I18N.resolveLocale(localePreference);
  let save = loadJSON(SAVE_KEY, defaultSave);
  save.tutorial = { ...defaultSave.tutorial, ...(save.tutorial || {}) };
  if (!Array.isArray(save.discoveredRelics)) save.discoveredRelics = [];

  function persistSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (_) { /* unavailable */ }
  }

  function persistSave() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (_) { /* unavailable */ }
  }

  function t(key, params) {
    return I18N.translate(locale, key, params);
  }

  const PIECE_GLYPHS = {
    w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
    b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }
  };
  const PIECE_NAMES = { k: 'piece.k', q: 'piece.q', r: 'piece.r', b: 'piece.b', n: 'piece.n', p: 'piece.p' };
  const PIECE_VALUES = { p: 110, n: 290, b: 310, r: 470, q: 820, k: 1900 };
  const RANK_ORDER = { C: 0, B: 1, A: 2, S: 3 };
  const FAILURE_CODES = Object.freeze(['crown_broken', 'turns_exhausted', 'no_legal_moves', 'qa']);

  const RELICS = [
    { id: 'doubleStep', nameKey: 'relic.doubleStep.name', lineKey: 'relic.doubleStep.line', max: 2, glyph: '♙', kind: 'pawn', rarity: 'common' },
    { id: 'earlyPromote', nameKey: 'relic.earlyPromote.name', lineKey: 'relic.earlyPromote.line', max: 2, glyph: '♙', kind: 'pawn', rarity: 'common' },
    { id: 'promoteTempo', nameKey: 'relic.promoteTempo.name', lineKey: 'relic.promoteTempo.line', max: 2, glyph: '♕', kind: 'tempo', rarity: 'rare' },
    { id: 'captureTempo', nameKey: 'relic.captureTempo.name', lineKey: 'relic.captureTempo.line', max: 2, glyph: '◆', kind: 'tempo', rarity: 'common' },
    { id: 'knightSpur', nameKey: 'relic.knightSpur.name', lineKey: 'relic.knightSpur.line', max: 2, glyph: '♘', kind: 'class', rarity: 'rare' },
    { id: 'bishopPrism', nameKey: 'relic.bishopPrism.name', lineKey: 'relic.bishopPrism.line', max: 2, glyph: '♗', kind: 'class', rarity: 'rare' },
    { id: 'rookRam', nameKey: 'relic.rookRam.name', lineKey: 'relic.rookRam.line', max: 2, glyph: '♖', kind: 'class', rarity: 'rare' },
    { id: 'queenBattery', nameKey: 'relic.queenBattery.name', lineKey: 'relic.queenBattery.line', max: 2, glyph: '♕', kind: 'class', rarity: 'rare' },
    { id: 'pawnRelay', nameKey: 'relic.pawnRelay.name', lineKey: 'relic.pawnRelay.line', max: 2, glyph: '♙', kind: 'pawn', rarity: 'common' },
    { id: 'shield', nameKey: 'relic.shield.name', lineKey: 'relic.shield.line', max: 2, glyph: '♔', kind: 'guard', rarity: 'common' },
    { id: 'turns', nameKey: 'relic.turns.name', lineKey: 'relic.turns.line', max: 2, glyph: '⌛', kind: 'guard', rarity: 'common' },
    { id: 'dangerReward', nameKey: 'relic.dangerReward.name', lineKey: 'relic.dangerReward.line', max: 2, glyph: '▲', kind: 'score', rarity: 'common' },
    { id: 'bounty', nameKey: 'relic.bounty.name', lineKey: 'relic.bounty.line', max: 2, glyph: '◆', kind: 'score', rarity: 'rare' },
    { id: 'momentum', nameKey: 'relic.momentum.name', lineKey: 'relic.momentum.line', max: 2, glyph: '✦', kind: 'tempo', rarity: 'rare' },
    { id: 'interceptor', nameKey: 'relic.interceptor.name', lineKey: 'relic.interceptor.line', max: 2, glyph: '♟', kind: 'tempo', rarity: 'rare' },
    { id: 'overcharge', nameKey: 'relic.overcharge.name', lineKey: 'relic.overcharge.line', max: 2, glyph: '⚡', kind: 'burst', rarity: 'rare' },
    { id: 'kingsWrath', nameKey: 'relic.kingsWrath.name', lineKey: 'relic.kingsWrath.line', max: 2, glyph: '♔', kind: 'class', rarity: 'rare' },
    { id: 'crownSurge', nameKey: 'relic.crownSurge.name', lineKey: 'relic.crownSurge.line', max: 2, glyph: '♚', kind: 'tempo', rarity: 'rare' }
  ];
  const RELIC_BY_ID = Object.fromEntries(RELICS.map(item => [item.id, item]));

  function relicEffectLine(id, level = 1) {
    const value = clamp(Number(level) || 1, 1, 2);
    switch (id) {
      case 'doubleStep': return t(`relic.effect.doubleStep.${value === 1 ? 'one' : 'many'}`, { count: value });
      case 'earlyPromote': return t('relic.effect.earlyPromote', { count: value });
      case 'promoteTempo': return t(`relic.effect.promoteTempo.${value === 1 ? 'one' : 'many'}`, { count: value });
      case 'captureTempo': return t(`relic.effect.captureTempo.${value === 1 ? 'one' : 'many'}`, { count: value });
      case 'knightSpur': return t(`relic.effect.knightSpur.${value === 1 ? 'one' : 'many'}`, { count: value });
      case 'bishopPrism': return t(`relic.effect.bishopPrism.${value === 1 ? 'one' : 'many'}`, { count: value });
      case 'rookRam': return t(`relic.effect.rookRam.${value === 1 ? 'one' : 'many'}`, { count: value });
      case 'queenBattery': return t('relic.effect.queenBattery', { percent: value * 28 });
      case 'pawnRelay': return t(`relic.effect.pawnRelay.${value === 1 ? 'one' : 'many'}`, { count: value });
      case 'shield': return t('relic.effect.shield', { count: 3 + value });
      case 'turns': return t('relic.effect.turns', { count: value * 2 });
      case 'dangerReward': return t('relic.effect.dangerReward', { multiplier: value + 1 });
      case 'bounty': return t('relic.effect.bounty', { multiplier: value + 1 });
      case 'momentum': return t(`relic.effect.momentum.${value === 1 ? 'one' : 'many'}`, { count: value });
      case 'interceptor': return t(`relic.effect.interceptor.${value === 1 ? 'one' : 'many'}`, { count: value });
      case 'overcharge': return t('relic.effect.overcharge', { count: 3 + value });
      case 'kingsWrath': return t('relic.effect.kingsWrath', { multiplier: value + 1, energy: 10 + value * 15 });
      case 'crownSurge': return t(`relic.effect.crownSurge.${value === 1 ? 'one' : 'many'}`, { count: value });
      default: throw new RangeError(`Unknown relic id: ${String(id)}`);
    }
  }

  const TRAITS = {
    guarded: { id: 'guarded', nameKey: 'trait.guarded.name', lineKey: 'trait.guarded.line', glyph: '♜' },
    phantom: { id: 'phantom', nameKey: 'trait.phantom.name', lineKey: 'trait.phantom.line', glyph: '♚' },
    chains: { id: 'chains', nameKey: 'trait.chains.name', lineKey: 'trait.chains.line', glyph: '♛' },
    hex: { id: 'hex', nameKey: 'trait.hex.name', lineKey: 'trait.hex.line', glyph: '⚡' },
    summoner: { id: 'summoner', nameKey: 'trait.summoner.name', lineKey: 'trait.summoner.line', glyph: '♟' }
  };

  const BOSS_DEFS = {
    twinQueens: { nameKey: 'boss.twinQueens.name', lineKey: 'boss.twinQueens.line', hp: 2, extraTurns: 0, mods: ['queen', 'diagonals'], trait: 'hex' },
    ironBastion: { nameKey: 'boss.ironBastion.name', lineKey: 'boss.ironBastion.line', hp: 3, extraTurns: 2, mods: ['walls', 'armor'], trait: 'guarded' },
    pawnstorm: { nameKey: 'boss.pawnstorm.name', lineKey: 'boss.pawnstorm.line', hp: 2, extraTurns: -1, mods: ['race', 'swarm', 'cavalry'], trait: 'summoner' }
  };

  const CONTRACT_MODS = {
    swarm: { id: 'swarm', nameKey: 'contract.swarm.name', glyph: '♟', lineKey: 'contract.swarm.line' },
    cavalry: { id: 'cavalry', nameKey: 'contract.cavalry.name', glyph: '♞', lineKey: 'contract.cavalry.line' },
    walls: { id: 'walls', nameKey: 'contract.walls.name', glyph: '♜', lineKey: 'contract.walls.line' },
    diagonals: { id: 'diagonals', nameKey: 'contract.diagonals.name', glyph: '♝', lineKey: 'contract.diagonals.line' },
    queen: { id: 'queen', nameKey: 'contract.queen.name', glyph: '♛', lineKey: 'contract.queen.line' },
    armor: { id: 'armor', nameKey: 'contract.armor.name', glyph: '♚', lineKey: 'contract.armor.line' },
    race: { id: 'race', nameKey: 'contract.race.name', glyph: '♟', lineKey: 'contract.race.line' },
    shortClock: { id: 'shortClock', nameKey: 'contract.shortClock.name', glyph: '⌛', lineKey: 'contract.shortClock.line' }
  };

  function hashString(text) {
    let hash = 2166136261 >>> 0;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function makeSeed() {
    const mix = `${Date.now()}-${Math.random()}-${performance.now()}`;
    return hashString(mix) || 1;
  }

  function dailySeed() {
    const date = new Date();
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return hashString(`CROWN-${y}${m}${d}`) || 1;
  }

  function rngNext(stateHolder) {
    let x = (stateHolder.rngState || 1) >>> 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    stateHolder.rngState = x >>> 0;
    return (stateHolder.rngState >>> 0) / 4294967296;
  }

  function runRandom() {
    return run ? rngNext(run) : Math.random();
  }

  function rand(min, max) {
    return runRandom() * (max - min) + min;
  }

  function randInt(min, maxExclusive) {
    return Math.floor(rand(min, maxExclusive));
  }

  function choose(list) {
    return list[Math.floor(runRandom() * list.length)];
  }

  function shuffled(list) {
    const copy = [...list];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(runRandom() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.musicGain = null;
      this.sfxGain = null;
      this.noiseBuffer = null;
      this.started = false;
      this.timer = null;
      this.nextStepAt = 0;
      this.step = 0;
      this.bpm = 158;
    }

    ensure() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.musicGain.connect(this.master);
      this.sfxGain.connect(this.master);
      this.master.connect(this.ctx.destination);
      this.noiseBuffer = this.makeNoiseBuffer();
      this.applySettings();
    }

    applySettings() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.master.gain.setTargetAtTime(settings.volume, t, 0.02);
      this.musicGain.gain.setTargetAtTime(settings.music ? 0.27 : 0.0001, t, 0.04);
      this.sfxGain.gain.setTargetAtTime(settings.sfx ? 0.72 : 0.0001, t, 0.02);
    }

    makeNoiseBuffer() {
      const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      return buffer;
    }

    start() {
      this.ensure();
      if (!this.ctx || this.started) return;
      this.started = true;
      this.nextStepAt = this.ctx.currentTime + 0.05;
      this.timer = window.setInterval(() => this.schedule(), 50);
    }

    schedule() {
      if (!this.ctx) return;
      if (!settings.music) {
        this.nextStepAt = this.ctx.currentTime + 0.05;
        return;
      }
      const stepDuration = 60 / this.bpm / 4;
      while (this.nextStepAt < this.ctx.currentTime + 0.18) {
        this.scheduleStep(this.step, this.nextStepAt);
        this.nextStepAt += stepDuration;
        this.step = (this.step + 1) % 32;
      }
    }

    tone(freq, start, duration, gain = 0.1, type = 'sine', destination = this.sfxGain, slideTo = null) {
      if (!this.ctx || !destination) return;
      const osc = this.ctx.createOscillator();
      const env = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(Math.max(20, freq), start);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), start + duration);
      env.gain.setValueAtTime(0.0001, start);
      env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), start + Math.min(0.012, duration * 0.2));
      env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.connect(env);
      env.connect(destination);
      osc.start(start);
      osc.stop(start + duration + 0.03);
    }

    noise(start, duration, gain = 0.08, cutoff = 8000, destination = this.sfxGain) {
      if (!this.ctx || !this.noiseBuffer || !destination) return;
      const source = this.ctx.createBufferSource();
      const filter = this.ctx.createBiquadFilter();
      const env = this.ctx.createGain();
      source.buffer = this.noiseBuffer;
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(cutoff, start);
      env.gain.setValueAtTime(Math.max(0.0002, gain), start);
      env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      source.connect(filter);
      filter.connect(env);
      env.connect(destination);
      source.start(start);
      source.stop(start + duration + 0.02);
    }

    scheduleStep(step, t) {
      const barStep = step % 16;
      if ([0, 4, 8, 12].includes(barStep)) this.tone(120, t, 0.14, barStep === 0 ? 0.21 : 0.13, 'sine', this.musicGain, 38);
      if ([4, 12].includes(barStep)) this.noise(t, 0.11, 0.052, 1800, this.musicGain);
      if (barStep % 2 === 0) this.noise(t, 0.035, barStep % 4 === 2 ? 0.032 : 0.02, 11000, this.musicGain);
      if ([0, 3, 6, 8, 11, 14].includes(barStep)) {
        const notes = [55, 55, 65.41, 73.42, 49, 65.41, 82.41, 73.42];
        const note = notes[Math.floor(step / 4) % notes.length];
        this.tone(note, t, 0.13, 0.043, 'sawtooth', this.musicGain);
        this.tone(note * 2, t, 0.07, 0.016, 'square', this.musicGain);
      }
      if (step % 32 === 31) this.tone(660, t, 0.04, 0.016, 'square', this.musicGain, 1180);
    }

    sfx(name, opts = {}) {
      this.ensure();
      if (!this.ctx || !settings.sfx) return;
      const t = this.ctx.currentTime + 0.005;
      const pitch = Math.max(0.5, Number(opts.pitch) || 1);
      switch (name) {
        case 'ui':
          this.tone(420, t, 0.045, 0.055, 'square');
          this.tone(680, t + 0.02, 0.05, 0.035, 'sine');
          break;
        case 'select':
          this.tone(310, t, 0.05, 0.045, 'triangle', this.sfxGain, 520);
          break;
        case 'move':
          this.tone(180, t, 0.10, 0.07, 'triangle', this.sfxGain, 95);
          this.noise(t, 0.07, 0.03, 3200);
          break;
        case 'capture':
          this.noise(t, 0.22, 0.22, 4800);
          this.tone(120 * pitch, t, 0.28, 0.18, 'sawtooth', this.sfxGain, 42 * pitch);
          this.tone(610 * pitch, t + 0.03, 0.13, 0.07, 'square', this.sfxGain, 180 * pitch);
          break;
        case 'jackpot':
          this.noise(t, 0.3, 0.2, 7000);
          [392, 523.2, 659.2, 784, 1046.4].forEach((f, i) => this.tone(f, t + i * 0.055, 0.28, 0.085, i % 2 ? 'square' : 'sawtooth'));
          this.tone(196, t, 0.5, 0.12, 'sawtooth', this.sfxGain, 392);
          break;
        case 'crown':
          this.noise(t, 0.46, 0.28, 6000);
          [110, 165, 220, 330].forEach((f, i) => this.tone(f, t + i * 0.035, 0.55, 0.12, 'sawtooth', this.sfxGain, f / 2));
          break;
        case 'hurt':
          this.noise(t, 0.28, 0.25, 2200);
          this.tone(190, t, 0.46, 0.19, 'square', this.sfxGain, 45);
          break;
        case 'burst':
          for (let i = 0; i < 7; i++) this.tone(180 * Math.pow(1.22, i), t + i * 0.055, 0.22, 0.07, i % 2 ? 'square' : 'sawtooth');
          this.noise(t + 0.28, 0.35, 0.16, 9000);
          break;
        case 'ready':
          this.tone(440, t, 0.10, 0.06, 'square');
          this.tone(880, t + 0.07, 0.16, 0.08, 'square');
          break;
        case 'victory':
          [261.6, 329.6, 392, 523.2, 659.2].forEach((f, i) => this.tone(f, t + i * 0.095, 0.38, 0.09, 'sawtooth'));
          break;
        case 'fail':
          [220, 185, 147, 110].forEach((f, i) => this.tone(f, t + i * 0.13, 0.38, 0.09, 'triangle'));
          break;
        case 'promotion':
          [392, 523.2, 659.2, 784].forEach((f, i) => this.tone(f, t + i * 0.05, 0.24, 0.06, 'square'));
          break;
        default:
          break;
      }
    }
  }

  const audio = new AudioEngine();

  const view = {
    width: innerWidth,
    height: innerHeight,
    dpr: Math.min(devicePixelRatio || 1, 2),
    board: { x: 0, y: 0, size: 0, tile: 0 }
  };

  const game = {
    active: false,
    paused: false,
    mode: 'run',
    phase: 'idle',
    pieces: [],
    selectedId: null,
    legalMoves: [],
    hover: null,
    turnsLeft: 0,
    enemyHP: 1,
    enemyHPMax: 1,
    score: 0,
    displayedScore: 0,
    combo: 0,
    maxCombo: 0,
    captures: 0,
    battleCaptures: 0,
    hype: 0,
    overdriveMoves: 0,
    bonusActions: 0,
    moveCount: 0,
    aiSkill: 0.3,
    enemyIntent: null,
    currentAnimation: null,
    transitionTimer: null,
    lastInputAt: now(),
    hintMove: null,
    screenShake: 0,
    hitStopUntil: 0,
    lastFrame: now(),
    pausedAt: 0,
    idleHintShown: false,
    promotionPending: null,
    pendingAfterMove: null,
    battleCharges: {},
    battleStartSnapshot: null,
    tutorialStep: 0,
    trainingPromoted: false,
    trainingCrownBroken: false,
    failureReason: null
  };

  const particles = [];
  const floatingTexts = [];
  const ambient = Array.from({ length: 64 }, () => ({
    x: Math.random(), y: Math.random(), z: Math.random() * 0.8 + 0.2,
    speed: Math.random() * 0.022 + 0.008, size: Math.random() * 1.7 + 0.5
  }));

  let run = null;
  let currentScreen = 'title';
  let pieceSerial = 0;
  let tutorialTimer = null;
  let bannerTimer = null;
  let currentInfoKind = null;
  let currentTutorialMessage = null;
  let currentBannerMessage = null;

  function activeRelicLevel(id) {
    return run && run.relics ? Number(run.relics[id] || 0) : 0;
  }

  function maxShieldForRun(targetRun = run) {
    return 3 + Number(targetRun?.relics?.shield || 0);
  }

  function makeInitialRoster() {
    return [
      { uid: 'king', type: 'k', origin: 'k' },
      { uid: 'rook', type: 'r', origin: 'r' },
      { uid: 'pawn-a', type: 'p', origin: 'p' },
      { uid: 'pawn-b', type: 'p', origin: 'p' },
      { uid: 'pawn-c', type: 'p', origin: 'p' },
      { uid: 'pawn-d', type: 'p', origin: 'p' }
    ];
  }

  function newRunState(seed, daily = false) {
    return {
      version: VERSION,
      seed: seed >>> 0,
      rngState: seed >>> 0,
      daily,
      battle: 1,
      totalBattles: 6,
      score: 0,
      captures: 0,
      promotions: 0,
      maxCombo: 0,
      crownBreaks: 0,
      energyCarry: 0,
      relics: {},
      roster: makeInitialRoster(),
      shield: 3,
      currentContract: null,
      pendingRewards: null,
      pendingContracts: null,
      stage: 'battle',
      battleState: null,
      battleStart: null,
      battleStartMeta: null,
      promotionState: null
    };
  }

  function hasMod(contract, id) {
    return Boolean(contract?.mods?.includes(id));
  }

  function makeContract(depth, elite = false, final = false) {
    if (final) {
      const bossId = choose(Object.keys(BOSS_DEFS));
      return {
        id: `boss-${bossId}-${run.rngState}`,
        depth,
        elite: true,
        final: true,
        boss: bossId,
        mods: [...BOSS_DEFS[bossId].mods],
        trait: BOSS_DEFS[bossId].trait,
        reward: 0,
        previewSeed: run.rngState
      };
    }
    const modPool = ['swarm', 'cavalry', 'walls', 'diagonals', 'queen', 'armor', 'race', 'shortClock'];
    const count = elite ? (depth >= 4 ? 3 : 2) : 1;
    const mods = shuffled(modPool).slice(0, count);
    if (!elite && depth <= 2 && mods.includes('shortClock')) mods[0] = 'swarm';
    return {
      id: `${elite ? 'elite' : 'plain'}-${depth}-${run.rngState}`,
      depth,
      elite,
      final: false,
      mods,
      trait: elite ? choose(Object.keys(TRAITS)) : null,
      reward: elite ? 2 : 1,
      previewSeed: run.rngState
    };
  }

  function activeTraitId() {
    if (game.mode !== 'run' || !run) return null;
    const trait = run.currentContract?.trait;
    return trait && TRAITS[trait] ? trait : null;
  }

  function buildContractChoices() {
    if (!run || run.battle >= run.totalBattles) return [makeContract(run.totalBattles, true, true)];
    const nextDepth = run.battle + 1;
    if (nextDepth === run.totalBattles) return [makeContract(nextDepth, true, true)];
    const safe = makeContract(nextDepth, false, false);
    const elite = makeContract(nextDepth, true, false);
    return runRandom() < 0.5 ? [safe, elite] : [elite, safe];
  }

  function validateRun(candidate) {
    if (!candidate || candidate.version !== VERSION) return false;
    if (!Array.isArray(candidate.roster) || !candidate.roster.length) return false;
    if (!candidate.relics || typeof candidate.relics !== 'object') return false;
    if (!Number.isFinite(candidate.seed) || !Number.isFinite(candidate.battle)) return false;
    return true;
  }

  function loadActiveRun() {
    try {
      const raw = localStorage.getItem(RUN_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return validateRun(parsed) ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function clearActiveRun() {
    try { localStorage.removeItem(RUN_KEY); } catch (_) { /* unavailable */ }
  }

  function snapshotBattle() {
    if (!run || game.mode !== 'run') return null;
    return {
      pieces: game.pieces.map(piece => ({
        id: piece.id,
        uid: piece.uid || null,
        origin: piece.origin || piece.type,
        color: piece.color,
        type: piece.type,
        x: piece.x,
        y: piece.y,
        alive: piece.alive,
        hasMoved: Boolean(piece.hasMoved),
        dashUsed: Number(piece.dashUsed || 0),
        startY: piece.startY
      })),
      turnsLeft: game.turnsLeft,
      enemyHP: game.enemyHP,
      enemyHPMax: game.enemyHPMax,
      score: game.score,
      combo: game.combo,
      maxCombo: game.maxCombo,
      captures: game.captures,
      battleCaptures: game.battleCaptures,
      hype: game.hype,
      overdriveMoves: game.overdriveMoves,
      bonusActions: game.bonusActions,
      moveCount: game.moveCount,
      aiSkill: game.aiSkill,
      battleCharges: deepClone(game.battleCharges),
      battleShieldLost: Boolean(game.battleShieldLost),
      battleMaxCombo: Number(game.battleMaxCombo || 0),
      crownVeil: Number(game.crownVeil || 0),
      enemyTurns: Number(game.enemyTurns || 0),
      enemyIntent: game.enemyIntent ? deepClone(game.enemyIntent) : null,
      shield: run.shield,
      contract: deepClone(run.currentContract)
    };
  }

  function persistRun(stage = run?.stage || 'battle') {
    if (!run || game.mode !== 'run') return;
    run.stage = stage;
    run.score = game.score;
    run.maxCombo = Math.max(run.maxCombo, game.maxCombo);
    if (stage === 'battle' && game.active) run.battleState = snapshotBattle();
    try { localStorage.setItem(RUN_KEY, JSON.stringify(run)); } catch (_) { /* unavailable */ }
  }

  function resize() {
    view.width = innerWidth;
    view.height = innerHeight;
    view.dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.floor(view.width * view.dpr);
    canvas.height = Math.floor(view.height * view.dpr);
    canvas.style.width = `${view.width}px`;
    canvas.style.height = `${view.height}px`;
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    calculateBoardRect();
  }

  function calculateBoardRect() {
    const w = view.width;
    const h = view.height;
    let size;
    let x;
    let y;
    if (w >= 980) {
      const playAreaW = w - 300;
      size = Math.min(playAreaW * 0.80, h * 0.81, 790);
      x = Math.max(76, (playAreaW - size) * 0.55 + 20);
      y = (h - size) * 0.56;
    } else if (w >= 650) {
      size = Math.min(w * 0.80, h * 0.72, 660);
      x = (w - size) * 0.43;
      y = Math.max(72, (h - size) * 0.39);
    } else {
      size = Math.min(w * 0.94, h * 0.61, 530);
      x = (w - size) / 2;
      y = Math.max(60, (h - size) * 0.30);
    }
    view.board = { x, y, size, tile: size / 8 };
    app.style.setProperty('--board-bottom', `${y + size}px`);
  }

  function setScreen(name) {
    currentScreen = name;
    titleScreen.classList.toggle('active', name === 'title');
    if (name !== 'playing') hud.classList.remove('active');
    if (name === 'title') {
      closeModal();
      game.active = false;
      game.paused = false;
      updateContinueButton();
    }
  }

  function updateContinueButton() {
    const active = loadActiveRun();
    const button = $('#btn-continue');
    button.hidden = !active;
    $('#btn-new').classList.toggle('btn-secondary', Boolean(active));
    $('#btn-new').classList.toggle('btn-primary', !active);
  }

  function openModal(modal) {
    modalLayer.classList.add('active');
    [pauseModal, promotionModal, rewardModal, contractModal, runResultModal, failModal, trainingResultModal, infoModal]
      .forEach(element => element.classList.toggle('active', element === modal));
  }

  function closeModal() {
    modalLayer.classList.remove('active');
    [pauseModal, promotionModal, rewardModal, contractModal, runResultModal, failModal, trainingResultModal, infoModal]
      .forEach(element => element.classList.remove('active'));
  }

  function settingSwitch(id, title, description, checked) {
    return `<div class="setting-row"><div><label for="${id}">${title}</label><small>${description}</small></div><label class="switch"><input id="${id}" type="checkbox" ${checked ? 'checked' : ''}><i></i></label></div>`;
  }

  function renderInfo(kind) {
    let html = '';
    if (kind === 'rules') {
      html = `
        <p class="eyebrow">${t('legend.kicker')}</p>
        <h2>${t('legend.title')}</h2>
        <div class="legend-grid">
          <div class="legend-card move"><i></i><b>${t('legend.move')}</b><small>${t('legend.dot')}</small></div>
          <div class="legend-card hit"><i></i><b>${t('legend.capture')}</b><small>${t('legend.square')}</small></div>
          <div class="legend-card danger"><i></i><b>${t('legend.danger')}</b><small>${t('legend.triangle')}</small></div>
          <div class="legend-card intent"><i></i><b>${t('legend.intent')}</b><small>${t('legend.redLine')}</small></div>
        </div>
        <div class="rule-strip"><span>♙</span><i></i><span>♘</span><span>♗</span><span>♖</span><span>♕</span></div>
        <p>${t('legend.rule')}</p>`;
    } else if (kind === 'records') {
      const relicRows = RELICS.map(item => {
        const seen = save.discoveredRelics.includes(item.id);
        return `<div style="opacity:${seen ? 1 : .25}"><b>${seen ? t(item.nameKey) : t('records.unknown')}</b><small>${seen ? t(item.lineKey) : ''}</small></div>`;
      }).join('');
      html = `
        <p class="eyebrow">${t('records.kicker')}</p>
        <h2>${t('records.title')}</h2>
        <div class="record-grid">
          <div class="record-cell"><span>${t('records.bestScore')}</span><strong>${formatScore(save.bestScore)}</strong></div>
          <div class="record-cell"><span>${t('records.clears')}</span><strong>${save.clears}</strong></div>
          <div class="record-cell"><span>${t('records.promotions')}</span><strong>${save.totalPromotions}</strong></div>
        </div>
        <h3>${t('records.daily')}</h3>
        <p><b style="color:var(--ink)">${formatScore(save.bestDaily)}</b></p>
        <h3>${t('records.relics', { found: save.discoveredRelics.length, total: RELICS.length })}</h3>
        <div class="relic-book">${relicRows}</div>`;
    } else if (kind === 'settings') {
      html = `
        <p class="eyebrow">${t('settings.kicker')}</p>
        <h2>${t('settings.title')}</h2>
        <div class="setting-row">
          <div><label for="set-volume">${t('settings.volume')}</label><small>${t('settings.volumeLine')}</small></div>
          <input id="set-volume" type="range" min="0" max="1" step="0.01" value="${settings.volume}">
        </div>
        ${settingSwitch('set-music', t('settings.music'), t('settings.toggleLine'), settings.music)}
        ${settingSwitch('set-sfx', t('settings.sfx'), t('settings.toggleLine'), settings.sfx)}
        ${settingSwitch('set-shake', t('settings.shake'), t('settings.shakeLine'), settings.shake)}
        ${settingSwitch('set-flashes', t('settings.flashes'), t('settings.flashesLine'), settings.flashes)}
        ${settingSwitch('set-hints', t('settings.hints'), t('settings.hintsLine'), settings.hints)}
        ${settingSwitch('set-motion', t('settings.motion'), t('settings.motionLine'), settings.reducedMotion)}
        <div class="setting-row">
          <div><label for="languagePreference">${t('language.label')}</label><small>${t('settings.languageLine')}</small></div>
          <select id="languagePreference" class="language-select">
            <option value="system">${t('language.system')}</option>
            <option value="zh-CN">${t('language.zh-CN')}</option>
            <option value="ja">${t('language.ja')}</option>
            <option value="en">${t('language.en')}</option>
          </select>
        </div>`;
    }
    infoContent.innerHTML = html;
  }

  function showInfo(kind) {
    audio.sfx('ui');
    currentInfoKind = kind;
    renderInfo(kind);
    openModal(infoModal);
    if (kind === 'settings') bindSettingsControls();
  }

  function bindSettingsControls() {
    const volume = $('#set-volume');
    if (!volume) return;
    volume.addEventListener('input', event => {
      settings.volume = Number(event.target.value);
      audio.applySettings();
      persistSettings();
    });
    [
      ['#set-music', 'music'], ['#set-sfx', 'sfx'], ['#set-shake', 'shake'],
      ['#set-flashes', 'flashes'], ['#set-hints', 'hints'], ['#set-motion', 'reducedMotion']
    ].forEach(([selector, key]) => {
      const input = $(selector);
      input.addEventListener('change', event => {
        settings[key] = event.target.checked;
        audio.applySettings();
        persistSettings();
      });
    });
    const language = $('#languagePreference');
    language.value = localePreference;
    language.addEventListener('change', event => setLanguagePreference(event.target.value));
  }

  function makePiece(color, type, x, y, extra = {}) {
    let id = extra.id || null;
    if (id) {
      const serial = Number(String(id).replace(/\D/g, ''));
      if (Number.isFinite(serial)) pieceSerial = Math.max(pieceSerial, serial);
    } else {
      id = `p${++pieceSerial}`;
    }
    return {
      id,
      uid: extra.uid || null,
      origin: extra.origin || type,
      color,
      type,
      x,
      y,
      alive: extra.alive !== false,
      hasMoved: Boolean(extra.hasMoved),
      dashUsed: Number(extra.dashUsed || 0),
      startY: Number.isFinite(extra.startY) ? extra.startY : y,
      anim: null,
      spawnAt: now() + Math.random() * 120
    };
  }

  function openSquares(occupied, rows) {
    const result = [];
    for (const y of rows) {
      for (let x = 0; x < 8; x++) {
        if (!occupied.has(`${x},${y}`)) result.push({ x, y });
      }
    }
    return result;
  }

  function placeRoster(roster) {
    const homes = {
      k: [[4, 7]],
      q: [[3, 7], [4, 6], [3, 6]],
      r: [[0, 7], [7, 7], [0, 6], [7, 6]],
      b: [[2, 7], [5, 7], [2, 6], [5, 6]],
      n: [[1, 7], [6, 7], [1, 6], [6, 6]],
      p: [[1, 5], [3, 5], [5, 5], [7, 5], [0, 5], [2, 5], [4, 5], [6, 5]]
    };
    const usedByType = { k: 0, q: 0, r: 0, b: 0, n: 0, p: 0 };
    const occupied = new Set();
    const pieces = [];
    for (const member of roster) {
      const slots = homes[member.type] || [];
      let slot = slots[usedByType[member.type]++] || null;
      if (slot && occupied.has(`${slot[0]},${slot[1]}`)) slot = null;
      if (!slot) {
        const fallback = openSquares(occupied, [7, 6, 5])[0];
        if (!fallback) continue;
        slot = [fallback.x, fallback.y];
      }
      occupied.add(`${slot[0]},${slot[1]}`);
      pieces.push(makePiece('w', member.type, slot[0], slot[1], {
        uid: member.uid,
        origin: member.origin,
        startY: slot[1]
      }));
    }
    return { pieces, occupied };
  }

  function addEnemyPiece(list, occupied, type, preferredRows = [1, 2, 3, 4]) {
    const candidates = shuffled(openSquares(occupied, preferredRows));
    if (!candidates.length) return null;
    const spot = candidates[0];
    occupied.add(`${spot.x},${spot.y}`);
    const piece = makePiece('b', type, spot.x, spot.y, { startY: spot.y });
    list.push(piece);
    return piece;
  }

  function generateEnemyFormation(contract) {
    const placed = placeRoster(run.roster);
    const pieces = placed.pieces;
    const occupied = placed.occupied;
    const crownCandidates = shuffled([2, 3, 4, 5]);
    let crownX = crownCandidates.find(x => !occupied.has(`${x},0`));
    if (!Number.isFinite(crownX)) crownX = 4;
    occupied.add(`${crownX},0`);
    pieces.push(makePiece('b', 'k', crownX, 0));

    const depth = run.battle;
    const eliteExtra = contract.elite ? (depth <= 3 ? 1 : 2) : 0;
    const baseCount = contract.final ? 7 : 3 + Math.min(5, depth) + eliteExtra;
    const pool = depth <= 2
      ? ['p', 'p', 'p', 'n', 'b', 'r']
      : depth <= 4
        ? ['p', 'p', 'n', 'b', 'r', 'q']
        : ['p', 'n', 'b', 'r', 'q'];

    for (let i = 0; i < baseCount; i++) addEnemyPiece(pieces, occupied, choose(pool));
    if (hasMod(contract, 'swarm')) for (let i = 0; i < 3; i++) addEnemyPiece(pieces, occupied, 'p', [2, 3, 4]);
    if (hasMod(contract, 'cavalry')) for (let i = 0; i < 2; i++) addEnemyPiece(pieces, occupied, 'n', [1, 2, 3]);
    if (hasMod(contract, 'walls')) for (let i = 0; i < 2; i++) addEnemyPiece(pieces, occupied, 'r', [1, 2]);
    if (hasMod(contract, 'diagonals')) for (let i = 0; i < 2; i++) addEnemyPiece(pieces, occupied, 'b', [1, 2, 3]);
    if (hasMod(contract, 'queen')) addEnemyPiece(pieces, occupied, 'q', [1, 2]);
    if (hasMod(contract, 'race')) {
      for (let i = 0; i < 3; i++) addEnemyPiece(pieces, occupied, 'p', [4, 3]);
    }
    if (contract.boss === 'twinQueens') addEnemyPiece(pieces, occupied, 'q', [1, 2]);
    if (contract.boss === 'ironBastion') for (let i = 0; i < 2; i++) addEnemyPiece(pieces, occupied, 'p', [2]);
    if (contract.boss === 'pawnstorm') for (let i = 0; i < 2; i++) addEnemyPiece(pieces, occupied, 'p', [3, 4]);
    return pieces;
  }

  function buildBattleFromContract(contract) {
    run.currentContract = contract;
    const pieces = generateEnemyFormation(contract);
    const bossDef = contract.boss ? BOSS_DEFS[contract.boss] : null;
    const hp = bossDef ? bossDef.hp : clamp(1 + (contract.elite ? 1 : 0) + (hasMod(contract, 'armor') ? 1 : 0), 1, 3);
    const turns = clamp(
      13 + activeRelicLevel('turns') * 2 - (hasMod(contract, 'shortClock') ? 2 : 0) + (bossDef ? bossDef.extraTurns : 0),
      8,
      20
    );
    return {
      pieces,
      enemyHP: hp,
      enemyHPMax: hp,
      turns,
      aiSkill: clamp(0.18 + run.battle * 0.07 + (contract.elite ? 0.08 : 0), 0.18, 0.8)
    };
  }

  function resetRuntimeForBattle(data) {
    clearTimeout(game.transitionTimer);
    game.active = true;
    game.paused = false;
    game.phase = 'player';
    game.pieces = data.pieces;
    game.selectedId = null;
    game.legalMoves = [];
    game.hover = null;
    game.turnsLeft = data.turns;
    game.enemyHP = data.enemyHP;
    game.enemyHPMax = data.enemyHPMax;
    game.score = run ? run.score : 0;
    game.displayedScore = game.score;
    game.combo = 0;
    game.maxCombo = run ? run.maxCombo : 0;
    game.captures = run ? run.captures : 0;
    game.battleCaptures = 0;
    game.hype = 0;
    game.overdriveMoves = 0;
    game.bonusActions = 0;
    game.moveCount = 0;
    game.aiSkill = data.aiSkill;
    game.enemyIntent = null;
    game.currentAnimation = null;
    game.screenShake = 0;
    game.hitStopUntil = 0;
    game.lastInputAt = now();
    game.lastFrame = now();
    game.idleHintShown = false;
    game.promotionPending = null;
    game.pendingAfterMove = null;
    game.battleCharges = {};
    game.battleShieldLost = false;
    game.battleMaxCombo = 0;
    game.crownVeil = 0;
    game.enemyTurns = 0;
    particles.length = 0;
    floatingTexts.length = 0;
  }

  function enterBattleScreen() {
    setScreen('playing');
    closeModal();
    hud.classList.add('active');
    updateHUD(true);
    audio.start();
  }

  function startNewRun(seed = makeSeed(), daily = false) {
    audio.start();
    run = newRunState(seed, daily);
    run.currentContract = {
      id: 'opening', depth: 1, elite: false, final: false,
      mods: [], reward: 1, previewSeed: run.rngState
    };
    save.runs += 1;
    persistSave();
    startRunBattle(false);
  }

  function startRunBattle(fromResume = false) {
    if (!run) return;
    const restoredIntent = fromResume && run.battleState?.enemyIntent ? deepClone(run.battleState.enemyIntent) : null;
    game.mode = 'run';
    run.shield = clamp(run.shield || maxShieldForRun(), 1, maxShieldForRun());
    let data;
    if (fromResume && run.battleState) {
      const state = run.battleState;
      data = {
        pieces: state.pieces.map(piece => makePiece(piece.color, piece.type, piece.x, piece.y, {
          id: piece.id,
          uid: piece.uid,
          origin: piece.origin || piece.type,
          alive: piece.alive,
          hasMoved: piece.hasMoved,
          dashUsed: piece.dashUsed,
          startY: piece.startY
        })),
        turns: state.turnsLeft,
        enemyHP: state.enemyHP,
        enemyHPMax: state.enemyHPMax,
        aiSkill: state.aiSkill
      };
      resetRuntimeForBattle(data);
      game.score = state.score;
      game.displayedScore = state.score;
      game.combo = state.combo;
      game.maxCombo = state.maxCombo;
      game.captures = state.captures;
      game.battleCaptures = state.battleCaptures;
      game.hype = state.hype;
      game.overdriveMoves = state.overdriveMoves;
      game.bonusActions = state.bonusActions;
      game.moveCount = state.moveCount;
      game.battleCharges = state.battleCharges || {};
      game.battleShieldLost = Boolean(state.battleShieldLost);
      game.battleMaxCombo = Number(state.battleMaxCombo || 0);
      game.crownVeil = Number(state.crownVeil || 0);
      game.enemyTurns = Number(state.enemyTurns || 0);
      run.shield = state.shield;
      run.currentContract = state.contract || run.currentContract;
    } else {
      data = buildBattleFromContract(run.currentContract);
      resetRuntimeForBattle(data);
      game.hype = clamp(Number(run.energyCarry || 0), 0, 50);
      run.energyCarry = 0;
    }
    enterBattleScreen();
    if (restoredIntent) {
      game.enemyIntent = restoredIntent;
      $('#intent-key').classList.add('show');
    } else if (!fromResume || run.stage === 'battle') {
      prepareEnemyIntent();
    } else {
      game.enemyIntent = null;
      $('#intent-key').classList.remove('show');
    }
    updateHUD(true);
    showBanner(fromResume ? 'banner.continue' : run.battle === 1 ? 'banner.opening' : 'banner.battle', run.battle === 1 || fromResume ? undefined : { number: run.battle });
    const introTrait = activeTraitId();
    if (introTrait && !fromResume) showTutorial(TRAITS[introTrait].lineKey, 3400);
    if (!fromResume) {
      run.stage = 'battle';
      run.battleState = snapshotBattle();
      run.battleStart = deepClone(run.battleState);
      run.battleStartMeta = {
        roster: deepClone(run.roster),
        promotions: run.promotions,
        crownBreaks: run.crownBreaks,
        score: run.score,
        captures: run.captures,
        maxCombo: run.maxCombo,
        shield: run.shield,
        rngState: run.rngState
      };
      game.battleStartSnapshot = deepClone(run.battleStart);
      persistRun('battle');
    } else {
      game.battleStartSnapshot = deepClone(run.battleStart || run.battleState);
    }
    offerFirstTutorial();
  }

  function resumeSavedRun() {
    const loaded = loadActiveRun();
    if (!loaded) {
      updateContinueButton();
      return;
    }
    run = loaded;
    game.mode = 'run';
    if (run.battleState) startRunBattle(true);
    else {
      const data = buildBattleFromContract(run.currentContract || makeContract(run.battle, false, false));
      resetRuntimeForBattle(data);
      enterBattleScreen();
    }
    if (run.stage === 'promotion' && run.promotionState) {
      const piece = game.pieces.find(item => item.uid === run.promotionState.pieceUid || item.id === run.promotionState.pieceId);
      const crown = game.pieces.find(item => item.color === 'b' && item.type === 'k');
      if (piece && piece.alive) {
        const callback = run.promotionState.after === 'crown' && crown
          ? () => continueEnemyCrownHit(piece, crown)
          : completePlayerMove;
        requestPromotion(piece, callback, run.promotionState.after || 'move');
      } else {
        run.promotionState = null;
        run.stage = 'battle';
        persistRun('battle');
      }
    } else if (run.stage === 'reward' && Array.isArray(run.pendingRewards)) {
      game.active = false;
      game.phase = 'reward';
      renderRewardDraft(run.pendingRewards);
      openModal(rewardModal);
    } else if (run.stage === 'contract' && Array.isArray(run.pendingContracts)) {
      game.active = false;
      game.phase = 'contract';
      renderContractChoices(run.pendingContracts);
      openModal(contractModal);
    }
  }

  function startTraining() {
    audio.start();
    run = null;
    game.mode = 'training';
    const pieces = [
      makePiece('w', 'k', 4, 7, { uid: 'training-king' }),
      makePiece('w', 'r', 0, 7, { uid: 'training-rook' }),
      makePiece('w', 'p', 3, 2, { uid: 'training-pawn', startY: 2 }),
      makePiece('b', 'p', 4, 1),
      makePiece('b', 'k', 7, 0)
    ];
    resetRuntimeForBattle({ pieces, turns: 8, enemyHP: 1, enemyHPMax: 1, aiSkill: 0 });
    game.trainingPromoted = false;
    game.trainingCrownBroken = false;
    game.trainingShield = 3;
    enterBattleScreen();
    updateHUD(true);
    showBanner('banner.training');
    showTutorial('tutorial.select', 2400);
  }

  function restoreRunMetaFromBattleStart() {
    if (!run?.battleStartMeta) return;
    run.roster = deepClone(run.battleStartMeta.roster || run.roster);
    run.promotions = Number(run.battleStartMeta.promotions || 0);
    run.crownBreaks = Number(run.battleStartMeta.crownBreaks || 0);
    run.score = Number(run.battleStartMeta.score || 0);
    run.captures = Number(run.battleStartMeta.captures || 0);
    run.maxCombo = Number(run.battleStartMeta.maxCombo || 0);
    run.shield = Number(run.battleStartMeta.shield || maxShieldForRun());
    run.rngState = Number(run.battleStartMeta.rngState || run.rngState || 1) >>> 0;
  }

  function restoreBattleStart() {
    if (game.mode === 'training') {
      startTraining();
      return;
    }
    if (!run || !run.battleStart) return;
    restoreRunMetaFromBattleStart();
    run.promotionState = null;
    run.battleState = deepClone(run.battleStart);
    run.stage = 'battle';
    startRunBattle(true);
    persistRun('battle');
  }

  function quitToTitle() {
    audio.sfx('ui');
    clearTimeout(game.transitionTimer);
    if (run && game.mode === 'run' && game.active) persistRun('battle');
    closeModal();
    game.active = false;
    game.phase = 'idle';
    setScreen('title');
  }

  function pauseGame() {
    if (!game.active || ['result', 'reward', 'contract', 'promotion'].includes(game.phase)) return;
    if (game.paused) {
      resumeGame();
      return;
    }
    game.paused = true;
    game.pausedAt = now();
    if (run && game.mode === 'run') persistRun('battle');
    audio.sfx('ui');
    openModal(pauseModal);
  }

  function resumeGame() {
    if (!game.paused) return;
    const pausedDuration = now() - game.pausedAt;
    if (game.currentAnimation) game.currentAnimation.start += pausedDuration;
    game.pieces.forEach(piece => { if (piece.anim) piece.anim.start += pausedDuration; });
    game.paused = false;
    game.lastFrame = now();
    closeModal();
    audio.sfx('ui');
  }

  function pieceAt(x, y, excludeId = null) {
    return game.pieces.find(piece => piece.alive && piece.id !== excludeId && piece.x === x && piece.y === y) || null;
  }

  function kingOf(color) {
    return game.pieces.find(piece => piece.alive && piece.color === color && piece.type === 'k') || null;
  }

  function inBounds(x, y) {
    return x >= 0 && x < 8 && y >= 0 && y < 8;
  }

  function promotionRank() {
    return game.mode === 'run' ? clamp(activeRelicLevel('earlyPromote'), 0, 2) : 0;
  }

  function getPseudoMoves(piece, attackOnly = false) {
    if (!piece || !piece.alive) return [];
    const moves = [];
    const add = (x, y) => {
      if (!inBounds(x, y)) return false;
      const target = pieceAt(x, y, piece.id);
      if (!target) {
        moves.push({ x, y, captureId: null });
        return true;
      }
      if (target.color !== piece.color) moves.push({ x, y, captureId: target.id });
      return false;
    };

    if (piece.type === 'p') {
      const dir = piece.color === 'w' ? -1 : 1;
      if (!attackOnly) {
        const oneY = piece.y + dir;
        if (inBounds(piece.x, oneY) && !pieceAt(piece.x, oneY)) {
          moves.push({ x: piece.x, y: oneY, captureId: null });
          const twoY = piece.y + dir * 2;
          const extraDashes = piece.color === 'w' ? activeRelicLevel('doubleStep') : 0;
          const canDouble = !piece.hasMoved || Number(piece.dashUsed || 0) < extraDashes;
          if (canDouble && inBounds(piece.x, twoY) && !pieceAt(piece.x, twoY)) {
            moves.push({ x: piece.x, y: twoY, captureId: null, doubleStep: true });
          }
        }
      }
      for (const dx of [-1, 1]) {
        const x = piece.x + dx;
        const y = piece.y + dir;
        if (!inBounds(x, y)) continue;
        const target = pieceAt(x, y, piece.id);
        if (attackOnly) moves.push({ x, y, captureId: target && target.color !== piece.color ? target.id : null });
        else if (target && target.color !== piece.color) moves.push({ x, y, captureId: target.id });
      }
    } else if (piece.type === 'n') {
      [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]
        .forEach(([dx, dy]) => add(piece.x + dx, piece.y + dy));
    } else if (piece.type === 'k') {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) if (dx || dy) add(piece.x + dx, piece.y + dy);
      }
    } else {
      const dirs = [];
      if (piece.type === 'r' || piece.type === 'q') dirs.push([1, 0], [-1, 0], [0, 1], [0, -1]);
      if (piece.type === 'b' || piece.type === 'q') dirs.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
      const maxSteps = piece.color === 'w' && activeTraitId() === 'chains' ? 3 : 64;
      dirs.forEach(([dx, dy]) => {
        let x = piece.x + dx;
        let y = piece.y + dy;
        let steps = 0;
        while (inBounds(x, y) && steps < maxSteps) {
          if (!add(x, y)) break;
          steps += 1;
          x += dx;
          y += dy;
        }
      });
    }
    return moves;
  }

  function isSquareAttacked(x, y, byColor) {
    return game.pieces.some(piece => {
      if (!piece.alive || piece.color !== byColor) return false;
      return getPseudoMoves(piece, true).some(move => move.x === x && move.y === y);
    });
  }

  function withTemporaryMove(piece, move, fn) {
    const oldX = piece.x;
    const oldY = piece.y;
    const oldHasMoved = piece.hasMoved;
    const captured = move.captureId ? game.pieces.find(target => target.id === move.captureId) : null;
    const oldCapturedAlive = captured ? captured.alive : null;
    piece.x = move.x;
    piece.y = move.y;
    piece.hasMoved = true;
    if (captured) captured.alive = false;
    const result = fn();
    piece.x = oldX;
    piece.y = oldY;
    piece.hasMoved = oldHasMoved;
    if (captured) captured.alive = oldCapturedAlive;
    return result;
  }

  function crownCaptureBlocked(piece, move) {
    if (piece.color !== 'w' || !move.captureId) return false;
    const target = game.pieces.find(item => item.id === move.captureId);
    if (!target || target.type !== 'k' || target.color !== 'b') return false;
    if (game.crownVeil > 0) return true;
    if (activeTraitId() === 'guarded') {
      return game.pieces.some(item => item.alive && item.color === 'b' && item.id !== target.id
        && Math.abs(item.x - target.x) <= 1 && Math.abs(item.y - target.y) <= 1);
    }
    return false;
  }

  function getLegalMoves(piece) {
    const opponent = piece.color === 'w' ? 'b' : 'w';
    return getPseudoMoves(piece)
      .filter(move => !crownCaptureBlocked(piece, move))
      .map(move => ({
        ...move,
        danger: withTemporaryMove(piece, move, () => isSquareAttacked(move.x, move.y, opponent))
      }));
  }

  function allMoves(color) {
    const result = [];
    for (const piece of game.pieces) {
      if (!piece.alive || piece.color !== color) continue;
      for (const move of getLegalMoves(piece)) result.push({ piece, move });
    }
    return result;
  }

  function selectPiece(piece) {
    if (!piece || piece.color !== 'w' || game.phase !== 'player' || game.paused) return;
    const moves = getLegalMoves(piece);
    if (!moves.length) {
      audio.sfx('ui');
      return;
    }
    game.selectedId = piece.id;
    game.legalMoves = moves;
    game.lastInputAt = now();
    game.idleHintShown = false;
    audio.sfx('select');
    if (!save.tutorial.select) {
      save.tutorial.select = true;
      persistSave();
      showTutorial('tutorial.move', 1800);
    }
  }

  function clearSelection() {
    game.selectedId = null;
    game.legalMoves = [];
  }

  function handleBoardPointer(clientX, clientY) {
    if (!game.active || game.paused || game.phase !== 'player' || modalLayer.classList.contains('active')) return;
    const { x, y, tile } = view.board;
    const bx = Math.floor((clientX - x) / tile);
    const by = Math.floor((clientY - y) / tile);
    if (!inBounds(bx, by)) {
      clearSelection();
      return;
    }
    game.lastInputAt = now();
    const selected = game.pieces.find(piece => piece.id === game.selectedId);
    const legal = game.legalMoves.find(move => move.x === bx && move.y === by);
    if (selected && legal) {
      performPlayerMove(selected, legal);
      return;
    }
    const clicked = pieceAt(bx, by);
    if (clicked && clicked.color === 'w') selectPiece(clicked);
    else clearSelection();
  }

  function chooseEnemyMove() {
    const options = allMoves('b');
    if (!options.length) return null;
    const whiteKing = kingOf('w');
    const blackKing = kingOf('b');
    const scored = options.map(option => {
      const { piece, move } = option;
      const target = move.captureId ? game.pieces.find(item => item.id === move.captureId) : null;
      let score = runRandom() * 100;
      if (target) score += target.type === 'k' ? 50000 : PIECE_VALUES[target.type] * (4 + game.aiSkill * 4);
      if (move.danger) score -= PIECE_VALUES[piece.type] * (0.8 + game.aiSkill * 1.8);
      if (whiteKing) {
        const before = Math.abs(piece.x - whiteKing.x) + Math.abs(piece.y - whiteKing.y);
        const after = Math.abs(move.x - whiteKing.x) + Math.abs(move.y - whiteKing.y);
        score += (before - after) * (34 + game.aiSkill * 82);
        const attacksKing = withTemporaryMove(piece, move, () => isSquareAttacked(whiteKing.x, whiteKing.y, 'b'));
        if (attacksKing) score += 550 + game.aiSkill * 1150;
      }
      if (blackKing && isSquareAttacked(blackKing.x, blackKing.y, 'w')) {
        const clearsThreat = withTemporaryMove(piece, move, () => !isSquareAttacked(blackKing.x, blackKing.y, 'w'));
        if (clearsThreat) score += 1400;
      }
      if (piece.type === 'p' && move.y === 7) score += 2400;
      return { ...option, score };
    }).sort((a, b) => b.score - a.score);
    const poolSize = game.aiSkill > 0.65 ? 2 : game.aiSkill > 0.38 ? 3 : 5;
    const pool = scored.slice(0, poolSize);
    const weights = pool.map((_, index) => Math.pow(0.58, index));
    let roll = runRandom() * weights.reduce((sum, value) => sum + value, 0);
    for (let i = 0; i < pool.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return pool[i];
    }
    return pool[0];
  }

  function prepareEnemyIntent() {
    if (!game.active || game.mode === 'training') {
      game.enemyIntent = null;
      updateHUD();
      return;
    }
    const choice = chooseEnemyMove();
    if (!choice) {
      game.enemyIntent = null;
      return;
    }
    game.enemyIntent = {
      pieceId: choice.piece.id,
      fromX: choice.piece.x,
      fromY: choice.piece.y,
      x: choice.move.x,
      y: choice.move.y,
      captureId: choice.move.captureId,
      madeAt: now()
    };
    $('#intent-key').classList.add('show');
    if (!save.tutorial.intent && game.moveCount === 0) {
      save.tutorial.intent = true;
      persistSave();
      window.setTimeout(() => showTutorial('tutorial.intent', 2200), 500);
    }
  }

  function beginPlayerTurn(newIntent = true) {
    if (!game.active) return;
    game.phase = 'player';
    clearSelection();
    if (newIntent) prepareEnemyIntent();
    if (!allMoves('w').length) {
      failBattle('no_legal_moves');
      return;
    }
    game.lastInputAt = now();
    updateHUD();
    if (run && game.mode === 'run') persistRun('battle');
  }

  function consumeActionCredit() {
    if (game.bonusActions > 0) {
      game.bonusActions -= 1;
      return 'bonus';
    }
    if (game.overdriveMoves > 0) {
      game.overdriveMoves -= 1;
      return 'overdrive';
    }
    return null;
  }

  function grantBonusAction(count = 1) {
    game.bonusActions = clamp(game.bonusActions + count, 0, 6);
  }

  function performPlayerMove(piece, move) {
    if (game.phase !== 'player') return;
    clearSelection();
    game.phase = 'animating';
    game.moveCount += 1;
    const fromX = piece.x;
    const fromY = piece.y;
    const captured = move.captureId ? game.pieces.find(target => target.id === move.captureId) : null;
    const credit = consumeActionCredit();
    if (!credit) game.turnsLeft -= 1;
    if (game.crownVeil > 0) game.crownVeil -= 1;
    if (!captured) {
      const momentumLevel = activeRelicLevel('momentum');
      const momentumUsed = Number(game.battleCharges.momentum || 0);
      if (game.combo > 0 && momentumLevel > momentumUsed) {
        game.battleCharges.momentum = momentumUsed + 1;
        showBanner('banner.comboSaved');
      } else {
        game.combo = 0;
      }
    }
    if (!save.tutorial.move) {
      save.tutorial.move = true;
      persistSave();
    }
    startMoveAnimation(piece, move, captured, 'player', () => {
      const context = { fromX, fromY, move, credit };
      const outcome = resolveMove(piece, captured, 'player', context);
      if (outcome === 'terminal' || outcome === 'deferred') return;
      completePlayerMove();
    });
  }

  function startMoveAnimation(piece, move, captured, actor, onDone) {
    const duration = settings.reducedMotion ? 85 : captured ? 255 : 205;
    const start = now();
    const fromX = piece.x;
    const fromY = piece.y;
    piece.x = move.x;
    piece.y = move.y;
    piece.anim = { fromX, fromY, toX: move.x, toY: move.y, start, duration, actor };
    if (captured) captured.alive = false;
    game.currentAnimation = { pieceId: piece.id, start, duration, capturedId: captured?.id || null };
    audio.sfx('move');
    window.setTimeout(() => {
      if (!game.active) return;
      const point = tileCenter(move.x, move.y);
      if (captured) {
        if (captured.type === 'k') audio.sfx('crown');
        else audio.sfx('capture', { pitch: 1 + Math.min(6, game.combo) * 0.07 });
        addImpact(point.x, point.y, captured.type === 'k' ? 'crown' : actor === 'player' ? 'player' : 'enemy', captured.type === 'k' ? 44 : 23);
        triggerHit(captured.type === 'k' ? 18 : 8, captured.type === 'k' ? 115 : 55);
      }
    }, duration * 0.68);
    window.setTimeout(() => {
      piece.anim = null;
      game.currentAnimation = null;
      onDone();
    }, duration + (captured && !settings.reducedMotion ? 75 : 15));
  }

  function getShield() {
    return game.mode === 'run' ? Number(run?.shield || 0) : Number(game.trainingShield || 3);
  }

  function setShield(value) {
    if (game.mode === 'run' && run) run.shield = value;
    else game.trainingShield = value;
  }

  function addScore(amount, x = null, y = null, label = null, kind = 'cyan') {
    const value = Math.max(0, Math.round(amount));
    game.score += value;
    if (label && x !== null) addFloatingText(x, y, label, kind);
  }

  function comboMultiplier() {
    return clamp(1 + game.combo * 0.25, 1, 3);
  }

  function registerComboStep() {
    game.combo += 1;
    game.maxCombo = Math.max(game.maxCombo, game.combo);
    game.battleMaxCombo = Math.max(game.battleMaxCombo || 0, game.combo);
    const tierKey = game.combo === 3 ? 'combo.great' : game.combo === 5 ? 'combo.wild' : game.combo === 8 ? 'combo.frenzy' : null;
    return tierKey;
  }

  function announceComboTier(tierKey, x, y) {
    if (!tierKey) return;
    addFloatingText(x, y - view.board.tile * 0.55, t(tierKey), 'gold');
    triggerHit(6, 40);
  }

  function addHype(amount) {
    if (game.overdriveMoves > 0) return;
    const gain = activeTraitId() === 'hex' && amount > 0 ? amount * 0.5 : amount;
    const before = game.hype;
    game.hype = clamp(game.hype + gain, 0, 100);
    if (before < 100 && game.hype >= 100) {
      audio.sfx('ready');
      showBanner('banner.energyReady');
    }
  }

  function destroyExtraPiece(target, source, factor = 0.55) {
    if (!target || !target.alive || target.color !== 'b' || target.type === 'k') return false;
    target.alive = false;
    game.captures += 1;
    game.battleCaptures += 1;
    save.totalCaptures += 1;
    const tierKey = registerComboStep();
    const point = tileCenter(target.x, target.y);
    const value = Math.round(PIECE_VALUES[target.type] * comboMultiplier() * factor);
    addScore(value, point.x, point.y, `+${value}`);
    announceComboTier(tierKey, point.x, point.y);
    addHype(10 + PIECE_VALUES[target.type] / 30);
    addImpact(point.x, point.y, 'player', 18);
    audio.sfx('capture', { pitch: 1 + Math.min(6, game.combo) * 0.07 });
    return true;
  }

  function triggerBishopPrism(piece, context) {
    const level = activeRelicLevel('bishopPrism');
    if (!level || piece.type !== 'b') return;
    const dx = sign(piece.x - context.fromX);
    const dy = sign(piece.y - context.fromY);
    let x = piece.x + dx;
    let y = piece.y + dy;
    let hits = 0;
    while (inBounds(x, y) && hits < level) {
      const target = pieceAt(x, y);
      if (target) {
        if (target.color === 'b' && target.type !== 'k') {
          if (destroyExtraPiece(target, piece, 0.62)) hits += 1;
        } else {
          break;
        }
      }
      x += dx;
      y += dy;
    }
  }

  function triggerRookRam(piece) {
    const level = activeRelicLevel('rookRam');
    if (!level || piece.type !== 'r') return;
    const targets = [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .map(([dx, dy]) => pieceAt(piece.x + dx, piece.y + dy))
      .filter(target => target && target.color === 'b' && target.type !== 'k')
      .sort((a, b) => PIECE_VALUES[b.type] - PIECE_VALUES[a.type]);
    targets.slice(0, level === 1 ? 1 : 4).forEach(target => destroyExtraPiece(target, piece, 0.5));
  }

  function triggerPawnRelay(source) {
    const level = activeRelicLevel('pawnRelay');
    if (!level || source.type !== 'p') return;
    const targetRank = promotionRank();
    const candidates = game.pieces
      .filter(piece => piece.alive && piece.color === 'w' && piece.type === 'p' && piece.id !== source.id)
      .map(piece => ({ piece, nextY: piece.y - 1 }))
      .filter(item => item.nextY > targetRank && !pieceAt(item.piece.x, item.nextY))
      .sort((a, b) => a.piece.y - b.piece.y);
    candidates.slice(0, level).forEach(({ piece, nextY }) => {
      const oldY = piece.y;
      piece.y = nextY;
      piece.hasMoved = true;
      piece.anim = {
        fromX: piece.x, fromY: oldY, toX: piece.x, toY: nextY,
        start: now(), duration: settings.reducedMotion ? 80 : 190, actor: 'player'
      };
      window.setTimeout(() => { piece.anim = null; }, settings.reducedMotion ? 95 : 210);
      const point = tileCenter(piece.x, nextY);
      addImpact(point.x, point.y, 'promotion', 9);
    });
  }

  function handlePlayerCapture(piece, captured, context) {
    game.captures += 1;
    game.battleCaptures += 1;
    save.totalCaptures += 1;
    const tierKey = registerComboStep();
    const dangerLevel = activeRelicLevel('dangerReward');
    const dangerBoost = context.move.danger && dangerLevel ? 1 + dangerLevel : 1;
    const bountyLevel = activeRelicLevel('bounty');
    const jackpotMult = bountyLevel && game.battleCaptures % 3 === 0 ? bountyLevel + 1 : 1;
    const wrathLevel = piece.type === 'k' ? activeRelicLevel('kingsWrath') : 0;
    const wrathMult = wrathLevel ? wrathLevel + 1 : 1;
    const value = Math.round(PIECE_VALUES[captured.type] * comboMultiplier() * dangerBoost * jackpotMult * wrathMult);
    const point = tileCenter(piece.x, piece.y);
    addScore(value, point.x, point.y, `+${value}`, dangerBoost > 1 || jackpotMult > 1 ? 'gold' : 'cyan');
    announceComboTier(tierKey, point.x, point.y);
    addHype(18 + PIECE_VALUES[captured.type] / 19 + (dangerBoost > 1 ? 20 + dangerLevel * 10 : 0));
    if (jackpotMult > 1) {
      showBanner('banner.jackpot', { multiplier: jackpotMult });
      addImpact(point.x, point.y, 'crown', 30);
      triggerFlash('crown');
      audio.sfx('jackpot');
    }
    if (wrathLevel) addHype(10 + wrathLevel * 15);

    const interceptLevel = activeRelicLevel('interceptor');
    if (interceptLevel && game.enemyIntent?.pieceId === captured.id
      && Number(game.battleCharges.interceptor || 0) < interceptLevel) {
      game.battleCharges.interceptor = Number(game.battleCharges.interceptor || 0) + 1;
      if (context.credit) grantBonusAction(1);
      else game.turnsLeft += 1;
      showBanner('banner.intercept');
      addHype(10);
    }

    const tempoLevel = activeRelicLevel('captureTempo');
    if (tempoLevel && Number(game.battleCharges.captureTempo || 0) < tempoLevel) {
      game.battleCharges.captureTempo = Number(game.battleCharges.captureTempo || 0) + 1;
      grantBonusAction(1);
    }
    const spurLevel = activeRelicLevel('knightSpur');
    if (piece.type === 'n' && spurLevel && Number(game.battleCharges.knightSpur || 0) < spurLevel) {
      game.battleCharges.knightSpur = Number(game.battleCharges.knightSpur || 0) + 1;
      grantBonusAction(1);
    }
    if (piece.type === 'q') addHype(activeRelicLevel('queenBattery') * 28);
    triggerBishopPrism(piece, context);
    triggerRookRam(piece);
    triggerPawnRelay(piece);
  }

  function shouldPromote(piece) {
    if (!piece || piece.type !== 'p') return false;
    if (piece.color === 'w') return piece.y <= promotionRank();
    return piece.y >= 7;
  }

  function resolveMove(piece, captured, actor, context) {
    if (piece.type === 'p' && context.move.doubleStep && piece.hasMoved) piece.dashUsed += 1;
    piece.hasMoved = true;

    if (captured?.type === 'k') {
      if (actor === 'player' && captured.color === 'b') {
        handleEnemyCrownHit(piece, captured);
      } else if (actor === 'enemy' && captured.color === 'w') {
        handlePlayerCrownHit(piece, captured);
      }
      return 'terminal';
    }

    if (captured && actor === 'player') handlePlayerCapture(piece, captured, context);

    if (actor === 'enemy' && shouldPromote(piece)) {
      piece.type = 'q';
      const point = tileCenter(piece.x, piece.y);
      addImpact(point.x, point.y, 'enemy', 25);
      audio.sfx('promotion');
      showBanner('banner.enemyPromotion');
    }

    if (actor === 'player' && shouldPromote(piece)) {
      game.pendingAfterMove = completePlayerMove;
      requestPromotion(piece);
      return 'deferred';
    }

    updateHUD();
    return 'done';
  }

  function completePlayerMove() {
    if (!game.active) return;
    if (game.turnsLeft <= 0 && game.bonusActions <= 0 && game.overdriveMoves <= 0) {
      failBattle('turns_exhausted');
      return;
    }
    updateHUD();
    if (game.bonusActions > 0 || game.overdriveMoves > 0) {
      showBanner('banner.extraMove');
      beginPlayerTurn(false);
      return;
    }
    executeEnemyIntent();
  }

  function executeEnemyIntent() {
    if (!game.active) return;
    const intent = game.enemyIntent;
    game.enemyIntent = null;
    $('#intent-key').classList.remove('show');
    clearSelection();
    if (!intent) {
      beginPlayerTurn(true);
      return;
    }
    game.phase = 'enemy';
    const delay = settings.reducedMotion ? 80 : 260;
    window.setTimeout(() => {
      if (!game.active || game.paused || game.phase !== 'enemy') return;
      const actor = game.pieces.find(piece => piece.id === intent.pieceId && piece.alive);
      if (!actor || actor.x !== intent.fromX || actor.y !== intent.fromY) {
        const point = actor ? tileCenter(actor.x, actor.y) : tileCenter(intent.fromX, intent.fromY);
        addImpact(point.x, point.y, 'enemy', 8);
        beginPlayerTurn(true);
        return;
      }
      const legal = getPseudoMoves(actor).find(move => move.x === intent.x && move.y === intent.y);
      if (!legal) {
        const point = tileCenter(actor.x, actor.y);
        addImpact(point.x, point.y, 'enemy', 8);
        beginPlayerTurn(true);
        return;
      }
      const occupant = pieceAt(intent.x, intent.y, actor.id);
      if (occupant && occupant.color === 'b') {
        beginPlayerTurn(true);
        return;
      }
      const move = { x: intent.x, y: intent.y, captureId: occupant?.id || null };
      const captured = occupant || null;
      const fromX = actor.x;
      const fromY = actor.y;
      game.phase = 'animating';
      startMoveAnimation(actor, move, captured, 'enemy', () => {
        const outcome = resolveMove(actor, captured, 'enemy', { fromX, fromY, move, credit: null });
        if (outcome === 'terminal') return;
        afterEnemyAction();
        beginPlayerTurn(true);
      });
    }, delay);
  }

  function activateOverdrive() {
    if (!game.active || game.paused || game.phase !== 'player' || game.hype < 100 || game.overdriveMoves > 0) return;
    game.hype = 0;
    game.overdriveMoves = 3 + activeRelicLevel('overcharge');
    clearSelection();
    audio.sfx('burst');
    triggerFlash('burst');
    triggerHit(20, 140);
    showBanner('banner.overdrive');
    for (let i = 0; i < (settings.reducedMotion ? 25 : 74); i++) {
      const angle = i / 74 * Math.PI * 2;
      particles.push({
        x: view.width / 2, y: view.height / 2,
        vx: Math.cos(angle) * (2 + Math.random() * 9),
        vy: Math.sin(angle) * (2 + Math.random() * 9),
        life: 600 + Math.random() * 500, maxLife: 1100,
        size: 2 + Math.random() * 4, kind: i % 2 ? 'player' : 'crown', rotation: 0
      });
    }
    updateHUD();
  }

  function movementDiagram(type) {
    const lines = [];
    const dots = [];
    if (type === 'r' || type === 'q') {
      lines.push('<line class="ray" x1="50" y1="50" x2="50" y2="8"/>', '<line class="ray" x1="50" y1="50" x2="50" y2="92"/>', '<line class="ray" x1="50" y1="50" x2="8" y2="50"/>', '<line class="ray" x1="50" y1="50" x2="92" y2="50"/>');
    }
    if (type === 'b' || type === 'q') {
      lines.push('<line class="ray" x1="50" y1="50" x2="12" y2="12"/>', '<line class="ray" x1="50" y1="50" x2="88" y2="12"/>', '<line class="ray" x1="50" y1="50" x2="12" y2="88"/>', '<line class="ray" x1="50" y1="50" x2="88" y2="88"/>');
    }
    if (type === 'n') {
      [[30,10],[70,10],[10,30],[90,30],[10,70],[90,70],[30,90],[70,90]].forEach(([x,y]) => dots.push(`<circle class="jump" cx="${x}" cy="${y}" r="5"/>`));
    }
    const grid = [20, 40, 60, 80].map(value => `<line class="grid" x1="${value}" y1="0" x2="${value}" y2="100"/><line class="grid" x1="0" y1="${value}" x2="100" y2="${value}"/>`).join('');
    return `<svg class="move-diagram" viewBox="0 0 100 100" aria-hidden="true">${grid}${lines.join('')}${dots.join('')}<circle class="core" cx="50" cy="50" r="5"/></svg>`;
  }

  function renderPromotionChoices() {
    const grid = $('#promotion-grid');
    const order = ['n', 'b', 'r', 'q'];
    grid.innerHTML = order.map(type => `
      <button class="promotion-choice" type="button" data-type="${type}" aria-label="${t('aria.promoteTo', { piece: t(PIECE_NAMES[type]) })}">
        <span class="piece-big">${PIECE_GLYPHS.w[type]}</span>
        ${movementDiagram(type)}
      </button>`).join('');
    $$('.promotion-choice', grid).forEach(button => button.addEventListener('click', () => choosePromotion(button.dataset.type)));
  }

  function requestPromotion(piece, callback = null, after = callback ? 'crown' : 'move') {
    if (!piece || !piece.alive || piece.type !== 'p') return;
    game.phase = 'promotion';
    game.promotionPending = { pieceId: piece.id, callback: callback || game.pendingAfterMove || null };
    game.pendingAfterMove = null;
    clearSelection();
    renderPromotionChoices();
    openModal(promotionModal);
    if (run && game.mode === 'run') {
      run.promotionState = { pieceUid: piece.uid || null, pieceId: piece.id, after };
      run.stage = 'promotion';
      run.battleState = snapshotBattle();
      try { localStorage.setItem(RUN_KEY, JSON.stringify(run)); } catch (_) { /* unavailable */ }
    }
    if (!save.tutorial.promotion) {
      save.tutorial.promotion = true;
      persistSave();
    }
  }

  function choosePromotion(type) {
    if (!['n', 'b', 'r', 'q'].includes(type) || !game.promotionPending) return;
    const pending = game.promotionPending;
    const piece = game.pieces.find(item => item.id === pending.pieceId && item.alive);
    if (!piece) {
      game.promotionPending = null;
      closeModal();
      return;
    }
    piece.type = type;
    if (run && game.mode === 'run') {
      const member = run.roster.find(item => item.uid === piece.uid);
      if (member) member.type = type;
      run.promotions += 1;
    }
    if (game.mode === 'training') game.trainingPromoted = true;
    save.totalPromotions += 1;
    persistSave();
    const point = tileCenter(piece.x, piece.y);
    addImpact(point.x, point.y, 'promotion', 38);
    addScore(700 + (run?.battle || 0) * 80, point.x, point.y, '+700', 'gold');
    addHype(30);
    const tempo = activeRelicLevel('promoteTempo');
    if (tempo) {
      grantBonusAction(tempo);
      addHype(25 * tempo);
    }
    audio.sfx('promotion');
    triggerFlash('crown');
    showBanner('banner.promoted');
    game.promotionPending = null;
    if (run && game.mode === 'run') {
      run.promotionState = null;
      run.stage = 'battle';
      persistRun('battle');
    }
    closeModal();
    updateHUD(true);
    const callback = pending.callback;
    if (!game.active) return;
    if (typeof callback === 'function') callback();
    else completePlayerMove();
  }

  function handleEnemyCrownHit(attacker, crown) {
    game.enemyIntent = null;
    $('#intent-key').classList.remove('show');
    game.captures += 1;
    game.battleCaptures += 1;
    save.totalCaptures += 1;
    registerComboStep();
    game.enemyHP -= 1;
    if (run) run.crownBreaks += 1;
    const point = tileCenter(attacker.x, attacker.y);
    const value = Math.round((1900 + game.enemyHPMax * 360) * comboMultiplier());
    addScore(value, point.x, point.y, `+${value}`, 'gold');
    addHype(40);
    triggerFlash('crown');
    updateHUD();

    const continueHit = () => continueEnemyCrownHit(attacker, crown);
    if (shouldPromote(attacker)) {
      requestPromotion(attacker, continueHit);
      return;
    }
    continueHit();
  }

  function continueEnemyCrownHit(attacker, crown) {
    showBanner(game.enemyHP <= 0 ? 'banner.cleared' : game.enemyHP === 1 ? 'banner.lastCrown' : 'banner.crownCracked');
    if (game.enemyHP <= 0) {
      game.phase = 'transition';
      game.transitionTimer = window.setTimeout(() => {
        if (game.mode === 'training') finishTraining();
        else completeBattle();
      }, settings.reducedMotion ? 280 : 950);
      return;
    }
    game.phase = 'transition';
    game.transitionTimer = window.setTimeout(() => {
      respawnEnemyCrown(crown);
      spawnPhaseReinforcements();
      grantBonusAction(1 + activeRelicLevel('crownSurge'));
      beginPlayerTurn(true);
    }, settings.reducedMotion ? 180 : 720);
  }

  function respawnEnemyCrown(crown) {
    const candidates = [];
    for (let y = 0; y <= 2; y++) {
      for (let x = 0; x < 8; x++) if (!pieceAt(x, y)) candidates.push({ x, y });
    }
    const playerKing = kingOf('w');
    candidates.sort((a, b) => {
      const da = playerKing ? Math.abs(a.x - playerKing.x) + Math.abs(a.y - playerKing.y) : 0;
      const db = playerKing ? Math.abs(b.x - playerKing.x) + Math.abs(b.y - playerKing.y) : 0;
      return db - da;
    });
    const choice = candidates[Math.floor(runRandom() * Math.max(1, Math.min(6, candidates.length)))] || { x: 4, y: 0 };
    crown.x = choice.x;
    crown.y = choice.y;
    crown.alive = true;
    crown.anim = null;
    crown.spawnAt = now();
    game.crownVeil = 1;
    const point = tileCenter(crown.x, crown.y);
    addImpact(point.x, point.y, 'enemy', 30);
    addFloatingText(point.x, point.y - view.board.tile * 0.7, t('crown.veil'), 'cyan');
  }

  function phantomShiftCrown() {
    const crown = kingOf('b');
    if (!crown) return;
    const candidates = [];
    for (let y = 0; y <= 2; y++) {
      for (let x = 0; x < 8; x++) if (!pieceAt(x, y)) candidates.push({ x, y });
    }
    if (!candidates.length) return;
    const from = tileCenter(crown.x, crown.y);
    addImpact(from.x, from.y, 'enemy', 9);
    const spot = candidates[Math.floor(runRandom() * candidates.length)];
    crown.x = spot.x;
    crown.y = spot.y;
    crown.anim = null;
    crown.spawnAt = now();
    const point = tileCenter(spot.x, spot.y);
    addImpact(point.x, point.y, 'enemy', 13);
  }

  function afterEnemyAction() {
    game.enemyTurns = Number(game.enemyTurns || 0) + 1;
    const trait = activeTraitId();
    if (trait === 'summoner' && game.enemyTurns % 3 === 0) {
      const occupied = new Set(game.pieces.filter(piece => piece.alive).map(piece => `${piece.x},${piece.y}`));
      const open = shuffled(openSquares(occupied, [1, 2]));
      if (open.length) {
        const spot = open[0];
        game.pieces.push(makePiece('b', 'p', spot.x, spot.y));
        const point = tileCenter(spot.x, spot.y);
        addImpact(point.x, point.y, 'enemy', 11);
      }
    }
    if (trait === 'phantom') phantomShiftCrown();
  }

  function spawnPhaseReinforcements() {
    if (!run || game.mode !== 'run') return;
    const occupied = new Set(game.pieces.filter(piece => piece.alive).map(piece => `${piece.x},${piece.y}`));
    const count = clamp(1 + Math.floor(run.battle / 2), 1, 3);
    const pool = run.battle >= 4 ? ['p', 'n', 'b', 'r'] : ['p', 'p', 'n', 'b'];
    for (let i = 0; i < count; i++) {
      const open = shuffled(openSquares(occupied, [1, 2, 3]));
      if (!open.length) break;
      const spot = open[0];
      occupied.add(`${spot.x},${spot.y}`);
      const piece = makePiece('b', choose(pool), spot.x, spot.y);
      game.pieces.push(piece);
      const point = tileCenter(spot.x, spot.y);
      addImpact(point.x, point.y, 'enemy', 11);
    }
  }

  function handlePlayerCrownHit(attacker, crown) {
    setShield(getShield() - 1);
    game.battleShieldLost = true;
    attacker.alive = false;
    crown.alive = true;
    crown.anim = null;
    crown.x = attacker.x;
    crown.y = attacker.y;
    game.combo = 0;
    const point = tileCenter(crown.x, crown.y);
    addImpact(point.x, point.y, 'hurt', 38);
    audio.sfx('hurt');
    triggerFlash('hurt');
    showBanner('banner.shieldLost');
    updateHUD();
    if (getShield() <= 0) {
      game.phase = 'transition';
      game.transitionTimer = window.setTimeout(() => failBattle('crown_broken'), settings.reducedMotion ? 180 : 650);
    } else {
      game.phase = 'transition';
      game.transitionTimer = window.setTimeout(() => beginPlayerTurn(true), settings.reducedMotion ? 120 : 480);
    }
  }

  function failBattle(reason) {
    if (!FAILURE_CODES.includes(reason)) throw new RangeError(`Unknown failure reason: ${String(reason)}`);
    const localizedReason = t(`failure.${reason}`);
    if (game.phase === 'result') return;
    game.active = false;
    game.phase = 'result';
    game.enemyIntent = null;
    $('#intent-key').classList.remove('show');
    audio.sfx('fail');
    game.failureReason = reason;
    $('#fail-reason').textContent = localizedReason;
    if (run && game.mode === 'run') {
      restoreRunMetaFromBattleStart();
      run.promotionState = null;
      run.battleState = deepClone(run.battleStart || run.battleState);
      run.stage = 'battle';
      try { localStorage.setItem(RUN_KEY, JSON.stringify(run)); } catch (_) { /* unavailable */ }
    }
    openModal(failModal);
  }

  function finishTraining() {
    game.active = false;
    game.phase = 'result';
    game.trainingCrownBroken = true;
    audio.sfx('victory');
    openModal(trainingResultModal);
  }

  function rewardWeight(item, elite = false) {
    let weight = 1;
    const types = new Set(run.roster.map(member => member.type));
    if (item.id === 'knightSpur' && types.has('n')) weight += 1.5;
    if (item.id === 'bishopPrism' && types.has('b')) weight += 1.5;
    if (item.id === 'rookRam' && types.has('r')) weight += 1.5;
    if (item.id === 'queenBattery' && types.has('q')) weight += 1.5;
    if (item.kind === 'pawn' && types.has('p')) weight += 1.2;
    if (run.battle >= 4 && item.kind === 'guard') weight += 0.8;
    if (item.rarity === 'rare') weight *= elite ? 1.4 : 0.7;
    return weight;
  }

  function generateRewardDraft() {
    const elite = Boolean(run.currentContract?.elite);
    const eligible = RELICS.filter(item => activeRelicLevel(item.id) < item.max);
    const scored = eligible.map(item => ({
      item,
      score: runRandom() * rewardWeight(item, elite),
      rare: item.rarity === 'rare'
    })).sort((a, b) => b.score - a.score);
    return scored.slice(0, Math.min(3, scored.length)).map(entry => ({ id: entry.item.id, rare: entry.rare }));
  }

  function computeBattleBonuses() {
    const bonuses = [];
    const turnsLeft = Math.max(0, game.turnsLeft);
    if (turnsLeft > 2) {
      const score = turnsLeft * 120;
      bonuses.push({ key: 'tally.turns', params: { score }, score });
    }
    if (!game.battleShieldLost) bonuses.push({ key: 'tally.perfect', params: { score: 700 }, score: 700 });
    if (turnsLeft <= 2) bonuses.push({ key: 'tally.clutch', params: { score: 500 }, score: 500 });
    const bestCombo = Number(game.battleMaxCombo || 0);
    if (bestCombo >= 3) {
      const score = bestCombo * 80;
      bonuses.push({ key: 'tally.combo', params: { count: bestCombo, score }, score });
    }
    return bonuses;
  }

  function runTallySequence(bonuses, done) {
    const overlay = $('#tally');
    const lines = $('#tally-lines');
    if (!overlay || !lines) {
      done();
      return;
    }
    $('#tally-head').textContent = t('tally.title');
    lines.innerHTML = '';
    overlay.classList.add('show');
    const stepDelay = settings.reducedMotion ? 110 : 420;
    let index = 0;
    const pushLine = () => {
      if (index < bonuses.length) {
        const bonus = bonuses[index++];
        const li = document.createElement('li');
        li.textContent = t(bonus.key, bonus.params);
        lines.appendChild(li);
        audio.sfx('ui');
        window.setTimeout(pushLine, stepDelay);
        return;
      }
      const total = document.createElement('li');
      total.className = 'tally-total';
      total.textContent = t('tally.total', { score: formatScore(game.score) });
      lines.appendChild(total);
      audio.sfx('ready');
      window.setTimeout(() => {
        overlay.classList.remove('show');
        done();
      }, settings.reducedMotion ? 240 : 950);
    };
    window.setTimeout(pushLine, settings.reducedMotion ? 60 : 300);
  }

  function completeBattle() {
    if (!run || game.mode !== 'run') return;
    game.active = false;
    game.phase = 'transition';
    game.enemyIntent = null;
    run.promotionState = null;
    const bonuses = computeBattleBonuses();
    game.score += bonuses.reduce((sum, bonus) => sum + bonus.score, 0);
    run.score = game.score;
    run.captures = game.captures;
    run.maxCombo = Math.max(run.maxCombo, game.maxCombo);
    run.energyCarry = clamp(Math.max(0, game.turnsLeft) * 4, 0, 50);
    const elite = Boolean(run.currentContract?.elite);
    run.shield = Math.min(maxShieldForRun(), getShield() + (elite ? 0 : 1));
    run.battleState = snapshotBattle();
    if (run.battle >= run.totalBattles) {
      window.setTimeout(() => runTallySequence(bonuses, finishRun), settings.reducedMotion ? 120 : 450);
      return;
    }
    run.rewardPicksRemaining = Math.max(1, Number(run.currentContract?.reward || 1));
    run.pendingRewards = generateRewardDraft();
    run.stage = 'reward';
    persistRun('reward');
    window.setTimeout(() => {
      runTallySequence(bonuses, () => {
        renderRewardDraft(run.pendingRewards);
        openModal(rewardModal);
        if (!save.tutorial.reward) {
          save.tutorial.reward = true;
          persistSave();
        }
      });
    }, settings.reducedMotion ? 120 : 450);
  }

  function relicFigure(id) {
    const item = RELIC_BY_ID[id];
    const glyph = item?.glyph || '◆';
    const base = `<text class="main" x="75" y="94" text-anchor="middle">${glyph}</text>`;
    switch (id) {
      case 'doubleStep': return `<svg viewBox="0 0 150 150">${base}<path class="line" d="M75 112 L75 35 M62 49 L75 34 L88 49 M62 74 L75 59 L88 74"/></svg>`;
      case 'earlyPromote': return `<svg viewBox="0 0 150 150">${base}<path class="line" d="M25 35 H125 M25 52 H125"/><path class="line" d="M75 112 V44 M63 57 L75 43 L87 57"/></svg>`;
      case 'promoteTempo': return `<svg viewBox="0 0 150 150">${base}<path class="line" d="M30 115 C20 55 50 20 98 30 C132 37 136 78 116 100"/><path class="line" d="M105 89 L117 101 L132 91"/></svg>`;
      case 'captureTempo': return `<svg viewBox="0 0 150 150">${base}<rect class="hit" x="104" y="30" width="20" height="20" transform="rotate(45 114 40)"/><path class="line" d="M25 115 C22 55 51 27 96 35"/></svg>`;
      case 'knightSpur': return `<svg viewBox="0 0 150 150">${base}<path class="line" d="M28 118 L28 72 L69 72 L69 34"/><circle class="hit" cx="69" cy="28" r="8"/></svg>`;
      case 'bishopPrism': return `<svg viewBox="0 0 150 150">${base}<path class="line" d="M25 125 L125 25"/><rect class="hit" x="108" y="18" width="15" height="15" transform="rotate(45 115 25)"/></svg>`;
      case 'rookRam': return `<svg viewBox="0 0 150 150">${base}<path class="line" d="M20 75 H130 M114 61 L130 75 L114 89"/><circle class="hit" cx="132" cy="75" r="9"/></svg>`;
      case 'queenBattery': return `<svg viewBox="0 0 150 150">${base}<path class="line" d="M111 22 L88 64 H111 L88 112"/></svg>`;
      case 'pawnRelay': return `<svg viewBox="0 0 150 150">${base}<text class="main" x="112" y="112" text-anchor="middle" style="font-size:48px">♙</text><path class="line" d="M91 98 C93 63 102 45 116 34 M104 45 L117 33 L126 48"/></svg>`;
      case 'shield': return `<svg viewBox="0 0 150 150">${base}<path class="line" d="M75 18 L124 35 V77 C124 108 103 126 75 137 C47 126 26 108 26 77 V35 Z"/></svg>`;
      case 'turns': return `<svg viewBox="0 0 150 150">${base}<path class="line" d="M46 26 H104 M46 124 H104 M51 28 C51 59 66 61 75 75 C84 89 99 91 99 122 M99 28 C99 59 84 61 75 75 C66 89 51 91 51 122"/></svg>`;
      case 'dangerReward': return `<svg viewBox="0 0 150 150">${base}<path class="danger" d="M75 18 L136 128 H14 Z" opacity=".55"/><rect class="hit" x="106" y="26" width="19" height="19" transform="rotate(45 115 35)"/></svg>`;
      case 'bounty': return `<svg viewBox="0 0 150 150">${base}<rect class="hit" x="45" y="25" width="16" height="16" transform="rotate(45 53 33)"/><rect class="hit" x="80" y="25" width="16" height="16" transform="rotate(45 88 33)"/><rect class="hit" x="62" y="52" width="22" height="22" transform="rotate(45 73 63)"/><path class="line" d="M73 40 L73 22 M55 63 L37 63 M91 63 L109 63"/></svg>`;
      case 'momentum': return `<svg viewBox="0 0 150 150">${base}<circle class="hit" cx="34" cy="98" r="7"/><circle class="hit" cx="60" cy="72" r="8"/><circle class="hit" cx="88" cy="46" r="9"/><path class="line" d="M34 98 C48 88 48 82 60 72 C74 60 74 56 88 46"/></svg>`;
      case 'interceptor': return `<svg viewBox="0 0 150 150">${base}<path class="danger" d="M25 35 L95 90" stroke-dasharray="10 7" style="fill:none;stroke-width:4"/><rect class="hit" x="88" y="82" width="18" height="18" transform="rotate(45 97 91)"/><path class="line" d="M40 110 L92 88"/></svg>`;
      case 'overcharge': return `<svg viewBox="0 0 150 150">${base}<path class="line" d="M62 18 L40 62 H62 L40 108"/><path class="line" d="M96 30 L82 60 H96 L82 90" opacity=".55"/></svg>`;
      case 'kingsWrath': return `<svg viewBox="0 0 150 150">${base}<path class="line" d="M42 44 L30 24 M75 38 L75 15 M108 44 L120 24"/><rect class="hit" x="99" y="60" width="18" height="18" transform="rotate(45 108 69)"/></svg>`;
      case 'crownSurge': return `<svg viewBox="0 0 150 150">${base}<path class="line" d="M40 96 L40 58 M30 68 L40 56 L50 68 M75 88 L75 44 M64 56 L75 42 L86 56 M110 96 L110 58 M100 68 L110 56 L120 68"/></svg>`;
      default: return `<svg viewBox="0 0 150 150">${base}</svg>`;
    }
  }

  function renderRewardDraft(draft) {
    if (!Array.isArray(draft) || !draft.length) return;
    const grid = $('#reward-grid');
    grid.innerHTML = draft.map(entry => {
      const item = RELIC_BY_ID[entry.id];
      const level = activeRelicLevel(entry.id);
      const nextLevel = level + 1;
      const pips = Array.from({ length: item.max }, (_, index) => `<i class="${index < nextLevel ? 'on' : ''}"></i>`).join('');
      const effectLine = relicEffectLine(item.id, nextLevel);
      const name = t(item.nameKey);
      return `<button class="reward-card ${entry.rare ? 'rare' : ''}" type="button" data-id="${item.id}" aria-label="${t('aria.reward', { name, effect: effectLine })}">
        ${entry.rare ? `<span class="rare-badge">${t('reward.rare')}</span>` : ''}
        <span class="relic-level">${pips}</span>
        <span class="relic-figure">${relicFigure(item.id)}</span>
        <h3>${name}</h3>
        <p>${effectLine}</p>
        <span class="upgrade-note">${level ? t('reward.upgrade', { level: level + 1 }) : t('reward.new')}</span>
      </button>`;
    }).join('');
    $$('.reward-card', grid).forEach(button => button.addEventListener('click', () => chooseReward(button.dataset.id)));
  }

  function applyRelic(id) {
    const item = RELIC_BY_ID[id];
    if (!item || !run) return;
    const before = activeRelicLevel(id);
    run.relics[id] = clamp(before + 1, 0, item.max);
    if (id === 'shield') run.shield = Math.min(maxShieldForRun(), run.shield + 1);
    if (!save.discoveredRelics.includes(id)) save.discoveredRelics.push(id);
    persistSave();
    audio.sfx('promotion');
  }

  function chooseReward(id) {
    if (!run || run.stage !== 'reward') return;
    applyRelic(id);
    run.rewardPicksRemaining = Math.max(0, Number(run.rewardPicksRemaining || 1) - 1);
    if (run.rewardPicksRemaining > 0) {
      run.pendingRewards = generateRewardDraft();
      persistRun('reward');
      renderRewardDraft(run.pendingRewards);
      showBanner('banner.chooseAgain');
      return;
    }
    closeModal();
    run.pendingRewards = null;
    run.pendingContracts = buildContractChoices();
    run.stage = 'contract';
    persistRun('contract');
    renderContractChoices(run.pendingContracts);
    openModal(contractModal);
  }

  function previewRandomFactory(seed) {
    const holder = { rngState: seed || 1 };
    return () => rngNext(holder);
  }

  function contractPreviewCells(contract) {
    const cells = Array(24).fill('');
    const random = previewRandomFactory(hashString(contract.id));
    const occupied = new Set();
    const place = (glyph, preferred = null) => {
      let index = preferred;
      if (!Number.isInteger(index) || occupied.has(index)) {
        const open = cells.map((_, i) => i).filter(i => !occupied.has(i));
        index = open[Math.floor(random() * open.length)];
      }
      if (!Number.isInteger(index)) return;
      occupied.add(index);
      cells[index] = glyph;
    };
    place('♚', 3);
    const depth = contract.depth || 1;
    const base = 3 + Math.min(5, depth) + (contract.elite ? (depth <= 3 ? 1 : 2) : 0);
    const pool = ['♟', '♟', '♞', '♝', '♜'];
    for (let i = 0; i < base; i++) place(pool[Math.floor(random() * pool.length)]);
    if (hasMod(contract, 'swarm')) for (let i = 0; i < 3; i++) place('♟');
    if (hasMod(contract, 'cavalry')) for (let i = 0; i < 2; i++) place('♞');
    if (hasMod(contract, 'walls')) for (let i = 0; i < 2; i++) place('♜');
    if (hasMod(contract, 'diagonals')) for (let i = 0; i < 2; i++) place('♝');
    if (hasMod(contract, 'queen')) place('♛');
    return cells.map(glyph => `<span class="${glyph ? 'enemy' : ''}">${glyph}</span>`).join('');
  }

  function renderContractChoices(choices) {
    if (!Array.isArray(choices) || !choices.length) return;
    const grid = $('#contract-grid');
    $('#contract-title').textContent = t(choices.length === 1 ? 'contract.final' : 'contract.next');
    grid.innerHTML = choices.map((contract, index) => {
      const bossDef = contract.boss ? BOSS_DEFS[contract.boss] : null;
      const hp = bossDef ? bossDef.hp : clamp(1 + (contract.elite ? 1 : 0) + (hasMod(contract, 'armor') ? 1 : 0), 1, 3);
      const crowns = Array.from({ length: hp }, () => '<span>♚</span>').join('');
      const typeKey = contract.final ? 'contract.type.final' : contract.elite ? 'contract.type.elite' : 'contract.type.normal';
      const mods = contract.mods.map(id => `<span class="mod"><b>${t(CONTRACT_MODS[id].nameKey)}</b><small>${t(CONTRACT_MODS[id].lineKey)}</small></span>`).join('');
      const bossHead = bossDef ? `<strong class="contract-name">${t(bossDef.nameKey)}</strong><span class="contract-boss-line">${t(bossDef.lineKey)}</span>` : '';
      const traitRow = contract.trait && TRAITS[contract.trait]
        ? `<span class="contract-trait"><b>${TRAITS[contract.trait].glyph} ${t(TRAITS[contract.trait].nameKey)}</b><small>${t(TRAITS[contract.trait].lineKey)}</small></span>`
        : '';
      const rewardLines = contract.final ? '' : `<span class="contract-rewards">
        <span class="reward-line gold">◆ ${t('contract.reward.picks', { count: Math.max(1, Number(contract.reward || 1)) })}</span>
        ${contract.elite ? '' : `<span class="reward-line cyan">♔ ${t('contract.reward.repair')}</span>`}
      </span>`;
      const type = t(contract.final ? 'aria.contract.final' : contract.elite ? 'aria.contract.elite' : 'aria.contract.normal');
      const modLines = contract.mods.map(id => t(CONTRACT_MODS[id].lineKey)).join(locale === 'en' ? '; ' : '、');
      return `<button class="contract-card ${contract.elite ? 'elite' : ''} ${contract.final ? 'final' : ''}" type="button" data-index="${index}" aria-label="${t('aria.contract', { type, mods: modLines })}">
        <span class="contract-top"><span class="contract-type ${contract.final ? 'final' : contract.elite ? 'elite' : ''}">${t(typeKey)}</span><span class="contract-crowns">${crowns}</span></span>
        ${bossHead}
        ${traitRow}
        <span class="board-preview">${contractPreviewCells(contract)}</span>
        <span class="contract-mods">${mods}</span>
        ${rewardLines}
      </button>`;
    }).join('');
    $$('.contract-card', grid).forEach(button => button.addEventListener('click', () => chooseContract(Number(button.dataset.index))));
  }

  function chooseContract(index) {
    if (!run || run.stage !== 'contract') return;
    const contract = run.pendingContracts?.[index];
    if (!contract) return;
    audio.sfx('ui');
    closeModal();
    run.battle += 1;
    run.currentContract = contract;
    run.pendingContracts = null;
    run.battleState = null;
    run.battleStart = null;
    run.battleStartMeta = null;
    run.promotionState = null;
    run.stage = 'battle';
    startRunBattle(false);
  }

  function calculateRunRank(score) {
    if (score >= 56000) return 'S';
    if (score >= 40000) return 'A';
    if (score >= 26000) return 'B';
    return 'C';
  }

  function finishRun() {
    if (!run) return;
    game.active = false;
    game.phase = 'result';
    run.score = game.score;
    run.captures = game.captures;
    run.maxCombo = Math.max(run.maxCombo, game.maxCombo);
    const rank = calculateRunRank(run.score);
    const previousBest = run.daily ? save.bestDaily : save.bestScore;
    const newBest = run.score > previousBest;
    if (run.daily) save.bestDaily = Math.max(save.bestDaily, Math.floor(run.score));
    save.bestScore = Math.max(save.bestScore, Math.floor(run.score));
    save.clears += 1;
    persistSave();
    clearActiveRun();
    audio.sfx('victory');
    $('#result-kicker').textContent = t(run.daily ? 'result.dailyClear' : 'result.runClear');
    $('#result-rank').textContent = rank;
    $('#result-title').textContent = t('result.cleared');
    $('#result-score').textContent = formatScore(run.score);
    $('#result-promotions').textContent = run.promotions;
    $('#result-captures').textContent = run.captures;
    $('#result-combo').textContent = run.maxCombo;
    $('#result-seed').textContent = t('result.seed', { seed: formatSeed(run.seed) });
    $('#result-newbest').classList.toggle('show', newBest);
    openModal(runResultModal);
  }

  function renderRunTrack() {
    const track = $('#run-track');
    if (game.mode === 'training') {
      track.innerHTML = '<i class="run-node training current"></i>';
      return;
    }
    if (!run) {
      track.innerHTML = '';
      return;
    }
    track.innerHTML = Array.from({ length: run.totalBattles }, (_, index) => {
      const number = index + 1;
      const classes = ['run-node'];
      if (number < run.battle) classes.push('done');
      if (number === run.battle) classes.push('current');
      if (number === run.totalBattles) classes.push('boss');
      return `<i class="${classes.join(' ')}"></i>`;
    }).join('');
  }

  function renderRoster() {
    const rail = $('#roster-rail');
    let members;
    if (run && game.mode === 'run') members = run.roster;
    else members = game.pieces.filter(piece => piece.color === 'w').map(piece => ({ uid: piece.uid, type: piece.type, origin: piece.origin }));
    rail.innerHTML = members.map(member => {
      const piece = game.pieces.find(item => item.uid === member.uid && item.color === 'w');
      const alive = piece ? piece.alive : true;
      const promoted = member.origin === 'p' && member.type !== 'p';
      return `<span class="roster-piece ${promoted ? 'promoted' : ''} ${alive ? '' : 'dead'}" data-mark="${promoted ? '▲' : ''}" title="${t('aria.rosterPiece', { piece: t(PIECE_NAMES[member.type]) })}">${PIECE_GLYPHS.w[member.type]}</span>`;
    }).join('');
  }

  function updateHUD(force = false) {
    if (!force && !hud.classList.contains('active')) return;
    renderRunTrack();
    renderRoster();
    $('#hud-score').textContent = formatScore(game.score);
    const turnsEl = $('#hud-turns');
    turnsEl.textContent = Math.max(0, game.turnsLeft);
    turnsEl.classList.toggle('low', game.active && game.turnsLeft <= 3);
    const traitId = activeTraitId();
    const traitChip = $('#trait-chip');
    if (traitId) {
      traitChip.hidden = false;
      traitChip.innerHTML = `<b>${TRAITS[traitId].glyph} ${t(TRAITS[traitId].nameKey)}</b><small>${t(TRAITS[traitId].lineKey)}</small>`;
      traitChip.title = t('hud.traitTitle');
    } else {
      traitChip.hidden = true;
    }
    $('#combo-readout').classList.toggle('show', game.combo > 0);
    const shield = getShield();
    const max = game.mode === 'run' ? maxShieldForRun() : 3;
    $('#hud-shield').textContent = `${'◆'.repeat(Math.max(0, shield))}${'◇'.repeat(Math.max(0, max - shield))}`;
    $('#boss-pips').innerHTML = Array.from({ length: game.enemyHPMax }, (_, index) => `<i class="${index < game.enemyHP ? 'on' : ''}"></i>`).join('');
    $('#combo-value').textContent = comboMultiplier().toFixed(1);
    const burstButton = $('#btn-burst');
    const ready = game.hype >= 100 && game.phase === 'player' && game.overdriveMoves === 0;
    burstButton.disabled = !ready;
    burstButton.classList.toggle('ready', ready);
    $('#hype-fill').style.width = `${game.hype}%`;
    $('#tempo-count').textContent = game.overdriveMoves + game.bonusActions;
    $('#intent-key').classList.toggle('show', Boolean(game.enemyIntent));
  }

  function offerFirstTutorial() {
    if (!save.tutorial.select) showTutorial('tutorial.select', 2400);
  }

  function showTutorial(key, duration = 1800, params) {
    if (!key) return;
    const element = $('#tutorial-chip');
    clearTimeout(tutorialTimer);
    currentTutorialMessage = { key, params };
    element.textContent = t(key, params);
    element.classList.add('show');
    tutorialTimer = window.setTimeout(() => {
      element.classList.remove('show');
      element.textContent = '';
      currentTutorialMessage = null;
    }, duration);
  }

  function showBanner(key, params) {
    const element = $('#turn-banner');
    clearTimeout(bannerTimer);
    currentBannerMessage = { key, params };
    element.textContent = t(key, params);
    element.classList.remove('show');
    void element.offsetWidth;
    element.classList.add('show');
    bannerTimer = window.setTimeout(() => {
      element.classList.remove('show');
      element.textContent = '';
      currentBannerMessage = null;
    }, 1080);
  }

  function getRecommendedMove() {
    const options = allMoves('w');
    if (!options.length) return null;
    const intentActor = game.enemyIntent ? game.pieces.find(piece => piece.id === game.enemyIntent.pieceId) : null;
    return options.map(option => {
      const target = option.move.captureId ? game.pieces.find(piece => piece.id === option.move.captureId) : null;
      let score = Math.random() * 20;
      if (target) score += target.type === 'k' ? 100000 : PIECE_VALUES[target.type] * 5;
      if (option.move.danger) score -= PIECE_VALUES[option.piece.type] * 0.75;
      if (option.piece.type === 'p') {
        score += (option.piece.y - option.move.y) * 180;
        if (option.move.y <= promotionRank()) score += 12000;
      }
      if (intentActor && target?.id === intentActor.id) score += 8500;
      if (game.enemyIntent && option.move.x === game.enemyIntent.x && option.move.y === game.enemyIntent.y && !target) score += 900;
      const crown = kingOf('b');
      if (crown) {
        const before = Math.abs(option.piece.x - crown.x) + Math.abs(option.piece.y - crown.y);
        const after = Math.abs(option.move.x - crown.x) + Math.abs(option.move.y - crown.y);
        score += (before - after) * 50;
        const threat = withTemporaryMove(option.piece, option.move, () => isSquareAttacked(crown.x, crown.y, 'w'));
        if (threat) score += 3200;
      }
      return { ...option, score };
    }).sort((a, b) => b.score - a.score)[0];
  }

  function triggerFlash(kind = 'normal') {
    if (!settings.flashes) return;
    flashEl.style.background = kind === 'hurt' ? '#ff315f' : kind === 'burst' ? '#8b6cff' : kind === 'crown' ? '#fff1a8' : '#ffffff';
    flashEl.classList.remove('fire');
    void flashEl.offsetWidth;
    flashEl.classList.add('fire');
  }

  function triggerHit(shake = 8, hitStop = 55) {
    if (settings.shake && !settings.reducedMotion) game.screenShake = Math.max(game.screenShake, shake);
    if (!settings.reducedMotion) game.hitStopUntil = Math.max(game.hitStopUntil, now() + hitStop);
    triggerFlash();
  }

  function tileCenter(x, y) {
    return {
      x: view.board.x + (x + 0.5) * view.board.tile,
      y: view.board.y + (y + 0.5) * view.board.tile
    };
  }

  function addImpact(x, y, kind = 'player', count = 20) {
    const adjustedCount = settings.reducedMotion ? Math.ceil(count * 0.28) : count;
    for (let i = 0; i < adjustedCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.3 + Math.random() * (kind === 'crown' ? 10.7 : 5.7);
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 350 + Math.random() * (kind === 'crown' ? 650 : 370),
        maxLife: kind === 'crown' ? 1000 : 720,
        size: 1.5 + Math.random() * (kind === 'crown' ? 6.5 : 3.5),
        kind,
        gravity: 0.01 + Math.random() * 0.07,
        rotation: Math.random() * Math.PI * 2
      });
    }
    if (kind === 'crown') {
      for (let i = 0; i < 5; i++) particles.push({ x, y, vx: 0, vy: 0, life: 550 + i * 100, maxLife: 1000, size: 20 + i * 18, kind: 'ring', rotation: 0 });
    }
  }

  function addFloatingText(x, y, text, kind = 'cyan') {
    floatingTexts.push({ x, y, text, kind, life: 1050, maxLife: 1050 });
  }

  function drawBackground(time) {
    ctx.clearRect(0, 0, view.width, view.height);
    const gradient = ctx.createRadialGradient(view.width * 0.5, view.height * 0.48, 20, view.width * 0.5, view.height * 0.48, Math.max(view.width, view.height) * 0.75);
    gradient.addColorStop(0, 'rgba(42, 21, 79, .16)');
    gradient.addColorStop(0.52, 'rgba(4, 4, 12, .02)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, .35)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, view.width, view.height);

    for (const star of ambient) {
      star.y += star.speed * 0.016;
      if (star.y > 1.1) { star.y = -0.1; star.x = Math.random(); }
      const px = star.x * view.width + Math.sin(time * 0.0002 + star.z * 10) * 18;
      const py = star.y * view.height;
      ctx.globalAlpha = 0.08 + star.z * 0.2;
      ctx.fillStyle = star.z > 0.65 ? '#55f6ff' : '#ff4fc8';
      ctx.fillRect(px, py, star.size, star.size * 4);
    }
    ctx.globalAlpha = 1;
    if (currentScreen === 'title') drawTitleOrbit(time);
  }

  function drawTitleOrbit(time) {
    const glyphs = ['♙', '♘', '♗', '♖', '♕', '♔'];
    const centerX = view.width * 0.78;
    const centerY = view.height * 0.46;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.max(24, Math.min(view.width, view.height) * 0.055)}px Georgia, serif`;
    glyphs.forEach((glyph, index) => {
      const angle = time * 0.00014 * (index % 2 ? -1 : 1) + index * Math.PI * 2 / glyphs.length;
      const radius = Math.min(view.width, view.height) * (0.17 + (index % 3) * 0.035);
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius * 0.6;
      ctx.globalAlpha = 0.06 + (Math.sin(angle) + 1) * 0.025;
      ctx.fillStyle = index % 2 ? '#55f6ff' : '#ff4fc8';
      ctx.fillText(glyph, x, y);
    });
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function render(time) {
    const rawDt = Math.min(40, time - game.lastFrame || 16.67);
    game.lastFrame = time;
    const frozen = time < game.hitStopUntil;
    const dt = game.paused || frozen ? 0 : rawDt;

    drawBackground(time);
    if (currentScreen === 'playing') {
      if (game.active && game.phase === 'player' && settings.hints && time - game.lastInputAt > 3200) {
        game.hintMove = getRecommendedMove();
        game.idleHintShown = Boolean(game.hintMove);
      } else if (time - game.lastInputAt < 900 || game.phase !== 'player') {
        game.hintMove = null;
      }
      updateSimulation(dt);
      drawGame(time);
      game.displayedScore = lerp(game.displayedScore, game.score, clamp(rawDt * 0.012, 0, 1));
      $('#hud-score').textContent = formatScore(game.displayedScore);
    }
    requestAnimationFrame(render);
  }

  function updateSimulation(dt) {
    if (game.screenShake > 0) game.screenShake = Math.max(0, game.screenShake - dt * 0.035);
    for (let i = particles.length - 1; i >= 0; i--) {
      const particle = particles[i];
      particle.life -= dt;
      if (particle.life <= 0) { particles.splice(i, 1); continue; }
      if (particle.kind !== 'ring') {
        particle.x += particle.vx * dt * 0.06;
        particle.y += particle.vy * dt * 0.06;
        particle.vy += (particle.gravity || 0.04) * dt * 0.045;
        particle.vx *= Math.pow(0.985, dt / 16.67);
      }
    }
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
      const text = floatingTexts[i];
      text.life -= dt;
      text.y -= dt * 0.035;
      if (text.life <= 0) floatingTexts.splice(i, 1);
    }
  }

  function drawGame(time) {
    const shake = settings.shake && !settings.reducedMotion ? game.screenShake : 0;
    const offsetX = shake ? (Math.random() * 2 - 1) * shake : 0;
    const offsetY = shake ? (Math.random() * 2 - 1) * shake : 0;
    ctx.save();
    ctx.translate(offsetX, offsetY);
    drawBoard(time);
    drawParticles();
    drawFloatingTexts();
    ctx.restore();
  }

  function drawBoard(time) {
    const board = view.board;
    const { x, y, size, tile } = board;
    const pulse = (Math.sin(time * 0.006) + 1) / 2;

    ctx.save();
    ctx.shadowColor = game.overdriveMoves > 0 ? 'rgba(255,215,105,.45)' : 'rgba(91,124,255,.34)';
    ctx.shadowBlur = game.overdriveMoves > 0 ? 44 : 30;
    ctx.fillStyle = 'rgba(5,3,10,.89)';
    roundRect(ctx, x - 10, y - 10, size + 20, size + 20, 10);
    ctx.fill();
    ctx.shadowBlur = 0;

    const frame = ctx.createLinearGradient(x, y, x + size, y + size);
    frame.addColorStop(0, '#55f6ff');
    frame.addColorStop(0.5, '#5b7cff');
    frame.addColorStop(1, '#ff4fc8');
    ctx.strokeStyle = frame;
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 3, y - 3, size + 6, size + 6);

    for (let by = 0; by < 8; by++) {
      for (let bx = 0; bx < 8; bx++) {
        const px = x + bx * tile;
        const py = y + by * tile;
        const light = (bx + by) % 2 === 0;
        ctx.fillStyle = light ? 'rgba(51,38,82,.92)' : 'rgba(16,13,31,.97)';
        ctx.fillRect(px, py, tile + .5, tile + .5);
        const edge = ctx.createLinearGradient(px, py, px + tile, py + tile);
        edge.addColorStop(0, 'rgba(255,255,255,.025)');
        edge.addColorStop(1, 'rgba(0,0,0,.10)');
        ctx.fillStyle = edge;
        ctx.fillRect(px, py, tile, tile);
      }
    }

    drawPromotionZone(time);
    if (game.overdriveMoves > 0) {
      const overdrive = ctx.createLinearGradient(x, y, x + size, y + size);
      overdrive.addColorStop(0, `rgba(84,246,255,${0.06 + pulse * 0.04})`);
      overdrive.addColorStop(0.5, 'rgba(123,105,255,.06)');
      overdrive.addColorStop(1, `rgba(255,79,200,${0.08 + pulse * 0.05})`);
      ctx.fillStyle = overdrive;
      ctx.fillRect(x, y, size, size);
    }

    drawHighlights(time);
    drawHint(time);
    drawEnemyIntent(time);

    const pieces = game.pieces.filter(piece => piece.alive || piece.anim).sort((a, b) => {
      if (a.anim && !b.anim) return 1;
      if (!a.anim && b.anim) return -1;
      return a.y - b.y;
    });
    pieces.forEach(piece => drawPiece(piece, time));
    ctx.restore();
  }

  function drawPromotionZone(time) {
    const { x, y, size, tile } = view.board;
    const rank = promotionRank();
    const rows = rank + 1;
    const pulse = (Math.sin(time * 0.009) + 1) / 2;
    const gradient = ctx.createLinearGradient(x, y, x, y + tile * rows);
    gradient.addColorStop(0, `rgba(255,215,105,${0.16 + pulse * .08})`);
    gradient.addColorStop(1, 'rgba(84,246,255,.015)');
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, size, tile * rows);
    ctx.strokeStyle = `rgba(255,215,105,${0.48 + pulse * .35})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y + tile * rows);
    ctx.lineTo(x + size, y + tile * rows);
    ctx.stroke();
    const arrowY = y + tile * rows - tile * .12;
    ctx.fillStyle = `rgba(255,215,105,${0.32 + pulse * .35})`;
    for (let file = 0; file < 8; file++) {
      const cx = x + (file + .5) * tile;
      ctx.beginPath();
      ctx.moveTo(cx, arrowY - tile * .12);
      ctx.lineTo(cx - tile * .08, arrowY);
      ctx.lineTo(cx + tile * .08, arrowY);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawHighlights(time) {
    const { x, y, tile } = view.board;
    const pulse = (Math.sin(time * 0.009) + 1) / 2;
    const selected = game.pieces.find(piece => piece.id === game.selectedId);
    if (selected) {
      ctx.fillStyle = `rgba(84,246,255,${0.08 + pulse * 0.08})`;
      ctx.fillRect(x + selected.x * tile, y + selected.y * tile, tile, tile);
      ctx.strokeStyle = '#55f6ff';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + selected.x * tile + 3, y + selected.y * tile + 3, tile - 6, tile - 6);
    }

    for (const move of game.legalMoves) {
      const cx = x + (move.x + .5) * tile;
      const cy = y + (move.y + .5) * tile;
      const target = move.captureId ? game.pieces.find(piece => piece.id === move.captureId) : null;
      if (target) {
        const radius = tile * (.28 + pulse * .04);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = target.type === 'k' ? `rgba(255,79,200,${.28 + pulse * .3})` : `rgba(255,215,105,${.22 + pulse * .22})`;
        ctx.strokeStyle = target.type === 'k' ? '#ff4fc8' : '#ffd769';
        ctx.lineWidth = target.type === 'k' ? 4 : 2;
        ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
        ctx.strokeRect(-radius, -radius, radius * 2, radius * 2);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(cx, cy, tile * (.12 + pulse * .025), 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(84,246,255,.56)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx, cy, tile * .22, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(84,246,255,.28)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      if (move.danger) {
        ctx.fillStyle = '#ff4668';
        ctx.beginPath();
        ctx.moveTo(x + (move.x + 1) * tile - 4, y + move.y * tile + 4);
        ctx.lineTo(x + (move.x + 1) * tile - tile * .24, y + move.y * tile + 4);
        ctx.lineTo(x + (move.x + 1) * tile - 4, y + move.y * tile + tile * .24);
        ctx.closePath();
        ctx.fill();
      }
    }

    if (game.phase === 'player' && !selected) {
      for (const piece of game.pieces) {
        if (!piece.alive || piece.color !== 'w' || getPseudoMoves(piece).length === 0) continue;
        const cx = x + (piece.x + .5) * tile;
        const cy = y + (piece.y + .5) * tile;
        ctx.beginPath();
        ctx.arc(cx, cy, tile * (.38 + pulse * .035), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(84,246,255,${.16 + pulse * .25})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }

  function drawHint(time) {
    if (!game.hintMove || game.phase !== 'player' || game.selectedId) return;
    const from = tileCenter(game.hintMove.piece.x, game.hintMove.piece.y);
    const to = tileCenter(game.hintMove.move.x, game.hintMove.move.y);
    const pulse = (Math.sin(time * .008) + 1) / 2;
    ctx.save();
    ctx.strokeStyle = `rgba(255,255,255,${.36 + pulse * .38})`;
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 8]);
    ctx.lineDashOffset = -time * .02;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.setLineDash([]);
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    ctx.translate(to.x, to.y);
    ctx.rotate(angle);
    ctx.fillStyle = 'rgba(255,255,255,.84)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-16, -8);
    ctx.lineTo(-16, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawEnemyIntent(time) {
    const intent = game.enemyIntent;
    if (!intent) return;
    const piece = game.pieces.find(item => item.id === intent.pieceId && item.alive);
    if (!piece) return;
    const from = tileCenter(piece.x, piece.y);
    const to = tileCenter(intent.x, intent.y);
    const pulse = (Math.sin(time * .012) + 1) / 2;
    ctx.save();
    ctx.strokeStyle = `rgba(255,70,104,${.56 + pulse * .34})`;
    ctx.lineWidth = 3 + pulse * 2;
    ctx.setLineDash([12, 7]);
    ctx.lineDashOffset = -time * .03;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.setLineDash([]);
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    ctx.translate(to.x, to.y);
    ctx.rotate(angle);
    ctx.fillStyle = '#ff4668';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-18, -9);
    ctx.lineTo(-18, 9);
    ctx.closePath();
    ctx.fill();
    ctx.rotate(-angle);
    ctx.beginPath();
    ctx.arc(0, 0, view.board.tile * (.22 + pulse * .08), 0, Math.PI * 2);
    ctx.strokeStyle = '#ff4668';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  function drawPiece(piece, time) {
    const tile = view.board.tile;
    let drawX = piece.x;
    let drawY = piece.y;
    let motion = 1;
    if (piece.anim) {
      const progress = clamp((time - piece.anim.start) / piece.anim.duration, 0, 1);
      const eased = easeOutCubic(progress);
      drawX = lerp(piece.anim.fromX, piece.anim.toX, eased);
      drawY = lerp(piece.anim.fromY, piece.anim.toY, eased);
      motion = 1 + Math.sin(progress * Math.PI) * .12;
    }
    const spawnProgress = clamp((time - piece.spawnAt) / (settings.reducedMotion ? 80 : 260), 0, 1);
    const spawnScale = easeOutCubic(spawnProgress);
    const center = tileCenter(drawX, drawY);
    const isWhite = piece.color === 'w';
    const isCrown = piece.type === 'k' && piece.color === 'b';
    const selected = game.selectedId === piece.id;
    const intentActor = game.enemyIntent?.pieceId === piece.id;
    const pulse = (Math.sin(time * .009 + Number(piece.id.replace(/\D/g, '') || 0)) + 1) / 2;
    const radius = tile * (isCrown ? .37 : .34);
    const glyphSize = tile * (isCrown ? .72 : .68);

    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.scale(spawnScale * motion, spawnScale * motion);

    ctx.globalAlpha = .28;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(tile * .04, tile * .29, radius * .92, radius * .35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    if (selected || intentActor || isCrown || (piece.type === 'p' && isWhite && piece.y <= promotionRank() + 1)) {
      const auraColor = selected
        ? '84,246,255'
        : intentActor
          ? '255,70,104'
          : isCrown
            ? '255,79,200'
            : '255,215,105';
      const auraRadius = radius * (1.24 + pulse * .16);
      const aura = ctx.createRadialGradient(0, 0, radius * .4, 0, 0, auraRadius);
      aura.addColorStop(0, `rgba(${auraColor},.18)`);
      aura.addColorStop(1, `rgba(${auraColor},0)`);
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(0, 0, auraRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    const tokenGradient = ctx.createRadialGradient(-radius * .28, -radius * .35, radius * .12, 0, 0, radius * 1.1);
    if (isWhite) {
      tokenGradient.addColorStop(0, '#313d62');
      tokenGradient.addColorStop(.52, '#12182b');
      tokenGradient.addColorStop(1, '#070813');
    } else {
      tokenGradient.addColorStop(0, '#452038');
      tokenGradient.addColorStop(.52, '#1a0b1d');
      tokenGradient.addColorStop(1, '#08050d');
    }
    ctx.fillStyle = tokenGradient;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = isWhite ? 'rgba(84,246,255,.72)' : isCrown ? 'rgba(255,79,200,.95)' : 'rgba(255,70,104,.68)';
    ctx.lineWidth = isCrown ? Math.max(3, tile * .045) : Math.max(1.5, tile * .025);
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();

    if (isCrown) {
      ctx.save();
      ctx.rotate(time * .00035);
      ctx.setLineDash([tile * .08, tile * .045]);
      ctx.lineDashOffset = -time * .018;
      ctx.strokeStyle = `rgba(255,215,105,${.55 + pulse * .35})`;
      ctx.lineWidth = Math.max(2, tile * .035);
      ctx.beginPath();
      ctx.arc(0, 0, radius * 1.23, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (isCrown && game.crownVeil > 0) {
      ctx.strokeStyle = `rgba(240,250,255,${.6 + pulse * .3})`;
      ctx.lineWidth = Math.max(2, tile * .04);
      ctx.setLineDash([tile * .13, tile * .07]);
      ctx.beginPath();
      ctx.arc(0, 0, radius * 1.42, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    drawPieceGlyph(piece, glyphSize, isWhite, isCrown);

    if (piece.type === 'p') {
      const dir = piece.color === 'w' ? -1 : 1;
      const chevronY = dir < 0 ? -radius * .78 : radius * .78;
      ctx.fillStyle = isWhite ? `rgba(255,215,105,${.38 + pulse * .48})` : `rgba(255,70,104,${.35 + pulse * .42})`;
      ctx.beginPath();
      if (dir < 0) {
        ctx.moveTo(0, chevronY - tile * .075);
        ctx.lineTo(-tile * .075, chevronY + tile * .025);
        ctx.lineTo(tile * .075, chevronY + tile * .025);
      } else {
        ctx.moveTo(0, chevronY + tile * .075);
        ctx.lineTo(-tile * .075, chevronY - tile * .025);
        ctx.lineTo(tile * .075, chevronY - tile * .025);
      }
      ctx.closePath();
      ctx.fill();
    }

    if (isCrown && game.enemyHPMax > 1) {
      const gap = tile * .13;
      const pipW = tile * .095;
      const total = game.enemyHPMax * pipW + (game.enemyHPMax - 1) * (gap - pipW);
      let start = -total / 2;
      for (let i = 0; i < game.enemyHPMax; i++) {
        ctx.fillStyle = i < game.enemyHP ? '#ffd769' : 'rgba(255,255,255,.16)';
        ctx.fillRect(start + i * gap, radius * .78, pipW, Math.max(2, tile * .035));
      }
    }

    ctx.restore();
  }

  function drawPieceGlyph(piece, size, isWhite, isCrown) {
    const glyph = PIECE_GLYPHS[piece.color][piece.type];
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.max(22, size)}px Georgia, "Times New Roman", serif`;
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(1.5, size * .035);
    ctx.strokeStyle = isWhite ? 'rgba(4,6,14,.95)' : 'rgba(255,214,240,.24)';
    ctx.fillStyle = isWhite ? '#f8fbff' : isCrown ? '#ff7ed7' : '#ff5579';
    ctx.shadowColor = isWhite ? 'rgba(84,246,255,.62)' : isCrown ? 'rgba(255,79,200,.82)' : 'rgba(255,70,104,.58)';
    ctx.shadowBlur = isCrown ? size * .24 : size * .13;
    ctx.strokeText(glyph, 0, size * .035);
    ctx.fillText(glyph, 0, size * .035);
    ctx.restore();
  }

  function drawParticles() {
    const colors = {
      player: '#55f6ff',
      enemy: '#ff4668',
      crown: '#ffd769',
      hurt: '#ff315f',
      promotion: '#fff0a0',
      ring: '#ffd769'
    };
    for (const particle of particles) {
      const ratio = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = Math.min(1, ratio * 1.8);
      ctx.strokeStyle = colors[particle.kind] || '#fff';
      ctx.fillStyle = colors[particle.kind] || '#fff';
      if (particle.kind === 'ring') {
        ctx.lineWidth = Math.max(1, particle.size * .09);
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size * (1 + (1 - ratio) * 2.8), 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.translate(particle.x, particle.y);
        ctx.rotate(particle.rotation + (1 - ratio) * 4);
        const length = particle.size * (1.2 + Math.hypot(particle.vx, particle.vy) * .16);
        ctx.fillRect(-length * .5, -particle.size * .35, length, particle.size * .7);
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function drawFloatingTexts() {
    for (const item of floatingTexts) {
      const ratio = clamp(item.life / item.maxLife, 0, 1);
      const enter = clamp((1 - ratio) * 5, 0, 1);
      const alpha = Math.min(1, ratio * 2.8);
      ctx.save();
      ctx.translate(item.x, item.y);
      ctx.scale(.72 + easeOutCubic(enter) * .28, .72 + easeOutCubic(enter) * .28);
      ctx.globalAlpha = alpha;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `900 ${Math.max(18, view.board.tile * .34)}px ui-sans-serif, system-ui, sans-serif`;
      ctx.lineWidth = Math.max(3, view.board.tile * .045);
      ctx.strokeStyle = 'rgba(3,3,10,.94)';
      ctx.fillStyle = item.kind === 'gold' ? '#ffd769' : item.kind === 'red' ? '#ff4668' : '#55f6ff';
      ctx.strokeText(item.text, 0, 0);
      ctx.fillText(item.text, 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function roundRect(context, x, y, width, height, radius) {
    const r = Math.min(Math.max(0, radius), Math.abs(width) / 2, Math.abs(height) / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + width, y, x + width, y + height, r);
    context.arcTo(x + width, y + height, x, y + height, r);
    context.arcTo(x, y + height, x, y, r);
    context.arcTo(x, y, x + width, y, r);
    context.closePath();
  }

  function closeInfoModal() {
    if (game.paused) openModal(pauseModal);
    else closeModal();
  }

  function applyStaticTranslations() {
    $$('[data-i18n]').forEach(element => {
      const value = t(element.dataset.i18n);
      if (element.tagName === 'META') element.setAttribute('content', value);
      else element.textContent = value;
    });
    $$('[data-i18n-aria]').forEach(element => element.setAttribute('aria-label', t(element.dataset.i18nAria)));
    $$('[data-i18n-title]').forEach(element => element.setAttribute('title', t(element.dataset.i18nTitle)));
  }

  function applyLocale() {
    locale = I18N.resolveLocale(localePreference);
    document.documentElement.lang = locale;
    const manifestPaths = {
      en: './manifest.webmanifest',
      'zh-CN': './manifest.zh-CN.webmanifest',
      ja: './manifest.ja.webmanifest'
    };
    const manifest = $('#app-manifest');
    if (manifest) manifest.setAttribute('href', manifestPaths[locale]);
    applyStaticTranslations();
    $('#title-language').value = localePreference;
    updateHUD(true);

    if (promotionModal.classList.contains('active')) renderPromotionChoices();
    if (rewardModal.classList.contains('active') && Array.isArray(run?.pendingRewards)) renderRewardDraft(run.pendingRewards);
    if (contractModal.classList.contains('active') && Array.isArray(run?.pendingContracts)) renderContractChoices(run.pendingContracts);
    if (runResultModal.classList.contains('active') && run) {
      $('#result-kicker').textContent = t(run.daily ? 'result.dailyClear' : 'result.runClear');
      $('#result-title').textContent = t('result.cleared');
      $('#result-seed').textContent = t('result.seed', { seed: formatSeed(run.seed) });
    }
    if (failModal.classList.contains('active') && game.failureReason) $('#fail-reason').textContent = t(`failure.${game.failureReason}`);
    if (infoModal.classList.contains('active') && currentInfoKind) {
      renderInfo(currentInfoKind);
      if (currentInfoKind === 'settings') bindSettingsControls();
    }
    if (currentTutorialMessage) $('#tutorial-chip').textContent = t(currentTutorialMessage.key, currentTutorialMessage.params);
    if (currentBannerMessage) $('#turn-banner').textContent = t(currentBannerMessage.key, currentBannerMessage.params);
  }

  function setLanguagePreference(preference) {
    I18N.assertPreference(preference);
    settings.languagePreference = preference;
    localePreference = preference;
    persistSettings();
    applyLocale();
  }

  function bindEvents() {
    window.addEventListener('resize', resize, { passive: true });
    canvas.addEventListener('pointerdown', event => {
      audio.start();
      handleBoardPointer(event.clientX, event.clientY);
    });

    $('#btn-continue').addEventListener('click', () => { audio.sfx('ui'); resumeSavedRun(); });
    $('#btn-new').addEventListener('click', () => { audio.sfx('ui'); clearActiveRun(); startNewRun(); });
    $('#btn-daily').addEventListener('click', () => { audio.sfx('ui'); clearActiveRun(); startNewRun(dailySeed(), true); });
    $('#btn-training').addEventListener('click', () => { audio.sfx('ui'); startTraining(); });
    $('#btn-records').addEventListener('click', () => showInfo('records'));
    $('#btn-rules').addEventListener('click', () => showInfo('rules'));
    $('#btn-settings').addEventListener('click', () => showInfo('settings'));
    $('#title-language').addEventListener('change', event => setLanguagePreference(event.target.value));

    $('#btn-pause').addEventListener('click', pauseGame);
    $('#btn-resume').addEventListener('click', resumeGame);
    $('#btn-restart').addEventListener('click', () => { audio.sfx('ui'); closeModal(); restoreBattleStart(); });
    $('#btn-pause-settings').addEventListener('click', () => showInfo('settings'));
    $('#btn-quit').addEventListener('click', quitToTitle);
    $('#btn-info-close').addEventListener('click', closeInfoModal);
    $('#btn-burst').addEventListener('click', activateOverdrive);

    $('#btn-fail-retry').addEventListener('click', () => { audio.sfx('ui'); closeModal(); restoreBattleStart(); });
    $('#btn-fail-new').addEventListener('click', () => { audio.sfx('ui'); clearActiveRun(); startNewRun(); });
    $('#btn-fail-menu').addEventListener('click', quitToTitle);

    $('#btn-result-new').addEventListener('click', () => { audio.sfx('ui'); clearActiveRun(); startNewRun(); });
    $('#btn-result-menu').addEventListener('click', () => { clearActiveRun(); quitToTitle(); });

    $('#btn-training-again').addEventListener('click', () => { audio.sfx('ui'); startTraining(); });
    $('#btn-training-run').addEventListener('click', () => { audio.sfx('ui'); clearActiveRun(); startNewRun(); });
    $('#btn-training-menu').addEventListener('click', quitToTitle);

    window.addEventListener('keydown', event => {
      const key = event.key.toLowerCase();
      if (key === ' ' || event.code === 'Space') {
        if (currentScreen === 'playing') {
          event.preventDefault();
          activateOverdrive();
        }
      } else if (key === 'h') {
        if (game.active && game.phase === 'player' && !game.paused) {
          game.hintMove = getRecommendedMove();
          game.lastInputAt = now() - 4000;
          if (game.hintMove) audio.sfx('select');
        }
      } else if (key === 'escape') {
        if (infoModal.classList.contains('active')) {
          closeInfoModal();
        } else if (promotionModal.classList.contains('active') || rewardModal.classList.contains('active') || contractModal.classList.contains('active') || runResultModal.classList.contains('active') || failModal.classList.contains('active') || trainingResultModal.classList.contains('active')) {
          return;
        } else if (currentScreen === 'playing') {
          pauseGame();
        }
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (run && game.mode === 'run' && game.active) persistRun('battle');
        if (game.active && !game.paused && !['promotion', 'reward', 'contract'].includes(game.phase)) pauseGame();
      }
    });

    window.addEventListener('pagehide', () => {
      if (run && game.mode === 'run' && game.active) persistRun('battle');
    });
  }

  function installTestHooks() {
    window.__CB_TEST__ = {
      version: VERSION,
      state: () => ({
        screen: currentScreen,
        active: game.active,
        paused: game.paused,
        mode: game.mode,
        phase: game.phase,
        locale,
        languagePreference: localePreference,
        turnsLeft: game.turnsLeft,
        enemyHP: game.enemyHP,
        enemyHPMax: game.enemyHPMax,
        score: game.score,
        combo: game.combo,
        hype: game.hype,
        overdriveMoves: game.overdriveMoves,
        bonusActions: game.bonusActions,
        shield: getShield(),
        crownVeil: Number(game.crownVeil || 0),
        enemyTurns: Number(game.enemyTurns || 0),
        trait: activeTraitId(),
        pieces: deepClone(game.pieces),
        intent: deepClone(game.enemyIntent),
        run: run ? deepClone(run) : null
      }),
      locale: () => locale,
      preference: () => localePreference,
      startRun: (seed = 123456) => { clearActiveRun(); startNewRun(Number(seed) || 1, false); },
      startDaily: () => { clearActiveRun(); startNewRun(dailySeed(), true); },
      startTraining,
      setLanguage: setLanguagePreference,
      moves: (uid = null) => {
        const piece = uid ? game.pieces.find(item => item.uid === uid || item.id === uid) : null;
        const list = piece ? getLegalMoves(piece).map(move => ({ pieceId: piece.id, ...move })) : allMoves('w').map(item => ({ pieceId: item.piece.id, uid: item.piece.uid, ...item.move }));
        return deepClone(list);
      },
      play: (pieceRef, x, y) => {
        const piece = game.pieces.find(item => item.id === pieceRef || item.uid === pieceRef);
        if (!piece) return false;
        const move = getLegalMoves(piece).find(item => item.x === Number(x) && item.y === Number(y));
        if (!move || game.phase !== 'player') return false;
        performPlayerMove(piece, move);
        return true;
      },
      promote: choosePromotion,
      overdrive: () => { game.hype = 100; activateOverdrive(); },
      recommend: () => {
        const pick = getRecommendedMove();
        return pick ? { pieceId: pick.piece.id, uid: pick.piece.uid, ...deepClone(pick.move) } : null;
      },
      fast: value => { settings.reducedMotion = value !== false; },
      openPromotion: (pieceRef = 'pawn-a', after = 'move') => {
        const piece = game.pieces.find(item => item.id === pieceRef || item.uid === pieceRef);
        if (!piece || piece.color !== 'w' || piece.type !== 'p' || !game.active) return false;
        requestPromotion(piece, after === 'crown' ? () => {
          const crown = game.pieces.find(item => item.color === 'b' && item.type === 'k');
          if (crown) continueEnemyCrownHit(piece, crown);
        } : completePlayerMove, after);
        return true;
      },
      retry: restoreBattleStart,
      forceFail: (reason = 'qa') => failBattle(reason),
      applyRelic: id => { if (run && RELIC_BY_ID[id]) applyRelic(id); },
      setTrait: id => {
        if (!run || !run.currentContract || (id !== null && !TRAITS[id])) return false;
        run.currentContract.trait = id;
        updateHUD(true);
        return true;
      },
      selectReward: chooseReward,
      selectContract: chooseContract,
      forceCrownBreak: () => {
        const crown = kingOf('b');
        const attacker = game.pieces.find(piece => piece.alive && piece.color === 'w' && piece.type !== 'k');
        if (!crown || !attacker || !game.active || game.phase !== 'player') return false;
        attacker.x = crown.x;
        attacker.y = crown.y;
        crown.alive = false;
        handleEnemyCrownHit(attacker, crown);
        return true;
      },
      finishBattle: () => {
        if (!run || !game.active) return false;
        game.enemyHP = 1;
        return window.__CB_TEST__.forceCrownBreak();
      },
      resetStorage: () => {
        [SAVE_KEY, RUN_KEY, SETTINGS_KEY].forEach(key => localStorage.removeItem(key));
        location.reload();
      }
    };
  }

  function init() {
    resize();
    applyLocale();
    bindEvents();
    const qaMode = globalThis.__CB_ENABLE_QA__ === true || new URLSearchParams(location.search).has('qa');
    if (qaMode) installTestHooks();
    updateContinueButton();
    renderPromotionChoices();
    setScreen('title');
    requestAnimationFrame(render);
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }

  init();
})();
