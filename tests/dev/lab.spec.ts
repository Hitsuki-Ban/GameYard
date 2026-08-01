import { expect, test, type Page } from "@playwright/test";

function collectRuntimeErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return errors;
}

test("the integrated dev room runs Pulse and keeps Lab mutations session-only", async ({
  page,
}) => {
  test.slow();
  const runtimeErrors = collectRuntimeErrors(page);

  await page.goto("./?game=pulse-link-overdrive");
  const pulse = page.frameLocator(".runtime-frame iframe");
  await expect(pulse.getByRole("button", { name: "Start game" })).toBeVisible();
  await expect(page.locator(".runtime-state")).toHaveText("Active");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator(".runtime-frame iframe")).toHaveCount(0);

  await page.getByRole("button", { name: "Open Lab" }).click();

  const overlay = page.locator(".lab-overlay");
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveCSS("border-top-color", "rgb(22, 70, 200)");
  await expect(page.getByText("Kinetic White / Session")).toBeVisible();

  const radiusInput = page.locator(".tp-lblv").filter({ hasText: "Stage radius" }).locator("input");
  await expect(radiusInput).toHaveValue("28");
  await radiusInput.fill("40");
  await radiusInput.press("Enter");
  await expect
    .poll(() =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue("--stage-radius").trim(),
      ),
    )
    .toBe("40px");

  await radiusInput.fill("28");
  await radiusInput.press("Enter");
  await expect
    .poll(() =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue("--stage-radius").trim(),
      ),
    )
    .toBe("28px");

  await page.getByRole("button", { name: /Close Lab/ }).click();
  await expect(overlay).toBeHidden();

  expect(runtimeErrors).toEqual([]);
});
