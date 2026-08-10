import { createGuestDiagnosticLog } from "@gameyard/guest-bridge";

import { createAudioEngine } from "./audio.js";
import { createHaptics } from "./haptics.js";
import { createKamifudaI18n } from "./i18n.ts";
import { ManagedRuntime } from "./managed-runtime.js";
import { createRenderer } from "./renderer.js";
import { createKamifudaSimulation } from "./simulation.js";
import { createProfileStorage } from "./storage.js";
import { createUiProjection } from "./ui-projection.js";

export function createRuntimeOwner({ targetWindow, document, bridge }) {
  const runtime = new ManagedRuntime(targetWindow);
  const i18n = createKamifudaI18n(bridge.context.locale.resolved);
  i18n.applyDocument(document);
  const renderer = createRenderer(document);
  const uiProjection = createUiProjection(document, targetWindow);
  const audio = createAudioEngine(targetWindow);
  const haptics = createHaptics(targetWindow.navigator);
  const storage = createProfileStorage(targetWindow.localStorage);
  const diagnostics = createGuestDiagnosticLog(bridge);
  let simulation = null;
  let lifecycle = "booting";
  let settingsRevision = bridge.context.settings.revision;
  let disposed = false;

  try {
    simulation = createKamifudaSimulation({
      targetWindow,
      document,
      renderer,
      uiProjection,
      runtime,
      storage,
      audioEngine: audio,
      haptics,
      host: bridge,
      context: bridge.context,
      i18n,
    });
  } catch (error) {
    runtime.dispose();
    haptics.dispose();
    void audio.dispose();
    renderer.dispose();
    uiProjection.dispose();
    throw error;
  }

  if (__GAMEYARD_TESTKIT__) {
    Object.defineProperty(targetWindow, "__KAMIFUDA_DEBUG__", {
      value: simulation.testkit(),
      configurable: true,
    });
  }

  function requireSimulation() {
    if (disposed || simulation === null) throw new Error("Kamifuda runtime owner is disposed.");
    return simulation;
  }

  return {
    markReady() {
      requireSimulation();
      lifecycle = "ready";
    },
    applyHostSettings(settings) {
      requireSimulation().applyHostSettings(settings);
      settingsRevision = settings.revision;
      diagnostics.record({
        timestampMs: Date.now(),
        level: "info",
        code: "settings.applied",
        message: `Applied Host settings revision ${settings.revision}.`,
      });
    },
    applyHostLocale(locale) {
      requireSimulation().applyHostLocale(locale);
      diagnostics.record({
        timestampMs: Date.now(),
        level: "info",
        code: "locale.applied",
        message: `Applied Host locale ${locale.resolved}.`,
      });
    },
    setInputEnabled(enabled) {
      runtime.setInputEnabled(enabled);
      if (!enabled) requireSimulation().releaseAllInput();
    },
    releaseAllInput() {
      requireSimulation().releaseAllInput();
    },
    async hostPause() {
      if (disposed) return;
      requireSimulation().hostPause();
      runtime.pause();
      await audio.pause();
      lifecycle = "paused";
      bridge.emitLifecycleState("paused");
    },
    async hostResume() {
      requireSimulation().hostResume();
      runtime.resume();
      await audio.resume();
      lifecycle = "active";
      bridge.emitLifecycleState("active");
    },
    diagnosticSnapshot() {
      return {
        lifecycle,
        settingsRevision,
        inputEnabled: runtime.inputEnabled,
        events: diagnostics.snapshot(),
      };
    },
    async dispose() {
      if (disposed) return;
      lifecycle = "disposing";
      bridge.emitLifecycleState("disposing");
      disposed = true;
      simulation?.dispose();
      simulation = null;
      const beforeRuntimeDispose = runtime.snapshotResources();
      runtime.dispose();
      haptics.dispose();
      await audio.dispose();
      renderer.dispose();
      uiProjection.dispose();
      if (__GAMEYARD_TESTKIT__) {
        targetWindow.__KAMIFUDA_DISPOSE_REPORT__ = {
          before: beforeRuntimeDispose,
          after: runtime.snapshotResources(),
        };
        delete targetWindow.__KAMIFUDA_DEBUG__;
      }
      lifecycle = "disposed";
      bridge.emitLifecycleState("disposed");
    },
  };
}
