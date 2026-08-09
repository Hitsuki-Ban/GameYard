import { expect, test, type Page } from "@playwright/test";

import { REGISTERED_GAMES } from "../registered-games";
import {
  closeHubDrawer,
  openPlayDiagnostics,
  openSettingsDrawer,
  setHubLocale,
} from "../play-mode";

const SETTINGS_KEY = "gameyard.settings.v1";

interface CrownResourceSnapshot {
  readonly animationFrames: number;
  readonly audioContexts: number;
  readonly globalListeners: number;
  readonly hostPorts: number;
  readonly intervals: number;
  readonly timeouts: number;
}

function collectRuntimeErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return errors;
}

async function installCrownResourceProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    interface MutableCrownResourceState {
      animationFrames: number;
      audioContexts: number;
      globalListeners: number;
      hostPorts: number;
      intervals: number;
      timeouts: number;
    }
    type CrownProbeWindow = typeof window & {
      __gameyardCrownResources?: {
        state: MutableCrownResourceState;
        snapshot(): MutableCrownResourceState;
      };
    };

    const topWindow = window.top as CrownProbeWindow;
    if (window === window.top) {
      const state: MutableCrownResourceState = {
        animationFrames: 0,
        audioContexts: 0,
        globalListeners: 0,
        hostPorts: 0,
        intervals: 0,
        timeouts: 0,
      };
      Object.defineProperty(window, "__gameyardCrownResources", {
        value: { state, snapshot: () => ({ ...state }) },
      });

      const NativeMessageChannel = window.MessageChannel;
      window.MessageChannel = class TrackedMessageChannel extends NativeMessageChannel {
        constructor() {
          super();
          state.hostPorts += 1;
          const nativeClose = this.port1.close.bind(this.port1);
          let closed = false;
          this.port1.close = () => {
            if (!closed) {
              closed = true;
              state.hostPorts -= 1;
            }
            nativeClose();
          };
        }
      };
      return;
    }

    if (!window.location.pathname.includes("/games/crown-breaker/")) return;
    const state = topWindow.__gameyardCrownResources?.state;
    if (!state) throw new Error("Crown resource probe top-level state is missing");
    const resourceState = state;

    const nativeSetInterval = window.setInterval.bind(window);
    const nativeClearInterval = window.clearInterval.bind(window);
    const intervals = new Set<number>();
    window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      const id = nativeSetInterval(handler, timeout, ...args);
      intervals.add(id);
      state.intervals += 1;
      return id;
    }) as typeof window.setInterval;
    window.clearInterval = ((id?: number) => {
      if (id !== undefined && intervals.delete(id)) state.intervals -= 1;
      nativeClearInterval(id);
    }) as typeof window.clearInterval;

    const nativeSetTimeout = window.setTimeout.bind(window);
    const nativeClearTimeout = window.clearTimeout.bind(window);
    const timeouts = new Set<number>();
    window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      if (typeof handler !== "function") {
        throw new TypeError("Crown resource probe requires callback-based timeouts");
      }
      let id = 0;
      const trackedHandler = (...handlerArgs: unknown[]) => {
        if (timeouts.delete(id)) state.timeouts -= 1;
        handler(...handlerArgs);
      };
      id = nativeSetTimeout(trackedHandler, timeout, ...args);
      timeouts.add(id);
      state.timeouts += 1;
      return id;
    }) as typeof window.setTimeout;
    window.clearTimeout = ((id?: number) => {
      if (id !== undefined && timeouts.delete(id)) state.timeouts -= 1;
      nativeClearTimeout(id);
    }) as typeof window.clearTimeout;

    const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
    const nativeCancelAnimationFrame = window.cancelAnimationFrame.bind(window);
    const animationFrames = new Set<number>();
    window.requestAnimationFrame = (callback) => {
      let id = 0;
      id = nativeRequestAnimationFrame((timestamp) => {
        if (animationFrames.delete(id)) state.animationFrames -= 1;
        callback(timestamp);
      });
      animationFrames.add(id);
      state.animationFrames += 1;
      return id;
    };
    window.cancelAnimationFrame = (id) => {
      if (animationFrames.delete(id)) state.animationFrames -= 1;
      nativeCancelAnimationFrame(id);
    };

    const trackedEventTypes = new Set([
      "blur",
      "focus",
      "keydown",
      "keyup",
      "languagechange",
      "message",
      "pagehide",
      "pointercancel",
      "pointerup",
      "resize",
      "visibilitychange",
    ]);
    const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
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
    const listenerKey = (
      target: EventTarget,
      type: string,
      options?: boolean | AddEventListenerOptions,
    ) => {
      if ((target !== window && target !== document) || !trackedEventTypes.has(type)) return null;
      const capture = typeof options === "boolean" ? options : !!options?.capture;
      return `${target === window ? "window" : "document"}:${type}:${capture}`;
    };
    EventTarget.prototype.addEventListener = function (type, listener, options) {
      const key = listenerKey(this, type, options);
      if (key && listener) {
        const registered = listeners.get(key) ?? new Set();
        if (!registered.has(listener)) {
          registered.add(listener);
          listeners.set(key, registered);
          state.globalListeners += 1;
        }
      }
      nativeAdd.call(this, type, listener, options);
    };
    EventTarget.prototype.removeEventListener = function (type, listener, options) {
      const key = listenerKey(this, type, options);
      if (key && listener && listeners.get(key)?.delete(listener)) state.globalListeners -= 1;
      nativeRemove.call(this, type, listener, options);
    };

    const NativeAudioContext = window.AudioContext;
    const trackedAudioContexts = new WeakSet<AudioContext>();
    window.AudioContext = class TrackedAudioContext extends NativeAudioContext {
      constructor(options?: AudioContextOptions) {
        super(options);
        trackedAudioContexts.add(this);
        resourceState.audioContexts += 1;
      }

      override close(): Promise<void> {
        if (trackedAudioContexts.delete(this)) resourceState.audioContexts -= 1;
        return super.close();
      }
    };
  });
}

