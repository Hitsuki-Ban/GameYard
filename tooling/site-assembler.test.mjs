import assert from "node:assert/strict";
import { copyFile, mkdtemp, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, test } from "node:test";
import { fileURLToPath } from "node:url";

import { createArtifactBuildId, REQUIRED_PRODUCTION_INPUTS } from "./artifact-build-id.mjs";
import {
  assembleSite,
  createAssemblyPlan,
  replaceDirectoryTransactional,
} from "./site-assembler.mjs";
import { verifyProductionArtifact } from "./verify-production.mjs";

const temporaryRoots = [];
const gameStagePath = ".gameyard/stage/games/demo";
const gameProductionInput = "games/demo/src";
const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function createRequiredInputs(root) {
  for (const input of REQUIRED_PRODUCTION_INPUTS) {
    const target = join(root, input.path);
    if (input.kind === "file") {
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, `fixture:${input.path}\n`);
    } else {
      await mkdir(target, { recursive: true });
      await writeFile(join(target, "entry.ts"), `fixture:${input.path}/entry.ts\n`);
    }
  }
}

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), "gameyard-assembly-"));
  temporaryRoots.push(root);
  await createRequiredInputs(root);
  await mkdir(join(root, gameProductionInput), { recursive: true });
  await writeFile(join(root, gameProductionInput, "game.js"), "production source\n");
  await writeFile(
    join(root, "games/demo/package.json"),
    JSON.stringify({ name: "@gameyard/demo", version: "1.0.0", private: true }),
  );
  await writeFile(
    join(root, "games/demo/game.manifest.source.json"),
    JSON.stringify({
      schemaVersion: 1,
      protocol: 1,
      id: "demo",
      version: "1.0.0",
      entry: "index.html",
      locales: { source: "en", supported: ["en", "ja", "zh-Hans"] },
      capabilities: ["keyboard"],
      provenance: {
        repository: "https://example.test/demo",
        revision: "0123456789abcdef0123456789abcdef01234567",
        license: "MIT",
      },
    }),
  );
  await writeFile(
    join(root, "games/demo/game.presentation.source.json"),
    JSON.stringify({
      schemaVersion: 1,
      id: "demo",
      title: "Demo",
      taglines: { en: "Demo game", ja: "デモゲーム", "zh-Hans": "演示游戏" },
      accent: "#123456",
      cover: {
        candidates: [
          { path: "cover-small.svg", width: 800, height: 450 },
          { path: "cover.svg", width: 1600, height: 900 },
        ],
      },
      stage: { kind: "adaptive" },
    }),
  );
  await writeFile(
    join(root, "games/demo/cover-small.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg"/>',
  );
  await writeFile(join(root, "games/demo/cover.svg"), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  await writeFile(
    join(root, "site.assembly.json"),
    `${JSON.stringify(
      {
        schemaVersion: 2,
        hub: { stage: ".gameyard/stage/hub", devPort: 5173 },
        games: [
          {
            id: "demo",
            packageName: "@gameyard/demo",
            stage: gameStagePath,
            manifestSource: "games/demo/game.manifest.source.json",
            presentationSource: "games/demo/game.presentation.source.json",
            devPort: 5174,
            productionInputs: [
              "games/demo/cover-small.svg",
              "games/demo/cover.svg",
              "games/demo/game.manifest.source.json",
              "games/demo/game.presentation.source.json",
              "games/demo/package.json",
              gameProductionInput,
            ],
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(root, "provenance/upstreams.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        auditedAt: "2026-08-01T00:00:00Z",
        repositories: [
          {
            id: "demo",
            url: "https://example.test/demo",
            revision: "0123456789abcdef0123456789abcdef01234567",
            tree: "89abcdef0123456789abcdef0123456789abcdef",
            license: "MIT",
            rightsRecord: null,
            publicImportAllowed: true,
          },
          (await readJson(join(repositoryRoot, "provenance/upstreams.json"))).repositories.find(
            (repository) => repository.id === "tumbledrum",
          ),
        ],
      },
      null,
      2,
    )}\n`,
  );
  await mkdir(join(root, "provenance/tumbledrum"), { recursive: true });
  await Promise.all([
    copyFile(
      join(repositoryRoot, "provenance/tumbledrum/distribution-grant.md"),
      join(root, "provenance/tumbledrum/distribution-grant.md"),
    ),
    copyFile(
      join(repositoryRoot, "provenance/tumbledrum/distribution-record.json"),
      join(root, "provenance/tumbledrum/distribution-record.json"),
    ),
  ]);

  const hubStage = join(root, ".gameyard/stage/hub");
  await mkdir(join(hubStage, "assets"), { recursive: true });
  await mkdir(join(hubStage, "icons"), { recursive: true });
  await writeFile(
    join(hubStage, "index.html"),
    '<link rel="manifest" href="./manifest.webmanifest"><script src="./assets/hub.js"></script>',
  );
  await writeFile(
    join(hubStage, "assets/hub.js"),
    'navigator.serviceWorker.register("./service-worker.js")',
  );
  await writeFile(
    join(hubStage, "manifest.webmanifest"),
    JSON.stringify({
      id: "./",
      name: "Fixture",
      start_url: "./",
      scope: "./",
      display: "standalone",
      icons: [
        { src: "./icons/icon-192.png", sizes: "192x192" },
        { src: "./icons/icon-512.png", sizes: "512x512" },
      ],
    }),
  );
  await writeFile(join(hubStage, "icons/icon-192.png"), "fixture icon 192");
  await writeFile(join(hubStage, "icons/icon-512.png"), "fixture icon 512");
  await writeFile(join(hubStage, "service-worker.js"), "self.addEventListener('fetch', () => {})");

  const buildId = await createArtifactBuildId(root);
  await writeFile(
    join(hubStage, "service-worker.js"),
    `const BUILD_ID = "${buildId}"; const SCOPE = registration.scope; const GAME_CACHE = "gameyard-fixture-game-";`,
  );
  await writeFile(
    join(hubStage, "hub.manifest.json"),
    `${JSON.stringify({ schemaVersion: 1, buildId, entry: "index.html" }, null, 2)}\n`,
  );
  {
    const gameStage = join(root, gameStagePath);
    await mkdir(gameStage, { recursive: true });
    const manifest = {
      schemaVersion: 1,
      protocol: 1,
      id: "demo",
      version: "1.0.0",
      buildId,
      entry: "index.html",
      locales: { source: "en", supported: ["en"] },
      capabilities: ["keyboard"],
      provenance: {
        repository: "https://example.test/demo",
        revision: "0123456789abcdef0123456789abcdef01234567",
        license: "MIT",
      },
      files: ["game.manifest.json", "index.html"],
    };
    await writeFile(
      join(gameStage, "game.manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    await writeFile(join(gameStage, "index.html"), "<!doctype html><title>Demo</title>");
  }

  return { buildId, gameStage: join(root, gameStagePath), hubStage, root };
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

await test("assembles a declared Hub and game transactionally", async () => {
  const { buildId, root } = await createFixture();
  await mkdir(join(root, "dist"));
  await writeFile(join(root, "dist/old.txt"), "old artifact");

  assert.deepEqual(await assembleSite(root), { buildId, fileCount: 10, gameCount: 1 });
  await assert.rejects(stat(join(root, "dist/old.txt")), { code: "ENOENT" });
  assert.equal(
    await readFile(join(root, "dist/index.html"), "utf8"),
    '<link rel="manifest" href="./manifest.webmanifest"><script src="./assets/hub.js"></script>',
  );
  assert.equal((await readJson(join(root, "dist/build-info.json"))).buildId, buildId);
  assert.deepEqual(await verifyProductionArtifact(join(root, "dist"), root), {
    buildId,
    fileCount: 10,
    gameCount: 1,
  });
});

await test("catalog URLs resolve under root and repository prefixes", async () => {
  const { root } = await createFixture();
  await assembleSite(root);
  const catalog = await readJson(join(root, "dist/games/catalog.json"));
  const game = catalog.games[0];

  assert.equal(
    new URL(game.entry, "https://example.test/games/catalog.json").pathname,
    "/games/demo/index.html",
  );
  assert.equal(
    new URL(game.entry, "https://example.test/GameYard/games/catalog.json").pathname,
    "/GameYard/games/demo/index.html",
  );
  assert.equal(
    new URL(game.manifest, "https://example.test/GameYard/games/catalog.json").pathname,
    "/GameYard/games/demo/game.manifest.json",
  );
});

await test("rejects the Hub's entire case-insensitive games namespace", async () => {
  const nestedFixture = await createFixture();
  await mkdir(join(nestedFixture.hubStage, "Games/rogue"), { recursive: true });
  await writeFile(join(nestedFixture.hubStage, "Games/rogue/index.html"), "rogue Hub game");
  await assert.rejects(createAssemblyPlan(nestedFixture.root), /reserved games namespace/);

  const fileFixture = await createFixture();
  await writeFile(join(fileFixture.hubStage, "games"), "reserved top-level file");
  await assert.rejects(createAssemblyPlan(fileFixture.root), /reserved games namespace/);
});

await test("rejects missing and undeclared game files", async () => {
  const missingFixture = await createFixture();
  await rm(join(missingFixture.gameStage, "index.html"));
  await assert.rejects(createAssemblyPlan(missingFixture.root), /missing: index\.html/);

  const undeclaredFixture = await createFixture();
  await writeFile(join(undeclaredFixture.gameStage, "extra.js"), "undeclared");
  await assert.rejects(createAssemblyPlan(undeclaredFixture.root), /undeclared: extra\.js/);
});

await test("rejects a missing game.manifest.json", async () => {
  const fixture = await createFixture();
  await rm(join(fixture.gameStage, "game.manifest.json"));

  await assert.rejects(createAssemblyPlan(fixture.root), /game\.manifest\.json is missing/);
});

await test("copies and verifies declared nested game assets", async () => {
  const fixture = await createFixture();
  const manifestPath = join(fixture.gameStage, "game.manifest.json");
  const manifest = await readJson(manifestPath);
  manifest.files.push("assets/nested/texture.bin");
  await writeFile(manifestPath, JSON.stringify(manifest));
  await mkdir(join(fixture.gameStage, "assets/nested"), { recursive: true });
  await writeFile(join(fixture.gameStage, "assets/nested/texture.bin"), "nested asset");

  await assembleSite(fixture.root);
  assert.equal(
    await readFile(join(fixture.root, "dist/games/demo/assets/nested/texture.bin"), "utf8"),
    "nested asset",
  );
  assert.equal(
    (await verifyProductionArtifact(join(fixture.root, "dist"), fixture.root)).gameCount,
    1,
  );
});

await test("production verification rejects unregistered files in the games namespace", async () => {
  const fixture = await createFixture();
  await assembleSite(fixture.root);
  const roguePath = join(fixture.root, "dist/games/rogue.bin");
  await writeFile(roguePath, "rogue artifact");
  const buildInfoPath = join(fixture.root, "dist/build-info.json");
  const buildInfo = await readJson(buildInfoPath);
  buildInfo.files.push("games/rogue.bin");
  buildInfo.files.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  await writeFile(buildInfoPath, JSON.stringify(buildInfo));

  await assert.rejects(
    verifyProductionArtifact(join(fixture.root, "dist"), fixture.root),
    /unregistered games path: games\/rogue\.bin/,
  );
});

await test("production verification rejects stale dist after a build input changes", async () => {
  const fixture = await createFixture();
  await assembleSite(fixture.root);
  await writeFile(
    join(fixture.root, gameProductionInput, "game.js"),
    "changed production source\n",
  );

  await assert.rejects(
    verifyProductionArtifact(join(fixture.root, "dist"), fixture.root),
    /Production artifact buildId mismatch/,
  );
});

await test("rejects manifest build mismatches and unknown fields", async () => {
  const mismatchFixture = await createFixture();
  const manifestPath = join(mismatchFixture.gameStage, "game.manifest.json");
  const mismatchManifest = await readJson(manifestPath);
  mismatchManifest.buildId = "gameyard@0000000000000000";
  await writeFile(manifestPath, JSON.stringify(mismatchManifest));
  await assert.rejects(createAssemblyPlan(mismatchFixture.root), /buildId mismatch/);

  const unknownFixture = await createFixture();
  const unknownManifestPath = join(unknownFixture.gameStage, "game.manifest.json");
  const unknownManifest = await readJson(unknownManifestPath);
  unknownManifest.legacyEntry = "index.html";
  await writeFile(unknownManifestPath, JSON.stringify(unknownManifest));
  await assert.rejects(createAssemblyPlan(unknownFixture.root), /violates GameManifestSchema/);
});

await test("fails closed when distribution rights are missing, blocked, or incomplete", async () => {
  const missingFixture = await createFixture();
  await rm(join(missingFixture.root, "provenance/upstreams.json"));
  await assert.rejects(createAssemblyPlan(missingFixture.root), /upstreams\.json is missing/);

  const blockedFixture = await createFixture();
  const blockedIndexPath = join(blockedFixture.root, "provenance/upstreams.json");
  const blockedIndex = await readJson(blockedIndexPath);
  blockedIndex.repositories[0].publicImportAllowed = false;
  await writeFile(blockedIndexPath, JSON.stringify(blockedIndex));
  await assert.rejects(
    createAssemblyPlan(blockedFixture.root),
    /Public distribution is not allowed for game demo/,
  );

  const incompleteFixture = await createFixture();
  const incompleteIndexPath = join(incompleteFixture.root, "provenance/upstreams.json");
  const incompleteIndex = await readJson(incompleteIndexPath);
  incompleteIndex.repositories[0].license = "LicenseRef-GameYard-Demo-Distribution";
  incompleteIndex.repositories[0].rightsRecord = "provenance/demo/distribution-record.json";
  await writeFile(incompleteIndexPath, JSON.stringify(incompleteIndex));
  await assert.rejects(
    createAssemblyPlan(incompleteFixture.root),
    /Distribution record .* is missing/,
  );

  const downgradedFixture = await createFixture();
  const downgradedIndexPath = join(downgradedFixture.root, "provenance/upstreams.json");
  const downgradedIndex = await readJson(downgradedIndexPath);
  const tumbledrum = downgradedIndex.repositories.find(
    (repository) => repository.id === "tumbledrum",
  );
  tumbledrum.license = "MIT";
  tumbledrum.rightsRecord = null;
  await writeFile(downgradedIndexPath, JSON.stringify(downgradedIndex));
  await assert.rejects(createAssemblyPlan(downgradedFixture.root), /must keep tumbledrum pinned/);
});

await test("rejects game Service Workers and root-absolute asset URLs", async () => {
  const serviceWorkerFixture = await createFixture();
  const serviceWorkerManifestPath = join(serviceWorkerFixture.gameStage, "game.manifest.json");
  const serviceWorkerManifest = await readJson(serviceWorkerManifestPath);
  serviceWorkerManifest.files.push("sw.js");
  await writeFile(serviceWorkerManifestPath, JSON.stringify(serviceWorkerManifest));
  await writeFile(
    join(serviceWorkerFixture.gameStage, "sw.js"),
    "self.addEventListener('install', () => {})",
  );
  await assert.rejects(
    createAssemblyPlan(serviceWorkerFixture.root),
    /forbidden Service Worker file/,
  );

  const finalArtifactFixture = await createFixture();
  await assembleSite(finalArtifactFixture.root);
  await writeFile(
    join(finalArtifactFixture.root, "dist/games/demo/game.js"),
    'navigator.serviceWorker.register("./worker.js")',
  );
  await assert.rejects(
    verifyProductionArtifact(join(finalArtifactFixture.root, "dist"), finalArtifactFixture.root),
    /forbidden marker "navigator\.serviceworker"/,
  );

  const absoluteFixture = await createFixture();
  const absoluteManifestPath = join(absoluteFixture.gameStage, "game.manifest.json");
  const absoluteManifest = await readJson(absoluteManifestPath);
  absoluteManifest.files.push("game.css");
  await writeFile(absoluteManifestPath, JSON.stringify(absoluteManifest));
  await writeFile(
    join(absoluteFixture.gameStage, "game.css"),
    "body { background: url(/asset.png) }",
  );
  await assert.rejects(createAssemblyPlan(absoluteFixture.root), /CSS url\(\)/);
});

await test("preserves the existing dist when assembly validation fails", async () => {
  const { gameStage, root } = await createFixture();
  await mkdir(join(root, "dist"));
  await writeFile(join(root, "dist/sentinel.txt"), "keep me");
  await writeFile(join(gameStage, "undeclared.js"), "invalid stage");

  await assert.rejects(assembleSite(root), /undeclared: undeclared\.js/);
  assert.equal(await readFile(join(root, "dist/sentinel.txt"), "utf8"), "keep me");
  assert.deepEqual((await stat(join(root, "dist"))).isDirectory(), true);
});

await test("keeps the complete new dist when old backup cleanup fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "gameyard-replace-"));
  temporaryRoots.push(root);
  const next = join(root, "next");
  const destination = join(root, "dist");
  const backup = join(root, "previous");
  await mkdir(next);
  await mkdir(destination);
  await writeFile(join(next, "new-a.txt"), "new a");
  await writeFile(join(next, "new-b.txt"), "new b");
  await writeFile(join(destination, "old-a.txt"), "old a");
  await writeFile(join(destination, "old-b.txt"), "old b");

  const operations = {
    rename,
    stat,
    rm: async (path, options) => {
      if (path === backup) {
        await rm(join(backup, "old-a.txt"));
        throw new Error("injected partial backup cleanup failure");
      }
      await rm(path, options);
    },
  };

  await assert.rejects(
    replaceDirectoryTransactional(next, destination, backup, operations),
    /residual backup remains at/,
  );
  assert.equal(await readFile(join(destination, "new-a.txt"), "utf8"), "new a");
  assert.equal(await readFile(join(destination, "new-b.txt"), "utf8"), "new b");
  await assert.rejects(stat(join(destination, "old-b.txt")), { code: "ENOENT" });
  assert.equal(await readFile(join(backup, "old-b.txt"), "utf8"), "old b");
  await assert.rejects(stat(join(backup, "old-a.txt")), { code: "ENOENT" });
});

await test("rejects unknown assembly configuration fields", async () => {
  const { root } = await createFixture();
  await writeFile(
    join(root, "site.assembly.json"),
    JSON.stringify({
      schemaVersion: 2,
      hub: { stage: ".gameyard/stage/hub", devPort: 5173 },
      games: (await readJson(join(root, "site.assembly.json"))).games,
      legacyDist: "dist",
    }),
  );

  await assert.rejects(createAssemblyPlan(root), /fields must be exactly/);
});
