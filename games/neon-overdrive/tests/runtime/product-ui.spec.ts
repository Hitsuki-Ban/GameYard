import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

import {
  advance,
  bootRuntime,
  canvasText,
  clearCanvasText,
  command,
  installCanvasTextProbe,
  mutate,
  observe,
} from "./runtime-driver";

type PublicLocale = "zh-Hans" | "en" | "ja";
type HostSettings = {
  revision: number;
  audio: { master: number; music: number; sfx: number };
  motion: { reduced: boolean; screenShake: boolean };
};

const LOCALE_COPY = {
  "zh-Hans": {
    title: "NEON OVERDRIVE // 弹幕爆奏",
    description: "NEON OVERDRIVE：演出特化型纵向弹幕射击，支持键鼠、触控与手柄。",
    settings: "设置",
  },
  en: {
    title: "NEON OVERDRIVE // Danmaku Overdrive",
    description:
      "NEON OVERDRIVE: a spectacle-driven vertical danmaku shooter with keyboard, touch, and gamepad support.",
    settings: "SETTINGS",
  },
  ja: {
    title: "NEON OVERDRIVE // 弾幕爆奏",
    description:
      "NEON OVERDRIVE：キーボード、タッチ、ゲームパッドに対応した演出特化型縦スクロール弾幕シューティング。",
    settings: "設定",
  },
} as const;

async function applyLocale(page: Page, locale: PublicLocale): Promise<void> {
  await page.evaluate(
    (resolved) => window.__NEON_HOST__.applyLocale({ preference: resolved, resolved }),
    locale,
  );
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
}

async function expectDocumentLocale(page: Page, locale: PublicLocale): Promise<void> {
  await expect(page).toHaveTitle(LOCALE_COPY[locale].title);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    LOCALE_COPY[locale].description,
  );
  await expect(page.locator("#settings-button")).toHaveText(LOCALE_COPY[locale].settings);
}

async function applyLocalePreservingState(page: Page, locale: PublicLocale): Promise<void> {
  const before = await observe(page);
  await page.evaluate(() => {
    (window as any).__NEON_FOCUS_BEFORE_LOCALE__ = document.activeElement;
  });
  await applyLocale(page, locale);
  expect(await observe(page)).toEqual(before);
  expect(
    await page.evaluate(
      () => document.activeElement === (window as any).__NEON_FOCUS_BEFORE_LOCALE__,
    ),
  ).toBe(true);
  await expectDocumentLocale(page, locale);
}

async function hostSettings(page: Page): Promise<HostSettings> {
  return page.evaluate(() => structuredClone(window.__NEON_HOST__.context.settings));
}

async function applyHostSettings(page: Page, settings: HostSettings): Promise<void> {
  await page.evaluate((next) => window.__NEON_HOST__.applySettings(next), settings);
}

async function hostEvents(page: Page): Promise<any[]> {
  return page.evaluate(() => window.__NEON_HOST__.drainEvents());
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

async function expectInsideViewport(page: Page, selector: string): Promise<void> {
  const box = await page.locator(selector).boundingBox();
  if (box === null) throw new Error(`${selector} must have a rendered box.`);
  const viewport = page.viewportSize();
  if (viewport === null) throw new Error("Product UI journey requires an explicit viewport.");
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
}

async function newRuntimePage(
  browser: Browser,
  viewport: { width: number; height: number },
  hasTouch: boolean,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:5194",
    hasTouch,
    viewport,
  });
  const page = await context.newPage();
  await bootRuntime(page);
  return { context, page };
}

