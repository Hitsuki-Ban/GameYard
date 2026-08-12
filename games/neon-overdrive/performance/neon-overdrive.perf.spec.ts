import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { cpus, platform, release } from "node:os";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzip, gzip } from "node:zlib";
import { promisify } from "node:util";

import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type CDPSession,
  type Frame,
  type Page,
} from "@playwright/test";

import { NEON_GAMEPLAY_SEED } from "../guest/src/simulation.js";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const playwrightVersion = (require("@playwright/test/package.json") as { version: string }).version;
const performanceRoot = dirname(fileURLToPath(import.meta.url));
const evidencePath = resolve(performanceRoot, "after-evidence.json");
const tracesRoot = resolve(performanceRoot, "traces");
const RECORD = process.env.NEON_PERF_RECORD === "1";
const DIAGNOSTIC_SCENARIO = process.env.NEON_PERF_DIAGNOSTIC_SCENARIO as ScenarioName | undefined;
const DIAGNOSTIC_SAMPLES = Number(process.env.NEON_PERF_DIAGNOSTIC_SAMPLES ?? "1");
const FORCE_SOURCE_OVER = process.env.NEON_PERF_FORCE_SOURCE_OVER === "1";
const DIAGNOSTIC_CANVAS_MODE = process.env.NEON_PERF_DIAGNOSTIC_CANVAS_MODE ?? "full";
const DISABLE_CSS_EFFECTS = process.env.NEON_PERF_DISABLE_CSS_EFFECTS === "1";
const SAMPLE_COUNT = 3;
const BACKGROUND_CPU_SAMPLE_COUNT = 5;
const SERVER_SETTLE_MS = 15_000;
const WARM_UP_MS = 2_000;
const ACTIVE_SAMPLE_MS = 5_000;
const PAUSED_SAMPLE_MS = 10_000;
const FROZEN_SAMPLE_MS = 750;
const HIDDEN_SETTLE_BUDGET_MS = 250;
const VIEWPORT = { width: 1440, height: 900 };
const SEED = NEON_GAMEPLAY_SEED;
const PRODUCTION_URL = "http://127.0.0.1:5187/?game=neon-overdrive";
const TESTKIT_URL = "http://127.0.0.1:5194/";
const PRODUCTION_SETTINGS = Object.freeze({
  audio: { master: 0.72, music: 0.72, sfx: 0.72 },
  motion: { reduced: false, screenShake: true },
});
const LAB_SETTINGS = Object.freeze({
  audio: { master: 0.72, music: 0.72, sfx: 0.72 },
  motion: { reduced: false, screenShake: true },
});

type ScenarioName = "normal" | "cpu-4x" | "dense-boss" | "paused" | "hidden-frozen";
const REFERENCE_SCENARIOS = [
  "normal",
  "cpu-4x",
  "dense-boss",
  "paused",
  "hidden-frozen",
] as const satisfies readonly ScenarioName[];

type BrowserProbeSnapshot = {
  durationMs: number;
  frameIntervalsMs: number[];
  longTaskDurationsMs: number[];
  hudMutationCount: number;
  audioSourceStarts: number;
  entityPeaks: null | Record<string, number>;
  visibilityEvents: Array<{ hidden: boolean; state: string; atMs: number }>;
};

type ScenarioSample = {
  scenario: ScenarioName;
  sample: number;
  surface: "production-hub-iframe" | "lab-testkit";
  cpuThrottleRate: number;
  durationMs: number;
  frames: {
    count: number;
    fps: number;
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    maxMs: number;
    over33_4Ratio: number;
  };
  longTasks: { count: number; totalMs: number; maxMs: number };
  cdp: { taskMs: number; scriptMs: number; layoutMs: number; taskPercent: number };
  activity: { hudMutations: number; audioSourceStarts: number };
  entities: null | Record<string, number>;
  lifecycle: null | {
    hiddenStopLatencyMs: number;
    runTickBefore: number;
    runTickAfter: number;
    animationFramesAfter: number;
    audioSourcesAfter: number;
    musicSchedulerAfter: number;
    visibleWithoutResumeRunTick: number;
  };
  trace: null | { path: string };
};

type ScenarioAggregate = {
  scenario: ScenarioName;
  samples: number;
  frames: {
    fpsMedian: number;
    p95MedianMs: number;
    maxMs: number;
    over33_4RatioMedian: number;
  };
  longTasks: { maxMs: number; totalMedianMs: number };
  cdp: { taskPercentMedian: number; layoutMedianMs: number };
  activity: { hudMutationsMax: number; audioSourceStartsMedian: number };
  entityPeaks: null | Record<string, number>;
};

