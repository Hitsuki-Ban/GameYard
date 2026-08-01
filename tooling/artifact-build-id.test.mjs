import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
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

  return root;
}

await test("artifact build ID is deterministic for identical production inputs", async () => {
  const root = await createFixture();

  const first = await createArtifactBuildId(root);
  const second = await createArtifactBuildId(root);

  assert.match(first, /^hub@[a-f0-9]{16}$/);
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

await test("artifact build ID fails when a required input is missing", async () => {
  const root = await createFixture();
  await rm(join(root, "pnpm-lock.yaml"));

  await assert.rejects(
    createArtifactBuildId(root),
    /Required production input is missing: pnpm-lock\.yaml/,
  );
});
