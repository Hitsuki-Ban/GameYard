import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

import { REGISTERED_GAMES } from "../registered-games";
import {
  closeHubDrawer,
  openPlayDiagnostics,
  openSettingsDrawer,
  setHubLocale,
} from "../play-mode";

const PRIVATE_STORAGE_SENTINEL = "release-secret-must-not-export";

const locales = [
  {
    id: "en",
    start: "Start game",
    tumbledrumCampaign: "Campaign stage 1 of 13",
    tumbledrumStatus: "TUMBLEDRUM title screen",
    crownLanguage: "en",
    crownNewRun: "New Run",
    diagnosticPaused: "Paused",
    diagnosticFalse: "No",
  },
  {
    id: "ja",
    start: "ゲームを始める",
    tumbledrumCampaign: "キャンペーン 1／13ステージ",
    tumbledrumStatus: "TUMBLEDRUMのタイトル画面",
    crownLanguage: "ja",
    crownNewRun: "ニューラン",
    diagnosticPaused: "一時停止",
    diagnosticFalse: "いいえ",
  },
  {
    id: "zh-Hans",
    start: "开始游戏",
    tumbledrumCampaign: "战役第 1 关，共 13 关",
    tumbledrumStatus: "TUMBLEDRUM 标题画面",
    crownLanguage: "zh-CN",
    crownNewRun: "新局",
    diagnosticPaused: "已暂停",
    diagnosticFalse: "否",
  },
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
  readonly guestAnimationFrames: number;
  readonly guestAudioContexts: number;
  readonly guestGlobalListeners: number;
  readonly guestGlobalListenerTypes: Readonly<Record<string, number>>;
  readonly guestIntervals: number;
  readonly guestTimeouts: number;
  readonly hostGlobalListeners: Readonly<Record<string, number>>;
  readonly openHostPorts: number;
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

async function openTumbledrum(page: Page, status = "TUMBLEDRUM title screen") {
  await page.getByRole("link", { name: /TUMBLEDRUM/ }).click();
  const frameElement = page.locator(".runtime-frame iframe");
  const tumbledrum = page.frameLocator(".runtime-frame iframe");
  await expect(frameElement).toHaveCount(1);
  await expect(page.locator(".runtime-state")).toHaveClass(/runtime-state--active/);
  await expect(tumbledrum.locator("#game")).toBeVisible();
  await expect(tumbledrum.locator("#status")).toContainText(status);
  return { frameElement, tumbledrum };
}

async function openCrown(page: Page, newRunLabel = "New Run") {
  await page.getByRole("link", { name: /CROWN\/\/BREAKER/ }).click();
  const frameElement = page.locator(".runtime-frame iframe");
  const crown = page.frameLocator(".runtime-frame iframe");
  await expect(frameElement).toHaveCount(1);
  await expect(page.locator(".runtime-state")).toHaveClass(/runtime-state--active/);
  await expect(crown.locator('#btn-new [data-i18n="title.newRun"]')).toHaveText(newRunLabel);
  return { frameElement, crown };
}

type ReleaseLocale = (typeof locales)[number];
type RoundRobinGame = (typeof REGISTERED_GAMES)[number]["id"];

const roundRobinGames = REGISTERED_GAMES;

async function expectRoundRobinRuntimeReady(page: Page) {
  await expect(page.locator(".runtime-state")).toHaveClass(/runtime-state--active/);
}

async function openRoundRobinRuntime(page: Page, gameId: RoundRobinGame) {
  await page.locator(`.catalog-card__link[href="?game=${gameId}"]`).click();
  await expectRoundRobinRuntimeReady(page);
  const guest = page.frames().find((frame) => frame.url().includes(`/games/${gameId}/`));
  expect(guest, `${gameId} guest frame must exist`).toBeDefined();
  return guest!;
}

async function expectProductionDiagnostics(
  page: Page,
  gameId: RoundRobinGame,
  locale: ReleaseLocale,
  settingsRevision: number,
  expectAppliedEvents = true,
) {
  await openPlayDiagnostics(page);
  const facts = page.locator(".diagnostics__facts dd");
  const game = REGISTERED_GAMES.find((candidate) => candidate.id === gameId);
  if (!game) throw new Error(`Missing registered game ${gameId}`);
  const routeLabel =
    locale.id === "ja"
      ? `${game.title} をプレイ中`
      : locale.id === "zh-Hans"
        ? `正在游玩 ${game.title}`
        : `Playing ${game.title}`;
  await expect(facts.nth(1)).toHaveText(routeLabel);
  await expect(facts.nth(2)).toHaveText(game.title);
  await expect(facts.nth(3)).toHaveText(locale.id);
  await expect(facts.nth(4)).toHaveText(String(settingsRevision));
  await expect(facts.nth(5)).toHaveText(locale.diagnosticPaused);
  await expect(facts.nth(6)).toHaveText(locale.diagnosticFalse);
  await expect(facts.nth(7)).toHaveText(String(settingsRevision));
  if (expectAppliedEvents) {
    await expect(page.locator(".diagnostics__events")).toContainText("locale.applied");
    await expect(page.locator(".diagnostics__events")).toContainText("settings.applied");
  }
  await closeHubDrawer(page);
  await expectRoundRobinRuntimeReady(page);
}

async function closeRuntime(page: Page) {
  await page.locator(".runtime-toolbar__back").click();
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
      await setHubLocale(page, locale.id);
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
      if (locale.id === "en") {
        await expect(page).toHaveScreenshot(`pulse-${viewport.id}-en.png`, {
          animations: "disabled",
          mask: [page.locator(".runtime-frame iframe")],
          maskColor: "#151a2b",
        });
      }
      await closeRuntime(page);
    }
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./");
  await setHubLocale(page, "en");
  const { pulse } = await openPulse(page);
  await pulse.getByRole("button", { name: "Start game" }).click();
  await expect(pulse.locator("#title-screen")).toBeHidden();
  await expect(pulse.locator("#hud")).toBeVisible();
  const gameplayCanvas = pulse.locator("#game-canvas");
  await gameplayCanvas.focus();
  await gameplayCanvas.press("Space");
  await expect(pulse.locator("#hud")).toBeVisible();
  await gameplayCanvas.press("Escape");
  await expect(page.locator(".runtime-state")).toHaveText("Paused");
  await expect(page).toHaveScreenshot("pulse-gameplay-paused.png", {
    animations: "disabled",
    mask: [page.locator(".runtime-frame iframe")],
    maskColor: "#151a2b",
  });
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.locator(".runtime-state")).toHaveText("Active");

  await openPlayDiagnostics(page);
  await expect(page.getByRole("heading", { name: "Read-only diagnostics" })).toBeVisible();
  await expect(page.locator(".diagnostics__facts")).toContainText("Paused");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const diagnosticJson = await readFile(downloadPath!, "utf8");
  const diagnostic = JSON.parse(diagnosticJson) as {
    schemaVersion: number;
    buildId: string;
    generatedAt: string;
    hub: { events: unknown[] };
    game: { events: unknown[] } | null;
    [key: string]: unknown;
  };
  expect(Object.keys(diagnostic).sort()).toEqual([
    "buildId",
    "game",
    "generatedAt",
    "hub",
    "schemaVersion",
  ]);
  expect(diagnostic.schemaVersion).toBe(1);
  expect(diagnostic.hub.events.length).toBeLessThanOrEqual(18);
  expect(diagnostic.game?.events.length ?? 0).toBeLessThanOrEqual(32);
  expect(Buffer.byteLength(diagnosticJson)).toBeLessThan(64 * 1024);
  expect(diagnosticJson).not.toContain(PRIVATE_STORAGE_SENTINEL);
  expect(diagnosticJson).not.toMatch(/localStorage|data:image|screenshot/i);
  await expect(page.getByRole("button", { name: "Open Lab" })).toHaveCount(0);

  await closeHubDrawer(page);
  await expect(page.locator(".runtime-state")).toHaveText("Active");
  await closeRuntime(page);
  expect(signals).toEqual({ errors: [], failedRequests: [], failedResponses: [] });
});

