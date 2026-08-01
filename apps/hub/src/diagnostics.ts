import type { HubRoute } from "./route";
import type { SupportedLocale } from "./settings";
import type { DiagnosticSnapshot as GuestDiagnosticSnapshot } from "@gameyard/game-contract";

export interface DiagnosticEvent {
  readonly at: string;
  readonly type: string;
  readonly detail: Readonly<Record<string, string | number | boolean | null>>;
}

export interface DiagnosticSnapshot {
  readonly build: string;
  readonly route: string;
  readonly selectedGame: string | null;
  readonly locale: SupportedLocale;
  readonly settingsRevision: number | null;
  readonly guest: GuestDiagnosticSnapshot | null;
  readonly events: readonly DiagnosticEvent[];
}

export function describeRoute(route: HubRoute): string {
  if (route.kind === "index") return "index";
  if (route.kind === "game") return `game:${route.game.id}`;
  return `error:${route.code}`;
}

export function makeDiagnosticSnapshot(
  route: HubRoute,
  locale: SupportedLocale,
  settingsRevision: number | null,
  events: readonly DiagnosticEvent[],
  guest: GuestDiagnosticSnapshot | null = null,
): DiagnosticSnapshot {
  return {
    build: __GAMEYARD_BUILD__,
    route: describeRoute(route),
    selectedGame: route.kind === "game" ? route.game.id : null,
    locale,
    settingsRevision,
    guest,
    events,
  };
}

export function diagnosticText(snapshot: DiagnosticSnapshot): string {
  return [
    `GameYard ${snapshot.build}`,
    `route=${snapshot.route}`,
    `selected=${snapshot.selectedGame ?? "none"}`,
    `locale=${snapshot.locale}`,
    `settingsRevision=${snapshot.settingsRevision ?? "invalid"}`,
    `guestLifecycle=${snapshot.guest?.lifecycle ?? "none"}`,
    `guestSettingsRevision=${snapshot.guest?.settingsRevision ?? "none"}`,
    `guestInputEnabled=${snapshot.guest?.inputEnabled ?? "none"}`,
    `guestEvents=${snapshot.guest?.events.length ?? 0}`,
    `events=${snapshot.events.length}`,
  ].join("\n");
}