async function crownResources(page: Page): Promise<CrownResourceSnapshot> {
  return page.evaluate(() =>
    (
      window as typeof window & {
        __gameyardCrownResources: { snapshot(): CrownResourceSnapshot };
      }
    ).__gameyardCrownResources.snapshot(),
  );
}

test("Pulse runs through the Hub lifecycle with live public preferences", async ({ page }) => {
  test.slow();
  const runtimeErrors = collectRuntimeErrors(page);

  await page.goto("./");
  await expect(page.getByRole("heading", { name: "PLAY THE YARD" })).toBeVisible();
  await setHubLocale(page, "en");
  await page.getByRole("link", { name: /PULSE LINK \/\/ OVERDRIVE/ }).click();

  await expect(page).toHaveURL(/\?game=pulse-link-overdrive$/);
  const frameElement = page.locator(".runtime-frame iframe");
  const pulse = page.frameLocator(".runtime-frame iframe");
  await expect(frameElement).toHaveCount(1);
  await expect(pulse.getByRole("button", { name: "Start game" })).toBeVisible();

  const firstGuest = page
    .frames()
    .find((frame) => frame.url().includes("/games/pulse-link-overdrive/index.html"));
  expect(firstGuest).toBeDefined();

  const pulseTools = await openSettingsDrawer(page);
  const pulseSettings = pulseTools.locator(".settings-panel");
  await expect(page.locator(".runtime-state")).toHaveText("Paused");
  await pulseSettings.locator("select").selectOption("ja");
  await expect(pulse.getByRole("button", { name: "ゲームを始める" })).toBeVisible();
  await pulseSettings.locator("select").selectOption("zh-Hans");
  await expect(pulse.getByRole("button", { name: "开始游戏" })).toBeVisible();
  await pulseSettings.locator("select").selectOption("en");
  await expect(pulse.getByRole("button", { name: "Start game" })).toBeVisible();

  const masterVolume = pulseSettings.getByRole("slider", { name: /Master/ });
  await masterVolume.evaluate(async (element) => {
    const slider = element as HTMLInputElement;
    const valueDescriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    if (valueDescriptor?.set === undefined) {
      throw new Error("Native range value setter is unavailable");
    }
    for (let step = 0; step < 24; step += 1) {
      valueDescriptor.set.call(slider, String(0.1 + step * 0.03));
      slider.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
  });
  await masterVolume.fill("0.31");
  await pulseSettings.getByRole("checkbox", { name: "Reduce motion" }).check();
  const expectedRevision = await page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    if (raw === null) throw new Error("Persisted Hub settings are missing");
    return (JSON.parse(raw) as { revision: number }).revision;
  }, SETTINGS_KEY);
  await openPlayDiagnostics(page);
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Read-only diagnostics" })).toBeVisible();
  await expect(page.locator(".diagnostics__facts")).toContainText("game:pulse-link-overdrive");
  await expect(page.locator(".diagnostics__facts dd").nth(4)).toHaveText(String(expectedRevision));
  await expect(page.locator(".diagnostics__facts dd").nth(7)).toHaveText(String(expectedRevision));
  await expect(page.locator(".diagnostics__events")).toContainText("locale.applied");
  await expect(page.locator(".diagnostics__events")).toContainText("settings.applied");
  await closeHubDrawer(page);
  await expect(page.locator(".runtime-state")).toHaveText("Active");

  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.locator(".runtime-state")).toHaveText("Paused");
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.locator(".runtime-state")).toHaveText("Active");

  const reloadTools = await openSettingsDrawer(page);
  await reloadTools.locator(".drawer-reload button").click();
  await expect(pulse.getByRole("button", { name: "Start game" })).toBeVisible();
  await expect.poll(() => page.frames().includes(firstGuest!)).toBe(false);
  await expect
    .poll(
      () =>
        page
          .frames()
          .filter((frame) => frame.url().includes("/games/pulse-link-overdrive/index.html")).length,
      { message: "reload must settle on exactly one navigated Pulse guest" },
    )
    .toBe(1);

  await page.getByRole("button", { name: "Back to works" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(frameElement).toHaveCount(0);

  expect(runtimeErrors).toEqual([]);
});