test("TUMBLEDRUM release matrix covers visuals, real input, and comfort settings", async ({
  browser,
  page,
}) => {
  test.slow();
  const signals = collectRuntimeSignals(page);
  await page.addInitScript(() => {
    if (!window.location.pathname.includes("/games/tumbledrum/")) return;
    let seed = 0x7a11d4;
    Math.random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 0x1_0000_0000;
    };
    const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => nativeRequestAnimationFrame(() => callback(0));
  });

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const locale of locales) {
      await page.goto("./");
      await setHubLocale(page, locale.id);
      const { tumbledrum } = await openTumbledrum(page, locale.tumbledrumStatus);
      await page.evaluate(() => document.fonts.ready);
      await tumbledrum.locator("body").evaluate(() => document.fonts.ready);
      await page
        .locator(".stage--runtime")
        .evaluate((element) => element.scrollIntoView({ block: "start" }));
      await expectInsideViewport(page, ".runtime-toolbar");
      const canvasBox = await tumbledrum.locator("#game").boundingBox();
      const viewportSize = page.viewportSize();
      expect(canvasBox, "TUMBLEDRUM canvas must have a viewport box").not.toBeNull();
      expect(viewportSize).not.toBeNull();
      expect(canvasBox!.x).toBeGreaterThanOrEqual(0);
      expect(canvasBox!.y).toBeGreaterThanOrEqual(0);
      expect(canvasBox!.x + canvasBox!.width).toBeLessThanOrEqual(viewportSize!.width + 1);
      expect(canvasBox!.y + canvasBox!.height).toBeLessThanOrEqual(viewportSize!.height + 1);
      if (locale.id === "en") {
        await expect(page).toHaveScreenshot(`tumbledrum-${viewport.id}-en.png`, {
          animations: "disabled",
          mask: [page.locator(".runtime-frame iframe")],
          maskColor: "#151a2b",
        });
      }
      await closeRuntime(page);
    }
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./");
  await setHubLocale(page, "en");
  const { tumbledrum } = await openTumbledrum(page);
  const canvas = tumbledrum.locator("#game");
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();
  await canvas.click({ position: { x: canvasBox!.width * 0.5, y: canvasBox!.height * 0.8 } });
  await expect(tumbledrum.locator("#status")).toContainText("Campaign stage 1 of 13");
  await canvas.focus();
  await canvas.press("Escape");
  await expect(page.locator(".runtime-state")).toHaveText("Paused");
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.locator(".runtime-state")).toHaveText("Active");

  const tumbleTools = await openSettingsDrawer(page);
  await tumbleTools.getByRole("slider", { name: /Master/ }).fill("0.42");
  await tumbleTools.getByRole("slider", { name: /Music/ }).fill("0.37");
  await tumbleTools.getByRole("slider", { name: /SFX/ }).fill("0.58");
  await tumbleTools.getByRole("checkbox", { name: "Reduce motion" }).check();
  await tumbleTools.getByRole("checkbox", { name: "Screen shake" }).uncheck();
  await openPlayDiagnostics(page);
  await expect(page.locator(".diagnostics__events")).toContainText(
    "master=0.42, music=0.37, sfx=0.58, reduced=true, shake=false",
  );
  await closeHubDrawer(page);
  await closeRuntime(page);

  const mobileContext = await browser.newContext({
    baseURL: new URL("./", page.url()).href,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const mobilePage = await mobileContext.newPage();
  const mobileSignals = collectRuntimeSignals(mobilePage);
  await mobilePage.goto("./");
  await setHubLocale(mobilePage, "en");
  const mobileRuntime = await openTumbledrum(mobilePage);
  const mobileCanvas = await mobileRuntime.tumbledrum.locator("#game").boundingBox();
  expect(mobileCanvas).not.toBeNull();
  await mobilePage.touchscreen.tap(
    mobileCanvas!.x + mobileCanvas!.width * 0.5,
    mobileCanvas!.y + mobileCanvas!.height * 0.8,
  );
  await expect(mobileRuntime.tumbledrum.locator("#status")).toContainText("Campaign stage 1 of 13");
  await closeRuntime(mobilePage);
  await mobileContext.close();

  expect(signals).toEqual({ errors: [], failedRequests: [], failedResponses: [] });
  expect(mobileSignals).toEqual({ errors: [], failedRequests: [], failedResponses: [] });
});

