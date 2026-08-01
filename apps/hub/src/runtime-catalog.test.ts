import { describe, expect, it, vi } from "vite-plus/test";

import { loadPulseRuntime, parseRuntimeCatalog, type RuntimeFetch } from "./runtime-catalog";

const BUILD_ID = "gameyard@0123456789abcdef";

const catalog = {
  schemaVersion: 1,
  buildId: BUILD_ID,
  games: [
    {
      id: "pulse-link-overdrive",
      entry: "./pulse-link-overdrive/index.html",
      manifest: "./pulse-link-overdrive/game.manifest.json",
    },
  ],
};

const manifest = {
  schemaVersion: 1,
  protocol: 1,
  id: "pulse-link-overdrive",
  version: "1.0.0",
  buildId: BUILD_ID,
  entry: "index.html",
  locales: { source: "en", supported: ["en", "ja", "zh-Hans"] },
  capabilities: [],
  provenance: {
    repository: "https://github.com/Hitsuki-Ban/PulseLinkOverdrive",
    revision: "0123456789abcdef0123456789abcdef01234567",
    license: "MIT",
  },
  files: ["index.html", "game.manifest.json"],
};

function response(value: unknown) {
  return { ok: true, status: 200, json: async () => value };
}

describe("runtime catalog", () => {
  it("rejects extra fields and build mismatches", () => {
    expect(() => parseRuntimeCatalog({ ...catalog, unexpected: true }, BUILD_ID)).toThrow(
      /exactly/,
    );
    expect(() => parseRuntimeCatalog(catalog, "gameyard@fedcba9876543210")).toThrow(
      /build mismatch/,
    );
  });

  it("loads and normalizes the Pulse runtime paths", async () => {
    const fetcher = vi
      .fn<RuntimeFetch>()
      .mockResolvedValueOnce(response(catalog))
      .mockResolvedValueOnce(response(manifest));

    await expect(loadPulseRuntime(fetcher, BUILD_ID)).resolves.toMatchObject({
      id: "pulse-link-overdrive",
      buildId: BUILD_ID,
      entryUrl: "./games/pulse-link-overdrive/index.html",
      baseUrl: "./games/pulse-link-overdrive/",
    });
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "./games/catalog.json",
      "./games/pulse-link-overdrive/game.manifest.json",
    ]);
  });

  it("fails when the manifest does not agree with the catalog entry", async () => {
    const fetcher = vi
      .fn<RuntimeFetch>()
      .mockResolvedValueOnce(response(catalog))
      .mockResolvedValueOnce(
        response({ ...manifest, entry: "other.html", files: ["other.html", "game.manifest.json"] }),
      );

    await expect(loadPulseRuntime(fetcher, BUILD_ID)).rejects.toThrow(/entry mismatch/);
  });
});