test("TUMBLEDRUM runs through the shared Hub contract", async ({ page }) => {
  test.slow();
  const runtimeErrors = collectRuntimeErrors(page);

  await page.goto("./");
  await setHubLocale(page, "en");
  await page.getByRole("link", { name: /TUMBLEDRUM/ }).click();

  await expect(page).toHaveURL(/\?game=tumbledrum$/);
  const frameElement = page.locator(".runtime-frame iframe");
  const game = page.frameLocator(".runtime-frame iframe");
  await expect(frameElement).toHaveCount(1);
  await expect(game.locator("#game")).toBeVisible();
  await expect(game.locator("#status")).toContainText("TUMBLEDRUM title screen");

  const tumbleTools = await openSettingsDrawer(page);
  const tumbleSettings = tumbleTools.locator(".settings-panel");
  await tumbleSettings.locator("select").selectOption("ja");
  await expect(game.locator("html")).toHaveAttribute("lang", "ja");
  await expect(game.locator("main.stage")).toHaveAttribute("aria-label", "TUMBLEDRUM ゲーム");
  await tumbleSettings.locator("select").selectOption("zh-Hans");
  await expect(game.locator("html")).toHaveAttribute("lang", "zh-Hans");
  await expect(game.locator("main.stage")).toHaveAttribute("aria-label", "TUMBLEDRUM 游戏");
  await tumbleSettings.locator("select").selectOption("en");

  await tumbleSettings.getByRole("slider", { name: /Master/ }).fill("0.42");
  await tumbleSettings.getByRole("slider", { name: /Music/ }).fill("0.37");
  await tumbleSettings.getByRole("slider", { name: /SFX/ }).fill("0.58");
  await tumbleSettings.getByRole("checkbox", { name: "Reduce motion" }).check();
  await openPlayDiagnostics(page);
  await expect(page.locator(".diagnostics__facts")).toContainText("game:tumbledrum");
  await expect(page.locator(".diagnostics__events")).toContainText("locale.applied");
  await expect(page.locator(".diagnostics__events")).toContainText("settings.applied");
  await closeHubDrawer(page);

  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.locator(".runtime-state")).toHaveText("Paused");
  await expect(game.locator("#status")).toHaveText("Game paused.");
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.locator(".runtime-state")).toHaveText("Active");

  await page.getByRole("button", { name: "Back to works" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(frameElement).toHaveCount(0);
  expect(runtimeErrors).toEqual([]);
});

