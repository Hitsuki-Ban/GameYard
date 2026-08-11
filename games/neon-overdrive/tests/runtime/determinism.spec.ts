import { expect, test, type Page } from "@playwright/test";

import { bootRuntime, command, dispose, drainEvents, observe } from "./runtime-driver";

type DeterministicRun = {
  checkpoints: any[];
  events: any[];
};

function relativePresentationTime(snapshot: any, origin: number) {
  return {
    ...snapshot,
    presentationTime: Number((snapshot.presentationTime - origin).toFixed(12)),
  };
}

async function feedAtRefreshRate(
  page: Page,
  refreshHz: 30 | 60 | 120,
  startFrame: number,
  ticks: number,
) {
  return page.evaluate(
    ({ hz, firstFrame, tickCount }) => {
      const frames = (tickCount * hz) / 60;
      let snapshot = window.__NEON_DEBUG__.observe();
      for (let offset = 1; offset <= frames; offset += 1) {
        snapshot = window.__NEON_DEBUG__.feedFrame(((firstFrame + offset) * 1000) / hz);
      }
      return { frame: firstFrame + frames, tick: snapshot.tick };
    },
    { hz: refreshHz, firstFrame: startFrame, tickCount: ticks },
  );
}

async function runTrace(page: Page, refreshHz: 30 | 60 | 120): Promise<DeterministicRun> {
  await bootRuntime(page);
  await page.evaluate(() => window.__NEON_DEBUG__.freezePresentation());
  await page.evaluate(() => window.__NEON_DEBUG__.feedFrame(0));
  await drainEvents(page);
  const checkpoints = [];
  const events = [];
  let frame = 0;

  await command(page, { type: "start", mode: "story" });
  const presentationOrigin = (await observe(page)).presentationTime;
  ({ frame } = await feedAtRefreshRate(page, refreshHz, frame, 30));
  checkpoints.push(relativePresentationTime(await observe(page), presentationOrigin));
  events.push(...(await drainEvents(page)));

  await command(page, { type: "move", x: 1, y: 0 });
  await command(page, { type: "focus", active: true });
  ({ frame } = await feedAtRefreshRate(page, refreshHz, frame, 30));
  checkpoints.push(relativePresentationTime(await observe(page), presentationOrigin));
  events.push(...(await drainEvents(page)));

  await command(page, { type: "drop", active: true });
  ({ frame } = await feedAtRefreshRate(page, refreshHz, frame, 60));
  await command(page, { type: "drop", active: false });
  await command(page, { type: "releaseAll" });
  checkpoints.push(relativePresentationTime(await observe(page), presentationOrigin));
  events.push(...(await drainEvents(page)));

  await dispose(page);
  return { checkpoints, events };
}

test("keeps checkpoints, snapshots, and events equal at 30/60/120 Hz feeding", async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() =>
    localStorage.removeItem("gameyard.game.neon-overdrive.profile.v1"),
  );
  const at30 = await runTrace(page, 30);
  const at60 = await runTrace(page, 60);
  const at120 = await runTrace(page, 120);

  expect(at60).toEqual(at30);
  expect(at120).toEqual(at30);
  expect(at30.checkpoints.map((checkpoint) => checkpoint.tick)).toEqual([30, 60, 120]);
});
