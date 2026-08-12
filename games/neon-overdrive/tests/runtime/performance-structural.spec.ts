import { expect, test } from "@playwright/test";

import { bootRuntime, command, mutate, observe } from "./runtime-driver";

const PAUSED_WINDOW_MS = 10_000;
const HIDDEN_SETTLE_BUDGET_MS = 250;
const FROZEN_WINDOW_MS = 750;

test("stops HUD, simulation, rendering, and audio work for a ten-second Host pause", async ({
  page,
}) => {
  test.setTimeout(30_000);
  await bootRuntime(page, { installProbe: true });
  await command(page, { type: "start", mode: "story" });
  await mutate(page, "protectPlayer");
  await expect.poll(() => observe(page).then((snapshot) => snapshot.runTick)).toBeGreaterThan(0);

  await page.evaluate(() => window.__NEON_HOST__.send("lifecycle.pause"));
  await expect(page.locator("#pause-dialog")).toBeVisible();
  const paused = await observe(page);
  const pausedResources = await page.evaluate(() => window.__NEON_DEBUG__.resources());
  expect(pausedResources).toMatchObject({
    animationFrames: 0,
    audioSources: 0,
    musicScheduler: 0,
    musicSources: 0,
  });

  await page.evaluate(() => {
    const target = document.querySelector("#hud");
    if (target === null) throw new Error("Neon HUD is unavailable for the pause mutation gate.");
    const state = { count: 0, observer: null as MutationObserver | null };
    state.observer = new MutationObserver((records) => {
      state.count += records.length;
    });
    state.observer.observe(target, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    });
    (window as any).__NEON_PAUSE_MUTATIONS__ = state;
  });

  await page.waitForTimeout(PAUSED_WINDOW_MS);
  expect(await observe(page)).toEqual(paused);
  expect(await page.evaluate(() => (window as any).__NEON_PAUSE_MUTATIONS__.count)).toBe(0);
  await page.evaluate(() => {
    (window as any).__NEON_PAUSE_MUTATIONS__.observer.disconnect();
    delete (window as any).__NEON_PAUSE_MUTATIONS__;
  });
  const afterPauseResources = await page.evaluate(() => window.__NEON_DEBUG__.resources());
  expect(afterPauseResources).toMatchObject({
    listeners: pausedResources.listeners,
    animationFrames: 0,
    gamepad: pausedResources.gamepad,
    audioContexts: pausedResources.audioContexts,
    audioSources: 0,
    musicScheduler: 0,
    musicSources: 0,
    pools: pausedResources.pools,
  });
  expect(afterPauseResources.timers).toBeLessThanOrEqual(pausedResources.timers);
});

test("reaches hidden quiescence within 250 ms and never catches up without Host resume", async ({
  context,
  page,
}) => {
  test.setTimeout(30_000);
  await bootRuntime(page);
  await command(page, { type: "start", mode: "story" });
  await mutate(page, "protectPlayer");
  await expect.poll(() => observe(page).then((snapshot) => snapshot.runTick)).toBeGreaterThan(0);

  const hiddenTransition = await page.evaluate(() => {
    const startedAt = performance.now();
    Object.defineProperties(document, {
      hidden: { configurable: true, get: () => true },
      visibilityState: { configurable: true, get: () => "hidden" },
    });
    document.dispatchEvent(new Event("visibilitychange"));
    return {
      elapsedMs: performance.now() - startedAt,
      resources: window.__NEON_DEBUG__.resources(),
      snapshot: window.__NEON_DEBUG__.observe(),
    };
  });
  expect(hiddenTransition.elapsedMs).toBeLessThanOrEqual(HIDDEN_SETTLE_BUDGET_MS);
  expect(hiddenTransition.resources).toMatchObject({
    animationFrames: 0,
    audioSources: 0,
    musicScheduler: 0,
    musicSources: 0,
  });

  await page.waitForTimeout(HIDDEN_SETTLE_BUDGET_MS);
  expect(await observe(page)).toEqual(hiddenTransition.snapshot);
  const session = await context.newCDPSession(page);
  await session.send("Page.setWebLifecycleState", { state: "frozen" });
  await new Promise((resolveDelay) => setTimeout(resolveDelay, FROZEN_WINDOW_MS));
  await session.send("Page.setWebLifecycleState", { state: "active" });
  await session.detach();
  expect(await observe(page)).toEqual(hiddenTransition.snapshot);

  await page.evaluate(() => {
    Reflect.deleteProperty(document, "hidden");
    Reflect.deleteProperty(document, "visibilityState");
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(HIDDEN_SETTLE_BUDGET_MS);
  expect(await observe(page)).toEqual(hiddenTransition.snapshot);
  expect(await page.evaluate(() => window.__NEON_DEBUG__.resources())).toMatchObject({
    animationFrames: 0,
    audioSources: 0,
    musicScheduler: 0,
    musicSources: 0,
  });

  await page.evaluate(() => window.__NEON_HOST__.send("lifecycle.resume"));
  await expect
    .poll(() => observe(page).then((snapshot) => snapshot.runTick))
    .toBeGreaterThan(hiddenTransition.snapshot.runTick);
  expect(
    await page.evaluate(
      () => window.__NEON_DEBUG__.performanceCounters().clock.gateFirstFrameElapsedMs,
    ),
  ).toBe(0);
});
