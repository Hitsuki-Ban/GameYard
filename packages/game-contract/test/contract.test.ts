import { describe, expect, it } from "vite-plus/test";

import {
  DiagnosticEventSchema,
  GameHelloSchema,
  GuestEventSchema,
  HostCommandSchema,
  HostContextSchema,
  LifecycleStateSchema,
  LocaleSchema,
  PROTOCOL_VERSION,
  ResolvedLocaleSchema,
  SettingsChangeRequestEventSchema,
} from "../src/index";

const context = {
  protocol: PROTOCOL_VERSION,
  buildId: "build-1",
  gameId: "pulse-link-overdrive",
  instanceId: "instance-1",
  baseUrl: "./games/pulse-link-overdrive/",
  locale: { preference: "system", resolved: "ja" },
  settings: {
    revision: 3,
    audio: { master: 1, music: 0.5, sfx: 0.75 },
    motion: { reduced: false, screenShake: true },
  },
  diagnostics: { mode: "read-only" },
} as const;

describe("v1 contract", () => {
  it("accepts only public and resolved locale values", () => {
    expect(LocaleSchema.options).toEqual(["system", "en", "ja", "zh-Hans"]);
    expect(ResolvedLocaleSchema.options).toEqual(["en", "ja", "zh-Hans"]);
    expect(ResolvedLocaleSchema.safeParse("system").success).toBe(false);
  });

  it("accepts a complete strict host context", () => {
    expect(HostContextSchema.parse(context)).toEqual(context);
    expect(HostContextSchema.safeParse({ ...context, unknown: true }).success).toBe(false);
    expect(
      HostContextSchema.safeParse({
        ...context,
        settings: { ...context.settings, unknown: true },
      }).success,
    ).toBe(false);
    expect(HostContextSchema.safeParse({ ...context, diagnostics: "read-only" }).success).toBe(
      false,
    );
    expect(
      HostContextSchema.safeParse({
        ...context,
        locale: { requested: "system", resolved: "ja" },
      }).success,
    ).toBe(false);
  });

  it("exposes only the v1 lifecycle states", () => {
    expect(LifecycleStateSchema.options).toEqual([
      "booting",
      "ready",
      "active",
      "paused",
      "disposing",
      "disposed",
      "failed",
    ]);
    expect(LifecycleStateSchema.safeParse("running").success).toBe(false);
  });

  it("rejects an incorrect protocol version and unknown hello fields", () => {
    const hello = {
      type: "hello",
      protocol: PROTOCOL_VERSION,
      buildId: context.buildId,
      gameId: context.gameId,
      instanceId: context.instanceId,
    } as const;

    expect(GameHelloSchema.safeParse(hello).success).toBe(true);
    expect(GameHelloSchema.safeParse({ ...hello, protocol: 2 }).success).toBe(false);
    expect(GameHelloSchema.safeParse({ ...hello, extra: 1 }).success).toBe(false);
  });

  it("requires a command id and rejects unknown command fields", () => {
    expect(
      HostCommandSchema.safeParse({
        type: "input.releaseAll",
        commandId: "command-1",
      }).success,
    ).toBe(true);
    expect(HostCommandSchema.safeParse({ type: "input.releaseAll" }).success).toBe(false);
    expect(
      HostCommandSchema.safeParse({
        type: "input.releaseAll",
        commandId: "command-1",
        extra: true,
      }).success,
    ).toBe(false);
  });

  it("requires locale.apply to carry a strict complete locale context", () => {
    expect(
      HostCommandSchema.safeParse({
        type: "locale.apply",
        commandId: "locale-1",
        locale: { preference: "system", resolved: "ja" },
      }).success,
    ).toBe(true);
    expect(
      HostCommandSchema.safeParse({
        type: "locale.apply",
        commandId: "locale-2",
        locale: { preference: "system", resolved: "ja", extra: true },
      }).success,
    ).toBe(false);
    expect(
      HostCommandSchema.safeParse({
        type: "locale.apply",
        commandId: "locale-3",
        locale: { preference: "system" },
      }).success,
    ).toBe(false);
  });

  it("models successful and failed acknowledgements explicitly", () => {
    expect(
      GuestEventSchema.parse({
        type: "ack",
        commandId: "command-1",
        result: { ok: true },
      }),
    ).toEqual({
      type: "ack",
      commandId: "command-1",
      result: { ok: true },
    });
    expect(
      GuestEventSchema.parse({
        type: "ack",
        commandId: "command-2",
        result: {
          ok: false,
          error: { code: "invalid.state", message: "Already disposed" },
        },
      }),
    ).toEqual({
      type: "ack",
      commandId: "command-2",
      result: {
        ok: false,
        error: { code: "invalid.state", message: "Already disposed" },
      },
    });
  });

  it("requires settings change requests to contain a strict change", () => {
    expect(
      SettingsChangeRequestEventSchema.safeParse({
        type: "settings.changeRequest",
        change: {},
      }).success,
    ).toBe(false);
    expect(
      SettingsChangeRequestEventSchema.safeParse({
        type: "settings.changeRequest",
        change: { audio: { music: 0.25, extra: true } },
      }).success,
    ).toBe(false);
    expect(
      SettingsChangeRequestEventSchema.safeParse({
        type: "settings.changeRequest",
        change: { audio: {} },
      }).success,
    ).toBe(false);
    expect(
      SettingsChangeRequestEventSchema.safeParse({
        type: "settings.changeRequest",
        change: { motion: {} },
      }).success,
    ).toBe(false);
    expect(
      SettingsChangeRequestEventSchema.safeParse({
        type: "settings.changeRequest",
        change: { audio: { sfx: 0.25 }, motion: {} },
      }).success,
    ).toBe(false);
  });

  it("accepts only safe integer settings revisions", () => {
    expect(HostContextSchema.safeParse(context).success).toBe(true);
    expect(
      HostContextSchema.safeParse({
        ...context,
        settings: { ...context.settings, revision: Number.MAX_SAFE_INTEGER },
      }).success,
    ).toBe(true);
    expect(
      HostContextSchema.safeParse({
        ...context,
        settings: { ...context.settings, revision: Number.MAX_SAFE_INTEGER + 1 },
      }).success,
    ).toBe(false);
  });

  it("keeps diagnostic events bounded and rejects extra data", () => {
    expect(
      DiagnosticEventSchema.safeParse({
        timestampMs: 1,
        level: "info",
        code: "render.ready",
        message: "Renderer is ready",
        storage: { gameyard: "not-exported" },
      }).success,
    ).toBe(false);
    expect(
      DiagnosticEventSchema.safeParse({
        timestampMs: 1,
        level: "info",
        code: "render.ready",
        message: "x".repeat(513),
      }).success,
    ).toBe(false);
  });
});
