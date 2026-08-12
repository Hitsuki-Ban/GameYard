import type {
  HostSettingField,
  HostSettingValue,
  HostSettingsProjectionSnapshot,
} from "./host-settings-projection";
import type { NeonCatalogKey, createNeonI18n } from "./i18n";
import { DialogController, type NeonDialogName } from "./dialog-controller";

type NeonI18n = ReturnType<typeof createNeonI18n>;
type GameMode = "story" | "rush" | "endless";
type Screen = "title" | "playing" | "upgrade" | "result";
type HypeGrade = "C" | "B" | "A" | "S" | "SS" | "SSS";
type ThreatId = "low" | "rising" | "high" | "fatal";
type BossId = "aella" | "mirrorSaint" | "algorithm";
type ResultLabelId = "ritualComplete" | "signalLost" | "timeComplete";
type StageProjection = Readonly<{ kind: "act" | "timer" | "sector"; value: number }>;

export interface NeonInputPresentation {
  readonly device: "keyboard" | "pointer" | "touch" | "gamepad";
  readonly touchControls: boolean;
}

export interface NeonUiSnapshot {
  readonly screen: Screen;
  readonly mode: GameMode;
  readonly selectedMode: GameMode;
  readonly stage: StageProjection;
  readonly score: number;
  readonly chain: number;
  readonly drive: number;
  readonly driveReady: boolean;
  readonly shield: number;
  readonly maxShield: number;
  readonly rank: number;
  readonly threat: ThreatId;
  readonly hypeGrade: HypeGrade;
  readonly danger: number;
  readonly boss: Readonly<{
    id: BossId;
    phase: string;
    health: number;
    maxHealth: number;
  }> | null;
  readonly profile: Readonly<{
    unlockedEndless: boolean;
    best: Readonly<Record<GameMode, number>>;
    settings: Readonly<{ fxDensity: number; showHitbox: boolean; autoGuard: boolean }>;
  }>;
  readonly upgrades: readonly Readonly<{
    id: string;
    icon: string;
    accent: string;
    level: number;
  }>[];
  readonly result: Readonly<{
    labelId: ResultLabelId;
    victory: boolean;
    score: number;
    chain: number;
    graze: number;
    kills: number;
    grade: HypeGrade;
    isRecord: boolean;
  }> | null;
}

type NeonUiCommand =
  | Readonly<{ type: "start"; mode: GameMode }>
  | Readonly<{ type: "selectMode"; mode: GameMode }>
  | Readonly<{ type: "chooseUpgrade"; index: number }>
  | Readonly<{ type: "drop"; active: boolean }>
  | Readonly<{ type: "restart" | "retry" | "title" }>
  | Readonly<{
      type: "applyGameSettings";
      settings: Readonly<{ fxDensity: number; showHitbox: boolean; autoGuard: boolean }>;
    }>;

interface ManagedRuntimePort {
  listen(target: EventTarget, type: string, listener: (event: any) => void): void;
  timeout(callback: () => void, delayMs: number): () => void;
}

export interface CreateUiProjectionOptions {
  readonly document: Document;
  readonly targetWindow: Window & typeof globalThis;
  readonly runtime: ManagedRuntimePort;
  readonly i18n: NeonI18n;
  readonly onCommand: (command: NeonUiCommand) => void;
  readonly onFullscreen: () => void;
  readonly onActivate: () => void;
  readonly onUiCue: (cue: "select") => void;
  readonly onResumeRequest: () => void;
  readonly onHostSettingRequest: (field: HostSettingField, value: HostSettingValue) => void;
  readonly onPlayingProjected: () => void;
}

const ELEMENT_IDS = [
  "app",
  "cabinet",
  "screen-shell",
  "gameCanvas",
  "title-screen",
  "hud",
  "danger-vignette",
  "score-value",
  "mode-label",
  "stage-label",
  "shield-wrap",
  "shield-pips",
  "drive-wrap",
  "drive-value",
  "drive-bar",
  "drive-bar-fill",
  "chain-value",
  "hype-grade",
  "boss-hud",
  "boss-name",
  "boss-phase",
  "boss-bar-fill",
  "side-sync",
  "side-threat",
  "side-chain",
  "ignite-button",
  "mode-button",
  "settings-button",
  "archive-button",
  "best-score-title",
  "touch-drive",
  "control-move",
  "control-focus",
  "control-drop",
  "control-pause",
  "mode-dialog",
  "mode-dialog-title",
  "mode-close",
  "mode-confirm",
  "endless-mode-card",
  "endless-mode-note",
  "archive-dialog",
  "archive-dialog-title",
  "archive-close",
  "archive-back",
  "settings-dialog",
  "settings-dialog-title",
  "settings-close",
  "settings-save",
  "fullscreen-button",
  "master-volume",
  "master-volume-output",
  "music-volume",
  "music-volume-output",
  "sfx-volume",
  "sfx-volume-output",
  "reduced-motion",
  "screen-shake",
  "fx-density",
  "show-hitbox",
  "auto-guard",
  "host-revision",
  "host-settings-status",
  "pause-dialog",
  "pause-dialog-title",
  "resume-button",
  "restart-button",
  "quit-button",
  "upgrade-dialog",
  "upgrade-dialog-title",
  "upgrade-cards",
  "result-dialog",
  "result-title",
  "result-eyebrow",
  "result-score",
  "result-chain",
  "result-graze",
  "result-kills",
  "result-grade",
  "new-record",
  "result-retry",
  "result-title-button",
  "toast",
  "status-announcer",
] as const;

