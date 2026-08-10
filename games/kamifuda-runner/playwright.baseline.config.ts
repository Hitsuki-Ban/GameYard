import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: ["baseline.spec.ts", "lifecycle.spec.ts"],
  outputDir: "../../test-results/kamifuda-runner",
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
    baseURL: "http://127.0.0.1:5191",
    browserName: "chromium",
    hasTouch: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: "vp run dev:testkit",
    url: "http://127.0.0.1:5191",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
