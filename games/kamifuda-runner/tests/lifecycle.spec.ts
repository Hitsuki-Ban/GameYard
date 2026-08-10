import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

type ResourceSnapshot = {
  listeners: number;
  animationFrames: number;
  timeouts: number;
  intervals: number;
  audioContexts: number;
};

async function installResourceProbe(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    const listeners = new Set<string>();
    const targetIds = new WeakMap<object, number>();
    const listenerIds = new WeakMap<object, number>();
    let nextTargetId = 1;
    let nextListenerId = 1;
    const idFor = (map: WeakMap<object, number>, value: object, next: () => number) => {
      let id = map.get(value);
      if (id === undefined) {
        id = next();
        map.set(value, id);
      }
      return id;
    };
    const listenerKey = (
      target: object,
      type: string,
      listener: object,
      options?: boolean | AddEventListenerOptions,
    ) => {
      const capture = typeof options === "boolean" ? options : options?.capture === true;
      return `${idFor(targetIds, target, () => nextTargetId++)}:${type}:${idFor(listenerIds, listener, () => nextListenerId++)}:${capture}`;
    };
    // eslint-disable-next-line typescript/unbound-method -- invoked with Reflect.apply below.
    const nativeAdd = EventTarget.prototype.addEventListener;
    // eslint-disable-next-line typescript/unbound-method -- invoked with Reflect.apply below.
    const nativeRemove = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function (type, listener, options) {
      if (listener) listeners.add(listenerKey(this, type, listener, options));
      Reflect.apply(nativeAdd, this, [type, listener, options]);
    };
    EventTarget.prototype.removeEventListener = function (type, listener, options) {
      if (listener) listeners.delete(listenerKey(this, type, listener, options));
      Reflect.apply(nativeRemove, this, [type, listener, options]);
    };

    const frames = new Set<number>();
    const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
    const nativeCancelAnimationFrame = window.cancelAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => {
      let id = 0;
      id = nativeRequestAnimationFrame((timestamp) => {
        frames.delete(id);
        callback(timestamp);
      });
      frames.add(id);
      return id;
    };
    window.cancelAnimationFrame = (id) => {
      frames.delete(id);
      nativeCancelAnimationFrame(id);
    };

    const timeouts = new Set<number>();
    const intervals = new Set<number>();
    const nativeSetTimeout = window.setTimeout.bind(window);
    const nativeClearTimeout = window.clearTimeout.bind(window);
    const nativeSetInterval = window.setInterval.bind(window);
    const nativeClearInterval = window.clearInterval.bind(window);
    window.setTimeout = ((callback: TimerHandler, delay?: number, ...args: unknown[]) => {
      let id = 0;
      id = nativeSetTimeout(
        (...callbackArgs: unknown[]) => {
          timeouts.delete(id);
          if (typeof callback === "function") callback(...callbackArgs);
        },
        delay,
        ...args,
      );
      timeouts.add(id);
      return id;
    }) as typeof window.setTimeout;
    window.clearTimeout = ((id?: number) => {
      if (id !== undefined) timeouts.delete(id);
      nativeClearTimeout(id);
    }) as typeof window.clearTimeout;
    window.setInterval = ((callback: TimerHandler, delay?: number, ...args: unknown[]) => {
      const id = nativeSetInterval(callback, delay, ...args);
      intervals.add(id);
      return id;
    }) as typeof window.setInterval;
    window.clearInterval = ((id?: number) => {
      if (id !== undefined) intervals.delete(id);
      nativeClearInterval(id);
    }) as typeof window.clearInterval;

    let audioContexts = 0;
    const NativeAudioContext = window.AudioContext;
    if (NativeAudioContext) {
      window.AudioContext = class extends NativeAudioContext {
        constructor(options?: AudioContextOptions) {
          super(options);
          audioContexts += 1;
        }
        override async close() {
          const result = await super.close();
          audioContexts -= 1;
          return result;
        }
      };
    }
    Object.defineProperty(window, "__GAMEYARD_RESOURCE_PROBE__", {
      value: {
        snapshot: () => ({
          listeners: listeners.size,
          animationFrames: frames.size,
          timeouts: timeouts.size,
          intervals: intervals.size,
          audioContexts,
        }),
      },
      configurable: false,
    });
  });
}

