const IDS = Object.freeze([
  "title-screen",
  "mode-screen",
  "settings-screen",
  "credits-screen",
  "hud",
  "danger-vignette",
  "pause-screen",
  "upgrade-screen",
  "gameover-screen",
  "ignite-button",
  "mode-button",
  "settings-button",
  "credits-button",
  "mode-confirm",
  "settings-save",
  "score-value",
  "mode-label",
  "stage-label",
  "shield-pips",
  "drive-value",
  "drive-bar",
  "drive-bar-fill",
  "chain-value",
  "hype-grade",
  "boss-hud",
  "boss-name",
  "boss-phase",
  "boss-bar-fill",
  "upgrade-cards",
  "result-title",
  "result-score",
  "result-chain",
  "result-graze",
  "result-kills",
  "result-grade",
  "result-eyebrow",
  "new-record",
  "resume-button",
  "result-retry",
  "result-title-button",
  "fullscreen-button",
  "restart-button",
  "quit-button",
  "endless-mode-card",
  "endless-mode-note",
  "touch-drive",
  "best-score-title",
  "side-sync",
  "side-threat",
  "side-chain",
  "master-volume",
  "master-volume-output",
  "music-volume",
  "music-volume-output",
  "screen-shake",
  "flash-effects",
  "fx-density",
  "show-hitbox",
  "auto-guard",
  "toast",
]);
const HYPE_GRADE_CLASSES = Object.freeze(["C", "B", "A", "S", "SS", "SSS"]);
const TITLE_START_KEYS = new Set(["Enter", "Space", "KeyZ"]);
const TOUCH_DRIVE_KEYS = new Set(["Space", "Enter"]);
const RESULT_MODES = new Set(["story", "rush", "endless"]);
const THREAT_LABELS = new Set(["LOW", "RISING", "HIGH", "FATAL"]);

function formatScore(score) {
  return String(Math.max(0, Math.floor(score))).padStart(9, "0");
}

