import { connectGuest } from "@gameyard/guest-bridge";
import type { DiagnosticSnapshot } from "@gameyard/game-contract";

import { createNeonI18n } from "./i18n.js";
import { createRuntimeOwner } from "./runtime-owner.js";
import { NeonProfileError } from "./storage.js";

declare const __GAMEYARD_BUILD__: string;

const GAME_ID = "neon-overdrive";
let runtimeOwner: ReturnType<typeof createRuntimeOwner> | null = null;
let bootI18n: ReturnType<typeof createNeonI18n> | null = null;

function showBootFailure(error: unknown): void {
  console.error("Neon Overdrive guest initialization failed.", error);
  const failure = document.createElement("section");
  failure.className = "boot-failure";
  let errorCode = "initialization";
  let cause: unknown = error;
  while (cause instanceof Error) {
    if (cause instanceof NeonProfileError) {
      errorCode = `profile.${cause.code}`;
      break;
    }
    cause = cause.cause;
  }
  failure.dataset.neonBootError = errorCode;
  const copy =
    bootI18n === null
      ? { title: "GameYard", detail: "GUEST_INITIALIZATION_FAILED" }
      : {
          title: bootI18n.t("error.init.title"),
          detail: bootI18n.t(
            errorCode === "profile.json" || errorCode === "profile.schema"
              ? `error.${errorCode}`
              : "error.init.unknown",
          ),
        };
  const title = document.createElement("h1");
  title.textContent = copy.title;
  const detail = document.createElement("p");
  detail.textContent = copy.detail;
  failure.append(title, detail);
  document.body.replaceChildren(failure);
}

async function boot(): Promise<void> {
  const requireOwner = (): ReturnType<typeof createRuntimeOwner> => {
    if (runtimeOwner === null) throw new Error("Neon runtime has not been initialized.");
    return runtimeOwner;
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
      bootI18n = createNeonI18n(initializingBridge.context.locale);
      runtimeOwner = createRuntimeOwner({
        targetWindow: window,
        document,
        bridge: initializingBridge,
        i18n: bootI18n,
      });
    },
  });
  requireOwner().markReady();
  bridge.emitLifecycleState("ready");
}

void boot().catch(showBootFailure);
