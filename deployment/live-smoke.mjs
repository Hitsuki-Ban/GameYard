import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const gameIds = ["pulse-link-overdrive", "tumbledrum", "crown-breaker"];
const runtimeStartupTimeoutMs = 45_000;

function parseArguments(argv) {
  if (argv.length !== 2 || argv[0] !== "--evidence" || !argv[1]) {
    throw new Error("Usage: live-smoke.mjs --evidence <cloudflare-production.json>");
  }
  return resolve(argv[1]);
}

async function assertReleaseIdentity(request, baseUrl, buildId) {
  const response = await request.get(new URL("build-info.json", baseUrl).href);
  if (!response.ok()) {
    throw new Error(`${baseUrl.href}build-info.json returned HTTP ${response.status()}`);
  }
  const buildInfo = await response.json();
  if (buildInfo?.schemaVersion !== 1 || buildInfo.buildId !== buildId) {
    throw new Error(`${baseUrl.href} does not serve the deployed build ${buildId}`);
  }
}

async function assertGame(browser, baseUrl, gameId) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const failures = [];
    page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") failures.push(`console: ${message.text()}`);
    });
    page.on("requestfailed", (request) => {
      failures.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`);
    });
    page.on("response", (response) => {
      if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`);
    });

    const pageUrl = new URL(`?game=${gameId}`, baseUrl).href;
    const response = await page.goto(pageUrl, { waitUntil: "domcontentloaded" });
    if (response === null || !response.ok()) {
      throw new Error(`${pageUrl} did not return a successful document`);
    }
    const runtimeState = page.locator(".runtime-state");
    try {
      await page.locator(".runtime-state--active, .runtime-state--failed").waitFor({
        state: "visible",
        timeout: runtimeStartupTimeoutMs,
      });
    } catch (cause) {
      const label = (await runtimeState.textContent())?.trim() ?? "missing";
      throw new Error(
        `${pageUrl} remained in runtime state "${label}" after ${runtimeStartupTimeoutMs}ms` +
          (failures.length > 0 ? `:\n- ${failures.join("\n- ")}` : ""),
        { cause },
      );
    }
    if (
      await runtimeState.evaluate((element) => element.classList.contains("runtime-state--failed"))
    ) {
      throw new Error(
        `${pageUrl} entered the failed runtime state` +
          (failures.length > 0 ? `:\n- ${failures.join("\n- ")}` : ""),
      );
    }
    const frame = page.locator(".runtime-frame iframe");
    await frame.waitFor({ state: "visible", timeout: 20_000 });
    const frameSource = await frame.getAttribute("src");
    if (frameSource === null) throw new Error(`${gameId} iframe is missing its source URL`);
    const frameUrl = new URL(frameSource, page.url());
    const expectedPath = `${baseUrl.pathname}games/${gameId}/index.html`;
    if (frameUrl.pathname !== expectedPath) {
      throw new Error(`${gameId} loaded ${frameUrl.pathname}; expected ${expectedPath}`);
    }
    await page.waitForLoadState("networkidle");
    if (failures.length > 0) {
      throw new Error(`${pageUrl} emitted runtime failures:\n- ${failures.join("\n- ")}`);
    }
  } finally {
    await context.close();
  }
}

async function main() {
  const evidence = JSON.parse(await readFile(parseArguments(process.argv.slice(2)), "utf8"));
  if (
    evidence?.schemaVersion !== 1 ||
    typeof evidence.buildId !== "string" ||
    typeof evidence.target !== "string"
  ) {
    throw new Error("Cloudflare deployment evidence is invalid");
  }
  const origin = new URL(evidence.target);
  const bases = [new URL("/", origin), new URL("/GameYard/", origin)];
  const browser = await chromium.launch();
  try {
    const requestContext = await browser.newContext();
    try {
      for (const baseUrl of bases) {
        await assertReleaseIdentity(requestContext.request, baseUrl, evidence.buildId);
      }
    } finally {
      await requestContext.close();
    }
    for (const baseUrl of bases) {
      for (const gameId of gameIds) await assertGame(browser, baseUrl, gameId);
    }
  } finally {
    await browser.close();
  }
  console.log(`Live root and /GameYard/ smoke passed for ${evidence.buildId} at ${origin.origin}`);
}

await main();
