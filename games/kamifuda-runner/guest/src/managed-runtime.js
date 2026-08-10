export class ManagedRuntime {
  #window;
  #listeners = new Set();
  #frameCallback = null;
  #frameId = null;
  #paused = true;
  #disposed = false;
  #inputEnabled = false;

  constructor(targetWindow) {
    this.#window = targetWindow;
  }

  get inputEnabled() {
    return this.#inputEnabled;
  }

  get paused() {
    return this.#paused;
  }

  snapshotResources() {
    return {
      listeners: this.#listeners.size,
      animationFrames: this.#frameId === null ? 0 : 1,
      timers: 0,
    };
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

  startFrameLoop(callback) {
    this.#assertActive();
    if (this.#frameCallback !== null) throw new Error("Kamifuda frame loop is already owned.");
    this.#frameCallback = callback;
    if (!this.#paused) this.#scheduleFrame();
  }

  setInputEnabled(enabled) {
    this.#assertActive();
    this.#inputEnabled = enabled === true;
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

  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#paused = true;
    this.#inputEnabled = false;
    if (this.#frameId !== null) this.#window.cancelAnimationFrame(this.#frameId);
    this.#frameId = null;
    this.#frameCallback = null;
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
    if (this.#disposed) throw new Error("Kamifuda runtime resources are disposed.");
  }
}
