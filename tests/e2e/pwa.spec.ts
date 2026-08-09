import { expect, test } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

import { openSettingsDrawer } from "../play-mode";
import { REGISTERED_GAMES } from "../registered-games";

const SYNTHETIC_BUILD_B = "gameyard@ffffffffffffffff";
const SYNTHETIC_BUILD_C = "gameyard@eeeeeeeeeeeeeeee";
const TEXT_EXTENSIONS = new Set([".css", ".html", ".js", ".json", ".svg", ".webmanifest"]);

async function stageSyntheticAtomicUpdate(nextBuildId: string): Promise<() => Promise<void>> {
  const root = resolve("dist");
  const buildInfoFile = resolve(root, "build-info.json");
  const buildInfoText = await readFile(buildInfoFile, "utf8");
  const buildInfo = JSON.parse(buildInfoText) as {
    readonly buildId: string;
    readonly files: string[];
  };
  const snapshots = new Map<string, string>();
  for (const relativeFile of buildInfo.files) {
    if (!TEXT_EXTENSIONS.has(extname(relativeFile))) continue;
    const file = resolve(root, relativeFile);
    const content = await readFile(file, "utf8");
    snapshots.set(file, content);
    const marker = relativeFile === "service-worker.js" ? "\n// synthetic atomic update\n" : "";
    await writeFile(file, `${content.replaceAll(buildInfo.buildId, nextBuildId)}${marker}`);
  }
  return async () => {
    await Promise.all([...snapshots].map(([file, content]) => writeFile(file, content)));
  };
}

test("the Hub owns one scoped shell and deliberate per-game offline library", async ({
  browser,
  context,
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "The PWA lifecycle is viewport-independent.",
  );
  test.setTimeout(180_000);

  await page.goto("./");
  await page.evaluate(() => window.localStorage.setItem("gameyard.pwa-test-save", "preserve"));
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const buildResponse = await fetch("./build-info.json");
    const { buildId } = (await buildResponse.json()) as { buildId: string };
    const scopePath = new URL(registration.scope).pathname;
    const scopeKey =
      scopePath === "/"
        ? "root"
        : scopePath
            .replace(/^\/|\/$/gu, "")
            .replace(/[^a-z0-9]+/giu, "-")
            .toLowerCase();
    await caches.open(`gameyard-${scopeKey}-game-${buildId}-retired-game`);
  });
  await page.reload();
  await page.locator('.catalog-card__link[href="?game=pulse-link-overdrive"]').click();
  await expect(page.locator(".runtime-state")).toHaveClass(/runtime-state--active/);

  const playTools = await openSettingsDrawer(page);
  await playTools.getByRole("button", { name: "Offline" }).click();
  const drawer = page.locator(".pwa-panel");
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("listitem")).toHaveCount(REGISTERED_GAMES.length);
  await expect(drawer).toContainText("Removed unavailable saved entries: retired-game.");
  const pulseRow = drawer.getByRole("listitem").filter({ hasText: "PULSE LINK // OVERDRIVE" });
  const saveButton = pulseRow.getByRole("button", { name: "Save offline" });
  await expect(saveButton).toBeEnabled({ timeout: 15_000 });
  await saveButton.click();
  const removeButton = pulseRow.getByRole("button", { name: "Remove copy" });
  await expect(removeButton).toBeEnabled({ timeout: 15_000 });
  await removeButton.click();
  await expect(saveButton).toBeEnabled({ timeout: 15_000 });
  await saveButton.click();
  await expect(removeButton).toBeEnabled({ timeout: 15_000 });
  await expect(pulseRow).toContainText("Available offline");

  const registrations = await page.evaluate(async () =>
    (await navigator.serviceWorker.getRegistrations()).map((registration) => ({
      scope: registration.scope,
      script: registration.active?.scriptURL ?? null,
    })),
  );
  expect(registrations).toHaveLength(1);
  expect(registrations[0]?.scope).toBe(new URL("./", page.url()).href);
  expect(registrations[0]?.script).toBe(new URL("service-worker.js", page.url()).href);

  await page.locator(".hub-drawer__heading > button").click();
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".runtime-state")).toHaveClass(/runtime-state--active/, {
    timeout: 20_000,
  });
  await page.locator(".runtime-toolbar__back").click();
  await page.locator('.catalog-card__link[href="?game=tumbledrum"]').click();
  await expect(page.locator(".runtime-state")).toHaveClass(/runtime-state--failed/, {
    timeout: 20_000,
  });
  await expect(page.locator(".runtime-overlay--failed")).toContainText(
    "This game instance could not start",
  );

  const offlineProbe = await context.newPage();
  const offlineResponse = await offlineProbe.goto(
    new URL("games/tumbledrum/index.html", page.url()).href,
  );
  expect(offlineResponse?.status()).toBe(503);
  await expect(offlineProbe.locator("html")).toHaveAttribute("lang", "en");
  await expect(
    offlineProbe.getByRole("heading", { name: "Offline game unavailable" }),
  ).toBeVisible();
  await offlineProbe.close();

  const failedRuntimeTools = await openSettingsDrawer(page);
  await failedRuntimeTools.getByRole("button", { name: "Offline" }).click();
  await drawer.getByRole("button", { name: "Remove all offline games" }).click();
  await expect(drawer.getByText("Online only", { exact: true })).toHaveCount(
    REGISTERED_GAMES.length,
  );
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem("gameyard.pwa-test-save")))
    .toBe("preserve");

  await context.setOffline(false);
  const restoreFirstUpdate = await stageSyntheticAtomicUpdate(SYNTHETIC_BUILD_B);
  let restoreSecondUpdate: () => Promise<void> = async () => undefined;
  try {
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) throw new Error("GameYard registration is missing before update");
      await registration.update();
    });
    await expect(drawer).toContainText("A new atomic release is ready", { timeout: 20_000 });
    await page.reload();
    await expect(page.getByRole("heading", { name: "GameYard update required" })).toBeVisible();
    restoreSecondUpdate = await stageSyntheticAtomicUpdate(SYNTHETIC_BUILD_C);
    await page.getByRole("button", { name: "Apply current release" }).click();
    await expect(page.getByText("Checking the current Service Worker release…")).toBeVisible();
    await expect(page.locator(".site-footer")).toHaveCount(0);
    await page.getByRole("button", { name: "Apply current release" }).click();
    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            const response = await fetch("./build-info.json", { cache: "no-store" });
            if (!response.ok) throw new Error(`Build info request failed with ${response.status}`);
            return ((await response.json()) as { buildId: string }).buildId;
          }),
        { timeout: 20_000 },
      )
      .toBe(SYNTHETIC_BUILD_C);
    const updatedRuntimeTools = await openSettingsDrawer(page);
    await updatedRuntimeTools.getByRole("button", { name: "Offline" }).click();
    await expect(page.locator(".pwa-panel")).toContainText("Online only");
  } finally {
    await restoreSecondUpdate();
    await restoreFirstUpdate();
  }

  const mismatchContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  try {
    await mismatchContext.route("**/build-info.json", async (route) => {
      const response = await route.fetch();
      const body = (await response.text()).replace(/gameyard@[0-9a-f]{16}/u, SYNTHETIC_BUILD_B);
      await route.fulfill({ response, body });
    });
    const mismatchPage = await mismatchContext.newPage();
    await mismatchPage.goto("./");
    await expect(
      mismatchPage.getByRole("heading", { name: "GameYard update required" }),
    ).toBeVisible();
    await expect(mismatchPage.locator(".artifact-stop code")).toContainText(SYNTHETIC_BUILD_B);
  } finally {
    await mismatchContext.close();
  }
});
