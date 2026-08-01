import type { GuestEvent, HostCommand, HostSettings } from "@gameyard/game-contract";
import type { HostBridge } from "@gameyard/host-bridge";
import { describe, expect, it, vi } from "vite-plus/test";

import { RuntimeController, type RuntimeState } from "./runtime-controller";
import type { PlayableRuntime } from "./runtime-catalog";

const settings: HostSettings = {
  revision: 4,
  audio: { master: 0.8, music: 0.7, sfx: 0.6 },
  motion: { reduced: false, screenShake: true },
};

const runtime = {
  id: "pulse-link-overdrive",
  buildId: "gameyard@0123456789abcdef",
  entryUrl: "./games/pulse-link-overdrive/index.html",
  baseUrl: "./games/pulse-link-overdrive/",
  manifest: {} as PlayableRuntime["manifest"],
} satisfies PlayableRuntime;

function harness(failType?: HostCommand["type"], initiallyHidden = false) {
  const commands: HostCommand[] = [];
  let listener: ((event: GuestEvent) => void) | undefined;
  const dispose = vi.fn(async (commandId: string) => {
    commands.push({ type: "lifecycle.dispose", commandId });
    return { type: "ack" as const, commandId, result: { ok: true as const } };
  });
  const close = vi.fn();
  const bridge: HostBridge = {
    isClosed: false,
    command: vi.fn(async (command: HostCommand) => {
      commands.push(command);
      return {
        type: "ack" as const,
        commandId: command.commandId,
        result:
          command.type === failType
            ? { ok: false as const, error: { code: "guest.rejected", message: "rejected" } }
            : { ok: true as const },
      };
    }),
    subscribe: vi.fn((next) => {
      listener = next;
      return () => {
        listener = undefined;
      };
    }),
    close,
    dispose,
  };
  const states: RuntimeState[] = [];
  const controller = new RuntimeController({
    generation: 2,
    instanceId: "pulse.g2.instance",
    iframe: {} as HTMLIFrameElement,
    runtime,
    buildId: runtime.buildId,
    locale: { preference: "en", resolved: "en" },
    settings,
    diagnosticsMode: "read-only",
    initiallyHidden,
    targetOrigin: "https://yard.test",
    handshakeTimeoutMs: 100,
    commandTimeoutMs: 100,
    connect: vi.fn(async () => bridge),
    onState: (state) => states.push(state),
    onSettingsChangeRequest: vi.fn(),
    onHostActionRequest: vi.fn(),
    onDiagnosticEvent: vi.fn(),
    onDiagnosticSnapshot: vi.fn(),
  });
  return {
    bridge,
    commands,
    close,
    controller,
    dispose,
    states,
    emit: (event: GuestEvent) => listener?.(event),
  };
}

describe("RuntimeController", () => {
  it("activates in serialized order without reapplying the initial settings revision", async () => {
    const { commands, controller } = harness();
    await controller.mount();
    await controller.applySettings(settings);
    expect(commands.map((command) => command.type)).toEqual([
      "input.setEnabled",
      "lifecycle.resume",
    ]);
    expect(new Set(commands.map((command) => command.commandId)).size).toBe(commands.length);
    expect(controller.state.phase).toBe("active");
  });

  it("turns a negative ACK into a visible terminal failure", async () => {
    const { close, controller } = harness("lifecycle.pause");
    await controller.mount();
    await expect(controller.pause()).rejects.toThrow(/guest.rejected/);
    expect(controller.state).toMatchObject({ phase: "failed", lifecycle: "failed" });
    expect(close).toHaveBeenCalledOnce();
  });

  it("only auto-resumes a pause caused by visibility", async () => {
    const first = harness();
    await first.controller.mount();
    await first.controller.pause();
    await first.controller.handleVisibility(false);
    expect(first.controller.state.phase).toBe("paused");

    const second = harness();
    await second.controller.mount();
    await second.controller.handleVisibility(true);
    await second.controller.handleVisibility(false);
    expect(second.controller.state.phase).toBe("active");

    const hiddenDuringMount = harness(undefined, true);
    await hiddenDuringMount.controller.mount();
    expect(hiddenDuringMount.controller.state.phase).toBe("paused");
    expect(hiddenDuringMount.commands.map((command) => command.type)).toEqual([
      "input.releaseAll",
      "input.setEnabled",
      "lifecycle.pause",
    ]);
    await hiddenDuringMount.controller.handleVisibility(false);
    expect(hiddenDuringMount.controller.state.phase).toBe("active");
  });

  it("answers guest lifecycle requests through the serialized ACK command path", async () => {
    const { commands, controller, emit } = harness();
    await controller.mount();
    emit({ type: "lifecycle.changeRequest", action: "pause" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(commands.slice(-3).map((command) => command.type)).toEqual([
      "input.releaseAll",
      "input.setEnabled",
      "lifecycle.pause",
    ]);
    expect(controller.state.phase).toBe("paused");
  });

  it("does not finish disposal until the dispose ACK resolves", async () => {
    const { controller, dispose } = harness();
    await controller.mount();
    let resolveDispose!: (value: Awaited<ReturnType<typeof dispose>>) => void;
    dispose.mockImplementationOnce(
      (commandId: string) =>
        new Promise<Awaited<ReturnType<typeof dispose>>>((resolve) => {
          resolveDispose = resolve;
          expect(commandId).toContain("pulse.g2.instance");
        }),
    );
    const disposing = controller.dispose();
    await vi.waitFor(() => expect(dispose).toHaveBeenCalledOnce());
    expect(controller.state.phase).toBe("disposing");
    resolveDispose({
      type: "ack",
      commandId: "pulse.g2.instance.c5",
      result: { ok: true },
    });
    await disposing;
    expect(controller.state.phase).toBe("disposed");
  });

  it("ignores events after disposal unsubscribes the generation", async () => {
    const { controller, emit } = harness();
    await controller.mount();
    const stale = emit;
    await controller.dispose();
    stale({ type: "lifecycle.state", state: "active" });
    expect(controller.state.phase).toBe("disposed");
  });
});
