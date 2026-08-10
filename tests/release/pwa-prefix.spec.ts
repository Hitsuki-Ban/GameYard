import { expect, test } from "@playwright/test";

import { openSettingsDrawer } from "../play-mode";
import { REGISTERED_GAMES } from "../registered-games";

test("the repository-prefix PWA saves and restores one explicit game offline", async ({
  context,
  page,
}) => {
  test.setTimeout(120_000);
  const game = REGISTERED_GAMES[0];
  if (!game) throw new Error("The artifact catalog must contain a game for the PWA prefix smoke");
  await page.goto("./");
  await page.locator(`.catalog-card__link[href="?game=${game.id}"]`).click();
  await expect(page.locator(".runtime-state")).toHaveClass(/runtime-state--active/);

  const playTools = await openSettingsDrawer(page);
  await playTools.getByRole("button", { name: "Offline" }).click();
  const drawer = page.locator(".pwa-panel");
  const gameRow = drawer.getByRole("listitem").filter({ hasText: game.title });
  const saveButton = gameRow.getByRole("button", { name: "Save offline" });
  await expect(saveButton).toBeEnabled({ timeout: 15_000 });
  await saveButton.click();
  await expect(gameRow.getByRole("button", { name: "Remove copy" })).toBeEnabled({
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
