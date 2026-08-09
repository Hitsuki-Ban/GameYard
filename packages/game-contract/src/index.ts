import { z } from "zod";

import { LOCALE_PREFERENCES, PUBLIC_LOCALES } from "@gameyard/game-contract/locales";

export { LOCALE_PREFERENCES, PUBLIC_LOCALES } from "@gameyard/game-contract/locales";
export type { LocalePreference, PublicLocale } from "@gameyard/game-contract/locales";

export const PROTOCOL_VERSION = 1 as const;

const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const diagnosticCodePattern = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

export const GameIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export type GameId = z.infer<typeof GameIdSchema>;

export const BuildIdSchema = z.string().regex(/^gameyard@[0-9a-f]{16}$/);
export type BuildId = z.infer<typeof BuildIdSchema>;

export const InstanceIdSchema = z.string().min(1).max(128).regex(identifierPattern);
export type InstanceId = z.infer<typeof InstanceIdSchema>;

export const CommandIdSchema = z.string().min(1).max(128).regex(identifierPattern);
export type CommandId = z.infer<typeof CommandIdSchema>;

export const LocaleSchema = z.enum(LOCALE_PREFERENCES);
export type Locale = z.infer<typeof LocaleSchema>;

export const ResolvedLocaleSchema = z.enum(PUBLIC_LOCALES);
export type ResolvedLocale = z.infer<typeof ResolvedLocaleSchema>;

export const LocaleContextSchema = z.strictObject({
  preference: LocaleSchema,
  resolved: ResolvedLocaleSchema,
});
export type LocaleContext = z.infer<typeof LocaleContextSchema>;

const unitIntervalSchema = z.number().finite().min(0).max(1);
const revisionSchema = z
  .number()
  .int()
  .nonnegative()
  .refine(Number.isSafeInteger, "Revision must be a safe integer");

export const AudioSettingsSchema = z.strictObject({
  master: unitIntervalSchema,
  music: unitIntervalSchema,
  sfx: unitIntervalSchema,
});
export type AudioSettings = z.infer<typeof AudioSettingsSchema>;

export const MotionSettingsSchema = z.strictObject({
  reduced: z.boolean(),
  screenShake: z.boolean(),
});
export type MotionSettings = z.infer<typeof MotionSettingsSchema>;

export const HostSettingsSchema = z.strictObject({
  revision: revisionSchema,
  audio: AudioSettingsSchema,
  motion: MotionSettingsSchema,
});
export type HostSettings = z.infer<typeof HostSettingsSchema>;

export const DiagnosticsModeSchema = z.enum(["read-only", "lab"]);
export type DiagnosticsMode = z.infer<typeof DiagnosticsModeSchema>;

export const DiagnosticsSchema = z.strictObject({
  mode: DiagnosticsModeSchema,
});
export type Diagnostics = z.infer<typeof DiagnosticsSchema>;

export const LifecycleStateSchema = z.enum([
  "booting",
  "ready",
  "active",
  "paused",
  "disposing",
  "disposed",
  "failed",
]);
export type LifecycleState = z.infer<typeof LifecycleStateSchema>;

export const DiagnosticLevelSchema = z.enum(["info", "warning", "error"]);
export type DiagnosticLevel = z.infer<typeof DiagnosticLevelSchema>;

export const DiagnosticEventSchema = z.strictObject({
  timestampMs: z.number().int().nonnegative(),
  level: DiagnosticLevelSchema,
  code: z.string().min(1).max(64).regex(diagnosticCodePattern),
  message: z.string().min(1).max(512),
});
export type DiagnosticEvent = z.infer<typeof DiagnosticEventSchema>;

export const DiagnosticSnapshotSchema = z.strictObject({
  lifecycle: LifecycleStateSchema,
  settingsRevision: revisionSchema,
  inputEnabled: z.boolean(),
  events: z.array(DiagnosticEventSchema).max(100),
});
export type DiagnosticSnapshot = z.infer<typeof DiagnosticSnapshotSchema>;

