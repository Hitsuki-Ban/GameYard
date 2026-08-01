import { connectGuest } from "@gameyard/guest-bridge";

import "./config.js";
import "./i18n.js";
import "./audio.js";
import "./input.js";
import "./model.js";
import "./render.js";

const GAME_ID = "pulse-link-overdrive";
const PLO = window.PLO;
const { clamp, formatTime } = PLO.util;

function gameLocale(locale) {
  switch (locale.resolved) {
    case "en":
      return "en";
    case "ja":
      return "ja";
    case "zh-Hans":
      return "zh-CN";
    default:
      throw new RangeError(`Unsupported Host locale: ${locale.resolved}`);
  }
}

class App {
  constructor(context, bridge) {
    this.context = context;
    this.bridge = bridge;
    this.resources = bridge.resources;
    this.lifecycle = "booting";
    this.disposed = false;
    this.hostPaused = true;
    this.hostInputEnabled = false;
    this.pendingResumeAction = null;
    this.events = [];
    this.save = new PLO.SaveStore();
    this.i18n = new PLO.I18n({ locale: gameLocale(context.locale) });
    this.dom = this.collectDom();
    this.bus = new PLO.EventBus();
    this.settings = this.mapSettings(context.settings);
    this.audio = new PLO.AudioEngine(this.settings);
    this.input = new PLO.InputManager(
      this.dom.canvas,
      this.dom.touchControls,
      this.bus,
      this.resources,
    );
    this.renderer = new PLO.Renderer(
      this.dom.canvas,
      this.bus,
      this.audio,
      this.settings,
      this.i18n,
      this.resources,
      { announcer: this.dom.announcer },
    );
    this.game = null;
    this.screen = "title";
    this.modal = null;
    this.modalReturnFocus = null;
    this.screenReturnFocus = null;
    this.lastA11yStatusUpdate = -Infinity;
    this.resultDelay = 0;
    this.resultProcessed = false;
    this.selectedMode = this.save.data.selectedMode;
    this.difficulty = clamp(this.save.data.difficulty, 0, 3);
    this.lastFrame = performance.now();
    this.audioUnlocked = false;
    this.tutorialArmed = false;
    this.cancelTutorialTimer = null;
    this.cancelFrame = null;
    this.unsubscribers = [];
    this.unsubscribers.push(this.save.subscribeStatus(() => this.updateSaveNotice()));
    this.unsubscribers.push(this.i18n.subscribe(() => this.applyLocale()));
    this.bindUI();
    this.bindGameEvents();
    this.i18n.apply();
    this.applySettingsToUI();
    this.updateTitleUI();
    this.setScreen("title");
    this.updateSaveNotice();
  }

  collectDom() {
    const byId = (id) => document.getElementById(id);
    return {
      app: byId("app"),
      canvas: byId("game-canvas"),
      title: byId("title-screen"),
      hud: byId("hud"),
      play: byId("play-button"),
      pause: byId("pause-button"),
      pauseScreen: byId("pause-screen"),
      resume: byId("resume-button"),
      restart: byId("restart-button"),
      quit: byId("quit-button"),
      resultScreen: byId("result-screen"),
      resultTitle: byId("result-title"),
      resultSubtitle: byId("result-subtitle"),
      resultScore: byId("result-score"),
      resultChain: byId("result-chain"),
      resultPressure: byId("result-pressure"),
      resultCard: byId("result-screen")?.querySelector(".result-card"),
      retry: byId("retry-button"),
      resultTitleButton: byId("result-title-button"),
      settingsButton: byId("settings-button"),
      settingsScreen: byId("settings-screen"),
      settingsClose: byId("settings-close"),
      helpButton: byId("help-button"),
      helpScreen: byId("help-screen"),
      helpClose: byId("help-close"),
      fullscreen: byId("fullscreen-button"),
      glyphs: byId("setting-glyphs"),
      haptics: byId("setting-haptics"),
      resetTutorial: byId("reset-tutorial"),
      resetTutorialLabel: byId("reset-tutorial-label"),
      modeCards: [...document.querySelectorAll(".mode-card")],
      difficultyPips: [...document.querySelectorAll("#difficulty-pips i")],
      difficultyPipsRoot: byId("difficulty-pips"),
      difficultyDown: byId("difficulty-down"),
      difficultyUp: byId("difficulty-up"),
      statWins: byId("stat-wins"),
      statBestChain: byId("stat-best-chain"),
      touchControls: byId("touch-controls"),
      timer: byId("match-timer"),
      announcer: byId("announcer"),
      gameStatus: byId("game-status"),
      assistAttack: byId("assist-attack"),
      assistDefense: byId("assist-defense"),
      ariaLive: byId("aria-live"),
      saveNotice: byId("save-notice"),
      saveNoticeText: byId("save-notice-text"),
      saveNoticeDismiss: byId("save-notice-dismiss"),
    };
  }

