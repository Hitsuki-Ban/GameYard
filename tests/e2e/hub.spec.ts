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

test("catalog selection, strict route, and diagnostics stay coherent", async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page);

  await page.goto("./");
  await expect(page.getByRole("heading", { name: "OPEN INDEX" })).toBeVisible();
  await page.getByRole("link", { name: /PULSE LINK \/\/ OVERDRIVE/ }).click();

  await expect(page).toHaveURL(/\?game=pulse-link-overdrive$/);
  await expect(page.getByRole("heading", { name: "PULSE LINK // OVERDRIVE" })).toBeVisible();
  await expect(page.getByRole("link", { name: /PULSE LINK \/\/ OVERDRIVE/ })).toHaveAttribute(
    "aria-current",
    "page",
  );

  await page.getByRole("button", { name: /Diagnostics/ }).click();
  await expect(page.getByRole("heading", { name: "Read-only diagnostics" })).toBeVisible();
  await expect(page.locator(".diagnostics__facts")).toContainText("game:pulse-link-overdrive");
  await expect(page.locator(".diagnostics__events")).toContainText("route.select");

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

test("production metadata matches the assembled Issue 3 artifact", async ({ request }) => {
  const buildInfoResponse = await request.get("./build-info.json");
  const catalogResponse = await request.get("./games/catalog.json");
  expect(buildInfoResponse.ok()).toBe(true);
  expect(catalogResponse.ok()).toBe(true);

  const buildInfo = await buildInfoResponse.json();
  const catalog = await catalogResponse.json();
  expect(buildInfo).toMatchObject({ schemaVersion: 1 });
  expect(buildInfo.buildId).toMatch(/^gameyard@[a-f0-9]{16}$/);
  expect(buildInfo.files).toContain("build-info.json");
  expect(buildInfo.files).toContain("games/catalog.json");
  expect(catalog).toEqual({ schemaVersion: 1, buildId: buildInfo.buildId, games: [] });
});