function isPrefixSafeRelativeDirectory(value: string): boolean {
  if (
    !value.startsWith("./") ||
    !value.endsWith("/") ||
    value.includes("\\") ||
    value.includes(":") ||
    value.includes("%") ||
    value.includes("?") ||
    value.includes("#")
  ) {
    return false;
  }
  const path = value.slice(2, -1);
  return (
    path.length > 0 &&
    path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..")
  );
}

export const HostBaseUrlSchema = z
  .string()
  .refine(isPrefixSafeRelativeDirectory, "Expected a prefix-safe relative directory URL");
export type HostBaseUrl = z.infer<typeof HostBaseUrlSchema>;

export const HostContextSchema = z.strictObject({
  protocol: z.literal(PROTOCOL_VERSION),
  buildId: BuildIdSchema,
  gameId: GameIdSchema,
  instanceId: InstanceIdSchema,
  baseUrl: HostBaseUrlSchema,
  locale: LocaleContextSchema,
  settings: HostSettingsSchema,
  diagnostics: DiagnosticsSchema,
});
export type HostContext = z.infer<typeof HostContextSchema>;

export const ReadyForInitSchema = z.strictObject({
  type: z.literal("gameyard:ready-for-init"),
  protocol: z.literal(PROTOCOL_VERSION),
  buildId: BuildIdSchema,
  gameId: GameIdSchema,
});
export type ReadyForInit = z.infer<typeof ReadyForInitSchema>;

export const InitMessageSchema = z.strictObject({
  type: z.literal("gameyard:init"),
  context: HostContextSchema,
});
export type InitMessage = z.infer<typeof InitMessageSchema>;

export const WindowMessageSchema = z.discriminatedUnion("type", [
  ReadyForInitSchema,
  InitMessageSchema,
]);
export type WindowMessage = z.infer<typeof WindowMessageSchema>;

const strictSemverPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

export const GameVersionSchema = z.string().regex(strictSemverPattern);
export type GameVersion = z.infer<typeof GameVersionSchema>;

function isCanonicalPosixRelativeFilePath(value: string): boolean {
  if (
    value.length === 0 ||
    value.startsWith("/") ||
    value.endsWith("/") ||
    value.includes("\\") ||
    value.includes("?") ||
    value.includes("#") ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)
  ) {
    return false;
  }

  return value.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

export const PosixRelativeFilePathSchema = z
  .string()
  .refine(isCanonicalPosixRelativeFilePath, "Expected a canonical POSIX relative file path");
export type PosixRelativeFilePath = z.infer<typeof PosixRelativeFilePathSchema>;

export const GameLocalesSchema = z
  .strictObject({
    source: ResolvedLocaleSchema,
    supported: z.array(ResolvedLocaleSchema).min(1),
  })
  .superRefine((locales, context) => {
    if (new Set(locales.supported).size !== locales.supported.length) {
      context.addIssue({
        code: "custom",
        message: "Supported locales must be unique",
        path: ["supported"],
      });
    }
    if (!locales.supported.includes(locales.source)) {
      context.addIssue({
        code: "custom",
        message: "Source locale must be included in supported locales",
        path: ["source"],
      });
    }
  });
export type GameLocales = z.infer<typeof GameLocalesSchema>;

export const GameCapabilitySchema = z.enum([
  "audio",
  "fullscreen",
  "keyboard",
  "pointer",
  "touch",
  "gamepad",
]);
export type GameCapability = z.infer<typeof GameCapabilitySchema>;

export const GameProvenanceSchema = z.strictObject({
  repository: z.string().superRefine((repository, context) => {
    let url: URL;
    try {
      url = new URL(repository);
    } catch {
      context.addIssue({ code: "custom", message: "Repository must be a valid HTTPS URL" });
      return;
    }
    if (url.protocol !== "https:") {
      context.addIssue({ code: "custom", message: "Repository must use HTTPS" });
    }
  }),
  revision: z.string().regex(/^[0-9a-f]{40}$/),
  license: z
    .string()
    .min(1)
    .refine((license) => license.trim() === license && license.length > 0, {
      message: "License must be an explicit non-empty string",
    }),
});
export type GameProvenance = z.infer<typeof GameProvenanceSchema>;

