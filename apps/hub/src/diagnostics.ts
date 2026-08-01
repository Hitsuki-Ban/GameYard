import type { HubRoute } from "./route";
import type { SupportedLocale } from "./settings";

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
): DiagnosticSnapshot {
  return {
    build: __GAMEYARD_BUILD__,
    route: describeRoute(route),
    selectedGame: route.kind === "game" ? route.game.id : null,
    locale,
    settingsRevision,
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
    `events=${snapshot.events.length}`,
  ].join("\n");
}