type ElementId = (typeof ELEMENT_IDS)[number];
const MODES = new Set<GameMode>(["story", "rush", "endless"]);
const HYPE_GRADES = new Set<HypeGrade>(["C", "B", "A", "S", "SS", "SSS"]);
const THREAT_IDS = new Set<ThreatId>(["low", "rising", "high", "fatal"]);
const STAGE_KINDS = new Set<StageProjection["kind"]>(["act", "timer", "sector"]);
const RESULT_LABEL_IDS = new Set<ResultLabelId>(["ritualComplete", "signalLost", "timeComplete"]);
const TITLE_START_KEYS = new Set(["Enter", "Space", "KeyZ"]);
const DROP_KEYS = new Set(["Space", "Enter"]);

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function writeText(element: Element, value: string): void {
  if (element.textContent !== value) element.textContent = value;
}

function writeAttribute(element: Element, name: string, value: string): void {
  if (element.getAttribute(name) !== value) element.setAttribute(name, value);
}

function writeClass(element: Element, name: string, enabled: boolean): void {
  if (element.classList.contains(name) !== enabled) element.classList.toggle(name, enabled);
}

function writeHidden(element: HTMLElement, hidden: boolean): void {
  if (element.hidden !== hidden) element.hidden = hidden;
}

function writeValue(element: HTMLInputElement | HTMLSelectElement, value: string): void {
  if (element.value !== value) element.value = value;
}

function writeChecked(element: HTMLInputElement, checked: boolean): void {
  if (element.checked !== checked) element.checked = checked;
}

function requireElement<T extends HTMLElement>(document: Document, id: ElementId): T {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`Neon UI requires #${id}.`);
  return element as T;
}

function assertSnapshot(snapshot: NeonUiSnapshot): void {
  if (
    snapshot === null ||
    typeof snapshot !== "object" ||
    !["title", "playing", "upgrade", "result"].includes(snapshot.screen) ||
    !MODES.has(snapshot.mode) ||
    !MODES.has(snapshot.selectedMode) ||
    snapshot.stage === null ||
    typeof snapshot.stage !== "object" ||
    !STAGE_KINDS.has(snapshot.stage.kind) ||
    !isFiniteNumber(snapshot.stage.value) ||
    snapshot.stage.value < 0 ||
    !isFiniteNumber(snapshot.score) ||
    snapshot.score < 0 ||
    !isFiniteNumber(snapshot.chain) ||
    !isFiniteNumber(snapshot.drive) ||
    snapshot.drive < 0 ||
    snapshot.drive > 100 ||
    typeof snapshot.driveReady !== "boolean" ||
    !Number.isSafeInteger(snapshot.shield) ||
    !Number.isSafeInteger(snapshot.maxShield) ||
    snapshot.maxShield < 0 ||
    snapshot.shield < 0 ||
    snapshot.shield > snapshot.maxShield ||
    !isFiniteNumber(snapshot.rank) ||
    !THREAT_IDS.has(snapshot.threat) ||
    !HYPE_GRADES.has(snapshot.hypeGrade) ||
    !isFiniteNumber(snapshot.danger) ||
    snapshot.danger < 0 ||
    snapshot.danger > 1 ||
    snapshot.profile === null ||
    typeof snapshot.profile !== "object" ||
    !Array.isArray(snapshot.upgrades)
  ) {
    throw new TypeError("Neon UI snapshot does not match the current projection contract.");
  }
  if (
    snapshot.boss !== null &&
    (typeof snapshot.boss.id !== "string" ||
      typeof snapshot.boss.phase !== "string" ||
      !isFiniteNumber(snapshot.boss.health) ||
      !isFiniteNumber(snapshot.boss.maxHealth) ||
      snapshot.boss.maxHealth <= 0)
  )
    throw new TypeError("Neon boss projection is invalid.");
  if (
    snapshot.result !== null &&
    (snapshot.result === null ||
      typeof snapshot.result !== "object" ||
      !RESULT_LABEL_IDS.has(snapshot.result.labelId) ||
      typeof snapshot.result.victory !== "boolean" ||
      !isFiniteNumber(snapshot.result.score) ||
      snapshot.result.score < 0 ||
      !isFiniteNumber(snapshot.result.chain) ||
      !isFiniteNumber(snapshot.result.graze) ||
      !Number.isSafeInteger(snapshot.result.kills) ||
      snapshot.result.kills < 0 ||
      !HYPE_GRADES.has(snapshot.result.grade) ||
      typeof snapshot.result.isRecord !== "boolean")
  ) {
    throw new TypeError("Neon result projection is invalid.");
  }
}