test("owns one complete create, input, pause, release, dispose, and recreate journey", async ({
  page,
}) => {
  await installResourceProbe(page);

  for (let generation = 0; generation < 2; generation += 1) {
    await page.goto("/", { waitUntil: "load" });
    await page.waitForFunction(() => window.__KAMIFUDA_HOST__?.ready === true);
    const baseline = await page.evaluate(
      () => window.__KAMIFUDA_HOST__.resourceBaseline as ResourceSnapshot,
    );
    expect(await page.evaluate(() => window.__KAMIFUDA_DEBUG__.snapshot().player)).toBeNull();

    await page.locator("#startButton").click();
    await page.waitForFunction(() => window.__KAMIFUDA_DEBUG__.snapshot().player !== null);
    const center = await page.evaluate(() => window.__KAMIFUDA_DEBUG__.snapshot().player.nx);
    await page.keyboard.down("ArrowLeft");
    await page.waitForTimeout(120);
    await page.keyboard.up("ArrowLeft");
    await expect
      .poll(() => page.evaluate(() => window.__KAMIFUDA_DEBUG__.snapshot().player.nx))
      .toBeLessThan(center);

    await page.evaluate(() => window.__KAMIFUDA_HOST__.send("lifecycle.pause"));
    const pausedTime = await page.evaluate(() => window.__KAMIFUDA_DEBUG__.snapshot().runTime);
    await page.waitForTimeout(120);
    expect(await page.evaluate(() => window.__KAMIFUDA_DEBUG__.snapshot().runTime)).toBe(
      pausedTime,
    );
    await page.evaluate(() => window.__KAMIFUDA_HOST__.send("input.releaseAll"));
    expect(
      await page.evaluate(() => ({
        left: window.__KAMIFUDA_DEBUG__.input.left,
        right: window.__KAMIFUDA_DEBUG__.input.right,
        active: window.__KAMIFUDA_DEBUG__.input.active,
      })),
    ).toEqual({ left: false, right: false, active: false });

    await page.evaluate(() => window.__KAMIFUDA_HOST__.dispose());
    await expect
      .poll(() => page.evaluate(() => window.__GAMEYARD_RESOURCE_PROBE__.snapshot()))
      .toMatchObject({
        animationFrames: baseline.animationFrames,
        timeouts: baseline.timeouts,
        audioContexts: baseline.audioContexts,
      });
    expect(await page.evaluate(() => window.__KAMIFUDA_DISPOSE_REPORT__)).toMatchObject({
      before: { listeners: expect.any(Number), animationFrames: 0, timers: 0 },
      after: { listeners: 0, animationFrames: 0, timers: 0 },
    });
    expect(
      await page.evaluate(() => window.__KAMIFUDA_DISPOSE_REPORT__.before.listeners),
    ).toBeGreaterThan(0);
    expect(await page.evaluate(() => "__KAMIFUDA_DEBUG__" in window)).toBe(false);
  }

  await page.evaluate(() => {
    window.localStorage.setItem("gameyard.game.kamifuda-runner.profile.v1", "{");
  });
  await page.reload({ waitUntil: "load" });
  await expect(page.locator(".boot-failure")).toContainText("JSON が壊れています");
  await page.getByRole("button", { name: "保存データを明示的に初期化" }).click();
  await page.waitForFunction(() => window.__KAMIFUDA_HOST__?.ready === true);
  expect(
    await page.evaluate(() =>
      window.localStorage.getItem("gameyard.game.kamifuda-runner.profile.v1"),
    ),
  ).not.toBe("{");
});