  mapSettings(settings) {
    return {
      master: settings.audio.master,
      music: settings.audio.music,
      sfx: settings.audio.sfx,
      reducedMotion: settings.motion.reduced,
      shake: settings.motion.screenShake,
      glyphs: this.save.data.settings.glyphs,
      haptics: this.save.data.settings.haptics,
    };
  }

  listen(target, type, listener) {
    this.resources.listen(target, type, listener);
  }

  bindUI() {
    const unlock = () => {
      void this.unlockAudio();
    };
    this.listen(window, "pointerdown", unlock);
    this.listen(window, "keydown", unlock);
    this.listen(this.dom.play, "click", () => this.startGame());
    this.listen(this.dom.pause, "click", () => this.requestPause());
    this.listen(this.dom.resume, "click", () => this.requestResume());
    this.listen(this.dom.restart, "click", () => this.requestResume("restart"));
    this.listen(this.dom.quit, "click", () => this.requestResume("title"));
    this.listen(this.dom.retry, "click", () => this.startGame());
    this.listen(this.dom.resultTitleButton, "click", () => this.goTitle());
    this.listen(this.dom.settingsButton, "click", () => this.openModal("settings"));
    this.listen(this.dom.settingsClose, "click", () => this.closeModal());
    this.listen(this.dom.helpButton, "click", () => this.openModal("help"));
    this.listen(this.dom.helpClose, "click", () => this.closeModal());
    this.listen(this.dom.fullscreen, "click", () =>
      this.bridge.requestHostAction("fullscreen.enter"),
    );
    this.listen(this.dom.assistAttack, "click", () => this.activateAssistAction("attack"));
    this.listen(this.dom.assistDefense, "click", () => this.activateAssistAction("defense"));
    this.listen(this.dom.saveNoticeDismiss, "click", () => this.save.dismissRecovery());
    this.listen(document, "keydown", (event) => this.handleDialogKeydown(event));
    this.listen(this.dom.glyphs, "input", () => this.applyGamePreferences());
    this.listen(this.dom.haptics, "input", () => this.applyGamePreferences());
    this.listen(this.dom.resetTutorial, "click", () => this.resetTutorial());
    this.listen(this.dom.difficultyDown, "click", () => this.setDifficulty(this.difficulty - 1));
    this.listen(this.dom.difficultyUp, "click", () => this.setDifficulty(this.difficulty + 1));
    this.listen(document, "visibilitychange", () => {
      this.audio.setVisible(!document.hidden);
      if (document.hidden) this.input.clearAll();
    });
    this.listen(window, "beforeunload", () => this.save.save());

    for (const card of this.dom.modeCards) {
      this.listen(card, "click", () => {
        this.selectedMode = card.dataset.mode;
        this.save.patch({ selectedMode: this.selectedMode });
        this.updateTitleUI();
        this.audio.move();
      });
    }

    this.input.onCanvasTap = (x, y) => {
      if (this.screen !== "game" || this.modal || this.hostPaused) return false;
      const hit = this.renderer.hitTest(x, y);
      if (hit === "attack") {
        this.input.pulse("attack", "canvas:attack");
        return true;
      }
      if (hit === "defense") {
        this.input.pulse("defense", "canvas:defense");
        return true;
      }
      return false;
    };

    this.unsubscribers.push(
      this.bus.on("input", (event) => {
        if (event.phase !== "press") return;
        if (event.action === "pause") {
          if (this.hostPaused) this.requestResume();
          else if (this.screen === "game") this.requestPause();
          return;
        }
        if (event.action === "confirm" && this.screen === "title" && !this.modal) this.startGame();
        if (this.screen === "game" && this.game?.state === "playing")
          this.game.tutorialInput(event.action);
      }),
    );
  }

