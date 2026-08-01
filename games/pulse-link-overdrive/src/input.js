(() => {
  "use strict";
  const PLO = window.PLO;
  const { clamp } = PLO.util;

  const KEY_MAP = Object.freeze({
    ArrowLeft: "left",
    KeyA: "left",
    ArrowRight: "right",
    KeyD: "right",
    ArrowDown: "softDrop",
    KeyS: "softDrop",
    ArrowUp: "rotateCW",
    KeyX: "rotateCW",
    KeyK: "rotateCW",
    KeyZ: "rotateCCW",
    KeyJ: "rotateCCW",
    Space: "hardDrop",
    KeyC: "attack",
    KeyL: "attack",
    KeyV: "defense",
    Semicolon: "defense",
    Escape: "pause",
    KeyP: "pause",
    Enter: "confirm",
  });

  class InputManager {
    constructor(canvas, touchRoot, bus, resources) {
      this.canvas = canvas;
      this.touchRoot = touchRoot;
      this.bus = bus;
      this.resources = resources;
      this.down = new Map();
      this.pressed = new Set();
      this.released = new Set();
      this.sourceCounts = new Map();
      this.enabled = true;
      this.active = true;
      this.pointer = null;
      this.gamepadPrev = {};
      this.onCanvasTap = null;
      this.onCanvasDrag = null;
      this.bound = {};
      this.unlisten = [];
      this.bind();
    }

    listen(target, type, listener) {
      this.unlisten.push(this.resources.listen(target, type, listener));
    }

    bind() {
      this.bound.keydown = (event) => {
        if (!this.enabled) return;
        const action = KEY_MAP[event.code];
        if (!action) return;
        const interactive =
          event.target instanceof Element &&
          !!event.target.closest("button,input,select,textarea,a[href]");
        if (action === "confirm" && interactive) return;
        if (this.active || ["pause", "confirm"].includes(action)) event.preventDefault();
        if (!event.repeat) this.press(action, `key:${event.code}`);
      };
      this.bound.keyup = (event) => {
        const action = KEY_MAP[event.code];
        if (!action) return;
        this.release(action, `key:${event.code}`);
      };
      this.listen(window, "keydown", this.bound.keydown);
      this.listen(window, "keyup", this.bound.keyup);

      if (this.touchRoot) {
        this.bound.touchDown = (event) => {
          if (!this.enabled) return;
          const button = event.target.closest("[data-action]");
          if (!button) return;
          event.preventDefault();
          const action = button.dataset.action;
          button.setPointerCapture?.(event.pointerId);
          button.classList.add("is-pressed");
          this.press(action, `touch:${event.pointerId}:${action}`);
        };
        this.bound.touchUp = (event) => {
          const button =
            event.target.closest("[data-action]") ||
            this.touchRoot.querySelector(".touch-key.is-pressed");
          if (!button) return;
          const action = button.dataset.action;
          button.classList.remove("is-pressed");
          this.release(action, `touch:${event.pointerId}:${action}`);
        };
        this.listen(this.touchRoot, "pointerdown", this.bound.touchDown);
        this.listen(this.touchRoot, "pointerup", this.bound.touchUp);
        this.listen(this.touchRoot, "pointercancel", this.bound.touchUp);
        this.listen(this.touchRoot, "lostpointercapture", this.bound.touchUp);
      }

      this.bound.canvasDown = (event) => {
        if (!this.enabled || !this.active) return;
        const p = this.toCanvasPoint(event);
        this.pointer = {
          id: event.pointerId,
          startX: p.x,
          startY: p.y,
          x: p.x,
          y: p.y,
          time: performance.now(),
          moved: false,
        };
        this.canvas.setPointerCapture?.(event.pointerId);
      };
      this.bound.canvasMove = (event) => {
        if (!this.pointer || this.pointer.id !== event.pointerId) return;
        const p = this.toCanvasPoint(event);
        const dx = p.x - this.pointer.startX;
        const dy = p.y - this.pointer.startY;
        this.pointer.x = p.x;
        this.pointer.y = p.y;
        if (Math.hypot(dx, dy) > 10) this.pointer.moved = true;
        this.onCanvasDrag?.({ ...this.pointer, dx, dy });
      };
      this.bound.canvasUp = (event) => {
        if (!this.pointer || this.pointer.id !== event.pointerId) return;
        const p = this.toCanvasPoint(event);
        const dx = p.x - this.pointer.startX;
        const dy = p.y - this.pointer.startY;
        const elapsed = performance.now() - this.pointer.time;
        const distance = Math.hypot(dx, dy);
        const start = this.pointer;
        this.pointer = null;

        if (distance < 18 && elapsed < 420) {
          if (!this.onCanvasTap?.(p.x, p.y, event)) this.tapRotate();
          return;
        }
        if (Math.abs(dy) > Math.abs(dx) * 1.15 && dy > 36) {
          this.pulse("hardDrop", `swipe:${event.pointerId}`);
          return;
        }
        if (Math.abs(dx) > 28) {
          const action = dx < 0 ? "left" : "right";
          const steps = clamp(Math.round(Math.abs(dx) / 42), 1, 5);
          for (let i = 0; i < steps; i++) this.pulse(action, `swipe:${event.pointerId}:${i}`);
          return;
        }
        if (elapsed < 500 && !start.moved) this.tapRotate();
      };
      this.bound.canvasCancel = (event) => {
        if (this.pointer?.id === event.pointerId) this.pointer = null;
      };
      this.listen(this.canvas, "pointerdown", this.bound.canvasDown);
      this.listen(this.canvas, "pointermove", this.bound.canvasMove);
      this.listen(this.canvas, "pointerup", this.bound.canvasUp);
      this.listen(this.canvas, "pointercancel", this.bound.canvasCancel);
      this.listen(this.canvas, "contextmenu", (e) => e.preventDefault());

      this.bound.blur = () => this.clearAll();
      this.listen(window, "blur", this.bound.blur);
    }

    tapRotate() {
      this.pulse("rotateCW", `tap:${performance.now()}`);
    }

    toCanvasPoint(event) {
      const rect = this.canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    press(action, source = "virtual") {
      if (!this.enabled) return;
      const key = `${action}|${source}`;
      if (this.sourceCounts.has(key)) return;
      this.sourceCounts.set(key, true);
      const count = this.down.get(action) || 0;
      this.down.set(action, count + 1);
      if (count === 0) {
        this.pressed.add(action);
        this.bus?.emit("input", { action, phase: "press", source });
      }
    }

    release(action, source = "virtual") {
      const key = `${action}|${source}`;
      if (!this.sourceCounts.has(key)) return;
      this.sourceCounts.delete(key);
      const count = Math.max(0, (this.down.get(action) || 0) - 1);
      if (count === 0) {
        this.down.delete(action);
        this.released.add(action);
        this.bus?.emit("input", { action, phase: "release", source });
      } else this.down.set(action, count);
    }

    pulse(action, source = "pulse") {
      if (!this.enabled) return;
      const token = `${source}:${Math.random()}`;
      this.press(action, token);
      queueMicrotask(() => this.release(action, token));
    }

    isDown(action) {
      return (this.down.get(action) || 0) > 0;
    }
    justPressed(action) {
      return this.pressed.has(action);
    }
    justReleased(action) {
      return this.released.has(action);
    }
    consume(action) {
      if (!this.pressed.has(action)) return false;
      this.pressed.delete(action);
      return true;
    }

    updateGamepads() {
      if (!this.enabled) {
        this.clearAll();
        return;
      }
      const pads = navigator.getGamepads?.() || [];
      const pad = [...pads].find(Boolean);
      if (!pad) {
        for (const action of Object.keys(this.gamepadPrev)) {
          if (this.gamepadPrev[action]) this.release(action, `gamepad:${action}`);
        }
        this.gamepadPrev = {};
        return;
      }
      const axisX = pad.axes?.[0] || 0;
      const axisY = pad.axes?.[1] || 0;
      const state = {
        left: axisX < -0.45 || !!pad.buttons?.[14]?.pressed,
        right: axisX > 0.45 || !!pad.buttons?.[15]?.pressed,
        softDrop: axisY > 0.55 || !!pad.buttons?.[13]?.pressed,
        rotateCW: !!pad.buttons?.[0]?.pressed,
        rotateCCW: !!pad.buttons?.[2]?.pressed,
        hardDrop: !!pad.buttons?.[3]?.pressed || !!pad.buttons?.[12]?.pressed,
        attack: !!pad.buttons?.[5]?.pressed,
        defense: !!pad.buttons?.[4]?.pressed,
        pause: !!pad.buttons?.[9]?.pressed,
        confirm: !!pad.buttons?.[0]?.pressed,
      };
      for (const [action, down] of Object.entries(state)) {
        const was = !!this.gamepadPrev[action];
        if (down && !was) this.press(action, `gamepad:${action}`);
        else if (!down && was) this.release(action, `gamepad:${action}`);
      }
      this.gamepadPrev = state;
    }

    endFrame() {
      this.pressed.clear();
      this.released.clear();
    }

    clearAll() {
      for (const action of this.down.keys()) this.released.add(action);
      this.down.clear();
      this.sourceCounts.clear();
      this.gamepadPrev = {};
      for (const button of this.touchRoot?.querySelectorAll(".is-pressed") || [])
        button.classList.remove("is-pressed");
    }

    destroy() {
      for (const unlisten of this.unlisten.splice(0)) unlisten();
      this.clearAll();
      this.onCanvasTap = null;
      this.onCanvasDrag = null;
    }

    setEnabled(enabled) {
      this.enabled = enabled;
      if (!enabled) this.clearAll();
    }
  }

  PLO.InputManager = InputManager;
})();