export function createUiProjection(options: CreateUiProjectionOptions) {
  if (options === null || typeof options !== "object") {
    throw new TypeError("Neon UI projection requires explicit options.");
  }
  const {
    document,
    targetWindow,
    runtime,
    i18n,
    onCommand,
    onFullscreen,
    onActivate,
    onUiCue,
    onResumeRequest,
    onHostSettingRequest,
    onPlayingProjected,
  } = options;
  const elements = Object.fromEntries(
    ELEMENT_IDS.map((id) => [id, requireElement(document, id)]),
  ) as Record<ElementId, HTMLElement>;
  const canvas = elements.gameCanvas as HTMLCanvasElement;
  const modeButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-mode]")];
  if (modeButtons.length !== 3) throw new Error("Neon UI requires exactly three mode controls.");

  const hostInputs = {
    master: elements["master-volume"] as HTMLInputElement,
    music: elements["music-volume"] as HTMLInputElement,
    sfx: elements["sfx-volume"] as HTMLInputElement,
    reduced: elements["reduced-motion"] as HTMLInputElement,
    screenShake: elements["screen-shake"] as HTMLInputElement,
  } as const;
  const hostOutputs = {
    master: elements["master-volume-output"] as HTMLOutputElement,
    music: elements["music-volume-output"] as HTMLOutputElement,
    sfx: elements["sfx-volume-output"] as HTMLOutputElement,
  } as const;

  let snapshot: NeonUiSnapshot | null = null;
  let hostSettings: HostSettingsProjectionSnapshot | null = null;
  let inputPresentation: NeonInputPresentation = Object.freeze({
    device: "keyboard",
    touchControls: false,
  });
  let inputEnabled = false;
  let lifecyclePaused = false;
  let titleDialog: "mode" | "archive" | "settings" | null = null;
  let touchPointerHeld = false;
  let touchKeyHeld = false;
  let cancelToast: (() => void) | null = null;
  let announcementEvent: any = null;
  let disposed = false;
  const upgradeButtons = new Map<string, HTMLButtonElement>();

  const dialogs = {
    mode: elements["mode-dialog"] as HTMLDialogElement,
    archive: elements["archive-dialog"] as HTMLDialogElement,
    settings: elements["settings-dialog"] as HTMLDialogElement,
    pause: elements["pause-dialog"] as HTMLDialogElement,
    upgrade: elements["upgrade-dialog"] as HTMLDialogElement,
    result: elements["result-dialog"] as HTMLDialogElement,
  } as const;

  function selectedModeControl(): HTMLButtonElement {
    if (snapshot === null) throw new Error("Mode dialog requires a projected snapshot.");
    const selected = modeButtons.find((button) => button.dataset.mode === snapshot?.selectedMode);
    if (selected === undefined || selected.disabled)
      throw new Error("Selected Neon mode has no enabled control.");
    return selected;
  }

  function closeTitleDialog(): void {
    titleDialog = null;
  }

  const dialogController = new DialogController(document, {
    mode: { element: dialogs.mode, cancelPolicy: "close", onCancel: closeTitleDialog },
    archive: { element: dialogs.archive, cancelPolicy: "close", onCancel: closeTitleDialog },
    settings: { element: dialogs.settings, cancelPolicy: "close", onCancel: closeTitleDialog },
    pause: { element: dialogs.pause, cancelPolicy: "request", onCancel: onResumeRequest },
    upgrade: { element: dialogs.upgrade, cancelPolicy: "block" },
    result: { element: dialogs.result, cancelPolicy: "block" },
  });

  function assertActive(): void {
    if (disposed) throw new Error("Neon UI projection is disposed.");
  }

  function listenClick(element: HTMLElement, action: () => void, cue: boolean): void {
    runtime.listen(element, "click", () => {
      onActivate();
      if (cue) onUiCue("select");
      action();
    });
  }

  function dispatchPlayingTransition(command: NeonUiCommand): void {
    onCommand(command);
    onPlayingProjected();
  }

  function desiredDialog(): NeonDialogName | null {
    if (snapshot === null) return null;
    if (snapshot.screen === "title") return titleDialog;
    if (snapshot.screen === "playing") return lifecyclePaused ? "pause" : null;
    return snapshot.screen;
  }

  function initialFocus(name: NeonDialogName): HTMLElement {
    switch (name) {
      case "mode":
        return selectedModeControl();
      case "archive":
        return elements["archive-back"];
      case "settings":
        return hostInputs.master;
      case "pause":
        return elements["resume-button"];
      case "upgrade": {
        const first = elements["upgrade-cards"].querySelector<HTMLElement>("button");
        if (first === null) throw new Error("Upgrade dialog requires at least one choice.");
        return first;
      }
      case "result":
        return elements["result-retry"];
    }
  }

  function syncDialog(): void {
    const desired = desiredDialog();
    if (desired === null) {
      dialogController.closeActive();
      return;
    }
    dialogController.open(desired, initialFocus(desired));
  }

  function openTitleDialog(name: "mode" | "archive" | "settings"): void {
    if (snapshot?.screen !== "title")
      throw new Error("Title dialog can open only from the title scene.");
    if (name === "settings") populateGameSettings();
    titleDialog = name;
    syncDialog();
  }

  function dismissTitleDialog(name: "mode" | "archive" | "settings"): void {
    if (titleDialog !== name)
      throw new Error(`Neon ${name} dialog is not the active title dialog.`);
    titleDialog = null;
    dialogController.close(name);
  }

  function populateGameSettings(): void {
    if (snapshot === null) throw new Error("Game settings require a projected snapshot.");
    writeValue(
      elements["fx-density"] as HTMLSelectElement,
      String(snapshot.profile.settings.fxDensity),
    );
    writeChecked(elements["show-hitbox"] as HTMLInputElement, snapshot.profile.settings.showHitbox);
    writeChecked(elements["auto-guard"] as HTMLInputElement, snapshot.profile.settings.autoGuard);
  }

  function formatAudio(value: number): string {
    return i18n.formatNumber(value, "percent");
  }

  function syncHostSettings(): void {
    if (hostSettings === null) return;
    const canonical = hostSettings.canonical;
    writeValue(hostInputs.master, String(canonical.audio.master));
    writeValue(hostInputs.music, String(canonical.audio.music));
    writeValue(hostInputs.sfx, String(canonical.audio.sfx));
    writeChecked(hostInputs.reduced, canonical.motion.reduced);
    writeChecked(hostInputs.screenShake, canonical.motion.screenShake);
    writeText(hostOutputs.master, formatAudio(canonical.audio.master));
    writeText(hostOutputs.music, formatAudio(canonical.audio.music));
    writeText(hostOutputs.sfx, formatAudio(canonical.audio.sfx));
    writeText(
      elements["host-revision"],
      i18n.t("settings.host.revision", { revision: canonical.revision }),
    );
    document.documentElement.dataset.motion = canonical.motion.reduced ? "reduced" : "full";

    const disabled = hostSettings.pending !== null;
    for (const input of Object.values(hostInputs)) {
      if (input.disabled !== disabled) input.disabled = disabled;
    }
    const status = elements["host-settings-status"];
    if (hostSettings.pending !== null) {
      writeText(status, i18n.t("settings.pending"));
      status.dataset.state = "pending";
    } else if (hostSettings.result?.status === "applied") {
      writeText(status, i18n.t("settings.applied", { revision: hostSettings.result.revision }));
      status.dataset.state = "applied";
    } else if (hostSettings.result !== null) {
      writeText(status, i18n.t("settings.error", { message: i18n.t("error.settings.request") }));
      status.dataset.state = "error";
    } else {
      writeText(status, "");
      delete status.dataset.state;
    }
  }

  function requestHostSetting(field: HostSettingField): void {
    if (hostSettings === null)
      throw new Error("Host setting edits require a projected Host snapshot.");
    if (hostSettings.pending !== null)
      throw new Error("A Host setting request is already pending.");
    const input = hostInputs[field];
    const value: HostSettingValue =
      field === "master" || field === "music" || field === "sfx"
        ? Number(input.value)
        : input.checked;
    onHostSettingRequest(field, value);
  }

  for (const field of ["master", "music", "sfx"] as const) {
    runtime.listen(hostInputs[field], "input", () =>
      writeText(hostOutputs[field], formatAudio(Number(hostInputs[field].value))),
    );
    runtime.listen(hostInputs[field], "change", () => requestHostSetting(field));
  }
  runtime.listen(hostInputs.reduced, "change", () => requestHostSetting("reduced"));
  runtime.listen(hostInputs.screenShake, "change", () => requestHostSetting("screenShake"));

  listenClick(
    elements["ignite-button"],
    () => {
      if (snapshot === null) throw new Error("Start requires a projected snapshot.");
      dispatchPlayingTransition({ type: "start", mode: snapshot.selectedMode });
    },
    false,
  );
  listenClick(elements["mode-button"], () => openTitleDialog("mode"), true);
  listenClick(elements["settings-button"], () => openTitleDialog("settings"), true);
  listenClick(elements["archive-button"], () => openTitleDialog("archive"), true);
  listenClick(elements["mode-close"], () => dismissTitleDialog("mode"), true);
  listenClick(elements["mode-confirm"], () => dismissTitleDialog("mode"), true);
  listenClick(elements["archive-close"], () => dismissTitleDialog("archive"), true);
  listenClick(elements["archive-back"], () => dismissTitleDialog("archive"), true);
  listenClick(elements["settings-close"], () => dismissTitleDialog("settings"), true);
  listenClick(elements["fullscreen-button"], onFullscreen, true);
  listenClick(
    elements["settings-save"],
    () => {
      onCommand({
        type: "applyGameSettings",
        settings: {
          fxDensity: Number((elements["fx-density"] as HTMLSelectElement).value),
          showHitbox: (elements["show-hitbox"] as HTMLInputElement).checked,
          autoGuard: (elements["auto-guard"] as HTMLInputElement).checked,
        },
      });
      dismissTitleDialog("settings");
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
      onResumeRequest();
    },
    false,
  );
  listenClick(elements["result-retry"], () => dispatchPlayingTransition({ type: "retry" }), false);
  listenClick(elements["result-title-button"], () => onCommand({ type: "title" }), false);

  for (const button of modeButtons) {
    listenClick(
      button,
      () => {
        const mode = button.dataset.mode;
        if (mode === undefined || !MODES.has(mode as GameMode))
          throw new RangeError("Mode control has an invalid mode id.");
        onCommand({ type: "selectMode", mode: mode as GameMode });
      },
      false,
    );
  }

  function syncDrop(): void {
    onCommand({ type: "drop", active: touchPointerHeld || touchKeyHeld });
  }

  function releaseGameplayInput(): void {
    if (!touchPointerHeld && !touchKeyHeld) return;
    touchPointerHeld = false;
    touchKeyHeld = false;
    onCommand({ type: "drop", active: false });
  }

  runtime.listen(elements["touch-drive"], "pointerdown", (event: PointerEvent) => {
    event.preventDefault();
    if (!inputEnabled || touchPointerHeld) return;
    touchPointerHeld = true;
    onActivate();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    syncDrop();
  });
  const endPointerDrop = () => {
    if (!touchPointerHeld) return;
    touchPointerHeld = false;
    syncDrop();
  };
  runtime.listen(elements["touch-drive"], "pointerup", endPointerDrop);
  runtime.listen(elements["touch-drive"], "pointercancel", endPointerDrop);
  runtime.listen(elements["touch-drive"], "lostpointercapture", endPointerDrop);
  runtime.listen(elements["touch-drive"], "keydown", (event: KeyboardEvent) => {
    if (!DROP_KEYS.has(event.code)) return;
    event.preventDefault();
    if (!inputEnabled || event.repeat || touchKeyHeld) return;
    touchKeyHeld = true;
    onActivate();
    syncDrop();
  });
  runtime.listen(elements["touch-drive"], "keyup", (event: KeyboardEvent) => {
    if (!DROP_KEYS.has(event.code)) return;
    event.preventDefault();
    if (!touchKeyHeld) return;
    touchKeyHeld = false;
    syncDrop();
  });

  runtime.listen(elements["upgrade-cards"], "click", (event: MouseEvent) => {
    if (!(event.target instanceof targetWindow.HTMLElement)) return;
    const button = event.target.closest<HTMLButtonElement>("[data-upgrade-index]");
    if (button === null || !elements["upgrade-cards"].contains(button)) return;
    const index = Number(button.dataset.upgradeIndex);
    if (!Number.isSafeInteger(index)) throw new TypeError("Upgrade index must be an integer.");
    onActivate();
    dispatchPlayingTransition({ type: "chooseUpgrade", index });
  });

  runtime.listen(targetWindow, "keydown", (event: KeyboardEvent) => {
    if (event.repeat || snapshot === null) return;
    const targetIsControl =
      event.target instanceof targetWindow.HTMLElement &&
      Boolean(event.target.closest("button,input,select,dialog"));
    if (
      snapshot.screen === "title" &&
      titleDialog === null &&
      TITLE_START_KEYS.has(event.code) &&
      !targetIsControl
    ) {
      onActivate();
      dispatchPlayingTransition({ type: "start", mode: snapshot.selectedMode });
    } else if (snapshot.screen === "upgrade" && /^(?:Digit|Numpad)[123]$/u.test(event.code)) {
      onActivate();
      dispatchPlayingTransition({ type: "chooseUpgrade", index: Number(event.code.slice(-1)) - 1 });
    }
  });

  function localizeStaticDom(): void {
    for (const element of document.querySelectorAll<HTMLElement>("[data-i18n]")) {
      const key = element.dataset.i18n;
      if (key === undefined) throw new Error("Localized element is missing its catalog key.");
      writeText(element, i18n.t(key as NeonCatalogKey));
    }
    document.documentElement.lang = i18n.context.resolved;
    document.title = i18n.t("document.title");
    const descriptions = document.querySelectorAll<HTMLMetaElement>('meta[name="description"]');
    if (descriptions.length !== 1)
      throw new Error("Neon requires exactly one document description.");
    writeAttribute(descriptions[0], "content", i18n.t("document.description"));
    writeAttribute(elements.cabinet, "aria-label", i18n.t("a11y.gameRegion"));
    writeAttribute(canvas, "aria-label", i18n.t("a11y.canvas"));
    writeAttribute(elements["touch-drive"], "aria-label", i18n.t("a11y.touchDrive"));

    const dialogLabels: Readonly<Record<NeonDialogName, NeonCatalogKey>> = {
      mode: "a11y.modeDialog",
      archive: "a11y.archiveDialog",
      settings: "a11y.settingsDialog",
      pause: "a11y.pauseDialog",
      upgrade: "a11y.upgradeDialog",
      result: "a11y.resultDialog",
    };
    for (const [name, key] of Object.entries(dialogLabels) as [NeonDialogName, NeonCatalogKey][]) {
      writeAttribute(dialogs[name], "aria-label", i18n.t(key));
    }
    const closers = [
      [elements["mode-close"], "a11y.modeDialog"],
      [elements["archive-close"], "a11y.archiveDialog"],
      [elements["settings-close"], "a11y.settingsDialog"],
    ] as const;
    for (const [button, labelKey] of closers) {
      writeAttribute(
        button,
        "aria-label",
        i18n.t("a11y.closeDialog", { dialog: i18n.t(labelKey) }),
      );
    }
  }

  function syncInputLegend(): void {
    let moveBindings: NeonCatalogKey;
    let focusBindings: NeonCatalogKey | null;
    let dropBindings: NeonCatalogKey;
    let pauseBindings: NeonCatalogKey;
    if (inputPresentation.device === "gamepad") {
      moveBindings = "control.gamepad.move";
      focusBindings = "control.gamepad.focus";
      dropBindings = "control.gamepad.drop";
      pauseBindings = "control.gamepad.pause";
    } else if (inputPresentation.device === "keyboard") {
      moveBindings = "control.keyboard.move";
      focusBindings = "control.keyboard.focus";
      dropBindings = "control.keyboard.drop";
      pauseBindings = "control.keyboard.pause";
    } else {
      moveBindings = "control.pointer.move";
      focusBindings = inputPresentation.device === "touch" ? null : "control.keyboard.focus";
      dropBindings = "control.pointer.drop";
      pauseBindings = "control.keyboard.pause";
    }
    writeText(elements["control-move"], i18n.t("control.move", { bindings: i18n.t(moveBindings) }));
    writeHidden(elements["control-focus"], focusBindings === null);
    if (focusBindings !== null)
      writeText(
        elements["control-focus"],
        i18n.t("control.focus", { bindings: i18n.t(focusBindings) }),
      );
    writeText(elements["control-drop"], i18n.t("control.drop", { bindings: i18n.t(dropBindings) }));
    writeText(
      elements["control-pause"],
      i18n.t("control.pause", { bindings: i18n.t(pauseBindings) }),
    );
  }

  function stageText(stage: StageProjection): string {
    if (stage.kind === "timer") return i18n.formatNumber(stage.value, "clock");
    return i18n.t(stage.kind === "act" ? "hud.stage" : "hud.sector", {
      [stage.kind === "act" ? "stage" : "sector"]: i18n.formatNumber(stage.value, "integer"),
    });
  }

  function bossNameKey(id: BossId): NeonCatalogKey {
    return `boss.${id}.name` as NeonCatalogKey;
  }

  function bossPhaseKey(id: BossId, phase: string): NeonCatalogKey {
    return `boss.${id}.phase.${phase}` as NeonCatalogKey;
  }

  function resultLabelKey(id: ResultLabelId): NeonCatalogKey {
    switch (id) {
      case "ritualComplete":
        return "result.ritualComplete";
      case "signalLost":
        return "result.signalLost";
      case "timeComplete":
        return "result.timeClear";
    }
  }

  function syncShieldPips(maximum: number, current: number): void {
    const container = elements["shield-pips"];
    while (container.children.length < maximum) container.append(document.createElement("i"));
    while (container.children.length > maximum) container.lastElementChild?.remove();
    [...container.children].forEach((pip, index) => writeClass(pip, "empty", index >= current));
    writeAttribute(
      elements["shield-wrap"],
      "aria-label",
      i18n.t("a11y.shieldStatus", { current, maximum }),
    );
  }

  function syncUpgradeCards(upgrades: NeonUiSnapshot["upgrades"]): void {
    const liveIds = new Set(upgrades.map((upgrade) => upgrade.id));
    for (const [id, button] of upgradeButtons) {
      if (!liveIds.has(id)) {
        button.remove();
        upgradeButtons.delete(id);
      }
    }
    upgrades.forEach((upgrade, index) => {
      let button = upgradeButtons.get(upgrade.id);
      if (button === undefined) {
        button = document.createElement("button");
        button.type = "button";
        button.className = "upgrade-card";
        button.dataset.upgradeId = upgrade.id;
        const icon = document.createElement("span");
        icon.className = "upgrade-icon";
        const name = document.createElement("strong");
        name.className = "upgrade-name";
        const detail = document.createElement("p");
        detail.className = "upgrade-detail";
        const level = document.createElement("span");
        level.className = "upgrade-level";
        button.append(icon, name, detail, level);
        upgradeButtons.set(upgrade.id, button);
      }
      button.dataset.upgradeIndex = String(index);
      if (button.style.getPropertyValue("--accent") !== upgrade.accent)
        button.style.setProperty("--accent", upgrade.accent);
      writeText(button.querySelector(".upgrade-icon")!, upgrade.icon);
      writeText(
        button.querySelector(".upgrade-name")!,
        i18n.t(`upgrade.${upgrade.id}.name` as NeonCatalogKey),
      );
      writeText(
        button.querySelector(".upgrade-detail")!,
        i18n.t(`upgrade.${upgrade.id}.description` as NeonCatalogKey),
      );
      writeText(
        button.querySelector(".upgrade-level")!,
        i18n.t("upgrade.level", { from: upgrade.level - 1, to: upgrade.level }),
      );
      const child = elements["upgrade-cards"].children[index];
      if (child !== button) elements["upgrade-cards"].insertBefore(button, child ?? null);
    });
  }

  function syncSnapshotFields(): void {
    if (snapshot === null) return;
    writeHidden(elements["title-screen"], snapshot.screen !== "title");
    writeClass(
      elements.hud,
      "hud-hidden",
      snapshot.screen === "title" || snapshot.screen === "result",
    );
    writeText(elements["score-value"], i18n.formatNumber(snapshot.score, "score"));
    writeText(elements["mode-label"], i18n.t(`mode.${snapshot.mode}.name` as NeonCatalogKey));
    writeText(elements["stage-label"], stageText(snapshot.stage));
    syncShieldPips(snapshot.maxShield, snapshot.shield);
    const driveRatio = snapshot.drive / 100;
    writeText(elements["drive-value"], i18n.formatNumber(driveRatio, "percent"));
    if (elements["drive-bar-fill"].style.transform !== `scaleX(${driveRatio})`)
      elements["drive-bar-fill"].style.transform = `scaleX(${driveRatio})`;
    writeAttribute(
      elements["drive-wrap"],
      "aria-label",
      i18n.t("a11y.driveStatus", { percent: i18n.formatNumber(driveRatio, "percent") }),
    );
    writeClass(elements["drive-bar"], "ready", snapshot.driveReady);
    writeClass(elements["touch-drive"], "ready", snapshot.driveReady);
    writeText(elements["chain-value"], i18n.formatNumber(snapshot.chain, "decimal2"));
    writeText(elements["hype-grade"], snapshot.hypeGrade);
    for (const grade of HYPE_GRADES)
      writeClass(
        elements["hype-grade"],
        `grade-${grade.toLowerCase()}`,
        grade === snapshot.hypeGrade,
      );
    if (elements["danger-vignette"].style.opacity !== String(snapshot.danger))
      elements["danger-vignette"].style.opacity = String(snapshot.danger);
    writeText(elements["side-sync"], i18n.formatNumber(snapshot.drive, "integer"));
    writeText(elements["side-chain"], i18n.formatNumber(snapshot.chain, "decimal2"));
    writeText(elements["side-threat"], i18n.t(`hud.threat.${snapshot.threat}` as NeonCatalogKey));
    writeClass(elements["boss-hud"], "boss-hud-hidden", snapshot.boss === null);
    if (snapshot.boss !== null) {
      const name = i18n.t(bossNameKey(snapshot.boss.id));
      const phase = i18n.t(bossPhaseKey(snapshot.boss.id, snapshot.boss.phase));
      const ratio = Math.max(0, snapshot.boss.health / snapshot.boss.maxHealth);
      writeText(elements["boss-name"], name);
      writeText(elements["boss-phase"], phase);
      writeAttribute(
        elements["boss-hud"],
        "aria-label",
        i18n.t("a11y.bossStatus", {
          boss: name,
          phase,
          percent: i18n.formatNumber(ratio, "percent"),
        }),
      );
      if (elements["boss-bar-fill"].style.transform !== `scaleX(${ratio})`)
        elements["boss-bar-fill"].style.transform = `scaleX(${ratio})`;
    }
    for (const button of modeButtons)
      writeClass(button, "selected", button.dataset.mode === snapshot.selectedMode);
    const endless = elements["endless-mode-card"] as HTMLButtonElement;
    if (endless.disabled === snapshot.profile.unlockedEndless)
      endless.disabled = !snapshot.profile.unlockedEndless;
    writeText(
      elements["endless-mode-note"],
      i18n.t(snapshot.profile.unlockedEndless ? "mode.endless.unlocked" : "mode.endless.locked"),
    );
    writeText(
      elements["best-score-title"],
      i18n.t("title.best", {
        score: i18n.formatNumber(snapshot.profile.best[snapshot.selectedMode], "score"),
      }),
    );
    syncUpgradeCards(snapshot.upgrades);
    if (snapshot.result !== null) {
      writeText(elements["result-eyebrow"], i18n.t(resultLabelKey(snapshot.result.labelId)));
      writeText(
        elements["result-title"],
        i18n.t(
          snapshot.result.victory
            ? snapshot.mode === "rush"
              ? "result.timeClear"
              : "result.victory"
            : "result.gameOver",
        ),
      );
      writeText(elements["result-score"], i18n.formatNumber(snapshot.result.score, "score"));
      writeText(elements["result-chain"], i18n.formatNumber(snapshot.result.chain, "decimal2"));
      writeText(elements["result-graze"], i18n.formatNumber(snapshot.result.graze, "integer"));
      writeText(elements["result-kills"], i18n.formatNumber(snapshot.result.kills, "integer"));
      writeText(elements["result-grade"], snapshot.result.grade);
      writeClass(elements["new-record"], "visible", snapshot.result.isRecord);
    }
    syncTouchControlVisibility();
  }

  function syncTouchControlVisibility(): void {
    const visible =
      snapshot?.screen === "playing" && inputEnabled && inputPresentation.touchControls;
    writeHidden(elements["touch-drive"], !visible);
    writeAttribute(elements["touch-drive"], "aria-disabled", String(!inputEnabled));
    if (!visible) releaseGameplayInput();
  }

  function announce(message: string): void {
    elements["status-announcer"].replaceChildren(document.createTextNode(message));
    writeText(elements.toast, message);
    elements.toast.classList.add("visible");
    cancelToast?.();
    cancelToast = runtime.timeout(() => {
      cancelToast = null;
      elements.toast.classList.remove("visible");
    }, 1_400);
  }

  function bossEventName(id: number): string {
    const ids: readonly BossId[] = ["aella", "mirrorSaint", "algorithm"];
    const boss = ids[id];
    if (boss === undefined) throw new RangeError(`Unknown Neon boss event id: ${id}`);
    return i18n.t(bossNameKey(boss));
  }

  function translateEvent(event: any): string {
    switch (event.type) {
      case "scene.changed":
        return i18n.t(`announcement.scene.${event.scene}` as NeonCatalogKey);
      case "run.started":
        return i18n.t("announcement.run.started", {
          mode: i18n.t(`mode.${event.mode}.name` as NeonCatalogKey),
        });
      case "boss.entered":
        return i18n.t("announcement.boss.entered", { boss: bossEventName(event.id) });
      case "boss.phase.completed":
        return i18n.t("announcement.boss.phaseCompleted", { phase: event.phase + 1 });
      case "boss.destroyed":
        return i18n.t("announcement.boss.destroyed", { boss: bossEventName(event.id) });
      case "player.hit":
        return i18n.t("announcement.player.hit", { shield: event.shield });
      case "player.rebooted":
        return i18n.t("announcement.player.rebooted", { remaining: event.remaining });
      case "upgrade.offered":
        return i18n.t("announcement.upgrade.offered", { count: event.ids.length });
      case "upgrade.selected":
        return i18n.t("announcement.upgrade.selected", {
          upgrade: i18n.t(`upgrade.${event.id}.name` as NeonCatalogKey),
          level: event.level,
        });
      case "tutorial.autoFire":
        return i18n.t("announcement.tutorial.autoFire");
      case "tutorial.closeCall":
        return i18n.t("announcement.tutorial.closeCall");
      case "power.increased":
        return i18n.t("announcement.power.increased", { power: event.power });
      case "guard.firstSave":
        return i18n.t("announcement.guard.firstSave");
      case "guard.auto":
        return i18n.t("announcement.guard.auto");
      case "guard.pulse":
        return i18n.t("announcement.guard.pulse");
      case "overdrive.activated":
        return i18n.t("announcement.overdrive.activated");
      case "mode.resumed":
        return event.mode === "rush"
          ? i18n.t("announcement.mode.rushResumed", { bosses: event.bosses })
          : i18n.t("announcement.mode.endlessResumed", { sector: event.sector });
      case "run.finished":
        return i18n.t(event.victory ? "announcement.run.victory" : "announcement.run.defeat");
      default:
        throw new RangeError(`Unknown Neon UI event: ${event.type}`);
    }
  }

  function applyEvent(event: any): void {
    assertActive();
    if (
      event === null ||
      typeof event !== "object" ||
      !Number.isSafeInteger(event.tick) ||
      typeof event.type !== "string"
    ) {
      throw new TypeError("Neon UI event requires a semantic type and integer tick.");
    }
    if (event.type === "audio" || event.type === "enemy.destroyed") return;
    announcementEvent = targetWindow.structuredClone(event);
    announce(translateEvent(announcementEvent));
  }

  function apply(next: NeonUiSnapshot): void {
    assertActive();
    assertSnapshot(next);
    snapshot = next;
    if (next.screen !== "title") titleDialog = null;
    syncSnapshotFields();
    syncDialog();
  }

  function applyLocale(): void {
    assertActive();
    localizeStaticDom();
    syncInputLegend();
    syncHostSettings();
    syncSnapshotFields();
    if (announcementEvent !== null) {
      const message = translateEvent(announcementEvent);
      elements["status-announcer"].replaceChildren(document.createTextNode(message));
      writeText(elements.toast, message);
    }
    document.documentElement.dataset.i18nReady = "true";
  }

  function applyHostSettings(next: HostSettingsProjectionSnapshot): void {
    assertActive();
    if (
      next === null ||
      typeof next !== "object" ||
      next.canonical === null ||
      typeof next.canonical !== "object"
    ) {
      throw new TypeError("Neon Host settings projection is invalid.");
    }
    hostSettings = next;
    syncHostSettings();
  }

  function applyLifecycle(paused: boolean): void {
    assertActive();
    if (typeof paused !== "boolean") throw new TypeError("Lifecycle pause must be boolean.");
    const resumedPlaying = lifecyclePaused && !paused && snapshot?.screen === "playing";
    lifecyclePaused = paused;
    if (paused) releaseGameplayInput();
    syncDialog();
    if (resumedPlaying) onPlayingProjected();
  }

  function applyInputPresentation(next: NeonInputPresentation): void {
    assertActive();
    if (
      next === null ||
      typeof next !== "object" ||
      !["keyboard", "pointer", "touch", "gamepad"].includes(next.device) ||
      typeof next.touchControls !== "boolean"
    ) {
      throw new TypeError("Neon input presentation is invalid.");
    }
    inputPresentation = Object.freeze({ device: next.device, touchControls: next.touchControls });
    syncInputLegend();
    syncTouchControlVisibility();
  }

  function setInputEnabled(enabled: boolean): void {
    assertActive();
    if (typeof enabled !== "boolean")
      throw new TypeError("Host input enabled state must be boolean.");
    inputEnabled = enabled;
    syncTouchControlVisibility();
  }

  function handlePauseRequest(): boolean {
    assertActive();
    if (snapshot === null) throw new Error("Pause handling requires a projected scene.");
    if (snapshot.screen === "playing") {
      if (lifecyclePaused) {
        onResumeRequest();
        return true;
      }
      return false;
    }
    if (snapshot.screen === "title") {
      if (titleDialog !== null) {
        const active = titleDialog;
        titleDialog = null;
        dialogController.close(active);
      }
      return true;
    }
    return true;
  }

  return Object.freeze({
    apply,
    applyEvent,
    applyLocale,
    applyHostSettings,
    applyLifecycle,
    applyInputPresentation,
    setInputEnabled,
    releaseGameplayInput,
    handlePauseRequest,
    dispose(): void {
      if (disposed) return;
      releaseGameplayInput();
      cancelToast?.();
      cancelToast = null;
      dialogController.dispose();
      upgradeButtons.clear();
      snapshot = null;
      hostSettings = null;
      disposed = true;
    },
  });
}
