import { expect, test, type Page } from "@playwright/test";

import { REGISTERED_GAMES } from "../registered-games";
import { closePlayTools, openPlayDiagnostics, openPlayTools } from "../play-mode";

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
  await expect(page.getByRole("heading", { name: "OPEN INDEX" })).toBeVisible();
  await page.locator("select").selectOption("en");
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

  const pulseTools = await openPlayTools(page);
  const pulseSettings = pulseTools.locator(".settings-bar");
  await pulseSettings.locator("select").selectOption("ja");
  await expect(pulse.getByRole("button", { name: "ゲームを始める" })).toBeVisible();
  await pulseSettings.locator("select").selectOption("zh-Hans");
  await expect(pulse.getByRole("button", { name: "开始游戏" })).toBeVisible();
  await pulseSettings.locator("select").selectOption("en");
  await expect(pulse.getByRole("button", { name: "Start game" })).toBeVisible();

  await pulseSettings.getByRole("slider", { name: /Master/ }).fill("0.31");
  await pulseSettings.getByRole("checkbox", { name: "Reduce motion" }).check();
  await openPlayDiagnostics(page);
  await expect(page.getByRole("heading", { name: "Read-only diagnostics" })).toBeVisible();
  await expect(page.locator(".diagnostics__facts")).toContainText("game:pulse-link-overdrive");
  await expect(page.locator(".diagnostics__events")).toContainText("locale.applied");
  await expect(page.locator(".diagnostics__events")).toContainText("settings.applied");
  await page.getByRole("button", { name: "Close ×" }).click();

  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.locator(".runtime-state")).toHaveText("Paused");
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.locator(".runtime-state")).toHaveText("Active");

  const reloadTools = await openPlayTools(page);
  await reloadTools.locator(".play-tools__reload button").click();
  await expect(pulse.getByRole("button", { name: "Start game" })).toBeVisible();
  await expect.poll(() => page.frames().includes(firstGuest!)).toBe(false);
  expect(
    page.frames().filter((frame) => frame.url().includes("/games/pulse-link-overdrive/index.html")),
  ).toHaveLength(1);

  await page.getByRole("button", { name: "Back to works" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(frameElement).toHaveCount(0);

  expect(runtimeErrors).toEqual([]);
});

test("TUMBLEDRUM runs through the shared Hub contract", async ({ page }) => {
  test.slow();
  const runtimeErrors = collectRuntimeErrors(page);

  await page.goto("./");
  await page.getByLabel("Language").selectOption("en");
  await page.getByRole("link", { name: /TUMBLEDRUM/ }).click();

  await expect(page).toHaveURL(/\?game=tumbledrum$/);
  const frameElement = page.locator(".runtime-frame iframe");
  const game = page.frameLocator(".runtime-frame iframe");
  await expect(frameElement).toHaveCount(1);
  await expect(game.locator("#game")).toBeVisible();
  await expect(game.locator("#status")).toContainText("TUMBLEDRUM title screen");

  const tumbleTools = await openPlayTools(page);
  const tumbleSettings = tumbleTools.locator(".settings-bar");
  await tumbleSettings.locator("select").selectOption("ja");
  await expect(game.locator("html")).toHaveAttribute("lang", "ja");
  await expect(game.locator("#status")).toContainText("TUMBLEDRUMのタイトル画面");
  await tumbleSettings.locator("select").selectOption("zh-Hans");
  await expect(game.locator("html")).toHaveAttribute("lang", "zh-Hans");
  await expect(game.locator("#status")).toContainText("TUMBLEDRUM 标题画面");
  await tumbleSettings.locator("select").selectOption("en");

  await tumbleSettings.getByRole("slider", { name: /Master/ }).fill("0.42");
  await tumbleSettings.getByRole("slider", { name: /Music/ }).fill("0.37");
  await tumbleSettings.getByRole("slider", { name: /SFX/ }).fill("0.58");
  await tumbleSettings.getByRole("checkbox", { name: "Reduce motion" }).check();
  await openPlayDiagnostics(page);
  await expect(page.locator(".diagnostics__facts")).toContainText("game:tumbledrum");
  await expect(page.locator(".diagnostics__events")).toContainText("locale.applied");
  await expect(page.locator(".diagnostics__events")).toContainText("settings.applied");
  await page.getByRole("button", { name: "Close ×" }).click();

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
  await page.locator("select").selectOption("en");
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

  const crownTools = await openPlayTools(page);
  const crownSettings = crownTools.locator(".settings-bar");
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
  await closePlayTools(page);

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
  await page.getByRole("button", { name: "Close ×" }).click();

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
  await page.getByLabel("Language").selectOption("zh-Hans");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hans");
  await expect(page.getByRole("button", { name: /诊断/ })).toBeVisible();

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hans");
  await expect(page.getByRole("button", { name: /诊断/ })).toBeVisible();
  const stored = await page.evaluate((key) => window.localStorage.getItem(key), SETTINGS_KEY);
  expect(JSON.parse(stored as string)).toMatchObject({ localePreference: "zh-Hans", revision: 2 });

  expect(runtimeErrors).toEqual([]);
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
    await page.locator(".settings-bar select").selectOption("en");
    await page.locator(`.catalog-row__select[href="?game=${game.id}"]`).click();
    await expect(page.locator(".play-mode")).toBeVisible();
    await expect(page.locator(".intro, .catalog, .site-footer")).toHaveCount(0);
    await expect(page.locator(".settings-bar")).toBeHidden();
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
    await openPlayTools(page);
    expect(
      await frame.evaluate(
        (element) =>
          (window as typeof window & { __issue42Frame?: Element }).__issue42Frame === element,
      ),
    ).toBe(true);
    await closePlayTools(page);
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

  await page.getByRole("button", { name: /Diagnostics/ }).click();
  await expect(page.locator(".diagnostics__events")).toContainText("settings.reset");
  expect(runtimeErrors).toEqual([]);
});

test("production shell has no lab and fits the configured viewport", async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page);

  await page.goto("./");
  await expect(page.getByRole("heading", { name: "OPEN INDEX" })).toBeVisible();
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
