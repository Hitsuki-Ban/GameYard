import { expect, type Page } from "@playwright/test";

import { installResourceProbe } from "../testkit/resource-probe";

export const PROFILE_KEY = "gameyard.game.neon-overdrive.profile.v1";
export const LEGACY_KEY = "neon-overdrive-save-v1";

export type MockGamepadState = {
  connected: boolean;
  x: number;
  y: number;
  drop: boolean;
  focus: boolean;
  pause: boolean;
};

export async function installMockGamepad(page: Page): Promise<void> {
  await page.addInitScript(() => {
    let state = { connected: false, x: 0, y: 0, drop: false, focus: false, pause: false };
    const button = (pressed: boolean) => ({ pressed, touched: pressed, value: pressed ? 1 : 0 });
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: () => {
        if (!state.connected) return [];
        const buttons = Array.from({ length: 16 }, () => button(false));
        buttons[0] = button(state.drop);
        buttons[4] = button(state.focus);
        buttons[9] = button(state.pause);
        return [
          {
            axes: [state.x, state.y],
            buttons,
            connected: true,
            id: "GameYard deterministic test pad",
            index: 0,
            mapping: "standard",
            timestamp: performance.now(),
          },
        ];
      },
    });
    window.__NEON_GAMEPAD__ = {
      set(next) {
        state = structuredClone(next);
      },
    };
  });
}

export async function setMockGamepad(page: Page, state: MockGamepadState): Promise<void> {
  await page.evaluate((next) => window.__NEON_GAMEPAD__.set(next), state);
}

export async function bootRuntime(
  page: Page,
  options: { manualInit?: boolean; installProbe?: boolean } = {},
): Promise<void> {
  if (options.installProbe === true) await installResourceProbe(page);
  const target = options.manualInit === true ? "/?init=manual" : "/";
  await page.goto(target, { waitUntil: "load" });
  if (options.manualInit === true) {
    await page.waitForFunction(() => window.__NEON_HOST__?.awaitingInit === true);
    return;
  }
  await page.waitForFunction(() => window.__NEON_HOST__?.ready === true);
  await page.waitForFunction(() => typeof window.__NEON_DEBUG__?.observe === "function");
}

export async function observe(page: Page): Promise<any> {
  return page.evaluate(() => window.__NEON_DEBUG__.observe());
}

export async function advance(page: Page, ticks: number): Promise<void> {
  await page.evaluate((count) => window.__NEON_DEBUG__.advance(count), ticks);
}

export async function command(page: Page, value: Record<string, unknown>): Promise<void> {
  await page.evaluate((next) => window.__NEON_DEBUG__.command(next), value);
}

export async function mutate(page: Page, action: string, payload?: unknown): Promise<void> {
  await page.evaluate(({ mutation, value }) => window.__NEON_DEBUG__.mutate(mutation, value), {
    mutation: action,
    value: payload,
  });
}

export async function drainEvents(page: Page): Promise<any[]> {
  return page.evaluate(() => window.__NEON_DEBUG__.drainEvents());
}

export async function dispose(page: Page): Promise<void> {
  await page.evaluate(() => window.__NEON_HOST__.dispose());
  await expect.poll(() => page.evaluate(() => "__NEON_DEBUG__" in window)).toBe(false);
}

export async function expectFixedStage(page: Page): Promise<void> {
  const canvas = page.locator("#gameCanvas");
  await expect(canvas).toHaveAttribute("width", "540");
  await expect(canvas).toHaveAttribute("height", "960");
}

declare global {
  interface Window {
    __NEON_DEBUG__: {
      advance(ticks: number): void;
      observe(): any;
      command(command: Record<string, unknown>): void;
      mutate(action: string, payload?: unknown): void;
      drainEvents(): any[];
      resources(): Record<string, number>;
      freezePresentation(): void;
      resumePresentation(): void;
      feedFrame(timestampMs: number): any;
    };
    __NEON_HOST__: any;
    __NEON_GAMEPAD__: {
      set(state: MockGamepadState): void;
    };
    __NEON_DISPOSE_REPORT__: {
      before: Record<string, number>;
      after: Record<string, number>;
    };
    __GAMEYARD_RESOURCE_PROBE__: {
      snapshot(): import("../testkit/resource-probe").BrowserResourceSnapshot;
    };
  }
}