function referenceHarness() {
  return {
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    headless: true,
    colorScheme: "light",
    locale: { browser: "zh-CN", resolved: "zh-Hans" },
    seed: SEED,
    settings: { production: PRODUCTION_SETTINGS, lab: LAB_SETTINGS },
    samplesPerScenario: SAMPLE_COUNT,
    backgroundCpuSampleCount: BACKGROUND_CPU_SAMPLE_COUNT,
    serverSettleMs: SERVER_SETTLE_MS,
    warmUpMs: WARM_UP_MS,
    activeSampleMs: ACTIVE_SAMPLE_MS,
    pausedSampleMs: PAUSED_SAMPLE_MS,
    frozenSampleMs: FROZEN_SAMPLE_MS,
    hiddenSettleBudgetMs: HIDDEN_SETTLE_BUDGET_MS,
    surfaces: {
      production:
        "assembled Hub + production Neon same-origin iframe, including Hub task/layout cost",
      lab: "same production runtime with bounded testkit-only read-only counters and mutations",
    },
    inputs: {
      normal: "Hub deep link -> Guest IGNITE -> natural Story auto-fire",
      cpu4x: "normal input path with Chromium CPU throttling active before navigation",
      dense:
        "Lab Host settings apply -> presentation freeze -> Guest IGNITE -> protected player -> Mirror Saint -> 900 fixed ticks -> natural presentation",
      paused: "normal input path -> two-second warm-up -> Hub Pause",
      hidden:
        "Lab Host settings apply -> presentation freeze -> Guest IGNITE -> protected player -> natural warm-up -> visibilitychange hidden -> CDP frozen -> visible without Host resume",
    },
    traceCategories: "devtools.timeline,toplevel,disabled-by-default-devtools.timeline.frame",
  };
}

function referenceBudgets() {
  return {
    normal: { medianFpsMin: 58, p95FrameMsMax: 20, over33_4RatioMax: 0.01 },
    cpu4x: { p95FrameMsMax: 50.1, frameAndTaskMsMax: 100 },
    dense: {
      p95FrameMsMax: 33.4,
      entityCaps: { enemyBullets: 2600, playerBullets: 420, particles: 950, lasers: 24 },
    },
    paused: { durationMs: PAUSED_SAMPLE_MS, hudMutationsMax: 0, taskPercentMax: 5 },
    hidden: { settleMsMax: HIDDEN_SETTLE_BUDGET_MS, noCatchUp: true },
  };
}

function referenceEnvironment(browser: Browser, backgroundCpuSamples: number[]) {
  const referenceCpu = cpus()[0]?.model;
  if (!referenceCpu) throw new Error("Neon reference machine did not expose a CPU model.");
  return {
    platform: platform(),
    release: release(),
    cpu: referenceCpu,
    node: process.version,
    backgroundCpuSamples,
    browser: { engine: "chromium", version: browser.version(), playwrightVersion },
  };
}

async function productionBuildId(): Promise<string> {
  const response = await fetch("http://127.0.0.1:5187/build-info.json");
  if (!response.ok) throw new Error(`Unable to read production build-info: ${response.status}`);
  return ((await response.json()) as { buildId: string }).buildId;
}

test("records the final Hub + Neon reference performance matrix", async ({ browser }) => {
  test.setTimeout(300_000);
  const diagnosticOverride =
    FORCE_SOURCE_OVER || DIAGNOSTIC_CANVAS_MODE !== "full" || DISABLE_CSS_EFFECTS;
  if (RECORD && (DIAGNOSTIC_SCENARIO !== undefined || diagnosticOverride)) {
    throw new Error("Reference recording cannot run with diagnostic overrides.");
  }
  if (DIAGNOSTIC_SCENARIO === undefined && diagnosticOverride) {
    throw new Error("Canvas and CSS diagnostics require NEON_PERF_DIAGNOSTIC_SCENARIO.");
  }
  if (!Number.isInteger(DIAGNOSTIC_SAMPLES) || DIAGNOSTIC_SAMPLES < 1 || DIAGNOSTIC_SAMPLES > 3) {
    throw new RangeError("NEON_PERF_DIAGNOSTIC_SAMPLES must be an integer from 1 through 3.");
  }
  if (!RECORD && DIAGNOSTIC_SCENARIO === undefined) {
    await verifyRecordedEvidence(browser);
    return;
  }
  const backgroundCpuSamples = RECORD
    ? await (async () => {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, SERVER_SETTLE_MS));
        return sampleReferenceMachineLoad();
      })()
    : [];
  const scenarioNames = DIAGNOSTIC_SCENARIO ? [DIAGNOSTIC_SCENARIO] : REFERENCE_SCENARIOS;
  const sampleCount = DIAGNOSTIC_SCENARIO ? DIAGNOSTIC_SAMPLES : SAMPLE_COUNT;
  const samples: ScenarioSample[] = [];
  for (const scenario of scenarioNames) {
    for (let sample = 1; sample <= sampleCount; sample += 1) {
      samples.push(
        await test.step(`${scenario} sample ${sample}/${sampleCount}`, () =>
          captureSample(browser, scenario, sample)),
      );
    }
  }

  if (DIAGNOSTIC_SCENARIO !== undefined) {
    console.log(JSON.stringify(samples, null, 2));
    return;
  }

  const scenarios = REFERENCE_SCENARIOS.map((scenario) =>
    aggregateScenario(
      scenario,
      samples.filter((sample) => sample.scenario === scenario),
    ),
  );
  try {
    assertBudgets(samples, scenarios);
  } catch (error) {
    console.error(JSON.stringify({ backgroundCpuSamples, scenarios, samples }, null, 2));
    throw error;
  }
  const traceProfiles: ScenarioSample[] = [];
  for (const scenario of REFERENCE_SCENARIOS) {
    traceProfiles.push(
      await test.step(`${scenario} trace profile`, () => captureSample(browser, scenario, 0, true)),
    );
  }
  const evidence = {
    schemaVersion: 2,
    subject: "neon-overdrive-final-hub-runtime-after-issue-52",
    buildId: await productionBuildId(),
    recordedAt: new Date().toISOString(),
    environment: referenceEnvironment(browser, backgroundCpuSamples),
    harness: referenceHarness(),
    budgets: referenceBudgets(),
    scenarios,
    samples,
    traceProfiles,
  };

  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
});

