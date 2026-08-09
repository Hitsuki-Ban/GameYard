import { expect, test } from "@playwright/test";

import { openSettingsDrawer } from "../play-mode";

test("the repository-prefix PWA saves and restores one explicit game offline", async ({
  context,
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("./");
  await page.locator('.catalog-card__link[href="?game=crown-breaker"]').click();
  await expect(page.locator(".runtime-state")).toHaveClass(/runtime-state--active/);

  const playTools = await openSettingsDrawer(page);
  await playTools.getByRole("button", { name: "Offline" }).click();
  const drawer = page.locator(".pwa-panel");
  const crownRow = drawer.getByRole("listitem").filter({ hasText: "CROWN//BREAKER" });
  const saveButton = crownRow.getByRole("button", { name: "Save offline" });
  await expect(saveButton).toBeEnabled({ timeout: 15_000 });
  await saveButton.click();
  await expect(crownRow.getByRole("button", { name: "Remove copy" })).toBeEnabled({
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

  await page.locator(".hub-drawer__heading > button").click();
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".runtime-state")).toHaveClass(/runtime-state--active/, {
    timeout: 20_000,
  });
  await expect(page.locator(".runtime-frame iframe")).toHaveCount(1);
  await context.setOffline(false);
});
