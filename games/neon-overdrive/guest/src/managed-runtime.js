export class ManagedRuntime {
  #window;
  #listeners = new Set();
  #timers = new Set();
  #frameCallback = null;
  #frameId = null;
  #paused = true;
  #disposed = false;
  #inputEnabled = false;

  constructor(targetWindow) {
    this.#window = targetWindow;
  }

  get paused() {
    return this.#paused;
  }

  get inputEnabled() {
    return this.#inputEnabled;
  }

  listen(target, type, listener, options) {
    this.#assertActive();
    target.addEventListener(type, listener, options);
    const record = { target, type, listener, options };
    this.#listeners.add(record);
    return () => {
      if (!this.#listeners.delete(record)) return;
      target.removeEventListener(type, listener, options);
    };
  }

  timeout(callback, delayMs) {
    this.#assertActive();
    if (!Number.isFinite(delayMs) || delayMs < 0) {
      throw new RangeError("Managed timer delay must be finite and nonnegative.");
    }
    const record = { id: 0 };
    record.id = this.#window.setTimeout(() => {
      this.#timers.delete(record);
      callback();
    }, delayMs);
    this.#timers.add(record);
    return () => {
      if (this.#timers.delete(record)) this.#window.clearTimeout(record.id);
    };
  }

  startFrameLoop(callback) {
    this.#assertActive();
    if (this.#frameCallback !== null) throw new Error("Neon frame loop is already owned.");
    this.#frameCallback = callback;
    if (!this.#paused) this.#scheduleFrame();
  }

  setInputEnabled(enabled) {
    this.#assertActive();
    if (typeof enabled !== "boolean") throw new TypeError("Input enabled must be boolean.");
    this.#inputEnabled = enabled;
  }

  pause() {
    if (this.#disposed || this.#paused) return;
    this.#paused = true;
    if (this.#frameId !== null) this.#window.cancelAnimationFrame(this.#frameId);
    this.#frameId = null;
  }

  resume() {
    this.#assertActive();
    if (!this.#paused) return;
    this.#paused = false;
    if (this.#frameCallback !== null) this.#scheduleFrame();
  }

  snapshotResources() {
    return {
      listeners: this.#listeners.size,
      timers: this.#timers.size,
      animationFrames: this.#frameId === null ? 0 : 1,
    };
  }

  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#paused = true;
    this.#inputEnabled = false;
    if (this.#frameId !== null) this.#window.cancelAnimationFrame(this.#frameId);
    this.#frameId = null;
    this.#frameCallback = null;
    for (const timer of this.#timers) this.#window.clearTimeout(timer.id);
    this.#timers.clear();
    for (const record of this.#listeners) {
      record.target.removeEventListener(record.type, record.listener, record.options);
    }
    this.#listeners.clear();
  }

  #scheduleFrame() {
    if (this.#disposed || this.#paused || this.#frameCallback === null || this.#frameId !== null) {
      return;
    }
    this.#frameId = this.#window.requestAnimationFrame((timestamp) => {
      this.#frameId = null;
      if (this.#disposed || this.#paused || this.#frameCallback === null) return;
      this.#frameCallback(timestamp);
      this.#scheduleFrame();
    });
  }

  #assertActive() {
    if (this.#disposed) throw new Error("Neon runtime resources are disposed.");
  }
}
