import { z } from "zod";

export const PROTOCOL_VERSION = 1 as const;

const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const diagnosticCodePattern = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

export const GameIdSchema = z.string().min(1).max(128).regex(identifierPattern);
export type GameId = z.infer<typeof GameIdSchema>;

export const BuildIdSchema = z.string().min(1).max(128).regex(identifierPattern);
export type BuildId = z.infer<typeof BuildIdSchema>;

export const InstanceIdSchema = z.string().min(1).max(128).regex(identifierPattern);
export type InstanceId = z.infer<typeof InstanceIdSchema>;

export const CommandIdSchema = z.string().min(1).max(128).regex(identifierPattern);
export type CommandId = z.infer<typeof CommandIdSchema>;

export const LocaleSchema = z.enum(["system", "en", "ja", "zh-Hans"]);
export type Locale = z.infer<typeof LocaleSchema>;

export const ResolvedLocaleSchema = z.enum(["en", "ja", "zh-Hans"]);
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

export const HostContextSchema = z.strictObject({
  protocol: z.literal(PROTOCOL_VERSION),
  buildId: BuildIdSchema,
  gameId: GameIdSchema,
  instanceId: InstanceIdSchema,
  baseUrl: z.string().min(1),
  locale: LocaleContextSchema,
  settings: HostSettingsSchema,
  diagnostics: DiagnosticsSchema,
});
export type HostContext = z.infer<typeof HostContextSchema>;

export const GameHelloSchema = z.strictObject({
  type: z.literal("hello"),
  protocol: z.literal(PROTOCOL_VERSION),
  buildId: BuildIdSchema,
  gameId: GameIdSchema,
  instanceId: InstanceIdSchema,
});
export type GameHello = z.infer<typeof GameHelloSchema>;

export const HostConnectSchema = z.strictObject({
  type: z.literal("connect"),
  context: HostContextSchema,
});
export type HostConnect = z.infer<typeof HostConnectSchema>;

export const WindowMessageSchema = z.discriminatedUnion("type", [
  GameHelloSchema,
  HostConnectSchema,
]);
export type WindowMessage = z.infer<typeof WindowMessageSchema>;

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
  HostActionRequestEventSchema,
  DiagnosticEventMessageSchema,
  DiagnosticsSnapshotResultEventSchema,
]);
export type GuestEvent = z.infer<typeof GuestEventSchema>;

export type ReadyEvent = z.infer<typeof ReadyEventSchema>;
export type LifecycleStateEvent = z.infer<typeof LifecycleStateEventSchema>;
export type SettingsChangeRequestEvent = z.infer<typeof SettingsChangeRequestEventSchema>;
export type HostActionRequestEvent = z.infer<typeof HostActionRequestEventSchema>;
export type DiagnosticEventMessage = z.infer<typeof DiagnosticEventMessageSchema>;
export type DiagnosticsSnapshotResultEvent = z.infer<typeof DiagnosticsSnapshotResultEventSchema>;