test("live zh-Hans → en → ja journey localizes title/settings/play/upgrade/pause/result without state loss", async ({
  page,
}) => {
  test.setTimeout(30_000);
  await installCanvasTextProbe(page);
  await bootRuntime(page);
  await page.evaluate(() => window.__NEON_DEBUG__.freezePresentation());

  await test.step("zh-Hans title and live en settings", async () => {
    await expectDocumentLocale(page, "zh-Hans");
    await expect(page.locator("#ignite-button")).toContainText("点火");

    await page.locator("#settings-button").click();
    await expect(page.locator("#settings-dialog")).toBeVisible();
    await expect(page.locator("#master-volume")).toBeFocused();
    await applyLocalePreservingState(page, "en");
    await expect(page.locator("#settings-dialog-title")).toHaveText("SETTINGS");
    await expect(page.locator("#host-settings-title")).toHaveText("GameYard SETTINGS");
    await page.locator("#settings-close").click();
    await expect(page.locator("#settings-button")).toBeFocused();
  });

  await test.step("live ja play and zh-Hans upgrade", async () => {
    await page.locator("#ignite-button").click();
    await expect(page.locator("#gameCanvas")).toBeFocused();
    await expect(page.locator("#status-announcer")).toHaveText("STORY DRIVE started.");
    expect(await observe(page)).toMatchObject({
      screen: "playing",
      mode: "story",
      stage: { kind: "act", value: 1 },
    });
    await applyLocalePreservingState(page, "ja");
    await expect(page.locator("#status-announcer")).toHaveText(
      "ストーリードライブを開始しました。",
    );
    await expect(page.locator("#toast")).toHaveText("ストーリードライブを開始しました。");
    await page.evaluate(() => {
      const status = document.querySelector("#status-announcer");
      if (status === null) throw new Error("Neon status announcer is missing.");
      let mutations = 0;
      new MutationObserver(() => {
        mutations += 1;
      }).observe(status, { childList: true });
      (window as any).__NEON_ANNOUNCEMENT_MUTATIONS__ = () => mutations;
    });
    await command(page, { type: "restart" });
    await command(page, { type: "restart" });
    await expect
      .poll(() => page.evaluate(() => (window as any).__NEON_ANNOUNCEMENT_MUTATIONS__()))
      .toBeGreaterThanOrEqual(2);
    await clearCanvasText(page);
    await command(page, { type: "drop", active: true });
    await command(page, { type: "drop", active: false });
    await advance(page, 0);
    expect(await canvasText(page)).toContain("ドライブを蓄積");

    await mutate(page, "offerUpgrades", ["voltage", "satellite", "echo"]);
    await expect(page.locator("#upgrade-dialog")).toBeVisible();
    await expect(page.locator('[data-upgrade-index="0"]')).toBeFocused();
    await applyLocalePreservingState(page, "zh-Hans");
    await expect(page.locator("#upgrade-dialog-title")).toHaveText("选择强化");
    await expect(page.locator('[data-upgrade-id="voltage"] .upgrade-name')).toHaveText("高压狂热");
    await page.locator('[data-upgrade-index="0"]').click();
    await expect(page.locator("#gameCanvas")).toBeFocused();
  });

  await test.step("live en pause and Host-authorized resume", async () => {
    await hostEvents(page);
    await page.keyboard.press("Escape");
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.__NEON_HOST__.events.some(
            (event: any) => event?.type === "lifecycle.changeRequest" && event.action === "pause",
          ),
        ),
      )
      .toBe(true);
    await page.evaluate(() => window.__NEON_HOST__.send("lifecycle.pause"));
    await expect(page.locator("#pause-dialog")).toBeVisible();
    await expect(page.locator("#resume-button")).toBeFocused();
    await applyLocalePreservingState(page, "en");
    await expect(page.locator("#pause-dialog-title")).toHaveText("PAUSED");

    await hostEvents(page);
    await page.keyboard.press("Escape");
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.__NEON_HOST__.events.some(
            (event: any) => event?.type === "lifecycle.changeRequest" && event.action === "resume",
          ),
        ),
      )
      .toBe(true);
    await page.evaluate(() => window.__NEON_HOST__.send("lifecycle.resume"));
    await expect(page.locator("#pause-dialog")).not.toBeVisible();
    await expect(page.locator("#gameCanvas")).toBeFocused();
  });

  await test.step("live ja result", async () => {
    await mutate(page, "prepareResult", {
      score: 123_456,
      chain: 68,
      maxChain: 4.2,
      bosses: 1,
    });
    await mutate(page, "finish", { victory: false, labelId: "signalLost" });
    await expect(page.locator("#result-dialog")).toBeVisible();
    await expect(page.locator("#result-retry")).toBeFocused();
    await applyLocalePreservingState(page, "ja");
    await expect(page.locator("#result-eyebrow")).toHaveText("シグナルロスト");
    await expect(page.locator("#result-title")).toHaveText("ゲームオーバー");
    await expect(page.locator("#result-score")).toHaveText("000123456");
  });
});

