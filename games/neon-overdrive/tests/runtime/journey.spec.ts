import { expect, test, type Page } from "@playwright/test";

import {
  advance,
  bootRuntime,
  command,
  dispose,
  drainEvents,
  expectFixedStage,
  installMockGamepad,
  mutate,
  observe,
  setMockGamepad,
} from "./runtime-driver";

async function feedFrames(page: Page, startMs: number, frames: number) {
  return page.evaluate(
    ({ first, count }) => {
      let snapshot = window.__NEON_DEBUG__.observe();
      for (let frame = 1; frame <= count; frame += 1) {
        snapshot = window.__NEON_DEBUG__.feedFrame(first + (frame * 1000) / 60);
      }
      return { timestampMs: first + (count * 1000) / 60, snapshot };
    },
    { first: startMs, count: frames },
  );
}

async function feedFrameSamples(page: Page, startMs: number, frames: number) {
  return page.evaluate(
    ({ first, count }) => {
      const samples = [];
      for (let frame = 1; frame <= count; frame += 1) {
        samples.push(window.__NEON_DEBUG__.feedFrame(first + (frame * 1000) / 60));
      }
      return { timestampMs: first + (count * 1000) / 60, samples };
    },
    { first: startMs, count: frames },
  );
}

async function feedFrozenAudioFrame(page: Page, timestampMs: number) {
  await page.evaluate((timestamp) => window.__NEON_DEBUG__.feedFrame(timestamp), timestampMs);
}

async function expectMusicState(page: Page, active: boolean) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const resources = window.__NEON_DEBUG__.resources();
        return {
          scheduler: resources.musicScheduler,
          sources: resources.musicSources,
        };
      }),
    )
    .toEqual(active ? { scheduler: 1, sources: expect.any(Number) } : { scheduler: 0, sources: 0 });
  if (active) {
    await expect
      .poll(() => page.evaluate(() => window.__NEON_DEBUG__.resources().musicSources))
      .toBeGreaterThan(0);
  }
}

function expectLifeDecay(
  before: { count: number; totalLife: number },
  after: { count: number; totalLife: number },
  ticks: number,
  scale: number,
) {
  expect(after.count).toBe(before.count);
  expect(after.totalLife).toBeCloseTo(before.totalLife - before.count * (ticks / 60) * scale, 5);
}

function expectSingleAudioCue(events: any[], cue: string) {
  expect(events.filter((event) => event.type === "audio" && event.cue === cue)).toHaveLength(1);
}

async function expectLifecycleRequest(page: Page, action: "pause" | "resume") {
  await expect
    .poll(() =>
      page.evaluate(
        (expected) =>
          window.__NEON_HOST__.events.some(
            (event: any) => event?.type === "lifecycle.changeRequest" && event.action === expected,
          ),
        action,
      ),
    )
    .toBe(true);
  await page.evaluate(() => window.__NEON_HOST__.drainEvents());
}

async function defeatCurrentBoss(page: Page) {
  const before = await observe(page);
  if (before.boss === null) throw new Error("No active Neon boss to defeat.");
  await mutate(page, "damageBoss", before.boss.health + 1);
  expect((await observe(page)).boss).toBeNull();
  return (await drainEvents(page)).filter((event) => event.type.startsWith("boss."));
}

async function advanceToRunTick(page: Page, target: number) {
  let snapshot = await observe(page);
  while (snapshot.runTick < target) {
    await advance(page, target - snapshot.runTick + snapshot.hitStop.remainingTicks);
    snapshot = await observe(page);
  }
  expect(snapshot.runTick).toBe(target);
  return snapshot;
}

async function advanceToNonBossTicks(page: Page, target: number) {
  let snapshot = await observe(page);
  while (snapshot.directorClock.nonBossTicks < target) {
    await advance(
      page,
      target - snapshot.directorClock.nonBossTicks + snapshot.hitStop.remainingTicks,
    );
    snapshot = await observe(page);
  }
  expect(snapshot.directorClock.nonBossTicks).toBe(target);
  return snapshot;
}

async function installOneShotProfileClear(page: Page) {
  await page.addInitScript(() => {
    const marker = "neon-overdrive-runtime-profile-cleared";
    if (sessionStorage.getItem(marker) !== null) return;
    localStorage.removeItem("gameyard.game.neon-overdrive.profile.v1");
    sessionStorage.setItem(marker, "true");
  });
}

