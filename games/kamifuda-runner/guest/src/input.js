export function bindInput({ runtime, targetWindow, document, canvas, ui, focusManager, commands }) {
  const enabled = () => runtime.inputEnabled;
  const gameplayEnabled = () => enabled() && commands.gameplayActive();

  runtime.listen(canvas, "pointerdown", (event) => {
    if (!gameplayEnabled() || !commands.hasPlayer()) return;
    event.preventDefault();
    commands.pointerDown(event);
  });
  runtime.listen(canvas, "pointermove", (event) => {
    if (!gameplayEnabled()) return;
    event.preventDefault();
    commands.pointerMove(event);
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
    runtime.listen(canvas, type, (event) => commands.pointerRelease(event));
  }
  runtime.listen(canvas, "contextmenu", (event) => event.preventDefault());

  runtime.listen(targetWindow, "keydown", (event) => {
    if (!enabled()) return;
    if (focusManager.trapFocus(event)) return;
    const key = event.key.toLowerCase();
    const editable =
      event.target instanceof targetWindow.HTMLInputElement ||
      event.target instanceof targetWindow.HTMLSelectElement ||
      event.target instanceof targetWindow.HTMLButtonElement;
    if (commands.gameplayActive() && !editable && ["arrowleft", "a"].includes(key)) {
      commands.setMovement("left", true);
      event.preventDefault();
    }
    if (commands.gameplayActive() && !editable && ["arrowright", "d"].includes(key)) {
      commands.setMovement("right", true);
      event.preventDefault();
    }
    if ((key === "p" || key === "escape") && !event.repeat) {
      commands.escape();
      event.preventDefault();
    }
    if ((key === " " || key === "enter") && !event.repeat && !editable) {
      commands.primary();
      event.preventDefault();
    }
  });

  runtime.listen(targetWindow, "keyup", (event) => {
    const key = event.key.toLowerCase();
    const movement = ["arrowleft", "a", "arrowright", "d"].includes(key);
    if (["arrowleft", "a"].includes(key)) commands.setMovement("left", false);
    if (["arrowright", "d"].includes(key)) commands.setMovement("right", false);
    if (movement && commands.gameplayActive()) event.preventDefault();
  });

  const on = (element, type, callback) =>
    runtime.listen(element, type, (event) => {
      if (!enabled()) return;
      callback(event);
    });
  on(ui.start, "click", commands.startNormal);
  on(ui.hardStart, "click", commands.startHard);
  on(ui.pauseButton, "click", commands.requestPause);
  on(ui.stampButton, "click", (event) => {
    event.preventDefault();
    commands.stamp();
  });
  on(ui.resume, "click", commands.requestResume);
  on(ui.pauseSettings, "click", commands.openPauseSettings);
  on(ui.quit, "click", commands.returnToTitle);
  on(ui.recordsButton, "click", commands.openRecords);
  on(ui.settingsButton, "click", commands.openSettings);
  on(ui.retry, "click", commands.retry);
  on(ui.resultTitleButton, "click", commands.returnToTitle);

  for (const button of document.querySelectorAll('[data-close="settings"]')) {
    on(button, "click", commands.closeSettings);
  }
  for (const button of document.querySelectorAll('[data-close="records"]')) {
    on(button, "click", commands.closeRecords);
  }

  on(ui.masterVolume, "change", () =>
    commands.requestHostSetting("master", Number(ui.masterVolume.value)),
  );
  on(ui.musicVolume, "change", () =>
    commands.requestHostSetting("music", Number(ui.musicVolume.value)),
  );
  on(ui.sfxVolume, "change", () => commands.requestHostSetting("sfx", Number(ui.sfxVolume.value)));
  on(ui.motionToggle, "change", () =>
    commands.requestHostSetting("reduced", ui.motionToggle.checked),
  );
  on(ui.screenShakeToggle, "change", () =>
    commands.requestHostSetting("screenShake", ui.screenShakeToggle.checked),
  );
  on(ui.hapticToggle, "change", () => commands.setHaptics(ui.hapticToggle.checked));
  on(ui.qualitySelect, "change", () => commands.setQuality(ui.qualitySelect.value));
  on(ui.skinSelect, "change", () => commands.selectSkin(ui.skinSelect.value));
  on(ui.fullscreen, "click", commands.requestFullscreen);
  on(ui.reset, "click", commands.resetProfile);

  on(ui.choiceList, "click", (event) => {
    const button = event.target.closest("[data-charm]");
    if (button instanceof targetWindow.HTMLButtonElement)
      commands.chooseCharm(button.dataset.charm);
  });
  on(ui.skinGallery, "click", (event) => {
    const button = event.target.closest("[data-skin]");
    if (button instanceof targetWindow.HTMLButtonElement) commands.selectSkin(button.dataset.skin);
  });

  runtime.listen(document, "visibilitychange", () => {
    if (document.hidden && commands.gameplayActive()) commands.requestPause();
  });
  runtime.listen(targetWindow, "resize", commands.resize);
}