  bindGameEvents() {
    const on = (type, listener) => this.unsubscribers.push(this.bus.on(type, listener));
    on("matchEnd", (event) => {
      if (event.game !== this.game || this.resultProcessed) return;
      this.resultProcessed = true;
      this.processResult(event);
      this.resultDelay = this.settings.reducedMotion ? 0.35 : 1.15;
    });
    on("tutorialComplete", () => {
      this.save.patch({ tutorialComplete: true });
      this.announceAria(this.i18n.t("aria.tutorialComplete"));
    });
    on("attackLaunch", (event) =>
      this.announceAria(
        this.i18n.t(event.from.isHuman ? "aria.attack" : "aria.opponentAttack", {
          lines: event.lines,
        }),
      ),
    );
    on("defense", (event) => {
      if (event.player.isHuman)
        this.announceAria(
          this.i18n.t("aria.defense", { canceled: event.canceled, purged: event.purged }),
        );
    });
    on("clearResolved", (event) => {
      if (event.player.isHuman && (event.chain >= 2 || event.clear.pulse))
        this.announceAria(this.i18n.t("aria.chainEnergy", { chain: event.chain }));
    });
  }

  async unlockAudio() {
    if (this.audioUnlocked || this.hostPaused) return;
    this.audioUnlocked = await this.audio.unlock();
    if (this.audioUnlocked && this.screen === "game") this.audio.setMusicActive(true);
  }

  applyGamePreferences() {
    this.save.patchSettings({ glyphs: this.dom.glyphs.checked, haptics: this.dom.haptics.checked });
    this.settings = this.mapSettings(this.context.settings);
    this.audio.applySettings(this.settings);
    this.renderer.setSettings(this.settings);
    if (this.game) this.game.settings = this.settings;
  }

  applyHostSettings(settings) {
    this.context = { ...this.context, settings };
    this.settings = this.mapSettings(settings);
    this.audio.applySettings(this.settings);
    this.renderer.setSettings(this.settings);
    if (this.game) this.game.settings = this.settings;
    this.record("info", "settings.applied", `Applied Host settings revision ${settings.revision}.`);
  }

  applyHostLocale(locale) {
    this.context = { ...this.context, locale };
    if (!this.i18n.setLocale(gameLocale(locale))) this.applyLocale();
    this.record("info", "locale.applied", `Applied Host locale ${locale.resolved}.`);
  }

  setHostInputEnabled(enabled) {
    this.hostInputEnabled = enabled;
    this.syncInputState();
  }

  syncInputState() {
    this.input.setEnabled(this.hostInputEnabled && !this.hostPaused && !this.disposed);
    this.input.active = this.input.enabled && this.screen === "game" && !this.modal;
  }

  requestPause() {
    if (this.hostPaused || this.screen !== "game" || this.game?.ended) return;
    this.bridge.requestLifecycleChange("pause");
  }

  requestResume(action = null) {
    if (!this.hostPaused) return;
    this.pendingResumeAction = action;
    this.bridge.requestLifecycleChange("resume");
  }

  async hostPause() {
    if (this.hostPaused) {
      this.lifecycle = "paused";
      this.bridge.emitLifecycleState("paused");
      return;
    }
    this.hostPaused = true;
    this.stopFrameLoop();
    this.screenReturnFocus = document.activeElement;
    if (this.screen === "game" && !this.game?.ended) this.setScreen("pause");
    this.input.clearAll();
    this.syncInputState();
    await this.audio.setPaused(true);
    this.lifecycle = "paused";
    this.bridge.emitLifecycleState("paused");
    this.announceAria(this.i18n.t("aria.paused"));
  }

