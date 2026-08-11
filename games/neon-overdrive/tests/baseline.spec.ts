import { expect, test } from "@playwright/test";

import {
  audioEvents,
  bootSource,
  observe,
  prepareDrive,
  resetPlayer,
  setGamepad,
  spawnScoringTarget,
  step,
} from "./baseline-driver";

test("preserves the primary Story journey and canonical presentation", async ({ page }) => {
  await bootSource(page, { clearStorage: true });

  await expect(page.locator("#title-screen")).toHaveClass(/overlay-visible/u);
  await expect(page.locator("#best-score-title")).toHaveText("BEST 000000000");
  await expect(page).toHaveScreenshot("title.png");

  await page.locator("#ignite-button").click();
  expect(await observe(page)).toMatchObject({
    state: "playing",
    mode: "story",
    stageIndex: 0,
    shield: 3,
    reboots: 4,
    player: { x: 270, power: 1 },
  });

  await page.evaluate(() => {
    window.__NEON_OVERDRIVE__.player.invuln = 999;
  });
  await step(page, 8);
  const active = await observe(page);
  expect(active.entities.enemies).toBeGreaterThan(0);
  expect(active.entities.enemyBullets).toBeGreaterThan(4);
  expect(active.entities.playerBullets).toBeGreaterThan(0);
  await expect(page).toHaveScreenshot("active-pattern.png");

  await resetPlayer(page);
  await page.keyboard.down("ArrowRight");
  await step(page, 0.2);
  await page.keyboard.up("ArrowRight");
  const keyboardX = (await observe(page)).player.x;
  expect(keyboardX).toBeGreaterThan(290);

  await resetPlayer(page);
  await page.keyboard.down("ShiftLeft");
  await page.keyboard.down("ArrowRight");
  await step(page, 0.2);
  const focusedKeyboard = await observe(page);
  await page.keyboard.up("ArrowRight");
  await page.keyboard.up("ShiftLeft");
  expect(focusedKeyboard.player.focus).toBe(true);
  expect(focusedKeyboard.player.x).toBeGreaterThan(280);
  expect(focusedKeyboard.player.x).toBeLessThan(keyboardX);

  await resetPlayer(page);
  const canvas = await page.locator("#game").boundingBox();
  expect(canvas).not.toBeNull();
  const playerClient = {
    x: canvas!.x + canvas!.width * 0.5,
    y: canvas!.y + canvas!.height * 0.82,
  };
  await page.dispatchEvent("#game", "pointerdown", {
    pointerId: 7,
    pointerType: "touch",
    clientX: playerClient.x,
    clientY: playerClient.y,
    button: 0,
  });
  await step(page, 1 / 60);
  await page.dispatchEvent("#game", "pointermove", {
    pointerId: 7,
    pointerType: "touch",
    clientX: playerClient.x + canvas!.width * 0.24,
    clientY: playerClient.y,
    button: 0,
  });
  await step(page, 0.2);
  await page.dispatchEvent("#game", "pointerup", {
    pointerId: 7,
    pointerType: "touch",
    clientX: playerClient.x + canvas!.width * 0.24,
    clientY: playerClient.y,
    button: 0,
  });
  expect((await observe(page)).player.x).toBeGreaterThan(290);

  await resetPlayer(page);
  await setGamepad(page, { connected: true, x: 1, y: 0, action: false, focus: true, pause: false });
  await step(page, 0.2);
  const gamepadMove = await observe(page);
  expect(gamepadMove.player.x).toBeGreaterThan(280);
  expect(gamepadMove.player.focus).toBe(true);
  await setGamepad(page, {
    connected: false,
    x: 0,
    y: 0,
    action: false,
    focus: false,
    pause: false,
  });

  const drivesBefore = (await observe(page)).stats.drives;
  await prepareDrive(page);
  await page.keyboard.press("Space");
  await step(page, 1 / 60);
  expect((await observe(page)).stats.drives).toBe(drivesBefore + 1);

  await prepareDrive(page);
  await page
    .locator("#touch-drive")
    .dispatchEvent("pointerdown", { pointerId: 9, pointerType: "touch" });
  expect((await observe(page)).stats.drives).toBe(drivesBefore + 2);

  await prepareDrive(page);
  await setGamepad(page, { connected: true, x: 0, y: 0, action: true, focus: false, pause: false });
  await step(page, 1 / 60);
  expect((await observe(page)).stats.drives).toBe(drivesBefore + 3);
  await setGamepad(page, {
    connected: true,
    x: 0,
    y: 0,
    action: false,
    focus: false,
    pause: false,
  });
  await step(page, 1 / 60);

  const score = await spawnScoringTarget(page);
  expect(score.kills).toBe(score.killsBefore + 1);
  expect(score.scoreAfter).toBeGreaterThan(score.scoreBefore);
  expect(score.chainAfter).toBeGreaterThan(score.chainBefore);

  await page.keyboard.press("Escape");
  await step(page, 1 / 60);
  expect((await observe(page)).state).toBe("paused");
  await expect(page.locator("#pause-screen")).toHaveClass(/overlay-visible/u);
  await page.locator("#resume-button").click();
  expect((await observe(page)).state).toBe("playing");

  await page.evaluate(() => window.__NEON_OVERDRIVE__.showUpgradeSelection());
  expect((await observe(page)).state).toBe("upgrade");
  await expect(page.locator("#upgrade-cards .upgrade-card")).toHaveCount(3);
  await expect(page).toHaveScreenshot("upgrade.png");
  const selectedUpgrade = await page
    .locator("#upgrade-cards .upgrade-card strong")
    .first()
    .textContent();
  await page.locator("#upgrade-cards .upgrade-card").first().click();
  expect((await observe(page)).stageIndex).toBe(1);
  expect(selectedUpgrade).not.toBeNull();

  await page.evaluate(() => {
    const game = window.__NEON_OVERDRIVE__;
    game.spawnBoss(1, false);
    game.boss.intro = 0;
    game.boss.x = 270;
    game.boss.y = 145;
    game.updateHUD(true);
    game.render();
  });
  await step(page, 0.2);
  await expect(page.locator("#boss-name")).toHaveText("MIRROR SAINT");
  await expect(page).toHaveScreenshot("boss.png");

  await page.evaluate(() => {
    const game = window.__NEON_OVERDRIVE__;
    game.score = 123_456;
    game.displayScore = game.score;
    game.chain = 68;
    game.stats.maxChain = 4.2;
    game.stats.bosses = 3;
    game.finishRun(true, "RITUAL COMPLETE");
    game.render();
  });
  expect((await observe(page)).state).toBe("result");
  await expect(page.locator("#result-title")).toHaveText("VICTORY");
  await expect(page.locator("#result-score")).toHaveText("000123456");
  await expect(page).toHaveScreenshot("result.png");

  await expect(page.locator("#endless-mode-card")).toBeEnabled();
  await expect(page.locator("#endless-mode-note")).toHaveText("无限扇区 · Rank 持续攀升");
  await expect(page.locator("#best-score-title")).toHaveText("BEST 000123456");

  await page.locator("#result-retry").click();
  expect(await observe(page)).toMatchObject({
    state: "playing",
    mode: "story",
    stageIndex: 0,
    shield: 3,
    reboots: 4,
  });

  const cues = await audioEvents(page);
  const cueNames = cues.map((event) => event.name);
  expect(cueNames).toEqual(
    expect.arrayContaining(["select", "drive", "kill", "phase", "warning", "victory"]),
  );
  expect(cues.find((event) => event.name === "warning")!.runTime).toBeGreaterThan(0);
  expect(cues.findLast((event) => event.name === "victory")!.state).toBe("result");

  await page.evaluate(() => window.__NEON_OVERDRIVE__.returnToTitle());
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => Boolean(window.__NEON_OVERDRIVE__));
  await expect(page.locator("#endless-mode-card")).toBeEnabled();
  await expect(page.locator("#endless-mode-note")).toHaveText("无限扇区 · Rank 持续攀升");
  await expect(page.locator("#best-score-title")).toHaveText("BEST 000123456");
});

