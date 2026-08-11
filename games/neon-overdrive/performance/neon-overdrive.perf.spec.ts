import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type BrowserContext, type CDPSession, type Page } from "@playwright/test";

const SEED = 0x4e454f4e;
const VIEWPORT = { width: 1440, height: 900 };
const DEVICE_SCALE_FACTOR = 1;
const WARM_UP_MS = 2_000;
const SAMPLE_MS = 1_200;
const LONG_FRAME_MS = 20;
const evidencePath = resolve(dirname(fileURLToPath(import.meta.url)), "before-evidence.json");

type ScenarioName = "normal" | "cpu-4x" | "dense" | "paused" | "hidden-frozen";

type RuntimeSample = {
  documentHidden: boolean;
  visibilityState: string;
  visibilityEvents: Array<{ hidden: boolean; state: string }>;
  frameIntervalsMs: number[];
  longTaskDurationsMs: number[];
  updateCalls: number;
  playingSimulationTicks: number;
  hudMutationCount: number;
  audioSchedulerCalls: number;
  audioSchedulerTimestampsEpochMs: number[];
  entityPeaks: Record<string, number>;
  state: string;
};

type ScenarioEvidence = {
  scenario: ScenarioName;
  cpuThrottleRate: number;
  lifecycleState: "active" | "frozen";
  visibilityMechanism: "natural" | "controlled-hidden+Page.setWebLifecycleState";
  sampleMs: number;
  frames: {
    count: number;
    meanMs: number;
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    maxMs: number;
    over20Ms: number;
  };
  longTasks: { count: number; totalMs: number; maxMs: number };
  cdpDurationsMs: { task: number; script: number; layout: number };
  activity: {
    updateCalls: number;
    playingSimulationTicks: number;
    hudMutationCount: number;
    audioSchedulerCalls: number;
  };
  frozenWindow: null | {
    durationMs: number;
    audioSchedulerCallsBeforeFrozen: number;
    audioSchedulerCallsDuringFrozen: number;
    audioSchedulerCallsAfterThawBeforeSnapshot: number;
  };
  entityPeaks: Record<string, number>;
  finalState: string;
  documentHiddenDuringSample: boolean;
  visibilityEvents: Array<{ hidden: boolean; state: string }>;
};

const require = createRequire(import.meta.url);
const playwrightVersion = (require("@playwright/test/package.json") as { version: string }).version;

test("records the fixed before-refactor performance matrix", async ({ browser, context, page }) => {
  test.setTimeout(90_000);
  const browserVersion = browser.version();
  const scenarios: ScenarioEvidence[] = [];
  await installRuntimeInstrumentation(page);

  for (const scenario of ["normal", "cpu-4x", "dense", "paused", "hidden-frozen"] as const) {
    scenarios.push(
      await test.step(`capture ${scenario}`, () => captureScenario(page, context, scenario)),
    );
  }

  const evidence = {
    schemaVersion: 1,
    subject: "neon-overdrive-source-before-issue-54",
    browser: {
      engine: "chromium",
      version: browserVersion,
      playwrightVersion,
    },
    harness: {
      viewport: VIEWPORT,
      deviceScaleFactor: DEVICE_SCALE_FACTOR,
      seed: SEED,
      warmUpMs: WARM_UP_MS,
      warmUpMode: "fixed 60 Hz simulation with one terminal render before natural RAF sampling",
      sampleMs: SAMPLE_MS,
      longFrameThresholdMs: LONG_FRAME_MS,
      input:
        "source Story auto-fire with centered player; dense adds source enemy bullets and particles",
    },
    capture: {
      platform: process.platform,
      hiddenPolicy:
        "Chromium automation does not change document.hidden when Page.setWebLifecycleState freezes a target; the harness controls document.hidden and dispatches visibilitychange before applying the real CDP frozen lifecycle, and records both mechanisms explicitly",
    },
    scenarios,
  };

  if (process.env.NEON_PERF_RECORD === "1") {
    await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  } else {
    const recorded = JSON.parse(await readFile(evidencePath, "utf8")) as typeof evidence;
    expect(recorded.schemaVersion).toBe(1);
    expect(recorded.subject).toBe(evidence.subject);
    expect(recorded.browser).toEqual(evidence.browser);
    expect(recorded.harness).toEqual(evidence.harness);
    expect(recorded.scenarios.map((entry) => entry.scenario)).toEqual(
      scenarios.map((entry) => entry.scenario),
    );
  }

  const paused = scenarios.find((entry) => entry.scenario === "paused")!;
  expect(paused.finalState).toBe("paused");
  expect(paused.activity.playingSimulationTicks).toBe(0);

  const hidden = scenarios.find((entry) => entry.scenario === "hidden-frozen")!;
  expect(hidden.lifecycleState).toBe("frozen");
  expect(hidden.visibilityEvents).toContainEqual({ hidden: true, state: "hidden" });
  expect(hidden.documentHiddenDuringSample).toBe(true);
  expect(hidden.frozenWindow).not.toBeNull();
  expect(
    hidden.frozenWindow!.audioSchedulerCallsBeforeFrozen +
      hidden.frozenWindow!.audioSchedulerCallsDuringFrozen +
      hidden.frozenWindow!.audioSchedulerCallsAfterThawBeforeSnapshot,
  ).toBe(hidden.activity.audioSchedulerCalls);

  for (const entry of scenarios) {
    expect(entry.cdpDurationsMs.task).toBeGreaterThanOrEqual(0);
    expect(entry.cdpDurationsMs.script).toBeGreaterThanOrEqual(0);
    expect(entry.cdpDurationsMs.layout).toBeGreaterThanOrEqual(0);
    expect(entry.entityPeaks).toEqual(
      expect.objectContaining({ enemies: expect.any(Number), enemyBullets: expect.any(Number) }),
    );
  }
});

