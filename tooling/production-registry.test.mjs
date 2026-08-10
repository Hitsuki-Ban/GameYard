import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";

import { loadProductionRegistry, parseProductionRegistry } from "./production-registry.mjs";
import { createGameCiMatrix, writeGameCiMatrix } from "./production-registry-ci.mjs";
import { createProductionRegistryVitePlugin } from "./production-registry-vite.mjs";
import { createProductionRegistryTaskCommands } from "./run-production-registry-task.mjs";

const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

function registryGame(index) {
  const id = index === 6 ? "synthetic-sixth" : `fixture-${index}`;
  const base = `games/${id}`;
  return {
    id,
    packageName: `@gameyard/${id}`,
    stage: `.gameyard/stage/games/${id}`,
    manifestSource: `${base}/game.manifest.source.json`,
    presentationSource: `${base}/game.presentation.source.json`,
    devPort: 5_173 + index,
    productionInputs: [
      `${base}/cover-small.svg`,
      `${base}/cover.svg`,
      `${base}/game.manifest.source.json`,
      `${base}/game.presentation.source.json`,
      `${base}/package.json`,
      `${base}/src`,
    ],
  };
}

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), "gameyard-registry-"));
  temporaryRoots.push(root);
  const games = Array.from({ length: 6 }, (_, index) => registryGame(index + 1));
  for (const game of games) {
    const base = join(root, "games", game.id);
    await mkdir(join(base, "src"), { recursive: true });
    await writeFile(
      join(base, "package.json"),
      JSON.stringify({
        name: game.packageName,
        version: "1.0.0",
        private: true,
        scripts: {
          "browser:install": "vp exec playwright install chromium",
          dev: "vp dev",
          build: "vp build",
          check: "vp check",
          test: "vp test",
        },
      }),
    );
    await writeFile(
      join(base, "game.manifest.source.json"),
      JSON.stringify({
        schemaVersion: 1,
        protocol: 1,
        id: game.id,
        version: "1.0.0",
        entry: "index.html",
        locales: { source: "en", supported: ["en", "ja", "zh-Hans"] },
        capabilities: ["keyboard"],
        provenance: {
          repository: `https://example.test/${game.id}`,
          revision: "0123456789abcdef0123456789abcdef01234567",
          license: "MIT",
        },
      }),
    );
    await writeFile(
      join(base, "game.presentation.source.json"),
      JSON.stringify({
        schemaVersion: 1,
        id: game.id,
        title: `Fixture ${game.id}`,
        taglines: { en: "English tagline", ja: "日本語タグライン", "zh-Hans": "中文标语" },
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
    await writeFile(join(base, "cover-small.svg"), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    await writeFile(join(base, "cover.svg"), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    await writeFile(join(base, "src/index.js"), "export {};\n");
  }
  const raw = {
    schemaVersion: 2,
    hub: { stage: ".gameyard/stage/hub", devPort: 5_173 },
    games,
  };
  await writeFile(join(root, "site.assembly.json"), `${JSON.stringify(raw, null, 2)}\n`);
  return { root, raw };
}

await test("loads an ordered six-game registry and emits only browser-safe virtual catalog data", async () => {
  const { root } = await createFixture();
  const registry = await loadProductionRegistry(root);
  assert.equal(registry.games.length, 6);
  assert.equal(registry.games[5].id, "synthetic-sixth");

  const plugin = createProductionRegistryVitePlugin(registry);
  const catalogId = plugin.resolveId("virtual:gameyard/catalog");
  const source = plugin.load(catalogId);
  assert.match(source, /order:6/);
  assert.match(source, /virtual:gameyard\/cover\/5\/1/);
  assert.doesNotMatch(source, /@gameyard|\.gameyard\/stage|devPort|sourcePath/);
  assert.match(plugin.resolveId("virtual:gameyard/cover/5/1"), /\?url&no-inline$/);

  const buildCommands = createProductionRegistryTaskCommands(registry, "build");
  assert.equal(buildCommands.length, registry.games.length + 1);
  assert.deepEqual(buildCommands[0], [
    "run",
    "--no-cache",
    `${registry.games[0].packageName}#build`,
  ]);
  assert.ok(buildCommands.every((command) => !command.includes("--filter")));
  assert.equal(
    createProductionRegistryTaskCommands(registry, "browser:install").length,
    registry.games.length,
  );
});

await test("emits the GitHub game matrix from registry order and package identity", async () => {
  const { root } = await createFixture();
  const registry = await loadProductionRegistry(root);
  assert.deepEqual(createGameCiMatrix(registry), {
    include: registry.games.map((game) => ({
      gameId: game.id,
      packageName: game.packageName,
    })),
  });

  const outputFile = join(root, "github-output.txt");
  const matrix = await writeGameCiMatrix(root, outputFile);
  assert.equal(await readFile(outputFile, "utf8"), `game-matrix=${JSON.stringify(matrix)}\n`);
});

await test("rejects legacy, empty, colliding, and unsafe registry configurations", () => {
  const game = registryGame(1);
  const valid = {
    schemaVersion: 2,
    hub: { stage: ".gameyard/stage/hub", devPort: 5_173 },
    games: [game],
  };
  const cases = [
    [{ schemaVersion: 1, hubStage: ".gameyard/stage/hub", games: [] }, /not supported/],
    [{ ...valid, games: [] }, /must not be empty/],
    [{ ...valid, hub: { ...valid.hub, devPort: 80 } }, /1024 through 65535/],
    [{ ...valid, games: [game, { ...game }] }, /game ID collision/],
    [
      { ...valid, games: [{ ...game, manifestSource: "../manifest.json" }] },
      /repository-relative POSIX path/,
    ],
    [{ ...valid, games: [{ ...game, stage: "games/fixture-1/src" }] }, /inside \.gameyard\/stage/],
  ];
  for (const [raw, expected] of cases) assert.throws(() => parseProductionRegistry(raw), expected);
});

await test("fails closed on locale, presentation, cover, and production coverage mismatches", async () => {
  const cases = [
    {
      file: "game.manifest.source.json",
      mutate(value) {
        value.locales.supported = ["en", "ja"];
      },
      expected: /must support locale zh-Hans/,
    },
    {
      file: "game.presentation.source.json",
      mutate(value) {
        value.title = "Broken\ntitle";
      },
      expected: /GamePresentationSourceSchema/,
    },
    {
      file: "game.presentation.source.json",
      mutate(value) {
        value.cover.candidates[1].width = 700;
      },
      expected: /strictly increasing/,
    },
    {
      file: "site.assembly.json",
      mutate(value) {
        value.games[0].productionInputs = value.games[0].productionInputs.filter(
          (input) => !input.endsWith("cover.svg"),
        );
      },
      expected: /not covered by productionInputs/,
    },
  ];

  for (const fixtureCase of cases) {
    const { root } = await createFixture();
    const path =
      fixtureCase.file === "site.assembly.json"
        ? join(root, fixtureCase.file)
        : join(root, "games/fixture-1", fixtureCase.file);
    const value = JSON.parse(await readFile(path, "utf8"));
    fixtureCase.mutate(value);
    await writeFile(path, JSON.stringify(value));
    await assert.rejects(loadProductionRegistry(root), fixtureCase.expected);
  }
});

await test("rejects a registered package without the standard task surface", async () => {
  const { root } = await createFixture();
  const packagePath = join(root, "games/fixture-1/package.json");
  const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
  delete packageJson.scripts.check;
  await writeFile(packagePath, JSON.stringify(packageJson));

  await assert.rejects(
    loadProductionRegistry(root),
    /game fixture-1 package @gameyard\/fixture-1 is missing required task check/,
  );
});