const gameManifestSourceShape = {
  schemaVersion: z.literal(1),
  protocol: z.literal(PROTOCOL_VERSION),
  id: GameIdSchema,
  version: GameVersionSchema,
  entry: PosixRelativeFilePathSchema,
  locales: GameLocalesSchema,
  capabilities: z.array(GameCapabilitySchema),
  provenance: GameProvenanceSchema,
};

function requireUniqueCapabilities(
  source: { capabilities: readonly GameCapability[] },
  context: z.core.$RefinementCtx,
): void {
  if (new Set(source.capabilities).size !== source.capabilities.length) {
    context.addIssue({
      code: "custom",
      message: "Capabilities must be unique",
      path: ["capabilities"],
      input: source,
    });
  }
}

export const GameManifestSourceSchema = z
  .strictObject(gameManifestSourceShape)
  .superRefine(requireUniqueCapabilities);
export type GameManifestSource = z.infer<typeof GameManifestSourceSchema>;

const trimmedTextSchema = z
  .string()
  .min(1)
  .refine((value) => !/[\r\n]/u.test(value), "Expected single-line text")
  .refine((value) => value.trim() === value, "Expected trimmed non-empty text");

const presentationTaglinesShape = Object.fromEntries(
  PUBLIC_LOCALES.map((locale) => [locale, trimmedTextSchema]),
) as { [Locale in (typeof PUBLIC_LOCALES)[number]]: typeof trimmedTextSchema };

const coverDimensionsShape = {
  width: z.number().int().positive().refine(Number.isSafeInteger, "Width must be a safe integer"),
  height: z.number().int().positive().refine(Number.isSafeInteger, "Height must be a safe integer"),
};

export const GamePresentationStageSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("adaptive") }),
  z.strictObject({ kind: z.literal("fixed-aspect"), ...coverDimensionsShape }),
]);
export type GamePresentationStage = z.infer<typeof GamePresentationStageSchema>;

