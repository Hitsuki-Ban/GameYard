import { describe, expect, it } from "vite-plus/test";

import { GAME_CATALOG } from "./catalog";
import { gameSearch, parseHubRoute } from "./route";

function gameAt(index: number) {
  const game = GAME_CATALOG[index];
  if (!game) throw new Error(`Production catalog is missing game at index ${index}`);
  return game;
}

describe("hub route", () => {
  it("leaves the index unselected", () => {
    expect(parseHubRoute("")).toEqual({ kind: "index" });
  });

  it("selects only an exact catalog id", () => {
    const game = gameAt(0);
    const route = parseHubRoute(gameSearch(game.id));
    expect(route.kind).toBe("game");
    if (route.kind === "game") expect(route.game.id).toBe(game.id);
  });

  it("reports unknown and duplicate game parameters", () => {
    expect(parseHubRoute("?game=unknown")).toEqual({
      kind: "error",
      code: "unknown-game",
      received: ["unknown"],
    });
    const first = gameAt(0);
    const second = gameAt(1);
    expect(parseHubRoute(`?game=${first.id}&game=${second.id}`)).toEqual({
      kind: "error",
      code: "duplicate-game",
      received: [first.id, second.id],
    });
  });

  it("creates a relative query route", () => {
    const game = gameAt(0);
    expect(gameSearch(game.id)).toBe(`?game=${game.id}`);
  });
});
