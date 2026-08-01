import { defineConfig } from "@playwright/test";

const hubPort = 4187;
const hubUrl = `http://127.0.0.1:${hubPort}`;

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./test-results/playwright",
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  workers: 3,
  reporter: "line",
  use: {
    baseURL: hubUrl,
    colorScheme: "light",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: `vp preview --config tooling/preview.vite.config.mjs --host 127.0.0.1 --port ${hubPort} --strictPort`,
    url: hubUrl,
    reuseExistingServer: false,
    timeout: 30_000,
  },
  projects: [
    {
      name: "desktop-chromium",
      use: { browserName: "chromium", viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile-portrait-chromium",
      use: {
        browserName: "chromium",
        hasTouch: true,
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "mobile-landscape-chromium",
      use: {
        browserName: "chromium",
        hasTouch: true,
        viewport: { width: 844, height: 390 },
      },
    },
  ],
});
