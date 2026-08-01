import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

await test("build creates every owned stage before the sole assembler", () => {
  assert.equal(
    packageJson.scripts.build,
    "vp run --no-cache pulse-link-overdrive#build && vp run --no-cache tumbledrum#build && vp run --no-cache crown-breaker#build && vp run --no-cache hub#build && vp exec node tooling/assemble-site.mjs && vp run artifact:verify",
  );
});

await test("development and browser installation cover every runtime workspace", () => {
  assert.equal(
    packageJson.scripts.dev,
    "vp run --parallel --filter @gameyard/pulse-link-overdrive --filter @gameyard/tumbledrum --filter @gameyard/crown-breaker --filter hub dev",
  );
  assert.equal(
    packageJson.scripts["e2e:install"],
    "vp exec playwright install chromium && vp run tumbledrum#browser:install && vp run crown-breaker#browser:install",
  );
});

await test("preview verifies the current artifact before serving final dist", () => {
  assert.equal(
    packageJson.scripts.preview,
    "vp run artifact:verify && vp preview --config tooling/preview.vite.config.mjs",
  );
});
