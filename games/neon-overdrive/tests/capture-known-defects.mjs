import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const sourceUrl = "http://127.0.0.1:5192";
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const outputDirectory = resolve(scriptDirectory, "known-defects");
const captures = [
  { name: "portrait-390x844-title-overflow.png", viewport: { width: 390, height: 844 } },
  { name: "landscape-844x390-title-clipping.png", viewport: { width: 844, height: 390 } },
];

const response = await fetch(sourceUrl);
if (!response.ok) {
  throw new Error(`Neon source server returned HTTP ${response.status} at ${sourceUrl}`);
}

await mkdir(outputDirectory, { recursive: true });
const browser = await chromium.launch();
try {
  for (const capture of captures) {
    const context = await browser.newContext({
      deviceScaleFactor: 1,
      hasTouch: true,
      viewport: capture.viewport,
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      let state = 0x4e454f4e;
      Math.random = () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
      };
      window.requestAnimationFrame = () => 1;
      window.cancelAnimationFrame = () => undefined;
      window.localStorage.clear();
    });
    await page.goto(sourceUrl, { waitUntil: "load" });
    await page.addStyleTag({
      content: "*,*::before,*::after{animation:none!important;transition:none!important;}",
    });
    await page.screenshot({ path: resolve(outputDirectory, capture.name), fullPage: false });
    await context.close();
  }
} finally {
  await browser.close();
}
