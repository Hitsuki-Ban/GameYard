import { expect, test, type Page } from "@playwright/test";

const SETTINGS_KEY = "gameyard.settings.v1";

function collectRuntimeErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return errors;
}

test("Pulse runs through the Hub lifecycle with live public preferences", async ({ page }) => {
  test.slow();
  const runtimeErrors = collectRuntimeErrors(page);

  await page.goto("./");
  await expect(page.getByRole("heading", { name: "OPEN INDEX" })).toBeVisible();
  await page.locator("select").selectOption("en");
  await page.getByRole("link", { name: /PULSE LINK \/\/ OVERDRIVE/ }).click();

  await expect(page).toHaveURL(/\?game=pulse-link-overdrive$/);
  const frameElement = page.locator(".runtime-frame iframe");
  const pulse = page.frameLocator(".runtime-frame iframe");
  await expect(frameElement).toHaveCount(1);
  await expect(pulse.getByRole("button", { name: "Start game" })).toBeVisible();
  await expect(page.getByRole("link", { name: /PULSE LINK \/\/ OVERDRIVE/ })).toHaveAttribute(
    "aria-current",
    "page",
  );

  const firstGuest = page
    .frames()
    .find((frame) => frame.url().includes("/games/pulse-link-overdrive/index.html"));
  expect(firstGuest).toBeDefined();

  await page.locator("select").selectOption("ja");
  await expect(pulse.getByRole("button", { name: "ゲームを始める" })).toBeVisible();
  await page.locator("select").selectOption("zh-Hans");
  await expect(pulse.getByRole("button", { name: "开始游戏" })).toBeVisible();
  await page.locator("select").selectOption("en");
  await expect(pulse.getByRole("button", { name: "Start game" })).toBeVisible();

  await page.getByRole("slider", { name: /Master/ }).fill("0.31");
  await page.getByRole("checkbox", { name: "Reduce motion" }).check();
  await page.getByRole("button", { name: /Diagnostics/ }).click();
  await expect(page.getByRole("heading", { name: "Read-only diagnostics" })).toBeVisible();
  await expect(page.locator(".diagnostics__facts")).toContainText("game:pulse-link-overdrive");
  await expect(page.locator(".diagnostics__events")).toContainText("locale.applied");
  await expect(page.locator(".diagnostics__events")).toContainText("settings.applied");
  await page.getByRole("button", { name: "Close ×" }).click();

  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.locator(".runtime-state")).toHaveText("Paused");
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.locator(".runtime-state")).toHaveText("Active");

  await page.getByRole("button", { name: "Reload" }).click();
  await expect(pulse.getByRole("button", { name: "Start game" })).toBeVisible();
  await expect.poll(() => page.frames().includes(firstGuest!)).toBe(false);
  expect(
    page.frames().filter((frame) => frame.url().includes("/games/pulse-link-overdrive/index.html")),
  ).toHaveLength(1);

  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(frameElement).toHaveCount(0);

  expect(runtimeErrors).toEqual([]);
});

test("public language setting persists across reloads", async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page);

  await page.goto("./");
  await page.getByLabel("Language").selectOption("zh-Hans");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hans");
  await expect(page.getByRole("button", { name: /诊断/ })).toBeVisible();

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hans");
  await expect(page.getByRole("button", { name: /诊断/ })).toBeVisible();
  const stored = await page.evaluate((key) => window.localStorage.getItem(key), SETTINGS_KEY);
  expect(JSON.parse(stored as string)).toMatchObject({ localePreference: "zh-Hans", revision: 2 });

  expect(runtimeErrors).toEqual([]);
});

test("invalid settings stop visibly and reset only after an explicit click", async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page);
  await page.addInitScript((key) => window.localStorage.setItem(key, "{invalid"), SETTINGS_KEY);

  await page.goto("./");
  await expect(page.getByText("SETTINGS / CONTRACT / STOP")).toBeVisible();
  await expect(page.getByLabel("Language")).toBeDisabled();
  expect(await page.evaluate((key) => window.localStorage.getItem(key), SETTINGS_KEY)).toBe(
    "{invalid",
  );

  await page.getByRole("button", { name: "Reset settings" }).click();
  await expect(page.getByText("SETTINGS / CONTRACT / STOP")).toBeHidden();
  await expect(page.getByLabel("Language")).toBeEnabled();
  const repaired = await page.evaluate((key) => window.localStorage.getItem(key), SETTINGS_KEY);
  expect(JSON.parse(repaired as string)).toMatchObject({ schemaVersion: 1, revision: 1 });

  await page.getByRole("button", { name: /Diagnostics/ }).click();
  await expect(page.locator(".diagnostics__events")).toContainText("settings.reset");
  expect(runtimeErrors).toEqual([]);
});

test("production shell has no lab and fits the configured viewport", async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page);

  await page.goto("./?game=crown-breaker");
  await expect(page.getByRole("heading", { name: "CROWN//BREAKER" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Lab" })).toHaveCount(0);

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  expect(runtimeErrors).toEqual([]);
});

test("unknown and duplicate game routes are rejected visibly", async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page);

  await page.goto("./?game=not-a-game");
  await expect(page.getByRole("heading", { name: "Route rejected" })).toBeVisible();
  await expect(page.locator(".route-error__code")).toContainText("UNKNOWN-GAME");

  await page.goto("./?game=tumbledrum&game=crown-breaker");
  await expect(page.getByRole("heading", { name: "Route rejected" })).toBeVisible();
  await expect(page.locator(".route-error__code")).toContainText("DUPLICATE-GAME");
  expect(runtimeErrors).toEqual([]);
});

test("production metadata describes the assembled Pulse exhibit exactly", async ({ request }) => {
  const buildInfoResponse = await request.get("./build-info.json");
  const catalogResponse = await request.get("./games/catalog.json");
  const manifestResponse = await request.get("./games/pulse-link-overdrive/game.manifest.json");
  expect(buildInfoResponse.ok()).toBe(true);
  expect(catalogResponse.ok()).toBe(true);
  expect(manifestResponse.ok()).toBe(true);

  const buildInfo = await buildInfoResponse.json();
  const catalog = await catalogResponse.json();
  const manifest = await manifestResponse.json();
  expect(buildInfo).toMatchObject({ schemaVersion: 1 });
  expect(buildInfo.buildId).toMatch(/^gameyard@[a-f0-9]{16}$/);
  expect(buildInfo.files).toContain("build-info.json");
  expect(buildInfo.files).toContain("games/catalog.json");
  expect(catalog).toEqual({
    schemaVersion: 1,
    buildId: buildInfo.buildId,
    games: [
      {
        id: "pulse-link-overdrive",
        entry: "./pulse-link-overdrive/index.html",
        manifest: "./pulse-link-overdrive/game.manifest.json",
      },
    ],
  });
  expect(manifest).toMatchObject({
    schemaVersion: 1,
    protocol: 1,
    id: "pulse-link-overdrive",
    version: "1.1.0",
    buildId: buildInfo.buildId,
    entry: "index.html",
  });
  expect(manifest.files).toContain("index.html");
  expect(manifest.files).toContain("game.manifest.json");
});
