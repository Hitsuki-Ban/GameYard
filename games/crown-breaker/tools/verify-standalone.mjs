import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

if (process.argv.length !== 3) {
  console.error("Usage: vp exec node tools/verify-standalone.mjs <standalone.html>");
  process.exit(1);
}

const artifactPath = path.resolve(process.argv[2]);
const artifact = await readFile(artifactPath);

function createArtifactServer() {
  return createServer((request, response) => {
    const pathname = new URL(request.url, "http://127.0.0.1").pathname;
    if (request.method !== "GET" || pathname !== "/") {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": "text/html; charset=utf-8",
    });
    response.end(artifact);
  });
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Standalone server did not bind to a TCP port.");
  return `http://127.0.0.1:${address.port}/?qa`;
}

async function closeServer(server) {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

const server = createArtifactServer();
let browser;
try {
  const url = await listen(server);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  const failedResponses = [];
  const externalRequests = [];
  const origin = new URL(url).origin;

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => {
    const requestUrl = new URL(request.url());
    if (requestUrl.origin !== origin) externalRequests.push(request.url());
  });
  page.on("requestfailed", (request) =>
    failedRequests.push(`${request.method()} ${request.url()}`),
  );
  page.on("response", (response) => {
    if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`);
  });

  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => document.fonts?.status === "loaded");

  await assert.doesNotReject(async () => {
    await page.locator("#game-title").waitFor({ state: "visible" });
    await page.locator("#game-canvas").waitFor({ state: "visible" });
  });
  assert.equal(
    (await page.locator("#game-title").innerText()).replace(/\s+/g, ""),
    "CROWN//BREAKER",
  );
  const canvas = await page.locator("#game-canvas").boundingBox();
  assert.ok(
    canvas && canvas.width > 0 && canvas.height > 0,
    "Production canvas must have a visible layout box.",
  );

  const locales = [
    { value: "en", language: "en", newRun: "New Run" },
    { value: "zh-CN", language: "zh-CN", newRun: "新局" },
    { value: "ja", language: "ja", newRun: "ニューラン" },
  ];
  for (const expected of locales) {
    await page.locator("#title-language").selectOption(expected.value);
    await page.waitForFunction(
      (language) => document.documentElement.lang === language,
      expected.language,
    );
    assert.equal(
      await page.locator('#btn-new [data-i18n="title.newRun"]').innerText(),
      expected.newRun,
    );
  }

  assert.equal(
    await page.evaluate(() => "__CB_TEST__" in globalThis),
    false,
    "?qa must not expose __CB_TEST__.",
  );
  await page.locator("#btn-new").click();
  await page.waitForFunction(
    () => !document.querySelector("#title-screen")?.classList.contains("active"),
  );
  assert.equal(
    await page.locator("#game-canvas").isVisible(),
    true,
    "Canvas must remain visible after a real New Run click.",
  );
  assert.equal(
    await page.evaluate(() => "__CB_TEST__" in globalThis),
    false,
    "Gameplay must not expose __CB_TEST__.",
  );
  const serviceWorkerRegistrations = await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) return [];
    return (await navigator.serviceWorker.getRegistrations()).map(
      (registration) => registration.scope,
    );
  });

  assert.deepEqual(
    serviceWorkerRegistrations,
    [],
    "Production standalone must not register a Service Worker.",
  );
  assert.deepEqual(externalRequests, [], "Production standalone must not issue external requests.");
  assert.deepEqual(failedRequests, [], "Production standalone must not have failed requests.");
  assert.deepEqual(
    failedResponses,
    [],
    "Production standalone must not receive failing responses.",
  );
  assert.deepEqual(consoleErrors, [], "Production standalone must not log console errors.");
  assert.deepEqual(pageErrors, [], "Production standalone must not raise page errors.");

  await context.close();
  process.stdout.write(`Standalone baseline passed: ${artifactPath}\n`);
} finally {
  if (browser) await browser.close();
  if (server.listening) await closeServer(server);
}
