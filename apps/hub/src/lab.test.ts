import { describe, expect, it } from "vite-plus/test";

import { GAME_CATALOG } from "./catalog";
import {
  DIAGNOSTIC_EXPORT_MAX_BYTES,
  HUB_DIAGNOSTIC_EVENT_LIMIT,
  appendDiagnosticEvent,
  issueSummaryText,
  makeDiagnosticEnvelope,
  serializeDiagnosticEnvelope,
  type DiagnosticEvent,
} from "./diagnostics";
import {
  createHubLabScenes,
  readRequiredHexColorCssVariable,
  readRequiredPixelCssVariable,
} from "./lab";

function cssVariables(
  values: Readonly<Record<string, string>>,
): Pick<CSSStyleDeclaration, "getPropertyValue"> {
  return {
    getPropertyValue: (name) => values[name] ?? "",
  };
}

function firstGame() {
  const game = GAME_CATALOG[0];
  if (!game) throw new Error("The production catalog must contain at least one game");
  return game;
}

describe("Lab CSS variable contract", () => {
  it("reads the declared pixel and color values exactly", () => {
    const styles = cssVariables({
      "--stage-radius": "28px",
      "--frame-offset": "0px",
      "--lab-accent": "#1646c8",
    });
    expect(readRequiredPixelCssVariable(styles, "--stage-radius")).toBe(28);
    expect(readRequiredPixelCssVariable(styles, "--frame-offset")).toBe(0);
    expect(readRequiredHexColorCssVariable(styles, "--lab-accent")).toBe("#1646c8");
  });

  it("throws when a required value is missing or malformed", () => {
    const styles = cssVariables({ "--bad-pixels": "28", "--bad-color": "blue" });
    expect(() => readRequiredPixelCssVariable(styles, "--missing")).toThrow(
      "Required CSS variable --missing is missing.",
    );
    expect(() => readRequiredPixelCssVariable(styles, "--bad-pixels")).toThrow(
      'Required CSS variable --bad-pixels must be a finite pixel value; received "28".',
    );
    expect(() => readRequiredHexColorCssVariable(styles, "--bad-color")).toThrow(
      'Required CSS variable --bad-color must be a six-digit hex color; received "blue".',
    );
  });
});

describe("Hub Lab scenes", () => {
  it("binds presets to the current manifest identity", () => {
    const game = firstGame();
    const identity = {
      gameId: game.id,
      gameVersion: "3.7.1",
      buildId: "gameyard@0123456789abcdef",
    } as const;
    const { registry, presets } = createHubLabScenes(identity);

    expect(presets.map((preset) => preset.sceneId)).toEqual([
      "ready-balanced",
      "paused-accessible",
    ]);
    expect(presets.every((preset) => preset.parameters.accent === game.accent)).toBe(true);
    expect(registry.parseJson(registry.serialize(presets[0]!))).toEqual(presets[0]);
    expect(() => registry.parsePreset({ ...presets[0]!, gameVersion: "3.7.2" })).toThrow(
      "does not exactly match",
    );
  });
});

describe("bounded diagnostic envelope", () => {
  const event = (index: number, message = `event ${index}`): DiagnosticEvent => ({
    at: new Date(index * 1000).toISOString(),
    type: `test.${index}`,
    detail: { message },
  });

  it("retains 18 Hub events and derives issue summary and JSON from one strict envelope", () => {
    const game = firstGame();
    let events: readonly DiagnosticEvent[] = [];
    for (let index = 0; index < 21; index += 1) {
      events = appendDiagnosticEvent(events, event(index));
    }
    expect(events).toHaveLength(HUB_DIAGNOSTIC_EVENT_LIMIT);
    expect(events[0]?.type).toBe("test.20");

    const envelope = makeDiagnosticEnvelope({ kind: "game", game }, "en", 4, events, {
      gameId: game.id,
      gameVersion: "3.7.1",
      buildId: __GAMEYARD_BUILD__,
      snapshot: {
        lifecycle: "active",
        settingsRevision: 4,
        inputEnabled: true,
        events: [],
      },
    });
    const json = serializeDiagnosticEnvelope(envelope);
    const summary = issueSummaryText(envelope);

    expect(Object.keys(JSON.parse(json) as object).sort()).toEqual([
      "buildId",
      "game",
      "generatedAt",
      "hub",
      "schemaVersion",
    ]);
    expect(summary).toContain(`buildId=${envelope.buildId}`);
    expect(summary).toContain(`gameId=${game.id}`);
    expect(summary).toContain("gameVersion=3.7.1");
    expect(json).not.toMatch(/localStorage|save|stack|query|screenshot/i);
  });

  it("refuses an export larger than 64 KiB", () => {
    let events: readonly DiagnosticEvent[] = [];
    for (let index = 0; index < HUB_DIAGNOSTIC_EVENT_LIMIT; index += 1) {
      events = appendDiagnosticEvent(events, event(index, "x".repeat(4_000)));
    }
    const envelope = makeDiagnosticEnvelope({ kind: "index" }, "en", 1, events, null);
    expect(() => serializeDiagnosticEnvelope(envelope)).toThrow(
      `exceeds the ${DIAGNOSTIC_EXPORT_MAX_BYTES}-byte limit`,
    );
  });
});
