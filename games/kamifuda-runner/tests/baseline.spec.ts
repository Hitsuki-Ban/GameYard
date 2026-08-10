import { expect, test } from "@playwright/test";

import {
  advance,
  applyDamage,
  bootCandidate,
  chargeStamp,
  defeatOneEnemy,
  finishRun,
  observe,
  profileFacts,
  showUpgrade,
  startDeterministic,
  unlockHard,
} from "./baseline-driver";

test("preserves the primary player journey and canonical presentation", async ({ page }) => {
  await bootCandidate(page);

  await expect(page.locator("#titleOverlay")).toHaveClass(/is-active/u);
  await expect(page.locator("#hardModeButton")).toHaveClass(/is-locked/u);
  await expect(page).toHaveScreenshot("title.png");

  await page.locator("#startButton").click();
  await expect.poll(async () => (await observe(page)).mode).toBe("playing");
  await startDeterministic(page, 20260730, "normal");

  const boot = await observe(page);
  expect(boot).toMatchObject({
    mode: "playing",
    phase: "gate",
    difficulty: "normal",
    player: { count: 18, shield: 2, power: 1, tempo: 1, form: "fan" },
  });
  await expect(page).toHaveScreenshot("gameplay.png");

  const center = boot.player!.nx;
  await page.keyboard.down("ArrowLeft");
  await advance(page, 0.22);
  await page.keyboard.up("ArrowLeft");
  const keyboardLeft = (await observe(page)).player!.nx;
  expect(keyboardLeft).toBeLessThan(center - 0.04);

  const canvas = await page.locator("#gameCanvas").boundingBox();
  expect(canvas).not.toBeNull();
  const touchX = canvas!.x + canvas!.width * 0.82;
  const touchY = canvas!.y + canvas!.height * 0.7;
  await page.dispatchEvent("#gameCanvas", "pointerdown", {
    pointerId: 7,
    pointerType: "touch",
    clientX: touchX,
    clientY: touchY,
  });
  await advance(page, 0.22);
  await page.dispatchEvent("#gameCanvas", "pointerup", {
    pointerId: 7,
    pointerType: "touch",
    clientX: touchX,
    clientY: touchY,
  });
  expect((await observe(page)).player!.nx).toBeGreaterThan(keyboardLeft + 0.2);

  await chargeStamp(page);
  const stampsBeforeTouch = (await observe(page)).stats.manualStamps;
  await page.locator("#stampButton").tap();
  expect((await observe(page)).stats.manualStamps).toBe(stampsBeforeTouch + 1);
  await chargeStamp(page);
  await page.keyboard.press("Space");
  expect((await observe(page)).stats.manualStamps).toBe(stampsBeforeTouch + 2);

  const firstDamage = await applyDamage(page, 3);
  expect(firstDamage).toEqual({ count: 18, shield: 1, damageLost: 0 });
  const secondDamage = await applyDamage(page, 3);
  expect(secondDamage).toEqual({ count: 18, shield: 0, damageLost: 0 });
  const thirdDamage = await applyDamage(page, 3);
  expect(thirdDamage).toEqual({ count: 15, shield: 0, damageLost: 3 });
  const score = await defeatOneEnemy(page);
  expect(score.kills).toBe(1);
  expect(score.scoreAfter).toBeGreaterThan(score.scoreBefore);

  await page.keyboard.press("Escape");
  await expect(page.locator("#pauseOverlay")).toHaveClass(/is-active/u);
  expect((await observe(page)).mode).toBe("paused");
  await page.locator("#resumeButton").click();
  await expect.poll(async () => (await observe(page)).mode).toBe("playing");

  await showUpgrade(page);
  expect((await observe(page)).mode).toBe("choice");
  await expect(page.locator("#choiceList .charm-card")).toHaveCount(3);
  await expect(page).toHaveScreenshot("upgrade.png");
  await page.locator("#choiceList .charm-card").first().click();
  expect((await observe(page)).player!.charms).toHaveLength(1);

  await finishRun(page, true);
  expect((await observe(page)).mode).toBe("result");
  await expect(page.locator("#resultTitle")).toContainText("烈の縄");
  await expect(page).toHaveScreenshot("result.png");

  const profile = await profileFacts(page);
  expect(profile.hardUnlocked).toBe(true);
  expect(profile.normal.clears).toBe(1);
  expect(profile.hard.clears).toBe(0);
  expect(profile.totalSeals).toBeGreaterThan(0);

  await page.locator("#retryButton").click();
  const restarted = await observe(page);
  expect(restarted).toMatchObject({
    mode: "playing",
    difficulty: "normal",
    player: { count: 18, shield: 2 },
  });
});

test("locks the focused Hard-mode and independent profile outcome", async ({ page }) => {
  await bootCandidate(page);
  expect((await profileFacts(page)).hardUnlocked).toBe(false);

  await unlockHard(page);
  await page.locator("#hardModeButton").click();
  await startDeterministic(page, 20260730, "hard");
  const hardBoot = await observe(page);
  expect(hardBoot).toMatchObject({
    mode: "playing",
    phase: "gate",
    difficulty: "hard",
    player: { count: 16, shield: 1, power: 1, tempo: 1, form: "fan" },
  });

  expect(await applyDamage(page, 4)).toEqual({ count: 16, shield: 0, damageLost: 0 });
  expect(await applyDamage(page, 4)).toEqual({ count: 12, shield: 0, damageLost: 4 });

  await finishRun(page, true);
  const profile = await profileFacts(page);
  expect(profile.normal.clears).toBe(0);
  expect(profile.hard.clears).toBe(1);
  expect(profile.skins).toContain("ember");
});
