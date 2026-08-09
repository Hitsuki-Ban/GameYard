import { expect, test } from "@playwright/test";

import { openPlayTools } from "../play-mode";

test("the repository-prefix PWA saves and restores one explicit game offline", async ({
  context,
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("./");
  await page.locator('.catalog-row__select[href="?game=crown-breaker"]').click();
  await expect(page.locator(".runtime-state")).toHaveClass(/runtime-state--active/);

  const playTools = await openPlayTools(page);
  await playTools.getByRole("button", { name: "Offline" }).click();
  const drawer = page.locator(".pwa-drawer");
  const saveButton = drawer.getByRole("button", { name: "Save selected game" });
  await expect(saveButton).toBeEnabled({ timeout: 15_000 });
  await saveButton.click();
  await expect(drawer.getByRole("button", { name: "Saved for offline" })).toBeDisabled({
    timeout: 15_000,
  });

  const registration = await page.evaluate(async () => {
    const registrations = await navigator.serviceWorker.getRegistrations();
    return registrations.map((entry) => ({
      scope: entry.scope,
      script: entry.active?.scriptURL ?? null,
    }));
  });
  expect(registration).toEqual([
    {
      scope: new URL("./", page.url()).href,
      script: new URL("service-worker.js", new URL("./", page.url())).href,
    },
  ]);

  await drawer.getByRole("button", { name: /Close/ }).click();
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".runtime-state")).toHaveClass(/runtime-state--active/, {
    timeout: 20_000,
  });
  await expect(page.locator(".runtime-frame iframe")).toHaveCount(1);
  await context.setOffline(false);
});
