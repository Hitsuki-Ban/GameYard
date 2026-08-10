const host = {
  ready: false,
  failed: false,
  events: [],
  port: null,
  activating: false,
  sequence: 0,
  pending: new Map(),
};
globalThis.__KAMIFUDA_HOST__ = host;

const buildId = "__GAMEYARD_TESTKIT_BUILD__";
const context = {
  protocol: 1,
  buildId,
  gameId: "kamifuda-runner",
  instanceId: "kamifuda-runner-testkit",
  baseUrl: "./kamifuda-runner/",
  locale: { preference: "ja", resolved: "ja" },
  settings: {
    revision: 0,
    audio: { master: 0.56, music: 1, sfx: 1 },
    motion: { reduced: false, screenShake: true },
  },
  diagnostics: { mode: "lab" },
};

function fail(message) {
  if (host.failed) return;
  host.failed = true;
  const error = new Error(`Kamifuda testkit Host failed: ${message}`);
  console.error(error);
  document.documentElement.dataset.testkitHost = "failed";
  const showFailure = () => {
    document.body.replaceChildren(
      Object.assign(document.createElement("pre"), {
        id: "testkit-host-failure",
        textContent: error.message,
      }),
    );
  };
  if (document.body) showFailure();
  else document.addEventListener("DOMContentLoaded", showFailure, { once: true });
  for (const pending of host.pending.values()) pending.reject(error);
  host.pending.clear();
}

function exactKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const compare = (left, right) => (left < right ? -1 : left > right ? 1 : 0);
  const actual = Object.keys(value).sort(compare);
  const sortedExpected = [...expected].sort(compare);
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function send(type, fields = {}) {
  if (!host.port || host.failed)
    return Promise.reject(new Error("Kamifuda testkit Host is not connected."));
  const commandId = `testkit-${++host.sequence}`;
  return new Promise((resolve, reject) => {
    host.pending.set(commandId, { resolve, reject });
    host.port.postMessage({ type, commandId, ...fields });
  });
}
host.send = send;
host.context = context;

async function activate() {
  await send("input.setEnabled", { enabled: true });
  await send("lifecycle.resume");
  host.ready = true;
  document.documentElement.dataset.testkitHost = "ready";
}

function handlePortMessage(event) {
  const message = event.data;
  host.events.push(message);
  if (message?.type === "ready") {
    if (!exactKeys(message, ["type"]) || host.activating || host.ready) {
      fail("received an invalid or duplicate ready event");
      return;
    }
    host.activating = true;
    void activate().catch((error) => fail(error.message));
    return;
  }
  if (message?.type === "ack") {
    const pending = host.pending.get(message.commandId);
    if (!pending || !exactKeys(message, ["type", "commandId", "result"])) {
      fail("received an invalid or unknown ACK");
      return;
    }
    host.pending.delete(message.commandId);
    if (message.result?.ok === true) pending.resolve();
    else pending.reject(new Error(message.result?.error?.message || "Host command failed."));
    return;
  }
  if (message?.type === "lifecycle.changeRequest") {
    if (!["pause", "resume"].includes(message.action)) {
      fail("received an invalid lifecycle request");
      return;
    }
    void send(`lifecycle.${message.action}`).catch((error) => fail(error.message));
  }
}

function handlePortError() {
  fail("MessagePort decoding failed");
}

function handleWindowMessage(event) {
  if (event.data?.type !== "gameyard:ready-for-init") return;
  event.stopImmediatePropagation();
  if (
    event.source !== window ||
    event.origin !== location.origin ||
    event.ports.length !== 0 ||
    !exactKeys(event.data, ["type", "protocol", "gameId", "buildId"]) ||
    event.data.protocol !== 1 ||
    event.data.gameId !== "kamifuda-runner" ||
    event.data.buildId !== buildId ||
    host.port !== null
  ) {
    fail("received an invalid ready-for-init message");
    return;
  }
  const channel = new MessageChannel();
  host.port = channel.port1;
  host.port.addEventListener("message", handlePortMessage);
  host.port.addEventListener("messageerror", handlePortError);
  host.port.start();
  window.postMessage({ type: "gameyard:init", context }, location.origin, [channel.port2]);
}

host.resourceBaseline = globalThis.__GAMEYARD_RESOURCE_PROBE__?.snapshot() || null;
host.dispose = async () => {
  await send("lifecycle.dispose");
  host.port.removeEventListener("message", handlePortMessage);
  host.port.removeEventListener("messageerror", handlePortError);
  host.port.close();
  host.port = null;
  window.removeEventListener("message", handleWindowMessage);
};
window.addEventListener("message", handleWindowMessage);