test("applies exact locales immediately without resetting the run", async ({ page }) => {
  await page.goto("/", { waitUntil: "load" });
  await page.waitForFunction(() => window.__KAMIFUDA_HOST__?.ready === true);
  await expect(page).toHaveTitle("紙札疾走録・百鬼祭陣");
  await page.locator("#settingsButton").click();
  await page.evaluate(() => window.__KAMIFUDA_HOST__.applyLocale("en"));
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page).toHaveTitle("KAMIFUDA RUNNER · Night Parade");
  await expect(page.locator("#settingsTitle")).toHaveText("SETTINGS");
  await expect(page.locator('[data-close="settings"]')).toBeFocused();
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    /woodblock action run/u,
  );
  await page.keyboard.press("Escape");
  await expect(page.locator("#settingsButton")).toBeFocused();

  await page.locator("#startButton").click();
  await expect(page.locator("#gameCanvas")).toBeFocused();
  const before = await page.evaluate(() => {
    const snapshot = window.__KAMIFUDA_DEBUG__.snapshot();
    return { seed: snapshot.seed, runTime: snapshot.runTime, count: snapshot.player.count };
  });
  await expect(page.locator("#gameCanvas")).toHaveAttribute(
    "aria-label",
    "Move left and right, choose paper gates, and repel the night parade",
  );
  const afterEnglish = await page.evaluate(() => {
    const snapshot = window.__KAMIFUDA_DEBUG__.snapshot();
    return { seed: snapshot.seed, runTime: snapshot.runTime, count: snapshot.player.count };
  });
  expect(afterEnglish.seed).toBe(before.seed);
  expect(afterEnglish.count).toBe(before.count);
  expect(afterEnglish.runTime).toBeGreaterThanOrEqual(before.runTime);
  await expect(page.locator("#canvasStatus")).toContainText("Move left and right");

  await page.keyboard.press("Escape");
  await expect(page.locator("#pauseOverlay")).toHaveClass(/is-active/u);
  await expect(page.locator("#resumeButton")).toBeFocused();
  await page.evaluate(() => window.__KAMIFUDA_HOST__.applyLocale("zh-Hans"));
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hans");
  await expect(page).toHaveTitle("纸札疾走录・百鬼祭阵");
  await expect(page.locator("#pauseTitle")).toHaveText("暂歇片刻");
  await expect(page.locator("#resumeButton")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect
    .poll(() => page.evaluate(() => window.__KAMIFUDA_DEBUG__.snapshot().mode))
    .toBe("playing");
  await page.evaluate(() => {
    const debug = window.__KAMIFUDA_DEBUG__;
    debug.endRun(false, "chaff");
    debug.step(0.9);
  });
  await expect(page.locator("#resultTitle")).toHaveText("纸众已经耗尽");
  await expect(page.locator("#retryButton")).toBeFocused();
  await page.evaluate(() => window.__KAMIFUDA_HOST__.applyLocale("en"));
  await expect(page.locator("#resultTitle")).toHaveText("THE PAPER CROWD IS GONE");
  await expect(page.locator("#retryButton")).toBeFocused();
  expect(await page.evaluate(() => window.__KAMIFUDA_DEBUG__.snapshot().seed)).toBe(before.seed);
});

