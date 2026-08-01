(() => {
  'use strict';
  const PLO = window.PLO;
  const { clamp, formatTime } = PLO.util;

  class App {
    constructor() {
      this.save = new PLO.SaveStore();
      this.i18n = PLO.i18n;
      if (!(this.i18n instanceof PLO.I18n)) throw new Error('App requires the bootstrapped I18n instance.');
      this.i18n.setMode(this.save.data.settings.localeMode);
      this.i18n.apply();
      this.dom = this.collectDom();
      this.unsubscribeSaveStatus = this.save.subscribeStatus(() => this.updateSaveNotice());
      this.bus = new PLO.EventBus();
      this.settings = { ...this.save.data.settings };
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) this.settings.reducedMotion = true;
      this.audio = new PLO.AudioEngine(this.settings);
      this.input = new PLO.InputManager(this.dom.canvas, this.dom.touchControls, this.bus);
      this.renderer = new PLO.Renderer(this.dom.canvas, this.bus, this.audio, this.settings, this.i18n, { announcer: this.dom.announcer });
      this.game = null;
      this.screen = 'title';
      this.modal = null;
      this.modalReturnFocus = null;
      this.screenReturnFocus = null;
      this.lastA11yStatusUpdate = -Infinity;
      this.resultDelay = 0;
      this.resultProcessed = false;
      this.selectedMode = this.save.data.selectedMode || 'duel';
      this.difficulty = clamp(this.save.data.difficulty ?? 1, 0, 3);
      this.lastFrame = performance.now();
      this.firstInteractionDone = false;
      this.tutorialArmed = false;
      this.tutorialResetTimer = 0;
      this.unsubscribeLocale = this.i18n.subscribe(() => this.applyLocale());
      this.bindUI();
      this.bindGameEvents();
      this.applySettingsToUI();
      this.updateTitleUI();
      this.setScreen('title');
      this.updateSaveNotice();
      this.installServiceWorker();
      requestAnimationFrame(t => this.loop(t));
    }

    collectDom() {
      const byId = id => document.getElementById(id);
      return {
        app: byId('app'), canvas: byId('game-canvas'), title: byId('title-screen'), hud: byId('hud'),
        play: byId('play-button'), pause: byId('pause-button'), pauseScreen: byId('pause-screen'),
        resume: byId('resume-button'), restart: byId('restart-button'), quit: byId('quit-button'),
        resultScreen: byId('result-screen'), resultTitle: byId('result-title'), resultSubtitle: byId('result-subtitle'),
        resultScore: byId('result-score'), resultChain: byId('result-chain'), resultPressure: byId('result-pressure'),
        resultCard: byId('result-screen')?.querySelector('.result-card'), retry: byId('retry-button'), resultTitleButton: byId('result-title-button'),
        settingsButton: byId('settings-button'), settingsScreen: byId('settings-screen'), settingsClose: byId('settings-close'),
        helpButton: byId('help-button'), helpScreen: byId('help-screen'), helpClose: byId('help-close'),
        sfx: byId('setting-sfx'), music: byId('setting-music'), shake: byId('setting-shake'),
        motion: byId('setting-motion'), glyphs: byId('setting-glyphs'), haptics: byId('setting-haptics'), resetTutorial: byId('reset-tutorial'),
        resetTutorialLabel: byId('reset-tutorial-label'), languageButtons: [...document.querySelectorAll('[data-locale-mode]')],
        modeCards: [...document.querySelectorAll('.mode-card')], difficultyPips: [...document.querySelectorAll('#difficulty-pips i')], difficultyPipsRoot: byId('difficulty-pips'),
        difficultyDown: byId('difficulty-down'), difficultyUp: byId('difficulty-up'),
        statWins: byId('stat-wins'), statBestChain: byId('stat-best-chain'),
        touchControls: byId('touch-controls'), timer: byId('match-timer'), announcer: byId('announcer'),
        gameStatus: byId('game-status'), assistAttack: byId('assist-attack'), assistDefense: byId('assist-defense'),
        ariaLive: byId('aria-live'), flashLayer: byId('flash-layer'),
        saveNotice: byId('save-notice'), saveNoticeText: byId('save-notice-text'), saveNoticeDismiss: byId('save-notice-dismiss')
      };
    }

    bindUI() {
      const unlock = () => this.unlockAudio();
      window.addEventListener('pointerdown', unlock, { once: true, passive: true });
      window.addEventListener('keydown', unlock, { once: true });

      this.dom.play.addEventListener('click', () => this.startGame());
      this.dom.pause.addEventListener('click', () => this.pauseGame());
      this.dom.resume.addEventListener('click', () => this.resumeGame());
      this.dom.restart.addEventListener('click', () => this.startGame());
      this.dom.quit.addEventListener('click', () => this.goTitle());
      this.dom.retry.addEventListener('click', () => this.startGame());
      this.dom.resultTitleButton.addEventListener('click', () => this.goTitle());
      this.dom.settingsButton.addEventListener('click', () => this.openModal('settings'));
      this.dom.settingsClose.addEventListener('click', () => this.closeModal());
      this.dom.helpButton.addEventListener('click', () => this.openModal('help'));
      this.dom.helpClose.addEventListener('click', () => this.closeModal());
      this.dom.assistAttack.addEventListener('click', () => this.activateAssistAction('attack'));
      this.dom.assistDefense.addEventListener('click', () => this.activateAssistAction('defense'));
      this.dom.saveNoticeDismiss.addEventListener('click', () => {
        this.save.dismissRecovery();
      });
      document.addEventListener('keydown', event => this.handleDialogKeydown(event));

      this.dom.languageButtons.forEach(button => button.addEventListener('click', () => this.setLocaleMode(button.dataset.localeMode)));

      this.dom.modeCards.forEach(card => card.addEventListener('click', () => {
        this.selectedMode = card.dataset.mode;
        this.save.patch({ selectedMode: this.selectedMode });
        this.updateTitleUI();
        this.audio.move();
      }));
      this.dom.difficultyDown.addEventListener('click', () => this.setDifficulty(this.difficulty - 1));
      this.dom.difficultyUp.addEventListener('click', () => this.setDifficulty(this.difficulty + 1));

      const onSettings = () => {
        this.settings = {
          ...this.settings,
          sfx: Number(this.dom.sfx.value) / 100,
          music: Number(this.dom.music.value) / 100,
          shake: this.dom.shake.checked,
          reducedMotion: this.dom.motion.checked,
          glyphs: this.dom.glyphs.checked,
          haptics: this.dom.haptics.checked
        };
        this.save.patchSettings(this.settings);
        this.audio.applySettings(this.settings);
        this.renderer.setSettings(this.settings);
        if (this.game) this.game.settings = this.settings;
      };
      for (const input of [this.dom.sfx,this.dom.music,this.dom.shake,this.dom.motion,this.dom.glyphs,this.dom.haptics]) input.addEventListener('input', onSettings);
      this.dom.resetTutorial.addEventListener('click', () => {
        this.save.resetTutorial();
        this.tutorialArmed = true;
        this.updateTutorialButton();
        clearTimeout(this.tutorialResetTimer);
        this.tutorialResetTimer = setTimeout(() => {
          this.tutorialArmed = false;
          this.updateTutorialButton();
        }, 900);
      });

      this.input.onCanvasTap = (x,y) => {
        if (this.screen !== 'game' || this.modal) return false;
        const hit = this.renderer.hitTest(x,y);
        if (hit === 'attack') { this.input.pulse('attack','canvas:attack'); return true; }
        if (hit === 'defense') { this.input.pulse('defense','canvas:defense'); return true; }
        return false;
      };

      this.bus.on('input', e => {
        if (e.phase !== 'press') return;
        if (e.action === 'pause') {
          if (this.screen === 'game') this.pauseGame();
          else if (this.screen === 'pause') this.resumeGame();
          return;
        }
        if (e.action === 'confirm' && this.screen === 'title' && !this.modal) this.startGame();
        if (this.screen === 'game' && this.game?.state === 'playing') this.game.tutorialInput(e.action);
      });

      document.addEventListener('visibilitychange', () => {
        this.audio.setVisible(!document.hidden);
        if (document.hidden && this.screen === 'game' && !this.game?.ended) this.pauseGame(true);
      });
      window.addEventListener('beforeunload', () => this.save.save());
    }

    bindGameEvents() {
      this.bus.on('matchEnd', e => {
        if (e.game !== this.game || this.resultProcessed) return;
        this.resultProcessed = true;
        this.processResult(e);
        this.resultDelay = this.settings.reducedMotion ? .35 : 1.15;
      });
      this.bus.on('tutorialComplete', () => {
        this.save.patch({ tutorialComplete: true });
        this.announceAria(this.i18n.t('aria.tutorialComplete'));
      });
      this.bus.on('attackLaunch', e => {
        if (e.from.isHuman) this.announceAria(this.i18n.t('aria.attack', { lines:e.lines }));
        else this.announceAria(this.i18n.t('aria.opponentAttack', { lines:e.lines }));
      });
      this.bus.on('defense', e => {
        if (e.player.isHuman) this.announceAria(this.i18n.t('aria.defense', { canceled:e.canceled, purged:e.purged }));
      });
      this.bus.on('clearResolved', e => {
        if (e.player.isHuman && (e.chain >= 2 || e.clear.pulse)) this.announceAria(this.i18n.t('aria.chainEnergy', { chain:e.chain }));
      });
    }

    async unlockAudio() {
      if (this.firstInteractionDone) return;
      this.firstInteractionDone = true;
      const ok = await this.audio.unlock();
      if (ok) this.audio.setMusicActive(true);
    }

    setDifficulty(value) {
      this.difficulty = clamp(value, 0, 3);
      this.save.patch({ difficulty: this.difficulty });
      this.updateTitleUI();
      this.audio.rotate();
    }

    setLocaleMode(mode) {
      if (!PLO.I18n.localeModes.includes(mode)) throw new RangeError(`Unsupported locale mode: ${mode}`);
      this.settings = { ...this.settings, localeMode:mode };
      this.save.patchSettings({ localeMode:mode });
      const changed = this.i18n.setMode(mode);
      if (!changed) this.updateLocaleControls();
      this.audio.move();
    }

    applyLocale() {
      this.i18n.apply();
      this.updateLocaleControls();
      this.updateTutorialButton();
      this.updateTitleUI();
      if (this.screen === 'result') this.updateResultUI();
      this.updateGameAccessibility(performance.now(), true);
      this.updateSaveNotice();
    }

    updateLocaleControls() {
      this.dom.languageButtons.forEach(button => {
        const selected = button.dataset.localeMode === this.i18n.mode;
        button.classList.toggle('is-selected', selected);
        button.setAttribute('aria-pressed', String(selected));
      });
    }

    updateTutorialButton() {
      this.dom.resetTutorialLabel.textContent = this.i18n.t(this.tutorialArmed ? 'settings.tutorialArmed' : 'settings.tutorialReplay');
    }

    updateTitleUI() {
      this.dom.modeCards.forEach(card => {
        const selected = card.dataset.mode === this.selectedMode;
        card.classList.toggle('is-selected', selected);
        card.setAttribute('aria-checked', String(selected));
      });
      this.dom.difficultyPips.forEach((pip,i) => pip.classList.toggle('is-on', i <= this.difficulty));
      const levelKey = ['difficulty.soft','difficulty.core','difficulty.hard','difficulty.apex'][this.difficulty];
      this.dom.difficultyPipsRoot.setAttribute('aria-label', this.i18n.t('difficulty.current', { level:this.i18n.t(levelKey) }));
      const stats = this.save.data.stats;
      this.dom.statWins.textContent = this.i18n.formatNumber(stats.wins);
      this.dom.statBestChain.textContent = this.i18n.formatNumber(stats.bestChain);
      this.updateLocaleControls();
    }

    applySettingsToUI() {
      this.dom.sfx.value = Math.round(this.settings.sfx * 100);
      this.dom.music.value = Math.round(this.settings.music * 100);
      this.dom.shake.checked = !!this.settings.shake;
      this.dom.motion.checked = !!this.settings.reducedMotion;
      this.dom.glyphs.checked = !!this.settings.glyphs;
      this.dom.haptics.checked = !!this.settings.haptics;
    }

    startGame(overrides = {}) {
      this.closeModal();
      this.unlockAudio();
      const urlSeed = new URLSearchParams(location.search).get('seed');
      const tutorial = overrides.tutorial ?? (!this.save.data.tutorialComplete && this.selectedMode === 'duel');
      this.game = new PLO.GameSession({
        mode: overrides.mode || this.selectedMode,
        difficulty: overrides.difficulty ?? this.difficulty,
        seed: overrides.seed ?? (urlSeed ? Number(urlSeed) : Date.now()),
        tutorial,
        rank: this.save.data.stats.rank,
        bus: this.bus,
        audio: this.audio,
        settings: this.settings
      });
      this.resultDelay = 0;
      this.resultProcessed = false;
      this.setScreen('game');
      this.audio.setMusicActive(true);
      this.input.clearAll();
      this.updateGameAccessibility(performance.now(), true);
      requestAnimationFrame(() => this.dom.canvas.focus());
      this.announceAria(this.i18n.t('aria.matchStart'));
    }

    pauseGame(auto = false) {
      if (this.screen !== 'game' || this.game?.ended) return;
      this.screenReturnFocus = document.activeElement;
      this.setScreen('pause');
      this.audio.setMusicActive(false);
      if (!auto) this.audio.move();
      this.announceAria(this.i18n.t('aria.paused'));
    }

    resumeGame() {
      if (this.screen !== 'pause') return;
      this.setScreen('game');
      this.audio.setMusicActive(true);
      this.input.clearAll();
      this.audio.rotate();
      const target = this.screenReturnFocus?.isConnected ? this.screenReturnFocus : this.dom.canvas;
      this.screenReturnFocus = null;
      requestAnimationFrame(() => target.focus());
    }

    goTitle() {
      this.game = null;
      this.resultProcessed = false;
      this.resultDelay = 0;
      this.setScreen('title');
      this.updateTitleUI();
      this.audio.setIntensity(.1,0);
      this.input.clearAll();
      requestAnimationFrame(() => this.dom.play.focus());
    }

    setScreen(screen) {
      this.screen = screen;
      this.dom.app.dataset.screen = screen;
      this.dom.title.hidden = screen !== 'title';
      this.dom.hud.hidden = !['game','pause','result'].includes(screen);
      this.dom.pauseScreen.hidden = screen !== 'pause';
      this.dom.resultScreen.hidden = screen !== 'result';
      this.dom.touchControls.hidden = screen !== 'game';
      this.dom.canvas.tabIndex = screen === 'game' ? 0 : -1;
      this.input.active = screen === 'game' && !this.modal;
      if (screen === 'title') this.dom.timer.hidden = true;
      const dialog = this.activeDialog();
      this.syncDialogState(dialog);
      if (screen === 'pause') this.focusDialog(dialog, this.dom.resume);
      else if (screen === 'result') this.focusDialog(dialog, this.dom.retry);
    }

    openModal(name) {
      if (!['settings','help'].includes(name)) throw new RangeError(`Unsupported modal: ${name}`);
      this.modalReturnFocus = document.activeElement;
      this.modal = name;
      this.dom.settingsScreen.hidden = name !== 'settings';
      this.dom.helpScreen.hidden = name !== 'help';
      this.input.active = false;
      const dialog = this.activeDialog();
      this.syncDialogState(dialog);
      this.focusDialog(dialog, name === 'settings' ? this.dom.settingsClose : this.dom.helpClose);
      this.audio.move();
    }

    closeModal() {
      if (!this.modal) return;
      this.dom.settingsScreen.hidden = true;
      this.dom.helpScreen.hidden = true;
      this.modal = null;
      this.input.active = this.screen === 'game';
      this.input.clearAll();
      this.syncDialogState(this.activeDialog());
      const target = this.modalReturnFocus?.isConnected ? this.modalReturnFocus : (this.screen === 'title' ? this.dom.play : this.dom.canvas);
      this.modalReturnFocus = null;
      requestAnimationFrame(() => target.focus());
    }

    activeDialog() {
      if (this.modal === 'settings') return this.dom.settingsScreen;
      if (this.modal === 'help') return this.dom.helpScreen;
      if (this.screen === 'pause') return this.dom.pauseScreen;
      if (this.screen === 'result') return this.dom.resultScreen;
      return null;
    }

    syncDialogState(dialog) {
      for (const element of [this.dom.canvas,this.dom.title,this.dom.hud,this.dom.touchControls]) {
        element.inert = !!dialog;
      }
      this.dom.saveNotice.inert = !!dialog;
      this.dom.saveNotice.classList.toggle('is-suppressed', !!dialog);
      for (const element of [this.dom.pauseScreen,this.dom.resultScreen,this.dom.settingsScreen,this.dom.helpScreen]) {
        element.inert = !!dialog && element !== dialog;
      }
    }

    focusDialog(dialog, preferred) {
      if (!dialog) return;
      requestAnimationFrame(() => (preferred || dialog.querySelector('.modal-card')).focus());
    }

    dialogFocusables(dialog) {
      return [...dialog.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')]
        .filter(element => !element.hidden && element.getClientRects().length > 0);
    }

    handleDialogKeydown(event) {
      const dialog = this.activeDialog();
      if (!dialog) return;
      if (event.key === 'Escape' && this.modal) {
        event.preventDefault();
        event.stopPropagation();
        this.closeModal();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = this.dialogFocusables(dialog);
      if (!focusable.length) {
        event.preventDefault();
        dialog.querySelector('.modal-card')?.focus();
        return;
      }
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    }

    activateAssistAction(action) {
      const button = action === 'attack' ? this.dom.assistAttack : this.dom.assistDefense;
      if (button.getAttribute('aria-disabled') === 'true') return;
      this.input.pulse(action, `assist:${action}`);
    }

    processResult({ game, winner }) {
      const won = winner === game.player;
      const isLab = game.mode === 'lab';
      const stats = { ...this.save.data.stats };
      stats.matches++;
      if (!isLab) {
        if (won) { stats.wins++; stats.rank++; }
        else stats.losses++;
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
      const lab = this.game.mode === 'lab';
      this.dom.resultCard.classList.toggle('is-loss', !won && !lab);
      this.dom.resultTitle.textContent = this.i18n.t(lab ? 'result.labTitle' : won ? 'result.winTitle' : 'result.lossTitle');
      this.dom.resultSubtitle.textContent = this.i18n.t(lab ? 'result.labResult' : won ? 'result.victory' : 'result.defeat');
      this.dom.resultScore.textContent = this.i18n.formatNumber(this.game.player.score);
      this.dom.resultChain.textContent = this.i18n.formatNumber(this.game.player.maxChain);
      this.dom.resultPressure.textContent = this.i18n.formatNumber(this.game.player.pressureSent);
    }

    showResult() {
      if (!this.game) return;
      const won = this.game.winner === this.game.player;
      const lab = this.game.mode === 'lab';
      this.updateResultUI();
      this.setScreen('result');
      this.announceAria(this.i18n.t(won || lab ? 'aria.matchEnd' : 'aria.matchLoss'));
    }

    updateHUD(now) {
      if (!this.game) return;
      const showTimer = this.game.mode === 'blitz';
      this.dom.timer.hidden = !showTimer;
      if (showTimer) {
        this.dom.timer.textContent = formatTime(this.game.timeLeft);
        this.dom.timer.style.color = this.game.timeLeft < 10 ? '#ff5b7e' : '';
      }
      this.updateGameAccessibility(now);
    }

    updateGameAccessibility(now = performance.now(), force = false) {
      if (!this.game) {
        this.dom.gameStatus.textContent = '';
        this.dom.assistAttack.setAttribute('aria-disabled', 'true');
        this.dom.assistDefense.setAttribute('aria-disabled', 'true');
        return;
      }
      const ready = this.screen === 'game' && this.game.state === 'playing' && this.game.player.cp >= PLO.CONFIG.CAST_MIN_CP;
      this.dom.assistAttack.setAttribute('aria-disabled', String(!ready));
      this.dom.assistDefense.setAttribute('aria-disabled', String(!ready));
      if (!force && now - this.lastA11yStatusUpdate < 500) return;
      this.lastA11yStatusUpdate = now;
      const pack = player => ({
        score: this.i18n.formatNumber(player.score),
        energy: this.i18n.formatNumber(Math.floor(player.cp)),
        danger: this.i18n.formatNumber(Math.round(player.board.dangerRatio() * 100)),
        incoming: this.i18n.formatNumber(this.game.getIncomingLines(player) + player.board.pendingLines)
      });
      const player = pack(this.game.player), cpu = pack(this.game.cpu);
      this.dom.gameStatus.textContent = this.i18n.t('aria.gameSummary', {
        playerScore:player.score, playerEnergy:player.energy, playerDanger:player.danger, playerIncoming:player.incoming,
        cpuScore:cpu.score, cpuEnergy:cpu.energy, cpuDanger:cpu.danger, cpuIncoming:cpu.incoming
      });
    }

    updateSaveNotice() {
      const recovery = this.save.recovery;
      this.dom.saveNotice.hidden = !recovery;
      this.dom.saveNoticeText.textContent = recovery ? this.i18n.t(`save.${recovery}`) : '';
    }

    loop(now) {
      const dt = Math.min(.05, Math.max(0, (now - this.lastFrame) / 1000));
      this.lastFrame = now;
      this.input.updateGamepads();

      if (this.screen === 'game' && this.game && !this.modal) {
        this.game.update(dt, this.input);
        if (this.resultDelay > 0) {
          this.resultDelay -= dt;
          if (this.resultDelay <= 0) this.showResult();
        }
      }
      this.updateHUD(now);
      if (this.game) this.audio.setIntensity(this.game.globalIntensity, this.game.player.board.dangerRatio());
      else this.audio.setIntensity(.08,0);
      this.audio.update(dt);
      this.renderer.render(this.game, this.screen, now);
      this.input.endFrame();
      requestAnimationFrame(t => this.loop(t));
    }

    announceAria(text) {
      this.dom.ariaLive.textContent = '';
      requestAnimationFrame(() => { this.dom.ariaLive.textContent = text; });
    }

    installServiceWorker() {
      if (!window.__PULSE_LINK_STANDALONE__ && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
        window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(err => console.warn('Service worker registration failed:', err)));
      }
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    const app = new App();
    window.__PULSE_LINK__ = {
      app,
      start: options => app.startGame(options || {}),
      title: () => app.goTitle(),
      snapshot: () => app.game?.snapshot() || null,
      input: action => app.input.pulse(action, 'debug'),
      setCP: value => { if (app.game) app.game.player.cp = clamp(Number(value)||0,0,PLO.CONFIG.MAX_CP); },
      addLines: lines => app.game?.player.board.receiveLines(Number(lines)||1),
      end: win => app.game?.endMatch(win === false ? app.game.cpu : app.game.player, 'debug'),
      locale: mode => {
        if (mode !== undefined) app.setLocaleMode(mode);
        return { mode:app.i18n.mode, locale:app.i18n.locale };
      },
      clearSave: () => {
        app.save.clear();
        app.settings = { ...app.save.data.settings };
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) app.settings.reducedMotion = true;
        app.audio.applySettings(app.settings);
        app.renderer.setSettings(app.settings);
        if (app.game) app.game.settings = app.settings;
        app.applySettingsToUI();
        if (!app.i18n.setMode(app.settings.localeMode)) app.applyLocale();
      }
    };
  });
})();
