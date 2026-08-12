import { expect, test, type Page } from "@playwright/test";

import {
  advance,
  bootRuntime,
  command,
  dispose,
  installMockGamepad,
  expectFixedStage,
  mutate,
  observe,
  setMockGamepad,
} from "./runtime-driver";

const zeroOwnedResources = {
  listeners: 0,
  timers: 0,
  animationFrames: 0,
  gamepad: 0,
  audioContexts: 0,
  audioSources: 0,
  musicScheduler: 0,
  musicSources: 0,
  pools: 0,
};

async function expectLifecycleRequest(page: Page, action: "pause" | "resume") {
  await expect
    .poll(() =>
      page.evaluate(
        (expected) =>
          window.__NEON_HOST__.events.some(
            (event: any) => event?.type === "lifecycle.changeRequest" && event.action === expected,
          ),
        action,
      ),
    )
    .toBe(true);
  await page.evaluate(() => window.__NEON_HOST__.drainEvents());
}

async function setControlledHidden(page: Page, hidden: boolean) {
  await page.evaluate((nextHidden) => {
    if (nextHidden) {
      Object.defineProperties(document, {
        hidden: { configurable: true, get: () => true },
        visibilityState: { configurable: true, get: () => "hidden" },
      });
    } else {
      Reflect.deleteProperty(document, "hidden");
      Reflect.deleteProperty(document, "visibilityState");
    }
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
}

test("keeps game-owned resources and storage untouched before INIT", async ({ page }) => {
  const initializationErrors: string[] = [];
  page.on("console", async (message) => {
    if (message.type() !== "error") return;
    for (const argument of message.args()) {
      const causes = await argument
        .evaluate((value) => {
          const details = [];
          let current = value;
          while (current instanceof Error) {
            details.push(`${current.name}: ${current.message}`);
            current = current.cause;
          }
          return details;
        })
        .catch(() => []);
      initializationErrors.push(...causes);
    }
  });
  await bootRuntime(page, { manualInit: true, installProbe: true });
  const preInit = await page.evaluate(() => window.__NEON_HOST__.preInit);
  const preInitResources = await page.evaluate(() => window.__GAMEYARD_RESOURCE_PROBE__.snapshot());

  expect(preInit.debugPresent).toBe(false);
  expect(preInitResources).toMatchObject({
    animationFrames: 0,
    intervals: 0,
    audioContexts: 0,
    gamepadPolls: 0,
    pointerCaptures: 0,
    storageReads: 0,
    storageWrites: 0,
  });

  await page.evaluate(() => window.__NEON_HOST__.init());
  await page.waitForFunction(
    () =>
      window.__NEON_HOST__.ready === true ||
      document.querySelector("[data-neon-boot-error]") !== null,
  );
  if (!(await page.evaluate(() => window.__NEON_HOST__.ready === true))) {
    await page.waitForTimeout(50);
    throw new Error(`Neon INIT failed: ${initializationErrors.join(" <- ")}`);
  }
  await expectFixedStage(page);
  expect(await page.evaluate(() => window.__NEON_DEBUG__.resources())).toMatchObject({
    listeners: expect.any(Number),
    timers: expect.any(Number),
    animationFrames: expect.any(Number),
    gamepad: expect.any(Number),
    audioContexts: 0,
    audioSources: 0,
  });
  await dispose(page);

  await bootRuntime(page, { manualInit: true });
  await page.evaluate(() => window.__NEON_HOST__.init());
  await page.waitForFunction(() => window.__NEON_HOST__.ready === true);
  await page.evaluate(() =>
    window.__NEON_HOST__.port.postMessage({ type: "invalid.testkit.protocol.message" }),
  );
  await expect
    .poll(() => page.evaluate(() => window.__NEON_DEBUG__.resources()))
    .toEqual(zeroOwnedResources);
});

test("owns create, logical input, pause, release, dispose, and fresh recreation", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await installMockGamepad(page);
  await page.addInitScript(() =>
    localStorage.removeItem("gameyard.game.neon-overdrive.profile.v1"),
  );

  for (let generation = 0; generation < 3; generation += 1) {
    await bootRuntime(page, { manualInit: true, installProbe: generation === 0 });
    const browserBaseline = await page.evaluate(() =>
      window.__GAMEYARD_RESOURCE_PROBE__.snapshot(),
    );
    await page.evaluate(() => window.__NEON_HOST__.init());
    await page.waitForFunction(() => window.__NEON_HOST__.ready === true);
    await expectFixedStage(page);
    expect(await observe(page)).toMatchObject({ screen: "title", tick: 0 });

    if (generation === 0) {
      const titlePresentation = await observe(page);
      await expect
        .poll(() => observe(page).then((snapshot) => snapshot.presentationTime))
        .toBeGreaterThan(titlePresentation.presentationTime);
      expect((await observe(page)).tick).toBe(0);
      await page.evaluate(() => window.__NEON_DEBUG__.freezePresentation());
      const frozenTitle = await observe(page);
      await page.waitForTimeout(50);
      expect(await observe(page)).toEqual(frozenTitle);
      expect(
        await page.evaluate(() => window.__GAMEYARD_RESOURCE_PROBE__.snapshot().animationFrames),
      ).toBe(0);
      await page.evaluate(() => window.__NEON_DEBUG__.resumePresentation());
      await expect
        .poll(() => observe(page).then((snapshot) => snapshot.presentationTime))
        .toBeGreaterThan(frozenTitle.presentationTime);
    }

    await command(page, { type: "start", mode: "story" });
    await mutate(page, "protectPlayer");
    let capturedPointerId: number | null = null;
    if (generation === 0) {
      await test.step("activates the real audio graph", async () => {
        await page.evaluate(() => {
          window.__NEON_HOST__.settingsApplyState = "pending";
          void window.__NEON_HOST__
            .applySettings({
              revision: 1,
              audio: { master: 1, music: 1, sfx: 1 },
              motion: { reduced: false, screenShake: false },
            })
            .then(() => {
              window.__NEON_HOST__.settingsApplyState = "resolved";
            })
            .catch((error: Error) => {
              window.__NEON_HOST__.settingsApplyState = `rejected:${error.message}`;
            });
        });
        await expect
          .poll(() =>
            page.evaluate(() => ({
              state: window.__NEON_HOST__.settingsApplyState,
              failed: window.__NEON_HOST__.failed,
              pending: [...window.__NEON_HOST__.pending.keys()],
              events: window.__NEON_HOST__.events,
            })),
          )
          .toMatchObject({ state: "resolved", failed: false, pending: [] });
        expect(
          await page.evaluate(() => ({
            browserAnimationFrames: window.__GAMEYARD_RESOURCE_PROBE__.snapshot().animationFrames,
            documentHidden: document.hidden,
            hostEvents: window.__NEON_HOST__.events,
            ownedAnimationFrames: window.__NEON_DEBUG__.resources().animationFrames,
          })),
        ).toMatchObject({
          browserAnimationFrames: 1,
          documentHidden: false,
          ownedAnimationFrames: 1,
        });
        await page.keyboard.press("ArrowRight");
        await expect
          .poll(() => page.evaluate(() => window.__NEON_DEBUG__.resources().audioContexts))
          .toBe(1);
        await expect
          .poll(() => page.evaluate(() => window.__NEON_DEBUG__.resources().audioSources))
          .toBeGreaterThan(0);
        await expect.poll(() => observe(page).then((snapshot) => snapshot.tick)).toBeGreaterThan(0);
      });

      await test.step("gates the on-screen DROP behind Host input authority", async () => {
        const canvas = page.locator("#gameCanvas");
        const canvasBox = await canvas.boundingBox();
        if (canvasBox === null) throw new Error("Neon canvas has no touch presentation box.");
        await page.touchscreen.tap(
          canvasBox.x + canvasBox.width / 2,
          canvasBox.y + canvasBox.height * 0.75,
        );
        await expect(page.locator("#control-focus")).toBeHidden();
        await expect(page.locator("#touch-drive")).toBeVisible();
        const drop = await page.locator("#touch-drive").boundingBox();
        if (drop === null) throw new Error("Neon on-screen DROP control has no input box.");
        await mutate(page, "prepareDrive");
        const beforeDisabledDrop = await observe(page);
        await page.evaluate(() => window.__NEON_DEBUG__.drainEvents());
        await page.evaluate(() =>
          window.__NEON_HOST__.send("input.setEnabled", { enabled: false }),
        );
        await expect(page.locator("#touch-drive")).toBeHidden();
        await page.touchscreen.tap(drop.x + drop.width / 2, drop.y + drop.height / 2);
        expect(await observe(page)).toMatchObject({
          drive: beforeDisabledDrop.drive,
          combat: { overdrive: { remaining: 0 } },
        });
        expect(
          (await page.evaluate(() => window.__NEON_DEBUG__.drainEvents())).some(
            (event: any) => event.type === "overdrive.activated",
          ),
        ).toBe(false);
        await page.evaluate(() => window.__NEON_HOST__.send("input.setEnabled", { enabled: true }));
        await expect(page.locator("#touch-drive")).toBeVisible();
      });

      await test.step("honors keyboard pause only after Host authority", async () => {
        await page.evaluate(() => window.__NEON_HOST__.drainEvents());
        await page.keyboard.press("Escape");
        await expectLifecycleRequest(page, "pause");
        await expect(page.locator("#pause-dialog")).not.toBeVisible();
        await page.evaluate(() => window.__NEON_HOST__.send("lifecycle.pause"));
        await expect(page.locator("#pause-dialog")).toBeVisible();
        const paused = await observe(page);
        const pausedPolls = await page.evaluate(
          () => window.__GAMEYARD_RESOURCE_PROBE__.snapshot().gamepadPolls,
        );
        await expect
          .poll(() =>
            page.evaluate(() => window.__GAMEYARD_RESOURCE_PROBE__.snapshot().animationFrames),
          )
          .toBe(0);
        await expect
          .poll(() => page.evaluate(() => window.__NEON_DEBUG__.resources().audioSources))
          .toBe(0);
        await page.waitForTimeout(50);
        expect(await observe(page)).toEqual(paused);
        expect(
          await page.evaluate(() => window.__GAMEYARD_RESOURCE_PROBE__.snapshot().gamepadPolls),
        ).toBe(pausedPolls);
      });

      await test.step("requires a neutral Gamepad edge after resume", async () => {
        await setMockGamepad(page, {
          connected: true,
          x: 0,
          y: 0,
          drop: false,
          focus: false,
          pause: true,
        });
        await page.locator("#resume-button").click();
        await expectLifecycleRequest(page, "resume");
        await page.evaluate(() => window.__NEON_HOST__.send("lifecycle.resume"));
        await expect(page.locator("#pause-dialog")).not.toBeVisible();
        await page.waitForTimeout(50);
        expect(
          await page.evaluate(() =>
            window.__NEON_HOST__.events.some(
              (event: any) => event?.type === "lifecycle.changeRequest" && event.action === "pause",
            ),
          ),
        ).toBe(false);
        const pollsBeforeNeutral = await page.evaluate(
          () => window.__GAMEYARD_RESOURCE_PROBE__.snapshot().gamepadPolls,
        );
        await setMockGamepad(page, {
          connected: true,
          x: 0,
          y: 0,
          drop: false,
          focus: false,
          pause: false,
        });
        await expect
          .poll(() =>
            page.evaluate(() => window.__GAMEYARD_RESOURCE_PROBE__.snapshot().gamepadPolls),
          )
          .toBeGreaterThan(pollsBeforeNeutral);
        await setMockGamepad(page, {
          connected: true,
          x: 0,
          y: 0,
          drop: false,
          focus: false,
          pause: true,
        });
        await expectLifecycleRequest(page, "pause");
        await page.evaluate(() => window.__NEON_HOST__.send("lifecycle.pause"));
        await setMockGamepad(page, {
          connected: true,
          x: 0,
          y: 0,
          drop: false,
          focus: false,
          pause: false,
        });
        await page.evaluate(() => window.__NEON_HOST__.send("lifecycle.resume"));
        await expect(page.locator("#pause-dialog")).not.toBeVisible();
      });

      await test.step("does not auto-resume when visibility returns", async () => {
        await setControlledHidden(page, true);
        const hidden = await observe(page);
        const hiddenPolls = await page.evaluate(
          () => window.__GAMEYARD_RESOURCE_PROBE__.snapshot().gamepadPolls,
        );
        await setControlledHidden(page, false);
        await page.waitForTimeout(50);
        expect(await observe(page)).toEqual(hidden);
        expect(
          await page.evaluate(() => window.__GAMEYARD_RESOURCE_PROBE__.snapshot().gamepadPolls),
        ).toBe(hiddenPolls);
        await expect(page.locator("#pause-dialog")).toBeVisible();
        await page.evaluate(() => window.__NEON_HOST__.send("lifecycle.resume"));
        await expect(page.locator("#pause-dialog")).not.toBeVisible();
      });
    }

    await test.step(`runs deterministic lifecycle generation ${generation}`, async () => {
      await page.evaluate(() => window.__NEON_DEBUG__.freezePresentation());
      await advance(page, 1);
      const beforeMove = await observe(page);
      await command(page, { type: "move", x: 1, y: 0 });
      await advance(page, 12);
      const afterMove = await observe(page);
      expect(afterMove.player.x).toBeGreaterThan(beforeMove.player.x);

      await page.evaluate(() => window.__NEON_HOST__.send("lifecycle.pause"));
      const paused = await observe(page);
      await advance(page, 30);
      expect(await observe(page)).toEqual(paused);
      await page.evaluate(() => window.__NEON_HOST__.send("input.releaseAll"));

      if (generation === 0) {
        await page.evaluate(() => window.__NEON_HOST__.send("lifecycle.resume"));
        await expect(page.locator("#pause-dialog")).not.toBeVisible();
        const canvas = page.locator("#gameCanvas");
        await page.evaluate(() => {
          const canvas = document.querySelector<HTMLCanvasElement>("#gameCanvas");
          if (canvas === null) throw new Error("Neon canvas is missing.");
          const record = (event: PointerEvent) => {
            canvas.dataset.testPointerId = String(event.pointerId);
            canvas.removeEventListener("pointerdown", record);
          };
          canvas.addEventListener("pointerdown", record);
        });
        await canvas.hover();
        await page.mouse.down();
        await expect.poll(() => canvas.getAttribute("data-test-pointer-id")).not.toBeNull();
        const pointerId = Number(await canvas.getAttribute("data-test-pointer-id"));
        if (!Number.isInteger(pointerId)) throw new Error("Neon canvas pointer ID is invalid.");
        capturedPointerId = pointerId;
        await expect
          .poll(() =>
            page.evaluate(() => window.__GAMEYARD_RESOURCE_PROBE__.snapshot().pointerCaptures),
          )
          .toBe(1);
        await expect
          .poll(() =>
            canvas.evaluate(
              (element, pointerId) => element.hasPointerCapture(pointerId),
              pointerId,
            ),
          )
          .toBe(true);
      }
    });

    await test.step(`disposes lifecycle generation ${generation}`, async () => {
      const gamepadPollsAtDispose = await page.evaluate(
        () => window.__GAMEYARD_RESOURCE_PROBE__.snapshot().gamepadPolls,
      );
      await dispose(page);
      if (capturedPointerId !== null) {
        expect(
          await page
            .locator("#gameCanvas")
            .evaluate(
              (element, pointerId) => element.hasPointerCapture(pointerId),
              capturedPointerId,
            ),
        ).toBe(false);
        await page.mouse.up();
      }
      expect(await page.evaluate(() => window.__NEON_DISPOSE_REPORT__.after)).toEqual(
        zeroOwnedResources,
      );
      expect(
        await page.evaluate(() => window.__NEON_DISPOSE_REPORT__.before.listeners),
      ).toBeGreaterThan(0);
      await expect
        .poll(async () => {
          const snapshot = await page.evaluate(() => {
            const snapshot = window.__GAMEYARD_RESOURCE_PROBE__.snapshot();
            return {
              listeners: snapshot.listeners,
              animationFrames: snapshot.animationFrames,
              timeouts: snapshot.timeouts,
              intervals: snapshot.intervals,
              audioContexts: snapshot.audioContexts,
              pointerCaptures: snapshot.pointerCaptures,
            };
          });
          return {
            listenersWithinBaseline: snapshot.listeners <= browserBaseline.listeners,
            timeoutsWithinBaseline: snapshot.timeouts <= browserBaseline.timeouts,
            quiescent:
              snapshot.animationFrames === 0 &&
              snapshot.intervals === 0 &&
              snapshot.audioContexts === 0 &&
              snapshot.pointerCaptures === 0,
          };
        })
        .toEqual({
          listenersWithinBaseline: true,
          timeoutsWithinBaseline: true,
          quiescent: true,
        });
      await page.waitForTimeout(50);
      expect(
        await page.evaluate(() => window.__GAMEYARD_RESOURCE_PROBE__.snapshot().gamepadPolls),
      ).toBe(gamepadPollsAtDispose);
    });
  }
});
