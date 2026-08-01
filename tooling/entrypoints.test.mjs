import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

await test("preview verifies the current artifact before serving final dist", () => {
  assert.equal(
    packageJson.scripts.preview,
    "vp run artifact:verify && vp preview --config tooling/preview.vite.config.mjs",
  );
});