test("reuses the #50 Story journey and five canonical presentation references", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await installMockGamepad(page);
  await installOneShotProfileClear(page);
  await bootRuntime(page);
  await page.evaluate(() => window.__NEON_DEBUG__.freezePresentation());
  await page.evaluate(() => window.__NEON_DEBUG__.feedFrame(0));
  let frameTime = 0;
  await expectFixedStage(page);
  expect(await observe(page)).toMatchObject({ screen: "title", score: 0, tick: 0 });
  await expect(page).toHaveScreenshot("title.png");

  await drainEvents(page);
  await page.keyboard.press("Enter");
  await expect(page.locator("#gameCanvas")).toBeFocused();
  expect(await observe(page)).toMatchObject({ screen: "playing", mode: "story" });
  expectSingleAudioCue(await drainEvents(page), "select");
  await command(page, { type: "title" });

  await drainEvents(page);
  await page.locator("#archive-button").click();
  expectSingleAudioCue(await drainEvents(page), "select");
  await expect(page.locator("#archive-dialog")).toBeVisible();
  await page.locator("#archive-back").click();
  expectSingleAudioCue(await drainEvents(page), "select");
  await expect(page.locator("#title-screen")).toBeVisible();

  await page.locator("#settings-button").click();
  expectSingleAudioCue(await drainEvents(page), "select");
  await expect(page.locator("#settings-dialog")).toBeVisible();
  await page.evaluate(() => window.__NEON_HOST__.drainEvents());
  await page.locator("#fullscreen-button").click();
  expectSingleAudioCue(await drainEvents(page), "select");
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__NEON_HOST__.events.find((event: any) => event?.type === "hostAction.request"),
      ),
    )
    .toEqual({ type: "hostAction.request", action: "fullscreen.enter" });
  await page.locator("#master-volume").fill("1");
  await page.locator("#music-volume").fill("1");
  const autoGuardToggle = page
    .locator("label.toggle-row")
    .filter({ has: page.locator("#auto-guard") });
  await autoGuardToggle.click();
  await expect(page.locator("#auto-guard")).not.toBeChecked();
  await expect
    .poll(() =>
      page.evaluate(() => ({
        revision: window.__NEON_HOST__.context.settings.revision,
        master: window.__NEON_HOST__.context.settings.audio.master,
        music: window.__NEON_HOST__.context.settings.audio.music,
      })),
    )
    .toEqual({ revision: 2, master: 1, music: 1 });
  expect(
    await page.evaluate(() =>
      window.__NEON_HOST__.events.filter((event: any) => event?.type === "settings.changeRequest"),
    ),
  ).toEqual([
    { type: "settings.changeRequest", change: { audio: { master: 1 } } },
    { type: "settings.changeRequest", change: { audio: { music: 1 } } },
  ]);
  await page.evaluate(() => window.__NEON_HOST__.drainEvents());
  await page.locator("#settings-save").click();
  await expect(page.locator("#title-screen")).toBeVisible();
  expect(
    await page.evaluate(() =>
      window.__NEON_HOST__.events.some((event: any) => event?.type === "settings.changeRequest"),
    ),
  ).toBe(false);
  expect(await page.evaluate(() => window.__NEON_HOST__.context.settings)).toMatchObject({
    revision: 2,
    audio: { master: 1, music: 1 },
  });
  expect(await observe(page)).toMatchObject({
    profile: { settings: { fxDensity: 1, showHitbox: false, autoGuard: false } },
  });
  await page.locator("#settings-button").click();
  await page.locator("#master-volume").fill("0.25");
  await autoGuardToggle.click();
  await expect(page.locator("#auto-guard")).toBeChecked();
  await expect
    .poll(() => page.evaluate(() => window.__NEON_HOST__.context.settings.audio.master))
    .toBe(0.25);
  await page.locator("#settings-close").click();
  await page.locator("#settings-button").click();
  await expect(page.locator("#master-volume")).toHaveValue("0.25");
  await expect(page.locator("#auto-guard")).not.toBeChecked();
  await page.locator("#settings-close").click();

  await drainEvents(page);
  await page.locator("#ignite-button").click();
  await expect(page.locator("#gameCanvas")).toBeFocused();
  expectSingleAudioCue(await drainEvents(page), "select");
  expect(await observe(page)).toMatchObject({
    screen: "playing",
    mode: "story",
    stage: { kind: "act", value: 1 },
    shield: 3,
    rank: 0.22,
  });
  await mutate(page, "prepareDrive");
  await drainEvents(page);
  await page.keyboard.press("Space");
  expect((await drainEvents(page)).some((event) => event.type === "overdrive.activated")).toBe(
    true,
  );

  await page.evaluate(() => window.__NEON_HOST__.drainEvents());
  await page.keyboard.press("Escape");
  await expectLifecycleRequest(page, "pause");
  await page.evaluate(() => window.__NEON_HOST__.send("lifecycle.pause"));
  await expect(page.locator("#pause-dialog")).toBeVisible();
  await page.locator("#restart-button").click();
  await expect(page.locator("#pause-dialog")).toBeVisible();
  await expectLifecycleRequest(page, "resume");
  await page.evaluate(() => window.__NEON_HOST__.send("lifecycle.resume"));
  await expect(page.locator("#pause-dialog")).not.toBeVisible();
  await expect(page.locator("#gameCanvas")).toBeFocused();
  expect(await observe(page)).toMatchObject({
    screen: "playing",
    runTick: 0,
    player: { x: 270 },
  });
  frameTime = 0;
  await page.evaluate(() => window.__NEON_DEBUG__.feedFrame(0));
  const beforeRestartKeyboard = (await observe(page)).player.x;
  const restartCanvas = page.locator("#gameCanvas");
  const restartCanvasBox = await restartCanvas.boundingBox();
  if (restartCanvasBox === null) throw new Error("Neon canvas must be measurable after restart.");
  await page.mouse.move(
    restartCanvasBox.x + restartCanvasBox.width * 0.75,
    restartCanvasBox.y + restartCanvasBox.height * 0.75,
  );
  await expect(page.locator("#control-move")).toContainText("鼠标");
  await page.keyboard.down("ArrowLeft");
  await expect(page.locator("#control-move")).toContainText("WASD");
  ({ timestampMs: frameTime } = await feedFrames(page, frameTime, 4));
  await page.keyboard.up("ArrowLeft");
  expect((await observe(page)).player.x).toBeLessThan(beforeRestartKeyboard);
  await command(page, { type: "restart" });
  await feedFrozenAudioFrame(page, frameTime);
  await expectMusicState(page, true);
  await drainEvents(page);
  await advance(page, 20);
  expect((await observe(page)).counts.playerBullets).toBe(16);
  expect(
    (await drainEvents(page)).some((event) => event.type === "audio" && event.cue === "shotAccent"),
  ).toBe(false);
  await mutate(page, "spawnEnemy", { kind: "scout", x: 30, y: 300, health: 1_000 });
  const scoutShotAccents = [];
  for (let shot = 1; shot <= 20; shot += 1) {
    await drainEvents(page);
    await mutate(page, "spawnPlayerBullet", {
      x: 30,
      y: 800,
      vx: 0,
      vy: -36_000,
      radius: 4,
      damage: 1,
      type: "shot",
      pierce: 0,
      life: 1,
    });
    expect(
      (await drainEvents(page)).some(
        (event) => event.type === "audio" && event.cue === "shotAccent",
      ),
    ).toBe(false);
    await advance(page, 1);
    if (
      (await drainEvents(page)).some(
        (event) => event.type === "audio" && event.cue === "shotAccent",
      )
    ) {
      scoutShotAccents.push(shot);
    }
  }
  expect(scoutShotAccents).toEqual([5, 11, 13]);
  await command(page, { type: "restart" });
  for (const [rank, threat, label] of [
    [0.22, "low", "低"],
    [0.48, "rising", "上升"],
    [0.6, "high", "高"],
    [0.8, "fatal", "致命"],
  ] as const) {
    await mutate(page, "prepareThreat", rank);
    expect(await observe(page)).toMatchObject({ threat });
    await expect(page.locator("#side-threat")).toHaveText(label);
  }
  await mutate(page, "prepareThreat", 0.22);

  await mutate(page, "prepareGraze");
  await mutate(page, "prepareGraze");
  await mutate(page, "prepareGraze");
  const beforeNonRewardingHit = await observe(page);
  await mutate(page, "hitPlayer");
  const afterNonRewardingHit = await observe(page);
  expect(afterNonRewardingHit.stats.bulletsCancelled).toBe(
    beforeNonRewardingHit.stats.bulletsCancelled + 3,
  );
  expect(afterNonRewardingHit.pickupAggregate).toEqual(beforeNonRewardingHit.pickupAggregate);
  expect(afterNonRewardingHit.score).toBe(beforeNonRewardingHit.score);
  await mutate(page, "hitPlayer");
  const dangerStopped = await observe(page);
  expect(dangerStopped).toMatchObject({
    shield: 1,
    danger: 0,
    hitStop: { remainingTicks: 6 },
    presentationState: { danger: 0 },
    combat: { rankPenalty: 0.3 },
  });
  await advance(page, 6);
  const dangerResumed = await observe(page);
  expect(dangerResumed.tick).toBe(dangerStopped.tick);
  expect(dangerResumed.presentationState.shake).toBeCloseTo(
    dangerStopped.presentationState.shake - (6 * 26 * 0.3) / 60,
    8,
  );
  expectLifeDecay(
    dangerStopped.presentationEntities.particles,
    dangerResumed.presentationEntities.particles,
    6,
    0.3,
  );
  expect(dangerStopped.presentationEntities.floaters.count).toBeGreaterThan(0);
  expectLifeDecay(
    dangerStopped.presentationEntities.floaters,
    dangerResumed.presentationEntities.floaters,
    6,
    0.3,
  );

  await mutate(page, "prepareGuardBoundary");
  await mutate(page, "prepareGraze");
  await mutate(page, "prepareGraze");
  await mutate(page, "prepareGraze");
  const beforeManualGuard = await observe(page);
  await drainEvents(page);
  await page.keyboard.press("Space");
  const guardBoundaryEvents = await drainEvents(page);
  expect(guardBoundaryEvents.some((event) => event.type === "overdrive.activated")).toBe(false);
  expectSingleAudioCue(guardBoundaryEvents, "pulse");
  expect(guardBoundaryEvents.filter((event) => event.type === "guard.pulse")).toEqual([
    expect.objectContaining({ cancelled: 3 }),
  ]);
  const afterManualGuard = await observe(page);
  expect(afterManualGuard).toMatchObject({
    combat: { overdrive: { remaining: 0 } },
    pickupAggregate: { driveCount: 1, driveValueTotal: 45 },
  });
  expect(afterManualGuard.stats.bulletsCancelled).toBe(
    beforeManualGuard.stats.bulletsCancelled + 3,
  );
  expect(afterManualGuard.score).toBeGreaterThan(beforeManualGuard.score);
  expect(afterManualGuard.combat.chain.raw).toBeGreaterThan(beforeManualGuard.combat.chain.raw);
  expect(afterManualGuard.presentationEntities.particles.count).toBeGreaterThan(
    beforeManualGuard.presentationEntities.particles.count,
  );
  expect(afterManualGuard.drive).toBeLessThan(99.25);

  await mutate(page, "prepareDrive");
  await expect(page.locator("#touch-drive")).toHaveClass(/ready/u);
  await drainEvents(page);
  await page.keyboard.press("Space");
  const activatedOverdrive = await observe(page);
  expect(activatedOverdrive).toMatchObject({
    hitStop: { remainingTicks: 5 },
    combat: { overdrive: { max: 6.2, remaining: 6.2 } },
  });
  expect(activatedOverdrive.combat.rankPenalty).toBeCloseTo(0.22, 12);
  expect((await drainEvents(page)).some((event) => event.type === "overdrive.activated")).toBe(
    true,
  );
  expect((await observe(page)).driveReady).toBe(false);
  await advance(page, 5);
  await advance(page, 30);
  await expect(page.locator("#touch-drive")).not.toHaveClass(/ready/u);
  const earlySettlement = await observe(page);
  const expectedEarlyReward = Math.floor(
    15_000 *
      (earlySettlement.combat.overdrive.remaining / earlySettlement.combat.overdrive.max) *
      earlySettlement.combat.chain.multiplier,
  );
  await page.keyboard.press("Space");
  expect((await observe(page)).combat.overdrive.remaining).toBe(0);
  expect((await observe(page)).score - earlySettlement.score).toBe(expectedEarlyReward);

  await mutate(page, "prepareDrive");
  await page.keyboard.press("Space");
  await advance(page, 5 + 334);
  const protectedTail = await observe(page);
  expect(protectedTail.combat.overdrive.remaining).toBeLessThanOrEqual(0.65);
  await page.keyboard.press("Space");
  expect((await observe(page)).combat.overdrive.remaining).toBe(
    protectedTail.combat.overdrive.remaining,
  );
  expect((await observe(page)).score).toBe(protectedTail.score);
  await advance(page, 38);
  expect((await observe(page)).combat.overdrive.remaining).toBe(0);

  await command(page, { type: "restart" });
  await mutate(page, "protectPlayer");
  expect(await observe(page)).toMatchObject({ runTick: 0, shield: 3, danger: 0 });
  await drainEvents(page);
  await advance(page, 8 * 60);
  const activeEvents = await drainEvents(page);
  expect(activeEvents.filter((event) => event.type === "tutorial.autoFire")).toHaveLength(0);
  const active = await observe(page);
  expect(active.counts.enemies).toBeGreaterThan(0);
  expect(active.counts.enemyBullets).toBeGreaterThan(4);
  expect(active.counts.playerBullets).toBeGreaterThan(0);
  await expect(page).toHaveScreenshot("active-pattern.png");

  const canvas = page.locator("#gameCanvas");
  const canvasBox = await canvas.boundingBox();
  if (canvasBox === null) throw new Error("Neon canvas has no input box.");

  await page.mouse.move(canvasBox.x + canvasBox.width * 0.12, canvasBox.y + canvasBox.height * 0.7);
  let sampled = await feedFrameSamples(page, frameTime, 18);
  frameTime = sampled.timestampMs;
  expect(sampled.samples.every((snapshot) => Math.abs(snapshot.player.vx) <= 620)).toBe(true);
  expect(
    sampled.samples.every(
      (snapshot, index) => index === 0 || snapshot.player.x <= sampled.samples[index - 1].player.x,
    ),
  ).toBe(true);
  expect(
    sampled.samples.every(
      (snapshot, index) =>
        index === 0 ||
        Math.abs(snapshot.player.x - sampled.samples[index - 1].player.x) <= 620 / 60 + 0.01,
    ),
  ).toBe(true);
  expect(
    (await drainEvents(page)).filter((event) => event.type === "tutorial.autoFire"),
  ).toHaveLength(1);
  ({ timestampMs: frameTime } = await feedFrames(page, frameTime, 2));
  expect(
    (await drainEvents(page)).filter((event) => event.type === "tutorial.autoFire"),
  ).toHaveLength(0);
  await command(page, { type: "releaseAll" });
  await advance(page, 60);
  await drainEvents(page);
  await mutate(page, "prepareGraze");
  await advance(page, 1);
  const firstGraze = await observe(page);
  expect(firstGraze.danger).toBeGreaterThan(0);
  expect(firstGraze.presentationState.goldSparkCount).toBeGreaterThan(0);
  await advance(page, 2);
  await expect
    .poll(() =>
      page
        .locator("#danger-vignette")
        .evaluate((element) => Number((element as HTMLElement).style.opacity)),
    )
    .toBeGreaterThan(0);
  expect(
    (await drainEvents(page)).filter((event) => event.type === "tutorial.closeCall"),
  ).toHaveLength(1);
  await mutate(page, "prepareGraze");
  await advance(page, 1);
  expect((await drainEvents(page)).some((event) => event.type === "tutorial.closeCall")).toBe(
    false,
  );

  await drainEvents(page);
  const beforeKeyboardHandoff = (await observe(page)).player.x;
  await page.keyboard.down("KeyD");
  ({ timestampMs: frameTime } = await feedFrames(page, frameTime, 6));
  expect((await observe(page)).player.x).toBeGreaterThan(beforeKeyboardHandoff);
  await page.keyboard.up("KeyD");
  ({ timestampMs: frameTime } = await feedFrames(page, frameTime, 90));

  const beforeNormalMove = (await observe(page)).player.x;
  await page.keyboard.down("ArrowRight");
  ({ timestampMs: frameTime } = await feedFrames(page, frameTime, 30));
  const afterNormalMove = await observe(page);
  expect(afterNormalMove.player.vx).toBeCloseTo(341.91, 0);
  expect(afterNormalMove.player.x - beforeNormalMove).toBeCloseTo(139.03, 0);
  await page.keyboard.up("ArrowRight");
  ({ timestampMs: frameTime } = await feedFrames(page, frameTime, 90));

  const beforeFocusMove = (await observe(page)).player.x;
  await page.keyboard.down("KeyA");
  await page.keyboard.down("ShiftLeft");
  ({ timestampMs: frameTime } = await feedFrames(page, frameTime, 30));
  const afterFocusMove = await observe(page);
  expect(afterFocusMove).toMatchObject({
    player: { focus: true },
    presentationState: {
      hitbox: { coreVisible: true, grazeRingVisible: true },
    },
  });
  expect(afterFocusMove.player.vx).toBeCloseTo(-176.41, 0);
  expect(afterFocusMove.player.x - beforeFocusMove).toBeCloseTo(-71.73, 0);
  await page.keyboard.up("ShiftLeft");
  await page.keyboard.up("KeyA");
  ({ timestampMs: frameTime } = await feedFrames(page, frameTime, 90));
  expect(await observe(page)).toMatchObject({
    player: { focus: false },
    presentationState: {
      hitbox: { coreVisible: false, grazeRingVisible: false },
    },
  });

  await setMockGamepad(page, {
    connected: true,
    x: 0,
    y: 0,
    drop: false,
    focus: false,
    pause: false,
  });
  const beforeNeutralPad = (await observe(page)).player.x;
  await page.keyboard.down("KeyD");
  ({ timestampMs: frameTime } = await feedFrames(page, frameTime, 6));
  expect((await observe(page)).player.x).toBeGreaterThan(beforeNeutralPad);
  await page.keyboard.up("KeyD");
  ({ timestampMs: frameTime } = await feedFrames(page, frameTime, 60));

  await mutate(page, "prepareDrive");
  await expect(page.locator("#touch-drive")).toHaveClass(/ready/u);
  await drainEvents(page);
  const beforePad = (await observe(page)).player.x;
  await setMockGamepad(page, {
    connected: true,
    x: -1,
    y: 0,
    drop: true,
    focus: true,
    pause: false,
  });
  ({ timestampMs: frameTime } = await feedFrames(page, frameTime, 2));
  expect(await observe(page)).toMatchObject({
    player: { focus: false, x: beforePad },
    hitStop: { remainingTicks: 3 },
  });
  expect((await drainEvents(page)).some((event) => event.type === "overdrive.activated")).toBe(
    true,
  );
  ({ timestampMs: frameTime } = await feedFrames(page, frameTime, 4));
  expect((await observe(page)).player).toMatchObject({ focus: true });
  expect((await observe(page)).player.x).toBeLessThan(beforePad);
  expect((await observe(page)).driveReady).toBe(false);
  await setMockGamepad(page, {
    connected: true,
    x: 0,
    y: 0,
    drop: false,
    focus: false,
    pause: false,
  });
  await page.keyboard.press("KeyQ");
  ({ timestampMs: frameTime } = await feedFrames(page, frameTime, 90));

  await page.mouse.move(
    canvasBox.x + canvasBox.width * 0.88,
    canvasBox.y + canvasBox.height * 0.65,
  );
  const beforeRightFocusTick = (await observe(page)).tick;
  await page.mouse.down({ button: "right" });
  sampled = await feedFrameSamples(page, frameTime, 12);
  frameTime = sampled.timestampMs;
  const rightFocusGameplaySamples = sampled.samples.filter(
    (snapshot) => snapshot.tick > beforeRightFocusTick,
  );
  expect(rightFocusGameplaySamples.length).toBeGreaterThan(0);
  expect(rightFocusGameplaySamples.every((snapshot) => snapshot.player.focus === true)).toBe(true);
  expect(sampled.samples.every((snapshot) => Math.abs(snapshot.player.vx) <= 260)).toBe(true);
  expect(
    sampled.samples.every(
      (snapshot, index) =>
        index === 0 ||
        Math.abs(snapshot.player.x - sampled.samples[index - 1].player.x) <=
          ((snapshot.tick - sampled.samples[index - 1].tick) * 260) / 60 + 0.01,
    ),
  ).toBe(true);
  const beforeRightFocusReleaseTick = (await observe(page)).tick;
  await page.mouse.up({ button: "right" });
  ({ timestampMs: frameTime } = await feedFrames(page, frameTime, 2));
  expect(await observe(page)).toMatchObject({ player: { focus: false } });
  expect((await observe(page)).tick).toBeGreaterThan(beforeRightFocusReleaseTick);

  await mutate(page, "prepareDrive");
  await drainEvents(page);
  await page.keyboard.press("Space");
  expect(
    (await drainEvents(page)).find((event) => event.type === "overdrive.activated"),
  ).toMatchObject({
    runTick: (await observe(page)).runTick,
  });
  await page.evaluate(() => window.__NEON_HOST__.drainEvents());
  await page.keyboard.press("Escape");
  await expectLifecycleRequest(page, "pause");
  await page.evaluate(() => window.__NEON_HOST__.send("lifecycle.pause"));
  await expect(page.locator("#pause-dialog")).toBeVisible();
  await page.locator("#resume-button").click();
  await expectLifecycleRequest(page, "resume");
  await page.evaluate(() => window.__NEON_HOST__.send("lifecycle.resume"));
  await expect(page.locator("#gameCanvas")).toBeFocused();

  await mutate(page, "prepareDrive");
  await drainEvents(page);
  await page.keyboard.press("Space");
  expect((await drainEvents(page)).some((event) => event.type === "overdrive.activated")).toBe(
    true,
  );
  expect(await observe(page)).toMatchObject({ hitStop: { remainingTicks: 5 } });
  await advance(page, 5);
  expect(await observe(page)).toMatchObject({ hitStop: { remainingTicks: 0 } });
  await mutate(page, "prepareDrive");
  await drainEvents(page);
  await page.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height * 0.7);
  await page.mouse.down();
  await page.mouse.up();
  expect((await drainEvents(page)).some((event) => event.type === "overdrive.activated")).toBe(
    true,
  );
  expect(await observe(page)).toMatchObject({ hitStop: { remainingTicks: 5 } });

  const cdp = await page.context().newCDPSession(page);
  const touchStart = {
    x: canvasBox.x + canvasBox.width * 0.35,
    y: canvasBox.y + canvasBox.height * 0.75,
  };
  const touchEnd = {
    x: canvasBox.x + canvasBox.width * 0.65,
    y: canvasBox.y + canvasBox.height * 0.55,
  };
  const beforeTouch = (await observe(page)).player.x;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [touchStart] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [touchEnd] });
  await advance(page, 5);
  expect(await observe(page)).toMatchObject({
    player: { x: beforeTouch },
    hitStop: { remainingTicks: 0 },
  });
  ({ timestampMs: frameTime } = await feedFrames(page, frameTime, 2));
  expect((await observe(page)).player.x).toBeGreaterThan(beforeTouch);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();

  await mutate(page, "prepareDrive");
  await drainEvents(page);
  const touchDropBox = await page.locator("#touch-drive").boundingBox();
  if (touchDropBox === null) throw new Error("Neon on-screen DROP control has no input box.");
  await page.touchscreen.tap(
    touchDropBox.x + touchDropBox.width / 2,
    touchDropBox.y + touchDropBox.height / 2,
  );
  expect((await drainEvents(page)).some((event) => event.type === "overdrive.activated")).toBe(
    true,
  );
  await mutate(page, "prepareDrive");
  await drainEvents(page);
  await page.locator("#touch-drive").focus();
  await page.keyboard.press("Space");
  expect((await drainEvents(page)).some((event) => event.type === "overdrive.activated")).toBe(
    true,
  );
  await mutate(page, "prepareDrive");
  await drainEvents(page);
  await page.keyboard.press("Enter");
  expect((await drainEvents(page)).some((event) => event.type === "overdrive.activated")).toBe(
    true,
  );

  await page.evaluate(() => window.__NEON_HOST__.drainEvents());
  await setMockGamepad(page, {
    connected: true,
    x: 0,
    y: 0,
    drop: false,
    focus: false,
    pause: true,
  });
  ({ timestampMs: frameTime } = await feedFrames(page, frameTime, 1));
  await expectLifecycleRequest(page, "pause");
  await setMockGamepad(page, {
    connected: true,
    x: 0,
    y: 0,
    drop: false,
    focus: false,
    pause: false,
  });

  const inputBurstHitStop = await observe(page);
  expect(inputBurstHitStop.hitStop.remainingTicks).toBeGreaterThan(0);
  await advance(page, inputBurstHitStop.hitStop.remainingTicks);
  expect(await observe(page)).toMatchObject({
    tick: inputBurstHitStop.tick,
    hitStop: { remainingTicks: 0 },
  });

  const beforeTargetSetup = await observe(page);
  await mutate(page, "prepareResult", {
    score: beforeTargetSetup.score,
    chain: 0,
    maxChain: 1,
    bosses: 0,
  });
  const beforeTarget = await observe(page);
  await mutate(page, "spawnEnemy", { kind: "scout", x: 30, y: 300, health: 1 });
  await mutate(page, "spawnPlayerBullet", {
    x: 30,
    y: 800,
    vx: 0,
    vy: -36_000,
    radius: 4,
    damage: 2,
    type: "shot",
    pierce: 0,
    life: 1,
  });
  await drainEvents(page);
  await advance(page, 2);
  const destroyed = (await drainEvents(page)).find((event) => event.type === "enemy.destroyed");
  expect(destroyed).toMatchObject({ runTick: expect.any(Number) });
  expect((await observe(page)).score).toBeGreaterThan(beforeTarget.score);
  expect((await observe(page)).chain).toBeGreaterThan(beforeTarget.chain);

  const listenerBaseline = (await page.evaluate(() => window.__NEON_DEBUG__.resources())).listeners;
  await mutate(page, "spawnBoss", 0);
  await drainEvents(page);
  const beforeStoryDefeat = await observe(page);
  await defeatCurrentBoss(page);
  const storyDefeat = await observe(page);
  expect(storyDefeat).toMatchObject({
    screen: "playing",
    hitStop: { remainingTicks: 14 },
    sequence: { locked: true, kind: "storyUpgrade", remainingTicks: 138 },
  });
  expect(storyDefeat.tick).toBe(beforeStoryDefeat.tick);
  const storyDirectorTime = storyDefeat.directorClock.time;
  await advance(page, 14);
  expect(await observe(page)).toMatchObject({
    tick: storyDefeat.tick,
    hitStop: { remainingTicks: 0 },
    sequence: { kind: "storyUpgrade", remainingTicks: 138 },
    directorClock: { time: storyDirectorTime },
  });
  await advance(page, 137);
  expect(await observe(page)).toMatchObject({
    screen: "playing",
    sequence: { locked: true, kind: "storyUpgrade", remainingTicks: 1 },
    directorClock: { time: storyDirectorTime },
  });
  await advance(page, 1);
  expect(await observe(page)).toMatchObject({ screen: "upgrade" });
  await page.evaluate(() => window.__NEON_HOST__.drainEvents());
  await page.keyboard.press("Escape");
  await page.waitForTimeout(50);
  expect(await observe(page)).toMatchObject({ screen: "upgrade" });
  expect(
    await page.evaluate(() =>
      window.__NEON_HOST__.events.some(
        (event: any) => event?.type === "lifecycle.changeRequest" && event.action === "pause",
      ),
    ),
  ).toBe(false);
  await expect(page.locator("[data-upgrade-index]")).toHaveCount(3);
  await expectMusicState(page, false);
  await page.waitForTimeout(100);
  await expectMusicState(page, false);
  await expect(page).toHaveScreenshot("upgrade.png");

  const catalogOffers = [
    ["voltage", "satellite", "echo"],
    ["magnet", "nova", "armor"],
    ["hunter", "recycler", "chain"],
    ["missile", "arc", "mercy"],
  ];
  const offeredIds = new Set<string>();
  for (const ids of catalogOffers) {
    await mutate(page, "offerUpgrades", ids);
    const offered = (await observe(page)).upgrades.map((upgrade: { id: string }) => upgrade.id);
    expect(offered).toEqual(ids);
    expect(new Set(offered).size).toBe(3);
    offered.forEach((id: string) => offeredIds.add(id));
  }
  expect([...offeredIds].sort()).toEqual(catalogOffers.flat().sort());

  await mutate(page, "offerUpgrades", ["voltage", "satellite", "echo"]);
  const projectedCards = (await observe(page)).upgrades;
  for (const [index, upgrade] of projectedCards.entries()) {
    const card = page.locator(`[data-upgrade-index="${index}"]`);
    await expect(card.locator(".upgrade-icon")).toHaveText(upgrade.icon);
    await expect(card.locator(".upgrade-level")).toHaveText(
      `等级 ${upgrade.level - 1} → ${upgrade.level}`,
    );
    expect(await card.evaluate((element) => element.style.getPropertyValue("--accent"))).toBe(
      upgrade.accent,
    );
  }
  await expect(page.locator("#toast")).toHaveClass(/visible/u);
  await page.waitForTimeout(1_450);
  await expect(page.locator("#toast")).not.toHaveClass(/visible/u);
  const beforeVoltage = await observe(page);
  await page.locator('[data-upgrade-index="0"]').click();
  await expect(page.locator("#gameCanvas")).toBeFocused();
  expect(await observe(page)).toMatchObject({
    stage: { kind: "act", value: 2 },
    tick: beforeVoltage.tick,
  });
  expect((await observe(page)).mods.fireRate).toBeGreaterThan(beforeVoltage.mods.fireRate);
  await feedFrozenAudioFrame(page, frameTime);
  await expectMusicState(page, true);

  await mutate(page, "spawnBoss", 1);
  await advance(page, 12);
  expect((await observe(page)).boss).toMatchObject({
    id: "mirrorSaint",
    phase: "twinReflection",
  });
  await expect(page.locator("#boss-name")).toHaveText("MIRROR SAINT");
  await expect(page).toHaveScreenshot("boss.png");

  await command(page, { type: "restart" });
  const beforeRecreatedVoltage = await observe(page);
  await mutate(page, "offerUpgrades", ["voltage", "satellite", "echo"]);
  await page.locator('[data-upgrade-index="0"]').click();
  expect(await observe(page)).toMatchObject({ stage: { kind: "act", value: 2 } });
  expect((await observe(page)).mods.fireRate).toBeGreaterThan(beforeRecreatedVoltage.mods.fireRate);
  await feedFrozenAudioFrame(page, frameTime);
  await expectMusicState(page, true);

  await mutate(page, "prepareGuardBoundary");
  await mutate(page, "prepareResult", { score: 0, chain: 50, maxChain: 3, bosses: 0 });
  expect((await observe(page)).chain).toBe(3);
  await expect(page.locator("#chain-value")).toHaveText("3.00");
  await mutate(page, "prepareDrive");
  await page.keyboard.press("Space");
  await mutate(page, "prepareResult", { score: 0, chain: 50, maxChain: 6, bosses: 0 });
  expect((await observe(page)).chain).toBe(6);
  await expect(page.locator("#chain-value")).toHaveText("6.00");
  await mutate(page, "prepareGuardBoundary");
  await page.keyboard.press("Space");
  await mutate(page, "offerUpgrades", ["magnet", "nova", "armor"]);
  await expectMusicState(page, false);
  const upgradeAmbient = await observe(page);
  expect(upgradeAmbient.presentationEntities.particles.count).toBeGreaterThan(0);
  expect(upgradeAmbient.presentationEntities.floaters.count).toBeGreaterThan(0);
  await advance(page, 6);
  const upgradeAmbientAfter = await observe(page);
  expectLifeDecay(
    upgradeAmbient.presentationEntities.particles,
    upgradeAmbientAfter.presentationEntities.particles,
    6,
    0.55,
  );
  expectLifeDecay(
    upgradeAmbient.presentationEntities.floaters,
    upgradeAmbientAfter.presentationEntities.floaters,
    6,
    1,
  );
  const beforeArmor = await observe(page);
  await page.keyboard.press("Digit3");
  expect(await observe(page)).toMatchObject({
    stage: { kind: "act", value: 3 },
    tick: beforeArmor.tick,
  });
  expect((await observe(page)).maxShield).toBe(beforeArmor.maxShield + 1);
  await feedFrozenAudioFrame(page, frameTime);
  await expectMusicState(page, true);
  await page.keyboard.press("Space");
  expect((await observe(page)).combat.overdrive.remaining).toBe(0);
  expect((await page.evaluate(() => window.__NEON_DEBUG__.resources())).listeners).toBe(
    listenerBaseline,
  );

  await mutate(page, "prepareResult", { score: 0, chain: 82, maxChain: 4.28, bosses: 0 });
  await expect(page.locator("#hype-grade")).toHaveText("SS");
  await expect(page.locator("#hype-grade")).toHaveClass(/grade-ss/u);
  await mutate(page, "prepareResult", { score: 0, chain: 96, maxChain: 4.84, bosses: 0 });
  await expect(page.locator("#hype-grade")).toHaveText("SSS");
  await expect(page.locator("#hype-grade")).toHaveClass(/grade-sss/u);

  await mutate(page, "spawnBoss", 1);
  await advance(page, 12);
  expect((await observe(page)).boss).toMatchObject({
    id: "mirrorSaint",
    phase: "twinReflection",
  });
  await expect(page.locator("#boss-name")).toHaveText("MIRROR SAINT");
  await mutate(page, "protectPlayer");
  await advance(page, 120);
  const patterned = await observe(page);
  expect(patterned.counts.enemyBullets + patterned.counts.lasers).toBeGreaterThan(0);
  await mutate(page, "spawnBoss", 1);
  await drainEvents(page);
  await mutate(page, "prepareBossPhaseBreak");
  await advance(page, 1);
  const phaseStopped = await observe(page);
  expect(phaseStopped).toMatchObject({
    boss: { id: "mirrorSaint", phase: "glassLattice" },
    hitStop: { remainingTicks: 8 },
  });
  const phaseEvents = await drainEvents(page);
  expect(phaseEvents.find((event) => event.type === "boss.phase.completed")).toMatchObject({
    id: 1,
    phase: 0,
    runTick: expect.any(Number),
  });
  const phaseCues = phaseEvents.filter((event) => event.type === "audio").map((event) => event.cue);
  const bigKillIndex = phaseCues.indexOf("bigKill");
  expect(phaseCues.slice(bigKillIndex, bigKillIndex + 2)).toEqual(["bigKill", "phase"]);
  const stoppedGameplayCounts = {
    enemies: phaseStopped.counts.enemies,
    enemyBullets: phaseStopped.counts.enemyBullets,
    playerBullets: phaseStopped.counts.playerBullets,
    pickups: phaseStopped.counts.pickups,
    lasers: phaseStopped.counts.lasers,
  };
  await advance(page, 8);
  expect(await observe(page)).toMatchObject({
    tick: phaseStopped.tick,
    hitStop: { remainingTicks: 0 },
    counts: stoppedGameplayCounts,
  });
  expect((await observe(page)).presentationTime - phaseStopped.presentationTime).toBeCloseTo(
    8 / 60,
    8,
  );

  await drainEvents(page);
  await mutate(page, "prepareBossPhaseBreak");
  await advance(page, 1);
  expect(await observe(page)).toMatchObject({
    boss: { id: "mirrorSaint", phase: "kaleidoscopeEnd" },
    hitStop: { remainingTicks: 8 },
  });
  const secondPhaseEvents = await drainEvents(page);
  expect(secondPhaseEvents.find((event) => event.type === "boss.phase.completed")).toMatchObject({
    id: 1,
    phase: 1,
    runTick: expect.any(Number),
  });
  const secondPhaseCues = secondPhaseEvents
    .filter((event) => event.type === "audio")
    .map((event) => event.cue);
  const secondBigKillIndex = secondPhaseCues.indexOf("bigKill");
  expect(secondPhaseCues.slice(secondBigKillIndex, secondBigKillIndex + 2)).toEqual([
    "bigKill",
    "phase",
  ]);
  await advance(page, 8);
  expect(await observe(page)).toMatchObject({ hitStop: { remainingTicks: 0 } });

  await drainEvents(page);
  await mutate(page, "prepareBossPhaseBreak");
  await advance(page, 1);
  expect((await observe(page)).boss).toBeNull();
  const finalDefeatEvents = await drainEvents(page);
  const finalDefeatCues = finalDefeatEvents
    .filter((event) => event.type === "audio")
    .map((event) => event.cue);
  const finalBigKillIndex = finalDefeatCues.indexOf("bigKill");
  expect(finalDefeatCues.slice(finalBigKillIndex, finalBigKillIndex + 2)).toEqual([
    "bigKill",
    "victory",
  ]);
  const finalSequence = await observe(page);
  expect(finalSequence).toMatchObject({
    screen: "playing",
    hitStop: { remainingTicks: 14 },
    sequence: { locked: true, kind: "storyVictory", remainingTicks: 180 },
  });
  await mutate(page, "prepareResult", { score: 123_456, chain: 68, maxChain: 4.2, bosses: 3 });
  await advance(page, 14);
  const afterFinalHitStop = await observe(page);
  expect(afterFinalHitStop).toMatchObject({
    tick: finalSequence.tick,
    hitStop: { remainingTicks: 0 },
    sequence: { kind: "storyVictory", remainingTicks: 180 },
  });
  const frozenDirectorTime = afterFinalHitStop.directorClock.time;
  await advance(page, 179);
  const beforeResultTransition = await observe(page);
  expect(beforeResultTransition).toMatchObject({
    screen: "playing",
    boss: null,
    sequence: { locked: true, kind: "storyVictory", remainingTicks: 1 },
    directorClock: { time: frozenDirectorTime },
  });
  await advance(page, 1);
  const storyResult = await observe(page);
  expect(storyResult).toMatchObject({
    screen: "result",
    mode: "story",
    boss: null,
    result: {
      victory: true,
      labelId: "ritualComplete",
      score: 123_456,
      chain: 4.2,
      isRecord: true,
    },
  });
  expect(storyResult.counts).toEqual(beforeResultTransition.counts);
  await page.evaluate(() => window.__NEON_HOST__.drainEvents());
  await page.keyboard.press("Escape");
  await page.waitForTimeout(50);
  expect(await observe(page)).toMatchObject({ screen: "result", boss: null });
  expect(
    await page.evaluate(() =>
      window.__NEON_HOST__.events.some(
        (event: any) => event?.type === "lifecycle.changeRequest" && event.action === "pause",
      ),
    ),
  ).toBe(false);
  await expectMusicState(page, false);
  await page.waitForTimeout(100);
  await expectMusicState(page, false);
  await expect(page.locator("#result-score")).toHaveText("000123456");
  await expect(page).toHaveScreenshot("result.png");
  await page.locator("#result-retry").click();
  await expect(page.locator("#gameCanvas")).toBeFocused();
  expect(await observe(page)).toMatchObject({
    screen: "playing",
    mode: "story",
    stage: { kind: "act", value: 1 },
  });
  await feedFrozenAudioFrame(page, frameTime);
  await expectMusicState(page, true);
  const beforeNova = await observe(page);
  await mutate(page, "offerUpgrades", ["magnet", "nova", "armor"]);
  await expectMusicState(page, false);
  await page.keyboard.press("Numpad2");
  expect((await observe(page)).mods.nova).toBe(beforeNova.mods.nova + 1);
  await feedFrozenAudioFrame(page, frameTime);
  await expectMusicState(page, true);
  await mutate(page, "prepareDrive");
  await page.keyboard.press("Space");
  await mutate(page, "prepareGuardBoundary");
  await page.keyboard.press("Space");
  await mutate(page, "finish", { victory: false, labelId: "signalLost" });
  const resultAmbient = await observe(page);
  expect(resultAmbient.presentationEntities.particles.count).toBeGreaterThan(0);
  expect(resultAmbient.presentationEntities.floaters.count).toBeGreaterThan(0);
  await advance(page, 6);
  const resultAmbientAfter = await observe(page);
  expectLifeDecay(
    resultAmbient.presentationEntities.particles,
    resultAmbientAfter.presentationEntities.particles,
    6,
    0.55,
  );
  expectLifeDecay(
    resultAmbient.presentationEntities.floaters,
    resultAmbientAfter.presentationEntities.floaters,
    6,
    1,
  );
  await expectMusicState(page, false);
  await page.locator("#result-retry").click();
  await feedFrozenAudioFrame(page, frameTime);
  await expectMusicState(page, true);

  await mutate(page, "offerUpgrades", ["missile", "arc", "mercy"]);
  await page.locator('[data-upgrade-index="1"]').click();
  await expect(page.locator("#gameCanvas")).toBeFocused();
  await mutate(page, "spawnEnemy", { kind: "scout", x: 270, y: 400, health: 1_000 });
  expect((await observe(page)).presentationEntities.lineParticleCount).toBe(0);
  for (let graze = 0; graze < 5; graze += 1) {
    await mutate(page, "prepareGraze");
    await advance(page, 1);
  }
  expect((await observe(page)).presentationEntities.lineParticleCount).toBe(5 * 3 + 9);

  await mutate(page, "prepareCollisionPriority");
  await advance(page, 1);
  expect(await observe(page)).toMatchObject({
    shield: 2,
    collisionTargets: [{ kind: "scout", health: 100, maxHealth: 100, contactDamage: true }],
  });
  await advance(page, 6);

  await mutate(page, "prepareContactDamage");
  await advance(page, 1);
  expect(await observe(page)).toMatchObject({
    shield: 2,
    collisionTargets: [{ kind: "scout", health: 66, maxHealth: 100, contactDamage: true }],
  });
  await advance(page, 6);

  await mutate(page, "prepareReverseEnemyHit");
  await advance(page, 1);
  expect((await observe(page)).collisionTargets).toMatchObject([
    { kind: "scout", health: 100, maxHealth: 100 },
    { kind: "elite", health: 190, maxHealth: 200 },
  ]);

  const beforePendingDeath = await observe(page);
  await mutate(page, "preparePendingDeathAbsorption");
  await advance(page, 1);
  expect(await observe(page)).toMatchObject({
    counts: { enemies: 2, playerBullets: 0 },
    collisionTargets: [
      { kind: "scout", health: 1, maxHealth: 1 },
      { kind: "scout", health: -19, maxHealth: 1 },
    ],
  });
  await advance(page, 1);
  expect(await observe(page)).toMatchObject({
    stats: { kills: beforePendingDeath.stats.kills + 1 },
    counts: { enemies: 1, playerBullets: 0 },
    collisionTargets: [{ kind: "scout", health: 1, maxHealth: 1 }],
  });

  await mutate(page, "preparePrunedPlayerShots");
  await advance(page, 1);
  expect(await observe(page)).toMatchObject({
    counts: { enemies: 2, playerBullets: 0 },
    collisionTargets: [
      { kind: "scout", health: 100, maxHealth: 100 },
      { kind: "scout", health: 100, maxHealth: 100 },
    ],
  });

  await mutate(page, "prepareMissileFlight");
  await advance(page, 1);
  expect(await observe(page)).toMatchObject({
    counts: { enemies: 0, playerBullets: 1, particles: 2 },
    patterns: { playerBullets: { missile: 1 } },
    presentationEntities: { ringParticleCount: 0 },
    presentationState: { goldSparkCount: 1 },
  });

  await drainEvents(page);
  await mutate(page, "prepareDiverPowerKill");
  await advance(page, 2);
  const diverPowerEvents = await drainEvents(page);
  expect(diverPowerEvents.filter((event) => event.type === "enemy.destroyed")).toEqual([
    expect.objectContaining({ kind: "diver" }),
  ]);
  expect(diverPowerEvents.filter((event) => event.type === "power.increased")).toEqual([
    expect.objectContaining({ power: 2 }),
  ]);
  expect(
    diverPowerEvents.filter((event) => event.type === "audio" && event.cue === "phase"),
  ).toHaveLength(1);
  expect(await observe(page)).toMatchObject({
    counts: { enemyBullets: 6 },
  });
  expect((await observe(page)).presentationState.shake).toBeCloseTo(2.5 - 26 / 60, 8);
  await expect(page.locator("#toast")).toHaveText("火力提升至 2。");

  await drainEvents(page);
  await mutate(page, "prepareEliteKill");
  await advance(page, 2);
  const eliteKillEvents = await drainEvents(page);
  expect(eliteKillEvents.filter((event) => event.type === "enemy.destroyed")).toEqual([
    expect.objectContaining({ kind: "elite" }),
  ]);
  expect(
    eliteKillEvents.filter((event) => event.type === "audio" && event.cue === "bigKill"),
  ).toHaveLength(1);
  expect((await observe(page)).presentationState.shake).toBeCloseTo(7 - 26 / 60, 8);

  for (let hit = 0; hit < 40 && (await observe(page)).sequence.kind !== "runDefeat"; hit += 1) {
    await mutate(page, "hitPlayer");
  }
  const defeatSequence = await observe(page);
  expect(defeatSequence).toMatchObject({
    screen: "playing",
    hitStop: { remainingTicks: 6 },
    sequence: { locked: true, kind: "runDefeat", remainingTicks: 69 },
  });
  await advance(page, 6);
  const defeatResumed = await observe(page);
  await command(page, { type: "move", x: 1, y: 0 });
  await advance(page, 68);
  const defeatBeforeResult = await observe(page);
  expect(defeatBeforeResult).toMatchObject({
    screen: "playing",
    player: { x: 516 },
    sequence: { locked: true, kind: "runDefeat", remainingTicks: 1 },
    directorClock: { time: defeatResumed.directorClock.time },
  });
  await advance(page, 1);
  expect(await observe(page)).toMatchObject({
    screen: "result",
    player: { x: defeatBeforeResult.player.x },
    result: { victory: false, labelId: "signalLost" },
  });
  await expectMusicState(page, false);
  await command(page, { type: "title" });
  await expectMusicState(page, false);
  expect(await observe(page)).toMatchObject({
    counts: { particles: 0, floaters: 0 },
  });
  await dispose(page);

  await bootRuntime(page);
  await page.evaluate(() => window.__NEON_DEBUG__.freezePresentation());
  expect(await observe(page)).toMatchObject({
    profile: {
      best: { story: 123_456, rush: 0, endless: 0 },
      unlockedEndless: true,
      settings: { fxDensity: 1, showHitbox: false, autoGuard: false },
    },
  });
  await page.keyboard.press("Space");
  await expect(page.locator("#gameCanvas")).toBeFocused();
  expect(await observe(page)).toMatchObject({ screen: "playing", mode: "story" });
  await command(page, { type: "title" });
  await page.keyboard.press("KeyZ");
  await expect(page.locator("#gameCanvas")).toBeFocused();
  expect(await observe(page)).toMatchObject({ screen: "playing", mode: "story" });
  await mutate(page, "protectPlayer");
  await mutate(page, "spawnBoss", 1);
  await drainEvents(page);
  const bossMicroHits = [];
  const bossShotAccents = [];
  for (let shot = 1; shot <= 20; shot += 1) {
    await mutate(page, "spawnPlayerBullet", {
      x: 270,
      y: 300,
      vx: 0,
      vy: -10_000,
      radius: 4,
      damage: 1,
      type: "shot",
      pierce: 0,
      life: 1,
    });
    expect(
      (await drainEvents(page)).some(
        (event) => event.type === "audio" && event.cue === "shotAccent",
      ),
    ).toBe(false);
    await advance(page, 1);
    const hit = await observe(page);
    const hitEvents = await drainEvents(page);
    if (hitEvents.some((event) => event.type === "audio" && event.cue === "shotAccent")) {
      bossShotAccents.push(shot);
    }
    if (hit.hitStop.remainingTicks === 1) {
      bossMicroHits.push(shot);
      const frozenRunTick = hit.runTick;
      await advance(page, 1);
      expect(await observe(page)).toMatchObject({
        runTick: frozenRunTick,
        hitStop: { remainingTicks: 0 },
      });
    }
  }
  expect(bossMicroHits).toEqual([1, 2, 16, 18, 19]);
  expect(bossShotAccents).toEqual([6, 9, 10]);
  const beforeMissileImpact = await observe(page);
  await mutate(page, "prepareBossMissileHit");
  await advance(page, 1);
  const afterMissileImpact = await observe(page);
  expect(afterMissileImpact).toMatchObject({ hitStop: { remainingTicks: 0 } });
  expect(afterMissileImpact.boss.health).toBeLessThan(beforeMissileImpact.boss.health);
  expect(afterMissileImpact.presentationEntities.ringParticleCount).toBe(
    beforeMissileImpact.presentationEntities.ringParticleCount + 1,
  );
  await dispose(page);
});

