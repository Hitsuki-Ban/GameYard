import { connectGuest } from "@gameyard/guest-bridge";
import type { DiagnosticSnapshot } from "@gameyard/game-contract";

import { createRuntimeOwner } from "./runtime-owner.js";
import { NeonProfileError } from "./storage.js";

declare const __GAMEYARD_BUILD__: string;

const GAME_ID = "neon-overdrive";

function showBootFailure(error: unknown): void {
  console.error("Neon Overdrive guest initialization failed.", error);
  const failure = document.createElement("section");
  failure.className = "boot-failure";
  failure.dataset.neonBootError = "initialization";
  let cause: unknown = error;
  while (cause instanceof Error) {
    if (cause instanceof NeonProfileError) {
      failure.dataset.neonBootError = `profile.${cause.code}`;
      break;
    }
    cause = cause.cause;
  }
  const title = document.createElement("h1");
  title.textContent = "NEON OVERDRIVE // INIT FAILED";
  const detail = document.createElement("p");
  detail.textContent = error instanceof Error ? error.message : "Unknown initialization failure.";
  failure.append(title, detail);
  document.body.replaceChildren(failure);
}

async function boot(): Promise<void> {
  let owner: ReturnType<typeof createRuntimeOwner> | null = null;
  const requireOwner = (): ReturnType<typeof createRuntimeOwner> => {
    if (owner === null) throw new Error("Neon runtime has not been initialized.");
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
      diagnostics: {
        snapshot: () => requireOwner().diagnosticSnapshot() as DiagnosticSnapshot,
      },
    },
    initialize: (initializingBridge) => {
      owner = createRuntimeOwner({ targetWindow: window, document, bridge: initializingBridge });
    },
  });
  requireOwner().markReady();
  bridge.emitLifecycleState("ready");
}

void boot().catch(showBootFailure);
