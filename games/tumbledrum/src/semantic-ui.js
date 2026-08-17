(function () {
  'use strict';

  const TD = (window.TD = window.TD || {});
  const I18N = TD.I18N;
  if (!I18N) throw new Error('TUMBLEDRUM semantic UI requires i18n.js.');

  const PANEL_IDS = Object.freeze([
    'semantic-title',
    'semantic-gameplay',
    'semantic-settings',
    'semantic-pause',
    'semantic-upgrade',
    'semantic-result'
  ]);

  function requireElement(root, id, constructor) {
    const element = root.querySelector(`#${id}`);
    if (!(element instanceof constructor)) {
      throw new TypeError(`TUMBLEDRUM semantic UI requires #${id}.`);
    }
    return element;
  }

  class SemanticUI {
    constructor(root, game, resources) {
      if (!(root instanceof HTMLElement)) {
        throw new TypeError('TUMBLEDRUM semantic UI requires #semantic-ui.');
      }
      this.root = root;
      this.game = game;
      this.disposed = false;
      this.activePanelId = null;
      this.upgradeSignature = '';
      this.lastSnapshotSignature = '';
      this.lastSyncAt = 0;

      this.panels = Object.fromEntries(
        PANEL_IDS.map((id) => [id, requireElement(root, id, HTMLElement)])
      );
      this.refs = {
        titleHeading: requireElement(root, 'semantic-title-heading', HTMLElement),
        campaign: requireElement(root, 'semantic-campaign', HTMLButtonElement),
        campaignDescription: requireElement(root, 'campaign-description', HTMLElement),
        endless: requireElement(root, 'semantic-endless', HTMLButtonElement),
        endlessDescription: requireElement(root, 'endless-description', HTMLElement),
        settingsOpen: requireElement(root, 'semantic-settings-open', HTMLButtonElement),
        gameplayHeading: requireElement(root, 'semantic-gameplay-heading', HTMLElement),
        gameplaySummary: requireElement(root, 'semantic-gameplay-summary', HTMLElement),
        gameplayAction: requireElement(root, 'semantic-gameplay-action', HTMLButtonElement),
        pauseOpen: requireElement(root, 'semantic-pause-open', HTMLButtonElement),
        settingsHeading: requireElement(root, 'semantic-settings-heading', HTMLElement),
        contrast: requireElement(root, 'semantic-contrast', HTMLInputElement),
        contrastLabel: requireElement(root, 'semantic-contrast-label', HTMLElement),
        contrastDescription: requireElement(root, 'contrast-description', HTMLElement),
        fullscreen: requireElement(root, 'semantic-fullscreen', HTMLButtonElement),
        fullscreenDescription: requireElement(root, 'fullscreen-description', HTMLElement),
        settingsBack: requireElement(root, 'semantic-settings-back', HTMLButtonElement),
        pauseHeading: requireElement(root, 'semantic-pause-heading', HTMLElement),
        resume: requireElement(root, 'semantic-resume', HTMLButtonElement),
        pauseExit: requireElement(root, 'semantic-pause-exit', HTMLButtonElement),
        upgradeHeading: requireElement(root, 'semantic-upgrade-heading', HTMLElement),
        upgradeFieldset: requireElement(root, 'semantic-upgrade-fieldset', HTMLFieldSetElement),
        upgradeOptions: requireElement(root, 'semantic-upgrade-options', HTMLElement),
        upgradeConfirm: requireElement(root, 'semantic-upgrade-confirm', HTMLButtonElement),
        resultHeading: requireElement(root, 'semantic-result-heading', HTMLElement),
        resultPrimary: requireElement(root, 'semantic-result-primary', HTMLButtonElement),
        resultSecondary: requireElement(root, 'semantic-result-secondary', HTMLButtonElement)
      };

      resources.listen(root, 'click', (event) => this.handleClick(event));
      resources.listen(root, 'change', (event) => this.handleChange(event));
      resources.listen(root, 'focusin', (event) => this.handleFocusIn(event));
      this.localize();
      this.sync(true);
    }

    owns(target) {
      return target instanceof Node && this.root.contains(target);
    }

    handleClick(event) {
      if (this.disposed) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const control = target.closest('[data-action]');
      if (!(control instanceof HTMLElement) || !this.root.contains(control)) return;
      const action = control.dataset.action;
      event.stopPropagation();
      switch (action) {
        case 'campaign':
          this.game.startRun('campaign');
          this.focusCanvas();
          break;
        case 'endless':
          this.game.startRun('endless');
          this.focusCanvas();
          break;
        case 'settings-open':
          this.game.openSettings();
          this.focusInitial();
          break;
        case 'gameplay-action':
          if (this.game.paradeReady) this.game.activateParade();
          else this.game.launchStuckBalls();
          this.focusCanvas();
          break;
        case 'pause':
          this.game.togglePause();
          break;
        case 'fullscreen':
          this.game.toggleFullscreen();
          break;
        case 'settings-back':
          this.game.closeSettings();
          this.focusInitial();
          break;
        case 'resume':
          this.game.resumeFromPause();
          break;
        case 'exit':
          this.game.returnToTitle();
          this.focusInitial();
          break;
        case 'upgrade-confirm':
          this.game.chooseUpgrade(this.game.menuIndex);
          this.focusCanvas();
          break;
        case 'result-primary':
          if (this.game.state === 'victory') this.game.returnToTitle();
          else this.game.startRun('endless');
          this.game.state === 'title' ? this.focusInitial() : this.focusCanvas();
          break;
        case 'result-secondary':
          if (this.game.state === 'victory') {
            this.game.startRun('endless');
            this.focusCanvas();
          } else {
            this.game.returnToTitle();
            this.focusInitial();
          }
          break;
        default:
          throw new RangeError(`Unknown TUMBLEDRUM semantic action: ${String(action)}`);
      }
      this.sync(true);
    }

    handleChange(event) {
      if (this.disposed) return;
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || !this.root.contains(target)) return;
      event.stopPropagation();
      if (target.dataset.setting === 'contrast') {
        this.game.setSetting('contrast', target.checked);
        this.sync(true);
        return;
      }
      if (target.name === 'tumbledrum-upgrade') {
        const index = Number(target.value);
        if (!Number.isInteger(index) || !this.game.upgradeOffers[index]) {
          throw new RangeError(`Invalid TUMBLEDRUM upgrade option: ${target.value}`);
        }
        this.game.menuIndex = index;
        this.sync(true);
        return;
      }
      throw new RangeError('Unknown TUMBLEDRUM semantic control change.');
    }

    handleFocusIn(event) {
      const target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLButtonElement)) return;
      this.game.keyboardNavigationActive = true;
      const titleIndexes = { campaign: 0, endless: 1, 'settings-open': 2 };
      const action = target.dataset.action;
      if (Object.prototype.hasOwnProperty.call(titleIndexes, action)) {
        this.game.titleIndex = titleIndexes[action];
      } else if (target.dataset.setting === 'contrast') {
        this.game.settingsIndex = 0;
      } else if (action === 'fullscreen') {
        this.game.settingsIndex = 1;
      } else if (target.name === 'tumbledrum-upgrade') {
        const index = Number(target.value);
        if (!Number.isInteger(index) || !this.game.upgradeOffers[index]) {
          throw new RangeError(`Invalid focused TUMBLEDRUM upgrade option: ${target.value}`);
        }
        this.game.menuIndex = index;
      }
    }

    localize() {
      const refs = this.refs;
      this.root.setAttribute('aria-label', I18N.t('semantic.controls'));
      refs.titleHeading.textContent = I18N.t('semantic.title');
      refs.campaign.textContent = I18N.t('action.campaign');
      refs.campaignDescription.textContent = I18N.t('action.campaignDescription');
      refs.endless.textContent = I18N.t('action.endless');
      refs.endlessDescription.textContent = I18N.t('action.endlessDescription');
      refs.settingsOpen.textContent = I18N.t('action.settings');
      refs.gameplayHeading.textContent = I18N.t('semantic.gameplay');
      refs.pauseOpen.textContent = I18N.t('action.pause');
      refs.settingsHeading.textContent = I18N.t('semantic.settings');
      refs.contrastLabel.textContent = I18N.t('settings.contrast');
      refs.contrastDescription.textContent = I18N.t('settings.contrastDescription');
      refs.contrast.setAttribute('aria-describedby', 'contrast-description');
      refs.fullscreen.textContent = I18N.t('settings.fullscreen');
      refs.fullscreenDescription.textContent = I18N.t('settings.fullscreenDescription');
      refs.settingsBack.textContent = I18N.t('action.back');
      refs.pauseHeading.textContent = I18N.t('semantic.pause');
      refs.resume.textContent = I18N.t('action.resume');
      refs.pauseExit.textContent = I18N.t('action.exit');
      refs.upgradeHeading.textContent = I18N.t('semantic.upgrade');
      refs.upgradeConfirm.textContent = I18N.t('action.confirm');
      refs.resultPrimary.textContent = I18N.t('action.home');
      refs.resultSecondary.textContent = I18N.t('action.endless');
      this.upgradeSignature = '';
    }

    snapshot() {
      const game = this.game;
      const required = game.bricks ? game.requiredRemaining() : 0;
      return {
        state: game.state,
        paused: game.paused,
        mode: game.mode,
        stage: game.mode === 'campaign' ? (game.stageIndex || 0) + 1 : game.endlessWave || 1,
        lives: Math.max(0, (game.reserve == null ? 0 : game.reserve) + 1),
        score: Math.round(game.score || 0),
        required,
        contrast: !!game.settings.contrast,
        paradeReady: !!game.paradeReady,
        menuIndex: game.menuIndex,
        offers: (game.upgradeOffers || []).map((offer) => ({
          id: offer.id,
          max: offer.max,
          level: game.runUpgrades?.[offer.id] || 0
        }))
      };
    }

    panelFor(snapshot) {
      if (snapshot.paused) return 'semantic-pause';
      if (snapshot.state === 'title') return 'semantic-title';
      if (snapshot.state === 'settings') return 'semantic-settings';
      if (snapshot.state === 'upgrade' || snapshot.state === 'upgradeChosen') {
        return 'semantic-upgrade';
      }
      if (snapshot.state === 'victory' || snapshot.state === 'gameover') {
        return 'semantic-result';
      }
      return 'semantic-gameplay';
    }

    sync(force = false) {
      if (this.disposed) return;
      const now = performance.now();
      if (!force && now - this.lastSyncAt < 250) return;
      this.lastSyncAt = now;
      const snapshot = this.snapshot();
      const signature = JSON.stringify(snapshot);
      if (!force && signature === this.lastSnapshotSignature) return;
      this.lastSnapshotSignature = signature;

      const panelId = this.panelFor(snapshot);
      for (const [id, panel] of Object.entries(this.panels)) panel.hidden = id !== panelId;
      this.activePanelId = panelId;
      const blockedByHost = !this.game.inputEnabled && !snapshot.paused;
      this.root.inert = blockedByHost;
      this.root.setAttribute('aria-disabled', String(blockedByHost));

      this.refs.contrast.checked = snapshot.contrast;
      this.refs.gameplayAction.textContent = I18N.t(
        snapshot.paradeReady ? 'action.parade' : 'action.launch'
      );
      this.refs.gameplaySummary.textContent = I18N.t('status.gameplaySummary', {
        mode: I18N.t(`mode.${snapshot.mode}`),
        stage: snapshot.stage,
        lives: snapshot.lives,
        score: snapshot.score,
        required: snapshot.required
      });

      if (panelId === 'semantic-upgrade') this.syncUpgradeOptions(snapshot);
      if (panelId === 'semantic-result') this.syncResult(snapshot);
    }

    syncUpgradeOptions(snapshot) {
      const disabled = snapshot.state === 'upgradeChosen';
      const signature = `${I18N.locale}|${disabled}|${snapshot.offers
        .map((offer) => `${offer.id}:${offer.level}:${offer.max}`)
        .join('|')}`;
      if (signature !== this.upgradeSignature) {
        const fragment = document.createDocumentFragment();
        snapshot.offers.forEach((offer, index) => {
          const label = document.createElement('label');
          label.className = 'semantic-control semantic-upgrade-option';
          const input = document.createElement('input');
          input.type = 'radio';
          input.name = 'tumbledrum-upgrade';
          input.value = String(index);
          input.disabled = disabled;
          const text = document.createElement('span');
          text.textContent = I18N.t('upgrade.option', {
            name: I18N.t(`upgrade.${offer.id}.name`),
            description: I18N.t(`upgrade.${offer.id}.description`),
            level: offer.level,
            max: offer.max
          });
          label.append(input, text);
          fragment.append(label);
        });
        this.refs.upgradeOptions.replaceChildren(fragment);
        this.upgradeSignature = signature;
      }
      const options = this.refs.upgradeOptions.querySelectorAll('input[type="radio"]');
      options.forEach((option, index) => {
        option.checked = index === snapshot.menuIndex;
        option.disabled = disabled;
      });
      this.refs.upgradeFieldset.disabled = disabled;
      this.refs.upgradeConfirm.disabled = disabled || snapshot.offers.length === 0;
    }

    syncResult(snapshot) {
      const victory = snapshot.state === 'victory';
      this.refs.resultHeading.textContent = I18N.t(
        victory ? 'semantic.victory' : 'semantic.gameover'
      );
      this.refs.resultPrimary.textContent = I18N.t(victory ? 'action.home' : 'action.retry');
      this.refs.resultSecondary.textContent = I18N.t(victory ? 'action.endless' : 'action.home');
    }

    focusInitial() {
      if (this.disposed || !this.activePanelId) return;
      const panel = this.panels[this.activePanelId];
      const control = panel.querySelector('button:not(:disabled), input:not(:disabled)');
      if (!(control instanceof HTMLElement)) {
        throw new Error(`TUMBLEDRUM semantic panel ${this.activePanelId} has no enabled control.`);
      }
      control.focus({ preventScroll: true });
    }

    focusCanvas() {
      this.game.canvas.focus({ preventScroll: true });
    }

    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      this.root.hidden = true;
    }
  }

  TD.SemanticUI = SemanticUI;
})();
