import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const PULSE_FRAME_URL = "/games/pulse-link-overdrive/index.html";
const PRIVATE_STORAGE_SENTINEL = "release-secret-must-not-export";

const locales = [
  { id: "en", start: "Start game" },
  { id: "ja", start: "ゲームを始める" },
  { id: "zh-Hans", start: "开始游戏" },
] as const;

const viewports = [
  { id: "desktop", width: 1440, height: 900 },
  { id: "portrait", width: 390, height: 844 },
  { id: "landscape", width: 844, height: 390 },
] as const;

interface RuntimeSignals {
  readonly errors: string[];
  readonly failedRequests: string[];
  readonly failedResponses: string[];
}

interface ReleaseResourceSnapshot {
  readonly openHostPorts: number;
  readonly globalListeners: Readonly<Record<string, number>>;
}

async function expectInsideViewport(page: Page, selector: string) {
  const viewport = page.viewportSize();
  const box = await page.locator(selector).boundingBox();
  expect(viewport).not.toBeNull();
  expect(box, `${selector} must have a viewport box`).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height + 1);
}

async function releaseResources(page: Page): Promise<ReleaseResourceSnapshot> {
  return page.evaluate(() =>
    (
      window as typeof window & {
        __gameyardReleaseResources: { snapshot(): ReleaseResourceSnapshot };
      }
    ).__gameyardReleaseResources.snapshot(),
  );
}

function collectRuntimeSignals(page: Page): RuntimeSignals {
  const signals: RuntimeSignals = { errors: [], failedRequests: [], failedResponses: [] };
  page.on("pageerror", (error) => signals.errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") signals.errors.push(`console: ${message.text()}`);
  });
  page.on("requestfailed", (request) =>
    signals.failedRequests.push(
      `${request.method()} ${request.url()}: ${request.failure()?.errorText}`,
    ),
  );
  page.on("response", (response) => {
    if (response.status() >= 400) {
      signals.failedResponses.push(`${response.status()} ${response.url()}`);
    }
  });
  return signals;
}

async function openPulse(page: Page, startLabel = "Start game") {
  await page.getByRole("link", { name: /PULSE LINK \/\/ OVERDRIVE/ }).click();
  const frameElement = page.locator(".runtime-frame iframe");
  const pulse = page.frameLocator(".runtime-frame iframe");
  await expect(frameElement).toHaveCount(1);
  await expect(page.locator(".runtime-state")).toHaveClass(/runtime-state--active/);
  await expect(pulse.getByRole("button", { name: startLabel })).toBeVisible();
  return { frameElement, pulse };
}

async function closePulse(page: Page) {
  await page.locator(".runtime-toolbar__actions button:last-child").click();
  await expect(page.locator(".runtime-frame iframe")).toHaveCount(0);
  await expect(page).toHaveURL(/\/GameYard\/$/);
}

test("Pulse release matrix covers locale visuals, real input, and bounded diagnostics", async ({
  page,
}) => {
  test.slow();
  const signals = collectRuntimeSignals(page);
  await page.addInitScript((sentinel) => {
    window.localStorage.setItem("gameyard.private.release-probe", sentinel);
    if (window.location.pathname.includes("/games/pulse-link-overdrive/")) {
      let seed = 0x5eed1234;
      Math.random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 0x1_0000_0000;
      };
    }
  }, PRIVATE_STORAGE_SENTINEL);

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const locale of locales) {
      await page.goto("./");
      await page.locator("select").selectOption(locale.id);
      const { pulse } = await openPulse(page, locale.start);
      await page.evaluate(() => document.fonts.ready);
      await pulse.locator("body").evaluate(() => document.fonts.ready);
      await page
        .locator(".stage--runtime")
        .evaluate((element) => element.scrollIntoView({ block: "start" }));
      await expectInsideViewport(page, ".runtime-toolbar");
      for (const button of await page.locator(".runtime-toolbar__actions button").all()) {
        const box = await button.boundingBox();
        const viewportSize = page.viewportSize();
        expect(box).not.toBeNull();
        expect(viewportSize).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.y).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(viewportSize!.width + 1);
        expect(box!.y + box!.height).toBeLessThanOrEqual(viewportSize!.height + 1);
      }
      const canvas = pulse.locator("#game-canvas");
      await canvas.evaluate((element) => {
        element.style.visibility = "hidden";
      });
      await expect(page).toHaveScreenshot(`pulse-${viewport.id}-${locale.id}.png`, {
        animations: "disabled",
        mask: [page.locator(".site-footer span:last-child")],
        maskColor: "#070a12",
      });
      await canvas.evaluate((element) => {
        element.style.removeProperty("visibility");
      });
      await closePulse(page);
    }
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./");
  await page.locator("select").selectOption("en");
  const { pulse } = await openPulse(page);
  await pulse.getByRole("button", { name: "Start game" }).click();
  await expect(pulse.locator("#title-screen")).toBeHidden();
  await expect(pulse.locator("#hud")).toBeVisible();
  const hardDrop = pulse.locator('[data-action="hardDrop"]');
  await hardDrop.hover();
  await page.mouse.down();
  await expect(hardDrop).toHaveClass(/is-pressed/);
  await page.mouse.up();
  await expect(hardDrop).not.toHaveClass(/is-pressed/);
  const gameplayCanvas = pulse.locator("#game-canvas");
  await gameplayCanvas.focus();
  await gameplayCanvas.press("Escape");
  await expect(page.locator(".runtime-state")).toHaveText("Paused");
  await expect(page).toHaveScreenshot("pulse-gameplay-paused.png", {
    animations: "disabled",
    mask: [page.locator(".site-footer span:last-child")],
    maskColor: "#070a12",
  });
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.locator(".runtime-state")).toHaveText("Active");

  await page.getByRole("button", { name: /Diagnostics/ }).click();
  await expect(page.getByRole("heading", { name: "Read-only diagnostics" })).toBeVisible();
  await expect(page.locator(".diagnostics__facts")).toContainText("active");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const diagnosticJson = await readFile(downloadPath!, "utf8");
  const diagnostic = JSON.parse(diagnosticJson) as {
    events: unknown[];
    guest: { events: unknown[] } | null;
    [key: string]: unknown;
  };
  expect(Object.keys(diagnostic).sort()).toEqual([
    "build",
    "events",
    "guest",
    "locale",
    "route",
    "selectedGame",
    "settingsRevision",
  ]);
  expect(diagnostic.events.length).toBeLessThanOrEqual(18);
  expect(diagnostic.guest?.events.length ?? 0).toBeLessThanOrEqual(32);
  expect(Buffer.byteLength(diagnosticJson)).toBeLessThan(64 * 1024);
  expect(diagnosticJson).not.toContain(PRIVATE_STORAGE_SENTINEL);
  expect(diagnosticJson).not.toMatch(/localStorage|data:image|screenshot/i);
  await expect(page.getByRole("button", { name: "Open Lab" })).toHaveCount(0);

  await page.getByRole("button", { name: "Close ×" }).click();
  await closePulse(page);
  expect(signals).toEqual({ errors: [], failedRequests: [], failedResponses: [] });
});

