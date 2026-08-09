import { expect, test } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

import { openPlayTools } from "../play-mode";

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
  await page.locator('.catalog-card__link[href="?game=pulse-link-overdrive"]').click();
  await expect(page.locator(".runtime-state")).toHaveClass(/runtime-state--active/);

  const playTools = await openPlayTools(page);
  await playTools.getByRole("button", { name: "Offline" }).click();
  const drawer = page.locator(".pwa-drawer");
  await expect(drawer).toBeVisible();
  const saveButton = drawer.getByRole("button", { name: "Save selected game" });
  await expect(saveButton).toBeEnabled({ timeout: 15_000 });
  await saveButton.click();
  await expect(drawer.getByRole("button", { name: "Saved for offline" })).toBeDisabled({
    timeout: 15_000,
  });
  await expect(drawer).toContainText("pulse-link-overdrive");

  const registrations = await page.evaluate(async () =>
    (await navigator.serviceWorker.getRegistrations()).map((registration) => ({
      scope: registration.scope,
      script: registration.active?.scriptURL ?? null,
    })),
  );
  expect(registrations).toHaveLength(1);
  expect(registrations[0]?.scope).toBe(new URL("./", page.url()).href);
  expect(registrations[0]?.script).toBe(new URL("service-worker.js", page.url()).href);

  await drawer.getByRole("button", { name: /Close/ }).click();
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
  await expect(page.locator(".runtime-overlay--failed")).toContainText(/503|offline copy/i);

  const failedRuntimeTools = await openPlayTools(page);
  await failedRuntimeTools.getByRole("button", { name: "Offline" }).click();
  await drawer.getByRole("button", { name: "Clear offline games" }).click();
  await expect(drawer).toContainText("Available offline: none");
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
    const updatedRuntimeTools = await openPlayTools(page);
    await updatedRuntimeTools.getByRole("button", { name: "Offline" }).click();
    await expect(page.locator(".pwa-drawer")).toContainText("Available offline: none");
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