test("CrownBreaker completes one real Hub contract and resource lifecycle", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Issue #11 has one focused Crown path");
  test.slow();
  const runtimeErrors = collectRuntimeErrors(page);
  await installCrownResourceProbe(page);

  await page.goto("./");
  await setHubLocale(page, "en");
  const baselineResources = await crownResources(page);
  await page.getByRole("link", { name: /CROWN\/\/BREAKER/ }).click();

  await expect(page).toHaveURL(/\?game=crown-breaker$/);
  const frameElement = page.locator(".runtime-frame iframe");
  const crown = page.frameLocator(".runtime-frame iframe");
  await expect(frameElement).toHaveCount(1);
  await expect(page.locator(".runtime-state")).toHaveText("Active");
  const newRunLabel = crown.locator('#btn-new [data-i18n="title.newRun"]');
  await expect(newRunLabel).toHaveText("New Run");
  const firstGuest = page
    .frames()
    .find((frame) => frame.url().includes("/games/crown-breaker/index.html"));
  expect(firstGuest).toBeDefined();

  const crownTools = await openSettingsDrawer(page);
  const crownSettings = crownTools.locator(".settings-panel");
  await crownSettings.locator("select").selectOption("ja");
  await expect(crown.locator("html")).toHaveAttribute("lang", "ja");
  await expect(newRunLabel).toHaveText("ニューラン");
  await crownSettings.locator("select").selectOption("zh-Hans");
  await expect(crown.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(newRunLabel).toHaveText("新局");
  await crownSettings.locator("select").selectOption("en");

  await crownSettings.getByRole("slider", { name: /Master/ }).fill("0.46");
  await crownSettings.getByRole("slider", { name: /Music/ }).fill("0.35");
  await crownSettings.getByRole("slider", { name: /SFX/ }).fill("0.57");
  await crownSettings.getByRole("checkbox", { name: "Reduce motion" }).check();
  await crownSettings.getByRole("checkbox", { name: "Screen shake" }).uncheck();
  await expect(crown.locator("#app")).toHaveAttribute("data-motion", "reduced");
  await closeHubDrawer(page);

  await crown.locator("#btn-new").click();
  expect(runtimeErrors).toEqual([]);
  await expect(crown.locator("#hud")).toHaveClass(/active/);
  await expect
    .poll(async () => crownResources(page))
    .toMatchObject({
      animationFrames: 1,
      audioContexts: 1,
      intervals: 0,
    });
  await expect
    .poll(async () => (await crownResources(page)).hostPorts)
    .toBeGreaterThan(baselineResources.hostPorts);
  await expect.poll(async () => (await crownResources(page)).timeouts).toBeGreaterThan(0);
  const activeHostPorts = (await crownResources(page)).hostPorts;

  await openPlayDiagnostics(page);
  await expect(page.locator(".diagnostics__facts")).toContainText("game:crown-breaker");
  await expect(page.locator(".diagnostics__events")).toContainText("locale.applied");
  await expect(page.locator(".diagnostics__events")).toContainText("settings.applied");
  await closeHubDrawer(page);

  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.locator(".runtime-state")).toHaveText("Paused");
  await expect(crown.locator("#pause-modal")).toHaveClass(/active/);
  await expect
    .poll(async () => crownResources(page))
    .toMatchObject({
      animationFrames: 0,
      audioContexts: 1,
      hostPorts: activeHostPorts,
      intervals: 0,
      timeouts: 0,
    });

  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.locator(".runtime-state")).toHaveText("Active");
  await expect
    .poll(async () => crownResources(page))
    .toMatchObject({
      animationFrames: 1,
      audioContexts: 1,
      hostPorts: activeHostPorts,
      intervals: 0,
    });
  await expect.poll(async () => (await crownResources(page)).timeouts).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Back to works" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(frameElement).toHaveCount(0);
  await expect.poll(() => page.frames().includes(firstGuest!)).toBe(false);
  await expect.poll(async () => crownResources(page)).toEqual(baselineResources);
  expect(runtimeErrors).toEqual([]);
});