async function captureScenario(
  page: Page,
  context: BrowserContext,
  scenario: ScenarioName,
): Promise<ScenarioEvidence> {
  await page.goto("/", { waitUntil: "load" });
  const session = await context.newCDPSession(page);
  await session.send("Performance.enable");
  try {
    const runtimeReady = await page.evaluate(() => Boolean(window.__NEON_OVERDRIVE__));
    if (!runtimeReady) throw new Error("Neon source runtime did not boot before load completed");
    if (scenario === "cpu-4x") await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.evaluate(() => {
      const game = window.__NEON_OVERDRIVE__;
      const metrics = window.__NEON_PERF__;
      const originalUpdate = game.update.bind(game);
      game.update = (dt: number) => {
        metrics.updateCalls += 1;
        if (game.state === "playing") metrics.playingSimulationTicks += 1;
        originalUpdate(dt);
        metrics.entityPeaks.enemies = Math.max(metrics.entityPeaks.enemies, game.enemies.length);
        metrics.entityPeaks.enemyBullets = Math.max(
          metrics.entityPeaks.enemyBullets,
          game.enemyBullets.length,
        );
        metrics.entityPeaks.playerBullets = Math.max(
          metrics.entityPeaks.playerBullets,
          game.playerBullets.length,
        );
        metrics.entityPeaks.particles = Math.max(
          metrics.entityPeaks.particles,
          game.particles.length,
        );
        metrics.entityPeaks.pickups = Math.max(metrics.entityPeaks.pickups, game.pickups.length);
        metrics.entityPeaks.lasers = Math.max(metrics.entityPeaks.lasers, game.lasers.length);
      };
    });
    await page.evaluate(() => {
      const game = window.__NEON_OVERDRIVE__;
      const metrics = window.__NEON_PERF__;
      const originalScheduler = game.audio.scheduler.bind(game.audio);
      game.audio.scheduler = () => {
        metrics.audioSchedulerCalls += 1;
        metrics.audioSchedulerTimestampsEpochMs.push(Date.now());
        originalScheduler();
      };
      new MutationObserver((records) => {
        metrics.hudMutationCount += records.length;
      }).observe(document.querySelector("#hud")!, {
        attributes: true,
        characterData: true,
        childList: true,
        subtree: true,
      });
      game.save.settings.master = 0;
      game.save.settings.music = 0;
      game.save.settings.screenShake = false;
      game.save.settings.flashes = false;
    });
    await page.evaluate(
      ({ currentScenario, warmUpSteps }) => {
        const game = window.__NEON_OVERDRIVE__;
        game.startRun("story");
        game.player.invuln = 999;
        for (let step = 0; step < warmUpSteps; step += 1) game.update(1 / 60);
        game.render();
        if (currentScenario === "dense") {
          game.rank = 0.9;
          for (let ring = 0; ring < 14; ring += 1) {
            game.spawnRing(270, 200 + (ring % 4) * 55, 24, 70 + ring * 4, ring * 0.21, {
              color: ring % 2 ? "#ff2bd6" : "#00f7ff",
              shape: ring % 3 ? "orb" : "diamond",
              radius: 5.2,
              curve: ring % 2 ? 0.08 : -0.08,
            });
          }
          for (let index = 0; index < 360; index += 1) {
            const angle = (index / 360) * Math.PI * 2;
            game.spawnParticle({
              x: 270 + Math.cos(angle) * (40 + (index % 90)),
              y: 420 + Math.sin(angle) * (40 + (index % 90)),
              vx: Math.cos(angle) * 25,
              vy: Math.sin(angle) * 25,
              life: 8,
              size: 3 + (index % 4),
              color: index % 2 ? "#ff2bd6" : "#00f7ff",
              type: "spark",
              drag: 0,
            });
          }
        }
        if (currentScenario === "paused") game.pause();
      },
      { currentScenario: scenario, warmUpSteps: Math.ceil((WARM_UP_MS / 1_000) * 60) },
    );
    const cdpBefore = await readCdpMetrics(session);

    let lifecycleState: "active" | "frozen" = "active";
    let documentHiddenDuringSample = false;
    let frozenBounds: null | {
      startedAtEpochMs: number;
      thawCommandAtEpochMs: number;
      snapshotAtEpochMs: number;
    } = null;
    if (scenario === "hidden-frozen") {
      await page.evaluate((sampleMs) => {
        const metrics = window.__NEON_PERF__;
        metrics.startSample(sampleMs);
        Object.defineProperties(document, {
          hidden: { configurable: true, get: () => true },
          visibilityState: { configurable: true, get: () => "hidden" },
        });
        document.dispatchEvent(new Event("visibilitychange"));
      }, SAMPLE_MS);
      lifecycleState = "frozen";
      await session.send("Page.setWebLifecycleState", { state: "frozen" });
      const startedAtEpochMs = Date.now();
      await new Promise((resolveDelay) => setTimeout(resolveDelay, SAMPLE_MS));
      const thawCommandAtEpochMs = Date.now();
      await session.send("Page.setWebLifecycleState", { state: "active" });
      frozenBounds = {
        startedAtEpochMs,
        thawCommandAtEpochMs,
        snapshotAtEpochMs: thawCommandAtEpochMs,
      };
    } else {
      await page.evaluate((sampleMs) => window.__NEON_PERF__.startSample(sampleMs), SAMPLE_MS);
      await new Promise((resolveDelay) => setTimeout(resolveDelay, SAMPLE_MS + 250));
    }

    const cdpAfter = await readCdpMetrics(session);
    const runtime = await page.evaluate((hiddenScenario) => {
      if (!hiddenScenario) {
        const sampleSnapshot = window.__NEON_PERF__.sampleSnapshot;
        if (!sampleSnapshot) throw new Error("The autonomous sampler did not produce a snapshot");
        return sampleSnapshot;
      }
      const metrics = window.__NEON_PERF__;
      const hiddenSnapshot = metrics.snapshot();
      hiddenSnapshot.documentHidden = true;
      hiddenSnapshot.visibilityState = "hidden";
      metrics.hiddenSnapshot = hiddenSnapshot;
      Reflect.deleteProperty(document, "hidden");
      Reflect.deleteProperty(document, "visibilityState");
      document.dispatchEvent(new Event("visibilitychange"));
      return hiddenSnapshot;
    }, scenario === "hidden-frozen");
    if (frozenBounds) frozenBounds.snapshotAtEpochMs = Date.now();
    const frozenWindow: ScenarioEvidence["frozenWindow"] = frozenBounds
      ? {
          durationMs: frozenBounds.thawCommandAtEpochMs - frozenBounds.startedAtEpochMs,
          audioSchedulerCallsBeforeFrozen: runtime.audioSchedulerTimestampsEpochMs.filter(
            (timestamp) => timestamp < frozenBounds.startedAtEpochMs,
          ).length,
          audioSchedulerCallsDuringFrozen: runtime.audioSchedulerTimestampsEpochMs.filter(
            (timestamp) =>
              timestamp >= frozenBounds.startedAtEpochMs &&
              timestamp < frozenBounds.thawCommandAtEpochMs,
          ).length,
          audioSchedulerCallsAfterThawBeforeSnapshot:
            runtime.audioSchedulerTimestampsEpochMs.filter(
              (timestamp) =>
                timestamp >= frozenBounds.thawCommandAtEpochMs &&
                timestamp <= frozenBounds.snapshotAtEpochMs,
            ).length,
        }
      : null;
    documentHiddenDuringSample = runtime.documentHidden;
    return summarizeScenario(
      scenario,
      runtime,
      cdpBefore,
      cdpAfter,
      lifecycleState,
      documentHiddenDuringSample,
      frozenWindow,
    );
  } finally {
    if (scenario === "cpu-4x") await session.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    await session.detach();
  }
}