test("CrownBreaker release matrix covers locale state and real lifecycle input", async ({
  page,
}) => {
  test.slow();
  const signals = collectRuntimeSignals(page);
  await page.addInitScript(() => {
    if (!window.location.pathname.includes("/games/crown-breaker/")) return;
    let seed = 0x0c40b7ea;
    Math.random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 0x1_0000_0000;
    };
    const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => nativeRequestAnimationFrame(() => callback(1_000));
  });

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const locale of locales) {
      await page.goto("./");
      await setHubLocale(page, locale.id);
      const { crown } = await openCrown(page, locale.crownNewRun);
      await expect(crown.locator("html")).toHaveAttribute("lang", locale.crownLanguage);
      await page.evaluate(() => document.fonts.ready);
      await crown.locator("body").evaluate(() => document.fonts.ready);
      await page
        .locator(".stage--runtime")
        .evaluate((element) => element.scrollIntoView({ block: "start" }));
      await expectInsideViewport(page, ".runtime-toolbar");
      await closeRuntime(page);
    }
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./");
  await setHubLocale(page, "en");
  const { crown } = await openCrown(page);
  await crown.locator("#btn-new").click();
  await expect(crown.locator("#hud")).toHaveClass(/active/);
  const canvas = crown.locator("#game-canvas");
  await canvas.focus();
  await canvas.press("Escape");
  await expect(page.locator(".runtime-state")).toHaveText("Paused");
  await expect(crown.locator("#pause-modal")).toHaveClass(/active/);
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.locator(".runtime-state")).toHaveText("Active");
  await expect(crown.locator("#pause-modal")).not.toHaveClass(/active/);
  await closeRuntime(page);

  expect(signals).toEqual({ errors: [], failedRequests: [], failedResponses: [] });
});