test("50 enter-exit cycles with periodic reloads leave one clean browsing context", async ({
  page,
}) => {
  test.slow();
  const signals = collectRuntimeSignals(page);
  await page.addInitScript(() => {
    const listenerSets = new Map<string, Set<EventListenerOrEventListenerObject>>();
    type EventListenerMethod = (
      this: EventTarget,
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | AddEventListenerOptions,
    ) => void;
    const originalAdd = Object.getOwnPropertyDescriptor(EventTarget.prototype, "addEventListener")!
      .value as EventListenerMethod;
    const originalRemove = Object.getOwnPropertyDescriptor(
      EventTarget.prototype,
      "removeEventListener",
    )!.value as EventListenerMethod;
    const listenerKey = (
      target: EventTarget,
      type: string,
      options?: boolean | AddEventListenerOptions,
    ) => {
      const targetName =
        target === window && type === "message"
          ? "window"
          : target === document && type === "visibilitychange"
            ? "document"
            : null;
      if (!targetName) return null;
      const capture = typeof options === "boolean" ? options : !!options?.capture;
      return `${targetName}:${type}:${capture ? "capture" : "bubble"}`;
    };
    EventTarget.prototype.addEventListener = function (type, listener, options) {
      const key = listenerKey(this, type, options);
      if (key && listener) {
        const listeners = listenerSets.get(key) ?? new Set();
        listeners.add(listener);
        listenerSets.set(key, listeners);
      }
      originalAdd.call(this, type, listener, options);
    };
    EventTarget.prototype.removeEventListener = function (type, listener, options) {
      const key = listenerKey(this, type, options);
      if (key && listener) listenerSets.get(key)?.delete(listener);
      originalRemove.call(this, type, listener, options);
    };

    const NativeMessageChannel = window.MessageChannel;
    let openHostPorts = 0;
    window.MessageChannel = class ReleaseMessageChannel extends NativeMessageChannel {
      constructor() {
        super();
        openHostPorts += 1;
        const nativeClose = this.port1.close.bind(this.port1);
        let closed = false;
        this.port1.close = () => {
          if (!closed) {
            closed = true;
            openHostPorts -= 1;
          }
          nativeClose();
        };
      }
    };

    Object.defineProperty(window, "__gameyardReleaseResources", {
      value: {
        snapshot: () => ({
          openHostPorts,
          globalListeners: Object.fromEntries(
            [...listenerSets]
              .filter(([, listeners]) => listeners.size > 0)
              .map(([key, listeners]): [string, number] => [key, listeners.size])
              .sort(([left], [right]) => left.localeCompare(right)),
          ),
        }),
      },
    });
  });
  await page.goto("./");
  await page.locator("select").selectOption("en");
  const baselineResources = await releaseResources(page);

  for (let cycle = 1; cycle <= 50; cycle += 1) {
    const { pulse } = await openPulse(page);
    expect(page.frames().filter((frame) => frame.url().includes(PULSE_FRAME_URL))).toHaveLength(1);
    expect((await releaseResources(page)).openHostPorts).toBe(baselineResources.openHostPorts + 1);

    if (cycle % 5 === 0) {
      const previousGuest = page.frames().find((frame) => frame.url().includes(PULSE_FRAME_URL));
      expect(previousGuest).toBeDefined();
      await page.getByRole("button", { name: "Reload" }).click();
      await expect(pulse.getByRole("button", { name: "Start game" })).toBeVisible();
      await expect.poll(() => page.frames().includes(previousGuest!)).toBe(false);
      expect(page.frames().filter((frame) => frame.url().includes(PULSE_FRAME_URL))).toHaveLength(
        1,
      );
    }

    await closePulse(page);
    expect(page.frames()).toHaveLength(1);
    await expect.poll(() => releaseResources(page)).toEqual(baselineResources);
  }

  expect(signals).toEqual({ errors: [], failedRequests: [], failedResponses: [] });
});