test("requests five Host settings and converges only through a newer apply", async ({ page }) => {
  await page.goto("/", { waitUntil: "load" });
  await page.waitForFunction(() => window.__KAMIFUDA_HOST__?.ready === true);
  await page.locator("#settingsButton").click();
  await page.evaluate(() => {
    window.__KAMIFUDA_HOST__.autoApplySettings = false;
  });

  const master = page.locator("#masterVolume");
  await expect(master).toHaveCSS("pointer-events", "auto");
  await expect(master).toHaveCSS("opacity", "1");
  const masterBox = await master.boundingBox();
  expect(masterBox).not.toBeNull();
  await master.click({ position: { x: masterBox!.width * 0.78, y: masterBox!.height / 2 } });
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__KAMIFUDA_HOST__.events.findLast(
          (event: { type?: string }) => event.type === "settings.changeRequest",
        ),
      ),
    )
    .not.toBeUndefined();
  await expect(page.locator("#settingsStatus")).toContainText("変更を依頼中");
  expect(await page.locator("#masterVolume").inputValue()).toBe("0.56");
  const masterRequest = await page.evaluate(() =>
    window.__KAMIFUDA_HOST__.events.findLast(
      (event: { type?: string }) => event.type === "settings.changeRequest",
    ),
  );
  expect(masterRequest.type).toBe("settings.changeRequest");
  expect(masterRequest.change.audio.master).toBeGreaterThan(0.56);
  const requestedMaster = masterRequest.change.audio.master;

  await page.evaluate(
    (masterValue) =>
      window.__KAMIFUDA_HOST__.applySettings({
        revision: 1,
        audio: { master: masterValue, music: 1, sfx: 1 },
        motion: { reduced: false, screenShake: true },
      }),
    requestedMaster,
  );
  await expect(page.locator("#masterVolume")).toHaveValue(String(requestedMaster));
  await expect(page.locator("#settingsStatus")).toBeEmpty();
  await expect(page.locator("#settingsRevision")).toHaveText("会場設定 · v1");

  const cases = [
    {
      selector: "#musicVolume",
      value: "0.4",
      change: { audio: { music: 0.4 } },
      settings: {
        revision: 2,
        audio: { master: requestedMaster, music: 0.4, sfx: 1 },
        motion: { reduced: false, screenShake: true },
      },
    },
    {
      selector: "#sfxVolume",
      value: "0.3",
      change: { audio: { sfx: 0.3 } },
      settings: {
        revision: 3,
        audio: { master: requestedMaster, music: 0.4, sfx: 0.3 },
        motion: { reduced: false, screenShake: true },
      },
    },
  ];
  for (const item of cases) {
    await page.locator(item.selector).fill(item.value);
    await page.locator(item.selector).dispatchEvent("change");
    expect(
      await page.evaluate(() =>
        window.__KAMIFUDA_HOST__.events.findLast(
          (event: { type?: string }) => event.type === "settings.changeRequest",
        ),
      ),
    ).toEqual({ type: "settings.changeRequest", change: item.change });
    await page.evaluate(
      (settings) => window.__KAMIFUDA_HOST__.applySettings(settings),
      item.settings,
    );
    await expect(page.locator(item.selector)).toHaveValue(item.value);
    await expect(page.locator(item.selector)).toBeEnabled();
  }

  await expect(page.locator("#motionToggle")).toBeEnabled();
  await page.locator("#motionToggle").evaluate((input: HTMLInputElement) => input.click());
  expect(
    await page.evaluate(() =>
      window.__KAMIFUDA_HOST__.events.findLast(
        (event: { type?: string }) => event.type === "settings.changeRequest",
      ),
    ),
  ).toEqual({ type: "settings.changeRequest", change: { motion: { reduced: true } } });
  await page.evaluate(
    (masterValue) =>
      window.__KAMIFUDA_HOST__.applySettings({
        revision: 4,
        audio: { master: masterValue, music: 0.4, sfx: 0.3 },
        motion: { reduced: true, screenShake: true },
      }),
    requestedMaster,
  );

  await expect(page.locator("#screenShakeToggle")).toBeEnabled();
  await page.locator("#screenShakeToggle").evaluate((input: HTMLInputElement) => input.click());
  expect(
    await page.evaluate(() =>
      window.__KAMIFUDA_HOST__.events.findLast(
        (event: { type?: string }) => event.type === "settings.changeRequest",
      ),
    ),
  ).toEqual({ type: "settings.changeRequest", change: { motion: { screenShake: false } } });
  await page.evaluate(
    (masterValue) =>
      window.__KAMIFUDA_HOST__.applySettings({
        revision: 5,
        audio: { master: masterValue, music: 0.4, sfx: 0.3 },
        motion: { reduced: true, screenShake: false },
      }),
    requestedMaster,
  );

  await expect(page.locator("#motionToggle")).toBeEnabled();
  await page.locator("#motionToggle").evaluate((input: HTMLInputElement) => input.click());
  await page.evaluate(
    (masterValue) =>
      window.__KAMIFUDA_HOST__.applySettings({
        revision: 6,
        audio: { master: masterValue, music: 0.4, sfx: 0.3 },
        motion: { reduced: true, screenShake: false },
      }),
    requestedMaster,
  );
  await expect(page.locator("#settingsStatus")).toContainText("適用しませんでした");
  await page.evaluate(() => window.__KAMIFUDA_HOST__.applyLocale("en"));
  await expect(page.locator("#settingsStatus")).toContainText("did not apply");
});

