import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const runtimeStartupTimeoutMs = 45_000;
const releaseReadinessTimeoutMs = 60_000;
const releaseReadinessIntervalMs = 2_000;

function parseArguments(argv) {
  if (argv.length !== 2 || argv[0] !== "--evidence" || !argv[1]) {
    throw new Error("Usage: live-smoke.mjs --evidence <cloudflare-production.json>");
  }
  return resolve(argv[1]);
}

async function probePublishedRelease(request, baseUrl, buildId) {
  const response = await request.get(new URL("build-info.json", baseUrl).href);
  if (!response.ok()) {
    return {
      ready: false,
      diagnostic: `${baseUrl.href}build-info.json returned HTTP ${response.status()}`,
    };
  }
  const buildInfo = await response.json();
  if (buildInfo?.schemaVersion !== 1 || typeof buildInfo.buildId !== "string") {
    throw new Error(`${baseUrl.href}build-info.json violates the production contract`);
  }
  if (buildInfo.buildId !== buildId) {
    return {
      ready: false,
      diagnostic: `${baseUrl.href} still serves ${buildInfo.buildId}`,
    };
  }
  return loadPublishedGames(request, baseUrl, buildId);
}

function parseCatalogEntry(value, gameId, label) {
  const prefix = `./${gameId}/`;
  const manifestEntry = typeof value === "string" ? value.slice(prefix.length) : "";
  if (
    typeof value !== "string" ||
    !value.startsWith(prefix) ||
    manifestEntry.length === 0 ||
    manifestEntry.includes("\\") ||
    manifestEntry.includes(":") ||
    manifestEntry.includes("%") ||
    manifestEntry.includes("?") ||
    manifestEntry.includes("#") ||
    manifestEntry.endsWith("/") ||
    manifestEntry.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new Error(`${label} must be a normalized ./${gameId}/ entry reference`);
  }
  return value;
}

async function loadPublishedGames(request, baseUrl, buildId) {
  const response = await request.get(new URL("games/catalog.json", baseUrl).href);
  if (!response.ok()) {
    return {
      ready: false,
      diagnostic: `${baseUrl.href}games/catalog.json returned HTTP ${response.status()}`,
    };
  }
  const catalog = await response.json();
  if (catalog?.schemaVersion !== 1 || typeof catalog.buildId !== "string") {
    throw new Error(`${baseUrl.href}games/catalog.json violates the production contract`);
  }
  if (catalog.buildId !== buildId) {
    return {
      ready: false,
      diagnostic: `${baseUrl.href}games/catalog.json still serves ${catalog.buildId}`,
    };
  }
  if (!Array.isArray(catalog.games) || catalog.games.length === 0) {
    throw new Error(`${baseUrl.href}games/catalog.json has no deployed runtime games`);
  }
  const games = catalog.games.map((game, index) => {
    if (typeof game?.id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(game.id)) {
      throw new Error(`${baseUrl.href}games/catalog.json games[${index}] has an invalid id`);
    }
    return {
      id: game.id,
      entry: parseCatalogEntry(
        game.entry,
        game.id,
        `${baseUrl.href}games/catalog.json games[${index}].entry`,
      ),
    };
  });
  if (new Set(games.map((game) => game.id)).size !== games.length) {
    throw new Error(`${baseUrl.href}games/catalog.json contains duplicate game ids`);
  }
  return { ready: true, games };
}

export async function waitForPublishedRelease(
  request,
  baseUrl,
  buildId,
  { timeoutMs, intervalMs },
) {
  const deadline = Date.now() + timeoutMs;
  let attempts = 0;
  let diagnostic = "no response received";
  while (true) {
    attempts += 1;
    const result = await probePublishedRelease(request, baseUrl, buildId);
    if (result.ready) {
      if (attempts > 1) {
        console.log(`${baseUrl.href} reached ${buildId} after ${attempts} readiness probes.`);
      }
      return result.games;
    }
    diagnostic = result.diagnostic;
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      throw new Error(
        `${baseUrl.href} did not reach deployed build ${buildId} within ${timeoutMs}ms; last observation: ${diagnostic}`,
      );
    }
    await new Promise((resolveDelay) =>
      setTimeout(resolveDelay, Math.min(intervalMs, remainingMs)),
    );
  }
}

async function assertGame(browser, baseUrl, game) {
  const { id: gameId, entry } = game;
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
    const expectedPath = new URL(`games/${entry.slice(2)}`, baseUrl).pathname;
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
  let catalogGameCount = 0;
  let launchCount = 0;
  try {
    const publishedCatalogs = [];
    const requestContext = await browser.newContext();
    try {
      for (const baseUrl of bases) {
        publishedCatalogs.push({
          baseUrl,
          games: await waitForPublishedRelease(requestContext.request, baseUrl, evidence.buildId, {
            timeoutMs: releaseReadinessTimeoutMs,
            intervalMs: releaseReadinessIntervalMs,
          }),
        });
      }
    } finally {
      await requestContext.close();
    }
    const expectedIds = publishedCatalogs[0]?.games.map((game) => game.id);
    if (!expectedIds || expectedIds.length === 0) {
      throw new Error("The deployed artifact catalog is empty");
    }
    for (const { baseUrl, games } of publishedCatalogs.slice(1)) {
      if (
        games.length !== expectedIds.length ||
        games.some((game, index) => game.id !== expectedIds[index])
      ) {
        throw new Error(`${baseUrl.href} catalog does not match the deployed root catalog`);
      }
    }
    catalogGameCount = expectedIds.length;
    for (const { baseUrl, games } of publishedCatalogs) {
      for (const game of games) {
        await assertGame(browser, baseUrl, game);
        launchCount += 1;
      }
    }
  } finally {
    await browser.close();
  }
  console.log(
    `Live root and /GameYard/ smoke passed for ${evidence.buildId} at ${origin.origin}: ${launchCount} launches from ${catalogGameCount} catalog games across ${bases.length} paths.`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
