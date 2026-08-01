(() => {
  'use strict';
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
      this.musicClock = 0;
      this.nextBeat = 0;
      this.beat = 0;
      this.bpm = 118;
      this.intensity = 0;
      this.targetIntensity = 0;
      this.danger = 0;
      this.musicActive = false;
      this.mutedByVisibility = false;
    }

    async unlock() {
      if (!this.ctx) this.createContext();
      if (!this.ctx) return false;
      try {
        if (this.ctx.state === 'suspended') await this.ctx.resume();
        this.enabled = this.ctx.state === 'running';
        return this.enabled;
      } catch (err) {
        console.warn('Audio unlock failed:', err);
        return false;
      }
    }

    createContext() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC({ latencyHint: 'interactive' });
        this.compressor = this.ctx.createDynamicsCompressor();
        this.compressor.threshold.value = -18;
        this.compressor.knee.value = 16;
        this.compressor.ratio.value = 5;
        this.compressor.attack.value = .003;
        this.compressor.release.value = .2;
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
        console.warn('WebAudio unavailable:', err);
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
        last = last * .985 + white * .15;
        data[i] = white * .55 + last * .45;
      }
      return buffer;
    }

    applySettings(settings) {
      this.settings = { ...this.settings, ...settings };
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      this.sfxGain.gain.setTargetAtTime(clamp(this.settings.sfx, 0, 1), now, .02);
      this.musicGain.gain.setTargetAtTime(clamp(this.settings.music, 0, 1) * .42, now, .04);
      this.master.gain.setTargetAtTime(this.mutedByVisibility ? 0 : 1, now, .02);
    }

    setVisible(visible) {
      this.mutedByVisibility = !visible;
      if (this.master && this.ctx) this.master.gain.setTargetAtTime(visible ? 1 : 0, this.ctx.currentTime, .03);
    }

    setMusicActive(active) {
      this.musicActive = active;
      if (active && this.ctx) {
        this.nextBeat = this.ctx.currentTime + .04;
        this.beat = 0;
      }
    }

    setIntensity(intensity, danger = 0) {
      this.targetIntensity = clamp(intensity, 0, 1);
      this.danger = clamp(danger, 0, 1);
    }

    update(dt) {
      if (!this.ctx || !this.enabled) return;
      this.intensity = lerp(this.intensity, this.targetIntensity, 1 - Math.pow(.001, dt));
      if (!this.musicActive || this.settings.music <= .001) return;
      const bpm = lerp(112, 145, Math.max(this.intensity, this.danger * .8));
      const beatDuration = 60 / bpm / 2;
      const horizon = this.ctx.currentTime + .12;
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
        this.tone(this.midi(root + bassDegree), .18, {
          time, type: 'triangle', gain: .095, destination: this.musicGain,
          attack: .004, release: .16, lowpass: 520 + this.intensity * 450
        });
        this.noise(.05, { time, gain: .045, destination: this.musicGain, highpass: 50, lowpass: 180, decay: .045 });
      }
      if (barStep % 4 === 2) {
        this.noise(.045, { time, gain: .027, destination: this.musicGain, highpass: 1800, lowpass: 6500, decay: .035 });
      }
      const density = this.intensity > .62 ? 1 : 2;
      if (barStep % density === 0) {
        const idx = (beat * 3 + Math.floor(beat / 8)) % scale.length;
        const octave = (beat % 8 >= 4) ? 12 : 0;
        this.tone(this.midi(root + 24 + scale[idx] + octave), .08, {
          time, type: this.intensity > .55 ? 'square' : 'sine', gain: .018 + this.intensity * .015,
          destination: this.musicGain, attack: .002, release: .07, lowpass: 1800 + this.intensity * 2200
        });
      }
      if (this.danger > .55 && beat % 2 === 0) {
        this.tone(this.midi(34), .07, { time, type: 'sine', gain: .025 * this.danger, destination: this.musicGain, attack: .002, release: .06 });
      }
    }

    midi(note) { return 440 * Math.pow(2, (note - 69) / 12); }

    tone(freq, duration, options = {}) {
      if (!this.ctx || this.settings.sfx <= 0 && options.destination !== this.musicGain) return null;
      const now = options.time ?? this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();
      const destination = options.destination || this.sfxGain;
      const attack = options.attack ?? .004;
      const release = options.release ?? Math.max(.03, duration * .55);
      const peak = options.gain ?? .12;
      osc.type = options.type || 'sine';
      osc.frequency.setValueAtTime(Math.max(10, freq), now);
      if (options.endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(10, options.endFreq), now + duration);
      if (options.detune) osc.detune.value = options.detune;
      filter.type = options.filterType || 'lowpass';
      filter.frequency.value = options.lowpass || 18000;
      filter.Q.value = options.q || .4;
      gain.gain.setValueAtTime(.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(.0002, peak), now + attack);
      gain.gain.exponentialRampToValueAtTime(.0001, now + duration + release);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(destination);
      osc.start(now);
      osc.stop(now + duration + release + .03);
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
      hp.type = 'highpass'; hp.frequency.value = options.highpass || 20;
      lp.type = 'lowpass'; lp.frequency.value = options.lowpass || 18000;
      const peak = options.gain ?? .08;
      gain.gain.setValueAtTime(peak, now);
      gain.gain.exponentialRampToValueAtTime(.0001, now + (options.decay || duration));
      src.connect(hp); hp.connect(lp); lp.connect(gain); gain.connect(options.destination || this.sfxGain);
      src.start(now, Math.random() * Math.max(.01, this.noiseBuffer.duration - duration));
      src.stop(now + duration + .02);
      return { src, gain };
    }

    vibrate(pattern) {
      if (!this.settings.haptics || !navigator.vibrate) return;
      try { navigator.vibrate(pattern); } catch (_) { /* no-op */ }
    }

    move() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.tone(310, .022, { time: t, type: 'triangle', gain: .027, endFreq: 370, release: .018 });
    }
    rotate() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.tone(430, .035, { time: t, type: 'sine', gain: .045, endFreq: 670, release: .025 });
      this.tone(650, .02, { time: t + .026, type: 'triangle', gain: .022, release: .02 });
    }
    softDrop() {
      if (!this.ctx) return;
      this.tone(170, .014, { type: 'triangle', gain: .015, release: .012 });
    }
    hardDrop(distance = 4) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.tone(185 + Math.min(distance, 10) * 4, .055, { time: t, type: 'square', gain: .075, endFreq: 65, release: .055, lowpass: 1200 });
      this.noise(.07, { time: t + .015, gain: .085, highpass: 45, lowpass: 680, decay: .065 });
      this.vibrate(18);
    }
    lock() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.tone(120, .035, { time: t, type: 'triangle', gain: .035, endFreq: 80, release: .03 });
    }
    clear(chain = 1, count = 3) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const root = 60 + Math.min(chain - 1, 7) * 3;
      const notes = count >= 6 ? [0, 4, 7, 12] : [0, 4, 7];
      notes.forEach((n, i) => this.tone(this.midi(root + n), .07, {
        time: t + i * .028, type: chain >= 3 ? 'square' : 'sine', gain: .055 + chain * .008,
        release: .10, lowpass: 2600 + chain * 450
      }));
      this.noise(.065, { time: t, gain: .04 + Math.min(.06, count * .004), highpass: 800, lowpass: 7000, decay: .055 });
      this.vibrate(chain >= 3 ? [15, 20, 30] : 12);
    }
    pulse() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      [0, 7, 12, 19].forEach((n, i) => this.tone(this.midi(72 + n), .16, {
        time: t + i * .035, type: 'sine', gain: .06 - i * .008, release: .18, lowpass: 9000
      }));
      this.tone(920, .25, { time: t, type: 'triangle', gain: .045, endFreq: 1650, release: .2 });
      this.vibrate([18, 18, 45]);
    }
    attack(lines = 1) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.tone(150, .22, { time: t, type: 'sawtooth', gain: .09 + lines * .008, endFreq: 980 + lines * 70, release: .12, lowpass: 4300 });
      this.tone(75, .18, { time: t + .12, type: 'sine', gain: .12, endFreq: 42, release: .15 });
      this.noise(.16, { time: t + .1, gain: .11, highpass: 150, lowpass: 3800, decay: .14 });
      this.vibrate(lines >= 4 ? [35, 25, 60] : [25, 20, 35]);
    }
    defense(power = 1) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.tone(520, .18, { time: t, type: 'triangle', gain: .09, endFreq: 220, release: .16, lowpass: 4200 });
      this.tone(1040, .08, { time: t + .08, type: 'sine', gain: .055, endFreq: 780, release: .12 });
      if (power > 2) this.tone(1560, .13, { time: t + .12, type: 'sine', gain: .035, release: .14 });
      this.vibrate([20, 10, 20]);
    }
    warning() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.tone(110, .07, { time: t, type: 'square', gain: .04, release: .04, lowpass: 800 });
      this.tone(145, .07, { time: t + .09, type: 'square', gain: .04, release: .04, lowpass: 800 });
    }
    rise(lines = 1) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.noise(.18, { time: t, gain: .12, highpass: 40, lowpass: 1200, decay: .17 });
      this.tone(62, .22, { time: t, type: 'sawtooth', gain: .09 + lines * .008, endFreq: 95, release: .15, lowpass: 560 });
      this.vibrate(lines >= 3 ? [50, 25, 50] : 35);
    }
    cancel() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.tone(900, .07, { time: t, type: 'sine', gain: .065, endFreq: 520, release: .09 });
      this.noise(.05, { time: t, gain: .035, highpass: 3000, lowpass: 9000, decay: .045 });
    }
    error() {
      if (!this.ctx) return;
      this.tone(92, .09, { type: 'square', gain: .045, endFreq: 75, release: .06, lowpass: 600 });
    }
    countdown(n) {
      if (!this.ctx) return;
      this.tone(n === 0 ? 880 : 440, n === 0 ? .16 : .07, { type: 'sine', gain: .08, endFreq: n === 0 ? 1320 : 480, release: .08 });
    }
    win() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      [0, 4, 7, 12, 16].forEach((n, i) => this.tone(this.midi(60 + n), .16, { time: t + i * .075, type: i > 2 ? 'triangle' : 'sine', gain: .07, release: .24 }));
      this.vibrate([30,30,30,30,80]);
    }
    lose() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      [0, -2, -5, -12].forEach((n, i) => this.tone(this.midi(48 + n), .18, { time: t + i * .11, type: 'sawtooth', gain: .06, release: .18, lowpass: 900 }));
      this.vibrate([70,35,90]);
    }
  }

  PLO.AudioEngine = AudioEngine;
})();