test("public language setting persists across reloads", async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page);

  await page.goto("./");
  await setHubLocale(page, "zh-Hans");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hans");
  await expect(page.getByRole("button", { name: /^设置/ })).toBeVisible();

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hans");
  await expect(page.getByRole("button", { name: /^设置/ })).toBeVisible();
  const stored = await page.evaluate((key) => window.localStorage.getItem(key), SETTINGS_KEY);
  expect(JSON.parse(stored as string)).toMatchObject({ localePreference: "zh-Hans", revision: 2 });

  expect(runtimeErrors).toEqual([]);
});

test("Browse Mode is actionable in the first mobile viewport and loads no game runtime", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "One responsive journey covers Browse Mode",
  );
  const runtimeRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.includes("/games/")) runtimeRequests.push(request.url());
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  const cards = page.locator(".catalog-card__link");
  await expect(cards).toHaveCount(REGISTERED_GAMES.length);
  await expect(page.locator(".stage--empty, .runtime-frame iframe")).toHaveCount(0);
  const firstCard = cards.first();
  await expect(firstCard).toBeVisible();
  await expect(firstCard.locator("img")).toHaveJSProperty("complete", true);
  const covers = page.locator(".catalog-card__cover img");
  await expect(covers.first()).toHaveAttribute("fetchpriority", "high");
  for (let index = 0; index < REGISTERED_GAMES.length; index += 1) {
    await expect(covers.nth(index)).toHaveAttribute("loading", index < 4 ? "eager" : "lazy");
  }
  const firstCardBox = await firstCard.boundingBox();
  expect(firstCardBox).not.toBeNull();
  expect(firstCardBox!.y).toBeGreaterThanOrEqual(0);
  expect(firstCardBox!.y + firstCardBox!.height).toBeLessThanOrEqual(844);
  expect(runtimeRequests).toEqual([]);
  const initialCoverTransfer = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .filter((entry) => entry.name.includes("catalog-cover"))
      .reduce((total, entry) => total + (entry as PerformanceResourceTiming).transferSize, 0),
  );
  expect(initialCoverTransfer).toBeLessThanOrEqual(300 * 1024);

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect
    .poll(() =>
      page
        .locator(".catalog-grid")
        .evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length),
    )
    .toBeGreaterThanOrEqual(4);
  const firstFourFit = await page.locator(".catalog-grid").evaluate((grid) => {
    const firstItem = grid.firstElementChild;
    if (!firstItem) throw new Error("Browse fixture requires at least one catalog card");
    const fixtureItems: Element[] = [];
    while (grid.children.length < 4) {
      const clone = firstItem.cloneNode(true) as Element;
      fixtureItems.push(clone);
      grid.append(clone);
    }
    const fits = [...grid.querySelectorAll<HTMLElement>(".catalog-card__link")]
      .slice(0, 4)
      .every((card) => card.getBoundingClientRect().bottom <= innerHeight);
    for (const fixture of fixtureItems) fixture.remove();
    return fits;
  });
  expect(firstFourFit).toBe(true);
  const visibleCards = await cards.evaluateAll(
    (elements) =>
      elements.filter((element) => element.getBoundingClientRect().bottom <= innerHeight).length,
  );
  expect(visibleCards).toBe(REGISTERED_GAMES.length);

  await firstCard.focus();
  await page.keyboard.press("Tab");
  await expect(cards.nth(1)).toBeFocused();

  await page.setViewportSize({ width: 320, height: 800 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);

  const zoomedSettings = await openSettingsDrawer(page);
  await expect
    .poll(async () => {
      const box = await page.locator(".hub-drawer__dialog").boundingBox();
      if (box === null) throw new Error("Drawer dialog is missing");
      return box.x + box.width;
    })
    .toBeLessThanOrEqual(321);
  const dialogBox = await page.locator(".hub-drawer__dialog").boundingBox();
  const closeBox = await page.locator(".hub-drawer__heading > button").boundingBox();
  const languageBox = await zoomedSettings.locator(".settings-panel select").boundingBox();
  for (const [label, box] of [
    ["drawer", dialogBox],
    ["close", closeBox],
    ["language", languageBox],
  ] as const) {
    expect(box, `${label} control must remain visible at 320px / 200%`).not.toBeNull();
    expect(box!.x, `${label} left edge`).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width, `${label} right edge`).toBeLessThanOrEqual(321);
  }
  await closeHubDrawer(page);

  await cards.first().click();
  await expect(page.locator(".play-mode")).toBeVisible();
  await expect(page.locator(".runtime-frame iframe")).toHaveCount(1);
});