  async hostResume() {
    if (!this.hostPaused) return;
    this.hostPaused = false;
    if (this.screen === "pause") this.setScreen("game");
    this.syncInputState();
    await this.audio.setPaused(false);
    const action = this.pendingResumeAction;
    this.pendingResumeAction = null;
    if (action === "restart") this.startGame();
    else if (action === "title") this.goTitle();
    else {
      const target = this.screenReturnFocus?.isConnected ? this.screenReturnFocus : this.dom.canvas;
      this.screenReturnFocus = null;
      this.focusNextFrame(target);
    }
    this.lastFrame = performance.now();
    this.scheduleFrame();
    this.lifecycle = "active";
    this.bridge.emitLifecycleState("active");
  }

  setDifficulty(value) {
    this.difficulty = clamp(value, 0, 3);
    this.save.patch({ difficulty: this.difficulty });
    this.updateTitleUI();
    this.audio.rotate();
  }

  applyLocale() {
    this.i18n.apply();
    this.updateTutorialButton();
    this.updateTitleUI();
    if (this.screen === "result") this.updateResultUI();
    this.updateGameAccessibility(performance.now(), true);
    this.updateSaveNotice();
  }

  resetTutorial() {
    this.save.resetTutorial();
    this.tutorialArmed = true;
    this.updateTutorialButton();
    this.cancelTutorialTimer?.();
    this.cancelTutorialTimer = this.resources.timeout(() => {
      this.cancelTutorialTimer = null;
      this.tutorialArmed = false;
      this.updateTutorialButton();
    }, 900);
  }

  updateTutorialButton() {
    this.dom.resetTutorialLabel.textContent = this.i18n.t(
      this.tutorialArmed ? "settings.tutorialArmed" : "settings.tutorialReplay",
    );
  }

  updateTitleUI() {
    for (const card of this.dom.modeCards) {
      const selected = card.dataset.mode === this.selectedMode;
      card.classList.toggle("is-selected", selected);
      card.setAttribute("aria-checked", String(selected));
    }
    this.dom.difficultyPips.forEach((pip, index) =>
      pip.classList.toggle("is-on", index <= this.difficulty),
    );
    const levelKey = ["difficulty.soft", "difficulty.core", "difficulty.hard", "difficulty.apex"][
      this.difficulty
    ];
    this.dom.difficultyPipsRoot.setAttribute(
      "aria-label",
      this.i18n.t("difficulty.current", { level: this.i18n.t(levelKey) }),
    );
    this.dom.statWins.textContent = this.i18n.formatNumber(this.save.data.stats.wins);
    this.dom.statBestChain.textContent = this.i18n.formatNumber(this.save.data.stats.bestChain);
  }

  applySettingsToUI() {
    this.dom.glyphs.checked = this.settings.glyphs;
    this.dom.haptics.checked = this.settings.haptics;
  }

  startGame(overrides = {}) {
    if (this.hostPaused) return;
    this.closeModal();
    void this.unlockAudio();
    const seedValue = new URLSearchParams(location.search).get("seed");
    const tutorial =
      overrides.tutorial ?? (!this.save.data.tutorialComplete && this.selectedMode === "duel");
    this.game = new PLO.GameSession({
      mode: overrides.mode || this.selectedMode,
      difficulty: overrides.difficulty ?? this.difficulty,
      seed: overrides.seed ?? (seedValue === null ? Date.now() : Number(seedValue)),
      tutorial,
      rank: this.save.data.stats.rank,
      bus: this.bus,
      audio: this.audio,
      settings: this.settings,
    });
    this.resultDelay = 0;
    this.resultProcessed = false;
    this.setScreen("game");
    this.audio.setMusicActive(true);
    this.input.clearAll();
    this.updateGameAccessibility(performance.now(), true);
    this.focusNextFrame(this.dom.canvas);
    this.announceAria(this.i18n.t("aria.matchStart"));
    this.lifecycle = "active";
    this.bridge.emitLifecycleState("active");
  }

