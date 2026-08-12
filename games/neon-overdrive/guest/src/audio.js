import { createRng } from "./rng.js";

const CUES = new Set([
  "select",
  "graze",
  "kill",
  "bigKill",
  "driveReady",
  "drive",
  "pulse",
  "hit",
  "phase",
  "warning",
  "shotAccent",
  "victory",
]);

function exactKeys(value, expected) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === expected.length &&
    expected.every((key) => Object.hasOwn(value, key))
  );
}

export function assertHostSettings(settings) {
  const unit = (value) =>
    typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
  if (
    !exactKeys(settings, ["revision", "audio", "motion"]) ||
    !Number.isSafeInteger(settings.revision) ||
    settings.revision < 0 ||
    !exactKeys(settings.audio, ["master", "music", "sfx"]) ||
    !unit(settings.audio.master) ||
    !unit(settings.audio.music) ||
    !unit(settings.audio.sfx) ||
    !exactKeys(settings.motion, ["reduced", "screenShake"]) ||
    typeof settings.motion.reduced !== "boolean" ||
    typeof settings.motion.screenShake !== "boolean"
  ) {
    throw new TypeError(
      "Neon Host settings must contain exactly the five public settings and revision.",
    );
  }
}

export function createAudioEngine(targetWindow, initialSettings) {
  assertHostSettings(initialSettings);
  const rng = createRng(0x41554449);
  let settings = initialSettings;
  let context = null;
  let master = null;
  let music = null;
  let sfx = null;
  let desiredRunning = false;
  let musicDemand = false;
  let unlockPending = false;
  let schedulerActive = false;
  let nextMusicAt = 0;
  let disposed = false;
  let disposePromise = null;
  let transition = Promise.resolve();
  let lastGraze = -Infinity;
  let lastShot = -Infinity;
  const sources = new Set();

  function projectGain(parameter, value, now) {
    parameter.cancelScheduledValues(now);
    if (value === 0) {
      parameter.setValueAtTime(0, now);
      return;
    }
    parameter.setTargetAtTime(value, now, 0.02);
  }

  function activate(active) {
    if (disposed) return;
    if (typeof active !== "boolean") throw new TypeError("Audio activation gate must be boolean.");
    if (context === null) {
      const AudioContext = targetWindow.AudioContext;
      if (typeof AudioContext !== "function") return;
      context = new AudioContext();
      master = context.createGain();
      music = context.createGain();
      sfx = context.createGain();
      music.connect(master);
      sfx.connect(master);
      master.connect(context.destination);
      applySettings(settings);
      unlockPending = true;
    }
    desiredRunning = active;
    if (!active) {
      schedulerActive = false;
      nextMusicAt = 0;
      stopSources();
    }
    void queueTransition();
  }

  function applySettings(next) {
    assertHostSettings(next);
    settings = next;
    if (context !== null) {
      const now = context.currentTime;
      projectGain(master.gain, next.audio.master, now);
      projectGain(music.gain, next.audio.music * 0.42, now);
      projectGain(sfx.gain, next.audio.sfx, now);
    }
  }

  function tone(frequency, start, duration, gain, type, bus) {
    if (bus !== "music" && bus !== "sfx") throw new RangeError(`Unknown Neon audio bus: ${bus}`);
    const destination = bus === "music" ? music : sfx;
    if (context === null || destination === null || disposed) return;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), start + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(envelope);
    envelope.connect(destination);
    const record = { oscillator, envelope, bus, released: false };
    sources.add(record);
    oscillator.onended = () => releaseSource(record);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.01);
  }

  function releaseSource(record) {
    if (record.released) return;
    record.released = true;
    sources.delete(record);
    record.oscillator.onended = null;
    record.oscillator.disconnect();
    record.envelope.disconnect();
  }

  function stopSources(bus = null) {
    for (const record of sources) {
      if (bus !== null && record.bus !== bus) continue;
      try {
        record.oscillator.stop();
      } catch {
        /* The oscillator may have reached its scheduled stop. */
      }
      releaseSource(record);
    }
  }

  function cue(name) {
    if (!CUES.has(name)) throw new RangeError(`Unknown Neon audio cue: ${name}`);
    if (!desiredRunning || context === null || sfx === null || context.state !== "running") return;
    const now = context.currentTime;
    if (name === "graze" && now - lastGraze < 0.045) return;
    if (name === "shotAccent" && now - lastShot < 0.12) return;
    if (name === "graze") lastGraze = now;
    if (name === "shotAccent") lastShot = now;
    const base = {
      select: 440,
      graze: 1120,
      kill: 116,
      bigKill: 86,
      driveReady: 330,
      drive: 82,
      pulse: 120,
      hit: 72,
      phase: 220,
      warning: 196,
      shotAccent: 780,
      victory: 220,
    }[name];
    const duration = ["drive", "victory", "bigKill"].includes(name) ? 0.28 : 0.09;
    tone(
      base * rng.range(0.97, 1.03),
      now,
      duration,
      0.08,
      name === "select" ? "square" : "triangle",
      "sfx",
    );
    if (name === "victory")
      [4, 7, 12].forEach((semi, index) => {
        tone(220 * 2 ** (semi / 12), now + (index + 1) * 0.12, 0.26, 0.07, "triangle", "sfx");
      });
  }

  function tick() {
    if (!schedulerActive || context === null || music === null || context.state !== "running")
      return;
    while (nextMusicAt < context.currentTime + 0.16) {
      const notes = [55, 65.41, 73.42, 82.41];
      tone(notes[rng.integer(0, notes.length - 1)], nextMusicAt, 0.18, 0.025, "sawtooth", "music");
      nextMusicAt = Math.max(nextMusicAt + 0.25, context.currentTime);
    }
  }

  function queueTransition() {
    transition = transition.then(async () => {
      const activeContext = context;
      if (disposed || activeContext === null) return;
      if (unlockPending) {
        if (activeContext.state === "suspended") await activeContext.resume();
        unlockPending = false;
      }
      if (disposed || context !== activeContext) {
        if (activeContext.state === "running") await activeContext.suspend();
        return;
      }
      if (desiredRunning) {
        if (activeContext.state === "suspended") await activeContext.resume();
        if (disposed || !desiredRunning) {
          if (activeContext.state === "running") await activeContext.suspend();
          return;
        }
        schedulerActive = musicDemand;
        nextMusicAt = musicDemand ? activeContext.currentTime : 0;
      } else if (activeContext.state === "running") {
        await activeContext.suspend();
      }
    });
    return transition;
  }

  function pause() {
    desiredRunning = false;
    schedulerActive = false;
    nextMusicAt = 0;
    stopSources();
    return queueTransition();
  }

  function resume() {
    desiredRunning = true;
    return queueTransition();
  }

  function setMusicActive(active) {
    if (disposed) return;
    if (typeof active !== "boolean") throw new TypeError("Music scene demand must be boolean.");
    if (musicDemand === active) return;
    musicDemand = active;
    if (!active) {
      schedulerActive = false;
      nextMusicAt = 0;
      stopSources("music");
    } else if (desiredRunning && context !== null && context.state === "running") {
      schedulerActive = true;
      nextMusicAt = context.currentTime;
    }
  }

  return {
    activate,
    applySettings,
    cue,
    tick,
    setMusicActive,
    pause,
    resume,
    snapshotResources: () => ({
      audioContexts: context === null ? 0 : 1,
      audioSources: sources.size,
      musicScheduler: schedulerActive ? 1 : 0,
      musicSources: [...sources].filter((record) => record.bus === "music").length,
    }),
    dispose() {
      if (disposePromise !== null) return disposePromise;
      disposePromise = (async () => {
        disposed = true;
        desiredRunning = false;
        schedulerActive = false;
        stopSources();
        await transition;
        master?.disconnect();
        music?.disconnect();
        sfx?.disconnect();
        if (context !== null && context.state !== "closed") await context.close();
        context = null;
        master = null;
        music = null;
        sfx = null;
      })();
      return disposePromise;
    },
  };
}