const gamePresentationShape = {
  schemaVersion: z.literal(1),
  id: GameIdSchema,
  title: trimmedTextSchema,
  taglines: z.strictObject(presentationTaglinesShape),
  accent: z.string().regex(/^#[0-9a-f]{6}$/),
  stage: GamePresentationStageSchema,
};

const uniqueCoverCandidates = <Candidate extends { path?: string; url?: string }>(
  cover: { candidates: readonly Candidate[] },
  context: z.core.$RefinementCtx,
): void => {
  const identities = cover.candidates.map((candidate) => candidate.path ?? candidate.url);
  if (new Set(identities).size !== identities.length) {
    context.addIssue({
      code: "custom",
      message: "Cover candidates must be unique",
      path: ["candidates"],
      input: cover,
    });
  }
};

export const GamePresentationSourceSchema = z.strictObject({
  ...gamePresentationShape,
  cover: z
    .strictObject({
      candidates: z
        .array(z.strictObject({ path: PosixRelativeFilePathSchema, ...coverDimensionsShape }))
        .min(2),
    })
    .superRefine(uniqueCoverCandidates),
});
export type GamePresentationSource = z.infer<typeof GamePresentationSourceSchema>;

export const GamePresentationSchema = z.strictObject({
  ...gamePresentationShape,
  cover: z
    .strictObject({
      candidates: z
        .array(z.strictObject({ url: trimmedTextSchema, ...coverDimensionsShape }))
        .min(2),
    })
    .superRefine(uniqueCoverCandidates),
});
export type GamePresentation = z.infer<typeof GamePresentationSchema>;

export const GameManifestSchema = z
  .strictObject({
    ...gameManifestSourceShape,
    buildId: BuildIdSchema,
    files: z.array(PosixRelativeFilePathSchema).min(1),
  })
  .superRefine((manifest, context) => {
    requireUniqueCapabilities(manifest, context);
    if (new Set(manifest.files).size !== manifest.files.length) {
      context.addIssue({ code: "custom", message: "Files must be unique", path: ["files"] });
    }
    if (!manifest.files.includes("game.manifest.json")) {
      context.addIssue({
        code: "custom",
        message: "Files must include game.manifest.json",
        path: ["files"],
      });
    }
    if (!manifest.files.includes(manifest.entry)) {
      context.addIssue({
        code: "custom",
        message: "Files must include the entry file",
        path: ["entry"],
      });
    }
  });
export type GameManifest = z.infer<typeof GameManifestSchema>;

function isCanonicalCatalogReference(value: string): boolean {
  return value.startsWith("./") && isCanonicalPosixRelativeFilePath(value.slice(2));
}

export const GameCatalogReferenceSchema = z
  .string()
  .refine(isCanonicalCatalogReference, "Expected a canonical ./-relative catalog reference");
export type GameCatalogReference = z.infer<typeof GameCatalogReferenceSchema>;

export const GameCatalogEntrySchema = z.strictObject({
  id: GameIdSchema,
  entry: GameCatalogReferenceSchema,
  manifest: GameCatalogReferenceSchema,
});
export type GameCatalogEntry = z.infer<typeof GameCatalogEntrySchema>;

export const GameCatalogSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    buildId: BuildIdSchema,
    games: z.array(GameCatalogEntrySchema),
  })
  .superRefine((catalog, context) => {
    const ids = new Set<string>();
    for (const [index, game] of catalog.games.entries()) {
      if (ids.has(game.id)) {
        context.addIssue({
          code: "custom",
          message: "Game catalog IDs must be unique",
          path: ["games", index, "id"],
          input: catalog,
        });
      }
      ids.add(game.id);
    }
  });
export type GameCatalog = z.infer<typeof GameCatalogSchema>;

export const SettingsApplyCommandSchema = z.strictObject({
  type: z.literal("settings.apply"),
  commandId: CommandIdSchema,
  settings: HostSettingsSchema,
});

export const LocaleApplyCommandSchema = z.strictObject({
  type: z.literal("locale.apply"),
  commandId: CommandIdSchema,
  locale: LocaleContextSchema,
});

export const InputSetEnabledCommandSchema = z.strictObject({
  type: z.literal("input.setEnabled"),
  commandId: CommandIdSchema,
  enabled: z.boolean(),
});

export const InputReleaseAllCommandSchema = z.strictObject({
  type: z.literal("input.releaseAll"),
  commandId: CommandIdSchema,
});

export const LifecyclePauseCommandSchema = z.strictObject({
  type: z.literal("lifecycle.pause"),
  commandId: CommandIdSchema,
});

export const LifecycleResumeCommandSchema = z.strictObject({
  type: z.literal("lifecycle.resume"),
  commandId: CommandIdSchema,
});

export const LifecycleDisposeCommandSchema = z.strictObject({
  type: z.literal("lifecycle.dispose"),
  commandId: CommandIdSchema,
});

export const DiagnosticsSnapshotCommandSchema = z.strictObject({
  type: z.literal("diagnostics.snapshot"),
  commandId: CommandIdSchema,
});

export const HostCommandSchema = z.discriminatedUnion("type", [
  SettingsApplyCommandSchema,
  LocaleApplyCommandSchema,
  InputSetEnabledCommandSchema,
  InputReleaseAllCommandSchema,
  LifecyclePauseCommandSchema,
  LifecycleResumeCommandSchema,
  LifecycleDisposeCommandSchema,
  DiagnosticsSnapshotCommandSchema,
]);
export type HostCommand = z.infer<typeof HostCommandSchema>;

export const ReadyEventSchema = z.strictObject({
  type: z.literal("ready"),
});

