const MOVEMENT_CODES = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "KeyA",
  "KeyD",
  "KeyW",
  "KeyS",
]);
const FOCUS_CODES = new Set(["ShiftLeft", "ShiftRight", "KeyX"]);
const DROP_CODES = new Set(["Space", "Enter", "KeyZ"]);
const PAUSE_CODES = new Set(["Escape", "KeyP"]);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function createInput({
  targetWindow,
  canvas,
  runtime,
  onCommand,
  onActivate,
  onPauseRequest,
  getPlayerPosition,
  onPresentationChange,
}) {
  if (typeof onPresentationChange !== "function") {
    throw new TypeError("Neon input requires an explicit presentation change port.");
  }
  const keys = new Set();
  const pointer = {
    active: false,
    id: null,
    x: 270,
    y: 768,
    type: "mouse",
    inside: false,
    offsetX: 0,
    offsetY: 0,
    secondaryFocus: false,
  };
  let inputEnabled = false;
  let disposed = false;
  let previousGamepad = { drop: false, pause: false };
  let gamepadEdgesArmed = false;
  const primaryCoarseQuery = targetWindow.matchMedia("(pointer: coarse)");
  let presentation = Object.freeze({
    device: "keyboard",
    touchControls: primaryCoarseQuery.matches,
  });

  function publishPresentation(device, touchControls) {
    if (presentation.device === device && presentation.touchControls === touchControls) return;
    presentation = Object.freeze({ device, touchControls });
    onPresentationChange(presentation);
  }

  function setActiveDevice(device) {
    if (!["keyboard", "pointer", "touch", "gamepad"].includes(device)) {
      throw new RangeError(`Unknown Neon input presentation device: ${device}`);
    }
    publishPresentation(device, device === "touch" || primaryCoarseQuery.matches);
  }

  function handleCapabilityChange() {
    publishPresentation(
      presentation.device,
      presentation.device === "touch" || primaryCoarseQuery.matches,
    );
  }

  const disposePrimaryCapability = runtime.listen(
    primaryCoarseQuery,
    "change",
    handleCapabilityChange,
  );

  function isInteractive(target) {
    return (
      target instanceof targetWindow.HTMLElement && Boolean(target.closest("button,input,select"))
    );
  }

  function releasePointerCapture() {
    if (pointer.id !== null && canvas.hasPointerCapture(pointer.id)) {
      canvas.releasePointerCapture(pointer.id);
    }
  }

  function pointerPosition(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: clamp(((event.clientX - rect.left) / rect.width) * 540, 18, 522),
      y: clamp(((event.clientY - rect.top) / rect.height) * 960, 28, 932),
    };
  }

  function updatePointer(event) {
    const position = pointerPosition(event);
    pointer.x = position.x;
    pointer.y = position.y;
    pointer.type = event.pointerType === "touch" ? "touch" : "mouse";
    pointer.inside = true;
    setActiveDevice(pointer.type === "touch" ? "touch" : "pointer");
  }

  runtime.listen(
    targetWindow,
    "keydown",
    (event) => {
      if (!inputEnabled || (isInteractive(event.target) && event.code !== "Escape")) return;
      if (MOVEMENT_CODES.has(event.code) || DROP_CODES.has(event.code)) event.preventDefault();
      onActivate();
      setActiveDevice("keyboard");
      if (!keys.has(event.code)) {
        if (DROP_CODES.has(event.code)) onCommand({ type: "drop", active: true });
        if (PAUSE_CODES.has(event.code)) onPauseRequest();
      }
      keys.add(event.code);
    },
    { passive: false },
  );

  runtime.listen(targetWindow, "keyup", (event) => {
    keys.delete(event.code);
    if (DROP_CODES.has(event.code)) onCommand({ type: "drop", active: false });
  });

  runtime.listen(targetWindow, "blur", releaseAll);

  runtime.listen(
    canvas,
    "pointerenter",
    (event) => {
      if (!inputEnabled) return;
      updatePointer(event);
    },
    { passive: true },
  );

  runtime.listen(canvas, "pointerleave", () => {
    if (!pointer.active) pointer.inside = false;
  });

  runtime.listen(
    canvas,
    "pointerdown",
    (event) => {
      if (!inputEnabled) return;
      event.preventDefault();
      onActivate();
      setActiveDevice(event.pointerType === "touch" ? "touch" : "pointer");
      releasePointerCapture();
      pointer.active = true;
      pointer.id = event.pointerId;
      updatePointer(event);
      if (pointer.type === "touch") {
        const player = getPlayerPosition();
        pointer.offsetX = player.x - pointer.x;
        pointer.offsetY = player.y - pointer.y;
      } else {
        pointer.offsetX = 0;
        pointer.offsetY = 0;
      }
      canvas.setPointerCapture(event.pointerId);
      if (pointer.type !== "touch" && event.button === 2) {
        pointer.secondaryFocus = true;
      }
    },
    { passive: false },
  );

  runtime.listen(canvas, "pointermove", (event) => {
    if (!inputEnabled || (pointer.active && pointer.id !== event.pointerId)) return;
    updatePointer(event);
  });

  const endPointer = (event) => {
    if (pointer.id !== event.pointerId) return;
    updatePointer(event);
    releasePointerCapture();
    pointer.active = false;
    pointer.id = null;
    if (pointer.type !== "touch" && event.button === 0) {
      onCommand({ type: "drop", active: true });
      onCommand({ type: "drop", active: false });
    }
    pointer.secondaryFocus = false;
  };
  runtime.listen(canvas, "pointerup", endPointer);
  runtime.listen(canvas, "pointercancel", endPointer);
  runtime.listen(canvas, "contextmenu", (event) => event.preventDefault());

  function pollGamepad() {
    if (!inputEnabled || disposed) return { x: 0, y: 0, focus: false };
    const pads = targetWindow.navigator.getGamepads();
    const pad = Array.from(pads).find((candidate) => candidate?.connected);
    if (!pad) {
      previousGamepad = { drop: false, pause: false };
      gamepadEdgesArmed = false;
      return { x: 0, y: 0, focus: false };
    }
    const deadzone = 0.18;
    const axisX = Math.abs(pad.axes[0] ?? 0) >= deadzone ? pad.axes[0] : 0;
    const axisY = Math.abs(pad.axes[1] ?? 0) >= deadzone ? pad.axes[1] : 0;
    const x = clamp(
      axisX + (pad.buttons[15]?.pressed ? 1 : 0) - (pad.buttons[14]?.pressed ? 1 : 0),
      -1,
      1,
    );
    const y = clamp(
      axisY + (pad.buttons[13]?.pressed ? 1 : 0) - (pad.buttons[12]?.pressed ? 1 : 0),
      -1,
      1,
    );
    const drop = Boolean(pad.buttons[0]?.pressed || (pad.buttons[7]?.value ?? 0) > 0.55);
    const pause = Boolean(pad.buttons[9]?.pressed);
    const focus = Boolean(pad.buttons[4]?.pressed || (pad.buttons[6]?.value ?? 0) > 0.55);
    if (x !== 0 || y !== 0 || drop || pause || focus) setActiveDevice("gamepad");
    if (!gamepadEdgesArmed) {
      if (!drop && !pause) gamepadEdgesArmed = true;
    } else {
      if (drop !== previousGamepad.drop) onCommand({ type: "drop", active: drop });
      if (pause && !previousGamepad.pause) onPauseRequest();
    }
    previousGamepad = { drop, pause };
    return { x, y, focus };
  }

  function movement() {
    const keyboard = {
      x:
        (keys.has("ArrowRight") || keys.has("KeyD") ? 1 : 0) -
        (keys.has("ArrowLeft") || keys.has("KeyA") ? 1 : 0),
      y:
        (keys.has("ArrowDown") || keys.has("KeyS") ? 1 : 0) -
        (keys.has("ArrowUp") || keys.has("KeyW") ? 1 : 0),
      focus: [...FOCUS_CODES].some((code) => keys.has(code)),
    };
    const gamepad = pollGamepad();
    return {
      x: clamp(keyboard.x + gamepad.x, -1, 1),
      y: clamp(keyboard.y + gamepad.y, -1, 1),
      focus: keyboard.focus || gamepad.focus || pointer.secondaryFocus,
      pointer:
        (presentation.device === "touch" && pointer.active) ||
        (presentation.device === "pointer" && pointer.type === "mouse" && pointer.inside)
          ? { x: pointer.x + pointer.offsetX, y: pointer.y + pointer.offsetY }
          : null,
    };
  }

  function setEnabled(enabled) {
    if (disposed) throw new Error("Neon input is disposed.");
    if (typeof enabled !== "boolean") throw new TypeError("Input enabled must be boolean.");
    inputEnabled = enabled;
    runtime.setInputEnabled(enabled);
    if (!enabled) releaseAll();
  }

  function releaseAll() {
    keys.clear();
    releasePointerCapture();
    pointer.active = false;
    pointer.id = null;
    pointer.inside = false;
    pointer.offsetX = 0;
    pointer.offsetY = 0;
    pointer.secondaryFocus = false;
    previousGamepad = { drop: false, pause: false };
    gamepadEdgesArmed = false;
    onCommand({ type: "releaseAll" });
  }

  onPresentationChange(presentation);

  return {
    movement,
    setEnabled,
    releaseAll,
    snapshotResources: () => ({ gamepad: disposed ? 0 : 1 }),
    dispose() {
      if (disposed) return;
      releaseAll();
      inputEnabled = false;
      disposed = true;
      disposePrimaryCapability();
    },
  };
}
