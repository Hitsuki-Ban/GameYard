import { createGuestDiagnosticLog } from "@gameyard/guest-bridge";

import { createAudioEngine } from "./audio.js";
import { createHostSettingsProjection } from "./host-settings-projection.ts";
import { createInput } from "./input.js";
import { ManagedRuntime } from "./managed-runtime.js";
import { deriveMotionPolicy } from "./motion-policy.ts";
import { createRenderer } from "./renderer.js";
import { createNeonSimulation, FIXED_STEP_SECONDS } from "./simulation.js";
import { createProfileStorage } from "./storage.js";
import { createNeonDebug } from "./testkit.js";
import { createUiProjection } from "./ui-projection.ts";

const MAX_FRAME_SECONDS = 0.1;
const MAX_FIXED_STEPS_PER_FRAME = 6;

export function createRuntimeOwner({ targetWindow, document, bridge, i18n }) {
  if (
    i18n === null ||
    typeof i18n !== "object" ||
    typeof i18n.apply !== "function" ||
    typeof i18n.t !== "function"
  ) {
    throw new TypeError("Neon runtime requires an initialized i18n owner.");
  }
  const runtime = new ManagedRuntime(targetWindow);
  const storage = createProfileStorage(targetWindow.localStorage);
  const profile = storage.load();
  const renderer = createRenderer(document, i18n);
  const audio = createAudioEngine(targetWindow, bridge.context.settings);
  const diagnostics = createGuestDiagnosticLog(bridge);
  let simulation = null;
  let ui = null;
  let input = null;
  let settings = null;
  let motionPolicy = null;
  let lifecycle = "booting";
  let hostActive = false;
  let presentationFrozen = false;
  let disposed = false;
  let previousFrame = null;
  let accumulator = 0;
  let clampedFrames = 0;
  let droppedFixedSteps = 0;
  const testkitEventMirror = __GAMEYARD_TESTKIT__ ? [] : null;

  function projectHostSettings(snapshot) {
    if (settings === null || snapshot.canonical.revision > settings.revision) {
      settings = snapshot.canonical;
      audio.applySettings(settings);
      motionPolicy = deriveMotionPolicy(settings.motion);
    }
    ui?.applyHostSettings(snapshot);
  }

  const settingsProjection = createHostSettingsProjection({
    initialSettings: bridge.context.settings,
    requestChange: (change) => bridge.requestSettingsChange(change),
    scheduleTimeout: (callback, delayMs) => runtime.timeout(callback, delayMs),
    onChange: projectHostSettings,
  });
  projectHostSettings(settingsProjection.snapshot());

  function recordTestkitEvent(event) {
    if (!__GAMEYARD_TESTKIT__) return;
    testkitEventMirror.push(targetWindow.structuredClone(event));
    if (testkitEventMirror.length > 2048) testkitEventMirror.shift();
  }

  function requireSimulation() {
    if (disposed || simulation === null) throw new Error("Neon runtime owner is disposed.");
    return simulation;
  }

  function resourceSnapshot() {
    return {
      ...runtime.snapshotResources(),
      gamepad: input?.snapshotResources().gamepad ?? 0,
      audioContexts: audio.snapshotResources().audioContexts,
      audioSources: audio.snapshotResources().audioSources,
      musicScheduler: audio.snapshotResources().musicScheduler,
      musicSources: audio.snapshotResources().musicSources,
      pools: simulation?.snapshotResources().pools ?? 0,
    };
  }

  function clearClock() {
    previousFrame = null;
    accumulator = 0;
  }

  function hostGateOpen() {
    return hostActive && !document.hidden && !disposed;
  }

  function shouldRun() {
    return hostGateOpen() && !presentationFrozen;
  }

  function syncFrameGate() {
    clearClock();
    ui?.applyLifecycle(!hostGateOpen());
    if (shouldRun()) {
      runtime.resume();
      void audio.resume();
    } else {
      runtime.pause();
      void audio.pause();
    }
  }

  function handleVisibilityChange() {
    if (document.hidden) {
      hostActive = false;
      input?.releaseAll();
    }
    syncFrameGate();
  }

  function freezePresentation() {
    if (disposed || presentationFrozen) return;
    presentationFrozen = true;
    clearClock();
    runtime.pause();
  }

  function resumePresentation() {
    if (disposed || !presentationFrozen) return;
    presentationFrozen = false;
    clearClock();
    if (hostGateOpen()) runtime.resume();
  }

  function disposeOwnedSync() {
    if (disposed) return;
    hostActive = false;
    clearClock();
    input?.dispose();
    disposed = true;
    simulation?.dispose();
    ui?.dispose();
    settingsProjection.dispose();
    runtime.dispose();
    renderer.dispose();
    void audio.dispose();
  }

  function dispatch(command) {
    requireSimulation().command(command);
  }

  function processFrame(timestamp) {
    if (!Number.isFinite(timestamp) || timestamp < 0) {
      throw new RangeError("Neon frame timestamp must be finite and nonnegative.");
    }
    const current = requireSimulation();
    current.setMovement(input.movement());
    if (previousFrame === null) previousFrame = timestamp;
    const rawElapsed = Math.max(0, (timestamp - previousFrame) / 1000);
    previousFrame = timestamp;
    if (rawElapsed > MAX_FRAME_SECONDS) {
      clampedFrames = Math.min(65_535, clampedFrames + 1);
      if (clampedFrames === 1) {
        diagnostics.record({
          timestampMs: Date.now(),
          level: "warning",
          code: "clock.frame_clamped",
          message: "Neon frame elapsed exceeded 100ms and was clamped.",
        });
      }
    }
    accumulator += Math.min(rawElapsed, MAX_FRAME_SECONDS);
    let steps = 0;
    while (
      accumulator + Number.EPSILON >= FIXED_STEP_SECONDS &&
      steps < MAX_FIXED_STEPS_PER_FRAME
    ) {
      current.step(FIXED_STEP_SECONDS);
      accumulator = Math.max(0, accumulator - FIXED_STEP_SECONDS);
      steps += 1;
    }
    if (accumulator + Number.EPSILON >= FIXED_STEP_SECONDS) {
      const dropped = Math.floor((accumulator + Number.EPSILON) / FIXED_STEP_SECONDS);
      const firstDrop = droppedFixedSteps === 0;
      droppedFixedSteps = Math.min(65_535, droppedFixedSteps + dropped);
      accumulator %= FIXED_STEP_SECONDS;
      if (firstDrop) {
        diagnostics.record({
          timestampMs: Date.now(),
          level: "warning",
          code: "clock.steps_dropped",
          message: "Neon fixed-step work exceeded the six-step frame cap and was dropped.",
        });
      }
    }
    audio.tick();
    renderer.render(current.state, accumulator / FIXED_STEP_SECONDS, motionPolicy);
  }

  try {
    ui = createUiProjection({
      document,
      targetWindow,
      runtime,
      i18n,
      onCommand: dispatch,
      onFullscreen: () => bridge.requestHostAction("fullscreen.enter"),
      onActivate: () => audio.activate(hostGateOpen()),
      onUiCue: (cue) => {
        audio.cue(cue);
        const current = requireSimulation();
        recordTestkitEvent({
          tick: current.state.tick,
          runTick: current.state.runTicks,
          type: "audio",
          cue,
        });
      },
      onResumeRequest: () => bridge.requestLifecycleChange("resume"),
      onHostSettingRequest: (field, value) => settingsProjection.request(field, value),
      onPlayingProjected: () => renderer.canvas.focus({ preventScroll: true }),
    });
    ui.applyLocale();
    simulation = createNeonSimulation({
      profile,
      storage,
      getMotionPolicy: () => motionPolicy,
      project: (snapshot) => ui.apply(snapshot),
      emitCue: (cue) => audio.cue(cue),
      emitEvent: (event) => {
        recordTestkitEvent(event);
        if (event.type === "scene.changed") audio.setMusicActive(event.scene === "playing");
        ui.applyEvent(event);
      },
    });
    projectHostSettings(settingsProjection.snapshot());
    input = createInput({
      targetWindow,
      canvas: renderer.canvas,
      runtime,
      onCommand: dispatch,
      onActivate: () => audio.activate(hostGateOpen()),
      onPauseRequest: () => {
        if (!ui.handlePauseRequest()) bridge.requestLifecycleChange("pause");
      },
      getPlayerPosition: () => {
        const player = requireSimulation().state.player;
        return { x: player.x, y: player.y };
      },
      onPresentationChange: (presentation) => ui.applyInputPresentation(presentation),
    });
    runtime.listen(document, "visibilitychange", handleVisibilityChange);
    runtime.startFrameLoop(processFrame);
    bridge.resources.register(disposeOwnedSync);
  } catch (error) {
    input?.dispose();
    simulation?.dispose();
    ui?.dispose();
    settingsProjection.dispose();
    renderer.dispose();
    runtime.dispose();
    void audio.dispose();
    throw error;
  }

  if (__GAMEYARD_TESTKIT__) {
    const debug = createNeonDebug({
      simulation,
      renderer,
      getMotionPolicy: () => motionPolicy,
      canAdvance: hostGateOpen,
      freezePresentation,
      resumePresentation,
      feedFrame(timestamp) {
        if (!presentationFrozen) {
          throw new Error("Frame feeding requires frozen presentation.");
        }
        if (!hostGateOpen()) return simulation.observe();
        processFrame(timestamp);
        return simulation.observe();
      },
      drainEvents: () => testkitEventMirror.splice(0, testkitEventMirror.length),
      resources: resourceSnapshot,
    });
    Object.defineProperty(targetWindow, "__NEON_DEBUG__", { value: debug, configurable: true });
  }

  return {
    markReady() {
      requireSimulation();
      lifecycle = "ready";
      renderer.render(simulation.state, 0, motionPolicy);
    },
    applyHostSettings(next) {
      settingsProjection.apply(next);
      diagnostics.record({
        timestampMs: Date.now(),
        level: "info",
        code: "settings.applied",
        message: `Applied Neon Host settings revision ${next.revision}.`,
      });
    },
    applyHostLocale(next) {
      const current = requireSimulation();
      i18n.apply(next);
      ui.applyLocale();
      renderer.render(current.state, 0, motionPolicy);
      diagnostics.record({
        timestampMs: Date.now(),
        level: "info",
        code: "locale.applied",
        message: `Applied Neon Host locale ${next.resolved}.`,
      });
    },
    setInputEnabled(enabled) {
      ui.setInputEnabled(enabled);
      input.setEnabled(enabled);
    },
    releaseAllInput() {
      ui.releaseGameplayInput();
      input.releaseAll();
    },
    async hostPause() {
      if (disposed) return;
      hostActive = false;
      input.releaseAll();
      syncFrameGate();
      lifecycle = "paused";
      bridge.emitLifecycleState("paused");
    },
    async hostResume() {
      requireSimulation();
      hostActive = !document.hidden;
      syncFrameGate();
      lifecycle = document.hidden ? "paused" : "active";
      bridge.emitLifecycleState(lifecycle);
    },
    diagnosticSnapshot() {
      return {
        lifecycle,
        settingsRevision: settings.revision,
        inputEnabled: runtime.inputEnabled,
        events: diagnostics.snapshot(),
      };
    },
    async dispose() {
      if (disposed) return;
      lifecycle = "disposing";
      bridge.emitLifecycleState("disposing");
      const before = resourceSnapshot();
      disposeOwnedSync();
      await audio.dispose();
      simulation = null;
      input = null;
      ui = null;
      lifecycle = "disposed";
      if (__GAMEYARD_TESTKIT__) {
        targetWindow.__NEON_DISPOSE_REPORT__ = { before, after: resourceSnapshot() };
        delete targetWindow.__NEON_DEBUG__;
      }
      bridge.emitLifecycleState("disposed");
    },
  };
}
