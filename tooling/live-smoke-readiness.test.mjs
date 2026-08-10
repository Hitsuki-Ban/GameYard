import assert from "node:assert/strict";
import test from "node:test";

import { classifyHubShellObservation, waitForPublishedRelease } from "../deployment/live-smoke.mjs";

const targetBuildId = "gameyard@target";
const baseUrl = new URL("https://gameyard.hitsuki.space/GameYard/");

function response(value, status = 200) {
  return {
    ok: () => status >= 200 && status < 300,
    status: () => status,
    json: async () => value,
  };
}

function catalog(
  buildId,
  games = [{ id: "registered-game", entry: "./registered-game/index.html" }],
) {
  return { schemaVersion: 1, buildId, games };
}

void test("waits for build-info and catalog to reach one deployed build", async () => {
  const buildResponses = [
    response({ schemaVersion: 1, buildId: "gameyard@previous" }),
    response({ schemaVersion: 1, buildId: targetBuildId }),
    response({ schemaVersion: 1, buildId: targetBuildId }),
  ];
  const catalogResponses = [
    response(catalog("gameyard@previous")),
    response(catalog(targetBuildId)),
  ];
  const request = {
    get: async (url) => {
      const queue = url.endsWith("build-info.json") ? buildResponses : catalogResponses;
      const next = queue.shift();
      assert.ok(next, `Unexpected readiness request: ${url}`);
      return next;
    },
  };

  assert.deepEqual(
    await waitForPublishedRelease(request, baseUrl, targetBuildId, {
      timeoutMs: 100,
      intervalMs: 1,
    }),
    [{ id: "registered-game", entry: "./registered-game/index.html" }],
  );
  assert.equal(buildResponses.length, 0);
  assert.equal(catalogResponses.length, 0);
});

void test("fails immediately when the target catalog violates its contract", async () => {
  const request = {
    get: async (url) =>
      url.endsWith("build-info.json")
        ? response({ schemaVersion: 1, buildId: targetBuildId })
        : response(catalog(targetBuildId, [])),
  };

  await assert.rejects(
    waitForPublishedRelease(request, baseUrl, targetBuildId, {
      timeoutMs: 100,
      intervalMs: 1,
    }),
    /games\/catalog\.json has no deployed runtime games/u,
  );
});

void test("requires the target Hub shell and only retries explicit release propagation", () => {
  assert.deepEqual(
    classifyHubShellObservation(
      { shellBuildId: "gameyard@previous", artifactKind: null, receivedBuildId: null },
      targetBuildId,
    ),
    { kind: "retry", diagnostic: "the Hub shell still serves gameyard@previous" },
  );
  assert.deepEqual(
    classifyHubShellObservation(
      {
        shellBuildId: targetBuildId,
        artifactKind: "mismatch",
        receivedBuildId: "gameyard@previous",
      },
      targetBuildId,
    ),
    {
      kind: "retry",
      diagnostic: `the ${targetBuildId} Hub shell still receives gameyard@previous`,
    },
  );
  assert.deepEqual(
    classifyHubShellObservation(
      { shellBuildId: targetBuildId, artifactKind: null, receivedBuildId: null },
      targetBuildId,
    ),
    { kind: "ready" },
  );
  assert.deepEqual(
    classifyHubShellObservation(
      { shellBuildId: targetBuildId, artifactKind: "unavailable", receivedBuildId: null },
      targetBuildId,
    ),
    {
      kind: "failure",
      diagnostic: `the ${targetBuildId} Hub shell entered artifact stop unavailable`,
    },
  );
});