  goTitle() {
    this.game = null;
    this.resultProcessed = false;
    this.resultDelay = 0;
    this.setScreen("title");
    this.updateTitleUI();
    this.audio.setMusicActive(false);
    this.audio.setIntensity(0.1, 0);
    this.input.clearAll();
    this.focusNextFrame(this.dom.play);
  }

  setScreen(screen) {
    this.screen = screen;
    this.dom.app.dataset.screen = screen;
    this.dom.title.hidden = screen !== "title";
    this.dom.hud.hidden = !["game", "pause", "result"].includes(screen);
    this.dom.pauseScreen.hidden = screen !== "pause";
    this.dom.resultScreen.hidden = screen !== "result";
    this.dom.touchControls.hidden = screen !== "game";
    this.dom.canvas.tabIndex = screen === "game" ? 0 : -1;
    this.syncInputState();
    if (screen === "title") this.dom.timer.hidden = true;
    const dialog = this.activeDialog();
    this.syncDialogState(dialog);
    if (screen === "pause") this.focusDialog(dialog, this.dom.resume);
    else if (screen === "result") this.focusDialog(dialog, this.dom.retry);
  }

  openModal(name) {
    if (!["settings", "help"].includes(name)) throw new RangeError(`Unsupported modal: ${name}`);
    this.modalReturnFocus = document.activeElement;
    this.modal = name;
    this.dom.settingsScreen.hidden = name !== "settings";
    this.dom.helpScreen.hidden = name !== "help";
    this.syncInputState();
    const dialog = this.activeDialog();
    this.syncDialogState(dialog);
    this.focusDialog(dialog, name === "settings" ? this.dom.settingsClose : this.dom.helpClose);
    this.audio.move();
  }

  closeModal() {
    if (!this.modal) return;
    this.dom.settingsScreen.hidden = true;
    this.dom.helpScreen.hidden = true;
    this.modal = null;
    this.syncInputState();
    this.input.clearAll();
    this.syncDialogState(this.activeDialog());
    const target = this.modalReturnFocus?.isConnected
      ? this.modalReturnFocus
      : this.screen === "title"
        ? this.dom.play
        : this.dom.canvas;
    this.modalReturnFocus = null;
    this.focusNextFrame(target);
  }

  activeDialog() {
    if (this.modal === "settings") return this.dom.settingsScreen;
    if (this.modal === "help") return this.dom.helpScreen;
    if (this.screen === "pause") return this.dom.pauseScreen;
    if (this.screen === "result") return this.dom.resultScreen;
    return null;
  }

  syncDialogState(dialog) {
    for (const element of [this.dom.canvas, this.dom.title, this.dom.hud, this.dom.touchControls])
      element.inert = !!dialog;
    this.dom.saveNotice.inert = !!dialog;
    this.dom.saveNotice.classList.toggle("is-suppressed", !!dialog);
    for (const element of [
      this.dom.pauseScreen,
      this.dom.resultScreen,
      this.dom.settingsScreen,
      this.dom.helpScreen,
    ])
      element.inert = !!dialog && element !== dialog;
  }

  focusNextFrame(target) {
    this.resources.animationFrame(() => target.focus());
  }

  focusDialog(dialog, preferred) {
    if (dialog) this.focusNextFrame(preferred || dialog.querySelector(".modal-card"));
  }

  dialogFocusables(dialog) {
    return [
      ...dialog.querySelectorAll(
        'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])',
      ),
    ].filter((element) => !element.hidden && element.getClientRects().length > 0);
  }

