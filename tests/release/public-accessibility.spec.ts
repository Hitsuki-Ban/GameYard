import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { REGISTERED_GAMES } from "../registered-games";
import { closeHubDrawer, openPlayDiagnostics, openSettingsDrawer } from "../play-mode";

const wcagTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

interface RuntimeSignals {
  readonly consoleAndPageErrors: string[];
  readonly failedRequests: string[];
  readonly failedResponses: string[];
}

function collectRuntimeSignals(page: Page): RuntimeSignals {
  const signals: RuntimeSignals = {
    consoleAndPageErrors: [],
    failedRequests: [],
    failedResponses: [],
  };
  page.on("pageerror", (error) => signals.consoleAndPageErrors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") {
      signals.consoleAndPageErrors.push(`console: ${message.text()}`);
    }
  });
  page.on("requestfailed", (request) =>
    signals.failedRequests.push(
      `${request.method()} ${request.url()}: ${request.failure()?.errorText}`,
    ),
  );
  page.on("response", (response) => {
    if (response.status() >= 400) {
      signals.failedResponses.push(`${response.status()} ${response.url()}`);
    }
  });
  return signals;
}

async function expectNoWcagViolations(page: Page, surface: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
  const report = violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    targets: violation.nodes.map((node) => node.target),
  }));
  expect(report, `${surface} must satisfy the automated WCAG A/AA gate`).toEqual([]);
}

async function expectFocused(page: Page, locator: Locator) {
  await page.keyboard.press("Tab");
  await expect(locator).toBeFocused();
}

async function expectInsideViewport(page: Page, locator: Locator, label: string) {
  const viewport = page.viewportSize();
  const box = await locator.boundingBox();
  expect(viewport).not.toBeNull();
  expect(box, `${label} must have a viewport box`).not.toBeNull();
  expect(box!.x, `${label} left edge`).toBeGreaterThanOrEqual(0);
  expect(box!.y, `${label} top edge`).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width, `${label} right edge`).toBeLessThanOrEqual(viewport!.width + 1);
  expect(box!.y + box!.height, `${label} bottom edge`).toBeLessThanOrEqual(viewport!.height + 1);
}

test("public keyboard, WCAG, motion, fullscreen, and orientation journey", async ({ page }) => {
  test.slow();
  const signals = collectRuntimeSignals(page);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./");
  await expect(page.locator("html")).toHaveAttribute("data-reduced-motion", "true");
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(
    true,
  );

  await expectNoWcagViolations(page, "catalog");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-reduced-motion", "true");

  const wordmark = page.locator(".wordmark");
  await wordmark.focus();
  await expect(wordmark).toBeFocused();
  const settingsButton = page.getByRole("button", { name: /^Settings/ });
  await expectFocused(page, settingsButton);
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Public settings" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(page.locator(".hub-surface")).toHaveAttribute("inert", "");
  const closeButton = dialog.getByRole("button", { name: "Close" });
  await expect(closeButton).toBeFocused();
  await expect(dialog.getByRole("checkbox", { name: "Reduce motion" })).toBeChecked();
  for (const target of await dialog
    .locator('button, select, input[type="range"], .setting--switch')
    .all()) {
    const box = await target.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(24);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  await closeButton.focus();
  await page.keyboard.press("Shift+Tab");
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(settingsButton).toBeFocused();
  await expect(page.locator(".hub-surface")).not.toHaveAttribute("inert", "");

  const tumbledrumIndex = REGISTERED_GAMES.findIndex((game) => game.id === "tumbledrum");
  expect(tumbledrumIndex).toBeGreaterThanOrEqual(0);
  const catalogLinks = page.locator(".catalog-card__link");
  await expectFocused(page, catalogLinks.first());
  for (let index = 1; index <= tumbledrumIndex; index += 1) {
    await expectFocused(page, catalogLinks.nth(index));
  }
  const tumbledrumLink = catalogLinks.nth(tumbledrumIndex);
  await expect(tumbledrumLink).toContainText("TUMBLEDRUM");
  expect(
    await tumbledrumLink.evaluate((element) => {
      const style = getComputedStyle(element);
      return (
        element.matches(":focus-visible") &&
        style.outlineStyle !== "none" &&
        Number.parseFloat(style.outlineWidth) >= 3
      );
    }),
    "the keyboard launcher must expose a visible focus ring",
  ).toBe(true);

  await page.keyboard.press("Enter");
  const frameElement = page.locator('.runtime-frame iframe[title="TUMBLEDRUM"]');
  const tumbledrum = page.frameLocator('.runtime-frame iframe[title="TUMBLEDRUM"]');
  await expect(frameElement).toHaveCount(1);
  await expect(page.locator(".runtime-state")).toHaveClass(/runtime-state--active/);
  await expect(tumbledrum.locator("#game")).toBeVisible();
  await expect(frameElement).toBeFocused();
  expect(
    await tumbledrum
      .locator("html")
      .evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches),
  ).toBe(true);

  const playTools = await openSettingsDrawer(page);
  const reducedMotion = playTools.getByRole("checkbox", { name: "Reduce motion" });
  await reducedMotion.uncheck();
  await reducedMotion.check();
  await openPlayDiagnostics(page);
  await expect(page.locator(".diagnostics__events")).toContainText("reduced=true");
  await closeHubDrawer(page);
  await expectNoWcagViolations(page, "active TUMBLEDRUM runtime");

  await page.getByRole("button", { name: "Fullscreen", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement?.matches(".stage--runtime")))
    .toBe(true);
  await page.evaluate(() => document.exitFullscreen());
  await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull();

  const originalFrame = await frameElement.elementHandle();
  expect(originalFrame).not.toBeNull();
  for (const viewport of [
    { width: 390, height: 844, label: "portrait" },
    { width: 844, height: 390, label: "landscape" },
    { width: 390, height: 844, label: "portrait return" },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page
      .locator(".stage--runtime")
      .evaluate((element) => element.scrollIntoView({ block: "start" }));
    await expect(page.locator(".runtime-state")).toHaveClass(/runtime-state--active/);
    await expect(frameElement).toHaveCount(1);
    await expectInsideViewport(page, page.locator(".runtime-toolbar"), `${viewport.label} toolbar`);
    await expectInsideViewport(page, tumbledrum.locator("#game"), `${viewport.label} game canvas`);

    const currentFrame = await frameElement.elementHandle();
    expect(currentFrame).not.toBeNull();
    expect(
      await originalFrame!.evaluate((element, candidate) => element === candidate, currentFrame),
      `${viewport.label} must preserve the same iframe element`,
    ).toBe(true);
    await currentFrame!.dispose();
  }
  await originalFrame!.dispose();

  expect(signals).toEqual({
    consoleAndPageErrors: [],
    failedRequests: [],
    failedResponses: [],
  });
});
