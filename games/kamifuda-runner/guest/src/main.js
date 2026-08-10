import { connectGuest } from "@gameyard/guest-bridge";

import { createRuntimeOwner } from "./runtime-owner.js";
import { createProfileStorage, KamifudaProfileError } from "./storage.js";

const GAME_ID = "kamifuda-runner";

function showBootFailure(error) {
  let profileError = null;
  let current = error;
  while (current instanceof Error) {
    if (current instanceof KamifudaProfileError) {
      profileError = current;
      break;
    }
    current = current.cause;
  }
  const card = document.createElement("section");
  card.className = "boot-failure";
  const heading = document.createElement("h1");
  heading.textContent = "紙札疾走録を開始できません";
  const detail = document.createElement("p");
  detail.textContent =
    profileError?.message ||
    (error instanceof Error ? error.message : "Unknown initialization failure.");
  card.append(heading, detail);
  if (profileError) {
    const reset = document.createElement("button");
    reset.type = "button";
    reset.textContent = "保存データを明示的に初期化";
    reset.addEventListener(
      "click",
      () => {
        createProfileStorage(window.localStorage).reset();
        window.location.reload();
      },
      { once: true },
    );
    card.append(reset);
  }
  document.body.replaceChildren(card);
}

async function boot() {
  let owner = null;
  const requireOwner = () => {
    if (owner === null) throw new Error("Kamifuda runtime has not been initialized.");
    return owner;
  };
  const bridge = await connectGuest({
    window,
    parent: window.parent,
    targetOrigin: window.location.origin,
    identity: { gameId: GAME_ID, buildId: __GAMEYARD_BUILD__ },
    handshakeTimeoutMs: 10_000,
    hooks: {
      settings: { apply: (settings) => requireOwner().applyHostSettings(settings) },
      locale: { apply: (locale) => requireOwner().applyHostLocale(locale) },
      input: {
        setEnabled: (enabled) => requireOwner().setInputEnabled(enabled),
        releaseAll: () => requireOwner().releaseAllInput(),
      },
      lifecycle: {
        pause: () => requireOwner().hostPause(),
        resume: () => requireOwner().hostResume(),
        dispose: () => requireOwner().dispose(),
      },
      diagnostics: { snapshot: () => requireOwner().diagnosticSnapshot() },
    },
    initialize: (initializingBridge) => {
      owner = createRuntimeOwner({ targetWindow: window, document, bridge: initializingBridge });
    },
  });
  requireOwner().markReady();
  bridge.emitLifecycleState("ready");
}

void boot().catch((error) => {
  console.error("Kamifuda Runner guest initialization failed.", error);
  showBootFailure(error);
});
