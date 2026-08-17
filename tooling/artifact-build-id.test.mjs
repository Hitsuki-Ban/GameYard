import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, test } from "node:test";

import { createArtifactBuildId, REQUIRED_PRODUCTION_INPUTS } from "./artifact-build-id.mjs";

const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), "gameyard-build-id-"));
  temporaryRoots.push(root);

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
  await mkdir(join(root, "games/demo/src"), { recursive: true });
  await writeFile(join(root, "games/demo/src/game.js"), "first build\n");
  await writeFile(
    join(root, "games/demo/package.json"),
    JSON.stringify({
      name: "@gameyard/demo",
      version: "1.0.0",
      private: true,
      scripts: { build: "vp build", check: "vp check", test: "vp test" },
    }),
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
        kind: "repository",
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
            stage: ".gameyard/stage/games/demo",
            manifestSource: "games/demo/game.manifest.source.json",
            presentationSource: "games/demo/game.presentation.source.json",
            devPort: 5174,
            productionInputs: [
              "games/demo/cover-small.svg",
              "games/demo/cover.svg",
              "games/demo/game.manifest.source.json",
              "games/demo/game.presentation.source.json",
              "games/demo/package.json",
              "games/demo/src",
            ],
          },
        ],
      },
      null,
      2,
    )}\n`,
  );

  return root;
}

await test("artifact build ID is deterministic for identical production inputs", async () => {
  const root = await createFixture();

  const first = await createArtifactBuildId(root);
  const second = await createArtifactBuildId(root);

  assert.match(first, /^gameyard@[a-f0-9]{16}$/);
  assert.equal(second, first);
});

await test("artifact build ID changes with source, lock, and configuration content", async () => {
  const root = await createFixture();
  const original = await createArtifactBuildId(root);

  await writeFile(join(root, "apps/hub/src/entry.ts"), "changed source\n");
  const sourceChanged = await createArtifactBuildId(root);
  assert.notEqual(sourceChanged, original);

  await writeFile(join(root, "pnpm-lock.yaml"), "changed lock\n");
  const lockChanged = await createArtifactBuildId(root);
  assert.notEqual(lockChanged, sourceChanged);

  await writeFile(join(root, "apps/hub/vite.config.ts"), "changed config\n");
  const configChanged = await createArtifactBuildId(root);
  assert.notEqual(configChanged, lockChanged);
});

await test("artifact build ID covers runtime and assembly inputs", async () => {
  const root = await createFixture();
  let previous = await createArtifactBuildId(root);
  const changedInputs = [
    "packages/game-contract/src/entry.ts",
    "packages/manifest-tools/src/entry.ts",
    "packages/host-bridge/src/entry.ts",
    "packages/guest-bridge/src/entry.ts",
    "tooling/site-assembler.mjs",
  ];

  for (const input of changedInputs) {
    await writeFile(join(root, input), `changed:${input}\n`);
    const next = await createArtifactBuildId(root);
    assert.notEqual(next, previous, `${input} must affect the artifact build ID`);
    previous = next;
  }

  await writeFile(
    join(root, "site.assembly.json"),
    `${await readFile(join(root, "site.assembly.json"), "utf8")}\n`,
  );
  assert.notEqual(await createArtifactBuildId(root), previous);
});

await test("artifact build ID includes each configured game's production inputs", async () => {
  const root = await createFixture();
  const gameSource = join(root, "games/demo/src");
  const first = await createArtifactBuildId(root);
  await writeFile(join(gameSource, "game.js"), "second build\n");

  assert.notEqual(await createArtifactBuildId(root), first);
});

await test("artifact build ID ignores testkit, tests, and stale dist", async () => {
  const root = await createFixture();
  const original = await createArtifactBuildId(root);
  for (const input of [
    "packages/testkit/src/index.ts",
    "tests/e2e/hub.spec.ts",
    "dist/assets/stale.js",
    "deployment/cloudflare-worker.mjs",
    "provenance/upstreams.json",
    "tooling/release-metadata.mjs",
    "tooling/verify-production.mjs",
  ]) {
    const target = join(root, input);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, `ignored:${input}\n`);
  }

  assert.equal(await createArtifactBuildId(root), original);
});

await test("artifact build ID fails when a required input is missing", async () => {
  const root = await createFixture();
  await rm(join(root, "pnpm-lock.yaml"));

  await assert.rejects(
    createArtifactBuildId(root),
    /Required production input is missing: pnpm-lock\.yaml/,
  );
});
