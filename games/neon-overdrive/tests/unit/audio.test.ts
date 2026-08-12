import { describe, expect, it } from "vite-plus/test";

import { createAudioEngine } from "../../guest/src/audio.js";

class FakeAudioParam {
  readonly calls: Array<{ method: string; value?: number; time: number }> = [];

  cancelScheduledValues(time: number) {
    this.calls.push({ method: "cancel", time });
  }

  setValueAtTime(value: number, time: number) {
    this.calls.push({ method: "set", value, time });
  }

  setTargetAtTime(value: number, time: number) {
    this.calls.push({ method: "target", value, time });
  }
}

class FakeGain {
  readonly gain = new FakeAudioParam();
  connect() {}
  disconnect() {}
}

function createAudioWindow() {
  const contexts: FakeAudioContext[] = [];
  class FakeAudioContext {
    readonly currentTime = 12;
    readonly destination = {};
    readonly gains: FakeGain[] = [];
    state = "suspended";

    constructor() {
      contexts.push(this);
    }

    createGain() {
      const gain = new FakeGain();
      this.gains.push(gain);
      return gain;
    }

    async resume() {
      this.state = "running";
    }

    async suspend() {
      this.state = "suspended";
    }

    async close() {
      this.state = "closed";
    }
  }
  return { targetWindow: { AudioContext: FakeAudioContext }, contexts };
}

const INITIAL = {
  revision: 0,
  audio: { master: 1, music: 0.5, sfx: 0.75 },
  motion: { reduced: false, screenShake: true },
};

describe("Neon audio Host settings", () => {
  it("does not create or schedule the graph before user activation", () => {
    const { targetWindow, contexts } = createAudioWindow();
    const audio = createAudioEngine(targetWindow, INITIAL);

    audio.setMusicActive(true);
    audio.applySettings({ ...INITIAL, revision: 1, audio: { master: 0, music: 0, sfx: 0 } });

    expect(contexts).toHaveLength(0);
    expect(audio.snapshotResources()).toMatchObject({
      audioContexts: 0,
      musicScheduler: 0,
    });
  });

  it("projects master, music, and sfx independently with immediate exact zero", async () => {
    const { targetWindow, contexts } = createAudioWindow();
    const audio = createAudioEngine(targetWindow, INITIAL);
    audio.activate(true);
    await Promise.resolve();
    const [master, music, sfx] = contexts[0]!.gains;

    audio.applySettings({ ...INITIAL, revision: 1, audio: { master: 0, music: 0, sfx: 0 } });
    for (const port of [master!, music!, sfx!]) {
      expect(port.gain.calls.slice(-2)).toEqual([
        { method: "cancel", time: 12 },
        { method: "set", value: 0, time: 12 },
      ]);
    }

    audio.applySettings({
      ...INITIAL,
      revision: 2,
      audio: { master: 0.2, music: 0.5, sfx: 0.7 },
    });
    expect(master!.gain.calls.slice(-2)).toEqual([
      { method: "cancel", time: 12 },
      { method: "target", value: 0.2, time: 12 },
    ]);
    expect(music!.gain.calls.slice(-2)).toEqual([
      { method: "cancel", time: 12 },
      { method: "target", value: 0.21, time: 12 },
    ]);
    expect(sfx!.gain.calls.slice(-2)).toEqual([
      { method: "cancel", time: 12 },
      { method: "target", value: 0.7, time: 12 },
    ]);
    await audio.dispose();
  });
});
