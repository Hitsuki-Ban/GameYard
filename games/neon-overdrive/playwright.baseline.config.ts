import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  outputDir: "../../test-results/neon-overdrive",
  fullyParallel: false,
  forbidOnly: true,
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
    baseURL: "http://127.0.0.1:5192",
    browserName: "chromium",
    deviceScaleFactor: 1,
    hasTouch: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: "vp dev --config vite.source.config.ts",
    url: "http://127.0.0.1:5192",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
