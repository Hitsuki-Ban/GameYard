import { connectGuest } from "@gameyard/guest-bridge";

import "../i18n.js";
import { createCrownBreakerGame } from "../game.js";

const GAME_ID = "crown-breaker";
let game;
let failureLocale = globalThis.CrownBreakerI18n.resolveLocale("system");

function requireGame() {
  if (!game) throw new Error("CrownBreaker is not initialized.");
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
      failureLocale =
        initializingBridge.context.locale.resolved === "zh-Hans"
          ? "zh-CN"
          : initializingBridge.context.locale.resolved;
      game = createCrownBreakerGame({
        context: initializingBridge.context,
        bridge: initializingBridge,
      });
    },
  });

  game.markReady();
  bridge.emitLifecycleState("ready");
}

void boot().catch((error) => {
  console.error("CrownBreaker guest initialization failed.", error);
  document.documentElement.lang = failureLocale;
  document.documentElement.dataset.i18nReady = "true";
  document.body.replaceChildren(
    Object.assign(document.createElement("p"), {
      className: "boot-failure",
      textContent: globalThis.CrownBreakerI18n.translate(failureLocale, "boot.failure"),
    }),
  );
});