type ReferenceEvidence = {
  schemaVersion: number;
  subject: string;
  buildId: string;
  recordedAt: string;
  environment: ReturnType<typeof referenceEnvironment>;
  harness: ReturnType<typeof referenceHarness>;
  budgets: ReturnType<typeof referenceBudgets>;
  scenarios: ScenarioAggregate[];
  samples: ScenarioSample[];
  traceProfiles: ScenarioSample[];
};

async function verifyRecordedEvidence(browser: Browser): Promise<void> {
  const recorded = JSON.parse(await readFile(evidencePath, "utf8")) as ReferenceEvidence;
  expect(recorded.schemaVersion).toBe(2);
  expect(recorded.subject).toBe("neon-overdrive-final-hub-runtime-after-issue-52");
  expect(recorded.buildId).toBe(await productionBuildId());
  if (!Number.isFinite(Date.parse(recorded.recordedAt))) {
    throw new TypeError("Neon performance evidence recordedAt must be an ISO timestamp.");
  }
  expect(recorded.environment.backgroundCpuSamples).toHaveLength(BACKGROUND_CPU_SAMPLE_COUNT);
  if (
    recorded.environment.backgroundCpuSamples.some(
      (value) => typeof value !== "number" || !Number.isFinite(value),
    )
  ) {
    throw new TypeError("Neon performance evidence contains an invalid background CPU sample.");
  }
  expect(recorded.environment).toEqual(
    referenceEnvironment(browser, recorded.environment.backgroundCpuSamples),
  );
  expect(recorded.harness).toEqual(referenceHarness());
  expect(recorded.budgets).toEqual(referenceBudgets());

  const recordedScenarios = REFERENCE_SCENARIOS.map((scenario) =>
    aggregateScenario(
      scenario,
      recorded.samples.filter((sample) => sample.scenario === scenario),
    ),
  );
  expect(recorded.scenarios).toEqual(recordedScenarios);
  assertBudgets(recorded.samples, recordedScenarios);
  expect(recorded.scenarios.map((scenario) => scenario.scenario)).toEqual(REFERENCE_SCENARIOS);
  expect(recorded.traceProfiles.map((profile) => profile.scenario)).toEqual(REFERENCE_SCENARIOS);

  for (const profile of recorded.traceProfiles) {
    expect(profile.sample).toBe(0);
    if (profile.trace === null) throw new Error(`${profile.scenario} trace profile is missing.`);
    const tracePath = resolve(performanceRoot, profile.trace.path);
    const traceRelativeToRoot = relative(tracesRoot, tracePath);
    if (traceRelativeToRoot.startsWith("..") || isAbsolute(traceRelativeToRoot)) {
      throw new Error(`${profile.scenario} trace escaped the Neon trace root.`);
    }
    const trace = JSON.parse((await gunzipAsync(await readFile(tracePath))).toString("utf8")) as {
      traceEvents?: unknown;
    };
    if (!Array.isArray(trace.traceEvents)) {
      throw new TypeError(`${profile.scenario} trace must contain a traceEvents array.`);
    }
  }
}

async function sampleReferenceMachineLoad(): Promise<number[]> {
  if (platform() !== "win32") {
    throw new Error(
      "Neon absolute performance evidence must run on the fixed Windows reference machine.",
    );
  }
  const command = [
    `$samples = Get-Counter '\\Processor(_Total)\\% Processor Time' -SampleInterval 1 -MaxSamples ${BACKGROUND_CPU_SAMPLE_COUNT}`,
    "$values = @($samples.CounterSamples | Where-Object { $_.Status -eq 0 } | ForEach-Object { [math]::Round($_.CookedValue, 3) })",
    "$values | ConvertTo-Json -Compress",
  ].join("; ");
  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", command],
    { encoding: "utf8", timeout: 20_000, windowsHide: true },
  );
  const values = JSON.parse(stdout.trim()) as unknown;
  if (
    !Array.isArray(values) ||
    values.length !== BACKGROUND_CPU_SAMPLE_COUNT ||
    values.some((value) => typeof value !== "number" || !Number.isFinite(value))
  ) {
    throw new Error("Neon performance load sample did not return five finite CPU values.");
  }
  return values as number[];
}

async function captureSample(
  browser: Browser,
  scenario: ScenarioName,
  sample: number,
  traceEnabled = false,
): Promise<ScenarioSample> {
  const context = await browser.newContext({
    colorScheme: "light",
    deviceScaleFactor: 1,
    locale: "zh-CN",
    reducedMotion: "no-preference",
    viewport: VIEWPORT,
  });
  await installProbe(context);
  const page = await context.newPage();
  const session = await context.newCDPSession(page);
  await session.send("Performance.enable");
  if (scenario === "cpu-4x") await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  try {
    if (scenario === "dense-boss" || scenario === "hidden-frozen") {
      return await captureLabSample(page, session, scenario, sample, traceEnabled);
    }
    return await captureProductionSample(page, session, scenario, sample, traceEnabled);
  } finally {
    if (scenario === "cpu-4x") {
      await session.send("Emulation.setCPUThrottlingRate", { rate: 1 }).catch(() => undefined);
    }
    await session.detach().catch(() => undefined);
    await context.close();
  }
}