test("keeps focused Rush and Endless checkpoints without duplicating the Story matrix", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await installOneShotProfileClear(page);
  await bootRuntime(page);
  await page.evaluate(() => window.__NEON_DEBUG__.freezePresentation());

  await command(page, { type: "start", mode: "story" });
  await mutate(page, "prepareResult", { score: 111_111, chain: 0, maxChain: 1, bosses: 0 });
  await mutate(page, "finish", { victory: true, labelId: "ritualComplete" });
  await page.locator("#result-title-button").click();

  await page.locator("#mode-button").click();
  await page.locator('[data-mode="story"]').click();
  await expect(page.locator("#best-score-title")).toHaveText("最高分 000111111");
  await drainEvents(page);
  await page.locator('[data-mode="rush"]').click();
  expectSingleAudioCue(await drainEvents(page), "select");
  await expect(page.locator('[data-mode="rush"]')).toHaveClass(/selected/u);
  await expect(page.locator("#best-score-title")).toHaveText("最高分 000000000");
  await drainEvents(page);
  await page.locator("#mode-confirm").click();
  expectSingleAudioCue(await drainEvents(page), "select");
  await expect(page.locator("#title-screen")).toBeVisible();
  await expect(page.locator("#mode-dialog")).not.toBeVisible();
  expect(await observe(page)).toMatchObject({ screen: "title", selectedMode: "rush" });
  await expect(page.locator("#best-score-title")).toHaveText("最高分 000000000");
  await drainEvents(page);
  await page.locator("#ignite-button").click();
  expectSingleAudioCue(await drainEvents(page), "select");
  await mutate(page, "protectPlayer");
  const rush = await observe(page);
  expect(rush).toMatchObject({
    screen: "playing",
    mode: "rush",
    stage: { kind: "timer", value: 180 },
  });
  expect(rush.rank).toBeCloseTo(0.48, 5);
  await expect(page.locator("#mode-label")).toHaveText("RUSH 180");
  await expect(page.locator("#stage-label")).toHaveText("03:00");
  await expect(page.locator("#side-threat")).toHaveText("上升");
  await advance(page, 60);
  expect((await observe(page)).stage).toEqual({ kind: "timer", value: 179 });
  await expect(page.locator("#stage-label")).toHaveText("02:59");
  await drainEvents(page);
  await advanceToRunTick(page, 45 * 60 - 1);
  const preBossThreat = await page.locator("#side-threat").textContent();
  if (preBossThreat === null) throw new Error("Neon threat HUD requires text before the boss.");
  await advanceToRunTick(page, 45 * 60);
  const firstRushBoss = await observe(page);
  expect(firstRushBoss).toMatchObject({
    stage: { kind: "timer", value: 135 },
    boss: { id: "aella", phase: "infiniteScroll" },
  });
  await expect(page.locator("#side-threat")).toHaveText(preBossThreat);
  expect((await drainEvents(page)).filter((event) => event.type === "boss.entered")).toEqual([
    expect.objectContaining({ id: 0, runTick: 45 * 60 }),
  ]);
  await defeatCurrentBoss(page);
  const rushSequence = await observe(page);
  expect(rushSequence).toMatchObject({
    stage: { kind: "timer", value: 135 },
    boss: null,
    hitStop: { remainingTicks: 14 },
    sequence: { locked: true, kind: "modeResume", remainingTicks: 126 },
  });
  const rushDirectorTime = rushSequence.directorClock.time;
  await advance(page, 14);
  expect(await observe(page)).toMatchObject({
    runTick: rushSequence.runTick,
    sequence: { kind: "modeResume", remainingTicks: 126 },
    directorClock: { time: rushDirectorTime },
  });
  await drainEvents(page);
  await advance(page, 125);
  expect(await observe(page)).toMatchObject({
    stage: { kind: "timer", value: 133 },
    boss: null,
    sequence: { locked: true, kind: "modeResume", remainingTicks: 1 },
    directorClock: { time: rushDirectorTime },
  });
  expect((await drainEvents(page)).some((event) => event.type === "boss.entered")).toBe(false);
  await advance(page, 1);
  const resumedRush = await observe(page);
  expect(resumedRush).toMatchObject({
    stage: { kind: "timer", value: 133 },
    rank: firstRushBoss.rank,
    sequence: { locked: false, kind: null, remainingTicks: 0 },
  });
  expect((await drainEvents(page)).filter((event) => event.type === "mode.resumed")).toEqual([
    {
      tick: resumedRush.tick,
      runTick: resumedRush.runTick,
      type: "mode.resumed",
      mode: "rush",
      bosses: 1,
    },
  ]);
  await expect(page.locator("#toast")).toHaveText("首领 1 已击破，连锁继续。");
  await advanceToRunTick(page, 90 * 60);
  expect(await observe(page)).toMatchObject({
    stage: { kind: "timer", value: 90 },
    boss: { id: "mirrorSaint", phase: "twinReflection" },
  });
  expect((await drainEvents(page)).filter((event) => event.type === "boss.entered")).toEqual([
    expect.objectContaining({ id: 1, runTick: 90 * 60 }),
  ]);
  await defeatCurrentBoss(page);
  expect(await observe(page)).toMatchObject({
    sequence: { locked: true, kind: "modeResume", remainingTicks: 126 },
  });
  await advance(page, 14 + 126);
  expect(await observe(page)).toMatchObject({
    stage: { kind: "timer", value: 88 },
    sequence: { locked: false, kind: null, remainingTicks: 0 },
  });
  await mutate(page, "prepareDrive");
  await drainEvents(page);
  await command(page, { type: "drop", active: true });
  await command(page, { type: "drop", active: false });
  const rushClockMarker = (await drainEvents(page)).find(
    (event) => event.type === "overdrive.activated",
  );
  expect(rushClockMarker).toMatchObject({ runTick: expect.any(Number) });
  await advanceToRunTick(page, 180 * 60 - 1);
  expect(await observe(page)).toMatchObject({
    screen: "playing",
    stage: { kind: "timer", value: 1 },
  });
  await mutate(page, "prepareResult", { score: 222_222, chain: 0, maxChain: 1, bosses: 0 });
  await advanceToRunTick(page, 180 * 60);
  expect(await observe(page)).toMatchObject({
    screen: "result",
    result: { victory: true, labelId: "timeComplete", score: 222_222 },
  });
  await expect(page.locator("#result-title")).toHaveText("计时完成");
  await expect(page.locator("#result-eyebrow")).toHaveText("计时完成");
  await page.locator("#result-title-button").click();

  await page.locator("#mode-button").click();
  await page.locator('[data-mode="rush"]').click();
  await expect(page.locator("#best-score-title")).toHaveText("最高分 000222222");
  await page.locator('[data-mode="endless"]').click();
  await expect(page.locator('[data-mode="endless"]')).toHaveClass(/selected/u);
  await expect(page.locator("#best-score-title")).toHaveText("最高分 000000000");
  await drainEvents(page);
  await page.locator("#mode-confirm").click();
  expectSingleAudioCue(await drainEvents(page), "select");
  await expect(page.locator("#title-screen")).toBeVisible();
  await expect(page.locator("#mode-dialog")).not.toBeVisible();
  expect(await observe(page)).toMatchObject({ screen: "title", selectedMode: "endless" });
  await expect(page.locator("#best-score-title")).toHaveText("最高分 000000000");
  await drainEvents(page);
  await page.locator("#ignite-button").click();
  expectSingleAudioCue(await drainEvents(page), "select");
  await mutate(page, "protectPlayer");
  const endless = await observe(page);
  expect(endless).toMatchObject({
    screen: "playing",
    mode: "endless",
    stage: { kind: "sector", value: 1 },
  });
  expect(endless.rank).toBeCloseTo(0.42, 5);
  await expect(page.locator("#stage-label")).toHaveText("区域 1");
  await drainEvents(page);
  await advanceToNonBossTicks(page, 70 * 60);
  const firstEndlessBoss = await observe(page);
  expect(firstEndlessBoss).toMatchObject({
    stage: { kind: "sector", value: 2 },
    boss: { id: "mirrorSaint", phase: "twinReflection" },
  });
  const firstEndlessEvents = (await drainEvents(page)).filter(
    (event) => event.type === "boss.entered",
  );
  expect(firstEndlessEvents).toEqual([expect.objectContaining({ id: 1, runTick: 70 * 60 })]);
  const firstEndlessRunTick = firstEndlessEvents[0].runTick;
  await advance(page, 10 * 60);
  const activeEndlessBoss = await observe(page);
  expect(activeEndlessBoss).toMatchObject({
    boss: { id: "mirrorSaint", phase: "twinReflection" },
    directorClock: { nonBossTicks: 70 * 60 },
  });
  expect((await drainEvents(page)).some((event) => event.type === "boss.entered")).toBe(false);

  await defeatCurrentBoss(page);
  const endlessSequence = await observe(page);
  expect(endlessSequence).toMatchObject({
    stage: { kind: "sector", value: 2 },
    boss: null,
    hitStop: { remainingTicks: 14 },
    sequence: { locked: true, kind: "modeResume", remainingTicks: 126 },
    directorClock: { nonBossTicks: 70 * 60 },
  });
  await advance(page, 14);
  expect(await observe(page)).toMatchObject({
    runTick: endlessSequence.runTick,
    directorClock: { nonBossTicks: 70 * 60 },
  });
  await drainEvents(page);
  await advance(page, 125);
  expect(await observe(page)).toMatchObject({
    stage: { kind: "sector", value: 2 },
    boss: null,
    sequence: { locked: true, kind: "modeResume", remainingTicks: 1 },
    directorClock: { nonBossTicks: 70 * 60 },
  });
  await advance(page, 1);
  const resumedEndless = await observe(page);
  expect(resumedEndless).toMatchObject({
    stage: { kind: "sector", value: 2 },
    rank: activeEndlessBoss.rank,
    sequence: { locked: false, kind: null, remainingTicks: 0 },
    directorClock: { nonBossTicks: 70 * 60 + 1 },
  });
  expect((await drainEvents(page)).filter((event) => event.type === "mode.resumed")).toEqual([
    {
      tick: resumedEndless.tick,
      runTick: resumedEndless.runTick,
      type: "mode.resumed",
      mode: "endless",
      sector: 2,
    },
  ]);
  await expect(page.locator("#toast")).toHaveText("进入区域 2。");
  await expect(page.locator("#stage-label")).toHaveText("区域 2");
  await advanceToNonBossTicks(page, 140 * 60 - 1);
  expect(await observe(page)).toMatchObject({
    boss: null,
    directorClock: { nonBossTicks: 140 * 60 - 1 },
  });
  await advanceToNonBossTicks(page, 140 * 60);
  expect(await observe(page)).toMatchObject({
    stage: { kind: "sector", value: 3 },
    boss: { id: "algorithm", phase: "predictiveDesire" },
  });
  const secondEndlessEvents = (await drainEvents(page)).filter(
    (event) => event.type === "boss.entered",
  );
  expect(secondEndlessEvents).toEqual([expect.objectContaining({ id: 2 })]);
  expect(secondEndlessEvents[0].runTick).toBeGreaterThan(firstEndlessRunTick + 70 * 60);
  await mutate(page, "prepareResult", { score: 333_333, chain: 0, maxChain: 1, bosses: 1 });
  await mutate(page, "finish", { victory: false, labelId: "signalLost" });
  expect(await observe(page)).toMatchObject({
    result: { labelId: "signalLost", score: 333_333 },
  });

  await dispose(page);

  await bootRuntime(page);
  expect(await observe(page)).toMatchObject({
    profile: {
      best: { story: 111_111, rush: 222_222, endless: 333_333 },
      unlockedEndless: true,
    },
  });
  await dispose(page);
});