test("locks focused Rush and Endless mode checkpoints", async ({ page }) => {
  await bootSource(page, { clearStorage: true });

  await page.evaluate(() => window.__NEON_OVERDRIVE__.startRun("rush"));
  const rush = await observe(page);
  expect(rush).toMatchObject({ state: "playing", mode: "rush", modeTimer: 180, reboots: 0 });
  expect(rush.rank).toBeCloseTo(0.48, 5);
  await step(page, 1);
  expect((await observe(page)).modeTimer).toBeCloseTo(179, 5);
  await page.evaluate(() => {
    const game = window.__NEON_OVERDRIVE__;
    game.modeTimer = 1 / 60;
  });
  await step(page, 1 / 60);
  await expect(page.locator("#result-title")).toHaveText("TIME CLEAR");
  await expect(page.locator("#result-eyebrow")).toHaveText("TIME COMPLETE");

  await page.evaluate(() => window.__NEON_OVERDRIVE__.startRun("endless"));
  const endless = await observe(page);
  expect(endless).toMatchObject({ state: "playing", mode: "endless", modeTimer: 0, reboots: 0 });
  expect(endless.rank).toBeCloseTo(0.42, 5);
  await page.evaluate(() => {
    const game = window.__NEON_OVERDRIVE__;
    game.director.time = 70;
    game.endlessBossesSpawned = 0;
    game.director.updateEndless(1 / 60);
    game.updateHUD(true);
    game.render();
  });
  const sector = await observe(page);
  expect(sector.endlessBossesSpawned).toBe(1);
  await expect(page.locator("#boss-hud")).not.toHaveClass(/boss-hud-hidden/u);
});
