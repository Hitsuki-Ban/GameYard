import { connectGuest } from '@gameyard/guest-bridge';

import './i18n.js';
import './content.js';
import './audio.js';
import './semantic-ui.js';
import './game.js';

const GAME_ID = 'tumbledrum';
let game;

function requireGame() {
  if (!game) throw new Error('TUMBLEDRUM is not initialized.');
  return game;
}

async function boot() {
  const bridge = await connectGuest({
    window,
    parent: window.parent,
    targetOrigin: window.location.origin,
    identity: { gameId: GAME_ID, buildId: __GAMEYARD_BUILD__ },
    handshakeTimeoutMs: 10_000,
    hooks: {
      settings: { apply: (settings) => requireGame().applyHostSettings(settings) },
      locale: { apply: (locale) => requireGame().applyHostLocale(locale) },
      input: {
        setEnabled: (enabled) => requireGame().setInputEnabled(enabled),
        releaseAll: () => requireGame().releaseAllInput(),
      },
      lifecycle: {
        pause: () => requireGame().hostPause(),
        resume: () => requireGame().hostResume(),
        dispose: () => requireGame().dispose(),
      },
      diagnostics: { snapshot: () => requireGame().diagnosticSnapshot() },
    },
    initialize: (initializingBridge) => {
      const canvas = document.getElementById('game');
      const status = document.getElementById('status');
      if (!(canvas instanceof HTMLCanvasElement) || !(status instanceof HTMLParagraphElement)) {
        throw new Error('TUMBLEDRUM requires #game canvas and #status paragraph nodes.');
      }
      game = new window.TD.Game(canvas, status, initializingBridge.context, initializingBridge);
    },
  });

  game.markReady();
  bridge.emitLifecycleState('ready');
}

void boot().catch((error) => {
  console.error('TUMBLEDRUM guest initialization failed.', error);
  document.documentElement.dataset.i18nReady = 'true';
  document.body.replaceChildren(
    Object.assign(document.createElement('p'), {
      className: 'boot-failure',
      textContent: window.TD.I18N.t('boot.failure'),
    }),
  );
});