test("Play Mode keeps one runtime through viewport and overlay changes for both stage strategies", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "One viewport journey covers both strategies",
  );
  test.slow();
  const runtimeErrors = collectRuntimeErrors(page);
  const cases = [
    { id: "pulse-link-overdrive", strategy: "adaptive" },
    { id: "tumbledrum", strategy: "fixed-aspect" },
  ] as const;

  for (const game of cases) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("./");
    const browseSettings = await openSettingsDrawer(page);
    await browseSettings.locator(".settings-panel select").selectOption("en");
    await closeHubDrawer(page);
    await page.locator(`.catalog-card__link[href="?game=${game.id}"]`).click();
    await expect(page.locator(".play-mode")).toBeVisible();
    await expect(page.locator(".intro, .catalog, .site-footer")).toHaveCount(0);
    await expect(page.locator(".settings-panel")).toBeHidden();
    const stage = page.locator(`.stage--runtime[data-stage-strategy="${game.strategy}"]`);
    const frame = page.locator(".runtime-frame iframe");
    await expect(stage).toBeVisible();
    await expect(page.locator(".runtime-state")).toHaveText("Active");
    await expect(frame).toHaveCount(1);
    await frame.evaluate((element) => {
      (window as typeof window & { __issue42Frame?: Element }).__issue42Frame = element;
    });

    for (const viewport of [
      { width: 1920, height: 1080 },
      { width: 2560, height: 1440 },
      { width: 390, height: 844 },
      { width: 844, height: 390 },
    ]) {
      await page.setViewportSize(viewport);
      const stageBox = await stage.boundingBox();
      expect(stageBox).not.toBeNull();
      if (viewport.width >= 1440) {
        expect(stageBox!.width).toBeGreaterThanOrEqual(viewport.width * 0.8);
        expect(stageBox!.height).toBeGreaterThanOrEqual(viewport.height * 0.7);
      }
      expect(
        await frame.evaluate(
          (element) =>
            (window as typeof window & { __issue42Frame?: Element }).__issue42Frame === element,
        ),
      ).toBe(true);
    }

    await page.getByRole("button", { name: "Pause" }).click();
    await expect(page.locator(".runtime-state")).toHaveText("Paused");
    await openSettingsDrawer(page);
    expect(
      await frame.evaluate(
        (element) =>
          (window as typeof window & { __issue42Frame?: Element }).__issue42Frame === element,
      ),
    ).toBe(true);
    await closeHubDrawer(page);
    await page.getByRole("button", { name: "Resume" }).click();
    await expect(page.locator(".runtime-state")).toHaveText("Active");
    await page.locator(".runtime-toolbar__back").click();
    await expect(page).toHaveURL(/\/$/);
    await expect(frame).toHaveCount(0);
  }

  await page.goto("./?game=tumbledrum");
  await expect(page.locator(".runtime-frame iframe")).toHaveCount(1);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.locator(".runtime-toolbar__back").click();
  await expect(page).toHaveURL(/\/$/);
  expect(runtimeErrors).toEqual([]);
});

