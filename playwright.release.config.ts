import { defineConfig } from "@playwright/test";

const releasePort = 4188;
const releaseOrigin = `http://127.0.0.1:${releasePort}`;
const repositoryBase = `${releaseOrigin}/GameYard/`;

export default defineConfig({
  testDir: "./tests/release",
  outputDir: "./test-results/playwright-release",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 180_000,
  reporter: "line",
  expect: {
    timeout: 8_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.001 },
  },
  use: {
    baseURL: repositoryBase,
    browserName: "chromium",
    colorScheme: "light",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: `vp preview --config tooling/preview.vite.config.mjs --base /GameYard/ --host 127.0.0.1 --port ${releasePort} --strictPort`,
    url: repositoryBase,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