async function captureProductionSample(
  page: Page,
  session: CDPSession,
  scenario: "normal" | "cpu-4x" | "paused",
  sample: number,
  traceEnabled: boolean,
): Promise<ScenarioSample> {
  await page.goto(PRODUCTION_URL, { waitUntil: "load" });
  await expect(page.locator(".runtime-state--active")).toBeVisible({ timeout: 15_000 });
  const frame = await neonFrame(page);
  expect(await frame.evaluate(() => document.documentElement.lang)).toBe("zh-Hans");
  expect(await readProjectedSettings(frame)).toEqual(PRODUCTION_SETTINGS);
  if (DISABLE_CSS_EFFECTS) {
    await frame.addStyleTag({
      content: `
        .ambient, .crt-overlay, .screen-shell::before, .screen-shell::after { display: none !important; }
        .screen-shell, .hud, .hud-box, .drive-track { box-shadow: none !important; }
      `,
    });
  }
  await frame.locator("#ignite-button").click();
  await expect(frame.locator("#title-screen")).not.toBeVisible();
  await page.waitForTimeout(WARM_UP_MS);

  if (scenario === "paused") {
    await page.locator(".runtime-toolbar__actions button").first().click();
    await expect(page.locator(".runtime-state--paused")).toBeVisible();
    await expect(frame.locator("#pause-dialog")).toBeVisible();
  }
  const durationMs = scenario === "paused" ? PAUSED_SAMPLE_MS : ACTIVE_SAMPLE_MS;
  return measureWindow({
    frame,
    page,
    session,
    scenario,
    sample,
    durationMs,
    surface: "production-hub-iframe",
    cpuThrottleRate: scenario === "cpu-4x" ? 4 : 1,
    entities: null,
    traceEnabled,
  });
}

async function captureLabSample(
  page: Page,
  session: CDPSession,
  scenario: "dense-boss" | "hidden-frozen",
  sample: number,
  traceEnabled: boolean,
): Promise<ScenarioSample> {
  await page.goto(TESTKIT_URL, { waitUntil: "load" });
  await page.waitForFunction(
    () =>
      window.__NEON_HOST__?.ready === true && typeof window.__NEON_DEBUG__?.observe === "function",
  );
  await page.evaluate(
    async (settings) =>
      window.__NEON_HOST__.applySettings({ revision: 1, ...structuredClone(settings) }),
    LAB_SETTINGS,
  );
  expect(await page.evaluate(() => window.__NEON_HOST__.context.settings)).toEqual({
    revision: 1,
    ...LAB_SETTINGS,
  });
  expect(await page.evaluate(() => document.documentElement.lang)).toBe("zh-Hans");
  await page.evaluate(() => {
    window.__NEON_DEBUG__.freezePresentation();
  });
  await page.locator("#ignite-button").click();
  await expect(page.locator("#title-screen")).not.toBeVisible();
  await page.evaluate(() => window.__NEON_DEBUG__.mutate("protectPlayer"));

  if (scenario === "hidden-frozen") {
    await page.evaluate(() => window.__NEON_DEBUG__.resumePresentation());
    await page.waitForTimeout(WARM_UP_MS);
    return captureHiddenSample(page, session, sample, traceEnabled);
  }

  await page.evaluate(() => {
    window.__NEON_DEBUG__.mutate("spawnBoss", 1);
    window.__NEON_DEBUG__.advance(900);
    window.__NEON_DEBUG__.resumePresentation();
  });
  await page.waitForTimeout(WARM_UP_MS);
  const before = await page.evaluate(() => window.__NEON_DEBUG__.observe().counts);
  const measured = await measureWindow({
    frame: page.mainFrame(),
    page,
    session,
    scenario,
    sample,
    durationMs: ACTIVE_SAMPLE_MS,
    surface: "lab-testkit",
    cpuThrottleRate: 1,
    entities: before,
    traceEnabled,
  });
  const after = await page.evaluate(() => window.__NEON_DEBUG__.observe().counts);
  measured.entities = maxEntityCounts(measured.entities ?? {}, before, after);
  return measured;
}

