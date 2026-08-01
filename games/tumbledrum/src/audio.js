(function () {
  'use strict';

  const TD = (window.TD = window.TD || {});

  class AudioEngine {
    constructor(settings) {
      this.settings = settings || { audio: true, music: true };
      this.ctx = null;
      this.master = null;
      this.musicGain = null;
      this.sfxGain = null;
      this.noiseBuffer = null;
      this.ready = false;
      this.beatAcc = 0;
      this.step = 0;
      this.lastMusicState = '';
      this.musicSeed = 0;
    }

    unlock() {
      if (!this.settings.audio) return;
      if (!this.ctx) this._create();
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    }

    _create() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC({ latencyHint: 'interactive' });
        this.master = this.ctx.createGain();
        this.musicGain = this.ctx.createGain();
        this.sfxGain = this.ctx.createGain();
        const compressor = this.ctx.createDynamicsCompressor();
        compressor.threshold.value = -18;
        compressor.knee.value = 18;
        compressor.ratio.value = 6;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.14;
        this.musicGain.gain.value = 0.32;
        this.sfxGain.gain.value = 0.7;
        this.master.gain.value = this.settings.audio ? 0.72 : 0;
        this.musicGain.connect(compressor);
        this.sfxGain.connect(compressor);
        compressor.connect(this.master);
        this.master.connect(this.ctx.destination);
        this.noiseBuffer = this._makeNoiseBuffer(1.0);
        this.ready = true;
      } catch (error) {
        this.ctx = null;
        this.ready = false;
      }
    }

    _makeNoiseBuffer(seconds) {
      const length = Math.max(1, Math.floor(this.ctx.sampleRate * seconds));
      const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < length; i += 1) {
        const white = Math.random() * 2 - 1;
        last = last * 0.78 + white * 0.22;
        data[i] = last;
      }
      return buffer;
    }

    setSettings(settings) {
      this.settings = settings;
      if (!this.ctx && settings.audio) this.unlock();
      if (this.master && this.ctx) {
        const now = this.ctx.currentTime;
        this.master.gain.cancelScheduledValues(now);
        this.master.gain.linearRampToValueAtTime(settings.audio ? 0.72 : 0, now + 0.04);
      }
    }

    tone(freq, duration, options) {
      if (!this.ready || !this.settings.audio) return;
      const opts = options || {};
      const now = this.ctx.currentTime + (opts.delay || 0);
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();
      osc.type = opts.type || 'triangle';
      osc.frequency.setValueAtTime(Math.max(20, freq), now);
      if (opts.slide) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slide), now + duration);
      }
      filter.type = opts.filterType || 'lowpass';
      filter.frequency.value = opts.filter || 9000;
      filter.Q.value = opts.q || 0.5;
      const volume = Math.max(0.0001, opts.volume == null ? 0.08 : opts.volume);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(volume, now + Math.min(0.012, duration * 0.18));
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(opts.bus === 'music' ? this.musicGain : this.sfxGain);
      osc.start(now);
      osc.stop(now + duration + 0.03);
    }

    noise(duration, options) {
      if (!this.ready || !this.settings.audio || !this.noiseBuffer) return;
      const opts = options || {};
      const now = this.ctx.currentTime + (opts.delay || 0);
      const source = this.ctx.createBufferSource();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();
      source.buffer = this.noiseBuffer;
      source.loop = duration > 0.95;
      filter.type = opts.type || 'bandpass';
      filter.frequency.value = opts.filter || 1200;
      filter.Q.value = opts.q || 0.8;
      const volume = Math.max(0.0001, opts.volume == null ? 0.05 : opts.volume);
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(opts.bus === 'music' ? this.musicGain : this.sfxGain);
      source.start(now, Math.random() * 0.3);
      source.stop(now + duration + 0.03);
    }

    sfx(name, power) {
      const p = Math.max(0, Math.min(1.8, power == null ? 1 : power));
      if (!this.settings.audio) return;
      this.unlock();
      switch (name) {
        case 'paper':
          this.noise(0.08, { filter: 2400 + p * 900, q: 0.6, volume: 0.025 + p * 0.016 });
          this.tone(320 + p * 90, 0.07, { type: 'triangle', volume: 0.025 + p * 0.014, slide: 210 });
          break;
        case 'clay':
          this.noise(0.11, { filter: 1050, q: 1.1, volume: 0.04 + p * 0.018 });
          this.tone(150 + p * 24, 0.12, { type: 'sine', volume: 0.052 + p * 0.018, slide: 82 });
          break;
        case 'wood':
          this.tone(230 + p * 40, 0.1, { type: 'square', filter: 1150, volume: 0.032 + p * 0.012, slide: 140 });
          this.tone(110, 0.12, { type: 'sine', volume: 0.03, slide: 72, delay: 0.006 });
          break;
        case 'paddle':
          this.tone(118, 0.15, { type: 'sine', volume: 0.075, slide: 61 });
          this.noise(0.045, { filter: 700, q: 0.5, volume: 0.025 });
          break;
        case 'sweet':
          this.tone(96, 0.22, { type: 'sine', volume: 0.14, slide: 48 });
          this.tone(390, 0.16, { type: 'triangle', volume: 0.065, slide: 520, delay: 0.01 });
          this.noise(0.075, { filter: 520, q: 0.7, volume: 0.055 });
          break;
        case 'bomb':
          this.noise(0.42, { filter: 360, q: 0.6, volume: 0.13 + p * 0.02 });
          this.tone(92, 0.38, { type: 'sine', volume: 0.17, slide: 36 });
          this.tone(260, 0.16, { type: 'sawtooth', filter: 900, volume: 0.045, slide: 80 });
          break;
        case 'bell':
          [0, 0.012, 0.024].forEach((delay, i) => {
            this.tone([780, 1170, 1560][i], 0.45 - i * 0.06, {
              type: 'sine',
              volume: 0.043 - i * 0.008,
              delay,
              bus: 'sfx'
            });
          });
          break;
        case 'spinner':
          this.tone(520, 0.075, { type: 'square', filter: 1500, volume: 0.035, slide: 360 });
          break;
        case 'rope':
          this.noise(0.17, { filter: 680, q: 2.2, volume: 0.055 });
          this.tone(170, 0.12, { type: 'triangle', volume: 0.035, slide: 95 });
          break;
        case 'pickup':
          this.tone(520, 0.12, { type: 'triangle', volume: 0.055, slide: 780 });
          this.tone(780, 0.16, { type: 'triangle', volume: 0.04, slide: 1040, delay: 0.07 });
          break;
        case 'serve':
          this.tone(270, 0.11, { type: 'triangle', volume: 0.04, slide: 420 });
          break;
        case 'miss':
          this.tone(145, 0.35, { type: 'triangle', filter: 800, volume: 0.08, slide: 52 });
          break;
        case 'clear':
          [0, 0.08, 0.16, 0.27].forEach((delay, i) => {
            this.tone([392, 523, 659, 784][i], 0.34, {
              type: 'triangle',
              volume: 0.055,
              delay
            });
          });
          break;
        case 'parade':
          this.tone(82, 0.48, { type: 'sine', volume: 0.18, slide: 41 });
          this.noise(0.22, { filter: 540, q: 0.6, volume: 0.09 });
          this.tone(620, 0.32, { type: 'triangle', volume: 0.075, slide: 980, delay: 0.03 });
          break;
        case 'stamp':
          this.tone(104, 0.16, { type: 'sine', volume: 0.12, slide: 56 });
          this.noise(0.09, { filter: 500, q: 0.8, volume: 0.07 });
          break;
        case 'boss':
          this.tone(72, 0.5, { type: 'sine', volume: 0.18, slide: 34 });
          this.noise(0.36, { filter: 290, q: 0.4, volume: 0.11 });
          break;
        default:
          break;
      }
    }

    update(dt, game) {
      if (!this.ready || !this.settings.audio || !this.settings.music) return;
      if (!game || game.state !== 'playing' || game.paused) return;
      const parade = game.paradeTimer > 0;
      const combo = game.comboCount || 0;
      const boss = !!(game.stage && game.stage.boss);
      const bpm = parade ? 126 : boss ? 112 : 102 + Math.min(12, Math.floor(combo / 10) * 2);
      const interval = 60 / bpm / 2;
      this.beatAcc += dt;
      while (this.beatAcc >= interval) {
        this.beatAcc -= interval;
        this._musicStep(game, parade, combo, boss);
      }
    }

    _musicStep(game, parade, combo, boss) {
      const step = this.step % 16;
      const act = game.stage ? game.stage.act || 0 : 0;
      const root = [196, 174.61, 164.81][act];
      const scale = [1, 1.125, 1.3333, 1.5, 1.7778];
      if (step % 4 === 0) {
        this.tone(boss ? 72 : 82, 0.15, { type: 'sine', volume: 0.055, slide: 44, bus: 'music' });
      }
      if (step === 2 || step === 6 || step === 10 || step === 14) {
        this.tone(220, 0.055, { type: 'square', filter: 950, volume: 0.015 + Math.min(0.02, combo * 0.0008), slide: 160, bus: 'music' });
      }
      if (combo >= 8 && step % 2 === 1) {
        this.noise(0.028, { filter: 3100, q: 1.2, volume: 0.009 + Math.min(0.012, combo * 0.0003), bus: 'music' });
      }
      if ((step === 3 || step === 7 || step === 11 || step === 15) && (combo >= 4 || parade)) {
        const index = (this.musicSeed + step + Math.floor((game.score || 0) / 500)) % scale.length;
        this.tone(root * scale[index], 0.14, { type: 'triangle', volume: parade ? 0.031 : 0.018, bus: 'music' });
      }
      if (parade && (step === 4 || step === 12)) {
        this.noise(0.08, { filter: 1000, q: 0.7, volume: 0.032, bus: 'music' });
        this.tone(root * 2, 0.22, { type: 'sine', volume: 0.026, bus: 'music' });
      }
      this.step = (this.step + 1) % 16;
    }
  }

  TD.AudioEngine = AudioEngine;
})();
