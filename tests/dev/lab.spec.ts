import { expect, test, type Page } from "@playwright/test";

import { REGISTERED_GAME_IDS } from "../registered-games";
import { openPlayDiagnostics, openSettingsDrawer } from "../play-mode";

function collectRuntimeErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return errors;
}

test("the DEV Lab applies and round-trips exact manifest-bound startup scenes", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const runtimeErrors = collectRuntimeErrors(page);

  for (const gameId of REGISTERED_GAME_IDS) {
    await page.goto(`./?game=${gameId}`);
    await expect(page.locator(".runtime-state")).toHaveClass(/runtime-state--active/);
    const persistedSettings = await page.evaluate(() =>
      window.localStorage.getItem("gameyard.settings.v1"),
    );

    const initialTools = await openSettingsDrawer(page);
    await initialTools.locator(".drawer-utilities button").first().click();
    const overlay = page.locator(".lab-panel");
    await expect(overlay).toBeVisible();
    await expect(overlay).toHaveCSS("border-top-color", /rgb\(/);
    await expect(page.getByText("Kinetic White / Session")).toBeVisible();

    const scene = page.getByLabel("Lab startup scene");
    await scene.selectOption("paused-accessible");
    await page.getByRole("button", { name: "Apply scene" }).dblclick();
    const masterVolume = page.locator('.settings-panel input[type="range"]').first();
    await expect(page.locator(".lab-scenes__status")).toContainText("Applied paused-accessible.", {
      timeout: 15_000,
    });
    await expect(masterVolume).toBeEnabled();
    await expect(page.locator(".runtime-state")).toHaveClass(/runtime-state--paused/);
    await expect
      .poll(() =>
        page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue("--stage-radius").trim(),
        ),
      )
      .toBe("16px");
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem("gameyard.settings.v1")))
      .toBe(persistedSettings);

    const persistedBefore = JSON.parse(persistedSettings!) as {
      revision: number;
      screenShake: boolean;
      [key: string]: unknown;
    };
    const radiusInput = page
      .locator(".tp-lblv")
      .filter({ hasText: "Stage radius" })
      .locator("input");
    await expect(radiusInput).toHaveValue("16");
    await radiusInput.fill("40");
    await radiusInput.press("Enter");
    await expect
      .poll(() =>
        page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue("--stage-radius").trim(),
        ),
      )
      .toBe("40px");

    await page.getByRole("button", { name: "Export preset" }).click();
    const presetText = page.getByLabel("Lab preset JSON");
    const exported = await presetText.inputValue();
    const preset = JSON.parse(exported) as {
      gameId: string;
      gameVersion: string;
      buildId: string;
      sceneId: string;
      parameters: { stageRadius: number };
    };
    expect(preset.gameId).toBe(gameId);
    expect(preset.sceneId).toBe("paused-accessible");
    expect(preset.gameVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(preset.buildId).toMatch(/^gameyard@[0-9a-f]{16}$/);
    expect(preset.parameters.stageRadius).toBe(40);

    await presetText.fill(JSON.stringify({ ...preset, gameVersion: "999.0.0" }));
    await page.getByRole("button", { name: "Import preset" }).click();
    await expect(page.locator(".lab-scenes__status")).toContainText("does not exactly match");
    await expect(page.locator(".lab-scenes__status")).toHaveAttribute("data-error", "true");

    const readyPreset = { ...JSON.parse(exported), sceneId: "ready-balanced" } as Record<
      string,
      unknown
    >;
    readyPreset.seed = 0x4759_0001;
    readyPreset.parameters = {
      ...(readyPreset.parameters as Record<string, unknown>),
      localePreference: "en",
      masterVolume: 0.8,
      musicVolume: 0.6,
      sfxVolume: 0.8,
      reducedMotion: false,
      screenShake: true,
      lifecycle: "active",
      stageRadius: 28,
      stageGap: 28,
      frameOffset: 0,
    };
    await presetText.fill(JSON.stringify(readyPreset));
    await page.getByRole("button", { name: "Import preset" }).click();
    await expect(page.locator(".lab-scenes__status")).toContainText("Applied ready-balanced.", {
      timeout: 15_000,
    });
    await expect(page.locator(".runtime-state")).toHaveClass(/runtime-state--paused/);

    await page.locator(".hub-drawer__heading > button").click();
    await expect(overlay).toBeHidden();
    await expect(page.locator(".runtime-state")).toHaveClass(/runtime-state--active/);
    const playTools = await openSettingsDrawer(page);
    await playTools.locator('.settings-panel input[type="checkbox"]').last().uncheck();
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem("gameyard.settings.v1")))
      .not.toBe(persistedSettings);
    const persistedAfter = JSON.parse(
      (await page.evaluate(() => window.localStorage.getItem("gameyard.settings.v1")))!,
    ) as typeof persistedBefore;
    const {
      revision: beforeRevision,
      screenShake: _beforeScreenShake,
      ...stableBefore
    } = persistedBefore;
    const {
      revision: afterRevision,
      screenShake: afterScreenShake,
      ...stableAfter
    } = persistedAfter;
    expect(afterRevision).toBeGreaterThan(beforeRevision);
    expect(afterScreenShake).toBe(false);
    expect(stableAfter).toEqual(stableBefore);
    await openPlayDiagnostics(page);
    await expect(page.locator(".diagnostics__events")).toContainText(
      `settings revision ${afterRevision}`,
      { timeout: 15_000 },
    );
    await expect(page.locator(".diagnostics__facts dd").nth(7)).toHaveText(String(afterRevision));
    await expect(page.locator(".runtime-state")).toHaveClass(/runtime-state--paused/);
    await page.locator(".hub-drawer__heading > button").click();
    await expect(page.locator(".runtime-state")).toHaveClass(/runtime-state--active/);
    await page.locator(".runtime-toolbar__back").click();
    await expect(page.locator(".runtime-frame iframe")).toHaveCount(0);
  }

  expect(runtimeErrors).toEqual([]);
});