async function captureHiddenSample(
  page: Page,
  session: CDPSession,
  sample: number,
  traceEnabled: boolean,
): Promise<ScenarioSample> {
  const before = await page.evaluate(() => ({
    snapshot: window.__NEON_DEBUG__.observe(),
    resources: window.__NEON_DEBUG__.resources(),
  }));
  expect(before.resources.audioContexts).toBe(1);
  expect(before.resources.musicScheduler).toBe(1);
  expect(before.resources.musicSources).toBeGreaterThan(0);
  await page.evaluate(() => window.__GAMEYARD_NEON_PERF__.start("#hud"));
  const cdpBefore = await cdpMetrics(session);
  const trace = await startTrace(session, "hidden-frozen", sample, traceEnabled);
  const hidden = await page.evaluate(() => {
    const runTickBefore = window.__NEON_DEBUG__.observe().runTick;
    const startedAt = performance.now();
    Object.defineProperties(document, {
      hidden: { configurable: true, get: () => true },
      visibilityState: { configurable: true, get: () => "hidden" },
    });
    document.dispatchEvent(new Event("visibilitychange"));
    return {
      elapsedMs: performance.now() - startedAt,
      runTickBefore,
      snapshot: window.__NEON_DEBUG__.observe(),
      resources: window.__NEON_DEBUG__.resources(),
    };
  });
  await page.waitForTimeout(HIDDEN_SETTLE_BUDGET_MS);
  const settled = await page.evaluate(() => ({
    snapshot: window.__NEON_DEBUG__.observe(),
    resources: window.__NEON_DEBUG__.resources(),
  }));
  await session.send("Page.setWebLifecycleState", { state: "frozen" });
  await new Promise((resolveDelay) => setTimeout(resolveDelay, FROZEN_SAMPLE_MS));
  await session.send("Page.setWebLifecycleState", { state: "active" });
  const frozen = await page.evaluate(() => ({
    snapshot: window.__NEON_DEBUG__.observe(),
    resources: window.__NEON_DEBUG__.resources(),
  }));
  await page.evaluate(() => {
    Reflect.deleteProperty(document, "hidden");
    Reflect.deleteProperty(document, "visibilityState");
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(HIDDEN_SETTLE_BUDGET_MS);
  const visibleWithoutResume = await page.evaluate(() => ({
    snapshot: window.__NEON_DEBUG__.observe(),
    resources: window.__NEON_DEBUG__.resources(),
  }));
  const probe = await page.evaluate(() => window.__GAMEYARD_NEON_PERF__.stop());
  const cdpAfter = await cdpMetrics(session);
  const traceEvidence = await finishTrace(session, trace);

  expect(hidden.elapsedMs).toBeLessThanOrEqual(HIDDEN_SETTLE_BUDGET_MS);
  expect(hidden.snapshot.runTick).toBe(hidden.runTickBefore);
  expect(settled.snapshot).toEqual(hidden.snapshot);
  expect(frozen.snapshot).toEqual(hidden.snapshot);
  expect(visibleWithoutResume.snapshot).toEqual(hidden.snapshot);
  for (const resources of [
    hidden.resources,
    settled.resources,
    frozen.resources,
    visibleWithoutResume.resources,
  ]) {
    expect(resources).toMatchObject({
      animationFrames: 0,
      audioSources: 0,
      musicScheduler: 0,
      musicSources: 0,
    });
  }

  return summarizeSample({
    scenario: "hidden-frozen",
    sample,
    surface: "lab-testkit",
    cpuThrottleRate: 1,
    probe,
    cdpBefore,
    cdpAfter,
    entities: before.snapshot.counts,
    lifecycle: {
      hiddenStopLatencyMs: round(hidden.elapsedMs),
      runTickBefore: hidden.runTickBefore,
      runTickAfter: frozen.snapshot.runTick,
      animationFramesAfter: frozen.resources.animationFrames,
      audioSourcesAfter: frozen.resources.audioSources,
      musicSchedulerAfter: frozen.resources.musicScheduler,
      visibleWithoutResumeRunTick: visibleWithoutResume.snapshot.runTick,
    },
    trace: traceEvidence,
  });
}

async function measureWindow(options: {
  frame: Frame;
  page: Page;
  session: CDPSession;
  scenario: ScenarioName;
  sample: number;
  durationMs: number;
  surface: ScenarioSample["surface"];
  cpuThrottleRate: number;
  entities: null | Record<string, number>;
  traceEnabled: boolean;
}): Promise<ScenarioSample> {
  await options.frame.evaluate(() => window.__GAMEYARD_NEON_PERF__.start("#hud"));
  const cdpBefore = await cdpMetrics(options.session);
  const trace = await startTrace(
    options.session,
    options.scenario,
    options.sample,
    options.traceEnabled,
  );
  await options.page.waitForTimeout(options.durationMs);
  const probe = await options.frame.evaluate(() => window.__GAMEYARD_NEON_PERF__.stop());
  const cdpAfter = await cdpMetrics(options.session);
  const traceEvidence = await finishTrace(options.session, trace);
  return summarizeSample({
    scenario: options.scenario,
    sample: options.sample,
    surface: options.surface,
    cpuThrottleRate: options.cpuThrottleRate,
    probe,
    cdpBefore,
    cdpAfter,
    entities: options.entities,
    lifecycle: null,
    trace: traceEvidence,
  });
}

async function installProbe(context: BrowserContext): Promise<void> {
  await context.addInitScript(
    ({ forceSourceOver, canvasMode }) => {
      if (
        !["full", "no-images", "no-paths", "no-rects", "no-vector", "no-text", "none"].includes(
          canvasMode,
        )
      ) {
        throw new RangeError(`Unknown Neon diagnostic Canvas mode: ${canvasMode}`);
      }
      const noOp = () => undefined;
      if (canvasMode === "no-images" || canvasMode === "none") {
        CanvasRenderingContext2D.prototype.drawImage =
          noOp as typeof CanvasRenderingContext2D.prototype.drawImage;
      }
      if (canvasMode === "no-paths" || canvasMode === "none") {
        for (const name of [
          "fill",
          "stroke",
          "fillRect",
          "strokeRect",
          "clearRect",
          "fillText",
          "strokeText",
        ] as const) {
          Object.defineProperty(CanvasRenderingContext2D.prototype, name, {
            configurable: true,
            value: noOp,
          });
        }
      }
      if (canvasMode === "no-rects") {
        for (const name of ["fillRect", "strokeRect", "clearRect"] as const) {
          Object.defineProperty(CanvasRenderingContext2D.prototype, name, {
            configurable: true,
            value: noOp,
          });
        }
      }
      if (canvasMode === "no-vector") {
        for (const name of ["fill", "stroke"] as const) {
          Object.defineProperty(CanvasRenderingContext2D.prototype, name, {
            configurable: true,
            value: noOp,
          });
        }
      }
      if (canvasMode === "no-text") {
        for (const name of ["fillText", "strokeText"] as const) {
          Object.defineProperty(CanvasRenderingContext2D.prototype, name, {
            configurable: true,
            value: noOp,
          });
        }
      }
      if (forceSourceOver) {
        const descriptor = Object.getOwnPropertyDescriptor(
          CanvasRenderingContext2D.prototype,
          "globalCompositeOperation",
        );
        if (typeof descriptor?.set !== "function") {
          throw new Error("Canvas globalCompositeOperation setter is unavailable.");
        }
        Object.defineProperty(CanvasRenderingContext2D.prototype, "globalCompositeOperation", {
          configurable: descriptor.configurable,
          enumerable: descriptor.enumerable,
          // eslint-disable-next-line typescript/unbound-method -- accessor is reinstalled on its original prototype.
          get: descriptor.get,
          set(value: GlobalCompositeOperation) {
            descriptor.set!.call(
              this,
              value === "lighter" || value === "screen" ? "source-over" : value,
            );
          },
        });
      }
      const nativeRaf = window.requestAnimationFrame.bind(window);
      let active = false;
      let startedAt = 0;
      let previousFrameAt = 0;
      let frameIntervalsMs: number[] = [];
      let longTaskDurationsMs: number[] = [];
      let hudMutationCount = 0;
      let audioSourceStarts = 0;
      let visibilityEvents: BrowserProbeSnapshot["visibilityEvents"] = [];
      let entityPeaks: null | Record<string, number> = null;
      let mutationObserver: MutationObserver | null = null;

      window.requestAnimationFrame = (callback) =>
        nativeRaf((timestamp) => {
          if (active) {
            if (previousFrameAt > 0) frameIntervalsMs.push(timestamp - previousFrameAt);
            previousFrameAt = timestamp;
            if (typeof window.__NEON_DEBUG__?.performanceCounters === "function") {
              const counters = window.__NEON_DEBUG__.performanceCounters();
              entityPeaks ??= {};
              for (const [name, value] of Object.entries(counters.entities)) {
                entityPeaks[name] = Math.max(entityPeaks[name] ?? 0, value);
              }
            }
          }
          callback(timestamp);
        });
      const sourcePrototype = globalThis.AudioScheduledSourceNode?.prototype;
      if (!sourcePrototype) {
        throw new Error("Chromium did not expose AudioScheduledSourceNode instrumentation.");
      }
      // eslint-disable-next-line typescript/unbound-method -- invoked through Reflect.apply.
      const nativeStart = sourcePrototype.start;
      sourcePrototype.start = function (...args: Parameters<AudioScheduledSourceNode["start"]>) {
        if (active) audioSourceStarts += 1;
        return Reflect.apply(nativeStart, this, args);
      };
      if (!PerformanceObserver.supportedEntryTypes.includes("longtask")) {
        throw new Error("Chromium did not expose Long Task instrumentation.");
      }
      new PerformanceObserver((list) => {
        if (!active) return;
        for (const entry of list.getEntries()) longTaskDurationsMs.push(entry.duration);
      }).observe({ entryTypes: ["longtask"] });
      document.addEventListener("visibilitychange", () => {
        if (!active) return;
        visibilityEvents.push({
          hidden: document.hidden,
          state: document.visibilityState,
          atMs: performance.now() - startedAt,
        });
      });
      window.__GAMEYARD_NEON_PERF__ = {
        start(selector: string): void {
          if (active) throw new Error("Neon performance probe is already active.");
          const target = document.querySelector(selector);
          if (target === null) throw new Error(`Neon performance target is missing: ${selector}`);
          frameIntervalsMs = [];
          longTaskDurationsMs = [];
          hudMutationCount = 0;
          audioSourceStarts = 0;
          visibilityEvents = [];
          entityPeaks = null;
          previousFrameAt = 0;
          startedAt = performance.now();
          mutationObserver = new MutationObserver((records) => {
            hudMutationCount += records.length;
          });
          mutationObserver.observe(target, {
            attributes: true,
            characterData: true,
            childList: true,
            subtree: true,
          });
          active = true;
        },
        stop(): BrowserProbeSnapshot {
          if (!active) throw new Error("Neon performance probe is not active.");
          active = false;
          mutationObserver?.disconnect();
          mutationObserver = null;
          return {
            durationMs: performance.now() - startedAt,
            frameIntervalsMs: [...frameIntervalsMs],
            longTaskDurationsMs: [...longTaskDurationsMs],
            hudMutationCount,
            audioSourceStarts,
            entityPeaks: entityPeaks === null ? null : { ...entityPeaks },
            visibilityEvents: visibilityEvents.map((entry) => ({ ...entry })),
          };
        },
      };
    },
    { forceSourceOver: FORCE_SOURCE_OVER, canvasMode: DIAGNOSTIC_CANVAS_MODE },
  );
}

async function neonFrame(page: Page): Promise<Frame> {
  const iframe = page.locator(".runtime-frame iframe");
  await expect(iframe).toBeVisible({ timeout: 15_000 });
  const handle = await iframe.elementHandle();
  const frame = await handle?.contentFrame();
  if (!frame) throw new Error("Neon production iframe did not expose a content frame.");
  await frame.waitForSelector("#ignite-button");
  return frame;
}

async function readProjectedSettings(frame: Frame) {
  return frame.evaluate(() => {
    const rangeValue = (selector: string) => {
      const input = document.querySelector(selector);
      if (!(input instanceof HTMLInputElement) || input.type !== "range") {
        throw new TypeError(`Neon performance setting is not a range: ${selector}`);
      }
      return Number(input.value);
    };
    const checked = (selector: string) => {
      const input = document.querySelector(selector);
      if (!(input instanceof HTMLInputElement) || input.type !== "checkbox") {
        throw new TypeError(`Neon performance setting is not a checkbox: ${selector}`);
      }
      return input.checked;
    };
    return {
      audio: {
        master: rangeValue("#master-volume"),
        music: rangeValue("#music-volume"),
        sfx: rangeValue("#sfx-volume"),
      },
      motion: {
        reduced: checked("#reduced-motion"),
        screenShake: checked("#screen-shake"),
      },
    };
  });
}

async function cdpMetrics(session: CDPSession): Promise<Record<string, number>> {
  const result = (await session.send("Performance.getMetrics")) as {
    metrics: Array<{ name: string; value: number }>;
  };
  return Object.fromEntries(result.metrics.map((metric) => [metric.name, metric.value]));
}

async function startTrace(
  session: CDPSession,
  scenario: ScenarioName,
  sample: number,
  enabled: boolean,
): Promise<null | { scenario: ScenarioName; sample: number }> {
  if (!RECORD || !enabled) return null;
  await session.send("Tracing.start", {
    categories: "devtools.timeline,toplevel,disabled-by-default-devtools.timeline.frame",
    options: "sampling-frequency=10000",
    transferMode: "ReturnAsStream",
  });
  return { scenario, sample };
}

async function finishTrace(
  session: CDPSession,
  trace: null | { scenario: ScenarioName; sample: number },
): Promise<ScenarioSample["trace"]> {
  if (trace === null) return null;
  const complete = new Promise<{ stream: string }>((resolveComplete) => {
    session.once("Tracing.tracingComplete", (event) => {
      resolveComplete(event as { stream: string });
    });
  });
  await session.send("Tracing.end");
  const { stream } = await complete;
  const chunks: Buffer[] = [];
  for (;;) {
    const result = (await session.send("IO.read", { handle: stream })) as {
      data: string;
      base64Encoded?: boolean;
      eof: boolean;
    };
    chunks.push(Buffer.from(result.data, result.base64Encoded ? "base64" : "utf8"));
    if (result.eof) break;
  }
  await session.send("IO.close", { handle: stream });
  const compressed = await gzipAsync(Buffer.concat(chunks), { level: 9 });
  await mkdir(tracesRoot, { recursive: true });
  const filename = `after-${trace.scenario}-sample-${trace.sample}.json.gz`;
  const path = resolve(tracesRoot, filename);
  await writeFile(path, compressed);
  return {
    path: relative(performanceRoot, path).replaceAll("\\", "/"),
  };
}

function summarizeSample(options: {
  scenario: ScenarioName;
  sample: number;
  surface: ScenarioSample["surface"];
  cpuThrottleRate: number;
  probe: BrowserProbeSnapshot;
  cdpBefore: Record<string, number>;
  cdpAfter: Record<string, number>;
  entities: null | Record<string, number>;
  lifecycle: ScenarioSample["lifecycle"];
  trace: ScenarioSample["trace"];
}): ScenarioSample {
  const frames = [...options.probe.frameIntervalsMs].sort((left, right) => left - right);
  const durationMs = options.probe.durationMs;
  const taskMs = metricDelta(options.cdpBefore, options.cdpAfter, "TaskDuration");
  return {
    scenario: options.scenario,
    sample: options.sample,
    surface: options.surface,
    cpuThrottleRate: options.cpuThrottleRate,
    durationMs: round(durationMs),
    frames: {
      count: frames.length,
      fps: round((frames.length * 1_000) / durationMs),
      p50Ms: round(percentile(frames, 0.5)),
      p95Ms: round(percentile(frames, 0.95)),
      p99Ms: round(percentile(frames, 0.99)),
      maxMs: round(frames.at(-1) ?? 0),
      over33_4Ratio: round(
        frames.length === 0
          ? 0
          : frames.filter((duration) => duration > 33.4).length / frames.length,
        6,
      ),
    },
    longTasks: {
      count: options.probe.longTaskDurationsMs.length,
      totalMs: round(sum(options.probe.longTaskDurationsMs)),
      maxMs: round(Math.max(0, ...options.probe.longTaskDurationsMs)),
    },
    cdp: {
      taskMs,
      scriptMs: metricDelta(options.cdpBefore, options.cdpAfter, "ScriptDuration"),
      layoutMs: metricDelta(options.cdpBefore, options.cdpAfter, "LayoutDuration"),
      taskPercent: round((taskMs / durationMs) * 100),
    },
    activity: {
      hudMutations: options.probe.hudMutationCount,
      audioSourceStarts: options.probe.audioSourceStarts,
    },
    entities: options.probe.entityPeaks ?? options.entities,
    lifecycle: options.lifecycle,
    trace: options.trace,
  };
}

function aggregateScenario(scenario: ScenarioName, samples: ScenarioSample[]): ScenarioAggregate {
  if (samples.length !== SAMPLE_COUNT) {
    throw new Error(`${scenario} requires exactly ${SAMPLE_COUNT} reference samples.`);
  }
  const entitySamples = samples.flatMap((sample) =>
    sample.entities === null ? [] : [sample.entities],
  );
  return {
    scenario,
    samples: samples.length,
    frames: {
      fpsMedian: round(median(samples.map((sample) => sample.frames.fps))),
      p95MedianMs: round(median(samples.map((sample) => sample.frames.p95Ms))),
      maxMs: round(Math.max(...samples.map((sample) => sample.frames.maxMs))),
      over33_4RatioMedian: round(median(samples.map((sample) => sample.frames.over33_4Ratio)), 6),
    },
    longTasks: {
      maxMs: round(Math.max(...samples.map((sample) => sample.longTasks.maxMs))),
      totalMedianMs: round(median(samples.map((sample) => sample.longTasks.totalMs))),
    },
    cdp: {
      taskPercentMedian: round(median(samples.map((sample) => sample.cdp.taskPercent))),
      layoutMedianMs: round(median(samples.map((sample) => sample.cdp.layoutMs))),
    },
    activity: {
      hudMutationsMax: Math.max(...samples.map((sample) => sample.activity.hudMutations)),
      audioSourceStartsMedian: round(
        median(samples.map((sample) => sample.activity.audioSourceStarts)),
      ),
    },
    entityPeaks: entitySamples.length === 0 ? null : maxEntityCounts(...entitySamples),
  };
}

function assertBudgets(samples: ScenarioSample[], scenarios: ScenarioAggregate[]): void {
  const byName = Object.fromEntries(
    scenarios.map((scenario) => [scenario.scenario, scenario]),
  ) as Record<ScenarioName, ScenarioAggregate>;
  expect(byName.normal.frames.fpsMedian).toBeGreaterThanOrEqual(58);
  expect(byName.normal.frames.p95MedianMs).toBeLessThanOrEqual(20);
  expect(byName.normal.frames.over33_4RatioMedian).toBeLessThan(0.01);

  expect(byName["cpu-4x"].frames.p95MedianMs).toBeLessThanOrEqual(50.1);
  expect(byName["cpu-4x"].frames.maxMs).toBeLessThanOrEqual(100);
  expect(byName["cpu-4x"].longTasks.maxMs).toBeLessThanOrEqual(100);

  expect(byName["dense-boss"].frames.p95MedianMs).toBeLessThanOrEqual(33.4);
  const denseEntities = byName["dense-boss"].entityPeaks;
  if (denseEntities === null) throw new Error("Dense boss evidence omitted entity counters.");
  expect(denseEntities.enemyBullets).toBeGreaterThan(0);
  expect(denseEntities.enemyBullets).toBeLessThanOrEqual(2600);
  expect(denseEntities.playerBullets).toBeGreaterThan(0);
  expect(denseEntities.playerBullets).toBeLessThanOrEqual(420);
  expect(denseEntities.particles).toBeLessThanOrEqual(950);
  expect(denseEntities.lasers).toBeLessThanOrEqual(24);

  expect(byName.paused.activity.hudMutationsMax).toBe(0);
  expect(byName.paused.cdp.taskPercentMedian).toBeLessThanOrEqual(5);
  for (const sample of samples.filter((entry) => entry.scenario === "paused")) {
    expect(sample.frames.count).toBe(0);
    expect(sample.activity.audioSourceStarts).toBe(0);
  }
  for (const sample of samples.filter((entry) => entry.scenario === "hidden-frozen")) {
    expect(sample.frames.count).toBe(0);
    expect(sample.activity.hudMutations).toBe(0);
    expect(sample.activity.audioSourceStarts).toBe(0);
    expect(sample.lifecycle).not.toBeNull();
    expect(sample.lifecycle!.hiddenStopLatencyMs).toBeLessThanOrEqual(HIDDEN_SETTLE_BUDGET_MS);
    expect(sample.lifecycle!.runTickAfter).toBe(sample.lifecycle!.runTickBefore);
    expect(sample.lifecycle!.visibleWithoutResumeRunTick).toBe(sample.lifecycle!.runTickBefore);
    expect(sample.lifecycle).toMatchObject({
      animationFramesAfter: 0,
      audioSourcesAfter: 0,
      musicSchedulerAfter: 0,
    });
  }
}

function maxEntityCounts(...counts: Array<Record<string, number>>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const entry of counts) {
    for (const [name, value] of Object.entries(entry)) {
      result[name] = Math.max(result[name] ?? 0, value);
    }
  }
  return result;
}

function metricDelta(
  before: Record<string, number>,
  after: Record<string, number>,
  name: string,
): number {
  const start = before[name];
  const end = after[name];
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    throw new Error(`Chromium Performance domain omitted ${name}.`);
  }
  return round((end - start) * 1_000);
}

function percentile(sorted: number[], ratio: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1);
  return sorted[Math.max(0, index)];
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function round(value: number, digits = 3): number {
  return Number(value.toFixed(digits));
}

declare global {
  interface Window {
    __GAMEYARD_NEON_PERF__: {
      start(selector: string): void;
      stop(): BrowserProbeSnapshot;
    };
    __NEON_DEBUG__: {
      advance(ticks: number): void;
      observe(): any;
      command(command: Record<string, unknown>): void;
      mutate(action: string, payload?: unknown): void;
      performanceCounters(): {
        runTick: number;
        clock: {
          clampedFrames: number;
          droppedFixedSteps: number;
          gateFirstFrameElapsedMs: number | null;
        };
        entities: Record<string, number>;
      };
      drainEvents(): any[];
      freezePresentation(): void;
      resumePresentation(): void;
      feedFrame(timestampMs: number): any;
      resources(): Record<string, number>;
    };
    __NEON_HOST__: any;
  }
}
