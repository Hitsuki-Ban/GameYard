import { expect, test } from "@playwright/test";

import { REGISTERED_GAMES } from "../registered-games";

test("the repository prefix launches every artifact catalog entry once", async ({ page }) => {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`console: ${message.text()}`);
  });
  page.on("requestfailed", (request) => {
    failures.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`);
  });

  for (const game of REGISTERED_GAMES) {
    await page.goto(`./?game=${game.id}`);
    await expect(page.locator(".runtime-state")).toHaveClass(/runtime-state--active/);
    const frame = page.locator(".runtime-frame iframe");
    await expect(frame).toHaveCount(1);
    const source = await frame.getAttribute("src");
    expect(source).not.toBeNull();
    expect(new URL(source!, page.url()).pathname).toBe(
      new URL(`games/${game.id}/${game.entry}`, page.url()).pathname,
    );
  }

  expect(failures).toEqual([]);
});
