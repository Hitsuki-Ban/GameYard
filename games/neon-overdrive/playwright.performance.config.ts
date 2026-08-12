import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./performance",
  testMatch: "**/*.perf.spec.ts",
  outputDir: "../../test-results/neon-overdrive-performance",
  fullyParallel: false,
  forbidOnly: true,
  timeout: 300_000,
  retries: 0,
  workers: 1,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:5187",
    browserName: "chromium",
    colorScheme: "light",
    contextOptions: { reducedMotion: "no-preference" },
    deviceScaleFactor: 1,
    locale: "zh-CN",
    screenshot: "only-on-failure",
    trace: "off",
    viewport: { width: 1440, height: 900 },
  },
  webServer: [
    {
      command:
        "vp run --no-cache build && vp preview --config tooling/preview.vite.config.mjs --host 127.0.0.1 --port 5187 --strictPort",
      cwd: "../..",
      url: "http://127.0.0.1:5187",
      reuseExistingServer: false,
      timeout: 240_000,
    },
    {
      command: "vp run build:testkit && vp run preview:testkit",
      cwd: ".",
      url: "http://127.0.0.1:5194",
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
