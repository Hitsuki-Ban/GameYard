import { expect, test } from "@playwright/test";

const logicSmokeUrl = new URL("./logic-smoke.html", import.meta.url).href;

test("preserves the pinned deterministic logic baseline", async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  await page.goto(logicSmokeUrl, { waitUntil: "load" });

  const status = page.locator("#status");
  await expect(status).toHaveText("PASS · 36 ASSERTIONS · 293 LOCKS");
  await expect(page.locator("#summary")).toHaveClass("pass");
  await expect(page.locator("#results li")).toHaveCount(36);
  await expect(page.locator("#error")).toBeHidden();
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