test("50 registered-game round-robin cycles leave one clean browsing context", async ({ page }) => {
  test.slow();
  const signals = collectRuntimeSignals(page);
  await page.addInitScript(() => {
    interface MutableReleaseResourceState {
      guestAnimationFrames: number;
      guestAudioContexts: number;
      guestGlobalListeners: number;
      guestGlobalListenerTypes: Record<string, number>;
      guestIntervals: number;
      guestTimeouts: number;
      openHostPorts: number;
    }
    type ReleaseProbeWindow = typeof window & {
      __gameyardReleaseResources?: {
        state: MutableReleaseResourceState;
        snapshot(): ReleaseResourceSnapshot;
      };
    };
    type EventListenerMethod = (
      this: EventTarget,
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | AddEventListenerOptions,
    ) => void;
    const nativeAdd = Object.getOwnPropertyDescriptor(EventTarget.prototype, "addEventListener")!
      .value as EventListenerMethod;
    const nativeRemove = Object.getOwnPropertyDescriptor(
      EventTarget.prototype,
      "removeEventListener",
    )!.value as EventListenerMethod;
    const topWindow = window.top as ReleaseProbeWindow;

    if (window === window.top) {
      const state: MutableReleaseResourceState = {
        guestAnimationFrames: 0,
        guestAudioContexts: 0,
        guestGlobalListeners: 0,
        guestGlobalListenerTypes: {},
        guestIntervals: 0,
        guestTimeouts: 0,
        openHostPorts: 0,
      };
      const hostListenerSets = new Map<string, Set<EventListenerOrEventListenerObject>>();
      const hostListenerKey = (
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
        const key = hostListenerKey(this, type, options);
        if (key && listener) {
          const listeners = hostListenerSets.get(key) ?? new Set();
          listeners.add(listener);
          hostListenerSets.set(key, listeners);
        }
        nativeAdd.call(this, type, listener, options);
      };
      EventTarget.prototype.removeEventListener = function (type, listener, options) {
        const key = hostListenerKey(this, type, options);
        if (key && listener) hostListenerSets.get(key)?.delete(listener);
        nativeRemove.call(this, type, listener, options);
      };

      const NativeMessageChannel = window.MessageChannel;
      window.MessageChannel = class ReleaseMessageChannel extends NativeMessageChannel {
        constructor() {
          super();
          state.openHostPorts += 1;
          const nativeClose = this.port1.close.bind(this.port1);
          let closed = false;
          this.port1.close = () => {
            if (!closed) {
              closed = true;
              state.openHostPorts -= 1;
            }
            nativeClose();
          };
        }
      };

      Object.defineProperty(window, "__gameyardReleaseResources", {
        value: {
          state,
          snapshot: (): ReleaseResourceSnapshot => ({
            ...state,
            guestGlobalListenerTypes: { ...state.guestGlobalListenerTypes },
            hostGlobalListeners: Object.fromEntries(
              [...hostListenerSets]
                .filter(([, listeners]) => listeners.size > 0)
                .map(([key, listeners]): [string, number] => [key, listeners.size])
                .sort(([left], [right]) => left.localeCompare(right)),
            ),
          }),
        },
      });
      return;
    }

    if (!window.location.pathname.includes("/games/")) return;
    const state = topWindow.__gameyardReleaseResources?.state;
    if (!state) throw new Error("Release resource probe top-level state is missing");
    const resourceState = state;

    const nativeSetInterval = window.setInterval.bind(window);
    const nativeClearInterval = window.clearInterval.bind(window);
    const intervals = new Set<number>();
    window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      const id = nativeSetInterval(handler, timeout, ...args);
      intervals.add(id);
      resourceState.guestIntervals += 1;
      return id;
    }) as typeof window.setInterval;
    window.clearInterval = ((id?: number) => {
      if (id !== undefined && intervals.delete(id)) resourceState.guestIntervals -= 1;
      nativeClearInterval(id);
    }) as typeof window.clearInterval;

    const nativeSetTimeout = window.setTimeout.bind(window);
    const nativeClearTimeout = window.clearTimeout.bind(window);
    const timeouts = new Set<number>();
    window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      if (typeof handler !== "function") {
        throw new TypeError("Release resource probe requires callback-based timeouts");
      }
      let id = 0;
      const trackedHandler = (...handlerArgs: unknown[]) => {
        if (timeouts.delete(id)) resourceState.guestTimeouts -= 1;
        handler(...handlerArgs);
      };
      id = nativeSetTimeout(trackedHandler, timeout, ...args);
      timeouts.add(id);
      resourceState.guestTimeouts += 1;
      return id;
    }) as typeof window.setTimeout;
    window.clearTimeout = ((id?: number) => {
      if (id !== undefined && timeouts.delete(id)) resourceState.guestTimeouts -= 1;
      nativeClearTimeout(id);
    }) as typeof window.clearTimeout;

    const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
    const nativeCancelAnimationFrame = window.cancelAnimationFrame.bind(window);
    const animationFrames = new Set<number>();
    window.requestAnimationFrame = (callback) => {
      let id = 0;
      id = nativeRequestAnimationFrame((timestamp) => {
        if (animationFrames.delete(id)) resourceState.guestAnimationFrames -= 1;
        callback(timestamp);
      });
      animationFrames.add(id);
      resourceState.guestAnimationFrames += 1;
      return id;
    };
    window.cancelAnimationFrame = (id) => {
      if (animationFrames.delete(id)) resourceState.guestAnimationFrames -= 1;
      nativeCancelAnimationFrame(id);
    };

    const trackedEventTypes = new Set([
      "beforeunload",
      "blur",
      "focus",
      "keydown",
      "keyup",
      "languagechange",
      "message",
      "orientationchange",
      "pagehide",
      "pointerdown",
      "resize",
      "visibilitychange",
    ]);
    const guestListenerSets = new Map<string, Set<EventListenerOrEventListenerObject>>();
    const guestListenerKey = (
      target: EventTarget,
      type: string,
      options?: boolean | AddEventListenerOptions,
    ) => {
      if ((target !== window && target !== document) || !trackedEventTypes.has(type)) return null;
      const capture = typeof options === "boolean" ? options : !!options?.capture;
      if (capture) return null;
      return `${target === window ? "window" : "document"}:${type}:${capture}`;
    };
    EventTarget.prototype.addEventListener = function (type, listener, options) {
      const key = guestListenerKey(this, type, options);
      if (key && listener) {
        const listeners = guestListenerSets.get(key) ?? new Set();
        if (!listeners.has(listener)) {
          listeners.add(listener);
          guestListenerSets.set(key, listeners);
          resourceState.guestGlobalListeners += 1;
          resourceState.guestGlobalListenerTypes[key] =
            (resourceState.guestGlobalListenerTypes[key] ?? 0) + 1;
        }
      }
      nativeAdd.call(this, type, listener, options);
    };
    EventTarget.prototype.removeEventListener = function (type, listener, options) {
      const key = guestListenerKey(this, type, options);
      if (key && listener && guestListenerSets.get(key)?.delete(listener)) {
        resourceState.guestGlobalListeners -= 1;
        const remaining = (resourceState.guestGlobalListenerTypes[key] ?? 1) - 1;
        if (remaining === 0) delete resourceState.guestGlobalListenerTypes[key];
        else resourceState.guestGlobalListenerTypes[key] = remaining;
      }
      nativeRemove.call(this, type, listener, options);
    };

    const NativeAudioContext = window.AudioContext;
    const trackedAudioContexts = new WeakSet<AudioContext>();
    window.AudioContext = class ReleaseAudioContext extends NativeAudioContext {
      constructor(options?: AudioContextOptions) {
        super(options);
        trackedAudioContexts.add(this);
        resourceState.guestAudioContexts += 1;
      }

      override close(): Promise<void> {
        if (trackedAudioContexts.delete(this)) resourceState.guestAudioContexts -= 1;
        return super.close();
      }
    };
  });
  await page.goto("./");
  await setHubLocale(page, "zh-Hans");
  const baselineResources = await releaseResources(page);

  for (let cycle = 1; cycle <= 50; cycle += 1) {
    const game = roundRobinGames[(cycle - 1) % roundRobinGames.length]!;
    let guest = await openRoundRobinRuntime(page, game.id);
    expect(page.frames()).toHaveLength(2);
    expect(page.frames().filter((frame) => frame.url().includes(game.frameUrl))).toHaveLength(1);

    const targetLocale = locales[(cycle - 1) % locales.length]!;
    const roundRobinTools = await openSettingsDrawer(page);
    await roundRobinTools.locator("select").selectOption(targetLocale.id);
    const masterValue = String(Number((0.31 + (cycle % 10) * 0.01).toFixed(2)));
    await roundRobinTools.locator('input[type="range"]').first().fill(masterValue);
    const settingsRevision = await page.evaluate(() => {
      const raw = window.localStorage.getItem("gameyard.settings.v1");
      if (raw === null) throw new Error("Release settings revision is missing");
      const value = JSON.parse(raw) as { revision?: unknown };
      if (!Number.isSafeInteger(value.revision)) {
        throw new TypeError("Release settings revision must be a safe integer");
      }
      return value.revision as number;
    });
    await closeHubDrawer(page);
    await expectRoundRobinRuntimeReady(page);
    await expectProductionDiagnostics(page, game.id, targetLocale, settingsRevision);

    await expect
      .poll(async () => (await releaseResources(page)).guestAnimationFrames)
      .toBeGreaterThan(baselineResources.guestAnimationFrames);
    await expect
      .poll(async () => (await releaseResources(page)).guestGlobalListeners)
      .toBeGreaterThan(baselineResources.guestGlobalListeners);

    if (cycle % 5 === 0) {
      const previousGuest = guest;
      const reloadTools = await openSettingsDrawer(page);
      await reloadTools.locator(".drawer-reload button").click();
      await expectRoundRobinRuntimeReady(page);
      await expect.poll(() => page.frames().includes(previousGuest)).toBe(false);
      guest = page.frames().find((frame) => frame.url().includes(game.frameUrl))!;
      expect(guest).toBeDefined();
      expect(page.frames()).toHaveLength(2);
      expect(page.frames().filter((frame) => frame.url().includes(game.frameUrl))).toHaveLength(1);
      await expectProductionDiagnostics(page, game.id, targetLocale, settingsRevision, false);
    }

    await closeRuntime(page);
    expect(page.frames()).toHaveLength(1);
    await expect.poll(() => page.frames().includes(guest)).toBe(false);
    await expect.poll(() => releaseResources(page)).toEqual(baselineResources);
  }

  expect(
    page
      .context()
      .serviceWorkers()
      .map((worker) => worker.url()),
  ).toEqual([new URL("service-worker.js", page.url()).href]);
  expect(signals).toEqual({ errors: [], failedRequests: [], failedResponses: [] });
});