async function installRuntimeInstrumentation(page: Page) {
  await page.addInitScript(
    ({ seed }) => {
      let randomState = seed >>> 0;
      Math.random = () => {
        randomState = (randomState + 0x6d2b79f5) >>> 0;
        let value = randomState;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
      };
      window.localStorage.clear();

      const nativeRaf = window.requestAnimationFrame.bind(window);
      const metrics = {
        previousFrameAt: 0,
        frameIntervalsMs: [] as number[],
        longTaskDurationsMs: [] as number[],
        updateCalls: 0,
        playingSimulationTicks: 0,
        hudMutationCount: 0,
        audioSchedulerCalls: 0,
        audioSchedulerTimestampsEpochMs: [] as number[],
        visibilityEvents: [] as Array<{ hidden: boolean; state: string }>,
        hiddenSnapshot: null as RuntimeSample | null,
        sampleSnapshot: null as RuntimeSample | null,
        pendingFrame: null as FrameRequestCallback | null,
        running: false,
        sampleEndAt: 0,
        entityPeaks: {
          enemies: 0,
          enemyBullets: 0,
          playerBullets: 0,
          particles: 0,
          pickups: 0,
          lasers: 0,
        },
        reset() {
          this.previousFrameAt = 0;
          this.frameIntervalsMs.length = 0;
          this.longTaskDurationsMs.length = 0;
          this.updateCalls = 0;
          this.playingSimulationTicks = 0;
          this.hudMutationCount = 0;
          this.audioSchedulerCalls = 0;
          this.audioSchedulerTimestampsEpochMs.length = 0;
          this.visibilityEvents.length = 0;
          this.hiddenSnapshot = null;
          this.sampleSnapshot = null;
          this.entityPeaks.enemies = 0;
          this.entityPeaks.enemyBullets = 0;
          this.entityPeaks.playerBullets = 0;
          this.entityPeaks.particles = 0;
          this.entityPeaks.pickups = 0;
          this.entityPeaks.lasers = 0;
        },
        snapshot(): RuntimeSample {
          return {
            documentHidden: document.hidden,
            visibilityState: document.visibilityState,
            visibilityEvents: this.visibilityEvents.map((entry) => ({ ...entry })),
            frameIntervalsMs: [...this.frameIntervalsMs],
            longTaskDurationsMs: [...this.longTaskDurationsMs],
            updateCalls: this.updateCalls,
            playingSimulationTicks: this.playingSimulationTicks,
            hudMutationCount: this.hudMutationCount,
            audioSchedulerCalls: this.audioSchedulerCalls,
            audioSchedulerTimestampsEpochMs: [...this.audioSchedulerTimestampsEpochMs],
            entityPeaks: { ...this.entityPeaks },
            state: window.__NEON_OVERDRIVE__?.state ?? "booting",
          };
        },
        startSample(sampleMs: number) {
          const callback = this.pendingFrame;
          if (!callback) throw new Error("The source runtime did not register its RAF callback");
          this.reset();
          this.running = true;
          this.sampleEndAt = performance.now() + sampleMs;
          this.pendingFrame = null;
          nativeRaf((now) => dispatchFrame(callback, now));
        },
      };
      const dispatchFrame = (callback: FrameRequestCallback, now: number) => {
        if (!metrics.running) {
          metrics.pendingFrame = callback;
          return;
        }
        if (now >= metrics.sampleEndAt) {
          metrics.sampleSnapshot = metrics.snapshot();
          metrics.running = false;
          metrics.pendingFrame = callback;
          return;
        }
        if (metrics.previousFrameAt > 0)
          metrics.frameIntervalsMs.push(now - metrics.previousFrameAt);
        metrics.previousFrameAt = now;
        callback(now);
      };
      window.__NEON_PERF__ = metrics;
      window.requestAnimationFrame = (callback) => {
        if (!metrics.running) {
          metrics.pendingFrame = callback;
          return 1;
        }
        return nativeRaf((now) => dispatchFrame(callback, now));
      };
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
          metrics.reset();
          metrics.running = false;
          metrics.visibilityEvents.push({ hidden: true, state: "hidden" });
          return;
        }
        const hiddenPeriod = metrics.snapshot();
        hiddenPeriod.documentHidden = true;
        hiddenPeriod.visibilityState = "hidden";
        metrics.hiddenSnapshot = hiddenPeriod;
        metrics.running = false;
        metrics.visibilityEvents.push({ hidden: false, state: "visible" });
      });
      if (PerformanceObserver.supportedEntryTypes.includes("longtask")) {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) metrics.longTaskDurationsMs.push(entry.duration);
        }).observe({ entryTypes: ["longtask"] });
      }
    },
    { seed: SEED },
  );
}

