import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";

import { inspectArtifactText, verifyProductionArtifact } from "./verify-production.mjs";

const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

const rejectedFixtures = [
  ["index.html", '<script src="/assets/app.js"></script>', "HTML src"],
  ["index.html", "<a href='/games'>Games</a>", "HTML href"],
  ["index.html", '<video poster="/poster.webp"></video>', "HTML poster"],
  ["index.html", '<source srcset="//cdn.example/one.webp 1x, /two.webp 2x">', "HTML srcset"],
  ["app.css", "body { background: url(/grid.svg) }", "CSS url()"],
  ["app.css", '@import "/theme.css";', "CSS @import"],
  ["manifest.webmanifest", '{"icons":[{"src":"/icon.png"}]}', "JSON value"],
  ["catalog.json", '{"nested":{"asset":"/game/data.bin"}}', "JSON value"],
  ["app.js", 'const asset = new URL("/asset.bin", import.meta.url);', "JavaScript URL call"],
  ["app.js", 'fetch("/api/catalog");', "JavaScript URL call"],
  ["app.js", 'import("/chunks/game.js");', "JavaScript URL call"],
  ["app.js", 'import runtime from "/runtime.js";', "JavaScript module URL"],
];

for (const [file, content, expected] of rejectedFixtures) {
  await test(`rejects repository-prefix-breaking fixture: ${file} ${expected}`, () => {
    assert.ok(inspectArtifactText(file, content).some((failure) => failure.includes(expected)));
  });
}

const allowedFixtures = [
  [
    "index.html",
    '<script src="./assets/app.js"></script><a href="../games">Games</a><img src="//cdn.example/x.png">',
  ],
  ["app.css", '@import "./theme.css"; .x { background: url(//cdn.example/x.png) }'],
  ["manifest.webmanifest", '{"start_url":"./","icons":[{"src":"https://cdn.example/icon.png"}]}'],
  [
    "app.js",
    'fetch("./catalog.json"); import("../chunks/game.js"); new URL("//cdn.example/a", import.meta.url);',
  ],
];

for (const [file, content] of allowedFixtures) {
  await test(`allows relative and scheme-relative fixture: ${file}`, () => {
    assert.deepEqual(inspectArtifactText(file, content), []);
  });
}

await test("artifact verification reports root-absolute references from nested output files", async () => {
  const root = await mkdtemp(join(tmpdir(), "gameyard-artifact-"));
  temporaryRoots.push(root);
  await mkdir(join(root, "assets"), { recursive: true });
  await writeFile(join(root, "index.html"), '<script src="./assets/app.js"></script>');
  await writeFile(join(root, "assets/app.js"), 'fetch("/catalog.json")');

  await assert.rejects(
    verifyProductionArtifact(root, root),
    /assets[\\/]app\.js contains JavaScript URL call/,
  );
});

await test("artifact verification accepts a relative-path production fixture", async () => {
  const root = await mkdtemp(join(tmpdir(), "gameyard-artifact-"));
  temporaryRoots.push(root);
  await mkdir(join(root, "assets"), { recursive: true });
  await writeFile(join(root, "index.html"), '<script src="./assets/app.js"></script>');
  await writeFile(join(root, "assets/app.js"), 'fetch("./catalog.json")');
  await writeFile(join(root, "catalog.json"), '{"game":"./games/pulse/"}');

  assert.deepEqual(await verifyProductionArtifact(root, root), { fileCount: 3 });
});