export function createUiProjection({
  document,
  targetWindow,
  runtime,
  locale,
  onCommand,
  onFullscreen,
  onActivate,
  onUiCue,
  onResumeRequest,
  onSettingsChange,
  onPlayingProjected,
}) {
  const elements = Object.fromEntries(
    IDS.map((id) => {
      const element = document.getElementById(id);
      if (element === null) throw new Error(`Neon UI requires #${id}.`);
      return [id, element];
    }),
  );
  const modeButtons = [...document.querySelectorAll("[data-mode]")];
  if (modeButtons.length !== 3) throw new Error("Neon UI requires exactly three mode controls.");
  const titleBackButtons = [...document.querySelectorAll(".back-title")];
  if (titleBackButtons.length !== 3)
    throw new Error("Neon UI requires exactly three title returns.");
  let snapshot = null;
  let lifecyclePaused = false;
  let disposed = false;
  let titlePanel = "title";
  let hostSettings = null;
  let pendingHostChange = null;
  let cancelToast = null;
  let gameplayInputEnabled = false;
  let touchDrivePointerHeld = false;
  let touchDriveKeyHeld = false;

  function listenClick(element, action, selectCue) {
    if (typeof selectCue !== "boolean") {
      throw new TypeError("Neon UI click binding requires an explicit select cue policy.");
    }
    runtime.listen(element, "click", () => {
      onActivate();
      if (selectCue) onUiCue("select");
      action();
    });
  }

  function dispatchPlayingTransition(command) {
    onCommand(command);
    onPlayingProjected();
  }

  function applyTitlePanel() {
    const onTitle = snapshot !== null && snapshot.screen === "title";
    setVisible(elements["title-screen"], onTitle && titlePanel === "title");
    setVisible(elements["mode-screen"], onTitle && titlePanel === "mode");
    setVisible(elements["settings-screen"], onTitle && titlePanel === "settings");
    setVisible(elements["credits-screen"], onTitle && titlePanel === "credits");
  }

  function showTitlePanel(panel) {
    if (!["title", "mode", "settings", "credits"].includes(panel)) {
      throw new RangeError(`Unknown Neon title panel: ${panel}`);
    }
    if (panel === "settings") populateSettingsForm();
    titlePanel = panel;
    applyTitlePanel();
  }

  function populateSettingsForm() {
    if (snapshot === null || hostSettings === null) {
      throw new Error("Neon settings require projected game and Host state.");
    }
    elements["master-volume"].value = String(hostSettings.audio.master);
    elements["master-volume-output"].textContent = String(
      Math.round(hostSettings.audio.master * 100),
    );
    elements["music-volume"].value = String(hostSettings.audio.music);
    elements["music-volume-output"].textContent = String(
      Math.round(hostSettings.audio.music * 100),
    );
    elements["screen-shake"].checked = hostSettings.motion.screenShake;
    elements["flash-effects"].checked = !hostSettings.motion.reduced;
    elements["fx-density"].value = String(snapshot.profile.settings.fxDensity);
    elements["show-hitbox"].checked = snapshot.profile.settings.showHitbox;
    elements["auto-guard"].checked = snapshot.profile.settings.autoGuard;
  }

  listenClick(
    elements["ignite-button"],
    () => {
      if (snapshot === null) throw new Error("Neon UI has no projected state.");
      dispatchPlayingTransition({ type: "start", mode: snapshot.selectedMode });
    },
    false,
  );
  listenClick(elements["mode-button"], () => showTitlePanel("mode"), true);
  listenClick(elements["settings-button"], () => showTitlePanel("settings"), true);
  listenClick(elements["credits-button"], () => showTitlePanel("credits"), true);
  for (const button of titleBackButtons) listenClick(button, () => showTitlePanel("title"), true);
  for (const button of modeButtons) {
    listenClick(button, () => onCommand({ type: "selectMode", mode: button.dataset.mode }), false);
  }
  listenClick(
    elements["mode-confirm"],
    () => {
      elements["mode-confirm"].blur();
      showTitlePanel("title");
    },
    true,
  );
  listenClick(elements["resume-button"], onResumeRequest, true);
  listenClick(
    elements["restart-button"],
    () => {
      dispatchPlayingTransition({ type: "restart" });
      onResumeRequest();
    },
    false,
  );
  listenClick(
    elements["quit-button"],
    () => {
      onCommand({ type: "title" });
      showTitlePanel("title");
      onResumeRequest();
    },
    false,
  );
  listenClick(elements["result-retry"], () => dispatchPlayingTransition({ type: "retry" }), false);
  listenClick(
    elements["result-title-button"],
    () => {
      onCommand({ type: "title" });
      showTitlePanel("title");
    },
    false,
  );
  listenClick(elements["fullscreen-button"], onFullscreen, true);
  runtime.listen(elements["master-volume"], "input", () => {
    elements["master-volume-output"].textContent = String(
      Math.round(Number(elements["master-volume"].value) * 100),
    );
  });
  runtime.listen(elements["music-volume"], "input", () => {
    elements["music-volume-output"].textContent = String(
      Math.round(Number(elements["music-volume"].value) * 100),
    );
  });
  listenClick(
    elements["settings-save"],
    () => {
      if (snapshot === null || hostSettings === null) {
        throw new Error("Neon settings require projected game and Host state.");
      }
      const change = {
        audio: {
          master: Number(elements["master-volume"].value),
          music: Number(elements["music-volume"].value),
        },
        motion: {
          screenShake: elements["screen-shake"].checked,
          reduced: !elements["flash-effects"].checked,
        },
      };
      pendingHostChange = change;
      onSettingsChange(change);
      onCommand({
        type: "applyGameSettings",
        settings: {
          fxDensity: Number(elements["fx-density"].value),
          showHitbox: elements["show-hitbox"].checked,
          autoGuard: elements["auto-guard"].checked,
        },
      });
    },
    true,
  );
  function syncTouchDrive() {
    onCommand({ type: "drop", active: touchDrivePointerHeld || touchDriveKeyHeld });
  }

  function releaseTouchDrive() {
    if (!touchDrivePointerHeld && !touchDriveKeyHeld) return;
    touchDrivePointerHeld = false;
    touchDriveKeyHeld = false;
    onCommand({ type: "drop", active: false });
  }

  runtime.listen(elements["touch-drive"], "pointerdown", (event) => {
    event.preventDefault();
    if (!gameplayInputEnabled || touchDrivePointerHeld) return;
    touchDrivePointerHeld = true;
    onActivate();
    syncTouchDrive();
  });
  const releasePointerDrop = () => {
    if (!touchDrivePointerHeld) return;
    touchDrivePointerHeld = false;
    syncTouchDrive();
  };
  runtime.listen(elements["touch-drive"], "pointerup", releasePointerDrop);
  runtime.listen(elements["touch-drive"], "pointercancel", releasePointerDrop);
  runtime.listen(elements["touch-drive"], "keydown", (event) => {
    if (!TOUCH_DRIVE_KEYS.has(event.code)) return;
    event.preventDefault();
    if (!gameplayInputEnabled || event.repeat || touchDriveKeyHeld) return;
    touchDriveKeyHeld = true;
    onActivate();
    syncTouchDrive();
  });
  runtime.listen(elements["touch-drive"], "keyup", (event) => {
    if (!TOUCH_DRIVE_KEYS.has(event.code)) return;
    event.preventDefault();
    if (!touchDriveKeyHeld) return;
    touchDriveKeyHeld = false;
    syncTouchDrive();
  });
  runtime.listen(elements["upgrade-cards"], "click", (event) => {
    if (!(event.target instanceof targetWindow.HTMLElement)) return;
    const button = event.target.closest("[data-upgrade-index]");
    if (button === null || !elements["upgrade-cards"].contains(button)) return;
    const index = Number(button.dataset.upgradeIndex);
    if (!Number.isSafeInteger(index)) throw new TypeError("Upgrade control index must be exact.");
    onActivate();
    dispatchPlayingTransition({ type: "chooseUpgrade", index });
  });
  runtime.listen(targetWindow, "keydown", (event) => {
    if (event.repeat || snapshot === null) return;
    const targetIsControl =
      event.target instanceof targetWindow.HTMLElement &&
      Boolean(event.target.closest("button,input,select,[role='button']"));
    if (
      snapshot.screen === "title" &&
      titlePanel === "title" &&
      TITLE_START_KEYS.has(event.code) &&
      !targetIsControl
    ) {
      onActivate();
      dispatchPlayingTransition({ type: "start", mode: snapshot.selectedMode });
      return;
    }
    if (
      snapshot.screen === "upgrade" &&
      !targetIsControl &&
      /^(?:Digit|Numpad)[123]$/u.test(event.code)
    ) {
      onActivate();
      dispatchPlayingTransition({
        type: "chooseUpgrade",
        index: Number(event.code.slice(-1)) - 1,
      });
    }
  });

  function applyLocale() {
    document.documentElement.lang = locale.context.resolved;
    document.title = `${locale.text("title")} // ${locale.text("subtitle")}`;
    elements["ignite-button"].querySelector(".ignite-core").textContent = locale.text("ignite");
    elements["resume-button"].textContent = locale.text("resume");
    elements["result-retry"].textContent = locale.text("retry");
    elements["result-title-button"].textContent = locale.text("toTitle");
    const labels = {
      story: locale.text("story"),
      rush: locale.text("rush"),
      endless: locale.text("endless"),
    };
    for (const button of modeButtons) {
      button.querySelector("strong").textContent = labels[button.dataset.mode];
    }
    elements["endless-mode-note"].textContent = snapshot?.profile.unlockedEndless
      ? locale.text("endless")
      : locale.text("locked");
  }

  function setVisible(element, visible) {
    element.classList.toggle("overlay-visible", visible);
  }

  function apply(next) {
    if (disposed) throw new Error("Neon UI projection is disposed.");
    if (
      typeof next.stageLabel !== "string" ||
      !HYPE_GRADE_CLASSES.includes(next.hypeGrade) ||
      typeof next.driveReady !== "boolean" ||
      !THREAT_LABELS.has(next.threat) ||
      !Number.isFinite(next.danger) ||
      next.danger < 0 ||
      next.danger > 0.52
    ) {
      throw new TypeError("Neon UI requires strict stage, grade, and danger projection fields.");
    }
    snapshot = next;
    applyTitlePanel();
    setVisible(elements["pause-screen"], next.screen === "playing" && lifecyclePaused);
    setVisible(elements["upgrade-screen"], next.screen === "upgrade");
    setVisible(elements["gameover-screen"], next.screen === "result");
    elements.hud.classList.toggle("hud-hidden", ["title", "result"].includes(next.screen));
    elements["score-value"].textContent = formatScore(next.score);
    elements["mode-label"].textContent = next.mode.toUpperCase();
    elements["stage-label"].textContent = next.stageLabel;
    elements["shield-pips"].replaceChildren(
      ...Array.from({ length: next.maxShield }, (_, index) => {
        const pip = document.createElement("i");
        pip.classList.toggle("empty", index >= next.shield);
        return pip;
      }),
    );
    elements["drive-value"].textContent = `${next.drive}%`;
    elements["drive-bar-fill"].style.transform = `scaleX(${next.drive / 100})`;
    elements["drive-bar"].classList.toggle("ready", next.driveReady);
    elements["touch-drive"].classList.toggle("ready", next.driveReady);
    elements["chain-value"].textContent = `x${next.chain.toFixed(2)}`;
    elements["hype-grade"].textContent = next.hypeGrade;
    for (const grade of HYPE_GRADE_CLASSES) {
      elements["hype-grade"].classList.remove(`grade-${grade.toLowerCase()}`);
    }
    elements["hype-grade"].classList.add(`grade-${next.hypeGrade.toLowerCase()}`);
    elements["danger-vignette"].style.opacity = String(next.danger);
    elements["side-sync"].textContent = String(next.drive).padStart(3, "0");
    elements["side-chain"].textContent = next.chain.toFixed(2);
    elements["side-threat"].textContent = next.threat;
    elements["boss-hud"].classList.toggle("boss-hud-hidden", next.boss === null);
    if (next.boss !== null) {
      elements["boss-name"].textContent = next.boss.name;
      elements["boss-phase"].textContent = `PHASE ${next.boss.phase}`;
      elements["boss-bar-fill"].style.transform =
        `scaleX(${Math.max(0, next.boss.health / next.boss.maxHealth)})`;
    }
    for (const button of modeButtons) {
      button.classList.toggle("selected", button.dataset.mode === next.selectedMode);
    }
    elements["endless-mode-card"].disabled = !next.profile.unlockedEndless;
    elements["endless-mode-note"].textContent = next.profile.unlockedEndless
      ? locale.text("endless")
      : locale.text("locked");
    elements["best-score-title"].textContent = `BEST ${formatScore(
      next.profile.best[next.selectedMode],
    )}`;
    elements["upgrade-cards"].replaceChildren(
      ...next.upgrades.map((upgrade, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "upgrade-card";
        button.dataset.upgradeIndex = String(index);
        button.style.setProperty("--accent", upgrade.accent);
        const icon = document.createElement("span");
        icon.className = "upgrade-icon";
        icon.textContent = upgrade.icon;
        const name = document.createElement("strong");
        name.textContent = upgrade.name;
        const detail = document.createElement("p");
        detail.textContent = upgrade.detail;
        const level = document.createElement("span");
        level.className = "upgrade-level";
        level.textContent = `LV ${upgrade.level - 1} → ${upgrade.level}`;
        button.append(icon, name, detail, level);
        return button;
      }),
    );
    if (next.result !== null) {
      elements["result-eyebrow"].textContent = next.result.label;
      if (next.result.victory) {
        if (!RESULT_MODES.has(next.mode)) {
          throw new RangeError(`Unknown Neon result mode: ${next.mode}`);
        }
        elements["result-title"].textContent =
          next.mode === "rush" ? "TIME CLEAR" : locale.text("victory");
      } else {
        elements["result-title"].textContent = locale.text("gameOver");
      }
      elements["result-score"].textContent = formatScore(next.result.score);
      elements["result-chain"].textContent = `x${next.result.chain.toFixed(2)}`;
      elements["result-graze"].textContent = String(next.result.graze);
      elements["result-kills"].textContent = String(next.result.kills);
      elements["result-grade"].textContent = next.result.grade;
      elements["new-record"].classList.toggle("visible", next.result.isRecord);
    }
  }

  function applySettings(settings) {
    hostSettings = settings;
    document.documentElement.dataset.reducedMotion = String(settings.motion.reduced);
    if (
      pendingHostChange !== null &&
      settings.audio.master === pendingHostChange.audio.master &&
      settings.audio.music === pendingHostChange.audio.music &&
      settings.motion.screenShake === pendingHostChange.motion.screenShake &&
      settings.motion.reduced === pendingHostChange.motion.reduced
    ) {
      pendingHostChange = null;
      showTitlePanel("title");
    } else if (titlePanel === "settings") {
      populateSettingsForm();
    }
  }

  function applyEvent(event) {
    if (
      event === null ||
      typeof event !== "object" ||
      !Number.isSafeInteger(event.tick) ||
      typeof event.type !== "string"
    ) {
      throw new TypeError("Neon UI event must contain a semantic type and integer tick.");
    }
    if (event.type === "audio" || event.type === "enemy.destroyed") return;
    cancelToast?.();
    cancelToast = null;
    elements.toast.dataset.event = event.type;
    switch (event.type) {
      case "scene.changed":
        elements.toast.textContent = `SCENE // ${event.scene.toUpperCase()}`;
        break;
      case "run.started":
        elements.toast.textContent = `${event.mode.toUpperCase()} // IGNITE`;
        break;
      case "boss.entered":
        elements.toast.textContent = `BOSS // ${event.id + 1}`;
        break;
      case "boss.phase.completed":
        elements.toast.textContent = `PHASE // ${event.phase + 1}`;
        break;
      case "boss.destroyed":
        elements.toast.textContent = `BOSS ${event.id + 1} // ERASED`;
        break;
      case "player.hit":
        elements.toast.textContent = `护盾 // ${event.shield}`;
        break;
      case "player.rebooted":
        elements.toast.textContent = `重启 // ${event.remaining}`;
        break;
      case "upgrade.offered":
        elements.toast.textContent = `升级 // ${event.ids.length}`;
        break;
      case "upgrade.selected":
        elements.toast.textContent = `${event.id.toUpperCase()} // LV ${event.level}`;
        break;
      case "tutorial.autoFire":
        elements.toast.textContent = "AUTO FIRE // ONLINE";
        break;
      case "tutorial.closeCall":
        elements.toast.textContent = "CLOSE CALL + DRIVE";
        break;
      case "power.increased":
        if (!Number.isSafeInteger(event.power) || event.power < 2 || event.power > 5) {
          throw new TypeError("Neon power event payload is invalid.");
        }
        elements.toast.textContent = `POWER ${event.power}`;
        break;
      case "mode.resumed":
        if (
          event.mode === "rush" &&
          Number.isSafeInteger(event.bosses) &&
          event.bosses > 0 &&
          !Object.hasOwn(event, "sector")
        ) {
          elements.toast.textContent = `BOSS ${event.bosses} // CHAIN ON`;
        } else if (
          event.mode === "endless" &&
          Number.isSafeInteger(event.sector) &&
          event.sector > 1 &&
          !Object.hasOwn(event, "bosses")
        ) {
          elements.toast.textContent = `SECTOR ${event.sector}`;
        } else {
          throw new TypeError("Neon mode resume event payload is invalid.");
        }
        break;
      case "run.finished":
        elements.toast.textContent = event.victory
          ? locale.text("victory")
          : locale.text("gameOver");
        break;
      case "guard.firstSave":
      case "guard.auto":
      case "guard.pulse":
      case "overdrive.activated":
        elements.toast.textContent = event.type.toUpperCase();
        break;
      default:
        throw new RangeError(`Unknown Neon UI event: ${event.type}`);
    }
    elements.toast.classList.add("visible");
    cancelToast = runtime.timeout(() => {
      cancelToast = null;
      elements.toast.classList.remove("visible");
    }, 1_400);
  }

  applyLocale();
  runtime.listen(targetWindow, "resize", () => {
    document.documentElement.style.setProperty(
      "--viewport-height",
      `${targetWindow.innerHeight}px`,
    );
  });

  return {
    apply,
    applyEvent,
    applyLocale,
    applySettings,
    setInputEnabled(enabled) {
      if (typeof enabled !== "boolean") {
        throw new TypeError("Neon on-screen gameplay input enabled must be boolean.");
      }
      if (!enabled) releaseTouchDrive();
      gameplayInputEnabled = enabled;
      elements["touch-drive"].setAttribute("aria-disabled", String(!enabled));
    },
    releaseGameplayInput: releaseTouchDrive,
    handlePauseRequest() {
      if (snapshot === null) throw new Error("Neon pause handling requires a projected scene.");
      if (snapshot.screen === "playing") return false;
      if (snapshot.screen === "title") {
        if (titlePanel !== "title") showTitlePanel("title");
        return true;
      }
      if (snapshot.screen === "upgrade" || snapshot.screen === "result") return true;
      throw new RangeError(`Unknown Neon pause scene: ${snapshot.screen}`);
    },
    applyLifecycle(paused) {
      if (typeof paused !== "boolean") throw new TypeError("Lifecycle pause must be boolean.");
      const resumedPlaying =
        lifecyclePaused && !paused && snapshot !== null && snapshot.screen === "playing";
      lifecyclePaused = paused;
      if (paused) releaseTouchDrive();
      setVisible(
        elements["pause-screen"],
        snapshot !== null && snapshot.screen === "playing" && paused,
      );
      if (resumedPlaying) onPlayingProjected();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelToast?.();
      cancelToast = null;
      snapshot = null;
      elements["upgrade-cards"].replaceChildren();
    },
  };
}
