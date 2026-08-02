import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const projectRoot = fileURLToPath(new URL("../", import.meta.url));

async function packageManifests(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const file = resolve(directory, entry.name, "package.json");
        return { file, value: JSON.parse(await readFile(file, "utf8")) };
      }),
  );
}

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(path)));
    else if (entry.isFile() && /\.(?:[cm]?[jt]sx?)$/u.test(entry.name)) files.push(path);
  }
  return files;
}

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

await test("shared packages keep a one-way dependency boundary away from game workspaces", async () => {
  const packages = await packageManifests(resolve(projectRoot, "packages"));
  const games = await packageManifests(resolve(projectRoot, "games"));
  const gamePackageNames = new Set(games.map(({ value }) => value.name));

  for (const { file, value } of packages) {
    const dependencies = {
      ...value.dependencies,
      ...value.devDependencies,
      ...value.peerDependencies,
      ...value.optionalDependencies,
    };
    for (const dependency of Object.keys(dependencies)) {
      assert.equal(
        gamePackageNames.has(dependency),
        false,
        `${relative(projectRoot, file)} must not depend on game package ${dependency}`,
      );
    }
  }

  const gamesRoot = resolve(projectRoot, "games");
  const importPattern =
    /\b(?:import|export)\s+(?:[^;"'`]*?\s+from\s+)?["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)/gu;
  for (const file of await sourceFiles(resolve(projectRoot, "packages"))) {
    const source = await readFile(file, "utf8");
    for (const match of source.matchAll(importPattern)) {
      const specifier = match[1] ?? match[2];
      if (!specifier?.startsWith(".")) continue;
      const target = resolve(dirname(file), specifier);
      assert.equal(
        target === gamesRoot ||
          target.startsWith(`${gamesRoot}\\`) ||
          target.startsWith(`${gamesRoot}/`),
        false,
        `${relative(projectRoot, file)} must not import ${specifier} from games/`,
      );
    }
  }
});
