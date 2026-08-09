import { expect, type Locator, type Page } from "@playwright/test";

export async function openSettingsDrawer(page: Page): Promise<Locator> {
  const drawer = page.locator(".hub-drawer");
  if ((await drawer.getAttribute("aria-hidden")) === "true") {
    const playOpener = page.locator(".runtime-toolbar__actions button").last();
    if ((await playOpener.count()) === 1) await playOpener.click();
    else await page.locator(".header-actions button").click();
  }
  await expect(drawer).toHaveClass(/is-open/);
  await expect(page.getByRole("dialog")).toBeVisible();
  return page.locator(".settings-drawer-panel");
}

export async function closeHubDrawer(page: Page): Promise<void> {
  await page.locator(".hub-drawer__heading > button").click();
  await expect(page.locator(".hub-drawer")).not.toHaveClass(/is-open/);
}

export async function openPlayDiagnostics(page: Page): Promise<void> {
  const panel = await openSettingsDrawer(page);
  await panel.locator(".drawer-utilities button").last().click();
  await expect(page.locator(".diagnostics-panel")).toBeVisible();
}

export async function setHubLocale(page: Page, locale: "en" | "ja" | "zh-Hans"): Promise<void> {
  const panel = await openSettingsDrawer(page);
  await panel.locator(".settings-panel select").selectOption(locale);
  await closeHubDrawer(page);
}
