import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  EXPECTED_STATIC_ASSET_HEADERS,
  inspectArtifactText,
  verifyPublishedArtifact,
} from "./verify-production.mjs";

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
  ["game.js", "const testkit = { setInvulnerable() {} };", 'forbidden marker "testkit"'],
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

await test("rejects a Service Worker by artifact filename", () => {
  assert.ok(
    inspectArtifactText("games/demo/sw.js", "self.addEventListener('install', () => {})").includes(
      "forbidden Service Worker file",
    ),
  );
});

await test("reports the invalid catalog entry instead of throwing an internal reference error", async () => {
  const root = await mkdtemp(join(tmpdir(), "gameyard-invalid-artifact-"));
  const buildId = "gameyard@0123456789abcdef";
  const files = [
    "_headers",
    "assets/app.js",
    "build-info.json",
    "games/catalog.json",
    "games/demo/game.manifest.json",
    "games/demo/index.html",
    "icons/gameyard-192.png",
    "icons/gameyard-512.png",
    "index.html",
    "manifest.webmanifest",
    "service-worker.js",
  ];
  try {
    await mkdir(join(root, "assets"), { recursive: true });
    await mkdir(join(root, "games/demo"), { recursive: true });
    await mkdir(join(root, "icons"), { recursive: true });
    await writeFile(
      join(root, "build-info.json"),
      JSON.stringify({ schemaVersion: 1, buildId, files }),
    );
    await writeFile(join(root, "_headers"), EXPECTED_STATIC_ASSET_HEADERS);
    await writeFile(
      join(root, "games/catalog.json"),
      JSON.stringify({
        schemaVersion: 1,
        buildId,
        games: [{ id: "demo", entry: "./demo/index.html", manifest: "./demo/wrong.json" }],
      }),
    );
    await writeFile(
      join(root, "games/demo/game.manifest.json"),
      JSON.stringify({
        schemaVersion: 1,
        protocol: 1,
        id: "demo",
        version: "1.0.0",
        entry: "index.html",
        locales: { source: "en", supported: ["en"] },
        capabilities: [],
        provenance: {
          kind: "repository",
          repository: "https://example.test/demo",
          revision: "0123456789abcdef0123456789abcdef01234567",
          license: "MIT",
        },
        buildId,
        files: ["game.manifest.json", "index.html"],
      }),
    );
    await writeFile(join(root, "games/demo/index.html"), "<!doctype html><title>Demo</title>");
    await writeFile(
      join(root, "assets/app.js"),
      'navigator.serviceWorker.register("./service-worker.js");',
    );
    await writeFile(
      join(root, "service-worker.js"),
      `const BUILD_ID = "${buildId}"; const CACHE = "gameyard-"; self.registration.scope;`,
    );
    await writeFile(join(root, "index.html"), "<!doctype html><title>GameYard</title>");
    await writeFile(
      join(root, "manifest.webmanifest"),
      JSON.stringify({
        id: "./",
        start_url: "./",
        scope: "./",
        display: "standalone",
        icons: [
          { src: "./icons/gameyard-192.png", sizes: "192x192" },
          { src: "./icons/gameyard-512.png", sizes: "512x512" },
        ],
      }),
    );
    await writeFile(join(root, "icons/gameyard-192.png"), "fixture");
    await writeFile(join(root, "icons/gameyard-512.png"), "fixture");

    await assert.rejects(
      verifyPublishedArtifact(root),
      /games\/catalog\.json games\[0\]\.manifest must be \.\/demo\/game\.manifest\.json/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