export const CommandFailureSchema = z.strictObject({
  code: z.string().min(1).max(64).regex(diagnosticCodePattern),
  message: z.string().min(1).max(512),
});
export type CommandFailure = z.infer<typeof CommandFailureSchema>;

export const AckResultSchema = z.discriminatedUnion("ok", [
  z.strictObject({ ok: z.literal(true) }),
  z.strictObject({
    ok: z.literal(false),
    error: CommandFailureSchema,
  }),
]);
export type AckResult = z.infer<typeof AckResultSchema>;

export const AckEventSchema = z.strictObject({
  type: z.literal("ack"),
  commandId: CommandIdSchema,
  result: AckResultSchema,
});
export type AckEvent = z.infer<typeof AckEventSchema>;

export const LifecycleStateEventSchema = z.strictObject({
  type: z.literal("lifecycle.state"),
  state: LifecycleStateSchema,
});

const RequestedAudioSettingsSchema = AudioSettingsSchema.partial().refine(
  (audio) => Object.keys(audio).length > 0,
  "An audio settings change must request at least one field",
);
const RequestedMotionSettingsSchema = MotionSettingsSchema.partial().refine(
  (motion) => Object.keys(motion).length > 0,
  "A motion settings change must request at least one field",
);

export const SettingsChangeSchema = z
  .strictObject({
    audio: RequestedAudioSettingsSchema.optional(),
    motion: RequestedMotionSettingsSchema.optional(),
  })
  .refine((change) => change.audio !== undefined || change.motion !== undefined, {
    message: "A settings change must request at least one field",
  });
export type SettingsChange = z.infer<typeof SettingsChangeSchema>;

export const SettingsChangeRequestEventSchema = z.strictObject({
  type: z.literal("settings.changeRequest"),
  change: SettingsChangeSchema,
});

export const LifecycleChangeActionSchema = z.enum(["pause", "resume"]);
export type LifecycleChangeAction = z.infer<typeof LifecycleChangeActionSchema>;

export const LifecycleChangeRequestEventSchema = z.strictObject({
  type: z.literal("lifecycle.changeRequest"),
  action: LifecycleChangeActionSchema,
});

export const HostActionSchema = z.enum(["fullscreen.enter", "fullscreen.exit"]);
export type HostAction = z.infer<typeof HostActionSchema>;

export const HostActionRequestEventSchema = z.strictObject({
  type: z.literal("hostAction.request"),
  action: HostActionSchema,
});

export const DiagnosticEventMessageSchema = z.strictObject({
  type: z.literal("diagnostic.event"),
  event: DiagnosticEventSchema,
});

export const DiagnosticsSnapshotResultEventSchema = z.strictObject({
  type: z.literal("diagnostics.snapshotResult"),
  commandId: CommandIdSchema,
  snapshot: DiagnosticSnapshotSchema,
});

export const GuestEventSchema = z.discriminatedUnion("type", [
  ReadyEventSchema,
  AckEventSchema,
  LifecycleStateEventSchema,
  SettingsChangeRequestEventSchema,
  LifecycleChangeRequestEventSchema,
  HostActionRequestEventSchema,
  DiagnosticEventMessageSchema,
  DiagnosticsSnapshotResultEventSchema,
]);
export type GuestEvent = z.infer<typeof GuestEventSchema>;

export type ReadyEvent = z.infer<typeof ReadyEventSchema>;
export type LifecycleStateEvent = z.infer<typeof LifecycleStateEventSchema>;
export type SettingsChangeRequestEvent = z.infer<typeof SettingsChangeRequestEventSchema>;
export type LifecycleChangeRequestEvent = z.infer<typeof LifecycleChangeRequestEventSchema>;
export type HostActionRequestEvent = z.infer<typeof HostActionRequestEventSchema>;
export type DiagnosticEventMessage = z.infer<typeof DiagnosticEventMessageSchema>;
export type DiagnosticsSnapshotResultEvent = z.infer<typeof DiagnosticsSnapshotResultEventSchema>;
