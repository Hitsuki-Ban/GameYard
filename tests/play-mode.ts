import { expect, type Locator, type Page } from "@playwright/test";

export async function openPlayTools(page: Page): Promise<Locator> {
  const tools = page.locator(".play-tools");
  if (!(await tools.evaluate((element) => element.classList.contains("is-open")))) {
    await page.locator(".runtime-toolbar__actions button").last().click();
  }
  await expect(tools).toHaveClass(/is-open/);
  return page.locator(".play-tools__panel");
}

export async function closePlayTools(page: Page): Promise<void> {
  await page.locator(".play-tools__heading > button").click();
  await expect(page.locator(".play-tools")).not.toHaveClass(/is-open/);
}

export async function openPlayDiagnostics(page: Page): Promise<void> {
  const panel = await openPlayTools(page);
  await panel.locator(".play-tools__utilities button").last().click();
  await expect(page.locator(".diagnostics")).toHaveClass(/is-open/);
}
