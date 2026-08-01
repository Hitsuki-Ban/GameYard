import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";

const source = (name: string) => fileURLToPath(new URL(`../src/${name}`, import.meta.url));
const runner = fileURLToPath(new URL("./logic-baseline.runner.js", import.meta.url));

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

  await page.goto("about:blank");
  for (const name of ["config.js", "i18n.js", "model.js"]) {
    await page.addScriptTag({ path: source(name) });
  }
  await page.addScriptTag({ path: runner });

  const result = await page.evaluate(() => window.runPulseLogicBaseline());
  expect(result.assertions).toBe(36);
  expect(result.locks).toBe(293);
  expect(result.passed).toHaveLength(36);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

declare global {
  interface Window {
    runPulseLogicBaseline(): { assertions: number; locks: number; passed: string[] };
  }
}
