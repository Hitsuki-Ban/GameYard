import { bindInput } from "./input.js";

export function createKamifudaSimulation({
  targetWindow,
  document,
  renderer,
  uiProjection,
  runtime,
  storage,
  audioEngine,
  haptics,
  host,
  context,
  i18n,
}) {
  const window = targetWindow;
  const navigator = targetWindow.navigator;
  const performance = targetWindow.performance;
  const canvas = renderer.canvas;
  const ctx = renderer.context;
  const UI = uiProjection.elements;
  let hostSettings = context.settings;
  let pendingHostSetting = null;
  let settingsStatusKey = null;
  let canvasStatus = { kind: "title", data: {} };
  let disposed = false;
  const t = (key, params) => i18n.t(key, params);

  const TAU = Math.PI * 2;
  const FIXED_DT = 1 / 60;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const expLerp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
  const sqr = (v) => v * v;
  const wrap = (v, m) => ((v % m) + m) % m;
  const dist2 = (ax, ay, bx, by) => sqr(ax - bx) + sqr(ay - by);
  const pretty = (n) => i18n.number(Math.floor(n || 0));
  const mix32 = (value) => {
    let x = value >>> 0;
    x ^= x >>> 16;
    x = Math.imul(x, 0x7feb352d);
    x ^= x >>> 15;
    x = Math.imul(x, 0x846ca68b);
    x ^= x >>> 16;
    return x >>> 0;
  };
  const randSeed = () => {
    let seed = (Date.now() ^ Math.floor(targetWindow.performance.now() * 1000)) >>> 0;
    try {
      if (globalThis.crypto?.getRandomValues) {
        const value = new Uint32Array(1);
        globalThis.crypto.getRandomValues(value);
        seed ^= value[0];
      }
    } catch {
      /* deterministic fallback below */
    }
    return mix32(seed) || 1;
  };

  class RNG {
    constructor(seed = 1) {
      this.s = mix32(seed >>> 0) || 1;
    }
    next() {
      let x = this.s;
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      this.s = x >>> 0;
      return this.s / 4294967296;
    }
    range(a, b) {
      return a + (b - a) * this.next();
    }
    int(a, b) {
      return Math.floor(this.range(a, b + 1));
    }
    pick(arr) {
      return arr[Math.floor(this.next() * arr.length) % arr.length];
    }
    chance(p) {
      return this.next() < p;
    }
    sign() {
      return this.chance(0.5) ? -1 : 1;
    }
    shuffle(arr) {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = this.int(0, i);
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    }
  }

  const COLORS = {
    ink: "#211b17",
    ink2: "#625447",
    paper: "#e9dfc8",
    paperHi: "#f8f0dc",
    paperDeep: "#d4bd8e",
    red: "#b33a2f",
    redDark: "#77271f",
    indigo: "#294d68",
    indigo2: "#17334a",
    ochre: "#c18a2f",
    ochreDark: "#79531c",
    green: "#526a51",
    greenDark: "#304231",
    violet: "#74536f",
    violetDark: "#412d3f",
    white: "#fff8e8",
    black: "#171310",
    shadow: "rgba(33,27,23,.28)",
    danger: "#8d261f",
    cyan: "#4f7e8c",
  };

  const SKINS = [
    {
      id: "washi",
      nameKey: "skin.washi",
      cost: 0,
      paper: "#e9dfc8",
      paperHi: "#f8f0dc",
      deep: "#d4bd8e",
      accent: "#b33a2f",
    },
    {
      id: "indigo",
      nameKey: "skin.indigo",
      cost: 3,
      paper: "#dbe1db",
      paperHi: "#f1f3e9",
      deep: "#aebcb6",
      accent: "#294d68",
    },
    {
      id: "sakura",
      nameKey: "skin.sakura",
      cost: 8,
      paper: "#ead9d4",
      paperHi: "#f8ece5",
      deep: "#cbaaa1",
      accent: "#a84b53",
    },
    {
      id: "night",
      nameKey: "skin.night",
      cost: 15,
      paper: "#c9bea4",
      paperHi: "#eee0bd",
      deep: "#92856c",
      accent: "#6b2a2a",
    },
    {
      id: "moss",
      nameKey: "skin.moss",
      cost: 24,
      paper: "#d9ddc9",
      paperHi: "#f0f1df",
      deep: "#afb692",
      accent: "#526a51",
    },
    {
      id: "gold",
      nameKey: "skin.gold",
      cost: 36,
      paper: "#e6d4a7",
      paperHi: "#fff0c6",
      deep: "#c29b52",
      accent: "#9d542b",
    },
    {
      id: "ember",
      nameKey: "skin.ember",
      cost: 0,
      hardOnly: true,
      paper: "#d8c9ad",
      paperHi: "#f4e2c6",
      deep: "#9f8265",
      accent: "#8f2c24",
    },
  ];

  const MODE_RULES = {
    normal: {
      id: "normal",
      labelKey: "mode.normal",
      startCount: 18,
      startShield: 2,
      maxShield: 6,
      gateDuration: 3.82,
      prepGateDuration: 3.12,
      gateDecay: 18,
      gateScale: 1,
      enemyHp: 1,
      enemySpeed: 1,
      enemyDamage: 1,
      momentum: 1,
      concurrency: 18,
      emptyPace: 2.45,
      crowdedPace: 0.28,
      autoStamp: true,
      bossHp: 1,
      bossSpeed: 1,
      sealScale: 1,
    },
    hard: {
      id: "hard",
      labelKey: "mode.hard",
      startCount: 16,
      startShield: 1,
      maxShield: 4,
      gateDuration: 3.65,
      prepGateDuration: 3.22,
      gateDecay: 31,
      gateScale: 1.0,
      enemyHp: 1.12,
      enemySpeed: 1.08,
      enemyDamage: 1.12,
      momentum: 0.9,
      concurrency: 25,
      emptyPace: 2.75,
      crowdedPace: 0.46,
      autoStamp: false,
      bossHp: 1.18,
      bossSpeed: 1.14,
      sealScale: 1.5,
    },
  };

  function modeRules() {
    return MODE_RULES[state.difficulty] || MODE_RULES.normal;
  }

  const FORM = {
    fan: {
      id: "fan",
      icon: "扇", // i18n-allow-ornament: formation crest
      nameKey: "form.fan",
      color: "#b66d3d",
      role: "swarm",
      cadence: 0.27,
      countScale: 0.42,
      minShots: 5,
      maxShots: 20,
      spread: 0.62,
      damage: 0.82,
      speed: 650,
      pierce: 0,
      gate: 0.95,
    },
    spear: {
      id: "spear",
      icon: "槍", // i18n-allow-ornament: formation crest
      nameKey: "form.spear",
      color: "#96392d",
      role: "armor",
      cadence: 0.31,
      countScale: 0.23,
      minShots: 3,
      maxShots: 11,
      spread: 0.11,
      damage: 1.52,
      speed: 800,
      pierce: 2,
      gate: 1.02,
    },
    spiral: {
      id: "spiral",
      icon: "環", // i18n-allow-ornament: formation crest
      nameKey: "form.spiral",
      color: "#526a51",
      role: "projectile",
      cadence: 0.29,
      countScale: 0.31,
      minShots: 4,
      maxShots: 14,
      spread: 0.34,
      damage: 0.93,
      speed: 700,
      pierce: 1,
      gate: 0.94,
    },
    drum: {
      id: "drum",
      icon: "鼓", // i18n-allow-ornament: formation crest
      nameKey: "form.drum",
      color: "#bd8430",
      role: "shield",
      cadence: 0.43,
      countScale: 0.3,
      minShots: 4,
      maxShots: 14,
      spread: 0.25,
      damage: 1.22,
      speed: 610,
      pierce: 0,
      gate: 1.22,
      splash: 42,
    },
  };

  const GATE_STYLE = {
    count: { color: COLORS.indigo, dark: COLORS.indigo2 },
    power: { color: COLORS.red, dark: COLORS.redDark },
    tempo: { color: COLORS.ochre, dark: COLORS.ochreDark },
    shield: { color: COLORS.green, dark: COLORS.greenDark },
    form: { color: COLORS.violet, dark: COLORS.violetDark },
    recovery: { color: "#6b837d", dark: "#344943" },
    risk: { color: "#31231f", dark: "#140f0d" },
  };

  const ENEMY_STYLE = {
    chaff: { ink: "#853a31", dark: "#3e201b", accent: "#d0a767" },
    armor: { ink: "#514641", dark: "#241d1b", accent: "#a39b88" },
    fast: { ink: "#a65d2c", dark: "#4e2a16", accent: "#ecc67e" },
    shield: { ink: "#4f6765", dark: "#273635", accent: "#a8c3b6" },
    splitter: { ink: "#80465f", dark: "#3c2231", accent: "#d3a1b7" },
    thrower: { ink: "#63537b", dark: "#2e2740", accent: "#b8a9d2" },
    charger: { ink: "#9b4c28", dark: "#4a2417", accent: "#efc16e" },
    drummer: { ink: "#4b5569", dark: "#202735", accent: "#d6a23b" },
    boss: { ink: "#7a2925", dark: "#1d1513", accent: "#d19b4e" },
  };

  const emptyModeRecord = () => ({
    best: 0,
    clears: 0,
    runs: 0,
    bestGrade: "none",
    bestAct: 0,
    bestTime: 0,
  });
  const PROFILE_DEFAULT = {
    version: 1,
    records: { normal: emptyModeRecord(), hard: emptyModeRecord(), totalSeals: 0 },
    settings: {
      haptic: true,
      quality: "auto",
      skin: "washi",
    },
    unlocks: { skins: ["washi"], hard: false },
    tutorial: { seen: false },
  };

  function cloneDefaultProfile() {
    return JSON.parse(JSON.stringify(PROFILE_DEFAULT));
  }

  function loadProfile() {
    const profile = storage.load(cloneDefaultProfile);
    if (profile.records.normal.clears > 0) profile.unlocks.hard = true;
    return profile;
  }

  function saveProfile() {
    storage.save(state.profile);
  }

  function applySkin(id) {
    const skin = SKINS.find((s) => s.id === id) || SKINS[0];
    state.profile.settings.skin = skin.id;
    document.documentElement.style.setProperty("--paper", skin.paper);
    document.documentElement.style.setProperty("--paper-hi", skin.paperHi);
    document.documentElement.style.setProperty("--paper-deep", skin.deep);
    document.documentElement.style.setProperty("--red", skin.accent);
    document.documentElement.style.setProperty("--red-dark", shadeHex(skin.accent, -0.28));
    saveProfile();
  }

  function shadeHex(hex, factor) {
    const n = parseInt(hex.slice(1), 16);
    const r = clamp(((n >> 16) & 255) * (1 + factor), 0, 255) | 0;
    const g = clamp(((n >> 8) & 255) * (1 + factor), 0, 255) | 0;
    const b = clamp((n & 255) * (1 + factor), 0, 255) | 0;
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  }

  const state = {
    mode: "title",
    resumeMode: "playing",
    generation: 0,
    viewW: 1,
    viewH: 1,
    dpr: 1,
    layout: null,
    accumulator: 0,
    lastTime: 0,
    simTime: 0,
    runTime: 0,
    renderTime: 0,
    scroll: 0,
    gameplayRng: new RNG(1),
    spawnRng: new RNG(2),
    fxRng: new RNG(3),
    seed: 1,
    profile: loadProfile(),
    player: null,
    difficulty: "normal",
    act: 1,
    maxActs: 3,
    encounters: [],
    encounterIndex: 0,
    currentEncounter: null,
    bossPrepared: false,
    phase: "idle",
    phaseTimer: 0,
    phaseDuration: 1,
    gates: [],
    enemies: [],
    bullets: [],
    enemyShots: [],
    hazards: [],
    particles: [],
    texts: [],
    scenery: [],
    boss: null,
    focusGateId: null,
    score: 0,
    sealsEarned: 0,
    combo: 0,
    comboTimer: 0,
    shake: 0,
    flash: 0,
    hitStop: 0,
    speedScale: 1,
    result: null,
    transition: null,
    musicTimer: 0,
    musicBeat: 0,
    quality: { level: "high", fps: 60, budget: 1 },
    stats: {
      kills: 0,
      hits: 0,
      nearMisses: 0,
      perfectGates: 0,
      missedGates: 0,
      wavesNoHit: 0,
      stampUses: 0,
      bossTimes: [],
      gateHistory: [],
      damageLost: 0,
      deathCause: null,
      actReached: 1,
    },
  };

  const input = {
    pointerId: null,
    pointerType: "",
    active: false,
    nx: 0.5,
    targetNx: 0.5,
    left: false,
    right: false,
    stampPressed: false,
  };

  function reducedMotion() {
    return hostSettings.motion.reduced;
  }

  function resetInput() {
    input.pointerId = null;
    input.pointerType = "";
    input.active = false;
    input.nx = 0.5;
    input.targetNx = 0.5;
    input.left = false;
    input.right = false;
    input.stampPressed = false;
  }

  function safeInsets() {
    return uiProjection.safeInsets();
  }

  function buildLayout() {
    const w = state.viewW,
      h = state.viewH;
    const safe = safeInsets();
    const portrait = h > w;
    const short = h < 520;
    const usableW = Math.max(280, w - safe.left - safe.right);
    const trackWidth = Math.min(
      800,
      Math.max(Math.min(300, usableW), usableW * (portrait ? 0.92 : 0.6)),
    );
    const left = safe.left + (usableW - trackWidth) * 0.5;
    const hudH = safe.top + (w < 620 ? 78 : 64);
    const top = hudH + 10;
    const playerY = h - safe.bottom - h * (short ? 0.22 : portrait ? 0.2 : 0.21);
    return {
      w,
      h,
      portrait,
      short,
      safe,
      track: {
        left,
        right: left + trackWidth,
        width: trackWidth,
        center: left + trackWidth * 0.5,
        top,
        bottom: h + 120,
      },
      playerY,
      hudH,
      gateW: clamp(trackWidth * 0.28, 86, 178),
      gateH: clamp(h * 0.135, 76, 108),
      unit: Math.min(w, h) / 700,
    };
  }

  function nxToX(nx) {
    const tr = state.layout.track;
    return tr.left + tr.width * clamp(nx, 0, 1);
  }

  function xToNx(x) {
    const tr = state.layout.track;
    return clamp((x - tr.left) / tr.width, 0, 1);
  }

  function resize() {
    const oldH = state.viewH || 1;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(
      state.profile.settings.quality === "low" ? 1.25 : 2,
      window.devicePixelRatio || 1,
    );
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    state.viewW = rect.width;
    state.viewH = rect.height;
    state.dpr = dpr;
    state.layout = buildLayout();
    const sy = oldH > 1 ? rect.height / oldH : 1;
    if (Math.abs(sy - 1) > 0.001) {
      for (const list of [
        state.enemies,
        state.bullets,
        state.enemyShots,
        state.hazards,
        state.particles,
        state.texts,
      ]) {
        for (const item of list) if (Number.isFinite(item.y)) item.y *= sy;
      }
    }
    if (state.player) {
      state.player.x = nxToX(state.player.nx);
      state.player.targetX = nxToX(state.player.targetNx);
      state.player.y = state.layout.playerY;
    }
    for (const e of state.enemies) e.x = nxToX(e.nx);
    for (const g of state.gates) g.x = nxToX(g.nx);
    for (const h of state.hazards) {
      if (typeof h.nx === "number") h.x = nxToX(h.nx);
    }
    for (const s of state.enemyShots) if (typeof s.nx === "number") s.x = nxToX(s.nx);
  }

  function showOverlay(name) {
    const gameplayVisible = ["playing", "boss", "transition"].includes(state.mode);
    uiProjection.showOverlay(name, gameplayVisible);
  }

  let toastTimer = 0;
  function toast(text) {
    uiProjection.showToast(text);
    toastTimer = 2.2;
  }

  function haptic(pattern) {
    haptics.play(pattern);
  }

  function sfx(name, volume = 1, pitch = 1) {
    audioEngine.play(name, volume, pitch, "sfx");
  }

  function musicTick(dt) {
    if (!["playing", "boss"].includes(state.mode)) return;
    state.musicTimer -= dt;
    const interval = state.mode === "boss" ? 0.42 : state.phase === "combat" ? 0.52 : 0.66;
    if (state.musicTimer > 0) return;
    state.musicTimer += interval;
    state.musicBeat = (state.musicBeat + 1) % 8;
    if (state.musicBeat % 4 === 0)
      audioEngine.play("drum", 0.1, state.act === 3 ? 1.12 : 1, "music");
    else if (state.musicBeat % 2 === 0) audioEngine.play("click", 0.055, 1.45, "music");
  }

  const ACT_DATA = {
    1: {
      nameKey: "act.1.name",
      subtitleKey: "act.1.subtitle",
      boss: "cart",
      sky: "#c8b77f",
      road: "#eadcb8",
      side: "#aa8c54",
      encounters: {
        normal: [
          {
            id: "paper_tide",
            kind: "swarm",
            nameKey: "encounter.paper_tide",
            stageKey: "stage.opening",
            strength: 1.0,
            variants: 2,
            gates: ["form:fan", "count"],
            preview: [
              { kind: "chaff", nx: 0.18 },
              { kind: "chaff", nx: 0.34 },
              { kind: "chaff", nx: 0.5 },
              { kind: "chaff", nx: 0.66 },
              { kind: "chaff", nx: 0.82 },
            ],
          },
          {
            id: "cross_rush",
            kind: "rush",
            nameKey: "encounter.cross_rush",
            stageKey: "stage.middle",
            strength: 1.04,
            variants: 2,
            gates: ["tempo", "shield"],
            preview: [
              { kind: "charger", nx: 0.26 },
              { kind: "fast", nx: 0.5 },
              { kind: "charger", nx: 0.74 },
            ],
          },
          {
            id: "iron_escort",
            kind: "armor",
            nameKey: "encounter.iron_escort",
            stageKey: "stage.turn",
            strength: 1.08,
            variants: 2,
            gates: ["form:spear", "power"],
            preview: [
              { kind: "chaff", nx: 0.2 },
              { kind: "armor", nx: 0.42 },
              { kind: "armor", nx: 0.67 },
              { kind: "chaff", nx: 0.84 },
            ],
          },
        ],
        hard: [
          {
            id: "riven_tide",
            kind: "swarm",
            nameKey: "encounter.riven_tide",
            stageKey: "stage.hard1",
            strength: 1.08,
            variants: 2,
            gates: ["form:fan", "power"],
            preview: [
              { kind: "chaff", nx: 0.14 },
              { kind: "charger", nx: 0.34 },
              { kind: "chaff", nx: 0.5 },
              { kind: "charger", nx: 0.66 },
              { kind: "chaff", nx: 0.86 },
            ],
          },
          {
            id: "cross_rush_rekka",
            kind: "rush",
            nameKey: "encounter.cross_rush_rekka",
            stageKey: "stage.hard2",
            strength: 1.12,
            variants: 2,
            gates: ["tempo", "shield"],
            preview: [
              { kind: "charger", nx: 0.2 },
              { kind: "fast", nx: 0.38 },
              { kind: "fast", nx: 0.62 },
              { kind: "charger", nx: 0.8 },
            ],
          },
          {
            id: "iron_drum",
            kind: "armor",
            nameKey: "encounter.iron_drum",
            stageKey: "stage.hard3",
            strength: 1.17,
            variants: 2,
            gates: ["form:spear", "power"],
            preview: [
              { kind: "armor", nx: 0.25 },
              { kind: "drummer", nx: 0.5 },
              { kind: "armor", nx: 0.75 },
            ],
          },
        ],
      },
      bossPrep: {
        normal: {
          nameKey: "encounter.boss_prep_1_normal",
          gates: ["form:spear", "shield"],
          preview: [
            { kind: "boss_cart", nx: 0.5 },
            { kind: "sweep", nx: 0.25 },
            { kind: "sweep", nx: 0.75 },
          ],
        },
        hard: {
          nameKey: "encounter.boss_prep_1_hard",
          gates: ["form:spear", "tempo"],
          preview: [
            { kind: "boss_cart", nx: 0.5 },
            { kind: "charger", nx: 0.22 },
            { kind: "charger", nx: 0.78 },
          ],
        },
      },
    },
    2: {
      nameKey: "act.2.name",
      subtitleKey: "act.2.subtitle",
      boss: "mask",
      sky: "#9eaa91",
      road: "#ded7b6",
      side: "#697856",
      encounters: {
        normal: [
          {
            id: "side_shields",
            kind: "shield",
            nameKey: "encounter.side_shields",
            stageKey: "stage.opening",
            strength: 1.12,
            variants: 2,
            gates: ["form:spear", "shield"],
            preview: [
              { kind: "shield", nx: 0.28, side: 1 },
              { kind: "fast", nx: 0.5 },
              { kind: "shield", nx: 0.72, side: -1 },
            ],
          },
          {
            id: "crossfire",
            kind: "bombard",
            nameKey: "encounter.crossfire",
            stageKey: "stage.middle",
            strength: 1.16,
            variants: 2,
            gates: ["form:spiral", "tempo"],
            preview: [
              { kind: "thrower", nx: 0.2 },
              { kind: "chaff", nx: 0.38 },
              { kind: "chaff", nx: 0.62 },
              { kind: "thrower", nx: 0.8 },
            ],
          },
          {
            id: "split_ritual",
            kind: "split",
            nameKey: "encounter.split_ritual",
            stageKey: "stage.turn",
            strength: 1.2,
            variants: 2,
            gates: ["form:fan", "form:drum"],
            preview: [
              { kind: "splitter", nx: 0.22 },
              { kind: "drummer", nx: 0.5 },
              { kind: "splitter", nx: 0.78 },
            ],
          },
        ],
        hard: [
          {
            id: "shield_wheel",
            kind: "shield",
            nameKey: "encounter.shield_wheel",
            stageKey: "stage.hard1",
            strength: 1.2,
            variants: 2,
            gates: ["form:spear", "shield"],
            preview: [
              { kind: "shield", nx: 0.17, side: 1 },
              { kind: "shield", nx: 0.39, side: -1 },
              { kind: "shield", nx: 0.61, side: 1 },
              { kind: "shield", nx: 0.83, side: -1 },
            ],
          },
          {
            id: "crossfire_rekka",
            kind: "bombard",
            nameKey: "encounter.crossfire_rekka",
            stageKey: "stage.hard2",
            strength: 1.25,
            variants: 2,
            gates: ["form:spiral", "tempo"],
            preview: [
              { kind: "thrower", nx: 0.16 },
              { kind: "sweep", nx: 0.5 },
              { kind: "thrower", nx: 0.84 },
            ],
          },
          {
            id: "split_cascade",
            kind: "split",
            nameKey: "encounter.split_cascade",
            stageKey: "stage.hard3",
            strength: 1.3,
            variants: 2,
            gates: ["form:fan", "form:drum"],
            preview: [
              { kind: "splitter", nx: 0.15 },
              { kind: "drummer", nx: 0.36 },
              { kind: "drummer", nx: 0.64 },
              { kind: "splitter", nx: 0.85 },
            ],
          },
        ],
      },
      bossPrep: {
        normal: {
          nameKey: "encounter.boss_prep_2_normal",
          gates: ["form:spear", "form:spiral"],
          preview: [
            { kind: "boss_mask", nx: 0.5 },
            { kind: "bossFire", nx: 0.25 },
            { kind: "bossFire", nx: 0.75 },
          ],
        },
        hard: {
          nameKey: "encounter.boss_prep_2_hard",
          gates: ["power", "form:spiral"],
          preview: [
            { kind: "boss_mask", nx: 0.5 },
            { kind: "sweep", nx: 0.25 },
            { kind: "bossFire", nx: 0.75 },
          ],
        },
      },
    },
    3: {
      nameKey: "act.3.name",
      subtitleKey: "act.3.subtitle",
      boss: "dragon",
      sky: "#46516a",
      road: "#c9b783",
      side: "#27364a",
      encounters: {
        normal: [
          {
            id: "procession",
            kind: "mixed",
            nameKey: "encounter.procession",
            stageKey: "stage.opening",
            strength: 1.26,
            variants: 2,
            gates: ["form:drum", "power"],
            preview: [
              { kind: "shield", nx: 0.18 },
              { kind: "armor", nx: 0.38 },
              { kind: "drummer", nx: 0.62 },
              { kind: "fast", nx: 0.82 },
            ],
          },
          {
            id: "ink_corridor",
            kind: "gauntlet",
            nameKey: "encounter.ink_corridor",
            stageKey: "stage.middle",
            strength: 1.31,
            variants: 2,
            gates: ["form:spiral", "shield"],
            preview: [
              { kind: "thrower", nx: 0.16 },
              { kind: "sweep", nx: 0.5 },
              { kind: "charger", nx: 0.84 },
            ],
          },
          {
            id: "three_claps",
            kind: "elite",
            nameKey: "encounter.three_claps",
            stageKey: "stage.close",
            strength: 1.36,
            variants: 2,
            gates: ["count", "power"],
            preview: [
              { kind: "chaff", nx: 0.12 },
              { kind: "armor", nx: 0.35 },
              { kind: "charger", nx: 0.5 },
              { kind: "thrower", nx: 0.68 },
              { kind: "splitter", nx: 0.88 },
            ],
          },
        ],
        hard: [
          {
            id: "procession_rekka",
            kind: "mixed",
            nameKey: "encounter.procession_rekka",
            stageKey: "stage.hard1",
            strength: 1.35,
            variants: 2,
            gates: ["form:drum", "power"],
            preview: [
              { kind: "shield", nx: 0.12 },
              { kind: "armor", nx: 0.32 },
              { kind: "drummer", nx: 0.5 },
              { kind: "charger", nx: 0.68 },
              { kind: "shield", nx: 0.88 },
            ],
          },
          {
            id: "ink_maze",
            kind: "gauntlet",
            nameKey: "encounter.ink_maze",
            stageKey: "stage.hard2",
            strength: 1.42,
            variants: 2,
            gates: ["form:spiral", "shield"],
            preview: [
              { kind: "sweep", nx: 0.2 },
              { kind: "thrower", nx: 0.38 },
              { kind: "charger", nx: 0.62 },
              { kind: "sweep", nx: 0.8 },
            ],
          },
          {
            id: "final_rekka",
            kind: "elite",
            nameKey: "encounter.final_rekka",
            stageKey: "stage.hardClose",
            strength: 1.5,
            variants: 2,
            gates: ["count", "power"],
            preview: [
              { kind: "drummer", nx: 0.12 },
              { kind: "shield", nx: 0.3 },
              { kind: "armor", nx: 0.5 },
              { kind: "thrower", nx: 0.7 },
              { kind: "charger", nx: 0.88 },
            ],
          },
        ],
      },
      bossPrep: {
        normal: {
          nameKey: "encounter.boss_prep_3_normal",
          gates: ["form:drum", "form:spiral"],
          preview: [
            { kind: "boss_dragon", nx: 0.5 },
            { kind: "sweep", nx: 0.22 },
            { kind: "bossFire", nx: 0.78 },
          ],
        },
        hard: {
          nameKey: "encounter.boss_prep_3_hard",
          gates: ["power", "shield"],
          preview: [
            { kind: "boss_dragon", nx: 0.5 },
            { kind: "sweep", nx: 0.18 },
            { kind: "bossFire", nx: 0.5 },
            { kind: "sweep", nx: 0.82 },
          ],
        },
      },
    },
  };

  const ENEMY_DEF = {
    chaff: { hp: 8, speed: 102, radius: 13, damage: 2, score: 34 },
    fast: { hp: 8, speed: 158, radius: 12, damage: 3, score: 48 },
    armor: { hp: 44, speed: 72, radius: 21, damage: 6, score: 120 },
    shield: { hp: 30, speed: 80, radius: 18, damage: 4, score: 105 },
    thrower: { hp: 27, speed: 58, radius: 18, damage: 4, score: 115 },
    splitter: { hp: 19, speed: 90, radius: 17, damage: 4, score: 82 },
    mite: { hp: 5, speed: 136, radius: 9, damage: 1, score: 18 },
    charger: { hp: 22, speed: 52, radius: 16, damage: 5, score: 96 },
    drummer: { hp: 54, speed: 42, radius: 20, damage: 4, score: 145 },
  };

  const CHARM_POOL = {
    knot: { icon: "結", nameKey: "charm.knot.name", descKey: "charm.knot.desc", tag: "gate" }, // i18n-allow-ornament: charm crest
    bell: { icon: "鈴", nameKey: "charm.bell.name", descKey: "charm.bell.desc", tag: "defense" }, // i18n-allow-ornament: charm crest
    fox: { icon: "狐", nameKey: "charm.fox.name", descKey: "charm.fox.desc", tag: "stamp" }, // i18n-allow-ornament: charm crest
    rice: {
      icon: "米", // i18n-allow-ornament: charm crest
      nameKey: "charm.rice.name",
      descKey: "charm.rice.desc",
      tag: "recovery",
    },
    ink: { icon: "墨", nameKey: "charm.ink.name", descKey: "charm.ink.desc", tag: "gate" }, // i18n-allow-ornament: charm crest
    crane: { icon: "鶴", nameKey: "charm.crane.name", descKey: "charm.crane.desc", tag: "defense" }, // i18n-allow-ornament: charm crest
    echo: { icon: "響", nameKey: "charm.echo.name", descKey: "charm.echo.desc", tag: "stamp" }, // i18n-allow-ornament: charm crest
    banner: {
      icon: "旗", // i18n-allow-ornament: charm crest
      nameKey: "charm.banner.name",
      descKey: "charm.banner.desc",
      tag: "recovery",
    },
  };

  const GATE_THRESHOLDS = [34, 78, 126];
  const COUNT_MULTIPLIER = [1.12, 1.25, 1.45, 1.72];
  const POWER_GAIN = [1, 2, 3, 4];
  const TEMPO_GAIN = [0.1, 0.2, 0.32, 0.46];
  const SHIELD_GAIN = [1, 2, 3, 4];
  const RECOVER_GAIN = [2, 4, 7, 11];
  const GRADE_ORDER = ["wood", "vermilion", "silver", "gold"];

  function actData() {
    return ACT_DATA[state.act] || ACT_DATA[3];
  }
  function actName(act = state.act) {
    return t(`act.${Math.min(3, act)}.name`);
  }
  function actSubtitle(act = state.act) {
    return t(`act.${Math.min(3, act)}.subtitle`);
  }
  function encounterName(encounter) {
    return encounter?.nameKey ? t(encounter.nameKey) : "";
  }
  function encounterStage(encounter) {
    return encounter?.stageKey ? t(encounter.stageKey) : "";
  }
  function hardPrefix() {
    return state.difficulty === "hard" ? t("canvas.hardPrefix") : "";
  }
  function renderCanvasStatus() {
    const { kind, data } = canvasStatus;
    if (kind === "title") UI.canvasStatus.textContent = t("status.title");
    else if (kind === "act") {
      UI.canvasStatus.textContent = t("status.act", {
        act: actSubtitle(data.act),
        name: actName(data.act),
      });
    } else if (kind === "phase") {
      UI.canvasStatus.textContent = t("status.phase", {
        stage: encounterStage(data.encounter),
        name: encounterName(data.encounter),
      });
    } else if (kind === "boss") {
      UI.canvasStatus.textContent = t("status.boss", { name: t(`boss.${data.type}`) });
    } else if (kind === "upgrade") UI.canvasStatus.textContent = t("status.upgrade");
    else if (kind === "damage") UI.canvasStatus.textContent = t("status.damage", data);
    else if (kind === "ward") UI.canvasStatus.textContent = t("status.ward", data);
    else if (kind === "paused") UI.canvasStatus.textContent = t("status.paused");
    else if (kind === "resumed") UI.canvasStatus.textContent = t("status.resumed");
    else if (kind === "result") {
      UI.canvasStatus.textContent = data.clear
        ? t("status.resultClear", { score: pretty(data.score) })
        : t("status.resultFail", {
            score: pretty(data.score),
            cause: deathCauseText(data.cause),
          });
    } else throw new RangeError(`Unknown Kamifuda canvas status: ${String(kind)}`);
  }
  function announceCanvas(kind, data = {}) {
    canvasStatus = { kind, data };
    renderCanvasStatus();
  }
  function currentRecord() {
    return state.profile.records[state.difficulty] || state.profile.records.normal;
  }
  function cloneEncounter(encounter, index) {
    const variants = Math.max(1, encounter.variants || 1);
    return {
      ...encounter,
      preview: (encounter.preview || []).map((item) => ({ ...item })),
      gates: (encounter.gates || []).slice(),
      variant: variants > 1 ? state.gameplayRng.int(0, variants - 1) : 0,
      order: index,
    };
  }
  function makeActEncounters(act) {
    const source =
      ACT_DATA[act]?.encounters?.[state.difficulty] || ACT_DATA[act]?.encounters?.normal || [];
    return source.map(cloneEncounter);
  }
  function bossPrepEncounter() {
    const source = actData().bossPrep?.[state.difficulty] || actData().bossPrep?.normal;
    return {
      id: `boss_prep_${state.act}_${state.difficulty}`,
      kind: "bossPrep",
      bossPrep: true,
      nameKey: source.nameKey,
      stageKey: "stage.prepare",
      strength: 1,
      gates: (source?.gates || ["power", "shield"]).slice(),
      preview: (source?.preview || []).map((item) => ({ ...item })),
      variant: 0,
    };
  }
  function gateOptionFromSpec(spec) {
    if (typeof spec === "object" && spec?.kind)
      return spec.kind === "form" ? formOption(spec.form) : statOption(spec.kind);
    if (typeof spec !== "string") return statOption("count");
    if (spec.startsWith("form:")) return formOption(spec.slice(5));
    return statOption(spec);
  }
  function setPhase(name, duration = 0) {
    state.phase = name;
    state.phaseTimer = 0;
    state.phaseDuration = duration;
  }

  function resetStats() {
    state.stats = {
      kills: 0,
      hits: 0,
      nearMisses: 0,
      perfectGates: 0,
      missedGates: 0,
      wavesNoHit: 0,
      stampUses: 0,
      manualStamps: 0,
      autoStamps: 0,
      bossTimes: [],
      gateHistory: [],
      damageLost: 0,
      deathCause: null,
      actReached: 1,
      waves: 0,
      tier3Gates: 0,
      focusSwitches: 0,
      priorityKills: 0,
      bannerRestores: 0,
      beatsSeen: 0,
      bossPatterns: [],
      bossPrepGates: 0,
      gateChargeWaste: 0,
    };
  }

  function createPlayer() {
    const rules = modeRules();
    return {
      nx: 0.5,
      targetNx: 0.5,
      x: nxToX(0.5),
      targetX: nxToX(0.5),
      y: state.layout.playerY,
      count: rules.startCount,
      maxCount: state.difficulty === "hard" ? 145 : 160,
      power: 1,
      tempo: 1,
      shield: rules.startShield,
      maxShield: rules.maxShield,
      form: "fan",
      mastery: { fan: 1, spear: 0, spiral: 0, drum: 0 },
      fireTimer: 0.08,
      invuln: 0,
      momentum: 0,
      readyTime: 0,
      stampTimer: 0,
      echoTimer: 0,
      charms: [],
      craneUsed: false,
      moving: 0,
      bannerWaveRestores: 0,
    };
  }

  function clearObjects() {
    state.gates.length = 0;
    state.enemies.length = 0;
    state.bullets.length = 0;
    state.enemyShots.length = 0;
    state.hazards.length = 0;
    state.particles.length = 0;
    state.texts.length = 0;
    state.scenery.length = 0;
    state.boss = null;
    state.focusGateId = null;
  }

  function startRun(seed = null, difficulty = "normal") {
    resetInput();
    state.generation++;
    const chosenMode = difficulty === "hard" ? "hard" : "normal";
    state.difficulty = chosenMode;
    const actualSeed = Number.isFinite(Number(seed)) ? Number(seed) : randSeed();
    state.seed = actualSeed >>> 0 || 1;
    state.gameplayRng = new RNG(state.seed ^ 0x9e3779b9 ^ (chosenMode === "hard" ? 0x5bd1e995 : 0));
    state.spawnRng = new RNG(state.seed ^ 0x85ebca6b ^ (chosenMode === "hard" ? 0x27d4eb2f : 0));
    state.fxRng = new RNG(state.seed ^ 0xc2b2ae35);
    state.simTime = 0;
    state.runTime = 0;
    state.scroll = 0;
    state.act = 1;
    state.encounterIndex = 0;
    state.currentEncounter = null;
    state.bossPrepared = false;
    state.encounters = makeActEncounters(1);
    state.player = createPlayer();
    state.score = 0;
    state.sealsEarned = 0;
    state.combo = 0;
    state.comboTimer = 0;
    state.shake = 0;
    state.flash = 0;
    state.hitStop = 0;
    state.speedScale = chosenMode === "hard" ? 1.08 : 1;
    state.transition = null;
    state.result = null;
    resetStats();
    clearObjects();
    currentRecord().runs++;
    saveProfile();
    document.documentElement.classList.toggle("hard-run", chosenMode === "hard");
    state.mode = "playing";
    showOverlay(null);
    canvas.focus({ preventScroll: true });
    announceCanvas("act", { act: 1 });
    setPhase("actIntro", chosenMode === "hard" ? 1.34 : 1.48);
    addText(
      0.5,
      state.viewH * 0.43,
      `${chosenMode === "hard" ? `${t("mode.hard")} · ` : ""}${actSubtitle(1)}`,
      COLORS.redDark,
      1.35,
      38,
      "center",
    );
    updateControls();
  }

  function returnToTitle() {
    resetInput();
    state.generation++;
    clearObjects();
    state.player = null;
    state.mode = "title";
    state.phase = "idle";
    document.documentElement.classList.remove("hard-run");
    refreshModeButtons();
    showOverlay("title");
    announceCanvas("title");
    UI.start.focus({ preventScroll: true });
    updateControls();
  }

  function pauseGame() {
    if (!["playing", "boss", "transition"].includes(state.mode)) return;
    uiProjection.rememberFocus();
    state.resumeMode = state.mode;
    state.mode = "paused";
    showOverlay("pause");
    announceCanvas("paused");
    updateControls();
  }

  function resumeGame() {
    if (state.mode !== "paused") return;
    state.mode = state.resumeMode || "playing";
    showOverlay(null);
    announceCanvas("resumed");
    uiProjection.restoreFocus(canvas);
    state.lastTime = performance.now();
    state.accumulator = 0;
    updateControls();
  }

  function updateControls() {
    const gameplay = ["playing", "boss", "transition"].includes(state.mode);
    UI.pauseButton.style.visibility = gameplay ? "visible" : "hidden";
    const stampVisible = gameplay && !!state.player;
    UI.stampButton.classList.toggle("is-visible", stampVisible);
    if (state.player)
      UI.stampButton.style.setProperty("--meter", `${state.player.momentum * 3.6}deg`);
    const ready = stampVisible && state.player.momentum >= 100;
    UI.stampButton.classList.toggle("is-ready", ready);
    UI.stampButton.disabled = !ready;
  }

  function gateThreshold(index) {
    const reduction = state.player?.charms.includes("knot") ? 0.9 : 1;
    const actScale = 1 + Math.max(0, state.act - 1) * 0.025;
    const prepScale = state.currentEncounter?.bossPrep ? 0.9 : 1;
    return GATE_THRESHOLDS[index] * modeRules().gateScale * actScale * prepScale * reduction;
  }

  function chargeTier(value) {
    let tier = 0;
    for (let i = 0; i < 3; i++) if (value >= gateThreshold(i)) tier = i + 1;
    return tier;
  }

  function formOption(form) {
    return { kind: "form", form, style: GATE_STYLE.form };
  }

  function statOption(kind) {
    return { kind, style: GATE_STYLE[kind] || GATE_STYLE.count };
  }

  function gateKey(option) {
    return option.kind === "form" ? `form:${option.form}` : option.kind;
  }

  function adaptGateOption(option) {
    const p = state.player;
    if (option.kind === "form" && p.form === option.form && p.mastery[option.form] >= 3) {
      const replacements = { fan: "count", spear: "power", spiral: "shield", drum: "tempo" };
      return statOption(replacements[option.form]);
    }
    if (option.kind === "power" && p.power >= 14) return statOption("count");
    if (option.kind === "tempo" && p.tempo >= 2.8)
      return statOption(p.shield < p.maxShield ? "shield" : "power");
    if (option.kind === "shield" && p.shield >= p.maxShield && p.count >= p.maxCount * 0.9)
      return statOption("power");
    return option;
  }

  function buildGateOptions(encounter) {
    const authored = (encounter.gates || ["count", "power"])
      .map(gateOptionFromSpec)
      .map(adaptGateOption);
    let pair = authored.slice(0, 2);
    while (pair.length < 2) pair.push(statOption(pair.length ? "shield" : "count"));
    if (gateKey(pair[0]) === gateKey(pair[1]))
      pair[1] = statOption(pair[0].kind === "shield" ? "count" : "shield");

    // Normal mode uses a visible recovery offer only when a run is genuinely
    // close to collapse. Hard mode preserves the authored pair without help.
    const p = state.player;
    const needsMercy =
      state.difficulty === "normal" &&
      !encounter.bossPrep &&
      state.act > 1 &&
      (p.count < 22 || (p.shield === 0 && p.count < 34));
    if (needsMercy && !pair.some((option) => option.kind === "shield"))
      pair[1] = statOption("shield");

    if (state.gameplayRng.chance(0.5)) pair.reverse();
    return pair;
  }

  function beginGate(encounter) {
    state.currentEncounter = encounter;
    const pair = buildGateOptions(encounter);
    const startY = state.layout.track.top + 20;
    state.gates = pair.map((option, i) => ({
      id: `${state.generation}:${state.act}:${state.encounterIndex}:${encounter.bossPrep ? "b" : "w"}:${i}`,
      lane: i === 0 ? "left" : "right",
      nx: i === 0 ? 0.28 : 0.72,
      x: nxToX(i === 0 ? 0.28 : 0.72),
      y: startY,
      option,
      charge: 0,
      tier: 0,
      previousTier: 0,
      selected: false,
      dead: false,
    }));
    state.focusGateId =
      state.player.nx < 0.45
        ? state.gates[0].id
        : state.player.nx > 0.55
          ? state.gates[1].id
          : null;
    state.player.fireTimer = 0.02;
    state.mode = "playing";
    const base = encounter.bossPrep ? modeRules().prepGateDuration : modeRules().gateDuration;
    setPhase("gate", state.layout.short ? base * 0.9 : base);
    if (encounter.bossPrep)
      addText(
        0.5,
        state.layout.hudH + 124,
        encounterName(encounter),
        COLORS.redDark,
        0.92,
        25,
        "center",
      );
    announceCanvas("phase", { encounter });
    sfx("gate", encounter.bossPrep ? 1 : 0.8, encounter.bossPrep ? 0.82 : 1);
    updateControls();
  }

  function beginEncounter() {
    const encounter = state.encounters[state.encounterIndex];
    if (encounter) {
      beginGate(encounter);
      return;
    }
    if (!state.bossPrepared) {
      state.bossPrepared = true;
      beginGate(bossPrepEncounter());
      return;
    }
    beginBossIntro();
  }

  function beginCombat(encounter) {
    state.gates.length = 0;
    state.focusGateId = null;
    state.currentEncounter = encounter;
    state.currentEncounter.schedule = buildWaveSchedule(encounter);
    state.currentEncounter.cursor = 0;
    state.currentEncounter.elapsed = 0;
    state.currentEncounter.damaged = false;
    state.currentEncounter.clearTimer = 0;
    state.currentEncounter.lastBeat = -1;
    state.player.bannerWaveRestores = 0;
    state.stats.waves++;
    state.mode = "playing";
    setPhase("combat");
    addText(
      0.5,
      state.layout.hudH + 94,
      `${encounterStage(encounter)}・${encounterName(encounter)}`,
      state.act === 3 ? COLORS.paperHi : COLORS.ink2,
      0.85,
      21,
      "center",
    );
    announceCanvas("phase", { encounter });
  }

  function finishWave() {
    if (state.phase !== "combat") return;
    if (!state.currentEncounter.damaged) {
      state.stats.wavesNoHit++;
      addMomentum(state.difficulty === "hard" ? 9 : 12, "perfect");
      addScore(250 + state.act * 100, 0.5, state.viewH * 0.28, t("canvas.noHit"));
      if (state.player.charms.includes("bell")) {
        state.player.shield = Math.min(state.player.maxShield, state.player.shield + 1);
        sfx("shield", 0.7);
      }
    }
    state.encounterIndex++;
    setPhase("waveClear", state.difficulty === "hard" ? 0.58 : 0.68);
    state.mode = "transition";
    state.enemies.length = 0;
    state.enemyShots.length = 0;
    state.hazards.length = 0;
    updateControls();
  }

  function beginBossIntro() {
    state.mode = "transition";
    setPhase("bossIntro", 1.5);
    state.enemies.length = 0;
    state.enemyShots.length = 0;
    state.hazards.length = 0;
    state.currentEncounter = null;
    announceCanvas("boss", { type: actData().boss });
    sfx("boss", 1.1);
    haptic([40, 35, 70]);
    updateControls();
  }

  function addMomentum(amount, source = "") {
    const p = state.player;
    if (!p) return;
    let gain = amount * modeRules().momentum;
    if (p.charms.includes("fox") && ["near", "destroy"].includes(source)) gain *= 1.35;
    const before = p.momentum;
    p.momentum = clamp(p.momentum + gain, 0, 100);
    if (before < 100 && p.momentum >= 100) {
      p.readyTime = 0;
      sfx("ready", 1);
      haptic(25);
      toast(t("toast.stampReady"));
    }
    updateControls();
  }

  function addScore(amount, nx = null, y = null, label = null) {
    const crowdBonus = state.player?.charms.includes("banner")
      ? 1 + Math.min(0.75, state.player.count / 220)
      : 1;
    const comboBonus = 1 + Math.min(2.25, state.combo * 0.025);
    const value = Math.max(0, Math.round(amount * crowdBonus * comboBonus));
    state.score += value;
    if (nx !== null && y !== null && value >= 18)
      addText(nx, y, label || `+${value}`, COLORS.ochre, 0.65, 18, "world");
  }

  function addText(nx, y, text, color = COLORS.ink, life = 0.8, size = 24, space = "world") {
    const x = space === "world" ? nxToX(nx) : space === "center" ? state.layout.track.center : nx;
    state.texts.push({ nx, x, y, text, color, life, maxLife: life, size, space, vy: -32 });
    if (state.texts.length > 48) state.texts.splice(0, state.texts.length - 48);
  }

  function addParticle(nx, y, color, count = 8, power = 1, kind = "paper") {
    const budget = state.quality.level === "low" ? 0.45 : 1;
    const n = Math.max(1, Math.floor(count * budget * (reducedMotion() ? 0.35 : 1)));
    for (let i = 0; i < n; i++) {
      const a = state.fxRng.range(0, TAU);
      const speed = state.fxRng.range(35, 170) * power;
      state.particles.push({
        nx,
        x: nxToX(nx),
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 30,
        life: state.fxRng.range(0.32, 0.78),
        maxLife: 0.78,
        size: state.fxRng.range(2.5, 8) * power,
        color,
        angle: state.fxRng.range(0, TAU),
        spin: state.fxRng.range(-7, 7),
        kind,
      });
    }
    const cap = state.quality.level === "low" ? 140 : 320;
    if (state.particles.length > cap) state.particles.splice(0, state.particles.length - cap);
  }

  function burstFollowers(nx, y, count) {
    const colors = [COLORS.red, COLORS.indigo, COLORS.ochre, COLORS.green];
    for (let i = 0; i < Math.min(36, count); i++)
      addParticle(
        nx + state.fxRng.range(-0.07, 0.07),
        y + state.fxRng.range(-8, 8),
        state.fxRng.pick(colors),
        1,
        0.75,
        "follower",
      );
  }

  function gateDisplay(option, tier) {
    const r = clamp(tier, 0, 3);
    if (option.kind === "count") return `×${COUNT_MULTIPLIER[r].toFixed(r ? 1 : 2)}`;
    if (option.kind === "power") return `+${POWER_GAIN[r]}`;
    if (option.kind === "tempo") return `+${Math.round(TEMPO_GAIN[r] * 100)}%`;
    if (option.kind === "shield") return `+${SHIELD_GAIN[r]}`;
    if (option.kind === "form")
      return r ? `${FORM[option.form].icon} ${"ⅠⅡⅢ"[r - 1]}` : FORM[option.form].icon;
    return "";
  }

  function gateName(option) {
    if (option.kind === "form") return t(FORM[option.form].nameKey);
    const key = {
      count: "gate.count",
      power: "gate.power",
      tempo: "gate.tempo",
      shield: "gate.shield",
    }[option.kind];
    return key ? t(key) : "";
  }

  function applyGate(gate) {
    const p = state.player;
    const option = gate.option;
    const rank = clamp(gate.tier, 0, 3);
    let overflow = 0;
    if (option.kind === "count") {
      const before = p.count;
      const raw = Math.ceil(before * COUNT_MULTIPLIER[rank]);
      p.count = Math.min(p.maxCount, raw);
      overflow = Math.max(0, raw - p.maxCount);
      addText(p.nx, p.y - 88, gateDisplay(option, rank), option.style.color, 1.05, 34, "world");
      burstFollowers(p.nx, p.y - 12, Math.max(8, p.count - before));
    } else if (option.kind === "power") {
      const before = p.power;
      p.power = Math.min(14, p.power + POWER_GAIN[rank]);
      overflow = Math.max(0, before + POWER_GAIN[rank] - 14) * 5;
      addText(
        p.nx,
        p.y - 88,
        t("canvas.float.power", { value: p.power - before }),
        option.style.color,
        1.05,
        30,
        "world",
      );
    } else if (option.kind === "tempo") {
      const before = p.tempo;
      p.tempo = Math.min(2.8, p.tempo + TEMPO_GAIN[rank]);
      overflow = Math.max(0, before + TEMPO_GAIN[rank] - 2.8) * 30;
      addText(
        p.nx,
        p.y - 88,
        t("canvas.float.tempo", { value: Math.round((p.tempo - before) * 100) }),
        option.style.color,
        1.05,
        28,
        "world",
      );
    } else if (option.kind === "shield") {
      const beforeShield = p.shield;
      p.shield = Math.min(p.maxShield, p.shield + SHIELD_GAIN[rank]);
      const beforeCount = p.count;
      p.count = Math.min(p.maxCount, p.count + RECOVER_GAIN[rank]);
      overflow = Math.max(0, beforeShield + SHIELD_GAIN[rank] - p.maxShield) * 7;
      addText(
        p.nx,
        p.y - 88,
        t("canvas.float.shield", {
          shield: p.shield - beforeShield,
          crowd:
            p.count > beforeCount ? t("canvas.float.crowd", { value: p.count - beforeCount }) : "",
        }),
        option.style.color,
        1.08,
        27,
        "world",
      );
    } else if (option.kind === "form") {
      const form = option.form;
      const same = p.form === form;
      const beforeCount = p.count;
      p.form = form;
      if (same) p.mastery[form] = Math.min(3, p.mastery[form] + (rank >= 3 ? 2 : 1));
      else p.mastery[form] = Math.min(3, Math.max(p.mastery[form], Math.max(1, rank)));

      // The small recruit column is printed on the gate result. It prevents a
      // formation choice from becoming a dead growth turn without hiding
      // power or tempo bonuses behind the pictogram.
      const recruits = [0, 3, 6, 10][rank];
      p.count = Math.min(p.maxCount, p.count + recruits);
      overflow = Math.max(0, beforeCount + recruits - p.maxCount);
      addText(
        p.nx,
        p.y - 88,
        `${FORM[form].icon} ${"ⅠⅡⅢ"[p.mastery[form] - 1] || ""}${p.count > beforeCount ? t("canvas.float.crowd", { value: p.count - beforeCount }) : ""}`,
        FORM[form].color,
        1.08,
        31,
        "world",
      );
    }
    if (overflow > 0) {
      addMomentum(Math.min(24, overflow), "overflow");
      addScore(overflow * 12, p.nx, p.y - 122, t("canvas.float.overflow"));
    }
    state.stats.gateHistory.push({
      act: state.act,
      encounter: state.encounterIndex,
      encounterId: state.currentEncounter?.id || null,
      bossPrep: !!state.currentEncounter?.bossPrep,
      kind: option.kind,
      form: option.form || null,
      tier: rank,
    });
    if (state.currentEncounter?.bossPrep) state.stats.bossPrepGates++;
    if (rank === 3) {
      state.stats.perfectGates++;
      state.stats.tier3Gates++;
      state.sealsEarned++;
    }
    state.flash = Math.max(state.flash, 0.32);
    state.shake = Math.max(state.shake, 6 + rank * 2);
    sfx("choice", 0.9, 1 + rank * 0.08);
    haptic(rank === 3 ? [24, 18, 42] : 24);
  }

  function resolveGate() {
    if (!state.gates.length) return;
    const centralMiss = Math.abs(state.player.nx - 0.5) < 0.035;
    const lane = state.player.nx < 0.5 ? "left" : "right";
    const chosen = state.gates.find((g) => g.lane === lane);
    if (centralMiss || !chosen) {
      state.stats.missedGates++;
      addText(0.5, state.layout.playerY - 88, t("canvas.miss"), COLORS.ink2, 0.9, 25, "world");
      sfx("fail", 0.5);
    } else {
      applyGate(chosen);
      chosen.chosen = true;
    }
    state.gates.forEach((g) => {
      if (g !== chosen || centralMiss) g.dead = true;
    });
    if (
      !state.profile.tutorial.seen &&
      state.difficulty === "normal" &&
      state.act === 1 &&
      state.encounterIndex === 0
    ) {
      state.profile.tutorial.seen = true;
      saveProfile();
    }
    setPhase("gateResolve", state.currentEncounter?.bossPrep ? 0.38 : 0.44);
    state.mode = "transition";
    updateControls();
  }

  function buildWaveSchedule(encounter) {
    const s = encounter.strength || 1;
    const v = encounter.variant || 0;
    const mirror = v % 2 === 1;
    const list = [];
    const mx = (nx) => (mirror ? 1 - nx : nx);
    const enemy = (t, kind, nx, scale = 1, extra = {}) =>
      list.push({
        type: "enemy",
        t,
        kind,
        nx: clamp(mx(nx), 0.05, 0.95),
        scale: s * scale,
        ...extra,
      });
    const row = (t, kind, count, a = 0.18, b = 0.82, gap = 0.08, scale = 1, extra = {}) => {
      for (let i = 0; i < count; i++) {
        const nx = count === 1 ? 0.5 : lerp(a, b, i / (count - 1));
        enemy(t + i * gap, kind, nx, scale, { ...extra, phase: i * 0.73 });
      }
    };
    const packet = (t, kind, center, count, spread = 0.05, gap = 0.06, scale = 1, extra = {}) => {
      for (let i = 0; i < count; i++)
        enemy(t + i * gap, kind, center + (i - (count - 1) / 2) * spread, scale, {
          ...extra,
          phase: i * 0.9,
        });
    };
    const sweep = (t, lane, width = 0.34, warning = 0.9, damage = 5) =>
      list.push({
        type: "sweep",
        t,
        lane:
          typeof lane === "number"
            ? mx(lane)
            : mirror && lane === "left"
              ? "right"
              : mirror && lane === "right"
                ? "left"
                : lane,
        width,
        warning,
        damage,
      });
    const beat = (t, index) => list.push({ type: "beat", t, index });

    switch (encounter.id) {
      case "paper_tide":
        beat(0.02, 0);
        if (!v) {
          row(0.15, "chaff", 5, 0.27, 0.73, 0.07, 1, { depth: 0.14 });
          beat(1.18, 1);
          packet(1.24, "chaff", 0.23, 4, 0.045, 0.055, 1.02, { depth: 0.06 });
          packet(1.24, "chaff", 0.77, 4, 0.045, 0.055, 1.02, { depth: 0.06 });
          beat(2.48, 2);
          row(2.56, "chaff", 9, 0.12, 0.88, 0.055, 1.06);
        } else {
          packet(0.15, "chaff", 0.5, 6, 0.035, 0.065, 1, { depth: 0.12 });
          beat(1.15, 1);
          row(1.22, "chaff", 7, 0.13, 0.87, 0.075, 1.03, { depth: 0.05 });
          beat(2.42, 2);
          packet(2.5, "chaff", 0.23, 5, 0.038, 0.05, 1.06);
          packet(2.72, "chaff", 0.77, 5, 0.038, 0.05, 1.06);
        }
        break;
      case "cross_rush":
        beat(0.02, 0);
        enemy(0.14, "charger", 0.27, 1, { aim: 1.02, depth: 0.08 });
        packet(0.32, "chaff", 0.73, 4, 0.055, 0.08, 0.96, { depth: 0.12 });
        beat(1.18, 1);
        enemy(1.2, "charger", 0.73, 1.04, { aim: 0.96, depth: 0.03 });
        packet(1.34, "fast", 0.28, 3, 0.05, 0.16, 1);
        beat(2.45, 2);
        enemy(2.48, "charger", 0.31, 1.08, { aim: 0.86 });
        enemy(2.76, "charger", 0.69, 1.08, { aim: 0.86 });
        row(2.82, "fast", 4, 0.22, 0.78, 0.15, 1.02);
        break;
      case "iron_escort":
        beat(0.02, 0);
        enemy(0.12, "armor", 0.5, 1, { depth: 0.04 });
        row(0.18, "chaff", 5, 0.25, 0.75, 0.06, 0.98, { depth: 0.18 });
        beat(1.42, 1);
        enemy(1.46, "armor", 0.3, 1.03);
        enemy(1.46, "armor", 0.7, 1.03);
        packet(1.58, "chaff", 0.5, 5, 0.045, 0.06, 1.02, { depth: 0.1 });
        beat(2.92, 2);
        enemy(2.96, "armor", 0.5, 1.16);
        enemy(3.05, "fast", 0.18, 1.02);
        enemy(3.05, "fast", 0.82, 1.02);
        row(3.3, "chaff", 6, 0.17, 0.83, 0.06, 1.05);
        break;

      case "riven_tide":
        beat(0.02, 0);
        packet(0.1, "chaff", 0.2, 5, 0.035, 0.05, 1, { depth: 0.1 });
        packet(0.1, "chaff", 0.8, 5, 0.035, 0.05, 1, { depth: 0.1 });
        beat(0.92, 1);
        enemy(0.96, "charger", 0.34, 1.03, { aim: 0.78 });
        enemy(1.18, "charger", 0.66, 1.03, { aim: 0.78 });
        row(1.1, "chaff", 7, 0.12, 0.88, 0.055, 1.02);
        beat(2.18, 2);
        row(2.22, "chaff", 11, 0.08, 0.92, 0.045, 1.08);
        enemy(2.48, "charger", 0.5, 1.12, { aim: 0.7 });
        break;
      case "cross_rush_rekka":
        beat(0.02, 0);
        enemy(0.1, "charger", 0.22, 1.02, { aim: 0.72, depth: 0.08 });
        enemy(0.38, "charger", 0.78, 1.02, { aim: 0.72, depth: 0.04 });
        beat(0.82, 1);
        for (let i = 0; i < 7; i++)
          enemy(0.86 + i * 0.17, "fast", i % 2 ? 0.28 : 0.72, 1.04, { phase: i });
        beat(1.95, 2);
        enemy(1.98, "charger", 0.35, 1.13, { aim: 0.64 });
        enemy(2.12, "charger", 0.65, 1.13, { aim: 0.64 });
        packet(2.18, "chaff", 0.5, 7, 0.045, 0.045, 1.08);
        break;
      case "iron_drum":
        beat(0.02, 0);
        enemy(0.08, "drummer", 0.5, 1.03, { holdDepth: 0.25, pulses: 2, depth: 0.02 });
        enemy(0.22, "armor", 0.26, 1.02, { depth: 0.12 });
        enemy(0.22, "armor", 0.74, 1.02, { depth: 0.12 });
        beat(1.18, 1);
        row(1.2, "fast", 6, 0.15, 0.85, 0.14, 1.04);
        enemy(1.52, "armor", 0.5, 1.1);
        beat(2.28, 2);
        enemy(2.32, "armor", 0.25, 1.15);
        enemy(2.32, "armor", 0.75, 1.15);
        enemy(2.54, "charger", 0.5, 1.12, { aim: 0.66 });
        break;

      case "side_shields":
        beat(0.02, 0);
        enemy(0.12, "shield", 0.28, 1, { shieldSide: 1, depth: 0.08 });
        enemy(0.12, "shield", 0.72, 1, { shieldSide: -1, depth: 0.08 });
        packet(0.36, "chaff", 0.5, 5, 0.045, 0.06, 0.96, { depth: 0.15 });
        beat(1.38, 1);
        enemy(1.4, "shield", 0.5, 1.07, { shieldSide: mirror ? -1 : 1 });
        enemy(1.58, "fast", 0.2, 1.02);
        enemy(1.58, "fast", 0.8, 1.02);
        beat(2.55, 2);
        enemy(2.58, "shield", 0.23, 1.1, { shieldSide: -1 });
        enemy(2.58, "shield", 0.77, 1.1, { shieldSide: 1 });
        row(2.8, "fast", 5, 0.2, 0.8, 0.15, 1.03);
        break;
      case "crossfire":
        beat(0.02, 0);
        enemy(0.1, "thrower", 0.2, 1, { holdDepth: 0.22, pulses: 3 });
        enemy(0.1, "thrower", 0.8, 1, { holdDepth: 0.22, pulses: 3 });
        row(0.35, "chaff", 7, 0.18, 0.82, 0.06, 0.98, { depth: 0.14 });
        beat(1.62, 1);
        packet(1.65, "chaff", 0.28, 4, 0.045, 0.06, 1.04);
        packet(1.65, "chaff", 0.72, 4, 0.045, 0.06, 1.04);
        beat(2.72, 2);
        enemy(2.74, "thrower", 0.5, 1.14, { holdDepth: 0.28, pulses: 2 });
        row(2.92, "fast", 5, 0.18, 0.82, 0.16, 1.02);
        break;
      case "split_ritual":
        beat(0.02, 0);
        enemy(0.08, "drummer", 0.5, 1, { holdDepth: 0.23, pulses: 2 });
        enemy(0.24, "splitter", 0.24, 1, { depth: 0.1 });
        enemy(0.24, "splitter", 0.76, 1, { depth: 0.1 });
        beat(1.48, 1);
        row(1.5, "splitter", 4, 0.2, 0.8, 0.2, 1.04);
        packet(1.72, "chaff", 0.5, 5, 0.045, 0.06, 1.02, { depth: 0.08 });
        beat(2.86, 2);
        enemy(2.9, "splitter", 0.18, 1.12);
        enemy(2.9, "splitter", 0.5, 1.12);
        enemy(2.9, "splitter", 0.82, 1.12);
        break;

      case "shield_wheel":
        beat(0.02, 0);
        enemy(0.08, "shield", 0.17, 1, { shieldSide: 1, depth: 0.08 });
        enemy(0.08, "shield", 0.39, 1, { shieldSide: -1, depth: 0.08 });
        enemy(0.08, "shield", 0.61, 1, { shieldSide: 1, depth: 0.08 });
        enemy(0.08, "shield", 0.83, 1, { shieldSide: -1, depth: 0.08 });
        beat(1.02, 1);
        row(1.04, "fast", 7, 0.13, 0.87, 0.13, 1.05);
        sweep(1.16, 0.5, 0.17, 0.96, 5);
        beat(2.18, 2);
        enemy(2.2, "shield", 0.28, 1.13, { shieldSide: -1 });
        enemy(2.2, "shield", 0.72, 1.13, { shieldSide: 1 });
        enemy(2.42, "charger", 0.5, 1.1, { aim: 0.66 });
        break;
      case "crossfire_rekka":
        beat(0.02, 0);
        enemy(0.06, "thrower", 0.15, 1, { holdDepth: 0.2, pulses: 4 });
        enemy(0.06, "thrower", 0.5, 1.03, { holdDepth: 0.27, pulses: 3 });
        enemy(0.06, "thrower", 0.85, 1, { holdDepth: 0.2, pulses: 4 });
        sweep(0.5, "left", 0.38, 0.92, 5);
        beat(1.22, 1);
        row(1.24, "chaff", 8, 0.13, 0.87, 0.055, 1.04, { depth: 0.12 });
        sweep(1.48, "right", 0.38, 0.88, 5);
        beat(2.45, 2);
        enemy(2.48, "charger", 0.3, 1.12, { aim: 0.65 });
        enemy(2.68, "charger", 0.7, 1.12, { aim: 0.65 });
        break;
      case "split_cascade":
        beat(0.02, 0);
        enemy(0.05, "drummer", 0.34, 1.04, { holdDepth: 0.21, pulses: 2 });
        enemy(0.05, "drummer", 0.66, 1.04, { holdDepth: 0.21, pulses: 2 });
        row(0.32, "splitter", 5, 0.15, 0.85, 0.18, 1.03, { depth: 0.1 });
        beat(1.45, 1);
        enemy(1.48, "charger", 0.22, 1.08, { aim: 0.64 });
        enemy(1.68, "charger", 0.78, 1.08, { aim: 0.64 });
        packet(1.58, "chaff", 0.5, 7, 0.04, 0.045, 1.06);
        beat(2.62, 2);
        row(2.65, "splitter", 6, 0.12, 0.88, 0.15, 1.12);
        break;

      case "procession":
        beat(0.02, 0);
        enemy(0.06, "drummer", 0.5, 1, { holdDepth: 0.21, pulses: 2 });
        enemy(0.18, "shield", 0.2, 1, { shieldSide: 1, depth: 0.13 });
        enemy(0.18, "shield", 0.8, 1, { shieldSide: -1, depth: 0.13 });
        enemy(0.36, "armor", 0.5, 1.04, { depth: 0.15 });
        beat(1.55, 1);
        enemy(1.58, "fast", 0.15, 1.02);
        enemy(1.58, "fast", 0.85, 1.02);
        row(1.72, "chaff", 7, 0.18, 0.82, 0.055, 1.04);
        beat(2.75, 2);
        enemy(2.78, "armor", 0.3, 1.12);
        enemy(2.78, "armor", 0.7, 1.12);
        enemy(2.96, "charger", 0.5, 1.08, { aim: 0.72 });
        break;
      case "ink_corridor":
        beat(0.02, 0);
        sweep(0.08, "left", 0.42, 1.02, 5);
        enemy(0.18, "thrower", 0.78, 1, { holdDepth: 0.21, pulses: 3 });
        packet(0.38, "chaff", 0.72, 5, 0.04, 0.06, 1, { depth: 0.1 });
        beat(1.48, 1);
        sweep(1.5, "right", 0.42, 0.96, 5);
        enemy(1.62, "thrower", 0.22, 1.05, { holdDepth: 0.23, pulses: 3 });
        enemy(1.88, "charger", 0.72, 1.06, { aim: 0.74 });
        beat(2.82, 2);
        sweep(2.84, 0.5, 0.2, 1.04, 6);
        row(2.9, "fast", 6, 0.15, 0.85, 0.14, 1.06);
        break;
      case "three_claps":
        beat(0.02, 0);
        row(0.08, "chaff", 10, 0.1, 0.9, 0.045, 1.04, { depth: 0.1 });
        beat(1.34, 1);
        enemy(1.36, "armor", 0.28, 1.08);
        enemy(1.36, "armor", 0.72, 1.08);
        enemy(1.58, "charger", 0.5, 1.08, { aim: 0.72 });
        beat(2.72, 2);
        enemy(2.74, "thrower", 0.18, 1.08, { holdDepth: 0.22, pulses: 2 });
        enemy(2.74, "shield", 0.42, 1.1, { shieldSide: 1 });
        enemy(2.74, "splitter", 0.68, 1.1);
        enemy(2.9, "fast", 0.86, 1.08);
        break;

      case "procession_rekka":
        beat(0.02, 0);
        enemy(0.04, "drummer", 0.5, 1.05, { holdDepth: 0.2, pulses: 3 });
        enemy(0.12, "shield", 0.13, 1.04, { shieldSide: 1, depth: 0.12 });
        enemy(0.12, "armor", 0.34, 1.04, { depth: 0.12 });
        enemy(0.12, "armor", 0.66, 1.04, { depth: 0.12 });
        enemy(0.12, "shield", 0.87, 1.04, { shieldSide: -1, depth: 0.12 });
        beat(1.05, 1);
        enemy(1.08, "charger", 0.28, 1.1, { aim: 0.62 });
        enemy(1.28, "charger", 0.72, 1.1, { aim: 0.62 });
        row(1.12, "fast", 6, 0.16, 0.84, 0.13, 1.06);
        beat(2.18, 2);
        row(2.2, "chaff", 9, 0.1, 0.9, 0.045, 1.1);
        enemy(2.36, "drummer", 0.5, 1.12, { holdDepth: 0.27, pulses: 1 });
        break;
      case "ink_maze":
        beat(0.02, 0);
        sweep(0.05, "left", 0.36, 0.78, 6);
        enemy(0.1, "thrower", 0.82, 1.03, { holdDepth: 0.2, pulses: 4 });
        enemy(0.42, "charger", 0.68, 1.08, { aim: 0.62 });
        beat(0.98, 1);
        sweep(1.0, "right", 0.36, 0.76, 6);
        enemy(1.05, "thrower", 0.18, 1.06, { holdDepth: 0.22, pulses: 4 });
        enemy(1.32, "charger", 0.32, 1.1, { aim: 0.6 });
        beat(1.94, 2);
        sweep(1.96, 0.5, 0.18, 0.72, 6);
        enemy(2.02, "thrower", 0.5, 1.12, { holdDepth: 0.29, pulses: 3 });
        row(2.15, "fast", 7, 0.12, 0.88, 0.12, 1.1);
        break;
      case "final_rekka":
        beat(0.02, 0);
        enemy(0.04, "drummer", 0.14, 1.08, { holdDepth: 0.19, pulses: 2 });
        enemy(0.04, "drummer", 0.86, 1.08, { holdDepth: 0.19, pulses: 2 });
        row(0.1, "chaff", 10, 0.1, 0.9, 0.04, 1.08, { depth: 0.12 });
        beat(0.94, 1);
        enemy(0.96, "shield", 0.2, 1.12, { shieldSide: 1 });
        enemy(0.96, "armor", 0.4, 1.12);
        enemy(0.96, "armor", 0.6, 1.12);
        enemy(0.96, "shield", 0.8, 1.12, { shieldSide: -1 });
        enemy(1.18, "charger", 0.5, 1.13, { aim: 0.58 });
        beat(1.92, 2);
        enemy(1.94, "thrower", 0.15, 1.13, { holdDepth: 0.21, pulses: 3 });
        enemy(1.94, "thrower", 0.85, 1.13, { holdDepth: 0.21, pulses: 3 });
        row(2.02, "splitter", 5, 0.24, 0.76, 0.15, 1.14);
        sweep(2.18, 0.5, 0.17, 0.76, 7);
        break;
      default:
        row(0.1, "chaff", 8, 0.16, 0.84, 0.07, s);
        break;
    }
    return list.sort((a, b) => a.t - b.t || (a.type === "beat" ? -1 : 0));
  }

  function spawnEnemy(event) {
    const def = ENEMY_DEF[event.kind];
    if (!def) return;
    const rules = modeRules();
    const yScale = clamp(state.viewH / 720, 0.76, 1.18);
    const hpScale = (event.scale || 1) * rules.enemyHp * (1 + (state.act - 1) * 0.045);
    const topY = state.layout.track.top + 30;
    const nearY = state.layout.playerY - 178;
    const spawnY = Number.isFinite(event.spawnY)
      ? event.spawnY
      : lerp(topY, nearY, clamp(event.depth || 0, 0, 0.72));
    const holdY = Number.isFinite(event.holdDepth)
      ? lerp(state.layout.track.top + 86, state.layout.playerY - 218, clamp(event.holdDepth, 0, 1))
      : null;
    const enemy = {
      id: `${state.generation}:e:${state.simTime}:${state.enemies.length}`,
      kind: event.kind,
      nx: event.nx,
      baseNx: event.nx,
      x: nxToX(event.nx),
      y: spawnY,
      hp: def.hp * hpScale,
      maxHp: def.hp * hpScale,
      speed: def.speed * yScale * rules.enemySpeed * (1 + (state.act - 1) * 0.022),
      radius: def.radius,
      damage: Math.max(1, Math.ceil(def.damage * rules.enemyDamage)),
      score: def.score * (event.scale || 1) * (state.difficulty === "hard" ? 1.22 : 1),
      phase: event.phase ?? state.spawnRng.range(0, TAU),
      shieldSide: event.shieldSide || state.spawnRng.sign(),
      shieldHp: event.kind === "shield" ? 21 * hpScale : 0,
      attackTimer:
        event.kind === "thrower"
          ? state.spawnRng.range(0.88, 1.28)
          : event.kind === "drummer"
            ? 1.05
            : 0,
      flash: 0,
      dead: false,
      nearChecked: false,
      spawnedAt: state.simTime,
      entryTimer: 0.28,
      holdY,
      pulses: event.pulses ?? (event.kind === "drummer" ? 2 : 0),
      chargeState: event.kind === "charger" ? "aim" : null,
      chargeTimer:
        event.kind === "charger" ? (event.aim ?? (state.difficulty === "hard" ? 0.7 : 0.95)) : 0,
      chargeMarked: false,
      lockedNx: Number.isFinite(event.targetNx) ? event.targetNx : null,
      dashSpeed: (state.difficulty === "hard" ? 338 : 300) * yScale,
      beat: event.beat ?? 0,
    };
    state.enemies.push(enemy);
  }

  function spawnMite(nx, y, direction = 1) {
    const def = ENEMY_DEF.mite;
    const rules = modeRules();
    const miteNx = clamp(nx + direction * 0.035, 0.04, 0.96);
    state.enemies.push({
      id: `${state.generation}:m:${state.simTime}:${state.enemies.length}`,
      kind: "mite",
      nx: miteNx,
      baseNx: miteNx,
      x: nxToX(miteNx),
      y,
      hp: def.hp * rules.enemyHp * (1 + state.act * 0.06),
      maxHp: def.hp * rules.enemyHp,
      speed: def.speed * rules.enemySpeed * clamp(state.viewH / 720, 0.76, 1.18),
      radius: def.radius,
      damage: Math.ceil(def.damage * rules.enemyDamage),
      score: def.score * (state.difficulty === "hard" ? 1.22 : 1),
      phase: state.spawnRng.range(0, TAU),
      shieldSide: 0,
      shieldHp: 0,
      attackTimer: 0,
      flash: 0,
      dead: false,
      nearChecked: false,
      entryTimer: 0.12,
      holdY: null,
      pulses: 0,
      chargeState: null,
    });
  }

  function spawnReinforcement(source) {
    if (!source || source.dead || source.pulses <= 0) return;
    source.pulses--;
    const count = state.difficulty === "hard" ? 4 : 3;
    for (let i = 0; i < count; i++) {
      const nx = clamp(source.nx + (i - (count - 1) / 2) * 0.055, 0.06, 0.94);
      spawnEnemy({
        kind: i === count - 1 && state.difficulty === "hard" ? "fast" : "chaff",
        nx,
        scale: 0.78 + state.act * 0.05,
        spawnY: source.y + 26,
        phase: i,
      });
    }
    addText(source.nx, source.y + 34, t("canvas.float.drum"), COLORS.ochre, 0.55, 20, "world");
    addParticle(source.nx, source.y, COLORS.ochre, 10, 0.65);
    sfx("drum", 0.45, 0.88);
  }

  function playerFootprint() {
    if (!state.player) return 22;
    const p = state.player;
    const formScale = { fan: 1.18, spear: 0.66, spiral: 0.88, drum: 0.96 }[p.form] || 1;
    const crowd = clamp(18 + Math.sqrt(p.count) * 6.1, 28, 94);
    return Math.min(crowd * formScale, state.layout.track.width * 0.23);
  }

  function fireCadence() {
    const p = state.player;
    const form = FORM[p.form];
    const echo = p.echoTimer > 0 ? 0.74 : 1;
    const stamp = p.stampTimer > 0 ? 0.72 : 1;
    return Math.max(0.075, (form.cadence / p.tempo) * echo * stamp);
  }

  function volleyShotCount() {
    const p = state.player;
    const form = FORM[p.form];
    return clamp(
      Math.floor(form.minShots + p.count * form.countScale),
      form.minShots,
      form.maxShots + p.mastery[p.form] * 2,
    );
  }

  function spawnVolley() {
    const p = state.player;
    if (!p) return;
    const form = FORM[p.form];
    const count = volleyShotCount();
    const mastery = p.mastery[p.form];
    const gatePhase = state.phase === "gate";
    const focused = gatePhase ? state.gates.find((g) => g.id === state.focusGateId) : null;
    const totalDamage =
      (3.2 + p.count * 0.42) *
      p.power *
      form.damage *
      (1 + mastery * 0.08) *
      (p.stampTimer > 0 ? 1.28 : 1);
    const perShot = totalDamage / Math.max(1, count);
    const maxBullets = state.quality.level === "low" ? 180 : 270;

    for (let i = 0; i < count && state.bullets.length < maxBullets; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      let spread = (t - 0.5) * form.spread;
      let nx = p.nx + spread * 0.15;
      let vx = spread * 0.13;
      let radius = p.form === "drum" ? 6.2 : p.form === "spear" ? 3.3 : 4.1;
      if (p.form === "spiral") {
        const a = state.simTime * 5 + t * TAU;
        nx += Math.sin(a) * 0.03;
        vx += Math.cos(a) * 0.035;
      }
      if (p.form === "drum")
        vx += Math.sin(state.simTime * 31 + i * 2.399963 + state.seed * 0.00001) * 0.012;
      if (gatePhase && focused) {
        const targetNx = focused.nx + (t - 0.5) * 0.08;
        vx = (targetNx - nx) * 1.8;
      }
      state.bullets.push({
        nx: clamp(nx, -0.08, 1.08),
        x: nxToX(nx),
        y: p.y - 44,
        vx,
        vy: -form.speed,
        radius,
        damage: perShot,
        pierce: form.pierce + Math.floor(mastery / 2),
        form: p.form,
        gateId: gatePhase && focused ? focused.id : null,
        // Gate growth is a time commitment, not a reward for an already
        // snowballing damage build. Tempo changes volley frequency, while
        // per-volley charge compensates to keep full-focus time readable.
        gateCharge: gatePhase
          ? (36.5 * form.gate * (1 + mastery * 0.035) * fireCadence()) / count
          : 0,
        dead: false,
        age: 0,
        stamp: p.stampTimer > 0,
      });
    }
    sfx(
      p.form === "drum" ? "drum" : "shot",
      0.13 + Math.min(0.2, count / 100),
      1 + p.power * 0.015,
    );
  }

  function spawnEnemyShot(enemy, kind = "paperBomb") {
    const targetNx = clamp(state.player.nx + state.spawnRng.range(-0.06, 0.06), 0.07, 0.93);
    const startY = enemy.y + (enemy.radius || 12);
    const vy = (kind === "bossFire" ? 196 : 176) * clamp(state.viewH / 720, 0.84, 1.16);
    const travel = clamp((state.layout.playerY - startY) / Math.max(1, vy), 0.72, 3.2);
    state.enemyShots.push({
      kind,
      nx: enemy.nx,
      x: nxToX(enemy.nx),
      y: startY,
      targetNx,
      vx: (targetNx - enemy.nx) / travel,
      vy,
      radius: kind === "bossFire" ? 15 : 11,
      damage: Math.ceil((kind === "bossFire" ? 5 : 3) * modeRules().enemyDamage),
      dead: false,
      nearChecked: false,
      age: 0,
    });
    state.hazards.push({
      kind: "target",
      nx: targetNx,
      x: nxToX(targetNx),
      y: state.layout.playerY,
      radius: 34,
      life: travel,
      maxLife: travel,
      dead: false,
    });
  }

  function spiralIntercept(shot) {
    const p = state.player;
    if (!p || p.form !== "spiral") return false;
    const mastery = p.mastery.spiral;
    const orbit = 44 + mastery * 7;
    const dx = shot.x - p.x;
    const dy = shot.y - p.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (Math.abs(d - orbit) < shot.radius + 13 + mastery * 2) {
      shot.dead = true;
      addMomentum(3.5, "destroy");
      addScore(35, shot.nx, shot.y, t("canvas.float.cut"));
      addParticle(shot.nx, shot.y, COLORS.green, 9, 0.8);
      sfx("shield", 0.45, 1.3);
      return true;
    }
    return false;
  }

  function activateStamp(manual = true) {
    const p = state.player;
    if (!p || p.momentum < 100 || !["playing", "boss", "transition"].includes(state.mode))
      return false;
    p.momentum = 0;
    p.readyTime = 0;
    p.stampTimer = 2.25;
    if (p.charms.includes("echo")) p.echoTimer = 3.25;
    state.stats.stampUses++;
    if (manual) state.stats.manualStamps++;
    else state.stats.autoStamps++;
    state.shake = reducedMotion() ? 3 : 15;
    state.flash = 0.55;
    state.hitStop = reducedMotion() ? 0 : 0.06;
    sfx("stamp", 1);
    haptic([55, 25, 80]);

    for (const shot of state.enemyShots) {
      if (!shot.dead) {
        shot.dead = true;
        addScore(20, shot.nx, shot.y, t("canvas.float.purify"));
      }
    }
    for (const hazard of state.hazards) if (hazard.kind !== "target") hazard.dead = true;
    for (const enemy of state.enemies) {
      if (enemy.dead) continue;
      if (enemy.isBoss)
        applyBossRawDamage(enemy, enemy.maxHp * (state.difficulty === "hard" ? 0.055 : 0.07));
      else if (["chaff", "fast", "mite"].includes(enemy.kind)) enemy.hp = 0;
      else enemy.hp -= Math.max(28, enemy.maxHp * 0.42);
      enemy.flash = 0.22;
      enemy.y -= 28;
    }
    addParticle(p.nx, p.y - 45, COLORS.red, 56, 1.65, "paper");
    addText(p.nx, p.y - 110, t("canvas.float.stamp"), COLORS.red, 1.0, 56, "world");
    updateControls();
    return true;
  }

  function hurtPlayer(amount, source, _nx, _y) {
    const p = state.player;
    if (!p || state.phase === "bossDefeat" || state.mode === "result" || p.invuln > 0) return;
    if (p.shield > 0) {
      p.shield--;
      p.invuln = 0.18;
      addText(p.nx, p.y - 72, t("canvas.float.ward"), COLORS.green, 0.6, 27, "world");
      addParticle(p.nx, p.y - 20, COLORS.green, 13, 0.8);
      sfx("shield", 0.8);
      haptic(18);
      announceCanvas("ward", { remaining: p.shield });
      return;
    }
    const before = p.count;
    p.count = Math.max(0, p.count - amount);
    const lost = before - p.count;
    state.stats.damageLost += lost;
    state.stats.deathCause = source;
    if (state.currentEncounter) state.currentEncounter.damaged = true;
    state.combo = 0;
    state.comboTimer = 0;
    p.invuln = 0.28;
    state.shake = reducedMotion() ? 2 : 10;
    state.flash = 0.28;
    addText(p.nx, p.y - 72, `-${lost}`, COLORS.red, 0.8, 31, "world");
    burstFollowers(p.nx, p.y - 10, Math.max(6, lost));
    sfx("hurt", 0.9);
    haptic([35, 25, 35]);
    announceCanvas("damage", { lost, remaining: p.count });

    if (p.count <= 0 && p.charms.includes("crane") && !p.craneUsed) {
      p.craneUsed = true;
      p.count = 1;
      p.shield = Math.min(p.maxShield, 3);
      p.invuln = 1.5;
      addText(p.nx, p.y - 110, t("canvas.float.crane"), COLORS.white, 1.2, 44, "world");
      addParticle(p.nx, p.y - 25, COLORS.white, 32, 1.2);
      return;
    }
    if (p.count <= 0) endRun(false, source);
  }

  function killEnemy(enemy, byStamp = false) {
    if (enemy.dead) return;
    enemy.dead = true;
    state.stats.kills++;
    state.combo++;
    state.comboTimer = 1.5;
    const style = ENEMY_STYLE[enemy.kind] || ENEMY_STYLE.chaff;
    addScore(enemy.score, enemy.nx, enemy.y);
    addMomentum(
      enemy.isBoss
        ? 28
        : ["armor", "shield", "thrower", "charger", "drummer"].includes(enemy.kind)
          ? 5
          : 2.1,
      "destroy",
    );
    addParticle(
      enemy.nx,
      enemy.y,
      style.ink,
      enemy.isBoss ? 70 : 12,
      enemy.isBoss ? 1.8 : 0.75,
      "paper",
    );
    const priority = ["armor", "shield", "thrower", "charger", "drummer"].includes(enemy.kind);
    if (priority) state.stats.priorityKills++;
    if (
      !enemy.isBoss &&
      priority &&
      state.player.charms.includes("banner") &&
      state.player.bannerWaveRestores < 3
    ) {
      const before = state.player.count;
      state.player.count = Math.min(
        state.player.maxCount,
        state.player.count + (state.difficulty === "hard" ? 1 : 2),
      );
      if (state.player.count > before) {
        state.player.bannerWaveRestores++;
        state.stats.bannerRestores += state.player.count - before;
        addText(
          enemy.nx,
          enemy.y + 20,
          t("canvas.float.banner", { value: state.player.count - before }),
          COLORS.indigo,
          0.55,
          18,
          "world",
        );
      }
    }
    if (enemy.kind === "splitter" && !byStamp) {
      spawnMite(enemy.nx, enemy.y, -1);
      spawnMite(enemy.nx, enemy.y, 1);
    }
    if (enemy.isBoss) bossDefeated();
    else sfx("kill", 0.3, 1 + Math.min(0.35, state.combo * 0.008));
  }

  function bossPatternRequirement(boss) {
    if (!boss || !boss.isBoss) return 0;
    if (boss.bossType === "dragon") {
      // The last boss must read as a climax rather than a build-stat receipt.
      // Normal shows one full lesson, then two confirmations. Hard asks the
      // player to survive alternate versions of the second and final tests.
      if (state.difficulty === "hard") return boss.phaseStage === 0 ? 2 : 3;
      return boss.phaseStage === 0 ? 1 : 2;
    }
    if (state.difficulty === "hard" && boss.bossType === "cart" && boss.phaseStage === 2) return 2;
    return 1;
  }

  function bossDamageFloor(boss) {
    if (!boss || !boss.isBoss) return 0;
    if (boss.phaseStage === 0) return boss.maxHp * 0.67;
    if (boss.phaseStage === 1) return boss.maxHp * 0.34;
    return boss.attacksInStage < bossPatternRequirement(boss) ? 1 : 0;
  }

  function applyBossRawDamage(boss, amount) {
    if (!boss || boss.dead || boss.lockTime > 0 || boss.stageLock > 0 || boss.attackPending)
      return 0;
    const floor = bossDamageFloor(boss);
    const before = boss.hp;
    boss.hp = Math.max(floor, boss.hp - amount);
    return before - boss.hp;
  }

  function spawnBoss() {
    const type = actData().boss;
    const hpBase = { cart: 2200, mask: 4700, dragon: 8500 }[type];
    const hp = hpBase * modeRules().bossHp;
    const deadlineBase = { cart: 42, mask: 50, dragon: 62 }[type];
    const boss = {
      id: `${state.generation}:boss:${state.act}`,
      kind: "boss",
      isBoss: true,
      bossType: type,
      nx: 0.5,
      baseNx: 0.5,
      x: nxToX(0.5),
      y: state.layout.track.top + 92,
      radius: type === "dragon" ? 60 : type === "mask" ? 55 : 54,
      hp,
      maxHp: hp,
      speed: 0,
      damage: Math.ceil((7 + state.act * 2) * modeRules().enemyDamage),
      score: 1700 * state.act * (state.difficulty === "hard" ? 1.35 : 1),
      phase: 0,
      phaseStage: 0,
      flash: 0,
      dead: false,
      attackTimer: 0.12,
      attackIndex: 0,
      attacksInStage: 0,
      attackPending: true,
      openLane: state.gameplayRng.chance(0.5) ? "left" : "right",
      shieldShift: 1.2,
      lockTime: 0.74,
      stageLock: 0,
      enteredAt: state.runTime,
      fightTime: 0,
      rage: 0,
      pressureStage: 0,
      deadline: deadlineBase * (state.difficulty === "hard" ? 0.92 : 1),
      homeY: state.layout.track.top + 92,
    };
    state.boss = boss;
    state.enemies.push(boss);
    state.mode = "boss";
    setPhase("bossFight");
    addText(
      0.5,
      state.viewH * 0.31,
      `${state.difficulty === "hard" ? t("canvas.hardPrefix") : ""}${t(`boss.${type}`)}`,
      COLORS.redDark,
      1.15,
      43,
      "center",
    );
    updateControls();
  }

  function spawnSweep(lane, width = 0.34, delay = 0.78, damage = 6) {
    const center = lane === "left" ? 0.25 : lane === "right" ? 0.75 : lane;
    const active = state.difficulty === "hard" ? 0.42 : 0.46;
    state.hazards.push({
      kind: "sweep",
      nx: center,
      x: nxToX(center),
      width,
      life: delay + active,
      maxLife: delay + active,
      warning: delay,
      active,
      damage,
      hit: false,
      dead: false,
    });
  }

  function bossAttack(boss) {
    boss.attackIndex++;
    boss.attacksInStage++;
    boss.attackPending = false;
    const hard = state.difficulty === "hard";
    const stage = boss.phaseStage;
    state.stats.bossPatterns.push(`${boss.bossType}:${stage}:${boss.attackIndex}`);

    if (boss.bossType === "cart") {
      if (stage === 0) {
        const lane = boss.attackIndex % 2 ? "left" : "right";
        spawnSweep(lane, 0.38, hard ? 0.66 : 0.82, 6);
        const flank = lane === "left" ? 0.72 : 0.28;
        for (let i = 0; i < (hard ? 4 : 3); i++)
          spawnEnemy({
            kind: "fast",
            nx: clamp(flank + (i - 1.5) * 0.065, 0.08, 0.92),
            scale: 1.02 + state.act * 0.04,
            phase: i,
            depth: 0.03,
          });
        if (hard) spawnEnemy({ kind: "charger", nx: flank, scale: 1.06, aim: 0.62, depth: 0.04 });
      } else if (stage === 1) {
        spawnSweep("left", 0.28, hard ? 0.64 : 0.78, 6);
        spawnSweep("right", 0.28, hard ? 0.94 : 1.1, 6);
        for (let i = 0; i < 4; i++)
          spawnEnemy({ kind: "fast", nx: 0.36 + i * 0.09, scale: 1.06, phase: i, depth: 0.04 });
        if (hard) spawnEnemy({ kind: "charger", nx: 0.5, scale: 1.1, aim: 0.58, depth: 0.05 });
      } else {
        spawnSweep(0.5, 0.22, hard ? 0.58 : 0.72, 7);
        const side = boss.attackIndex % 2 ? "left" : "right";
        spawnSweep(side, 0.3, hard ? 0.92 : 1.12, 7);
        spawnEnemy({
          kind: "charger",
          nx: side === "left" ? 0.72 : 0.28,
          scale: 1.15,
          aim: hard ? 0.55 : 0.68,
          depth: 0.06,
        });
        if (hard)
          for (let i = 0; i < 4; i++)
            spawnEnemy({
              kind: "fast",
              nx: i % 2 ? 0.18 : 0.82,
              scale: 1.1,
              phase: i,
              depth: 0.02,
            });
      }
      boss.attackTimer = hard ? 1.74 : 2.15;
    } else if (boss.bossType === "mask") {
      boss.openLane = boss.openLane === "left" ? "right" : "left";
      boss.shieldShift = 0.58;
      const closed = boss.openLane === "left" ? "right" : "left";
      spawnSweep(closed, stage === 2 ? 0.36 : 0.31, hard ? 0.66 : 0.86, 5 + stage);
      if (stage >= 1) spawnSweep(0.5, 0.16, hard ? 0.92 : 1.16, 5 + stage);
      const shots = (hard ? 3 : 2) + (stage === 2 ? 1 : 0);
      for (let i = 0; i < shots; i++)
        spawnEnemyShot(
          { nx: 0.2 + i * (0.6 / Math.max(1, shots - 1)), y: boss.y + 22, radius: 12 },
          "bossFire",
        );
      if (stage === 2)
        spawnEnemy({
          kind: hard ? "charger" : "fast",
          nx: boss.openLane === "left" ? 0.28 : 0.72,
          scale: 1.18,
          aim: 0.62,
          depth: 0.05,
        });
      boss.attackTimer = hard ? 1.82 : 2.3;
    } else {
      if (stage === 0) {
        const first = boss.attackIndex % 2 ? "left" : "right";
        const second = first === "left" ? "right" : "left";
        spawnSweep(first, 0.29, hard ? 0.66 : 0.8, 7);
        spawnSweep(second, 0.29, hard ? 0.94 : 1.12, 7);
        for (let i = 0; i < (hard ? 4 : 3); i++)
          spawnEnemyShot(
            { nx: 0.24 + i * (0.52 / Math.max(1, hard ? 3 : 2)), y: boss.y + 30, radius: 12 },
            "bossFire",
          );
      } else if (stage === 1) {
        const alternate = boss.attacksInStage % 2 === 0;
        if (!alternate) {
          const shots = hard ? 7 : 5;
          for (let i = 0; i < shots; i++)
            spawnEnemyShot(
              { nx: 0.1 + i * (0.8 / (shots - 1)), y: boss.y + 30, radius: 12 },
              "bossFire",
            );
          spawnEnemy({
            kind: "charger",
            nx: boss.attackIndex % 2 ? 0.28 : 0.72,
            scale: 1.18,
            aim: hard ? 0.56 : 0.68,
            depth: 0.04,
          });
          if (hard) spawnSweep(0.5, 0.17, 0.92, 7);
        } else {
          const first = boss.attackIndex % 2 ? "left" : "right";
          const second = first === "left" ? "right" : "left";
          spawnSweep(first, 0.35, hard ? 0.6 : 0.78, 7);
          spawnSweep(second, 0.35, hard ? 0.96 : 1.14, 7);
          spawnEnemy({
            kind: "shield",
            nx: first === "left" ? 0.72 : 0.28,
            scale: 1.2,
            shieldSide: first === "left" ? -1 : 1,
            depth: 0.05,
          });
          if (hard)
            spawnEnemy({
              kind: "charger",
              nx: first === "left" ? 0.28 : 0.72,
              scale: 1.16,
              aim: 0.58,
              depth: 0.03,
            });
        }
      } else {
        const alternate = boss.attacksInStage % 2 === 0;
        if (!alternate) {
          spawnEnemy({ kind: "armor", nx: 0.28, scale: 1.36, depth: 0.04 });
          spawnEnemy({ kind: "shield", nx: 0.72, scale: 1.36, shieldSide: -1, depth: 0.04 });
          spawnEnemy({
            kind: "drummer",
            nx: 0.5,
            scale: 1.24,
            holdDepth: 0.26,
            pulses: hard ? 2 : 1,
            depth: 0.02,
          });
          for (let i = 0; i < (hard ? 6 : 4); i++)
            spawnEnemy({ kind: "fast", nx: i % 2 ? 0.2 : 0.8, scale: 1.24, phase: i, depth: 0.04 });
          spawnSweep(0.5, 0.18, hard ? 0.7 : 0.94, 8);
        } else {
          const shots = hard ? 6 : 4;
          for (let i = 0; i < shots; i++)
            spawnEnemyShot(
              { nx: 0.14 + i * (0.72 / Math.max(1, shots - 1)), y: boss.y + 30, radius: 12 },
              "bossFire",
            );
          spawnSweep("left", 0.25, hard ? 0.62 : 0.82, 8);
          spawnSweep("right", 0.25, hard ? 0.96 : 1.16, 8);
          spawnEnemy({
            kind: "charger",
            nx: 0.3,
            scale: 1.24,
            aim: hard ? 0.54 : 0.66,
            depth: 0.04,
          });
          spawnEnemy({
            kind: "charger",
            nx: 0.7,
            scale: 1.24,
            aim: hard ? 0.54 : 0.66,
            depth: 0.04,
          });
        }
      }
      boss.attackTimer = hard
        ? Math.max(1.48, 1.92 - stage * 0.12)
        : Math.max(1.78, 2.28 - stage * 0.16);
    }
    sfx("boss", 0.34, 1 + stage * 0.08);
  }

  function updateBoss(boss, dt) {
    if (!boss || boss.dead) return;
    boss.fightTime += dt;
    boss.rage = clamp((boss.fightTime - boss.deadline * 0.55) / (boss.deadline * 0.45), 0, 1);
    boss.lockTime = Math.max(0, boss.lockTime - dt);
    boss.stageLock = Math.max(0, boss.stageLock - dt);
    boss.shieldShift = Math.max(0, boss.shieldShift - dt);

    if (boss.rage >= 0.52 && boss.pressureStage < 1) {
      boss.pressureStage = 1;
      addText(
        boss.nx,
        boss.y + boss.radius + 48,
        t("canvas.float.pressure"),
        COLORS.redDark,
        0.95,
        34,
        "world",
      );
      sfx("boss", 0.7, 0.72);
    }
    if (boss.fightTime >= boss.deadline && boss.pressureStage < 2) {
      boss.pressureStage = 2;
      boss.attackTimer = Math.min(boss.attackTimer, 0.22);
      addText(
        boss.nx,
        boss.y + boss.radius + 54,
        t("canvas.float.oniPressure"),
        COLORS.redDark,
        1.15,
        42,
        "world",
      );
      state.shake = Math.max(state.shake, 10);
      sfx("boom", 0.8, 0.7);
      haptic([45, 25, 55]);
    }

    const press = clamp(
      (boss.fightTime - boss.deadline) / (state.difficulty === "hard" ? 10 : 12),
      0,
      1,
    );
    boss.y = lerp(boss.homeY, state.layout.playerY - boss.radius - 34, press * press);
    if (press >= 1 && state.phase === "bossFight") {
      hurtPlayer(Math.max(12, state.player.count), "press", boss.nx, state.player.y);
      return;
    }

    const t = state.simTime * modeRules().bossSpeed;
    if (boss.bossType === "cart") boss.nx = 0.5 + Math.sin(t * 0.82) * 0.27;
    else if (boss.bossType === "mask") boss.nx = 0.5 + Math.sin(t * 0.42) * 0.08;
    else boss.nx = 0.5 + Math.sin(t * 1.06) * 0.29;
    boss.x = nxToX(boss.nx);

    const epsilon = boss.maxHp * 0.001;
    const atFold =
      boss.phaseStage === 0
        ? boss.hp <= boss.maxHp * 0.67 + epsilon
        : boss.phaseStage === 1
          ? boss.hp <= boss.maxHp * 0.34 + epsilon
          : false;
    const shouldAdvance = atFold && boss.attacksInStage >= bossPatternRequirement(boss);
    if (shouldAdvance) {
      boss.phaseStage++;
      boss.stageLock = state.difficulty === "hard" ? 0.42 : 0.5;
      boss.attackPending = true;
      boss.attacksInStage = 0;
      boss.attackTimer = 0.04;
      state.shake = reducedMotion() ? 2 : 11;
      state.flash = 0.32;
      addText(
        boss.nx,
        boss.y + 64,
        t("canvas.float.fold", { value: boss.phaseStage + 1 }),
        COLORS.ochre,
        0.9,
        28,
        "world",
      );
      sfx("tier", 0.75, 0.8 + boss.phaseStage * 0.12);
    }

    boss.attackTimer -= dt * modeRules().bossSpeed * (1 + boss.rage * 0.92);
    if (boss.attackTimer <= 0 && boss.lockTime <= 0 && boss.stageLock <= 0) bossAttack(boss);
  }

  function bossDefeated() {
    const boss = state.boss;
    if (!boss || state.phase === "bossDefeat") return;
    const time = state.runTime - boss.enteredAt;
    state.stats.bossTimes.push(time);
    state.score += Math.round(
      (2400 * state.act + Math.max(0, 1900 - time * 48)) * (state.difficulty === "hard" ? 1.35 : 1),
    );
    state.sealsEarned += Math.ceil(
      (1 + (time < (state.difficulty === "hard" ? 18 : 15) ? 1 : 0)) * modeRules().sealScale,
    );
    state.enemyShots.length = 0;
    state.hazards.length = 0;
    for (const e of state.enemies) if (!e.isBoss) e.dead = true;
    state.mode = "transition";
    setPhase("bossDefeat", state.difficulty === "hard" ? 1.38 : 1.48);
    state.shake = reducedMotion() ? 3 : 16;
    state.flash = 0.6;
    sfx("boom", 1.1);
    haptic([60, 30, 90]);
    updateControls();
  }

  function selectCharm(id) {
    if (state.mode !== "choice" || !CHARM_POOL[id]) return;
    if (!state.player.charms.includes(id)) state.player.charms.push(id);
    if (id === "knot") addMomentum(10, "charm");
    sfx("choice", 0.8);
    haptic(24);
    state.act++;
    state.stats.actReached = state.act;
    state.encounterIndex = 0;
    state.bossPrepared = false;
    state.encounters = makeActEncounters(state.act);
    if (state.player.charms.includes("rice")) {
      const before = state.player.count;
      state.player.count = Math.min(
        state.player.maxCount,
        state.player.count + Math.ceil(state.player.maxCount * 0.1),
      );
      if (state.player.count > before)
        addText(
          0.5,
          state.viewH * 0.52,
          t("canvas.float.rice", { value: state.player.count - before }),
          COLORS.green,
          0.9,
          27,
          "center",
        );
    }
    state.player.shield = Math.min(state.player.maxShield, state.player.shield + 1);
    state.mode = "playing";
    showOverlay(null);
    setPhase("actIntro", state.difficulty === "hard" ? 1.28 : 1.4);
    addText(
      0.5,
      state.viewH * 0.43,
      `${hardPrefix()}${actSubtitle()}`,
      COLORS.redDark,
      1.3,
      38,
      "center",
    );
    updateControls();
  }

  function makeCharmOptions() {
    const owned = new Set(state.player.charms);
    const available = Object.keys(CHARM_POOL).filter((id) => !owned.has(id));
    const defense = available.filter((id) => ["bell", "rice", "crane"].includes(id));
    const gate = available.filter((id) => ["knot", "ink"].includes(id));
    const action = available.filter((id) => ["fox", "echo"].includes(id));
    const recovery = available.filter((id) => ["banner", "rice", "bell"].includes(id));
    const synergyMap = {
      fan: ["banner", "ink", "echo"],
      spear: ["banner", "echo", "knot"],
      spiral: ["fox", "bell", "echo"],
      drum: ["fox", "banner", "ink"],
    };
    const synergy = available.filter((id) => (synergyMap[state.player.form] || []).includes(id));
    const chosen = [];
    const take = (pool) => {
      const candidates = pool.filter((id) => !chosen.includes(id));
      if (candidates.length) chosen.push(state.gameplayRng.pick(candidates));
    };
    const fragile =
      state.player.count < (state.difficulty === "hard" ? 42 : 34) ||
      state.player.shield <= (state.difficulty === "hard" ? 1 : 0);
    take(synergy.length ? synergy : action);
    take(fragile ? defense.concat(recovery) : gate.concat(action));
    take(available);
    while (chosen.length < 3 && available.length) take(available);
    return chosen.slice(0, 3);
  }

  function charmVisualMarkup(id, charm) {
    return `<span class="charm-visual" aria-hidden="true"><span class="charm-icon">${charm.icon}</span><span class="charm-demo demo-${id}"><i></i><i></i><i></i><b></b><em></em></span></span>`;
  }

  function showCharmChoice() {
    state.enemies.length = 0;
    state.bullets.length = 0;
    state.enemyShots.length = 0;
    state.hazards.length = 0;
    state.gates.length = 0;
    state.boss = null;
    state.mode = "choice";
    showOverlay("choice");
    announceCanvas("upgrade");
    UI.choiceActLabel.textContent = t("choice.act", {
      hard: state.difficulty === "hard" ? t("canvas.hardPrefix") : "",
      act: t(`act.number.${state.act}`),
    });
    UI.choiceList.innerHTML = "";
    const options = makeCharmOptions();
    options.forEach((id) => {
      const charm = CHARM_POOL[id];
      const button = document.createElement("button");
      button.type = "button";
      button.className = "charm-card";
      button.dataset.charm = id;
      button.innerHTML = `${charmVisualMarkup(id, charm)}<h3>${t(charm.nameKey)}</h3><p>${t(charm.descKey)}</p><span class="charm-pips" aria-hidden="true"><i></i><i></i><i></i></span>`;
      UI.choiceList.appendChild(button);
    });
    uiProjection.focusOverlay("choice", UI.choiceList.querySelector("button"));
    updateControls();
  }

  function deathCauseText(cause) {
    if (cause === null || cause === undefined) return t("death.unknown");
    const key = {
      chaff: "death.chaff",
      fast: "death.fast",
      armor: "death.armor",
      shield: "death.shield",
      thrower: "death.thrower",
      splitter: "death.splitter",
      charger: "death.charger",
      drummer: "death.drummer",
      mite: "death.mite",
      paperBomb: "death.paperBomb",
      bossFire: "death.bossFire",
      sweep: "death.sweep",
      boss: "death.boss",
      press: "death.press",
    }[cause];
    if (!key) throw new RangeError(`Unknown Kamifuda defeat cause: ${String(cause)}`);
    return t(key);
  }

  function gradeResult(clear) {
    if (!clear) return state.stats.actReached >= 3 ? "vermilion" : "wood";
    const perfectRatio = state.stats.waves ? state.stats.wavesNoHit / state.stats.waves : 0;
    const gateRatio = state.stats.gateHistory.length
      ? state.stats.tier3Gates / state.stats.gateHistory.length
      : 0;
    const scoreTarget = state.difficulty === "hard" ? 105000 : 70000;
    const measure =
      perfectRatio * 1.9 +
      gateRatio * 1.45 +
      Math.min(1.55, (state.score / scoreTarget) * 1.55) +
      Math.min(0.82, state.stats.manualStamps * 0.15);
    const gold = state.difficulty === "hard" ? 4.55 : 4.28;
    const silver = state.difficulty === "hard" ? 3.18 : 2.92;
    const goldStamps = state.difficulty === "hard" ? 6 : 3;
    const goldGateRatio = state.difficulty === "hard" ? 0.72 : 0.66;
    const mastered = state.stats.manualStamps >= goldStamps && gateRatio >= goldGateRatio;
    return measure >= gold && mastered ? "gold" : measure >= silver ? "silver" : "vermilion";
  }

  function endRun(clear, cause = null) {
    if (state.result || state.mode === "result") return;
    state.stats.deathCause = clear ? null : cause || state.stats.deathCause;
    const grade = gradeResult(clear);
    state.result = {
      clear,
      cause: clear ? null : state.stats.deathCause,
      grade,
      score: Math.round(state.score),
      time: state.runTime,
      finalized: false,
    };
    state.mode = "transition";
    setPhase("resultDelay", clear ? 1.0 : 0.82);
    state.enemies.length = 0;
    state.enemyShots.length = 0;
    state.hazards.length = 0;
    state.gates.length = 0;
    sfx(clear ? "choice" : "fail", clear ? 1 : 0.8, clear ? 1.2 : 0.65);
    updateControls();
  }

  function unlockSkins() {
    for (const skin of SKINS) {
      if (skin.hardOnly) continue;
      if (
        state.profile.records.totalSeals >= skin.cost &&
        !state.profile.unlocks.skins.includes(skin.id)
      )
        state.profile.unlocks.skins.push(skin.id);
    }
  }

  function refreshModeButtons() {
    const unlocked = !!state.profile.unlocks.hard;
    UI.hardStart.classList.toggle("is-locked", !unlocked);
    UI.hardStart.setAttribute(
      "aria-label",
      t(unlocked ? "title.hardStartLabel" : "title.hardLockedLabel"),
    );
    UI.hardHint.textContent = t(unlocked ? "title.hardUnlocked" : "title.hardLocked");
  }

  function renderResult(r) {
    const openedHard = r.openedHard === true;
    UI.resultSeal.textContent = t(
      r.clear
        ? state.difficulty === "hard"
          ? "grade.vermilion"
          : "result.sealComplete"
        : "result.sealScattered",
    );
    UI.resultMode.textContent = t(modeRules().labelKey);
    UI.resultMode.classList.toggle("is-hard", state.difficulty === "hard");
    UI.resultKicker.textContent = r.clear
      ? t("result.clearKicker", { mode: t(modeRules().labelKey) })
      : t("result.failKicker", { act: actSubtitle(Math.min(3, state.stats.actReached)) });
    UI.resultTitle.textContent = r.clear
      ? t(
          openedHard
            ? "result.hardOpened"
            : state.difficulty === "hard"
              ? "result.hardClear"
              : "result.clear",
        )
      : t("result.fail");
    UI.resultGrade.textContent = t(`grade.${r.grade}`);
    UI.resultStats.innerHTML = `
      <div class="result-stat"><b>${pretty(r.score)}</b><span>${t("result.score")}</span></div>
      <div class="result-stat"><b>${Math.floor(r.time / 60)}:${String(Math.floor(r.time % 60)).padStart(2, "0")}</b><span>${t("result.time")}</span></div>
      <div class="result-stat"><b>${state.stats.wavesNoHit}/${state.stats.waves}</b><span>${t("result.noHit")}</span></div>
      <div class="result-stat"><b>+${r.seals}</b><span>${t("result.seals")}</span></div>`;
    UI.resultCause.textContent = r.clear
      ? t("result.summary", {
          unlock: openedHard ? t("result.unlockPrefix") : "",
          gates: state.stats.tier3Gates,
          stamps: state.stats.manualStamps,
        })
      : deathCauseText(r.cause);
  }

  function finalizeResult() {
    const r = state.result;
    if (!r || r.finalized) return;
    r.finalized = true;
    const gradeIndex = Math.max(0, GRADE_ORDER.indexOf(r.grade));
    const gained = Math.max(
      1,
      Math.round((state.sealsEarned + gradeIndex) * modeRules().sealScale),
    );
    r.seals = gained;
    const rec = currentRecord();
    rec.best = Math.max(rec.best, r.score);
    rec.bestGrade = GRADE_ORDER.indexOf(rec.bestGrade) >= gradeIndex ? rec.bestGrade : r.grade;
    rec.bestAct = Math.max(rec.bestAct, state.stats.actReached);
    state.profile.records.totalSeals += gained;
    let openedHard = false;
    if (r.clear) {
      rec.clears++;
      rec.bestTime = rec.bestTime > 0 ? Math.min(rec.bestTime, r.time) : r.time;
      if (state.difficulty === "normal" && !state.profile.unlocks.hard) {
        state.profile.unlocks.hard = true;
        openedHard = true;
      }
      if (state.difficulty === "hard" && !state.profile.unlocks.skins.includes("ember"))
        state.profile.unlocks.skins.push("ember");
    }
    unlockSkins();
    saveProfile();
    refreshModeButtons();
    r.openedHard = openedHard;
    renderResult(r);
    announceCanvas("result", { clear: r.clear, score: r.score, cause: r.cause });
    state.mode = "result";
    showOverlay("result");
    updateControls();
  }

  function updatePlayer(dt) {
    const p = state.player;
    if (!p) return;
    if (input.left) p.targetNx -= dt * (0.72 + p.tempo * 0.08);
    if (input.right) p.targetNx += dt * (0.72 + p.tempo * 0.08);
    if (input.active) p.targetNx = input.targetNx;
    const edge = clamp(playerFootprint() / state.layout.track.width + 0.018, 0.045, 0.24);
    p.targetNx = clamp(p.targetNx, edge, 1 - edge);
    const before = p.nx;
    p.nx = expLerp(p.nx, p.targetNx, 14 + p.tempo * 1.7, dt);
    p.x = nxToX(p.nx);
    p.targetX = nxToX(p.targetNx);
    p.y = state.layout.playerY;
    p.moving = expLerp(
      p.moving,
      clamp((Math.abs(p.nx - before) / Math.max(dt, 0.001)) * 1.8, 0, 1),
      9,
      dt,
    );
    p.invuln = Math.max(0, p.invuln - dt);
    p.stampTimer = Math.max(0, p.stampTimer - dt);
    p.echoTimer = Math.max(0, p.echoTimer - dt);
    state.comboTimer = Math.max(0, state.comboTimer - dt);
    if (state.comboTimer <= 0) state.combo = Math.max(0, state.combo - dt * 6);

    if (p.momentum >= 100) {
      p.readyTime += dt;
      const liveDanger =
        ["combat", "bossFight"].includes(state.phase) &&
        (state.enemies.some((enemy) => !enemy.dead) ||
          state.enemyShots.some((shot) => !shot.dead) ||
          state.hazards.some((hazard) => !hazard.dead && hazard.kind !== "target"));
      if (modeRules().autoStamp && p.readyTime > 8.5 && liveDanger) activateStamp(false);
    } else p.readyTime = 0;

    const canShoot = ["gate", "combat", "bossFight"].includes(state.phase);
    if (canShoot) {
      p.fireTimer -= dt;
      while (p.fireTimer <= 0) {
        spawnVolley();
        p.fireTimer += fireCadence();
      }
    } else p.fireTimer = Math.min(p.fireTimer, 0.08);

    if (state.phase === "gate" && state.gates.length) {
      const previous = state.focusGateId;
      let lane = state.gates.find((g) => g.id === previous)?.lane || null;
      const dead = state.difficulty === "hard" ? 0.065 : 0.055;
      if (p.nx < 0.5 - dead) lane = "left";
      else if (p.nx > 0.5 + dead) lane = "right";
      else lane = null;
      const focus = lane ? state.gates.find((g) => g.lane === lane) : null;
      state.focusGateId = focus?.id || null;
      if (previous && state.focusGateId && previous !== state.focusGateId)
        state.stats.focusSwitches++;
      state.gates.forEach((g) => {
        g.selected = g.id === state.focusGateId;
      });
    }
  }

  function updateGatePhase(dt) {
    const t = clamp(state.phaseTimer / state.phaseDuration, 0, 1);
    const topY = state.layout.track.top + state.layout.gateH * 0.55;
    const endY = state.layout.playerY + state.layout.gateH * 0.66;
    const y = lerp(topY, endY, t);
    for (const gate of state.gates) {
      gate.y = y;
      gate.x = nxToX(gate.nx);
      if (!gate.selected && gate.charge > 0) {
        const before = gate.charge;
        gate.charge = Math.max(0, gate.charge - modeRules().gateDecay * dt);
        state.stats.gateChargeWaste += before - gate.charge;
      }
      gate.tier = chargeTier(gate.charge);
      if (gate.tier < gate.previousTier) gate.previousTier = gate.tier;
      if (gate.tier > gate.previousTier) {
        gate.previousTier = gate.tier;
        sfx("tier", 0.62, 0.9 + gate.tier * 0.12);
        haptic(gate.selected ? 12 : 0);
        addParticle(gate.nx, gate.y, gate.option.style.color, 8 + gate.tier * 3, 0.55);
      }
    }
    if (t >= 1) resolveGate();
  }

  function spawnScheduleEvent(event) {
    if (event.type === "enemy") {
      spawnEnemy(event);
      return;
    }
    if (event.type === "sweep") {
      spawnSweep(
        event.lane,
        event.width,
        event.warning,
        Math.ceil(event.damage * modeRules().enemyDamage),
      );
      return;
    }
    if (event.type === "beat") {
      state.currentEncounter.lastBeat = event.index;
      state.stats.beatsSeen++;
      const mark = t(`canvas.beat.${event.index + 1}`);
      addText(
        0.5,
        state.layout.hudH + 122,
        mark,
        state.act === 3 ? COLORS.paperHi : COLORS.ochreDark,
        0.48,
        23,
        "center",
      );
      sfx("click", 0.25, 1 + event.index * 0.08);
    }
  }

  function updateWaveSpawner(dt) {
    const encounter = state.currentEncounter;
    if (!encounter || !encounter.schedule) return;
    const liveEnemies = state.enemies.reduce(
      (n, enemy) => n + (!enemy.dead && !enemy.isBoss ? 1 : 0),
      0,
    );
    const liveDanger =
      state.enemyShots.reduce((n, shot) => n + (!shot.dead ? 1 : 0), 0) +
      state.hazards.reduce(
        (n, h) => n + (!h.dead && h.kind !== "target" && h.kind !== "chargeMark" ? 1 : 0),
        0,
      );
    const next = encounter.schedule[encounter.cursor];
    let pace = 1;
    if (liveEnemies + liveDanger > modeRules().concurrency) pace = modeRules().crowdedPace;
    else if (liveEnemies + liveDanger === 0 && next && next.t - encounter.elapsed > 0.48)
      pace = modeRules().emptyPace;
    encounter.elapsed += dt * pace;
    while (
      encounter.cursor < encounter.schedule.length &&
      encounter.schedule[encounter.cursor].t <= encounter.elapsed
    ) {
      spawnScheduleEvent(encounter.schedule[encounter.cursor++]);
    }
  }

  function damageEnemy(enemy, bullet) {
    if (enemy.dead) return false;
    let damage = bullet.damage;
    const p = state.player;

    if (enemy.isBoss) {
      if (enemy.lockTime > 0 || enemy.stageLock > 0 || enemy.attackPending) {
        addParticle(bullet.nx, bullet.y, COLORS.white, 2, 0.35);
        return true;
      }
      damage *= 0.82;
      if (enemy.bossType === "mask") {
        // The test is whether the player committed to the open half. Using
        // each projectile's spread here made wide/defensive formations lose
        // damage even after the player read the lane correctly.
        const playerLane = p.nx < 0.5 ? "left" : "right";
        if (playerLane !== enemy.openLane) {
          damage *= 0.09;
          addParticle(bullet.nx, bullet.y, COLORS.green, 3, 0.4);
          sfx("shield", 0.18, 1.25);
        }
      }
    }

    if (enemy.kind === "armor") {
      if (bullet.form === "spear") damage *= 2.45 + p.mastery.spear * 0.2;
      else damage *= 0.42;
    }
    if (enemy.kind === "shield" && enemy.shieldHp > 0) {
      const protectedSide = enemy.shieldSide < 0 ? bullet.nx < enemy.nx : bullet.nx > enemy.nx;
      if (protectedSide && bullet.form !== "spear" && bullet.form !== "drum") {
        enemy.shieldHp -= damage;
        damage = 0;
        addParticle(bullet.nx, bullet.y, COLORS.green, 3, 0.4);
      } else if (bullet.form === "spear") {
        enemy.shieldHp -= damage * 1.6;
        damage *= 0.8;
      } else if (bullet.form === "drum") {
        enemy.shieldHp -= damage * 2.2;
        damage *= 0.72;
      }
    }
    if (bullet.form === "fan" && ["chaff", "splitter", "mite"].includes(enemy.kind))
      damage *= 1.27 + p.mastery.fan * 0.06;
    if (bullet.stamp) damage *= 1.08;

    if (enemy.isBoss) damage = Math.min(damage, Math.max(0, enemy.hp - bossDamageFloor(enemy)));
    enemy.hp -= damage;
    enemy.flash = 0.09;
    state.stats.hits++;
    if (bullet.form === "drum" && !enemy.isBoss) {
      enemy.y -= 8 + p.mastery.drum * 4;
      const splash = FORM.drum.splash + p.mastery.drum * 10;
      for (const other of state.enemies) {
        if (other === enemy || other.dead || other.isBoss) continue;
        if (dist2(enemy.x, enemy.y, other.x, other.y) < splash * splash) {
          other.hp -= damage * 0.28;
          other.flash = 0.05;
          if (other.hp <= 0) killEnemy(other, bullet.stamp);
        }
      }
    }
    if (enemy.hp <= 0) killEnemy(enemy, bullet.stamp);
    return true;
  }

  function buildEnemyBuckets() {
    const buckets = new Map();
    const band = 84;
    for (const enemy of state.enemies) {
      if (enemy.dead) continue;
      const key = Math.floor(enemy.y / band);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(enemy);
    }
    return { buckets, band };
  }

  function updateBullets(dt) {
    const index = buildEnemyBuckets();
    for (const bullet of state.bullets) {
      if (bullet.dead) continue;
      bullet.age += dt;
      bullet.nx += bullet.vx * dt;
      bullet.x = nxToX(bullet.nx);
      bullet.y += bullet.vy * dt;

      if (bullet.gateId) {
        const gate = state.gates.find((g) => g.id === bullet.gateId && !g.dead);
        if (!gate) {
          bullet.dead = true;
          continue;
        }
        if (bullet.y <= gate.y + state.layout.gateH * 0.42) {
          const before = gate.charge;
          gate.charge = Math.min(gateThreshold(2) + 35, gate.charge + bullet.gateCharge);
          if (before >= gateThreshold(2)) {
            if (state.player.charms.includes("ink")) {
              addMomentum(bullet.gateCharge * 0.045, "overflow");
              addScore(bullet.gateCharge * 2);
            } else addMomentum(bullet.gateCharge * 0.012, "overflow");
          }
          bullet.dead = true;
          addParticle(gate.nx, gate.y + state.layout.gateH * 0.18, gate.option.style.color, 1, 0.3);
        }
        continue;
      }

      const key = Math.floor(bullet.y / index.band);
      let hit = false;
      for (let k = key - 1; k <= key + 1 && !hit; k++) {
        const list = index.buckets.get(k);
        if (!list) continue;
        for (const enemy of list) {
          if (enemy.dead) continue;
          const rr = enemy.radius + bullet.radius;
          if (dist2(bullet.x, bullet.y, enemy.x, enemy.y) <= rr * rr) {
            damageEnemy(enemy, bullet);
            if (bullet.pierce > 0) bullet.pierce--;
            else bullet.dead = true;
            hit = true;
            break;
          }
        }
      }
      if (
        bullet.y < state.layout.track.top - 80 ||
        bullet.nx < -0.16 ||
        bullet.nx > 1.16 ||
        bullet.age > 2.4
      )
        bullet.dead = true;
    }
    state.bullets = state.bullets.filter((b) => !b.dead);
  }

  function registerNearMiss(nx, y) {
    state.stats.nearMisses++;
    addMomentum(4.2, "near");
    addScore(45, nx, y, t("canvas.float.edge"));
    sfx("near", 0.34, 1.1);
  }

  function updateEnemies(dt) {
    const p = state.player;
    const footprint = playerFootprint();
    for (const enemy of state.enemies) {
      if (enemy.dead) continue;
      enemy.flash = Math.max(0, enemy.flash - dt);
      enemy.entryTimer = Math.max(0, (enemy.entryTimer || 0) - dt);
      if (enemy.hp <= 0) {
        killEnemy(enemy, true);
        continue;
      }
      if (enemy.isBoss) {
        updateBoss(enemy, dt);
        continue;
      }

      let moved = false;
      if (enemy.kind === "fast")
        enemy.nx = clamp(
          enemy.baseNx + Math.sin(state.simTime * 5.6 + enemy.phase) * 0.105,
          0.04,
          0.96,
        );
      else if (enemy.kind === "splitter")
        enemy.nx = clamp(
          enemy.baseNx + Math.sin(state.simTime * 2.2 + enemy.phase) * 0.035,
          0.04,
          0.96,
        );

      if (enemy.kind === "charger") {
        if (enemy.chargeState === "aim") {
          enemy.y += enemy.speed * 0.34 * dt;
          enemy.chargeTimer -= dt;
          if (!enemy.chargeMarked && enemy.chargeTimer <= 0.62) {
            enemy.chargeMarked = true;
            enemy.lockedNx = Number.isFinite(enemy.lockedNx)
              ? enemy.lockedNx
              : clamp(p.nx, 0.07, 0.93);
            state.hazards.push({
              kind: "chargeMark",
              sourceId: enemy.id,
              nx: enemy.lockedNx,
              x: nxToX(enemy.lockedNx),
              width: 0.13,
              life: 0.76,
              maxLife: 0.76,
              dead: false,
            });
            addText(
              enemy.lockedNx,
              p.y - 90,
              t("canvas.float.arrow"),
              COLORS.redDark,
              0.45,
              22,
              "world",
            );
            sfx("near", 0.24, 0.72);
          }
          if (enemy.chargeTimer <= 0) {
            enemy.chargeState = "dash";
            enemy.baseNx = Number.isFinite(enemy.lockedNx) ? enemy.lockedNx : enemy.nx;
            enemy.nx = enemy.baseNx;
            state.shake = Math.max(state.shake, reducedMotion() ? 1 : 3);
            sfx("drum", 0.28, 1.16);
          }
          moved = true;
        } else {
          enemy.nx = enemy.baseNx;
          enemy.y += enemy.dashSpeed * dt;
          moved = true;
        }
      } else if (enemy.kind === "drummer") {
        if (Number.isFinite(enemy.holdY) && enemy.y >= enemy.holdY && enemy.pulses > 0) {
          enemy.y = enemy.holdY;
          enemy.attackTimer -= dt;
          if (enemy.attackTimer <= 0) {
            spawnReinforcement(enemy);
            enemy.attackTimer = state.difficulty === "hard" ? 1.78 : 2.18;
          }
        } else {
          // A drummer is an interruptible tempo threat, not a permanent turret.
          // After its authored pulses it rejoins the procession so a narrow
          // formation cannot leave the encounter in a harmless soft-lock.
          enemy.y += enemy.speed * (enemy.pulses > 0 ? 1 : 1.22) * dt;
        }
        moved = true;
      } else if (
        enemy.kind === "thrower" &&
        Number.isFinite(enemy.holdY) &&
        enemy.y >= enemy.holdY &&
        enemy.pulses > 0
      ) {
        enemy.y = enemy.holdY;
        moved = true;
      }

      if (!moved) enemy.y += enemy.speed * dt;
      enemy.x = nxToX(enemy.nx);

      if (enemy.kind === "thrower") {
        const limitedVolley = Number.isFinite(enemy.holdY);
        if (!limitedVolley || enemy.pulses > 0) {
          enemy.attackTimer -= dt;
          if (enemy.attackTimer <= 0 && enemy.y < p.y - 124) {
            spawnEnemyShot(enemy);
            if (limitedVolley) enemy.pulses--;
            enemy.attackTimer = state.difficulty === "hard" ? 1.62 : 2.02;
          }
        }
      }

      if (enemy.y + enemy.radius >= p.y - 20) {
        const dx = Math.abs(enemy.x - p.x);
        if (dx <= footprint + enemy.radius * 0.55) {
          enemy.dead = true;
          hurtPlayer(enemy.damage, enemy.kind, enemy.nx, enemy.y);
        } else if (!enemy.nearChecked && dx <= footprint + enemy.radius + 48) {
          enemy.nearChecked = true;
          registerNearMiss(enemy.nx, p.y - 30);
        }
        if (enemy.y > p.y + enemy.radius + 24) enemy.dead = true;
      }
    }
    state.enemies = state.enemies.filter(
      (e) => !e.dead || (e.isBoss && state.phase === "bossDefeat"),
    );
  }

  function updateEnemyShots(dt) {
    const p = state.player;
    const footprint = playerFootprint();
    for (const shot of state.enemyShots) {
      if (shot.dead) continue;
      shot.age += dt;
      shot.nx += shot.vx * dt;
      shot.x = nxToX(shot.nx);
      shot.y += shot.vy * dt;
      if (spiralIntercept(shot)) continue;
      if (shot.y + shot.radius >= p.y - 16) {
        const dx = Math.abs(shot.x - p.x);
        if (dx <= footprint * 0.72 + shot.radius) {
          shot.dead = true;
          hurtPlayer(shot.damage, shot.kind, shot.nx, shot.y);
        } else if (!shot.nearChecked && dx <= footprint + shot.radius + 42) {
          shot.nearChecked = true;
          registerNearMiss(shot.nx, p.y - 26);
        }
        if (shot.y > p.y + 50) shot.dead = true;
      }
      if (shot.age > 5) shot.dead = true;
    }
    state.enemyShots = state.enemyShots.filter((s) => !s.dead);
  }

  function updateHazards(dt) {
    const p = state.player;
    const footprintN = playerFootprint() / Math.max(1, state.layout.track.width);
    for (const h of state.hazards) {
      if (h.dead) continue;
      h.life -= dt;
      if (h.kind === "target") {
        if (h.life <= 0) h.dead = true;
        continue;
      }
      if (h.kind === "chargeMark") {
        const source = state.enemies.find((enemy) => enemy.id === h.sourceId && !enemy.dead);
        if (!source || h.life <= 0) h.dead = true;
        continue;
      }
      if (h.kind === "sweep") {
        const elapsed = h.maxLife - h.life;
        const active = elapsed >= h.warning;
        if (active && !h.hit && Math.abs(p.nx - h.nx) <= h.width * 0.5 + footprintN * 0.55) {
          h.hit = true;
          hurtPlayer(h.damage, "sweep", h.nx, p.y);
        }
        if (h.life <= 0) h.dead = true;
      }
    }
    state.hazards = state.hazards.filter((h) => !h.dead);
  }

  function updateParticles(dt) {
    for (const p of state.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 90 * dt;
      p.angle += p.spin * dt;
    }
    state.particles = state.particles.filter((p) => p.life > 0);
    for (const t of state.texts) {
      t.life -= dt;
      t.y += t.vy * dt;
      if (t.space === "world") t.x = nxToX(t.nx);
    }
    state.texts = state.texts.filter((t) => t.life > 0);
  }

  function checkWaveComplete(dt) {
    const encounter = state.currentEncounter;
    if (!encounter || encounter.cursor < encounter.schedule.length) return;
    const enemiesRemain = state.enemies.some((e) => !e.dead && !e.isBoss);
    const dangerRemain =
      state.enemyShots.some((s) => !s.dead) ||
      state.hazards.some((h) => !h.dead && h.kind !== "target");
    if (!enemiesRemain && !dangerRemain) {
      encounter.clearTimer = (encounter.clearTimer || 0) + dt;
      if (encounter.clearTimer >= 0.42) finishWave();
    } else encounter.clearTimer = 0;
  }

  function updateActive(dt) {
    state.runTime += dt;
    state.simTime += dt;
    state.phaseTimer += dt;
    state.shake = Math.max(0, state.shake - dt * 22);
    state.flash = Math.max(0, state.flash - dt * 2.3);
    state.scroll += dt * (120 + state.act * 16) * state.speedScale;
    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) uiProjection.hideToast();
    }
    musicTick(dt);
    updatePlayer(dt);

    if (state.phase === "actIntro") {
      if (state.phaseTimer >= state.phaseDuration) beginEncounter();
    } else if (state.phase === "gate") {
      updateGatePhase(dt);
      updateBullets(dt);
    } else if (state.phase === "gateResolve") {
      updateBullets(dt);
      if (state.phaseTimer >= state.phaseDuration) {
        if (state.currentEncounter?.bossPrep) beginBossIntro();
        else beginCombat(state.currentEncounter);
      }
    } else if (state.phase === "combat") {
      updateWaveSpawner(dt);
      updateBullets(dt);
      updateEnemies(dt);
      updateEnemyShots(dt);
      updateHazards(dt);
      checkWaveComplete(dt);
    } else if (state.phase === "waveClear") {
      if (state.phaseTimer >= state.phaseDuration) beginEncounter();
    } else if (state.phase === "bossIntro") {
      if (state.phaseTimer >= state.phaseDuration) spawnBoss();
    } else if (state.phase === "bossFight") {
      updateBullets(dt);
      updateEnemies(dt);
      updateEnemyShots(dt);
      updateHazards(dt);
    } else if (state.phase === "bossDefeat") {
      if (state.phaseTimer >= state.phaseDuration) {
        if (state.act >= state.maxActs) endRun(true);
        else showCharmChoice();
      }
    } else if (state.phase === "resultDelay") {
      if (state.phaseTimer >= state.phaseDuration) finalizeResult();
    }

    updateParticles(dt);
    state.bullets = state.bullets.filter((b) => !b.dead);
    state.enemies = state.enemies.filter(
      (e) => !e.dead || (e.isBoss && state.phase === "bossDefeat"),
    );
    state.enemyShots = state.enemyShots.filter((s) => !s.dead);
    state.hazards = state.hazards.filter((h) => !h.dead);
    if (
      state.player &&
      (state.player.momentum >= 100 || UI.stampButton.classList.contains("is-ready"))
    )
      updateControls();
  }

  function roundedRectPath(x, y, w, h, r) {
    const rr = Math.min(r, w * 0.5, h * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function drawPaperPolygon(points, fill, stroke = null, lineWidth = 1) {
    ctx.beginPath();
    points.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
  }

  function drawBackground() {
    const skin = SKINS.find((s) => s.id === state.profile.settings.skin) || SKINS[0];
    const act = ACT_DATA[state.act] || ACT_DATA[1];
    const tr = state.layout.track;
    const t = state.renderTime;
    const scroll = state.mode === "title" ? t * 42 : state.scroll;

    ctx.fillStyle = skin.paper;
    ctx.fillRect(0, 0, state.viewW, state.viewH);

    const sky =
      state.act === 3
        ? act.sky
        : shadeHex(act.sky, state.profile.settings.skin === "night" ? -0.15 : 0);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, tr.left, state.viewH);
    ctx.fillRect(tr.right, 0, state.viewW - tr.right, state.viewH);

    ctx.fillStyle = act.road;
    ctx.fillRect(tr.left, 0, tr.width, state.viewH);
    ctx.fillStyle = "rgba(33,27,23,.16)";
    ctx.fillRect(tr.left, 0, 3, state.viewH);
    ctx.fillRect(tr.right - 3, 0, 3, state.viewH);

    const lineGap = state.layout.short ? 78 : 104;
    ctx.save();
    ctx.strokeStyle = state.act === 3 ? "rgba(255,240,190,.11)" : "rgba(62,45,28,.105)";
    ctx.lineWidth = 1;
    for (let y = -lineGap; y < state.viewH + lineGap; y += lineGap) {
      const yy = y + wrap(scroll, lineGap);
      ctx.beginPath();
      ctx.moveTo(tr.left + 7, yy);
      ctx.lineTo(tr.right - 7, yy - 10);
      ctx.stroke();
    }
    for (let i = 1; i < 4; i++) {
      const x = tr.left + (tr.width * i) / 4;
      ctx.setLineDash([18, 28]);
      ctx.beginPath();
      ctx.moveTo(x, tr.top);
      ctx.lineTo(x, state.viewH);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();

    drawScenery(scroll, act);

    ctx.save();
    ctx.globalAlpha = 0.055;
    ctx.fillStyle = COLORS.ink;
    const dots = state.quality.level === "low" ? 34 : 70;
    for (let i = 0; i < dots; i++) {
      const x = wrap(i * 173.17, state.viewW);
      const y = wrap(i * 91.31 + scroll * 0.08, state.viewH);
      const r = 1 + ((i * 7) % 3);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawScenery(scroll, act) {
    const tr = state.layout.track;
    const gap = 150;
    const offset = wrap(scroll * 0.62, gap);
    ctx.save();
    for (let i = -1; i < Math.ceil(state.viewH / gap) + 2; i++) {
      const y = i * gap + offset;
      const leftX = tr.left * 0.5;
      const rightX = tr.right + (state.viewW - tr.right) * 0.5;
      if (state.act === 1) {
        drawRoof(leftX, y, 0.75 + (i % 2) * 0.12, i % 2 ? COLORS.redDark : COLORS.indigo2);
        drawRoof(rightX, y + 58, 0.68, i % 2 ? COLORS.indigo2 : COLORS.redDark);
      } else if (state.act === 2) {
        drawPine(leftX, y, 0.82, act.side);
        drawPine(rightX, y + 54, 0.7, act.side);
        if (i % 3 === 0) drawTorii(i % 2 ? leftX : rightX, y + 90, 0.55);
      } else {
        drawLantern(leftX, y, 0.72, i % 2 ? COLORS.ochre : COLORS.red);
        drawLantern(rightX, y + 66, 0.65, i % 2 ? COLORS.red : COLORS.ochre);
      }
    }
    ctx.restore();
  }

  function drawRoof(x, y, s, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.fillStyle = "rgba(33,27,23,.18)";
    ctx.fillRect(-42, 22, 84, 42);
    drawPaperPolygon(
      [
        [-58, 18],
        [0, -10],
        [58, 18],
        [42, 31],
        [-44, 31],
      ],
      color,
      COLORS.ink,
      2,
    );
    ctx.fillStyle = COLORS.paperHi;
    ctx.fillRect(-25, 32, 50, 25);
    ctx.restore();
  }

  function drawPine(x, y, s, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.fillStyle = COLORS.ink2;
    ctx.fillRect(-4, 8, 8, 54);
    ctx.fillStyle = color;
    for (let i = 0; i < 3; i++)
      drawPaperPolygon(
        [
          [-36 + i * 4, 20 - i * 17],
          [0, -28 - i * 14],
          [38 - i * 4, 20 - i * 17],
        ],
        color,
        COLORS.ink,
        1.5,
      );
    ctx.restore();
  }

  function drawTorii(x, y, s) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.fillStyle = COLORS.redDark;
    ctx.fillRect(-40, -5, 80, 7);
    ctx.fillRect(-48, -14, 96, 7);
    ctx.fillRect(-26, 0, 7, 58);
    ctx.fillRect(19, 0, 7, 58);
    ctx.restore();
  }

  function drawLantern(x, y, s, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -42);
    ctx.lineTo(0, -20);
    ctx.stroke();
    roundedRectPath(-19, -22, 38, 48, 10);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.paperHi;
    ctx.font = "900 15px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("祭", 0, 2); // i18n-allow-ornament: festival stamp face
    ctx.restore();
  }

  function drawThreatPreview() {
    if (state.phase !== "gate" || !state.currentEncounter) return;
    const preview = state.currentEncounter.preview || [];
    if (!preview.length) return;
    const compact = state.viewW < 520;
    const y = state.layout.hudH + (compact ? 23 : 26);
    const panelW = Math.min(state.layout.track.width * 0.72, compact ? 230 : 330);
    const panelH = compact ? 45 : 50;
    const left = state.layout.track.center - panelW * 0.5;
    const mirrored = (state.currentEncounter.variant || 0) % 2 === 1;
    ctx.save();
    ctx.globalAlpha = 0.94;
    ctx.fillStyle = state.act === 3 ? "rgba(26,29,37,.86)" : "rgba(248,240,220,.90)";
    roundedRectPath(left, y - panelH * 0.5, panelW, panelH, 13);
    ctx.fill();
    ctx.strokeStyle = state.difficulty === "hard" ? "rgba(119,39,31,.88)" : "rgba(33,27,23,.24)";
    ctx.lineWidth = state.difficulty === "hard" ? 2.5 : 1.5;
    roundedRectPath(left, y - panelH * 0.5, panelW, panelH, 13);
    ctx.stroke();

    const items = preview.slice(0, compact ? 5 : 7);
    for (const item of items) {
      const nx = mirrored ? 1 - (item.nx ?? 0.5) : (item.nx ?? 0.5);
      const x = left + 20 + clamp(nx, 0.04, 0.96) * (panelW - 40);
      drawThreatIcon(item.kind, x, y + 1, compact ? 0.56 : 0.66, item);
    }
    if (state.currentEncounter.bossPrep) {
      ctx.fillStyle = state.difficulty === "hard" ? COLORS.red : COLORS.ochre;
      ctx.beginPath();
      ctx.arc(left + 11, y, 4, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(left + panelW - 11, y, 4, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawThreatIcon(kind, x, y, s, item = {}) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.fillStyle = COLORS.ink;
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 3;
    if (kind === "chaff" || kind === "mite") {
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-7, -6);
      ctx.lineTo(-3, -16);
      ctx.lineTo(0, -7);
      ctx.moveTo(7, -6);
      ctx.lineTo(3, -16);
      ctx.lineTo(0, -7);
      ctx.stroke();
    } else if (kind === "fast") {
      drawPaperPolygon(
        [
          [-15, -4],
          [5, -12],
          [16, 0],
          [3, 11],
          [-16, 6],
        ],
        COLORS.ink,
      );
      ctx.strokeStyle = COLORS.ochre;
      ctx.beginPath();
      ctx.moveTo(-25, -7);
      ctx.lineTo(-16, -7);
      ctx.moveTo(-26, 3);
      ctx.lineTo(-16, 3);
      ctx.stroke();
    } else if (kind === "charger") {
      drawPaperPolygon(
        [
          [-9, -15],
          [9, -15],
          [15, 3],
          [0, 20],
          [-15, 3],
        ],
        COLORS.redDark,
        COLORS.ink,
        2,
      );
      ctx.fillStyle = COLORS.ochre;
      ctx.beginPath();
      ctx.moveTo(0, 20);
      ctx.lineTo(-7, 8);
      ctx.lineTo(7, 8);
      ctx.closePath();
      ctx.fill();
    } else if (kind === "armor") {
      ctx.fillRect(-12, -12, 24, 25);
      ctx.fillStyle = COLORS.paperDeep;
      ctx.fillRect(-7, -6, 14, 5);
      ctx.strokeStyle = COLORS.ochre;
      ctx.beginPath();
      ctx.moveTo(-15, -15);
      ctx.lineTo(0, -24);
      ctx.lineTo(15, -15);
      ctx.stroke();
    } else if (kind === "shield") {
      ctx.beginPath();
      ctx.arc(-2, 0, 10, 0, TAU);
      ctx.fill();
      ctx.fillStyle = COLORS.green;
      const side = item.side ?? item.shieldSide ?? 1;
      roundedRectPath(side < 0 ? -19 : 9, -15, 10, 30, 3);
      ctx.fill();
    } else if (kind === "thrower") {
      drawPaperPolygon(
        [
          [-11, 13],
          [-9, -5],
          [0, -15],
          [9, -5],
          [11, 13],
        ],
        COLORS.violet,
        COLORS.ink,
        2,
      );
      ctx.fillStyle = COLORS.red;
      ctx.beginPath();
      ctx.arc(13, -11, 5, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = COLORS.violet;
      ctx.beginPath();
      ctx.moveTo(5, -3);
      ctx.quadraticCurveTo(16, 2, 13, -8);
      ctx.stroke();
    } else if (kind === "splitter") {
      ctx.beginPath();
      ctx.arc(-5, 0, 9, 0, TAU);
      ctx.arc(5, 0, 9, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = COLORS.paperHi;
      ctx.beginPath();
      ctx.moveTo(0, -12);
      ctx.lineTo(0, 13);
      ctx.stroke();
    } else if (kind === "drummer") {
      ctx.fillStyle = COLORS.indigo;
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = COLORS.ochre;
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = COLORS.ink;
      ctx.beginPath();
      ctx.moveTo(-16, -17);
      ctx.lineTo(-5, -3);
      ctx.moveTo(16, -17);
      ctx.lineTo(5, -3);
      ctx.stroke();
    } else if (kind === "sweep") {
      ctx.fillStyle = "rgba(179,58,47,.78)";
      ctx.fillRect(-13, -18, 26, 36);
      ctx.strokeStyle = COLORS.paperHi;
      ctx.lineWidth = 2;
      for (let i = -18; i < 20; i += 8) {
        ctx.beginPath();
        ctx.moveTo(-13, i);
        ctx.lineTo(13, i - 10);
        ctx.stroke();
      }
    } else if (kind === "bossFire") {
      ctx.rotate(0.25);
      drawPaperPolygon(
        [
          [-12, -6],
          [0, -15],
          [12, -6],
          [8, 14],
          [-8, 14],
        ],
        COLORS.red,
        COLORS.ink,
        2,
      );
    } else if (kind === "boss_cart") {
      ctx.fillStyle = COLORS.redDark;
      roundedRectPath(-23, -10, 46, 22, 5);
      ctx.fill();
      ctx.fillStyle = COLORS.ink;
      ctx.beginPath();
      ctx.arc(-13, 13, 6, 0, TAU);
      ctx.arc(13, 13, 6, 0, TAU);
      ctx.fill();
      ctx.fillStyle = COLORS.ochre;
      drawPaperPolygon(
        [
          [-18, -9],
          [-10, -23],
          [-4, -8],
        ],
        COLORS.ochre,
      );
      drawPaperPolygon(
        [
          [18, -9],
          [10, -23],
          [4, -8],
        ],
        COLORS.ochre,
      );
    } else if (kind === "boss_mask") {
      ctx.fillStyle = COLORS.ink;
      roundedRectPath(-25, -17, 50, 34, 4);
      ctx.fill();
      ctx.fillStyle = COLORS.paperHi;
      ctx.beginPath();
      ctx.ellipse(0, 0, 12, 16, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = COLORS.redDark;
      ctx.fillRect(-23, -13, 7, 26);
      ctx.fillRect(16, -13, 7, 26);
    } else if (kind === "boss_dragon") {
      ctx.strokeStyle = COLORS.redDark;
      ctx.lineWidth = 11;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-24, 8);
      ctx.quadraticCurveTo(-5, -18, 12, 3);
      ctx.quadraticCurveTo(20, 13, 26, -6);
      ctx.stroke();
      ctx.fillStyle = COLORS.ink;
      ctx.beginPath();
      ctx.ellipse(22, -6, 10, 7, -0.25, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawGateFocus() {
    if (state.phase !== "gate" || !state.player || !state.focusGateId) return;
    const gate = state.gates.find((g) => g.id === state.focusGateId);
    if (!gate) return;
    ctx.save();
    const grad = ctx.createLinearGradient(state.player.x, state.player.y, gate.x, gate.y);
    grad.addColorStop(0, "rgba(193,138,47,.05)");
    grad.addColorStop(1, "rgba(193,138,47,.26)");
    ctx.fillStyle = grad;
    const w0 = Math.max(14, playerFootprint() * 0.35);
    const w1 = state.layout.gateW * 0.38;
    ctx.beginPath();
    ctx.moveTo(state.player.x - w0, state.player.y - 38);
    ctx.lineTo(gate.x - w1, gate.y + state.layout.gateH * 0.35);
    ctx.lineTo(gate.x + w1, gate.y + state.layout.gateH * 0.35);
    ctx.lineTo(state.player.x + w0, state.player.y - 38);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawGatePictogram(gate, cx, cy, scale) {
    const option = gate.option;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.strokeStyle = COLORS.ink;
    ctx.fillStyle = COLORS.ink;
    ctx.lineWidth = 3;
    if (option.kind === "count") {
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.arc(i * 13, -8 + Math.abs(i) * 3, 6, 0, TAU);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(i * 13, -1);
        ctx.lineTo(i * 13, 14);
        ctx.moveTo(i * 13, 5);
        ctx.lineTo(i * 13 - 7, 11);
        ctx.moveTo(i * 13, 5);
        ctx.lineTo(i * 13 + 7, 11);
        ctx.stroke();
      }
    } else if (option.kind === "power") {
      ctx.save();
      ctx.rotate(-0.55);
      ctx.fillRect(-5, -23, 10, 38);
      drawPaperPolygon(
        [
          [-8, -25],
          [0, -39],
          [8, -25],
        ],
        COLORS.redDark,
      );
      ctx.restore();
      ctx.beginPath();
      ctx.moveTo(-20, 17);
      ctx.lineTo(20, 17);
      ctx.stroke();
    } else if (option.kind === "tempo") {
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, TAU);
      ctx.fillStyle = COLORS.ochre;
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-25, -21);
      ctx.lineTo(-10, -12);
      ctx.moveTo(25, -21);
      ctx.lineTo(10, -12);
      ctx.stroke();
      ctx.fillStyle = COLORS.paperHi;
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, TAU);
      ctx.fill();
    } else if (option.kind === "shield") {
      ctx.beginPath();
      ctx.moveTo(0, -27);
      ctx.quadraticCurveTo(25, -18, 21, 5);
      ctx.quadraticCurveTo(14, 23, 0, 31);
      ctx.quadraticCurveTo(-14, 23, -21, 5);
      ctx.quadraticCurveTo(-25, -18, 0, -27);
      ctx.closePath();
      ctx.fillStyle = COLORS.green;
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = COLORS.paperHi;
      ctx.beginPath();
      ctx.moveTo(-10, 1);
      ctx.lineTo(-2, 10);
      ctx.lineTo(13, -9);
      ctx.stroke();
    } else if (option.kind === "form") {
      const form = option.form;
      ctx.fillStyle = FORM[form].color;
      if (form === "fan") {
        for (let i = -2; i <= 2; i++) {
          ctx.save();
          ctx.rotate(i * 0.2);
          ctx.fillRect(-3, -26, 6, 35);
          ctx.restore();
        }
      } else if (form === "spear") {
        ctx.fillRect(-4, -24, 8, 44);
        drawPaperPolygon(
          [
            [-10, -23],
            [0, -40],
            [10, -23],
          ],
          FORM[form].color,
        );
      } else if (form === "spiral") {
        ctx.lineWidth = 6;
        ctx.strokeStyle = FORM[form].color;
        ctx.beginPath();
        ctx.arc(0, 0, 22, -0.4, TAU * 0.82);
        ctx.stroke();
        drawPaperPolygon(
          [
            [16, -18],
            [29, -12],
            [18, -5],
          ],
          FORM[form].color,
        );
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, 22, 0, TAU);
        ctx.fill();
        ctx.fillStyle = COLORS.paperHi;
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawGate(gate) {
    const w = state.layout.gateW;
    const h = state.layout.gateH;
    const selected = gate.id === state.focusGateId && state.phase === "gate";
    const alpha = gate.dead ? 0.2 : selected ? 1 : 0.66;
    const pulse = selected && !reducedMotion() ? 1 + Math.sin(state.renderTime * 6) * 0.012 : 1;
    ctx.save();
    ctx.translate(gate.x, gate.y);
    ctx.scale(pulse, pulse);
    ctx.globalAlpha = alpha;
    ctx.shadowColor = "rgba(33,27,23,.28)";
    ctx.shadowBlur = state.quality.level === "low" ? 0 : selected ? 15 : 6;
    ctx.shadowOffsetY = 7;

    roundedRectPath(-w * 0.5, -h * 0.5, w, h, 14);
    ctx.fillStyle = gate.option.style.dark;
    ctx.fill();
    ctx.shadowColor = "transparent";
    roundedRectPath(-w * 0.5 + 8, -h * 0.5 + 8, w - 16, h - 16, 10);
    ctx.fillStyle = gate.option.style.color;
    ctx.fill();
    roundedRectPath(-w * 0.5 + 16, -h * 0.5 + 15, w - 32, h - 29, 7);
    ctx.fillStyle = COLORS.paperHi;
    ctx.globalAlpha *= 0.92;
    ctx.fill();
    ctx.globalAlpha = alpha;

    if (selected) {
      ctx.strokeStyle = COLORS.ochre;
      ctx.lineWidth = 4;
      ctx.setLineDash([12, 7]);
      roundedRectPath(-w * 0.5 - 5, -h * 0.5 - 5, w + 10, h + 10, 17);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    drawGatePictogram(gate, -w * 0.27, -6, clamp(w / 160, 0.62, 0.92));
    ctx.fillStyle = COLORS.ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `900 ${clamp(w * 0.18, 20, 30)}px "Yu Gothic UI", sans-serif`;
    ctx.fillText(gateDisplay(gate.option, gate.tier), w * 0.2, -5);
    ctx.font = `800 ${clamp(w * 0.075, 10, 13)}px sans-serif`;
    ctx.fillStyle = COLORS.ink2;
    ctx.fillText(gateName(gate.option), w * 0.2, h * 0.24);

    const pipY = h * 0.38;
    const pipGap = Math.min(24, w * 0.16);
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * pipGap;
      ctx.beginPath();
      ctx.arc(x, pipY, 7, 0, TAU);
      ctx.fillStyle = i < gate.tier ? COLORS.ochre : "rgba(33,27,23,.15)";
      ctx.fill();
      ctx.strokeStyle = i < gate.tier ? COLORS.ink : "rgba(33,27,23,.25)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawHazards() {
    for (const h of state.hazards) {
      if (h.dead) continue;
      if (h.kind === "target") {
        const a = clamp(h.life / h.maxLife, 0, 1);
        ctx.save();
        ctx.globalAlpha = 0.15 + (1 - a) * 0.58;
        ctx.strokeStyle = COLORS.red;
        ctx.lineWidth = 3;
        ctx.setLineDash([7, 5]);
        ctx.beginPath();
        ctx.arc(nxToX(h.nx), h.y, h.radius * (0.72 + a * 0.46), 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(nxToX(h.nx) - 9, h.y);
        ctx.lineTo(nxToX(h.nx) + 9, h.y);
        ctx.moveTo(nxToX(h.nx), h.y - 9);
        ctx.lineTo(nxToX(h.nx), h.y + 9);
        ctx.stroke();
        ctx.restore();
      } else if (h.kind === "chargeMark") {
        const x = nxToX(h.nx);
        const w = Math.max(34, state.layout.track.width * (h.width || 0.13));
        const pulse = 0.28 + Math.sin(state.renderTime * 16) * 0.12;
        ctx.save();
        ctx.globalAlpha = reducedMotion() ? 0.48 : 0.48 + pulse;
        const grad = ctx.createLinearGradient(
          x,
          state.layout.track.top,
          x,
          state.layout.playerY + 44,
        );
        grad.addColorStop(0, "rgba(119,39,31,.05)");
        grad.addColorStop(0.65, "rgba(179,58,47,.16)");
        grad.addColorStop(1, "rgba(119,39,31,.42)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(x - w * 0.28, state.layout.track.top);
        ctx.lineTo(x + w * 0.28, state.layout.track.top);
        ctx.lineTo(x + w * 0.5, state.layout.playerY + 34);
        ctx.lineTo(x, state.layout.playerY + 64);
        ctx.lineTo(x - w * 0.5, state.layout.playerY + 34);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = COLORS.redDark;
        ctx.lineWidth = 3;
        ctx.setLineDash([9, 7]);
        ctx.beginPath();
        ctx.moveTo(x, state.layout.track.top);
        ctx.lineTo(x, state.layout.playerY + 43);
        ctx.stroke();
        ctx.setLineDash([]);
        for (let yy = state.layout.playerY - 118; yy < state.layout.playerY + 26; yy += 38) {
          ctx.beginPath();
          ctx.moveTo(x - 10, yy - 10);
          ctx.lineTo(x, yy);
          ctx.lineTo(x + 10, yy - 10);
          ctx.stroke();
        }
        ctx.restore();
      } else if (h.kind === "sweep") {
        const elapsed = h.maxLife - h.life;
        const active = elapsed >= h.warning;
        const x = nxToX(h.nx);
        const w = state.layout.track.width * h.width;
        const top = state.layout.track.top;
        const height = state.viewH - top;
        ctx.save();
        if (active) {
          ctx.globalAlpha = 0.44;
          ctx.fillStyle = COLORS.red;
          ctx.fillRect(x - w * 0.5, top, w, height);
          ctx.globalAlpha = 0.26;
          ctx.strokeStyle = COLORS.paperHi;
          ctx.lineWidth = 6;
          for (let yy = top - 40; yy < state.viewH + 80; yy += 34) {
            ctx.beginPath();
            ctx.moveTo(x - w * 0.5, yy);
            ctx.lineTo(x + w * 0.5, yy - w * 0.16);
            ctx.stroke();
          }
        } else {
          ctx.globalAlpha = 0.34 + (reducedMotion() ? 0 : 0.1 * Math.sin(state.renderTime * 12));
          ctx.fillStyle = COLORS.ink;
          ctx.fillRect(x - w * 0.5, top, w, height);
          ctx.globalAlpha = 0.85;
          ctx.strokeStyle = COLORS.red;
          ctx.lineWidth = 3;
          ctx.setLineDash([12, 10]);
          ctx.strokeRect(x - w * 0.5, top, w, height);
          ctx.setLineDash([]);
          ctx.fillStyle = COLORS.redDark;
          for (const edge of [-1, 1]) {
            const ex = x + edge * w * 0.5;
            for (let yy = top + 12; yy < state.viewH; yy += 42) {
              ctx.beginPath();
              ctx.arc(ex, yy, 4, 0, TAU);
              ctx.fill();
            }
          }
        }
        ctx.restore();
      }
    }
  }

  function drawBullets() {
    ctx.save();
    for (const b of state.bullets) {
      const color = FORM[b.form]?.color || COLORS.red;
      ctx.globalAlpha = 0.78;
      ctx.fillStyle = b.stamp ? COLORS.ochre : color;
      ctx.strokeStyle = COLORS.paperHi;
      ctx.lineWidth = 1;
      if (b.form === "spear") {
        drawPaperPolygon(
          [
            [b.x, b.y - 12],
            [b.x - 3, b.y + 7],
            [b.x + 3, b.y + 7],
          ],
          b.stamp ? COLORS.ochre : color,
        );
      } else if (b.form === "drum") {
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius, 0, TAU);
        ctx.fill();
        ctx.globalAlpha *= 0.35;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius * 1.8, 0, TAU);
        ctx.strokeStyle = color;
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.ellipse(b.x, b.y, b.radius * 0.7, b.radius * 1.8, 0, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawEnemyShots() {
    for (const s of state.enemyShots) {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate((reducedMotion() ? 0 : state.renderTime * 3) + s.nx * 5);
      ctx.fillStyle = s.kind === "bossFire" ? COLORS.red : COLORS.violet;
      drawPaperPolygon(
        [
          [-s.radius, -s.radius * 0.5],
          [0, -s.radius],
          [s.radius, -s.radius * 0.5],
          [s.radius * 0.65, s.radius],
          [-s.radius * 0.55, s.radius],
        ],
        ctx.fillStyle,
        COLORS.ink,
        1.5,
      );
      ctx.restore();
    }
  }

  function drawEnemyLite(enemy) {
    if (enemy.y < state.layout.track.top - 80 || enemy.y > state.viewH + 50) return;
    const style = ENEMY_STYLE[enemy.kind] || ENEMY_STYLE.chaff;
    const r = Math.max(5, enemy.radius * 0.72);
    const entry = clamp(1 - (enemy.entryTimer || 0) / 0.28, 0.18, 1);
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.scale(entry, entry);
    ctx.fillStyle = enemy.flash > 0 ? COLORS.white : style.ink;
    if (enemy.kind === "armor") {
      ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.fillStyle = style.accent;
      ctx.fillRect(-r * 0.58, -r * 0.72, r * 1.16, r * 0.34);
    } else if (enemy.kind === "shield") {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.fill();
      if (enemy.shieldHp > 0) {
        ctx.strokeStyle = COLORS.greenDark;
        ctx.lineWidth = 3;
        ctx.beginPath();
        const a0 = enemy.shieldSide < 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
        ctx.arc(0, 0, r * 1.18, a0, a0 + Math.PI);
        ctx.stroke();
      }
    } else if (enemy.kind === "fast") {
      ctx.beginPath();
      ctx.moveTo(0, -r * 1.25);
      ctx.lineTo(r, r);
      ctx.lineTo(-r, r);
      ctx.closePath();
      ctx.fill();
    } else if (enemy.kind === "charger") {
      ctx.beginPath();
      ctx.moveTo(0, r * 1.45);
      ctx.lineTo(r, -r * 0.25);
      ctx.lineTo(r * 0.45, -r);
      ctx.lineTo(-r * 0.45, -r);
      ctx.lineTo(-r, -r * 0.25);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = style.accent;
      ctx.fillRect(-r * 0.18, -r * 0.95, r * 0.36, r * 1.15);
    } else if (enemy.kind === "drummer") {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = style.accent;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.48, 0, TAU);
      ctx.fill();
    } else if (enemy.kind === "thrower") {
      ctx.beginPath();
      ctx.moveTo(-r, r);
      ctx.lineTo(-r * 0.7, -r * 0.6);
      ctx.lineTo(0, -r * 1.2);
      ctx.lineTo(r * 0.7, -r * 0.6);
      ctx.lineTo(r, r);
      ctx.closePath();
      ctx.fill();
    } else if (enemy.kind === "splitter") {
      ctx.beginPath();
      ctx.arc(-r * 0.35, 0, r * 0.72, 0, TAU);
      ctx.arc(r * 0.35, 0, r * 0.72, 0, TAU);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawEnemy(enemy) {
    if (enemy.isBoss) {
      drawBoss(enemy);
      return;
    }
    const style = ENEMY_STYLE[enemy.kind] || ENEMY_STYLE.chaff;
    const r = enemy.radius;
    const entry = clamp(1 - (enemy.entryTimer || 0) / 0.28, 0.1, 1);
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.scale(entry, entry);
    ctx.rotate(
      reducedMotion()
        ? 0
        : enemy.kind === "fast"
          ? Math.sin(state.renderTime * 8 + enemy.phase) * 0.25
          : Math.sin(state.renderTime * 3 + enemy.phase) * 0.06,
    );
    ctx.shadowColor = "rgba(33,27,23,.22)";
    ctx.shadowBlur = state.quality.level === "low" ? 0 : 5;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = enemy.flash > 0 ? COLORS.white : style.ink;
    ctx.strokeStyle = style.dark;
    ctx.lineWidth = 2.4;

    if (enemy.kind === "chaff" || enemy.kind === "mite") {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.fill();
      ctx.stroke();
      drawPaperPolygon(
        [
          [-r * 0.7, -r * 0.65],
          [-r * 0.25, -r * 1.35],
          [0, -r * 0.7],
        ],
        style.ink,
        style.dark,
        2,
      );
      drawPaperPolygon(
        [
          [r * 0.7, -r * 0.65],
          [r * 0.25, -r * 1.35],
          [0, -r * 0.7],
        ],
        style.ink,
        style.dark,
        2,
      );
    } else if (enemy.kind === "fast") {
      drawPaperPolygon(
        [
          [-r * 1.4, -r * 0.4],
          [r * 0.2, -r],
          [r * 1.45, 0],
          [r * 0.2, r],
          [-r * 1.25, r * 0.45],
        ],
        style.ink,
        style.dark,
        2,
      );
      ctx.fillStyle = style.accent;
      ctx.beginPath();
      ctx.moveTo(r * 0.9, -3);
      ctx.lineTo(r * 1.7, 0);
      ctx.lineTo(r * 0.9, 4);
      ctx.fill();
    } else if (enemy.kind === "armor") {
      roundedRectPath(-r, -r, r * 2, r * 2.1, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = style.accent;
      ctx.fillRect(-r * 0.78, -r * 0.65, r * 1.56, r * 0.28);
      ctx.strokeStyle = style.accent;
      ctx.beginPath();
      ctx.moveTo(-r, -r);
      ctx.lineTo(0, -r * 1.55);
      ctx.lineTo(r, -r);
      ctx.stroke();
    } else if (enemy.kind === "shield") {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.fill();
      ctx.stroke();
      const side = enemy.shieldSide;
      ctx.fillStyle = enemy.shieldHp > 0 ? COLORS.green : "rgba(82,106,81,.25)";
      roundedRectPath(side < 0 ? -r * 1.65 : r * 0.65, -r * 1.1, r, r * 2.2, 5);
      ctx.fill();
      ctx.stroke();
    } else if (enemy.kind === "thrower") {
      drawPaperPolygon(
        [
          [-r, r],
          [-r * 0.75, -r * 0.7],
          [0, -r * 1.25],
          [r * 0.75, -r * 0.7],
          [r, r],
        ],
        style.ink,
        style.dark,
        2,
      );
      ctx.fillStyle = style.accent;
      ctx.beginPath();
      ctx.arc(r * 0.72, -r * 0.55, r * 0.28, 0, TAU);
      ctx.fill();
      if (Number.isFinite(enemy.holdY)) {
        ctx.strokeStyle = style.accent;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.32, Math.PI * 0.15, Math.PI * 0.85);
        ctx.stroke();
      }
    } else if (enemy.kind === "splitter") {
      ctx.beginPath();
      ctx.arc(-r * 0.38, 0, r * 0.75, 0, TAU);
      ctx.arc(r * 0.38, 0, r * 0.75, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = COLORS.paperHi;
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(0, r);
      ctx.stroke();
    } else if (enemy.kind === "charger") {
      const aimed = enemy.chargeState === "aim";
      drawPaperPolygon(
        [
          [0, r * 1.55],
          [r * 1.05, -r * 0.2],
          [r * 0.52, -r * 1.12],
          [-r * 0.52, -r * 1.12],
          [-r * 1.05, -r * 0.2],
        ],
        aimed ? style.ink : style.dark,
        style.dark,
        2.4,
      );
      ctx.fillStyle = style.accent;
      ctx.fillRect(-r * 0.17, -r * 0.98, r * 0.34, r * 1.36);
      ctx.beginPath();
      ctx.moveTo(-r * 0.42, r * 0.45);
      ctx.lineTo(0, r * 1.22);
      ctx.lineTo(r * 0.42, r * 0.45);
      ctx.closePath();
      ctx.fill();
      if (aimed) {
        ctx.globalAlpha = 0.72;
        ctx.strokeStyle = COLORS.red;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.34, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    } else if (enemy.kind === "drummer") {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = style.accent;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.52, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = style.dark;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-r * 1.05, -r * 1.15);
      ctx.lineTo(-r * 0.28, -r * 0.22);
      ctx.moveTo(r * 1.05, -r * 1.15);
      ctx.lineTo(r * 0.28, -r * 0.22);
      ctx.stroke();
      if (enemy.pulses > 0) {
        ctx.globalAlpha = reducedMotion() ? 0.3 : 0.24 + 0.12 * Math.sin(state.renderTime * 8);
        ctx.strokeStyle = style.accent;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, r * (1.3 + (enemy.pulses % 2) * 0.15), 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    ctx.shadowColor = "transparent";
    if (!["drummer"].includes(enemy.kind)) {
      ctx.fillStyle = COLORS.paperHi;
      ctx.beginPath();
      ctx.arc(-r * 0.32, -r * 0.15, Math.max(1.5, r * 0.09), 0, TAU);
      ctx.arc(r * 0.32, -r * 0.15, Math.max(1.5, r * 0.09), 0, TAU);
      ctx.fill();
    }
    if (enemy.maxHp > 20 && enemy.hp < enemy.maxHp) {
      const w = r * 2.1;
      ctx.fillStyle = "rgba(33,27,23,.25)";
      ctx.fillRect(-w * 0.5, r + 7, w, 4);
      ctx.fillStyle = style.accent;
      ctx.fillRect(-w * 0.5, r + 7, w * clamp(enemy.hp / enemy.maxHp, 0, 1), 4);
    }
    ctx.restore();
  }

  function drawBoss(boss) {
    const r = boss.radius;
    const flash =
      boss.flash > 0 ||
      (!reducedMotion() && boss.stageLock > 0 && Math.floor(state.renderTime * 14) % 2 === 0);
    ctx.save();
    ctx.translate(boss.x, boss.y);
    ctx.shadowColor = "rgba(20,14,12,.38)";
    ctx.shadowBlur = state.quality.level === "low" ? 0 : 18;
    ctx.shadowOffsetY = 10;

    if (boss.bossType === "cart") {
      ctx.fillStyle = flash ? COLORS.white : ENEMY_STYLE.boss.ink;
      roundedRectPath(-r * 1.25, -r * 0.8, r * 2.5, r * 1.55, 12);
      ctx.fill();
      ctx.fillStyle = ENEMY_STYLE.boss.dark;
      ctx.beginPath();
      ctx.arc(-r * 0.75, r * 0.72, r * 0.36, 0, TAU);
      ctx.arc(r * 0.75, r * 0.72, r * 0.36, 0, TAU);
      ctx.fill();
      ctx.fillStyle = ENEMY_STYLE.boss.accent;
      drawPaperPolygon(
        [
          [-r, -r * 0.72],
          [-r * 0.55, -r * 1.35],
          [-r * 0.25, -r * 0.65],
        ],
        ENEMY_STYLE.boss.accent,
        COLORS.ink,
        2,
      );
      drawPaperPolygon(
        [
          [r, -r * 0.72],
          [r * 0.55, -r * 1.35],
          [r * 0.25, -r * 0.65],
        ],
        ENEMY_STYLE.boss.accent,
        COLORS.ink,
        2,
      );
      ctx.fillStyle = COLORS.paperHi;
      ctx.beginPath();
      ctx.arc(-r * 0.35, -r * 0.12, 5, 0, TAU);
      ctx.arc(r * 0.35, -r * 0.12, 5, 0, TAU);
      ctx.fill();
    } else if (boss.bossType === "mask") {
      const openLeft = boss.openLane === "left";
      ctx.fillStyle = flash ? COLORS.white : ENEMY_STYLE.boss.dark;
      roundedRectPath(-r * 1.45, -r, r * 2.9, r * 2, 8);
      ctx.fill();
      ctx.fillStyle = ENEMY_STYLE.boss.ink;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.72, r, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = COLORS.paperHi;
      ctx.beginPath();
      ctx.moveTo(-r * 0.42, -r * 0.18);
      ctx.lineTo(-r * 0.12, -r * 0.32);
      ctx.lineTo(-r * 0.18, 0);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(r * 0.42, -r * 0.18);
      ctx.lineTo(r * 0.12, -r * 0.32);
      ctx.lineTo(r * 0.18, 0);
      ctx.fill();
      const panelAlpha =
        boss.shieldShift > 0
          ? reducedMotion()
            ? 0.72
            : 0.55 + Math.sin(state.renderTime * 18) * 0.25
          : 0.88;
      ctx.globalAlpha = panelAlpha;
      ctx.fillStyle = COLORS.green;
      roundedRectPath(-r * 1.36, -r * 0.92, r * 0.55, r * 1.84, 5);
      ctx.fill();
      roundedRectPath(r * 0.81, -r * 0.92, r * 0.55, r * 1.84, 5);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = COLORS.ochre;
      ctx.lineWidth = 5;
      ctx.beginPath();
      const laneX = openLeft ? -r * 1.1 : r * 1.1;
      ctx.moveTo(laneX, -r * 0.7);
      ctx.lineTo(laneX, r * 0.7);
      ctx.stroke();
    } else {
      const segs = 7;
      for (let i = segs - 1; i >= 0; i--) {
        const a = (reducedMotion() ? 0 : state.renderTime * 1.5) - i * 0.52;
        const x = -i * 23 + Math.sin(a) * 18;
        const y = i * 8 + Math.cos(a * 0.8) * 10;
        ctx.fillStyle = flash ? COLORS.white : i % 2 ? COLORS.redDark : COLORS.red;
        ctx.beginPath();
        ctx.arc(x, y, r * (0.54 - i * 0.035), 0, TAU);
        ctx.fill();
        ctx.strokeStyle = COLORS.ink;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.fillStyle = flash ? COLORS.white : ENEMY_STYLE.boss.ink;
      ctx.beginPath();
      ctx.ellipse(18, -5, r * 0.9, r * 0.62, -0.15, 0, TAU);
      ctx.fill();
      ctx.stroke();
      drawPaperPolygon(
        [
          [-r * 0.05, -r * 0.42],
          [r * 0.1, -r * 1.05],
          [r * 0.32, -r * 0.38],
        ],
        COLORS.ochre,
        COLORS.ink,
        2,
      );
      drawPaperPolygon(
        [
          [r * 0.65, -r * 0.36],
          [r * 0.95, -r * 0.9],
          [r * 1.0, -r * 0.2],
        ],
        COLORS.ochre,
        COLORS.ink,
        2,
      );
      ctx.fillStyle = COLORS.paperHi;
      ctx.beginPath();
      ctx.arc(r * 0.42, -r * 0.1, 5, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    const barW = Math.min(state.layout.track.width * 0.7, 520);
    const y = state.layout.hudH + 61;
    ctx.save();
    ctx.fillStyle = "rgba(33,27,23,.3)";
    roundedRectPath(state.layout.track.center - barW * 0.5, y, barW, 12, 6);
    ctx.fill();
    ctx.fillStyle = COLORS.red;
    roundedRectPath(
      state.layout.track.center - barW * 0.5,
      y,
      barW * clamp(boss.hp / boss.maxHp, 0, 1),
      12,
      6,
    );
    ctx.fill();
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 1.5;
    roundedRectPath(state.layout.track.center - barW * 0.5, y, barW, 12, 6);
    ctx.stroke();
    for (let i = 1; i <= 2; i++) {
      const x = state.layout.track.center - barW * 0.5 + (barW * i) / 3;
      ctx.beginPath();
      ctx.moveTo(x, y - 3);
      ctx.lineTo(x, y + 15);
      ctx.stroke();
    }
    const requiredPatterns = bossPatternRequirement(boss);
    if (requiredPatterns > 1) {
      const pipY = y - 10;
      for (let i = 0; i < requiredPatterns; i++) {
        const px = state.layout.track.center + (i - (requiredPatterns - 1) * 0.5) * 15;
        ctx.fillStyle = i < boss.attacksInStage ? COLORS.ochre : "rgba(33,27,23,.22)";
        ctx.beginPath();
        ctx.arc(px, pipY, 4.2, 0, TAU);
        ctx.fill();
      }
    }
    const pressure = clamp((boss.fightTime || 0) / Math.max(1, boss.deadline || 60), 0, 1);
    ctx.fillStyle = "rgba(33,27,23,.22)";
    roundedRectPath(state.layout.track.center - barW * 0.5, y + 19, barW, 5, 2.5);
    ctx.fill();
    ctx.fillStyle = pressure >= 0.82 ? COLORS.redDark : COLORS.ochre;
    roundedRectPath(state.layout.track.center - barW * 0.5, y + 19, barW * pressure, 5, 2.5);
    ctx.fill();
    ctx.restore();
  }

  function followerPoint(i, form, mastery) {
    if (form === "fan") {
      const row = Math.floor(Math.sqrt(i));
      const start = row * row;
      const inRow = i - start;
      const cells = row * 2 + 1;
      const t = cells <= 1 ? 0.5 : inRow / Math.max(1, cells - 1);
      return { x: (t - 0.5) * (44 + row * 8), y: 24 + row * 13 };
    }
    if (form === "spear") {
      const cols = 3 + mastery;
      const col = i % cols;
      const row = Math.floor(i / cols);
      return { x: (col - (cols - 1) / 2) * 12, y: 20 + row * 12 };
    }
    if (form === "spiral") {
      const ring = Math.floor(i / 10) + 1;
      const index = i % 10;
      const a = (index / 10) * TAU + ring * 0.7;
      return {
        x: Math.cos(a) * (22 + ring * 14),
        y: 34 + Math.sin(a) * (12 + ring * 7) + ring * 7,
      };
    }
    const cols = 5 + mastery;
    return { x: ((i % cols) - (cols - 1) / 2) * 13, y: 24 + Math.floor(i / cols) * 12 };
  }

  function drawFollower(x, y, index, scale = 1) {
    const colors = [COLORS.red, COLORS.indigo, COLORS.ochre, COLORS.green];
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = COLORS.paperHi;
    drawPaperPolygon(
      [
        [-5, -8],
        [4, -9],
        [7, 5],
        [0, 10],
        [-7, 5],
      ],
      COLORS.paperHi,
      "rgba(33,27,23,.45)",
      1,
    );
    ctx.fillStyle = colors[index % colors.length];
    ctx.beginPath();
    ctx.arc(0, -1, 2.2, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawPlayer() {
    const p = state.player;
    if (!p) return;
    const form = FORM[p.form];
    const mastery = p.mastery[p.form];
    const visible = Math.min(72, p.count);
    const overflow = Math.max(0, p.count - visible);
    const bob = reducedMotion() ? 0 : Math.sin(state.renderTime * 7) * 2;
    ctx.save();
    ctx.translate(p.x, p.y + bob);

    if (overflow > 0) {
      const banners = Math.min(4, Math.ceil(overflow / 24));
      for (let i = 0; i < banners; i++) {
        const x = (i - (banners - 1) / 2) * 38;
        ctx.strokeStyle = COLORS.ink;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x, 5);
        ctx.lineTo(x, 76);
        ctx.stroke();
        drawPaperPolygon(
          [
            [x, 5],
            [x + 26, 13],
            [x + 20, 40],
            [x, 34],
          ],
          i % 2 ? COLORS.indigo : COLORS.red,
          COLORS.ink,
          1.5,
        );
        ctx.fillStyle = COLORS.paperHi;
        ctx.font = "900 13px serif";
        ctx.textAlign = "center";
        ctx.fillText("衆", x + 11, 27); // i18n-allow-ornament: crowd flag crest
      }
    }

    for (let i = visible - 1; i >= 0; i--) {
      const pos = followerPoint(i, p.form, mastery);
      const compact = state.layout.short ? 0.7 : state.viewH < 650 ? 0.82 : 1;
      drawFollower(pos.x * compact, pos.y * compact, i, (p.count > 100 ? 0.82 : 0.9) * compact);
    }

    if (p.form === "spiral") {
      const orbitCount = 4 + mastery * 2;
      for (let i = 0; i < orbitCount; i++) {
        const a =
          (reducedMotion() ? 0 : state.renderTime * (2.3 + mastery * 0.3)) + (i / orbitCount) * TAU;
        const r = 44 + mastery * 7;
        ctx.save();
        ctx.translate(Math.cos(a) * r, Math.sin(a) * r * 0.48 + 10);
        ctx.rotate(a + Math.PI * 0.5);
        drawPaperPolygon(
          [
            [-4, -10],
            [4, -10],
            [6, 8],
            [0, 13],
            [-6, 8],
          ],
          COLORS.green,
          COLORS.ink,
          1,
        );
        ctx.restore();
      }
    }

    if (p.stampTimer > 0) {
      const pulse = reducedMotion() ? 62 : 62 + Math.sin(state.renderTime * 12) * 7;
      ctx.globalAlpha = 0.2 + p.stampTimer * 0.08;
      ctx.strokeStyle = COLORS.ochre;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(0, -10, pulse, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.shadowColor = "rgba(33,27,23,.35)";
    ctx.shadowBlur = state.quality.level === "low" ? 0 : 8;
    ctx.shadowOffsetY = 5;
    roundedRectPath(-28, -38, 56, 56, 12);
    ctx.fillStyle = COLORS.ink;
    ctx.fill();
    roundedRectPath(-21, -31, 42, 42, 9);
    ctx.fillStyle = form.color;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.beginPath();
    ctx.arc(0, -10, 15, 0, TAU);
    ctx.fillStyle = COLORS.paperHi;
    ctx.fill();
    ctx.fillStyle = COLORS.ink;
    ctx.font = "900 19px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(form.icon, 0, -10);

    if (p.shield > 0) {
      for (let i = 0; i < Math.min(3, p.shield); i++) {
        ctx.strokeStyle = COLORS.green;
        ctx.globalAlpha = 0.62 - i * 0.12;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, -8, 40 + i * 8, Math.PI * 1.06, Math.PI * 1.94);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = COLORS.ink;
    ctx.font = `900 ${p.count >= 100 ? 18 : 20}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`×${p.count}`, 0, -53);
    ctx.restore();
  }

  function drawParticles() {
    for (const p of state.particles) {
      const a = clamp(p.life / p.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      if (p.kind === "follower") drawFollower(0, 0, 0, 0.75);
      else {
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size * 0.5, -p.size * 0.35, p.size, p.size * 0.7);
      }
      ctx.restore();
    }
  }

  function drawTexts() {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const t of state.texts) {
      const a = clamp(t.life / t.maxLife, 0, 1);
      ctx.globalAlpha = Math.min(1, a * 1.7);
      ctx.font = `900 ${t.size}px "Yu Gothic UI", serif`;
      ctx.lineWidth = Math.max(2, t.size * 0.1);
      ctx.strokeStyle = COLORS.paperHi;
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.restore();
  }

  function drawHudChip(x, y, w, h, icon, value, color) {
    ctx.save();
    ctx.fillStyle = "rgba(248,240,220,.90)";
    roundedRectPath(x, y, w, h, 12);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + h * 0.5, y + h * 0.5, h * 0.34, 0, TAU);
    ctx.fill();
    ctx.fillStyle = COLORS.paperHi;
    ctx.font = `900 ${Math.max(12, h * 0.36)}px serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(icon, x + h * 0.5, y + h * 0.5 + 1);
    ctx.fillStyle = COLORS.ink;
    ctx.font = `900 ${Math.max(14, h * 0.43)}px sans-serif`;
    ctx.textAlign = "right";
    ctx.fillText(value, x + w - 8, y + h * 0.52);
    ctx.restore();
  }

  function drawProgress(x, y, width) {
    const total = 5;
    let active = Math.min(3, state.encounterIndex);
    if (state.encounterIndex >= 3 && state.currentEncounter?.bossPrep && state.phase === "gate")
      active = 3;
    if (["bossIntro", "bossFight", "bossDefeat"].includes(state.phase) || state.boss) active = 4;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(33,27,23,.24)";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + width, y);
    ctx.stroke();
    const progressX = x + (width * active) / (total - 1);
    ctx.strokeStyle = state.difficulty === "hard" ? COLORS.redDark : COLORS.ochre;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(progressX, y);
    ctx.stroke();
    for (let i = 0; i < total; i++) {
      const px = x + (width * i) / (total - 1);
      const reached = i <= active;
      ctx.beginPath();
      if (i === 3) {
        ctx.moveTo(px, y - 7);
        ctx.lineTo(px + 7, y);
        ctx.lineTo(px, y + 7);
        ctx.lineTo(px - 7, y);
        ctx.closePath();
      } else ctx.arc(px, y, i === 4 ? 8 : 6, 0, TAU);
      const accent =
        i === 4 ? COLORS.red : state.difficulty === "hard" ? COLORS.redDark : COLORS.ochre;
      ctx.fillStyle = reached ? accent : COLORS.paperHi;
      ctx.fill();
      ctx.strokeStyle = COLORS.ink;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawHUD() {
    if (
      !state.player ||
      !["playing", "boss", "transition", "paused", "choice", "result"].includes(state.mode)
    )
      return;
    const p = state.player;
    const w = state.viewW;
    const compact = w < 560;
    const top = (state.layout.safe?.top || 0) + 8;
    const safeLeft = state.layout.safe?.left || 0;
    const safeRight = state.layout.safe?.right || 0;
    const modePrefix = hardPrefix();
    if (compact) {
      const reserve = 52,
        gap = 4,
        x0 = safeLeft + 6;
      const totalW = w - safeLeft - safeRight - reserve - 12;
      const chipW = (totalW - gap * 3) / 4;
      const h = 35;
      drawHudChip(x0, top, chipW, h, t("canvas.hud.count"), `${p.count}`, COLORS.indigo);
      drawHudChip(
        x0 + (chipW + gap),
        top,
        chipW,
        h,
        t("canvas.hud.power"),
        `${p.power}`,
        COLORS.red,
      );
      drawHudChip(
        x0 + (chipW + gap) * 2,
        top,
        chipW,
        h,
        t("canvas.hud.tempo"),
        `${p.tempo.toFixed(1)}`,
        COLORS.ochre,
      );
      drawHudChip(
        x0 + (chipW + gap) * 3,
        top,
        chipW,
        h,
        t("canvas.hud.shield"),
        `${p.shield}`,
        COLORS.green,
      );
      ctx.fillStyle = state.difficulty === "hard" ? COLORS.redDark : COLORS.ink;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = "900 12px sans-serif";
      ctx.fillText(
        t("canvas.actCompact", { hard: modePrefix, act: actSubtitle(), name: actName() }),
        safeLeft + 8,
        top + 53,
      );
      drawProgress(
        Math.max(safeLeft + 98, state.layout.track.center - 62),
        top + 53,
        Math.min(124, state.layout.track.width * 0.37),
      );
      ctx.textAlign = "right";
      ctx.font = "900 14px sans-serif";
      ctx.fillText(pretty(state.score), w - safeRight - 8, top + 53);
    } else {
      const h = 39,
        chipW = 92,
        gap = 7,
        x0 = safeLeft + 14;
      drawHudChip(x0, top, chipW, h, t("canvas.hud.count"), `${p.count}`, COLORS.indigo);
      drawHudChip(
        x0 + (chipW + gap),
        top,
        chipW,
        h,
        t("canvas.hud.power"),
        `${p.power}`,
        COLORS.red,
      );
      drawHudChip(
        x0 + (chipW + gap) * 2,
        top,
        chipW,
        h,
        t("canvas.hud.tempo"),
        `${p.tempo.toFixed(1)}`,
        COLORS.ochre,
      );
      drawHudChip(
        x0 + (chipW + gap) * 3,
        top,
        chipW,
        h,
        t("canvas.hud.shield"),
        `${p.shield}`,
        COLORS.green,
      );
      ctx.fillStyle = state.difficulty === "hard" ? COLORS.redDark : COLORS.ink;
      ctx.textAlign = "center";
      ctx.font = "900 13px sans-serif";
      ctx.fillText(
        t("canvas.actWide", { hard: modePrefix, act: actSubtitle(), name: actName() }),
        state.layout.track.center,
        top + 12,
      );
      drawProgress(state.layout.track.center - 128, top + 31, 256);
      ctx.textAlign = "right";
      ctx.font = "900 21px sans-serif";
      ctx.fillText(pretty(state.score), w - safeRight - 60, top + 22);
    }

    const meterW = compact ? Math.min(180, state.layout.track.width * 0.58) : 230;
    const meterX = Math.max(safeLeft + 10, state.layout.track.left + 8);
    const meterY = state.viewH - (state.layout.safe?.bottom || 0) - 25;
    ctx.save();
    ctx.fillStyle = "rgba(33,27,23,.24)";
    roundedRectPath(meterX, meterY, meterW, 10, 5);
    ctx.fill();
    const fill = (meterW * p.momentum) / 100;
    if (fill > 0) {
      ctx.fillStyle = p.momentum >= 100 ? COLORS.red : COLORS.ochre;
      roundedRectPath(meterX, meterY, fill, 10, 5);
      ctx.fill();
    }
    ctx.fillStyle = COLORS.ink;
    ctx.font = "800 11px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(t("canvas.momentum", { value: Math.floor(p.momentum) }), meterX, meterY - 5);
    ctx.textAlign = "right";
    ctx.fillStyle = FORM[p.form].color;
    ctx.fillText(
      `${FORM[p.form].icon}${"ⅠⅡⅢ"[p.mastery[p.form] - 1] || ""}`,
      meterX + meterW,
      meterY - 5,
    );
    ctx.restore();
  }

  function drawFirstGateGuide() {
    if (
      state.profile.tutorial.seen ||
      state.difficulty !== "normal" ||
      state.phase !== "gate" ||
      state.act !== 1 ||
      state.encounterIndex !== 0 ||
      !state.player
    )
      return;
    const reduced = reducedMotion();
    const t = reduced ? 0.75 : (state.phaseTimer * 0.62) % 2;
    const sweep = t < 1 ? t : 2 - t;
    const from = 0.36,
      to = 0.64;
    const nx = lerp(from, to, sweep);
    const y = Math.min(state.viewH - (state.layout.safe?.bottom || 0) - 54, state.player.y + 82);
    ctx.save();
    ctx.globalAlpha = 0.72;
    ctx.strokeStyle = COLORS.redDark;
    ctx.lineWidth = 3;
    ctx.setLineDash([7, 8]);
    ctx.beginPath();
    ctx.moveTo(nxToX(from), y);
    ctx.lineTo(nxToX(to), y);
    ctx.stroke();
    ctx.setLineDash([]);
    for (const dir of [-1, 1]) {
      const x = nxToX(0.5 + dir * 0.18);
      ctx.beginPath();
      ctx.moveTo(x - dir * 9, y - 8);
      ctx.lineTo(x, y);
      ctx.lineTo(x - dir * 9, y + 8);
      ctx.stroke();
    }
    const x = nxToX(nx);
    ctx.fillStyle = COLORS.paperHi;
    ctx.beginPath();
    ctx.arc(x, y, 17, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = COLORS.redDark;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = COLORS.red;
    ctx.beginPath();
    ctx.arc(x, y - 2, 7, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.36;
    ctx.strokeStyle = COLORS.ochre;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x, y - 20);
    ctx.lineTo(state.player.x, state.player.y + 10);
    ctx.stroke();
    ctx.restore();
  }

  function drawAttract() {
    const tr = state.layout.track;
    const t = state.renderTime;
    const y = state.viewH * 0.72 + Math.sin(t * 1.2) * 5;
    ctx.save();
    ctx.globalAlpha = 0.28;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      drawFollower(tr.center + Math.cos(a) * 62, y + Math.sin(a) * 22, i, 0.9);
    }
    ctx.fillStyle = COLORS.red;
    roundedRectPath(tr.center - 22, y - 43, 44, 44, 9);
    ctx.fill();
    ctx.fillStyle = COLORS.paperHi;
    ctx.font = "900 22px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("走", tr.center, y - 21); // i18n-allow-ornament: runner crest
    ctx.restore();
  }

  function render() {
    const reduced = reducedMotion();
    renderer.renderFrame(
      {
        width: state.viewW,
        height: state.viewH,
        renderTime: state.renderTime,
        shake: state.shake,
        screenShake: !reduced && hostSettings.motion.screenShake,
        flash: state.flash,
        flashColor: COLORS.paperHi,
      },
      () => {
        drawBackground();
        drawPaperGrain();
        drawSpeedCuts();
        drawContactShadows();
        if (state.mode === "title") drawAttract();
        if (state.player) {
          drawThreatPreview();
          drawGateFocus();
          drawHazards();
          for (const gate of state.gates) drawGate(gate);
          drawBullets();
          const liveCount = state.enemies.reduce(
            (n, enemy) => n + (!enemy.dead || enemy.isBoss ? 1 : 0),
            0,
          );
          const denseThreshold = state.quality.level === "low" ? 48 : 88;
          if (liveCount > denseThreshold) {
            ctx.save();
            for (const enemy of state.enemies) {
              if (enemy.dead && !enemy.isBoss) continue;
              if (enemy.isBoss) drawEnemy(enemy);
              else drawEnemyLite(enemy);
            }
            ctx.restore();
          } else {
            for (const enemy of state.enemies) if (!enemy.dead || enemy.isBoss) drawEnemy(enemy);
          }
          drawEnemyShots();
          drawPlayer();
          drawFirstGateGuide();
          drawParticles();
          drawTexts();
          drawHUD();
          drawPhaseCallout();
        }
        drawVignette();
        drawBossCurtain();
      },
    );
  }

  // V4 presentation layer: paper-cut theatre depth, staged cues and graded feedback.
  const visualState = { lastPhase: "", lastAct: 0, phasePulse: 0, actPulse: 0 };

  function drawPaperGrain() {
    if (state.quality.level === "low") return;
    ctx.save();
    ctx.globalAlpha = reducedMotion() ? 0.035 : 0.05;
    ctx.fillStyle = COLORS.ink;
    const step = 31;
    const drift = reducedMotion() ? 0 : (state.renderTime * 5) % step;
    for (let y = -step + drift; y < state.viewH + step; y += step) {
      for (let x = Math.floor(y / step) & 1 ? 13 : 0; x < state.viewW; x += step) {
        const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
        const r = n - Math.floor(n);
        ctx.fillRect(x + r * 11, y + r * 5, r > 0.78 ? 2 : 1, 1);
      }
    }
    ctx.globalAlpha = 0.025;
    ctx.strokeStyle = COLORS.ink2;
    ctx.lineWidth = 1;
    for (let y = 18; y < state.viewH; y += 47) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(state.viewW * 0.3, y + 2, state.viewW * 0.7, y - 2, state.viewW, y + 1);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawContactShadows() {
    if (!state.player) return;
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = COLORS.ink;
    for (const e of state.enemies) {
      if (e.dead || e.y < state.layout.track.top - 40 || e.y > state.viewH + 30) continue;
      const rx = e.radius * (e.isBoss ? 1.35 : 0.85);
      ctx.beginPath();
      ctx.ellipse(e.x + 6, e.y + e.radius * 0.78, rx, Math.max(3, e.radius * 0.22), 0, 0, TAU);
      ctx.fill();
    }
    const p = state.player;
    ctx.globalAlpha = 0.16;
    ctx.beginPath();
    ctx.ellipse(
      p.x + 5,
      p.y + 38,
      Math.max(22, Math.min(86, 22 + Math.sqrt(p.count) * 4.2)),
      8,
      0,
      0,
      TAU,
    );
    ctx.fill();
    ctx.restore();
  }

  function drawSpeedCuts() {
    if (reducedMotion() || !["combat", "bossFight"].includes(state.phase)) return;
    const intensity = clamp((state.enemies.length + state.enemyShots.length * 0.6) / 42, 0, 1);
    if (intensity < 0.18) return;
    ctx.save();
    ctx.globalAlpha = 0.045 + intensity * 0.075;
    ctx.strokeStyle = state.difficulty === "hard" ? COLORS.redDark : COLORS.ink2;
    ctx.lineWidth = 1.2;
    const cx = state.layout.track.center,
      cy = state.layout.playerY;
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU + Math.sin(i * 9.7) * 0.15;
      const r0 = 110 + ((i * 37) % 90),
        r1 = r0 + 70 + intensity * 100;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPhaseCallout() {
    const changed = visualState.lastPhase !== state.phase || visualState.lastAct !== state.act;
    if (changed) {
      visualState.phasePulse = 1;
      if (visualState.lastAct !== state.act) visualState.actPulse = 1;
      visualState.lastPhase = state.phase;
      visualState.lastAct = state.act;
    }
    visualState.phasePulse = Math.max(0, visualState.phasePulse - FIXED_DT * 0.78);
    visualState.actPulse = Math.max(0, visualState.actPulse - FIXED_DT * 0.48);
    const pulse = Math.max(visualState.phasePulse, visualState.actPulse);
    if (pulse <= 0 || state.mode === "title") return;
    let title = "",
      sub = "";
    if (state.phase === "gate") {
      title = state.currentEncounter?.bossPrep ? t("canvas.phase.prepare") : t("canvas.phase.gate");
      sub = encounterName(state.currentEncounter);
    } else if (state.phase === "combat") {
      title = encounterStage(state.currentEncounter) || t("canvas.phase.advance");
      sub = encounterName(state.currentEncounter);
    } else if (state.phase === "bossIntro") {
      title = t("canvas.phase.boss");
      sub = t(`boss.${ACT_DATA[state.act].boss}`);
    } else if (state.phase === "bossDefeat") {
      title = t("canvas.phase.settle");
      sub = t("canvas.phase.bound");
    } else if (state.phase === "waveClear") {
      title = t("canvas.phase.break");
      sub = t("canvas.phase.open");
    }
    if (!title) return;
    const progress = 1 - pulse;
    const a = reducedMotion()
      ? clamp(pulse * 2.2, 0, 1)
      : Math.sin(Math.min(1, progress) * Math.PI) * clamp(pulse * 2.2, 0, 1);
    const y = state.layout.track.top + 64 + (reducedMotion() ? 0 : (1 - a) * -16);
    ctx.save();
    ctx.globalAlpha = a;
    const w = Math.min(250, state.layout.track.width * 0.62),
      h = 46;
    ctx.translate(state.layout.track.center, y);
    ctx.rotate(-0.012);
    ctx.fillStyle = "rgba(248,240,220,.92)";
    ctx.shadowColor = "rgba(33,27,23,.25)";
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 7;
    drawPaperPolygon(
      [
        [-w / 2 + 9, -h / 2],
        [w / 2, -h / 2 + 3],
        [w / 2 - 8, h / 2],
        [-w / 2, h / 2 - 4],
      ],
      "rgba(248,240,220,.94)",
      COLORS.ink,
      2,
    );
    ctx.shadowColor = "transparent";
    ctx.fillStyle = state.difficulty === "hard" ? COLORS.redDark : COLORS.red;
    ctx.fillRect(-w / 2 + 14, -h / 2 + 10, 6, h - 20);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = COLORS.ink;
    ctx.font = "900 21px serif";
    ctx.fillText(title, 0, -4);
    ctx.font = "800 10px sans-serif";
    ctx.fillStyle = COLORS.ink2;
    ctx.fillText(sub, 0, 13);
    ctx.restore();
  }

  function drawBossCurtain() {
    if (state.phase !== "bossIntro") return;
    const t = clamp(state.phaseTimer / Math.max(0.01, state.phaseDuration), 0, 1);
    const open = reducedMotion() ? t : Math.pow(t, 0.72);
    const sideW = state.viewW * 0.5 * (1 - open);
    ctx.save();
    ctx.fillStyle = state.difficulty === "hard" ? COLORS.redDark : COLORS.ink;
    ctx.globalAlpha = 0.88 * (1 - t * 0.65);
    ctx.fillRect(0, 0, sideW, state.viewH);
    ctx.fillRect(state.viewW - sideW, 0, sideW, state.viewH);
    ctx.strokeStyle = COLORS.ochre;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(sideW, 0);
    ctx.lineTo(sideW, state.viewH);
    ctx.moveTo(state.viewW - sideW, 0);
    ctx.lineTo(state.viewW - sideW, state.viewH);
    ctx.stroke();
    ctx.restore();
  }

  function drawVignette() {
    if (state.quality.level === "low") return;
    const g = ctx.createRadialGradient(
      state.viewW * 0.5,
      state.viewH * 0.55,
      state.viewW * 0.15,
      state.viewW * 0.5,
      state.viewH * 0.55,
      state.viewW * 0.72,
    );
    g.addColorStop(0.55, "rgba(20,14,10,0)");
    g.addColorStop(1, state.act === 3 ? "rgba(12,17,28,.25)" : "rgba(45,28,14,.18)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, state.viewW, state.viewH);
  }

  function chooseQuality() {
    const q = state.profile.settings.quality;
    if (q === "high" || q === "low") return q;
    const memory = navigator.deviceMemory || 8;
    const cores = navigator.hardwareConcurrency || 8;
    return memory <= 4 || cores <= 4 ? "low" : "high";
  }

  function fixedUpdate(dt) {
    if (!["playing", "boss", "transition"].includes(state.mode)) return;
    if (state.hitStop > 0) {
      state.hitStop = Math.max(0, state.hitStop - dt);
      updateParticles(dt * 0.18);
      return;
    }
    updateActive(dt);
  }

  function loop(now) {
    if (!state.lastTime) state.lastTime = now;
    const rawDt = Math.min(0.22, Math.max(0, (now - state.lastTime) / 1000));
    state.lastTime = now;
    state.renderTime = now / 1000;
    if (["playing", "boss", "transition"].includes(state.mode)) {
      state.accumulator += rawDt;
      let steps = 0;
      while (state.accumulator >= FIXED_DT && steps < 6) {
        fixedUpdate(FIXED_DT);
        state.accumulator -= FIXED_DT;
        steps++;
      }
      if (steps >= 6) state.accumulator = 0;
    } else state.accumulator = 0;
    render();
  }

  function populateSettings() {
    const hostControls = [
      UI.masterVolume,
      UI.musicVolume,
      UI.sfxVolume,
      UI.motionToggle,
      UI.screenShakeToggle,
    ];
    UI.masterVolume.value = String(hostSettings.audio.master);
    UI.musicVolume.value = String(hostSettings.audio.music);
    UI.sfxVolume.value = String(hostSettings.audio.sfx);
    UI.masterVolumeValue.value = `${Math.round(hostSettings.audio.master * 100)}%`;
    UI.musicVolumeValue.value = `${Math.round(hostSettings.audio.music * 100)}%`;
    UI.sfxVolumeValue.value = `${Math.round(hostSettings.audio.sfx * 100)}%`;
    UI.motionToggle.checked = hostSettings.motion.reduced;
    UI.screenShakeToggle.checked = hostSettings.motion.screenShake;
    UI.settingsRevision.textContent = t("settings.revision", {
      revision: hostSettings.revision,
    });
    for (const control of hostControls) control.disabled = pendingHostSetting !== null;
    if (pendingHostSetting !== null) {
      UI.settingsStatus.dataset.state = "pending";
      UI.settingsStatus.textContent = t("settings.pending");
    } else if (settingsStatusKey !== null) {
      UI.settingsStatus.dataset.state = "error";
      UI.settingsStatus.textContent = t(settingsStatusKey);
    } else {
      UI.settingsStatus.dataset.state = "";
      UI.settingsStatus.textContent = "";
    }
    UI.hapticToggle.checked = !!state.profile.settings.haptic;
    UI.qualitySelect.value = state.profile.settings.quality;
    UI.skinSelect.innerHTML = "";
    for (const skin of SKINS) {
      const unlocked = state.profile.unlocks.skins.includes(skin.id);
      const option = document.createElement("option");
      option.value = skin.id;
      option.disabled = !unlocked;
      const skinName = t(skin.nameKey);
      option.textContent = unlocked
        ? skinName
        : skin.hardOnly
          ? t("skin.lockedHard", { name: skinName })
          : t("skin.lockedSeals", { name: skinName, count: skin.cost });
      UI.skinSelect.appendChild(option);
    }
    UI.skinSelect.value = state.profile.settings.skin;
  }

  function hostSettingValue(settings, key) {
    if (["master", "music", "sfx"].includes(key)) return settings.audio[key];
    if (["reduced", "screenShake"].includes(key)) return settings.motion[key];
    throw new RangeError(`Unknown Host setting: ${key}`);
  }

  function requestHostSetting(key, value) {
    if (pendingHostSetting !== null) {
      populateSettings();
      return;
    }
    const change = ["master", "music", "sfx"].includes(key)
      ? { audio: { [key]: value } }
      : { motion: { [key]: value } };
    settingsStatusKey = null;
    pendingHostSetting = { key, value, afterRevision: hostSettings.revision };
    populateSettings();
    try {
      host.requestSettingsChange(change);
    } catch {
      pendingHostSetting = null;
      settingsStatusKey = "settings.requestError";
      populateSettings();
    }
  }

  function renderRecords() {
    const normal = state.profile.records.normal;
    const hard = state.profile.records.hard;
    UI.recordSummary.classList.add("record-ledger");
    const timeText = (rec) =>
      rec.bestTime > 0
        ? `${Math.floor(rec.bestTime / 60)}:${String(Math.floor(rec.bestTime % 60)).padStart(2, "0")}`
        : "—";
    UI.recordSummary.innerHTML = `
      <div class="record-mode-heading">${t("mode.normal")}</div>
      <div class="record-summary mode-records">
        <div class="record-cell"><b>${pretty(normal.best)}</b><span>${t("records.best")}</span></div>
        <div class="record-cell"><b>${normal.clears}</b><span>${t("records.clears")}</span></div>
        <div class="record-cell"><b>${timeText(normal)}</b><span>${t("records.fastest")}</span></div>
      </div>
      <div class="record-mode-heading is-hard">${t("mode.hard")}</div>
      <div class="record-summary mode-records">
        <div class="record-cell"><b>${state.profile.unlocks.hard ? pretty(hard.best) : "—"}</b><span>${t("records.best")}</span></div>
        <div class="record-cell"><b>${state.profile.unlocks.hard ? hard.clears : "—"}</b><span>${t("records.clears")}</span></div>
        <div class="record-cell"><b>${state.profile.unlocks.hard ? timeText(hard) : t("records.locked")}</b><span>${t("records.fastest")}</span></div>
      </div>
      <div class="record-mode-heading">${t("records.totalSeals", { count: state.profile.records.totalSeals })}</div>`;
    UI.skinGallery.innerHTML = "";
    for (const skin of SKINS) {
      const unlocked = state.profile.unlocks.skins.includes(skin.id);
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.skin = skin.id;
      button.className = `skin-swatch${unlocked ? "" : " is-locked"}${state.profile.settings.skin === skin.id ? " is-selected" : ""}`;
      button.style.background = `linear-gradient(135deg, ${skin.paper} 0 55%, ${skin.deep} 55% 72%, ${skin.accent} 72%)`;
      const skinName = t(skin.nameKey);
      const condition = skin.hardOnly
        ? t("skin.unlockHard")
        : t("skin.unlockSeals", { count: skin.cost });
      button.setAttribute(
        "aria-label",
        unlocked
          ? t("skin.choose", { name: skinName })
          : t("skin.lockedLabel", { name: skinName, condition }),
      );
      button.disabled = !unlocked;
      UI.skinGallery.appendChild(button);
    }
  }

  function openPanel(name, returnMode) {
    uiProjection.rememberFocus();
    state.panelReturn = returnMode || state.mode || "title";
    state.mode = name;
    if (name === "settings") populateSettings();
    if (name === "records") renderRecords();
    showOverlay(name);
    updateControls();
    sfx("click", 0.45);
  }

  function closePanel(name) {
    if (state.mode !== name) return;
    const target = state.panelReturn || "title";
    state.mode = target;
    showOverlay(target === "paused" ? "pause" : target === "title" ? "title" : null);
    uiProjection.restoreFocus(target === "paused" ? UI.pauseSettings : UI.settingsButton);
    updateControls();
    sfx("click", 0.4);
  }

  function pointerToNx(ev) {
    const rect = canvas.getBoundingClientRect();
    return xToNx(ev.clientX - rect.left);
  }

  const releasePointer = (ev) => {
    if (ev && input.pointerId !== null && ev.pointerId !== input.pointerId) return;
    if (input.pointerId !== null) {
      try {
        canvas.releasePointerCapture(input.pointerId);
      } catch {
        /* ignored */
      }
    }
    input.pointerId = null;
    input.active = false;
  };
  bindInput({
    runtime,
    targetWindow,
    document,
    canvas,
    ui: UI,
    focusManager: uiProjection,
    commands: {
      gameplayActive: () => ["playing", "boss", "transition"].includes(state.mode),
      hasPlayer: () => state.player !== null,
      pointerDown: (ev) => {
        input.pointerId = ev.pointerId;
        input.pointerType = ev.pointerType;
        input.active = true;
        input.targetNx = pointerToNx(ev);
        state.player.targetNx = input.targetNx;
        try {
          canvas.setPointerCapture(ev.pointerId);
        } catch {
          /* ignored */
        }
      },
      pointerMove: (ev) => {
        if (!input.active || ev.pointerId !== input.pointerId) return;
        input.targetNx = pointerToNx(ev);
      },
      pointerRelease: releasePointer,
      setMovement: (direction, pressed) => {
        input[direction] = pressed;
      },
      escape: () => {
        if (state.mode === "settings") closePanel("settings");
        else if (state.mode === "records") closePanel("records");
        else if (state.mode === "paused") host.requestLifecycleChange("resume");
        else if (["choice", "result"].includes(state.mode)) returnToTitle();
        else if (["playing", "boss", "transition"].includes(state.mode))
          host.requestLifecycleChange("pause");
      },
      primary: () => {
        if (["playing", "boss", "transition"].includes(state.mode)) activateStamp(true);
        else if (state.mode === "title") startRun(null, "normal");
        else if (state.mode === "result") startRun(null, state.difficulty);
      },
      startNormal: () => startRun(null, "normal"),
      startHard: () => {
        if (!state.profile.unlocks.hard) {
          toast(t("toast.hardLocked"));
          sfx("fail", 0.4);
          return;
        }
        startRun(null, "hard");
      },
      requestPause: () => host.requestLifecycleChange("pause"),
      requestResume: () => host.requestLifecycleChange("resume"),
      stamp: () => activateStamp(true),
      openPauseSettings: () => openPanel("settings", "paused"),
      returnToTitle,
      openRecords: () => openPanel("records", "title"),
      openSettings: () => openPanel("settings", "title"),
      retry: () => startRun(null, state.difficulty),
      closeSettings: () => closePanel("settings"),
      closeRecords: () => closePanel("records"),
      requestHostSetting,
      setHaptics: (enabled) => {
        state.profile.settings.haptic = enabled;
        haptics.setEnabled(enabled);
        saveProfile();
      },
      setQuality: (quality) => {
        state.profile.settings.quality = quality;
        state.quality.level = chooseQuality();
        saveProfile();
        resize();
      },
      selectSkin: (skin) => {
        if (!state.profile.unlocks.skins.includes(skin)) return;
        applySkin(skin);
        populateSettings();
        renderRecords();
        sfx("click", 0.5);
      },
      requestFullscreen: () => host.requestHostAction("fullscreen.enter"),
      resetProfile: () => {
        if (!window.confirm(t("confirm.reset"))) return;
        state.profile = cloneDefaultProfile();
        saveProfile();
        applySkin("washi");
        populateSettings();
        renderRecords();
        refreshModeButtons();
        toast(t("toast.reset"));
      },
      chooseCharm: (id) => {
        if (id) selectCharm(id);
      },
      resize,
    },
  });

  function debugSnapshot() {
    return {
      mode: state.mode,
      phase: state.phase,
      phaseTimer: state.phaseTimer,
      difficulty: state.difficulty,
      bossPrepared: state.bossPrepared,
      currentEncounter: state.currentEncounter
        ? {
            id: state.currentEncounter.id,
            kind: state.currentEncounter.kind,
            name: encounterName(state.currentEncounter),
            stage: encounterStage(state.currentEncounter),
            strength: state.currentEncounter.strength,
            variant: state.currentEncounter.variant,
            bossPrep: !!state.currentEncounter.bossPrep,
          }
        : null,
      seed: state.seed,
      act: state.act,
      encounterIndex: state.encounterIndex,
      score: state.score,
      runTime: state.runTime,
      player: state.player
        ? {
            nx: state.player.nx,
            count: state.player.count,
            power: state.player.power,
            tempo: state.player.tempo,
            shield: state.player.shield,
            form: state.player.form,
            mastery: { ...state.player.mastery },
            momentum: state.player.momentum,
            charms: state.player.charms.slice(),
          }
        : null,
      gates: state.gates.map((g) => ({
        lane: g.lane,
        kind: g.option.kind,
        form: g.option.form || null,
        charge: g.charge,
        tier: g.tier,
        selected: g.id === state.focusGateId,
        y: g.y,
      })),
      enemies: state.enemies
        .filter((e) => !e.dead)
        .map((e) => ({
          kind: e.kind,
          bossType: e.bossType || null,
          nx: e.nx,
          y: e.y,
          hp: e.hp,
          maxHp: e.maxHp,
          chargeState: e.chargeState || null,
          pulses: e.pulses || 0,
        })),
      enemyShots: state.enemyShots.length,
      hazards: state.hazards.length,
      bullets: state.bullets.length,
      boss: state.boss
        ? {
            type: state.boss.bossType,
            hp: state.boss.hp,
            maxHp: state.boss.maxHp,
            fightTime: state.boss.fightTime,
            deadline: state.boss.deadline,
            rage: state.boss.rage,
            openLane: state.boss.openLane,
            phaseStage: state.boss.phaseStage,
            attackIndex: state.boss.attackIndex,
            attackPending: state.boss.attackPending,
          }
        : null,
      layout: state.layout
        ? {
            track: { ...state.layout.track },
            playerY: state.layout.playerY,
            safe: { ...state.layout.safe },
          }
        : null,
      stats: {
        ...state.stats,
        gateHistory: state.stats.gateHistory.slice(),
        bossTimes: state.stats.bossTimes.slice(),
      },
    };
  }

  const createTestkit = () => ({
    start: (seed, difficulty = "normal") => startRun(seed, difficulty),
    step: (seconds) => {
      const steps = Math.max(1, Math.ceil(seconds / FIXED_DT));
      for (let i = 0; i < steps; i++) fixedUpdate(FIXED_DT);
      render();
      return debugSnapshot();
    },
    advance: (seconds) => {
      const steps = Math.max(1, Math.ceil(seconds / FIXED_DT));
      for (let i = 0; i < steps; i++) fixedUpdate(FIXED_DT);
      return debugSnapshot();
    },
    setInput: (nx) => {
      input.active = true;
      input.targetNx = clamp(nx, 0, 1);
      if (state.player) state.player.targetNx = input.targetNx;
    },
    releaseInput: () => {
      input.active = false;
    },
    stamp: () => activateStamp(true),
    choose: (index) => {
      const button = UI.choiceList.querySelectorAll("[data-charm]")[index];
      if (button) selectCharm(button.dataset.charm);
    },
    snapshot: debugSnapshot,
    state,
    input,
    renderOnly: render,
    spawnBoss,
    spawnEnemy,
    damageEnemy,
    footprint: playerFootprint,
    hurt: hurtPlayer,
    applyGate,
    beginGate,
    endRun,
    unlockHard: () => {
      state.profile.unlocks.hard = true;
      saveProfile();
      refreshModeButtons();
    },
    setInvulnerable: (enabled) => {
      if (state.player) state.player.invuln = enabled ? 1e9 : 0;
    },
  });

  state.quality.level = chooseQuality();
  unlockSkins();
  applySkin(state.profile.settings.skin);
  resize();
  populateSettings();
  renderRecords();
  refreshModeButtons();
  showOverlay("title");
  announceCanvas("title");
  updateControls();
  audioEngine.applyHostSettings(hostSettings.audio);
  document.documentElement.dataset.reducedMotion = String(hostSettings.motion.reduced);
  haptics.setEnabled(state.profile.settings.haptic);
  runtime.startFrameLoop(loop);

  const api = {
    applyHostSettings(settings) {
      if (disposed) throw new Error("Kamifuda simulation is disposed.");
      if (settings.revision <= hostSettings.revision) {
        throw new RangeError("Kamifuda Host settings revision must strictly increase.");
      }
      const pending = pendingHostSetting;
      hostSettings = settings;
      audioEngine.applyHostSettings(settings.audio);
      document.documentElement.dataset.reducedMotion = String(settings.motion.reduced);
      pendingHostSetting = null;
      if (pending !== null && hostSettingValue(settings, pending.key) !== pending.value) {
        settingsStatusKey = "settings.rejected";
      } else {
        settingsStatusKey = null;
      }
      populateSettings();
      render();
    },
    applyHostLocale(locale) {
      if (disposed) throw new Error("Kamifuda simulation is disposed.");
      i18n.setLocale(locale.resolved);
      i18n.applyDocument(document);
      populateSettings();
      renderRecords();
      refreshModeButtons();
      if (state.mode === "choice") {
        UI.choiceActLabel.textContent = t("choice.act", {
          hard: state.difficulty === "hard" ? t("canvas.hardPrefix") : "",
          act: t(`act.number.${state.act}`),
        });
        for (const button of UI.choiceList.querySelectorAll("[data-charm]")) {
          const charm = CHARM_POOL[button.dataset.charm];
          button.querySelector("h3").textContent = t(charm.nameKey);
          button.querySelector("p").textContent = t(charm.descKey);
        }
      }
      if (state.result?.finalized) renderResult(state.result);
      renderCanvasStatus();
      render();
    },
    releaseAllInput: resetInput,
    hostPause() {
      resetInput();
      pauseGame();
    },
    hostResume() {
      state.lastTime = 0;
      state.accumulator = 0;
      resumeGame();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      resetInput();
      clearObjects();
      state.player = null;
      state.encounters.length = 0;
      state.currentEncounter = null;
      state.result = null;
      state.transition = null;
      UI.choiceList.replaceChildren();
      UI.skinGallery.replaceChildren();
    },
  };
  if (__GAMEYARD_TESTKIT__) api.testkit = createTestkit;
  return api;
}
