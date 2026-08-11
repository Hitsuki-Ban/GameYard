import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/runtime",
  testMatch: "**/*.spec.ts",
  snapshotPathTemplate: "{testDir}/../baseline.spec.ts-snapshots/{arg}-{platform}{ext}",
  outputDir: "../../test-results/neon-overdrive-runtime",
  fullyParallel: false,
  forbidOnly: true,
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: "line",
  expect: {
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.04,
      scale: "css",
    },
  },
  use: {
    baseURL: "http://127.0.0.1:5194",
    browserName: "chromium",
    deviceScaleFactor: 1,
    hasTouch: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: "vp run build:testkit && vp run preview:testkit",
    url: "http://127.0.0.1:5194",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
