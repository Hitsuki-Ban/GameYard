import { describe, expect, it } from "vite-plus/test";

import {
  BuildIdSchema,
  DiagnosticEventSchema,
  GameCatalogSchema,
  GameManifestSchema,
  GameManifestSourceSchema,
  GameIdSchema,
  GuestEventSchema,
  HostCommandSchema,
  HostBaseUrlSchema,
  HostContextSchema,
  LifecycleChangeRequestEventSchema,
  LifecycleStateSchema,
  LocaleSchema,
  PROTOCOL_VERSION,
  PosixRelativeFilePathSchema,
  ReadyForInitSchema,
  ResolvedLocaleSchema,
  SettingsChangeRequestEventSchema,
} from "../src/index";

const context = {
  protocol: PROTOCOL_VERSION,
  buildId: "gameyard@0123456789abcdef",
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

  it("accepts only lowercase path-safe game ids", () => {
    expect(GameIdSchema.safeParse("pulse-link-overdrive").success).toBe(true);
    for (const gameId of ["PulseLinkOverdrive", "pulse.link", "pulse_link", "-pulse", "pulse-"]) {
      expect(GameIdSchema.safeParse(gameId).success, gameId).toBe(false);
    }
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

  it("accepts only prefix-safe relative base directories", () => {
    expect(HostBaseUrlSchema.safeParse("./games/pulse-link-overdrive/").success).toBe(true);
    for (const baseUrl of [
      "/games/pulse-link-overdrive/",
      "games/pulse-link-overdrive/",
      ".\\games\\pulse-link-overdrive\\",
      "./games//pulse-link-overdrive/",
      "./games/./pulse-link-overdrive/",
      "./games/../pulse-link-overdrive/",
      "./games/pulse-link-overdrive",
      "./games/pulse-link-overdrive/?debug=1",
      "./games/pulse-link-overdrive/#main",
      "./games/%2e%2e/pulse-link-overdrive/",
      "./C:/games/pulse-link-overdrive/",
    ]) {
      expect(HostBaseUrlSchema.safeParse(baseUrl).success, baseUrl).toBe(false);
    }
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

  it("accepts only the exact build id format", () => {
    expect(BuildIdSchema.safeParse("gameyard@0123456789abcdef").success).toBe(true);
    expect(BuildIdSchema.safeParse("gameyard@0123456789ABCDEF").success).toBe(false);
    expect(BuildIdSchema.safeParse("build-1").success).toBe(false);
  });

  it("rejects an incorrect protocol and all extra ready-for-init fields", () => {
    const readyForInit = {
      type: "gameyard:ready-for-init",
      protocol: PROTOCOL_VERSION,
      buildId: context.buildId,
      gameId: context.gameId,
    } as const;

    expect(ReadyForInitSchema.safeParse(readyForInit).success).toBe(true);
    expect(ReadyForInitSchema.safeParse({ ...readyForInit, protocol: 2 }).success).toBe(false);
    expect(
      ReadyForInitSchema.safeParse({ ...readyForInit, instanceId: "guest-owned" }).success,
    ).toBe(false);
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

  it("accepts only explicit pause and resume lifecycle requests", () => {
    expect(
      LifecycleChangeRequestEventSchema.parse({
        type: "lifecycle.changeRequest",
        action: "pause",
      }),
    ).toEqual({ type: "lifecycle.changeRequest", action: "pause" });
    expect(
      LifecycleChangeRequestEventSchema.safeParse({
        type: "lifecycle.changeRequest",
        action: "toggle",
      }).success,
    ).toBe(false);
    expect(
      LifecycleChangeRequestEventSchema.safeParse({
        type: "lifecycle.changeRequest",
        action: "resume",
        legacy: true,
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

  it("accepts a strict manifest with normalized unique fields", () => {
    const source = {
      schemaVersion: 1,
      protocol: PROTOCOL_VERSION,
      id: context.gameId,
      version: "1.2.3-beta.1+build.5",
      entry: "assets/index.js",
      locales: { source: "en", supported: ["en", "ja"] },
      capabilities: ["audio", "keyboard"],
      provenance: {
        repository: "https://github.com/example/gameyard-game",
        revision: "0123456789abcdef0123456789abcdef01234567",
        license: "MIT",
      },
    } as const;
    const manifest = {
      ...source,
      buildId: context.buildId,
      files: ["game.manifest.json", "assets/index.js", "assets/main.css"],
    } as const;

    expect(GameManifestSourceSchema.parse(source)).toEqual(source);
    expect(GameManifestSchema.parse(manifest)).toEqual(manifest);
    expect(
      GameCatalogSchema.parse({
        schemaVersion: 1,
        buildId: context.buildId,
        games: [
          {
            id: source.id,
            entry: `./${source.id}/${source.entry}`,
            manifest: `./${source.id}/game.manifest.json`,
          },
        ],
      }),
    ).toEqual({
      schemaVersion: 1,
      buildId: context.buildId,
      games: [
        {
          id: source.id,
          entry: `./${source.id}/${source.entry}`,
          manifest: `./${source.id}/game.manifest.json`,
        },
      ],
    });
    expect(GameManifestSchema.safeParse({ ...manifest, unknown: true }).success).toBe(false);
    expect(
      GameManifestSchema.safeParse({
        ...manifest,
        locales: { source: "zh-Hans", supported: ["en", "ja"] },
      }).success,
    ).toBe(false);
    expect(
      GameManifestSchema.safeParse({
        ...manifest,
        capabilities: ["audio", "audio"],
      }).success,
    ).toBe(false);
    expect(
      GameManifestSchema.safeParse({
        ...manifest,
        files: ["game.manifest.json", "assets/main.css"],
      }).success,
    ).toBe(false);
  });

  it("rejects invalid semver, provenance, duplicate files, and unsafe paths", () => {
    const invalidPaths = [
      "/index.js",
      "assets\\index.js",
      "assets//index.js",
      "./index.js",
      "assets/../index.js",
      "assets/index.js?debug=1",
      "assets/index.js#main",
      "https://example.test/index.js",
      "assets/",
    ];
    for (const path of invalidPaths) {
      expect(PosixRelativeFilePathSchema.safeParse(path).success, path).toBe(false);
    }

    const baseManifest = {
      schemaVersion: 1,
      protocol: PROTOCOL_VERSION,
      id: context.gameId,
      version: "1.0.0",
      buildId: context.buildId,
      entry: "index.js",
      locales: { source: "en", supported: ["en"] },
      capabilities: [],
      provenance: {
        repository: "https://example.test/game.git",
        revision: "0123456789abcdef0123456789abcdef01234567",
        license: "MIT",
      },
      files: ["game.manifest.json", "index.js"],
    } as const;

    expect(GameManifestSchema.safeParse({ ...baseManifest, version: "01.0.0" }).success).toBe(
      false,
    );
    expect(
      GameManifestSchema.safeParse({
        ...baseManifest,
        provenance: { ...baseManifest.provenance, repository: "http://example.test/game.git" },
      }).success,
    ).toBe(false);
    expect(
      GameManifestSchema.safeParse({
        ...baseManifest,
        provenance: { ...baseManifest.provenance, revision: "A".repeat(40) },
      }).success,
    ).toBe(false);
    expect(
      GameManifestSchema.safeParse({
        ...baseManifest,
        files: ["game.manifest.json", "index.js", "index.js"],
      }).success,
    ).toBe(false);
  });
});