async function readCdpMetrics(session: CDPSession) {
  const result = (await session.send("Performance.getMetrics")) as {
    metrics: Array<{ name: string; value: number }>;
  };
  return Object.fromEntries(result.metrics.map((entry) => [entry.name, entry.value]));
}

function summarizeScenario(
  scenario: ScenarioName,
  runtime: RuntimeSample,
  before: Record<string, number>,
  after: Record<string, number>,
  lifecycleState: "active" | "frozen",
  documentHiddenDuringSample: boolean,
  frozenWindow: ScenarioEvidence["frozenWindow"],
): ScenarioEvidence {
  const frames = [...runtime.frameIntervalsMs].sort((left, right) => left - right);
  const longTasks = runtime.longTaskDurationsMs;
  return {
    scenario,
    cpuThrottleRate: scenario === "cpu-4x" ? 4 : 1,
    lifecycleState,
    visibilityMechanism:
      scenario === "hidden-frozen" ? "controlled-hidden+Page.setWebLifecycleState" : "natural",
    sampleMs: SAMPLE_MS,
    frames: {
      count: frames.length,
      meanMs: round(mean(frames)),
      p50Ms: round(percentile(frames, 0.5)),
      p95Ms: round(percentile(frames, 0.95)),
      p99Ms: round(percentile(frames, 0.99)),
      maxMs: round(frames.at(-1) ?? 0),
      over20Ms: frames.filter((duration) => duration > LONG_FRAME_MS).length,
    },
    longTasks: {
      count: longTasks.length,
      totalMs: round(longTasks.reduce((sum, duration) => sum + duration, 0)),
      maxMs: round(Math.max(0, ...longTasks)),
    },
    cdpDurationsMs: {
      task: metricDeltaMs(before, after, "TaskDuration"),
      script: metricDeltaMs(before, after, "ScriptDuration"),
      layout: metricDeltaMs(before, after, "LayoutDuration"),
    },
    activity: {
      updateCalls: runtime.updateCalls,
      playingSimulationTicks: runtime.playingSimulationTicks,
      hudMutationCount: runtime.hudMutationCount,
      audioSchedulerCalls: runtime.audioSchedulerCalls,
    },
    frozenWindow,
    entityPeaks: runtime.entityPeaks,
    finalState: runtime.state,
    documentHiddenDuringSample,
    visibilityEvents: runtime.visibilityEvents,
  };
}

function metricDeltaMs(
  before: Record<string, number>,
  after: Record<string, number>,
  name: string,
) {
  return round(((after[name] ?? 0) - (before[name] ?? 0)) * 1_000);
}

function mean(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(sortedValues: number[], ratio: number) {
  if (sortedValues.length === 0) return 0;
  return sortedValues[Math.min(sortedValues.length - 1, Math.floor(sortedValues.length * ratio))];
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

declare global {
  interface Window {
    __NEON_OVERDRIVE__: any;
    __NEON_PERF__: {
      previousFrameAt: number;
      frameIntervalsMs: number[];
      longTaskDurationsMs: number[];
      updateCalls: number;
      playingSimulationTicks: number;
      hudMutationCount: number;
      audioSchedulerCalls: number;
      audioSchedulerTimestampsEpochMs: number[];
      visibilityEvents: Array<{ hidden: boolean; state: string }>;
      hiddenSnapshot: RuntimeSample | null;
      sampleSnapshot: RuntimeSample | null;
      pendingFrame: FrameRequestCallback | null;
      running: boolean;
      sampleEndAt: number;
      entityPeaks: Record<string, number>;
      reset(): void;
      snapshot(): RuntimeSample;
      startSample(sampleMs: number): void;
    };
  }
}
