(() => {
  "use strict";
  const PLO = window.PLO;
  const { clamp, lerp } = PLO.util;

  class AudioEngine {
    constructor(settings) {
      this.settings = { ...settings };
      this.ctx = null;
      this.master = null;
      this.sfxGain = null;
      this.musicGain = null;
      this.compressor = null;
      this.noiseBuffer = null;
      this.enabled = false;
      this.unlocked = false;
      this.disposed = false;
      this.musicClock = 0;
      this.nextBeat = 0;
      this.beat = 0;
      this.bpm = 118;
      this.intensity = 0;
      this.targetIntensity = 0;
      this.danger = 0;
      this.musicActive = false;
      this.requestedMusicActive = false;
      this.paused = false;
      this.mutedByVisibility = false;
    }

    async unlock() {
      if (this.disposed) return false;
      if (!this.ctx) this.createContext();
      if (!this.ctx) return false;
      try {
        if (this.ctx.state === "suspended") await this.ctx.resume();
        this.enabled = this.ctx.state === "running";
        this.unlocked = this.enabled;
        this.applySettings(this.settings);
        return this.enabled;
      } catch (err) {
        console.warn("Audio unlock failed:", err);
        return false;
      }
    }

    createContext() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC({ latencyHint: "interactive" });
        this.compressor = this.ctx.createDynamicsCompressor();
        this.compressor.threshold.value = -18;
        this.compressor.knee.value = 16;
        this.compressor.ratio.value = 5;
        this.compressor.attack.value = 0.003;
        this.compressor.release.value = 0.2;
        this.master = this.ctx.createGain();
        this.sfxGain = this.ctx.createGain();
        this.musicGain = this.ctx.createGain();
        this.sfxGain.connect(this.master);
        this.musicGain.connect(this.master);
        this.master.connect(this.compressor);
        this.compressor.connect(this.ctx.destination);
        this.noiseBuffer = this.makeNoiseBuffer(1.5);
        this.applySettings(this.settings);
      } catch (err) {
        console.warn("WebAudio unavailable:", err);
        this.ctx = null;
      }
    }

    makeNoiseBuffer(seconds) {
      const length = Math.floor(this.ctx.sampleRate * seconds);
      const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        last = last * 0.985 + white * 0.15;
        data[i] = white * 0.55 + last * 0.45;
      }
      return buffer;
    }

    applySettings(settings) {
      this.settings = { ...this.settings, ...settings };
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      this.sfxGain.gain.setTargetAtTime(clamp(this.settings.sfx, 0, 1), now, 0.02);
      this.musicGain.gain.setTargetAtTime(clamp(this.settings.music, 0, 1) * 0.42, now, 0.04);
      this.master.gain.setTargetAtTime(this.outputGain(), now, 0.02);
    }

    outputGain() {
      return this.mutedByVisibility || this.paused ? 0 : clamp(this.settings.master, 0, 1);
    }

    setVisible(visible) {
      this.mutedByVisibility = !visible;
      if (this.master && this.ctx)
        this.master.gain.setTargetAtTime(this.outputGain(), this.ctx.currentTime, 0.03);
    }

    setMusicActive(active) {
      this.requestedMusicActive = active;
      this.musicActive = active && !this.paused;
      if (this.musicActive && this.ctx) {
        this.nextBeat = this.ctx.currentTime + 0.04;
        this.beat = 0;
      }
    }

    async setPaused(paused) {
      this.paused = paused;
      this.musicActive = this.requestedMusicActive && !paused;
      if (!this.ctx) return;
      this.master.gain.setTargetAtTime(this.outputGain(), this.ctx.currentTime, 0.02);
      if (paused && this.ctx.state === "running") {
        await this.ctx.suspend();
      } else if (!paused && this.unlocked && this.ctx.state === "suspended") {
        await this.ctx.resume();
        this.enabled = this.ctx.state === "running";
        if (this.musicActive) this.nextBeat = this.ctx.currentTime + 0.04;
      }
    }

    setIntensity(intensity, danger = 0) {
      this.targetIntensity = clamp(intensity, 0, 1);
      this.danger = clamp(danger, 0, 1);
    }

    update(dt) {
      if (!this.ctx || !this.enabled) return;
      this.intensity = lerp(this.intensity, this.targetIntensity, 1 - Math.pow(0.001, dt));
      if (!this.musicActive || this.settings.music <= 0.001) return;
      const bpm = lerp(112, 145, Math.max(this.intensity, this.danger * 0.8));
      const beatDuration = 60 / bpm / 2;
      const horizon = this.ctx.currentTime + 0.12;
      while (this.nextBeat < horizon) {
        this.scheduleBeat(this.nextBeat, this.beat++);
        this.nextBeat += beatDuration;
      }
    }

    scheduleBeat(time, beat) {
      const scale = [0, 3, 5, 7, 10];
      const root = 45 + (Math.floor(beat / 32) % 2) * 2;
      const barStep = beat % 16;
      if (barStep % 4 === 0) {
        const bassDegree = [0, 0, 3, 2][Math.floor(barStep / 4)];
        this.tone(this.midi(root + bassDegree), 0.18, {
          time,
          type: "triangle",
          gain: 0.095,
          destination: this.musicGain,
          attack: 0.004,
          release: 0.16,
          lowpass: 520 + this.intensity * 450,
        });
        this.noise(0.05, {
          time,
          gain: 0.045,
          destination: this.musicGain,
          highpass: 50,
          lowpass: 180,
          decay: 0.045,
        });
      }
      if (barStep % 4 === 2) {
        this.noise(0.045, {
          time,
          gain: 0.027,
          destination: this.musicGain,
          highpass: 1800,
          lowpass: 6500,
          decay: 0.035,
        });
      }
      const density = this.intensity > 0.62 ? 1 : 2;
      if (barStep % density === 0) {
        const idx = (beat * 3 + Math.floor(beat / 8)) % scale.length;
        const octave = beat % 8 >= 4 ? 12 : 0;
        this.tone(this.midi(root + 24 + scale[idx] + octave), 0.08, {
          time,
          type: this.intensity > 0.55 ? "square" : "sine",
          gain: 0.018 + this.intensity * 0.015,
          destination: this.musicGain,
          attack: 0.002,
          release: 0.07,
          lowpass: 1800 + this.intensity * 2200,
        });
      }
      if (this.danger > 0.55 && beat % 2 === 0) {
        this.tone(this.midi(34), 0.07, {
          time,
          type: "sine",
          gain: 0.025 * this.danger,
          destination: this.musicGain,
          attack: 0.002,
          release: 0.06,
        });
      }
    }

    midi(note) {
      return 440 * Math.pow(2, (note - 69) / 12);
    }

    tone(freq, duration, options = {}) {
      if (!this.ctx || (this.settings.sfx <= 0 && options.destination !== this.musicGain))
        return null;
      const now = options.time ?? this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();
      const destination = options.destination || this.sfxGain;
      const attack = options.attack ?? 0.004;
      const release = options.release ?? Math.max(0.03, duration * 0.55);
      const peak = options.gain ?? 0.12;
      osc.type = options.type || "sine";
      osc.frequency.setValueAtTime(Math.max(10, freq), now);
      if (options.endFreq)
        osc.frequency.exponentialRampToValueAtTime(Math.max(10, options.endFreq), now + duration);
      if (options.detune) osc.detune.value = options.detune;
      filter.type = options.filterType || "lowpass";
      filter.frequency.value = options.lowpass || 18000;
      filter.Q.value = options.q || 0.4;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), now + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration + release);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(destination);
      osc.start(now);
      osc.stop(now + duration + release + 0.03);
      return { osc, gain, filter };
    }

    noise(duration, options = {}) {
      if (!this.ctx || !this.noiseBuffer) return null;
      const now = options.time ?? this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      const hp = this.ctx.createBiquadFilter();
      const lp = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();
      src.buffer = this.noiseBuffer;
      hp.type = "highpass";
      hp.frequency.value = options.highpass || 20;
      lp.type = "lowpass";
      lp.frequency.value = options.lowpass || 18000;
      const peak = options.gain ?? 0.08;
      gain.gain.setValueAtTime(peak, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + (options.decay || duration));
      src.connect(hp);
      hp.connect(lp);
      lp.connect(gain);
      gain.connect(options.destination || this.sfxGain);
      src.start(now, Math.random() * Math.max(0.01, this.noiseBuffer.duration - duration));
      src.stop(now + duration + 0.02);
      return { src, gain };
    }

    vibrate(pattern) {
      if (!this.settings.haptics || !navigator.vibrate) return;
      try {
        navigator.vibrate(pattern);
      } catch {
        /* no-op */
      }
    }

    move() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.tone(310, 0.022, {
        time: t,
        type: "triangle",
        gain: 0.027,
        endFreq: 370,
        release: 0.018,
      });
    }
    rotate() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.tone(430, 0.035, { time: t, type: "sine", gain: 0.045, endFreq: 670, release: 0.025 });
      this.tone(650, 0.02, { time: t + 0.026, type: "triangle", gain: 0.022, release: 0.02 });
    }
    softDrop() {
      if (!this.ctx) return;
      this.tone(170, 0.014, { type: "triangle", gain: 0.015, release: 0.012 });
    }
    hardDrop(distance = 4) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.tone(185 + Math.min(distance, 10) * 4, 0.055, {
        time: t,
        type: "square",
        gain: 0.075,
        endFreq: 65,
        release: 0.055,
        lowpass: 1200,
      });
      this.noise(0.07, { time: t + 0.015, gain: 0.085, highpass: 45, lowpass: 680, decay: 0.065 });
      this.vibrate(18);
    }
    lock() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.tone(120, 0.035, { time: t, type: "triangle", gain: 0.035, endFreq: 80, release: 0.03 });
    }
    clear(chain = 1, count = 3) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const root = 60 + Math.min(chain - 1, 7) * 3;
      const notes = count >= 6 ? [0, 4, 7, 12] : [0, 4, 7];
      notes.forEach((n, i) =>
        this.tone(this.midi(root + n), 0.07, {
          time: t + i * 0.028,
          type: chain >= 3 ? "square" : "sine",
          gain: 0.055 + chain * 0.008,
          release: 0.1,
          lowpass: 2600 + chain * 450,
        }),
      );
      this.noise(0.065, {
        time: t,
        gain: 0.04 + Math.min(0.06, count * 0.004),
        highpass: 800,
        lowpass: 7000,
        decay: 0.055,
      });
      this.vibrate(chain >= 3 ? [15, 20, 30] : 12);
    }
    pulse() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      [0, 7, 12, 19].forEach((n, i) =>
        this.tone(this.midi(72 + n), 0.16, {
          time: t + i * 0.035,
          type: "sine",
          gain: 0.06 - i * 0.008,
          release: 0.18,
          lowpass: 9000,
        }),
      );
      this.tone(920, 0.25, { time: t, type: "triangle", gain: 0.045, endFreq: 1650, release: 0.2 });
      this.vibrate([18, 18, 45]);
    }
    attack(lines = 1) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.tone(150, 0.22, {
        time: t,
        type: "sawtooth",
        gain: 0.09 + lines * 0.008,
        endFreq: 980 + lines * 70,
        release: 0.12,
        lowpass: 4300,
      });
      this.tone(75, 0.18, { time: t + 0.12, type: "sine", gain: 0.12, endFreq: 42, release: 0.15 });
      this.noise(0.16, { time: t + 0.1, gain: 0.11, highpass: 150, lowpass: 3800, decay: 0.14 });
      this.vibrate(lines >= 4 ? [35, 25, 60] : [25, 20, 35]);
    }
    defense(power = 1) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.tone(520, 0.18, {
        time: t,
        type: "triangle",
        gain: 0.09,
        endFreq: 220,
        release: 0.16,
        lowpass: 4200,
      });
      this.tone(1040, 0.08, {
        time: t + 0.08,
        type: "sine",
        gain: 0.055,
        endFreq: 780,
        release: 0.12,
      });
      if (power > 2)
        this.tone(1560, 0.13, { time: t + 0.12, type: "sine", gain: 0.035, release: 0.14 });
      this.vibrate([20, 10, 20]);
    }
    warning() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.tone(110, 0.07, { time: t, type: "square", gain: 0.04, release: 0.04, lowpass: 800 });
      this.tone(145, 0.07, {
        time: t + 0.09,
        type: "square",
        gain: 0.04,
        release: 0.04,
        lowpass: 800,
      });
    }
    rise(lines = 1) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.noise(0.18, { time: t, gain: 0.12, highpass: 40, lowpass: 1200, decay: 0.17 });
      this.tone(62, 0.22, {
        time: t,
        type: "sawtooth",
        gain: 0.09 + lines * 0.008,
        endFreq: 95,
        release: 0.15,
        lowpass: 560,
      });
      this.vibrate(lines >= 3 ? [50, 25, 50] : 35);
    }
    cancel() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.tone(900, 0.07, { time: t, type: "sine", gain: 0.065, endFreq: 520, release: 0.09 });
      this.noise(0.05, { time: t, gain: 0.035, highpass: 3000, lowpass: 9000, decay: 0.045 });
    }
    error() {
      if (!this.ctx) return;
      this.tone(92, 0.09, {
        type: "square",
        gain: 0.045,
        endFreq: 75,
        release: 0.06,
        lowpass: 600,
      });
    }
    countdown(n) {
      if (!this.ctx) return;
      this.tone(n === 0 ? 880 : 440, n === 0 ? 0.16 : 0.07, {
        type: "sine",
        gain: 0.08,
        endFreq: n === 0 ? 1320 : 480,
        release: 0.08,
      });
    }
    win() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      [0, 4, 7, 12, 16].forEach((n, i) =>
        this.tone(this.midi(60 + n), 0.16, {
          time: t + i * 0.075,
          type: i > 2 ? "triangle" : "sine",
          gain: 0.07,
          release: 0.24,
        }),
      );
      this.vibrate([30, 30, 30, 30, 80]);
    }
    lose() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      [0, -2, -5, -12].forEach((n, i) =>
        this.tone(this.midi(48 + n), 0.18, {
          time: t + i * 0.11,
          type: "sawtooth",
          gain: 0.06,
          release: 0.18,
          lowpass: 900,
        }),
      );
      this.vibrate([70, 35, 90]);
    }

    async destroy() {
      this.disposed = true;
      this.enabled = false;
      this.musicActive = false;
      this.requestedMusicActive = false;
      try {
        navigator.vibrate?.(0);
      } catch {
        /* no-op */
      }
      if (this.ctx && this.ctx.state !== "closed") await this.ctx.close();
      this.ctx = null;
      this.master = null;
      this.sfxGain = null;
      this.musicGain = null;
      this.compressor = null;
      this.noiseBuffer = null;
    }
  }

  PLO.AudioEngine = AudioEngine;
})();
