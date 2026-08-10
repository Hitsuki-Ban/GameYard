const elementIds = {
  title: "titleOverlay",
  pause: "pauseOverlay",
  choice: "choiceOverlay",
  result: "resultOverlay",
  settings: "settingsOverlay",
  records: "recordsOverlay",
  controls: "hudControls",
  start: "startButton",
  hardStart: "hardModeButton",
  hardHint: "hardModeHint",
  pauseButton: "pauseButton",
  stampButton: "stampButton",
  resume: "resumeButton",
  pauseSettings: "pauseSettingsButton",
  quit: "quitButton",
  recordsButton: "recordsButton",
  settingsButton: "settingsButton",
  retry: "retryButton",
  resultTitleButton: "resultTitleButton",
  choiceActLabel: "choiceActLabel",
  choiceTitle: "choiceTitle",
  choiceList: "choiceList",
  resultSeal: "resultSeal",
  resultKicker: "resultKicker",
  resultMode: "resultMode",
  resultTitle: "resultTitle",
  resultGrade: "resultGrade",
  resultStats: "resultStats",
  resultCause: "resultCause",
  canvasStatus: "canvasStatus",
  masterVolume: "masterVolume",
  masterVolumeValue: "masterVolumeValue",
  musicVolume: "musicVolume",
  musicVolumeValue: "musicVolumeValue",
  sfxVolume: "sfxVolume",
  sfxVolumeValue: "sfxVolumeValue",
  hapticToggle: "hapticToggle",
  motionToggle: "motionToggle",
  screenShakeToggle: "screenShakeToggle",
  qualitySelect: "qualitySelect",
  skinSelect: "skinSelect",
  settingsStatus: "settingsStatus",
  settingsRevision: "settingsRevision",
  fullscreen: "fullscreenButton",
  reset: "resetButton",
  recordSummary: "recordSummary",
  skinGallery: "skinGallery",
  toast: "toast",
};

function requireElement(document, id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Kamifuda UI requires #${id}.`);
  return element;
}

export function createUiProjection(document, targetWindow) {
  const elements = Object.fromEntries(
    Object.entries(elementIds).map(([name, id]) => [name, requireElement(document, id)]),
  );
  const safeProbe = document.createElement("div");
  safeProbe.setAttribute("aria-hidden", "true");
  Object.assign(safeProbe.style, {
    position: "fixed",
    inset: "0",
    visibility: "hidden",
    pointerEvents: "none",
    paddingTop: "env(safe-area-inset-top)",
    paddingRight: "env(safe-area-inset-right)",
    paddingBottom: "env(safe-area-inset-bottom)",
    paddingLeft: "env(safe-area-inset-left)",
  });
  document.body.appendChild(safeProbe);

  const overlays = {
    title: elements.title,
    pause: elements.pause,
    choice: elements.choice,
    result: elements.result,
    settings: elements.settings,
    records: elements.records,
  };
  let activeOverlay = "title";
  let returnFocus = null;

  function focusables(overlay) {
    return [
      ...overlay.querySelectorAll(
        "button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])",
      ),
    ].filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
  }

  function focusOverlay(name, preferred) {
    const overlay = overlays[name];
    if (!overlay || overlay.getAttribute("role") !== "dialog") return;
    const target = preferred || focusables(overlay)[0] || overlay;
    target.focus({ preventScroll: true });
  }

  return {
    elements,
    showOverlay(name, gameplayVisible, preferredFocus = null) {
      for (const [overlayName, overlay] of Object.entries(overlays)) {
        const active = overlayName === name;
        overlay.classList.toggle("is-active", active);
        overlay.setAttribute("aria-hidden", String(!active));
        overlay.inert = !active;
      }
      activeOverlay = name;
      elements.controls.style.display = gameplayVisible ? "" : "none";
      if (name) focusOverlay(name, preferredFocus);
    },
    rememberFocus() {
      returnFocus =
        document.activeElement instanceof targetWindow.HTMLElement ? document.activeElement : null;
    },
    restoreFocus(fallback = elements.start) {
      const target = returnFocus?.isConnected ? returnFocus : fallback;
      returnFocus = null;
      target?.focus({ preventScroll: true });
    },
    focusOverlay,
    trapFocus(event) {
      if (event.key !== "Tab" || !activeOverlay) return false;
      const overlay = overlays[activeOverlay];
      if (!overlay || overlay.getAttribute("role") !== "dialog") return false;
      const candidates = focusables(overlay);
      if (!candidates.length) {
        event.preventDefault();
        overlay.focus({ preventScroll: true });
        return true;
      }
      const first = candidates[0];
      const last = candidates[candidates.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first || !overlay.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus({ preventScroll: true });
        return true;
      }
      if (
        !event.shiftKey &&
        (document.activeElement === last || !overlay.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus({ preventScroll: true });
        return true;
      }
      return false;
    },
    showToast(text) {
      elements.toast.textContent = text;
      elements.toast.classList.add("is-active");
    },
    hideToast() {
      elements.toast.classList.remove("is-active");
    },
    safeInsets() {
      const css = targetWindow.getComputedStyle(safeProbe);
      return {
        top: Number.parseFloat(css.paddingTop) || 0,
        right: Number.parseFloat(css.paddingRight) || 0,
        bottom: Number.parseFloat(css.paddingBottom) || 0,
        left: Number.parseFloat(css.paddingLeft) || 0,
      };
    },
    dispose() {
      returnFocus = null;
      elements.toast.replaceChildren();
      safeProbe.remove();
    },
  };
}
