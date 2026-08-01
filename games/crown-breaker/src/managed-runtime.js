export class ManagedRuntime {
  constructor(targetWindow) {
    this.window = targetWindow;
    this.paused = true;
    this.disposed = false;
    this.inputEnabled = false;
    this.nextId = 1;
    this.timers = new Map();
    this.frames = new Map();
    this.listeners = new Set();
  }

  setInputEnabled(enabled) {
    this.assertActive();
    this.inputEnabled = enabled === true;
  }

  setTimeout(callback, delay = 0) {
    return this.createTimer(callback, delay, false);
  }

  clearTimeout(id) {
    this.clearTimer(id);
  }

  setInterval(callback, interval) {
    if (typeof interval !== "number" || !Number.isFinite(interval) || interval <= 0) {
      throw new RangeError("Managed interval must be a finite positive number.");
    }
    return this.createTimer(callback, interval, true);
  }

  clearInterval(id) {
    this.clearTimer(id);
  }

  requestAnimationFrame(callback) {
    this.assertActive();
    const id = this.nextId++;
    const frame = { id, callback, nativeId: null };
    this.frames.set(id, frame);
    if (!this.paused) this.scheduleFrame(frame);
    return id;
  }

  cancelAnimationFrame(id) {
    const frame = this.frames.get(id);
    if (!frame) return;
    if (frame.nativeId !== null) this.window.cancelAnimationFrame(frame.nativeId);
    this.frames.delete(id);
  }

  listen(target, type, listener, options, input = false) {
    this.assertActive();
    const wrapped = (event) => {
      if (this.disposed || (input && (this.paused || !this.inputEnabled))) return;
      listener(event);
    };
    target.addEventListener(type, wrapped, options);
    const record = { target, type, wrapped, options };
    this.listeners.add(record);
    return () => {
      if (!this.listeners.delete(record)) return;
      target.removeEventListener(type, wrapped, options);
    };
  }

  pause() {
    if (this.disposed || this.paused) return;
    this.paused = true;
    const current = this.window.performance.now();
    for (const timer of this.timers.values()) {
      if (timer.nativeId === null) continue;
      this.window.clearTimeout(timer.nativeId);
      timer.nativeId = null;
      timer.remaining = Math.max(0, timer.deadline - current);
    }
    for (const frame of this.frames.values()) {
      if (frame.nativeId === null) continue;
      this.window.cancelAnimationFrame(frame.nativeId);
      frame.nativeId = null;
    }
  }

  resume() {
    this.assertActive();
    if (!this.paused) return;
    this.paused = false;
    for (const timer of this.timers.values()) this.scheduleTimer(timer);
    for (const frame of this.frames.values()) this.scheduleFrame(frame);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.paused = true;
    for (const timer of this.timers.values()) {
      if (timer.nativeId !== null) this.window.clearTimeout(timer.nativeId);
    }
    this.timers.clear();
    for (const frame of this.frames.values()) {
      if (frame.nativeId !== null) this.window.cancelAnimationFrame(frame.nativeId);
    }
    this.frames.clear();
    for (const record of this.listeners) {
      record.target.removeEventListener(record.type, record.wrapped, record.options);
    }
    this.listeners.clear();
  }

  snapshot() {
    return {
      timers: this.timers.size,
      frames: this.frames.size,
      listeners: this.listeners.size,
      paused: this.paused,
      disposed: this.disposed,
    };
  }

  createTimer(callback, delay, repeating) {
    this.assertActive();
    if (typeof delay !== "number" || !Number.isFinite(delay) || delay < 0) {
      throw new RangeError("Managed timeout delay must be a finite non-negative number.");
    }
    const normalizedDelay = delay;
    const id = this.nextId++;
    const timer = {
      id,
      callback,
      repeating,
      interval: normalizedDelay,
      remaining: normalizedDelay,
      deadline: 0,
      nativeId: null,
    };
    this.timers.set(id, timer);
    if (!this.paused) this.scheduleTimer(timer);
    return id;
  }

  clearTimer(id) {
    const timer = this.timers.get(id);
    if (!timer) return;
    if (timer.nativeId !== null) this.window.clearTimeout(timer.nativeId);
    this.timers.delete(id);
  }

  scheduleTimer(timer) {
    if (this.disposed || this.paused || timer.nativeId !== null) return;
    timer.deadline = this.window.performance.now() + timer.remaining;
    timer.nativeId = this.window.setTimeout(() => {
      timer.nativeId = null;
      if (!this.timers.has(timer.id) || this.disposed || this.paused) return;
      if (!timer.repeating) this.timers.delete(timer.id);
      else timer.remaining = timer.interval;
      timer.callback();
      if (timer.repeating && this.timers.has(timer.id)) this.scheduleTimer(timer);
    }, timer.remaining);
  }

  scheduleFrame(frame) {
    if (this.disposed || this.paused || frame.nativeId !== null) return;
    frame.nativeId = this.window.requestAnimationFrame((timestamp) => {
      frame.nativeId = null;
      if (!this.frames.delete(frame.id) || this.disposed || this.paused) return;
      frame.callback(timestamp);
    });
  }

  assertActive() {
    if (this.disposed) throw new Error("Managed runtime is disposed.");
  }
}
