import { defineConfig } from "@playwright/test";

const devPort = 5197;
const devUrl = `http://127.0.0.1:${devPort}`;

export default defineConfig({
  testDir: "./tests/dev",
  outputDir: "./test-results/playwright-dev",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: "line",
  use: {
    baseURL: devUrl,
    browserName: "chromium",
    colorScheme: "light",
    locale: "en-US",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: `vp dev apps/hub --host 127.0.0.1 --port ${devPort} --strictPort`,
    url: devUrl,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
