const cueBases = {
  gate: 660,
  tier: 820,
  kill: 410,
  shot: 190,
  choice: 560,
  shield: 350,
  near: 1020,
  ready: 760,
  fail: 170,
  click: 520,
  boss: 95,
};

export function createAudioEngine(targetWindow) {
  let context = null;
  let masterGain = null;
  let musicGain = null;
  let sfxGain = null;
  let noise = null;
  let voices = 0;
  let disposed = false;
  let host = { master: 1, music: 1, sfx: 1 };
  const last = new Map();

  function applyGains() {
    if (!context || !masterGain || !musicGain || !sfxGain) return;
    const now = context.currentTime;
    const applyGain = (gain, value) => {
      gain.cancelScheduledValues(now);
      if (value === 0) gain.setValueAtTime(0, now);
      else gain.setTargetAtTime(value, now, 0.02);
    };
    applyGain(masterGain.gain, host.master * 0.34);
    applyGain(musicGain.gain, host.music);
    applyGain(sfxGain.gain, host.sfx);
  }

  function ensureContext() {
    if (disposed || context || host.master === 0) return;
    const AudioContext = targetWindow.AudioContext || targetWindow.webkitAudioContext;
    if (!AudioContext) return;
    context = new AudioContext();
    masterGain = context.createGain();
    musicGain = context.createGain();
    sfxGain = context.createGain();
    musicGain.connect(masterGain);
    sfxGain.connect(masterGain);
    masterGain.connect(context.destination);
    noise = context.createBuffer(1, Math.floor(context.sampleRate * 0.35), context.sampleRate);
    const data = noise.getChannelData(0);
    let previous = 0;
    let seed = 0x7347ac21;
    for (let index = 0; index < data.length; index += 1) {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      previous = previous * 0.86 + (((seed >>> 0) / 4294967296) * 2 - 1) * 0.14;
      data[index] = previous * (1 - index / data.length);
    }
    applyGains();
  }

  function play(name, volume = 1, pitch = 1, bus = "sfx") {
    if (disposed) return;
    ensureContext();
    if (!context || !noise || !musicGain || !sfxGain || voices >= 22) return;
    const busValue = bus === "music" ? host.music : host.sfx;
    if (host.master === 0 || busValue === 0) return;
    const nowPerformance = targetWindow.performance.now();
    const minimumGap = name === "kill" ? 38 : name === "shot" ? 70 : 12;
    if ((last.get(name) || 0) + minimumGap > nowPerformance) return;
    last.set(name, nowPerformance);
    if (context.state === "suspended") void context.resume();
    const now = context.currentTime;
    voices += 1;
    const gain = context.createGain();
    const filter = context.createBiquadFilter();
    gain.gain.value = 0.0001;
    filter.type = "lowpass";
    filter.frequency.value = 2200;
    gain.connect(filter);
    filter.connect(bus === "music" ? musicGain : sfxGain);
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      voices = Math.max(0, voices - 1);
    };
    const envelope = (peak, attack, decay) => {
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * volume), now + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + decay);
    };
    if (["boom", "hurt", "stamp", "drum"].includes(name)) {
      const source = context.createBufferSource();
      source.buffer = noise;
      const base = name === "hurt" ? 620 : name === "stamp" ? 260 : 340;
      filter.frequency.setValueAtTime(base * pitch, now);
      filter.frequency.exponentialRampToValueAtTime(90, now + 0.22);
      envelope(name === "stamp" ? 0.44 : 0.28, 0.008, name === "stamp" ? 0.34 : 0.23);
      source.connect(gain);
      source.onended = finish;
      source.start(now);
      source.stop(now + 0.35);
      return;
    }
    const oscillator = context.createOscillator();
    oscillator.type =
      name === "tier" || name === "near" ? "square" : name === "boss" ? "sawtooth" : "triangle";
    const base = (cueBases[name] || 440) * pitch;
    oscillator.frequency.setValueAtTime(base, now);
    if (["gate", "choice", "tier"].includes(name)) {
      oscillator.frequency.exponentialRampToValueAtTime(base * 1.55, now + 0.15);
    } else {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(50, base * 0.58), now + 0.12);
    }
    envelope(
      name === "ready" ? 0.14 : name === "boss" ? 0.12 : 0.09,
      0.008,
      name === "boss" ? 0.3 : 0.16,
    );
    oscillator.connect(gain);
    oscillator.onended = finish;
    oscillator.start(now);
    oscillator.stop(now + (name === "boss" ? 0.32 : 0.18));
  }

  return {
    applyHostSettings(settings) {
      host = { ...settings };
      applyGains();
    },
    play,
    async pause() {
      if (context?.state === "running") await context.suspend();
    },
    async resume() {
      if (context?.state === "suspended" && host.master > 0) await context.resume();
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      last.clear();
      if (context && context.state !== "closed") await context.close();
      context = null;
      masterGain = null;
      musicGain = null;
      sfxGain = null;
      noise = null;
      voices = 0;
    },
  };
}
