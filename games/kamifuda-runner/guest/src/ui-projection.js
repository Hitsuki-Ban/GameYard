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
  soundToggle: "soundToggle",
  hapticToggle: "hapticToggle",
  motionToggle: "motionToggle",
  qualitySelect: "qualitySelect",
  skinSelect: "skinSelect",
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

  return {
    elements,
    showOverlay(name, gameplayVisible) {
      const overlays = {
        title: elements.title,
        pause: elements.pause,
        choice: elements.choice,
        result: elements.result,
        settings: elements.settings,
        records: elements.records,
      };
      for (const overlay of Object.values(overlays)) overlay.classList.remove("is-active");
      if (name && overlays[name]) overlays[name].classList.add("is-active");
      elements.controls.style.display = gameplayVisible ? "" : "none";
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
      elements.toast.replaceChildren();
      safeProbe.remove();
    },
  };
}
