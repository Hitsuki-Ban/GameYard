import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

import { REGISTERED_GAME_IDS } from "../registered-games";
import { closeHubDrawer, openPlayDiagnostics, openSettingsDrawer } from "../play-mode";

type GuestId = (typeof REGISTERED_GAME_IDS)[number];

interface ManifestIdentity {
  readonly id: GuestId;
  readonly version: string;
  readonly buildId: string;
}

interface DiagnosticEnvelope {
  readonly schemaVersion: 1;
  readonly buildId: string;
  readonly hub: {
    readonly health: string;
    readonly route: string;
    readonly events: readonly unknown[];
  };
  readonly game: {
    readonly id: GuestId;
    readonly version: string;
    readonly buildId: string;
    readonly health: string;
    readonly lifecycle: string;
    readonly inputEnabled: boolean;
    readonly events: readonly unknown[];
  };
}

async function readManifest(page: Page, gameId: GuestId): Promise<ManifestIdentity> {
  return page.evaluate(async (id) => {
    const response = await fetch(`./games/${id}/game.manifest.json`);
    if (!response.ok) throw new Error(`${id} manifest request failed with ${response.status}`);
    const manifest = (await response.json()) as ManifestIdentity;
    return { id: manifest.id, version: manifest.version, buildId: manifest.buildId };
  }, gameId);
}

async function exportDiagnostics(page: Page): Promise<{ json: string; value: DiagnosticEnvelope }> {
  const downloadPromise = page.waitForEvent("download");
  await page.locator(".diagnostics__actions button").nth(1).click();
  const download = await downloadPromise;
  const path = await download.path();
  if (path === null) throw new Error("Diagnostic download has no local path");
  const json = await readFile(path, "utf8");
  return { json, value: JSON.parse(json) as DiagnosticEnvelope };
}

async function closeDiagnostics(page: Page): Promise<void> {
  await page.locator(".hub-drawer__heading > button").click();
  await expect(page.locator(".hub-drawer")).not.toHaveClass(/is-open/);
}

async function runGuestConformance(page: Page, gameId: GuestId): Promise<void> {
  await page.goto("./");
  const browseSettings = await openSettingsDrawer(page);
  await browseSettings.locator(".settings-panel select").selectOption("en");
  await closeHubDrawer(page);
  const manifest = await readManifest(page, gameId);

  await page.locator(`.catalog-card__link[href="?game=${gameId}"]`).click();
  await expect(page.locator(".runtime-frame iframe")).toHaveCount(1);
  await expect(page.locator(".runtime-state")).toHaveClass(/runtime-state--active/);

  const playTools = await openSettingsDrawer(page);
  await playTools.locator('.settings-panel input[type="range"]').first().fill("0.44");
  await playTools.locator('.settings-panel input[type="checkbox"]').first().check();
  await playTools.locator(".settings-panel select").selectOption("ja");
  await closeHubDrawer(page);

  await page.locator(".runtime-toolbar__actions button").first().click();
  await expect(page.locator(".runtime-state")).toHaveClass(/runtime-state--paused/);
  await openPlayDiagnostics(page);
  const facts = page.locator(".diagnostics__facts dd");
  await expect(facts.nth(5)).toHaveText("paused");
  await expect(facts.nth(6)).toHaveText("false");
  await expect(page.locator(".diagnostics__events")).toContainText("settings.applied");
  await expect(page.locator(".diagnostics__events")).toContainText("locale.applied");

  const exported = await exportDiagnostics(page);
  expect(Buffer.byteLength(exported.json)).toBeLessThanOrEqual(64 * 1024);
  expect(Object.keys(exported.value).sort()).toEqual([
    "buildId",
    "game",
    "generatedAt",
    "hub",
    "schemaVersion",
  ]);
  expect(exported.value.schemaVersion).toBe(1);
  expect(exported.value.buildId).toBe(manifest.buildId);
  expect(exported.value.hub).toMatchObject({
    health: "healthy",
    route: `game:${gameId}`,
  });
  expect(exported.value.hub.events.length).toBeLessThanOrEqual(18);
  expect(exported.value.game).toMatchObject({
    id: manifest.id,
    version: manifest.version,
    buildId: manifest.buildId,
    health: "healthy",
    lifecycle: "paused",
    inputEnabled: false,
  });
  expect(exported.value.game.events.length).toBeLessThanOrEqual(32);
  expect(exported.json).not.toMatch(/localStorage|data:image|save|stack|query|screenshot/i);
  await expect(page.locator(".utility-button--lab")).toHaveCount(0);
  await closeDiagnostics(page);

  await page.locator(".runtime-toolbar__actions button").first().click();
  await expect(page.locator(".runtime-state")).toHaveClass(/runtime-state--active/);
  await openPlayDiagnostics(page);
  await expect(facts.nth(5)).toHaveText("paused");
  await expect(facts.nth(6)).toHaveText("false");
  await closeDiagnostics(page);
  await expect(page.locator(".runtime-state")).toHaveClass(/runtime-state--active/);

  await page.locator(".runtime-toolbar__back").click();
  await expect(page.locator(".runtime-frame iframe")).toHaveCount(0);
  await expect(page).not.toHaveURL(new RegExp(`game=${gameId}`));
}

for (const gameId of REGISTERED_GAME_IDS) {
  test(`${gameId} passes the shared host/guest conformance driver`, async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-chromium",
      "The shared protocol driver is viewport-independent.",
    );
    await runGuestConformance(page, gameId);
  });
}
