import type { GameId } from "@gameyard/game-contract";

export const PWA_MESSAGE_TIMEOUT_MS = 8_000;

export interface PwaOfflineStatus {
  readonly buildId: string;
  readonly savedGames: readonly string[];
  readonly staleGames: readonly string[];
}

export type PwaRequest =
  | { readonly type: "gameyard:pwa-status"; readonly buildId: string }
  | {
      readonly type: "gameyard:pwa-save-game";
      readonly buildId: string;
      readonly gameId: GameId;
      readonly files: readonly string[];
    }
  | {
      readonly type: "gameyard:pwa-remove-game";
      readonly buildId: string;
      readonly gameId: string;
    }
  | { readonly type: "gameyard:pwa-clear-games"; readonly buildId: string }
  | { readonly type: "gameyard:pwa-activate"; readonly buildId: string };

export type PwaResponse =
  | { readonly ok: true; readonly status: PwaOfflineStatus }
  | { readonly ok: false; readonly error: string };

export function isCanonicalGameFile(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !value.startsWith("/") &&
    !value.endsWith("/") &&
    !value.includes("\\") &&
    !value.includes(":") &&
    !value.includes("?") &&
    !value.includes("#") &&
    value.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..")
  );
}

export function isPwaResponse(value: unknown): value is PwaResponse {
  if (value === null || typeof value !== "object") return false;
  const response = value as Record<string, unknown>;
  if (response.ok === false) return typeof response.error === "string";
  if (response.ok !== true || response.status === null || typeof response.status !== "object") {
    return false;
  }
  const status = response.status as Record<string, unknown>;
  return (
    typeof status.buildId === "string" &&
    Array.isArray(status.savedGames) &&
    status.savedGames.every((gameId) => typeof gameId === "string") &&
    Array.isArray(status.staleGames) &&
    status.staleGames.every((gameId) => typeof gameId === "string")
  );
}
