import type { Page } from "@playwright/test";

export type BrowserResourceSnapshot = {
  listeners: number;
  animationFrames: number;
  timeouts: number;
  intervals: number;
  audioContexts: number;
  gamepadPolls: number;
  pointerCaptures: number;
  storageReads: number;
  storageWrites: number;
};

export async function installResourceProbe(page: Page): Promise<void> {
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

    // eslint-disable-next-line typescript/unbound-method -- invoked through Reflect.apply.
    const nativeAdd = EventTarget.prototype.addEventListener;
    // eslint-disable-next-line typescript/unbound-method -- invoked through Reflect.apply.
    const nativeRemove = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function (type, listener, options) {
      if (listener) listeners.add(listenerKey(this, type, listener, options));
      Reflect.apply(nativeAdd, this, [type, listener, options]);
    };
    EventTarget.prototype.removeEventListener = function (type, listener, options) {
      if (listener) listeners.delete(listenerKey(this, type, listener, options));
      Reflect.apply(nativeRemove, this, [type, listener, options]);
    };

    const animationFrames = new Set<number>();
    const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
    const nativeCancelAnimationFrame = window.cancelAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => {
      let id = 0;
      id = nativeRequestAnimationFrame((timestamp) => {
        animationFrames.delete(id);
        callback(timestamp);
      });
      animationFrames.add(id);
      return id;
    };
    window.cancelAnimationFrame = (id) => {
      animationFrames.delete(id);
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
      const trackedContexts = new WeakSet<AudioContext>();
      const closedContexts = new WeakSet<AudioContext>();
      // eslint-disable-next-line typescript/unbound-method -- invoked through Reflect.apply.
      const nativeClose = NativeAudioContext.prototype.close;
      NativeAudioContext.prototype.close = async function () {
        const result = await Reflect.apply(nativeClose, this, []);
        if (trackedContexts.has(this) && !closedContexts.has(this)) {
          closedContexts.add(this);
          audioContexts -= 1;
        }
        return result;
      };
      window.AudioContext = new Proxy(NativeAudioContext, {
        construct(target, argumentsList) {
          const context = Reflect.construct(target, argumentsList, target);
          trackedContexts.add(context);
          audioContexts += 1;
          return context;
        },
      });
    }

    let gamepadPolls = 0;
    const nativeGetGamepads = navigator.getGamepads.bind(navigator);
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: () => {
        gamepadPolls += 1;
        return nativeGetGamepads();
      },
    });

    const pointerCaptures = new Set<string>();
    // eslint-disable-next-line typescript/unbound-method -- invoked through Reflect.apply.
    const nativeSetPointerCapture = Element.prototype.setPointerCapture;
    // eslint-disable-next-line typescript/unbound-method -- invoked through Reflect.apply.
    const nativeReleasePointerCapture = Element.prototype.releasePointerCapture;
    Element.prototype.setPointerCapture = function (pointerId) {
      pointerCaptures.add(`${idFor(targetIds, this, () => nextTargetId++)}:${pointerId}`);
      Reflect.apply(nativeSetPointerCapture, this, [pointerId]);
    };
    Element.prototype.releasePointerCapture = function (pointerId) {
      pointerCaptures.delete(`${idFor(targetIds, this, () => nextTargetId++)}:${pointerId}`);
      Reflect.apply(nativeReleasePointerCapture, this, [pointerId]);
    };

    let storageReads = 0;
    let storageWrites = 0;
    // eslint-disable-next-line typescript/unbound-method -- invoked through Reflect.apply.
    const nativeGetItem = Storage.prototype.getItem;
    // eslint-disable-next-line typescript/unbound-method -- invoked through Reflect.apply.
    const nativeSetItem = Storage.prototype.setItem;
    // eslint-disable-next-line typescript/unbound-method -- invoked through Reflect.apply.
    const nativeRemoveItem = Storage.prototype.removeItem;
    // eslint-disable-next-line typescript/unbound-method -- invoked through Reflect.apply.
    const nativeClear = Storage.prototype.clear;
    Storage.prototype.getItem = function (key) {
      storageReads += 1;
      return Reflect.apply(nativeGetItem, this, [key]);
    };
    Storage.prototype.setItem = function (key, value) {
      storageWrites += 1;
      Reflect.apply(nativeSetItem, this, [key, value]);
    };
    Storage.prototype.removeItem = function (key) {
      storageWrites += 1;
      Reflect.apply(nativeRemoveItem, this, [key]);
    };
    Storage.prototype.clear = function () {
      storageWrites += 1;
      Reflect.apply(nativeClear, this, []);
    };

    Object.defineProperty(window, "__GAMEYARD_RESOURCE_PROBE__", {
      configurable: false,
      value: {
        snapshot: () => ({
          listeners: listeners.size,
          animationFrames: animationFrames.size,
          timeouts: timeouts.size,
          intervals: intervals.size,
          audioContexts,
          gamepadPolls,
          pointerCaptures: pointerCaptures.size,
          storageReads,
          storageWrites,
        }),
      },
    });
  });
}
