import { describe, expect, it } from "vite-plus/test";

import { gameSearch, parseHubRoute } from "./route";

describe("hub route", () => {
  it("leaves the index unselected", () => {
    expect(parseHubRoute("")).toEqual({ kind: "index" });
  });

  it("selects only an exact catalog id", () => {
    const route = parseHubRoute("?game=pulse-link-overdrive");
    expect(route.kind).toBe("game");
    if (route.kind === "game") expect(route.game.id).toBe("pulse-link-overdrive");
  });

  it("reports unknown and duplicate game parameters", () => {
    expect(parseHubRoute("?game=unknown")).toEqual({
      kind: "error",
      code: "unknown-game",
      received: ["unknown"],
    });
    expect(parseHubRoute("?game=tumbledrum&game=crown-breaker")).toEqual({
      kind: "error",
      code: "duplicate-game",
      received: ["tumbledrum", "crown-breaker"],
    });
  });

  it("creates a relative query route", () => {
    expect(gameSearch("crown-breaker")).toBe("?game=crown-breaker");
  });
});
