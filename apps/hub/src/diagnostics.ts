import type {
  BuildId,
  DiagnosticSnapshot as GuestDiagnosticSnapshot,
  GameId,
  GameVersion,
  LifecycleState,
} from "@gameyard/game-contract";

import type { HubRoute } from "./route";
import type { SupportedLocale } from "./settings";

export const HUB_DIAGNOSTIC_EVENT_LIMIT = 18;
export const DIAGNOSTIC_EXPORT_MAX_BYTES = 64 * 1024;
export const DIAGNOSTIC_ENVELOPE_SCHEMA_VERSION = 1 as const;

export interface DiagnosticEvent {
  readonly at: string;
  readonly type: string;
  readonly detail: Readonly<Record<string, string | number | boolean | null>>;
}

export interface RuntimeDiagnosticState {
  readonly gameId: GameId;
  readonly gameVersion: GameVersion;
  readonly buildId: BuildId;
  readonly snapshot: GuestDiagnosticSnapshot | null;
}

export type DiagnosticHealth = "healthy" | "degraded" | "unavailable";

export interface DiagnosticEnvelope {
  readonly schemaVersion: typeof DIAGNOSTIC_ENVELOPE_SCHEMA_VERSION;
  readonly generatedAt: string;
  readonly buildId: BuildId;
  readonly hub: {
    readonly health: Exclude<DiagnosticHealth, "unavailable">;
    readonly route: string;
    readonly locale: SupportedLocale;
    readonly settingsRevision: number | null;
    readonly events: readonly DiagnosticEvent[];
  };
  readonly game: {
    readonly id: GameId;
    readonly version: GameVersion;
    readonly buildId: BuildId;
    readonly health: DiagnosticHealth;
    readonly lifecycle: LifecycleState | null;
    readonly settingsRevision: number | null;
    readonly inputEnabled: boolean | null;
    readonly events: GuestDiagnosticSnapshot["events"];
  } | null;
}

export class DiagnosticEnvelopeError extends Error {
  override readonly name = "DiagnosticEnvelopeError";
}

export function describeRoute(route: HubRoute): string {
  if (route.kind === "index") return "index";
  if (route.kind === "game") return `game:${route.game.id}`;
  return `error:${route.code}`;
}

export function appendDiagnosticEvent(
  events: readonly DiagnosticEvent[],
  event: DiagnosticEvent,
): readonly DiagnosticEvent[] {
  if (!Number.isFinite(Date.parse(event.at))) {
    throw new DiagnosticEnvelopeError("Diagnostic event timestamp must be an ISO date string");
  }
  if (event.type.length === 0 || event.type.length > 96) {
    throw new DiagnosticEnvelopeError("Diagnostic event type must contain 1 to 96 characters");
  }
  if (
    typeof event.detail !== "object" ||
    event.detail === null ||
    Array.isArray(event.detail) ||
    Object.values(event.detail).some(
      (value) =>
        value !== null &&
        typeof value !== "string" &&
        typeof value !== "number" &&
        typeof value !== "boolean",
    )
  ) {
    throw new DiagnosticEnvelopeError("Diagnostic event detail must contain scalar values");
  }
  return [event, ...events].slice(0, HUB_DIAGNOSTIC_EVENT_LIMIT);
}

function gameHealth(snapshot: GuestDiagnosticSnapshot | null): DiagnosticHealth {
  if (snapshot === null) return "unavailable";
  return snapshot.lifecycle === "failed" ||
    snapshot.lifecycle === "disposing" ||
    snapshot.lifecycle === "disposed"
    ? "degraded"
    : "healthy";
}

export function makeDiagnosticEnvelope(
  route: HubRoute,
  locale: SupportedLocale,
  settingsRevision: number | null,
  events: readonly DiagnosticEvent[],
  runtime: RuntimeDiagnosticState | null,
): DiagnosticEnvelope {
  if (events.length > HUB_DIAGNOSTIC_EVENT_LIMIT) {
    throw new DiagnosticEnvelopeError(
      `Hub diagnostics exceed the ${HUB_DIAGNOSTIC_EVENT_LIMIT}-event limit`,
    );
  }
  if (runtime !== null) {
    if (route.kind !== "game" || route.game.id !== runtime.gameId) {
      throw new DiagnosticEnvelopeError("Diagnostic runtime identity does not match the Hub route");
    }
    if (runtime.buildId !== __GAMEYARD_BUILD__) {
      throw new DiagnosticEnvelopeError("Diagnostic runtime build does not match the Hub build");
    }
  }

  return {
    schemaVersion: DIAGNOSTIC_ENVELOPE_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    buildId: __GAMEYARD_BUILD__ as BuildId,
    hub: {
      health: route.kind === "error" || settingsRevision === null ? "degraded" : "healthy",
      route: describeRoute(route),
      locale,
      settingsRevision,
      events: [...events],
    },
    game:
      runtime === null
        ? null
        : {
            id: runtime.gameId,
            version: runtime.gameVersion,
            buildId: runtime.buildId,
            health: gameHealth(runtime.snapshot),
            lifecycle: runtime.snapshot?.lifecycle ?? null,
            settingsRevision: runtime.snapshot?.settingsRevision ?? null,
            inputEnabled: runtime.snapshot?.inputEnabled ?? null,
            events: runtime.snapshot === null ? [] : [...runtime.snapshot.events],
          },
  };
}

export function issueSummaryText(envelope: DiagnosticEnvelope): string {
  const game = envelope.game;
  return [
    `GameYard diagnostics schema ${envelope.schemaVersion}`,
    `generatedAt=${envelope.generatedAt}`,
    `buildId=${envelope.buildId}`,
    `hubHealth=${envelope.hub.health}`,
    `route=${envelope.hub.route}`,
    `locale=${envelope.hub.locale}`,
    `settingsRevision=${envelope.hub.settingsRevision ?? "invalid"}`,
    `hubEvents=${envelope.hub.events.length}`,
    `gameId=${game?.id ?? "none"}`,
    `gameVersion=${game?.version ?? "none"}`,
    `gameBuildId=${game?.buildId ?? "none"}`,
    `gameHealth=${game?.health ?? "unavailable"}`,
    `gameLifecycle=${game?.lifecycle ?? "none"}`,
    `gameSettingsRevision=${game?.settingsRevision ?? "none"}`,
    `gameInputEnabled=${game?.inputEnabled ?? "none"}`,
    `gameEvents=${game?.events.length ?? 0}`,
  ].join("\n");
}

export function serializeDiagnosticEnvelope(envelope: DiagnosticEnvelope): string {
  const json = `${JSON.stringify(envelope, null, 2)}\n`;
  const bytes = new TextEncoder().encode(json).byteLength;
  if (bytes > DIAGNOSTIC_EXPORT_MAX_BYTES) {
    throw new DiagnosticEnvelopeError(
      `Diagnostic export is ${bytes} bytes and exceeds the ${DIAGNOSTIC_EXPORT_MAX_BYTES}-byte limit`,
    );
  }
  return json;
}