test("traps and restores dialog focus and keeps drawers reachable at target sizes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "load" });
  await page.waitForFunction(() => window.__KAMIFUDA_HOST__?.ready === true);
  await page.locator("#settingsButton").focus();
  await page.locator("#settingsButton").click();
  await expect(page.locator('[data-close="settings"]')).toBeFocused();
  const portraitBox = await page.locator("#settingsOverlay .drawer-card").boundingBox();
  expect(portraitBox).not.toBeNull();
  expect(portraitBox!.x).toBeGreaterThanOrEqual(0);
  expect(portraitBox!.y).toBeGreaterThanOrEqual(0);
  expect(portraitBox!.x + portraitBox!.width).toBeLessThanOrEqual(390);
  expect(portraitBox!.y + portraitBox!.height).toBeLessThanOrEqual(844);
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator("#resetButton")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator('[data-close="settings"]')).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("#settingsButton")).toBeFocused();

  await page.setViewportSize({ width: 844, height: 390 });
  const startBox = await page.locator("#startButton").boundingBox();
  expect(startBox).not.toBeNull();
  expect(startBox!.x).toBeGreaterThanOrEqual(0);
  expect(startBox!.y).toBeGreaterThanOrEqual(0);
  expect(startBox!.x + startBox!.width).toBeLessThanOrEqual(844);
  expect(startBox!.y + startBox!.height).toBeLessThanOrEqual(390);
  const landscapeExtent = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(landscapeExtent.scrollWidth).toBeLessThanOrEqual(landscapeExtent.viewportWidth);
  await page.locator("#settingsButton").click();
  const landscapeBox = await page.locator("#settingsOverlay .drawer-card").boundingBox();
  expect(landscapeBox).not.toBeNull();
  expect(landscapeBox!.x).toBeGreaterThanOrEqual(0);
  expect(landscapeBox!.y).toBeGreaterThanOrEqual(0);
  expect(landscapeBox!.x + landscapeBox!.width).toBeLessThanOrEqual(844);
  expect(landscapeBox!.y + landscapeBox!.height).toBeLessThanOrEqual(390);
  await page.keyboard.press("Escape");

  await page.setViewportSize({ width: 195, height: 422 });
  await page.locator("#settingsButton").click();
  await page.locator("#resetButton").scrollIntoViewIfNeeded();
  await expect(page.locator("#resetButton")).toBeVisible();
});

test("keeps non-catalog CJK literals on the explicit ornamental allowlist", async () => {
  const source = await readFile(new URL("../guest/src/simulation.js", import.meta.url), "utf8");
  const violations = source
    .split(/\r?\n/u)
    .map((line, index) => ({ line: index + 1, text: line.trim() }))
    .filter(({ text }) => /[ぁ-んァ-ン一-龯]/u.test(text))
    .filter(({ text }) => !text.includes("i18n-allow-ornament"));
  expect(violations).toEqual([]);
});

declare global {
  interface Window {
    __KAMIFUDA_DEBUG__: any;
    __KAMIFUDA_HOST__: any;
    __KAMIFUDA_DISPOSE_REPORT__: {
      before: { listeners: number; animationFrames: number; timers: number };
      after: { listeners: number; animationFrames: number; timers: number };
    };
    __GAMEYARD_RESOURCE_PROBE__: { snapshot(): ResourceSnapshot };
  }
}