  handleDialogKeydown(event) {
    const dialog = this.activeDialog();
    if (!dialog) return;
    if (event.key === "Escape" && this.modal) {
      event.preventDefault();
      event.stopPropagation();
      this.closeModal();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = this.dialogFocusables(dialog);
    if (!focusable.length) {
      event.preventDefault();
      dialog.querySelector(".modal-card")?.focus();
      return;
    }
    const first = focusable[0],
      last = focusable.at(-1);
    if (
      event.shiftKey &&
      (document.activeElement === first || !dialog.contains(document.activeElement))
    ) {
      event.preventDefault();
      last.focus();
    } else if (
      !event.shiftKey &&
      (document.activeElement === last || !dialog.contains(document.activeElement))
    ) {
      event.preventDefault();
      first.focus();
    }
  }

  activateAssistAction(action) {
    const button = action === "attack" ? this.dom.assistAttack : this.dom.assistDefense;
    if (button.getAttribute("aria-disabled") !== "true")
      this.input.pulse(action, `assist:${action}`);
  }

  processResult({ game, winner }) {
    const won = winner === game.player;
    const isLab = game.mode === "lab";
    const stats = { ...this.save.data.stats, matches: this.save.data.stats.matches + 1 };
    if (!isLab) {
      if (won) {
        stats.wins++;
        stats.rank++;
      } else stats.losses++;
    }
    stats.bestChain = Math.max(stats.bestChain, game.player.maxChain);
    stats.highScore = Math.max(stats.highScore, game.player.score);
    stats.pressureSent += game.player.pressureSent;
    this.save.patchStats(stats);
    this.updateTitleUI();
  }

  updateResultUI() {
    if (!this.game) return;
    const won = this.game.winner === this.game.player;
    const lab = this.game.mode === "lab";
    this.dom.resultCard.classList.toggle("is-loss", !won && !lab);
    this.dom.resultTitle.textContent = this.i18n.t(
      lab ? "result.labTitle" : won ? "result.winTitle" : "result.lossTitle",
    );
    this.dom.resultSubtitle.textContent = this.i18n.t(
      lab ? "result.labResult" : won ? "result.victory" : "result.defeat",
    );
    this.dom.resultScore.textContent = this.i18n.formatNumber(this.game.player.score);
    this.dom.resultChain.textContent = this.i18n.formatNumber(this.game.player.maxChain);
    this.dom.resultPressure.textContent = this.i18n.formatNumber(this.game.player.pressureSent);
  }

  showResult() {
    if (!this.game) return;
    const won = this.game.winner === this.game.player;
    const lab = this.game.mode === "lab";
    this.updateResultUI();
    this.setScreen("result");
    this.audio.setMusicActive(false);
    this.announceAria(this.i18n.t(won || lab ? "aria.matchEnd" : "aria.matchLoss"));
  }

  updateHUD(now) {
    if (!this.game) return;
    const showTimer = this.game.mode === "blitz";
    this.dom.timer.hidden = !showTimer;
    if (showTimer) {
      this.dom.timer.textContent = formatTime(this.game.timeLeft);
      this.dom.timer.style.color = this.game.timeLeft < 10 ? "#ff5b7e" : "";
    }
    this.updateGameAccessibility(now);
  }

  updateGameAccessibility(now = performance.now(), force = false) {
    if (!this.game) {
      this.dom.gameStatus.textContent = "";
      this.dom.assistAttack.setAttribute("aria-disabled", "true");
      this.dom.assistDefense.setAttribute("aria-disabled", "true");
      return;
    }
    const ready =
      this.screen === "game" &&
      !this.hostPaused &&
      this.game.state === "playing" &&
      this.game.player.cp >= PLO.CONFIG.CAST_MIN_CP;
    this.dom.assistAttack.setAttribute("aria-disabled", String(!ready));
    this.dom.assistDefense.setAttribute("aria-disabled", String(!ready));
    if (!force && now - this.lastA11yStatusUpdate < 500) return;
    this.lastA11yStatusUpdate = now;
    const pack = (player) => ({
      score: this.i18n.formatNumber(player.score),
      energy: this.i18n.formatNumber(Math.floor(player.cp)),
      danger: this.i18n.formatNumber(Math.round(player.board.dangerRatio() * 100)),
      incoming: this.i18n.formatNumber(
        this.game.getIncomingLines(player) + player.board.pendingLines,
      ),
    });
    const player = pack(this.game.player),
      cpu = pack(this.game.cpu);
    this.dom.gameStatus.textContent = this.i18n.t("aria.gameSummary", {
      playerScore: player.score,
      playerEnergy: player.energy,
      playerDanger: player.danger,
      playerIncoming: player.incoming,
      cpuScore: cpu.score,
      cpuEnergy: cpu.energy,
      cpuDanger: cpu.danger,
      cpuIncoming: cpu.incoming,
    });
  }

  updateSaveNotice() {
    const recovery = this.save.recovery;
    this.dom.saveNotice.hidden = !recovery;
    this.dom.saveNoticeText.textContent = recovery ? this.i18n.t(`save.${recovery}`) : "";
  }

  scheduleFrame() {
    if (this.cancelFrame !== null) return;
    this.cancelFrame = this.resources.animationFrame((now) => {
      this.cancelFrame = null;
      this.loop(now);
    });
  }

  stopFrameLoop() {
    this.cancelFrame?.();
    this.cancelFrame = null;
  }

  loop(now) {
    if (this.disposed || this.hostPaused) return;
    const dt = Math.min(0.05, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    this.input.updateGamepads();
    if (this.screen === "game" && this.game && !this.modal) {
      this.game.update(dt, this.input);
      if (this.resultDelay > 0) {
        this.resultDelay -= dt;
        if (this.resultDelay <= 0) this.showResult();
      }
    }
    if (this.game)
      this.audio.setIntensity(this.game.globalIntensity, this.game.player.board.dangerRatio());
    else this.audio.setIntensity(0.08, 0);
    this.audio.update(dt);
    this.input.endFrame();
    this.updateHUD(now);
    this.renderer.render(this.game, this.screen, now);
    this.scheduleFrame();
  }

  announceAria(text) {
    this.dom.ariaLive.textContent = "";
    this.resources.animationFrame(() => {
      this.dom.ariaLive.textContent = text;
    });
  }

  record(level, code, message) {
    const event = { timestampMs: Date.now(), level, code, message };
    this.events.push(event);
    if (this.events.length > 32) this.events.shift();
    this.bridge.emitDiagnostic(event);
  }

  snapshot() {
    return {
      lifecycle: this.lifecycle,
      settingsRevision: this.context.settings.revision,
      inputEnabled: this.input.enabled,
      events: [...this.events],
    };
  }

  async dispose() {
    if (this.disposed) return;
    this.lifecycle = "disposing";
    this.bridge.emitLifecycleState("disposing");
    this.disposed = true;
    this.stopFrameLoop();
    this.cancelTutorialTimer?.();
    this.input.destroy();
    this.renderer.destroy();
    for (const unsubscribe of this.unsubscribers.splice(0)) unsubscribe();
    this.bus.clear();
    this.i18n.destroy();
    this.save.save();
    this.save.destroy();
    await this.audio.destroy();
    this.lifecycle = "disposed";
    this.bridge.emitLifecycleState("disposed");
  }
}

let app;

const requireApp = () => {
  if (!app) throw new Error("Pulse Link App is not initialized.");
  return app;
};

async function boot() {
  const bridge = await connectGuest({
    window,
    parent: window.parent,
    targetOrigin: window.location.origin,
    identity: { gameId: GAME_ID, buildId: __GAMEYARD_BUILD__ },
    handshakeTimeoutMs: 10_000,
    hooks: {
      settings: { apply: (settings) => requireApp().applyHostSettings(settings) },
      locale: { apply: (locale) => requireApp().applyHostLocale(locale) },
      input: {
        setEnabled: (enabled) => requireApp().setHostInputEnabled(enabled),
        releaseAll: () => requireApp().input.clearAll(),
      },
      lifecycle: {
        pause: () => requireApp().hostPause(),
        resume: () => requireApp().hostResume(),
        dispose: () => requireApp().dispose(),
      },
      diagnostics: { snapshot: () => requireApp().snapshot() },
    },
    initialize: (initializingBridge) => {
      app = new App(initializingBridge.context, initializingBridge);
    },
  });

  app.lifecycle = "ready";
  bridge.emitLifecycleState("ready");
}

void boot().catch((error) => {
  document.body.replaceChildren(
    Object.assign(document.createElement("p"), {
      className: "boot-failure",
      textContent: "PULSE LINK could not connect to GameYard.",
    }),
  );
  console.error(error);
});