test("invalid settings stop visibly and reset only after an explicit click", async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page);
  await page.addInitScript((key) => window.localStorage.setItem(key, "{invalid"), SETTINGS_KEY);

  await page.goto("./");
  await expect(page.getByText("SETTINGS / CONTRACT / STOP")).toBeVisible();
  await expect(page.getByLabel("Language")).toBeDisabled();
  expect(await page.evaluate((key) => window.localStorage.getItem(key), SETTINGS_KEY)).toBe(
    "{invalid",
  );

  await page.getByRole("button", { name: "Reset settings" }).click();
  await expect(page.getByText("SETTINGS / CONTRACT / STOP")).toBeHidden();
  await expect(page.getByLabel("Language")).toBeEnabled();
  const repaired = await page.evaluate((key) => window.localStorage.getItem(key), SETTINGS_KEY);
  expect(JSON.parse(repaired as string)).toMatchObject({ schemaVersion: 1, revision: 1 });

  await openPlayDiagnostics(page);
  await expect(page.locator(".diagnostics__events")).toContainText("settings.reset");
  expect(runtimeErrors).toEqual([]);
});

test("production shell has no lab and fits the configured viewport", async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page);

  await page.goto("./");
  await expect(page.getByRole("heading", { name: "PLAY THE YARD" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Lab" })).toHaveCount(0);

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  expect(runtimeErrors).toEqual([]);
});

test("unknown and duplicate game routes are rejected visibly", async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page);

  await page.goto("./?game=not-a-game");
  await expect(page.getByRole("heading", { name: "Route rejected" })).toBeVisible();
  await expect(page.locator(".route-error__code")).toContainText("UNKNOWN-GAME");

  await page.goto("./?game=tumbledrum&game=crown-breaker");
  await expect(page.getByRole("heading", { name: "Route rejected" })).toBeVisible();
  await expect(page.locator(".route-error__code")).toContainText("DUPLICATE-GAME");
  expect(runtimeErrors).toEqual([]);
});

test("production metadata describes every registered exhibit exactly", async ({ request }) => {
  const buildInfoResponse = await request.get("./build-info.json");
  const catalogResponse = await request.get("./games/catalog.json");
  const manifestResponses = await Promise.all(
    REGISTERED_GAMES.map((game) => request.get(`./games/${game.id}/game.manifest.json`)),
  );
  expect(buildInfoResponse.ok()).toBe(true);
  expect(catalogResponse.ok()).toBe(true);
  for (const response of manifestResponses) expect(response.ok()).toBe(true);

  const buildInfo = await buildInfoResponse.json();
  const catalog = await catalogResponse.json();
  const manifests = await Promise.all(manifestResponses.map((response) => response.json()));
  expect(buildInfo).toMatchObject({ schemaVersion: 1 });
  expect(buildInfo.buildId).toMatch(/^gameyard@[a-f0-9]{16}$/);
  expect(buildInfo.files).toContain("build-info.json");
  expect(buildInfo.files).toContain("games/catalog.json");
  expect(catalog).toEqual({
    schemaVersion: 1,
    buildId: buildInfo.buildId,
    games: REGISTERED_GAMES.map((game) => ({
      id: game.id,
      entry: `./${game.id}/${game.entry}`,
      manifest: `./${game.id}/game.manifest.json`,
    })),
  });
  for (const [index, manifest] of manifests.entries()) {
    const game = REGISTERED_GAMES[index]!;
    expect(manifest).toMatchObject({
      schemaVersion: 1,
      protocol: 1,
      id: game.id,
      buildId: buildInfo.buildId,
      entry: game.entry,
    });
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+/u);
    expect(manifest.files).toContain("index.html");
    expect(manifest.files).toContain("game.manifest.json");
  }
});
