import { expect, test } from "@playwright/test";

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
  await expect(page.locator(".boot-failure")).toContainText("not valid JSON");
  await page.getByRole("button", { name: "保存データを明示的に初期化" }).click();
  await page.waitForFunction(() => window.__KAMIFUDA_HOST__?.ready === true);
  expect(
    await page.evaluate(() =>
      window.localStorage.getItem("gameyard.game.kamifuda-runner.profile.v1"),
    ),
  ).not.toBe("{");
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