test("five Host fields converge only through explicit newer full settings.apply", async ({
  page,
}) => {
  await bootRuntime(page);
  await page.evaluate(() => {
    window.__NEON_DEBUG__.freezePresentation();
    window.__NEON_HOST__.setSettingsMode("deferred");
  });

  const preUnlockZero: HostSettings = {
    revision: 1,
    audio: { master: 0, music: 0, sfx: 0 },
    motion: { reduced: false, screenShake: false },
  };
  await applyHostSettings(page, preUnlockZero);
  expect(await page.evaluate(() => window.__NEON_DEBUG__.resources().audioContexts)).toBe(0);

  await page.locator("#settings-button").click();
  await expect(page.locator("#settings-dialog")).toBeVisible();

  const rows = [
    { field: "master", selector: "#master-volume", value: 0.25, locale: "zh-Hans" },
    { field: "music", selector: "#music-volume", value: 0.4, locale: "en", applied: 0.3 },
    { field: "sfx", selector: "#sfx-volume", value: 0.55, locale: "ja" },
    { field: "reduced", selector: "#reduced-motion", value: true, locale: "en" },
    { field: "screenShake", selector: "#screen-shake", value: true, locale: "ja" },
  ] as const;

  for (const row of rows) {
    await applyLocale(page, row.locale);
    await hostEvents(page);
    const control = page.locator(row.selector);
    if (typeof row.value === "number") {
      await control.evaluate((element, value) => {
        const input = element as HTMLInputElement;
        input.value = String(value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }, row.value);
    } else {
      await control.evaluate((element, value) => {
        const input = element as HTMLInputElement;
        input.checked = value;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }, row.value);
    }

    await expect(page.locator("#host-settings-status")).toHaveAttribute("data-state", "pending");
    const pendingCopy = {
      "zh-Hans": "正在等待主机确认…",
      en: "WAITING FOR HOST CONFIRMATION…",
      ja: "ホストの確認を待っています…",
    }[row.locale];
    await expect(page.locator("#host-settings-status")).toHaveText(pendingCopy);
    for (const selector of [
      "#master-volume",
      "#music-volume",
      "#sfx-volume",
      "#reduced-motion",
      "#screen-shake",
    ]) {
      await expect(page.locator(selector)).toBeDisabled();
    }

    await expect
      .poll(async () =>
        (await page.evaluate(() => window.__NEON_HOST__.events)).find(
          (event: any) => event?.type === "settings.changeRequest",
        ),
      )
      .not.toBeNull();
    const change = await page.evaluate(() =>
      window.__NEON_HOST__.events.find((event: any) => event?.type === "settings.changeRequest"),
    );
    const expectedChange =
      typeof row.value === "number"
        ? { audio: { [row.field]: row.value } }
        : { motion: { [row.field]: row.value } };
    expect(change).toEqual({ type: "settings.changeRequest", change: expectedChange });

    const current = await hostSettings(page);
    const appliedValue = "applied" in row ? row.applied : row.value;
    const next: HostSettings = {
      revision: current.revision + 1,
      audio: { ...current.audio },
      motion: { ...current.motion },
    };
    if (row.field === "master" || row.field === "music" || row.field === "sfx") {
      next.audio[row.field] = appliedValue as number;
    } else {
      next.motion[row.field] = appliedValue as boolean;
    }
    await applyHostSettings(page, next);

    if ("applied" in row) {
      await expect(page.locator("#host-settings-status")).toHaveAttribute("data-state", "error");
      await expect(page.locator("#host-settings-status")).toContainText("SETTINGS REQUEST FAILED");
    } else {
      await expect(page.locator("#host-settings-status")).toHaveAttribute("data-state", "applied");
      const appliedCopy = {
        "zh-Hans": `已应用主机修订 ${next.revision}`,
        en: `HOST REVISION ${next.revision} APPLIED`,
        ja: `ホストリビジョン ${next.revision} を適用しました`,
      }[row.locale];
      await expect(page.locator("#host-settings-status")).toHaveText(appliedCopy);
    }
  }

  const beforeExternal = await hostSettings(page);
  const external: HostSettings = {
    revision: beforeExternal.revision + 1,
    audio: { master: 0.9, music: 0.8, sfx: 0.7 },
    motion: { reduced: false, screenShake: false },
  };
  await applyHostSettings(page, external);
  await expect(page.locator("#host-revision")).toContainText(String(external.revision));
  await expect(page.locator("#master-volume")).toHaveValue("0.9");
  await expect(page.locator("#music-volume")).toHaveValue("0.8");
  await expect(page.locator("#sfx-volume")).toHaveValue("0.7");
  await expect(page.locator("#reduced-motion")).not.toBeChecked();
  await expect(page.locator("#screen-shake")).not.toBeChecked();
  expect(await hostSettings(page)).toEqual(external);

  await page.locator("#settings-close").click();
  await page.locator("#ignite-button").click();
  await page.evaluate(() => window.__NEON_DEBUG__.freezePresentation());
  await mutate(page, "prepareDrive");
  await command(page, { type: "drop", active: true });
  await command(page, { type: "drop", active: false });
  const fullMotion = await observe(page);
  expect(fullMotion.hitStop.remainingTicks).toBeGreaterThan(0);
  expect(fullMotion.presentationEntities.particles.count).toBeGreaterThan(0);

  const reduced: HostSettings = {
    ...external,
    revision: external.revision + 1,
    motion: { reduced: true, screenShake: true },
  };
  await applyHostSettings(page, reduced);
  await advance(page, 1);
  expect(await observe(page)).toMatchObject({
    hitStop: { remainingTicks: 0 },
    presentationEntities: { particles: { count: 0 } },
  });
  await mutate(page, "prepareGuardBoundary");
  await command(page, { type: "drop", active: true });
  await command(page, { type: "drop", active: false });
  await advance(page, 1);
  expect(await observe(page)).toMatchObject({
    hitStop: { remainingTicks: 0 },
    presentationEntities: { particles: { count: 0 } },
  });
});

test("desktop, portrait fine-pointer, and landscape touch remain operable and contained", async ({
  browser,
}) => {
  await test.step("desktop and 200% zoom-equivalent reflow", async () => {
    const runtime = await newRuntimePage(browser, { width: 1440, height: 900 }, false);
    const { context, page } = runtime;
    try {
      await expectNoHorizontalOverflow(page);
      await page.setViewportSize({ width: 720, height: 450 });
      await expectNoHorizontalOverflow(page);
      await page.locator("#settings-button").click();
      await expect(page.locator("#master-volume")).toBeFocused();
      await expectInsideViewport(page, "#settings-dialog");
      await page.keyboard.press("Tab");
      expect(
        await page.evaluate(() => Boolean(document.activeElement?.closest("#settings-dialog"))),
      ).toBe(true);
      await page.keyboard.press("Escape");
      await expect(page.locator("#settings-dialog")).not.toBeVisible();
      await expect(page.locator("#settings-button")).toBeFocused();
      await expectNoHorizontalOverflow(page);
    } finally {
      await context.close();
    }
  });

  await test.step("390×844 fine pointer does not expose DROP", async () => {
    const runtime = await newRuntimePage(browser, { width: 390, height: 844 }, false);
    const { context, page } = runtime;
    try {
      expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(false);
      await expectNoHorizontalOverflow(page);
      await page.locator("#settings-button").click();
      await page.locator(".settings-sections").evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await expectInsideViewport(page, "#settings-close");
      await expectInsideViewport(page, "#settings-save");
      await expectNoHorizontalOverflow(page);
      await page.locator("#settings-close").click();
      await page.locator("#ignite-button").click();
      await expect(page.locator("#touch-drive")).toBeHidden();
      await expectInsideViewport(page, "#gameCanvas");
      await expectNoHorizontalOverflow(page);
    } finally {
      await context.close();
    }
  });

  await test.step("844×390 touch follows real capability and Host input state", async () => {
    const runtime = await newRuntimePage(browser, { width: 844, height: 390 }, true);
    const { context, page } = runtime;
    try {
      expect(
        await page.evaluate(() => ({
          coarse: matchMedia("(pointer: coarse)").matches,
          touchPoints: navigator.maxTouchPoints,
        })),
      ).toMatchObject({ coarse: true, touchPoints: 1 });
      await expect(page.locator("#touch-drive")).toBeHidden();
      await expectInsideViewport(page, "#ignite-button");
      await expectInsideViewport(page, "#settings-button");
      await expectNoHorizontalOverflow(page);
      await page.locator("#settings-button").click();
      await expectInsideViewport(page, "#settings-dialog-title");
      await expectInsideViewport(page, "#settings-close");
      await page.locator("#settings-close").click();
      await page.locator("#ignite-button").click();
      await expect(page.locator("#touch-drive")).toBeVisible();
      const drop = await page.locator("#touch-drive").boundingBox();
      if (drop === null) throw new Error("Touch DROP requires a rendered box while playing.");
      expect(drop.width).toBeGreaterThanOrEqual(44);
      expect(drop.height).toBeGreaterThanOrEqual(44);
      await expectInsideViewport(page, "#touch-drive");
      await page.evaluate(() => window.__NEON_HOST__.send("input.setEnabled", { enabled: false }));
      await expect(page.locator("#touch-drive")).toBeHidden();
      await page.evaluate(() => window.__NEON_HOST__.send("input.setEnabled", { enabled: true }));
      await expect(page.locator("#touch-drive")).toBeVisible();
      await expectNoHorizontalOverflow(page);
    } finally {
      await context.close();
    }
  });
});
