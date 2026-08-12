const host = {
  ready: false,
  failed: false,
  awaitingInit: false,
  readyForInit: null,
  preInit: null,
  port: null,
  sequence: 0,
  pending: new Map(),
  events: [],
  autoInit: new URL(location.href).searchParams.get("init") !== "manual",
  settingsMode: "auto",
};
globalThis.__NEON_HOST__ = host;

const buildId = "__GAMEYARD_TESTKIT_BUILD__";
const context = {
  protocol: 1,
  buildId,
  gameId: "neon-overdrive",
  instanceId: "neon-overdrive-testkit",
  baseUrl: "./neon-overdrive/",
  locale: { preference: "zh-Hans", resolved: "zh-Hans" },
  settings: {
    revision: 0,
    audio: { master: 0, music: 0, sfx: 0 },
    motion: { reduced: false, screenShake: false },
  },
  diagnostics: { mode: "lab" },
};
host.context = context;

function fail(message) {
  if (host.failed) return;
  host.failed = true;
  const error = new Error(`Neon testkit Host failed: ${message}`);
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
  if (!host.port || host.failed) {
    return Promise.reject(new Error("Neon testkit Host is not connected."));
  }
  const commandId = `neon-testkit-${++host.sequence}`;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      host.pending.delete(commandId);
      reject(new Error(`Neon testkit Host command timed out: ${type} (${commandId})`));
    }, 5_000);
    host.pending.set(commandId, {
      resolve(value) {
        clearTimeout(timeout);
        resolve(value);
      },
      reject(error) {
        clearTimeout(timeout);
        reject(error);
      },
    });
    host.port.postMessage({ type, commandId, ...fields });
  });
}
host.send = send;

async function activate() {
  await send("input.setEnabled", { enabled: true });
  await send("lifecycle.resume");
  host.ready = true;
  document.documentElement.dataset.testkitHost = "ready";
}

function handlePortMessage(event) {
  const message = event.data;
  host.events.push(structuredClone(message));
  if (message?.type === "ready") {
    if (!exactKeys(message, ["type"]) || host.ready) {
      fail("received an invalid or duplicate ready event");
      return;
    }
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
    if (!exactKeys(message, ["type", "action"]) || !["pause", "resume"].includes(message.action)) {
      fail("received an invalid lifecycle request");
      return;
    }
    return;
  }
  if (message?.type === "settings.changeRequest") {
    if (!exactKeys(message, ["type", "change"])) {
      fail("received an invalid settings request");
      return;
    }
    if (host.settingsMode === "deferred") return;
    const next = {
      revision: context.settings.revision + 1,
      audio: { ...context.settings.audio, ...message.change.audio },
      motion: { ...context.settings.motion, ...message.change.motion },
    };
    context.settings = next;
    void send("settings.apply", { settings: next }).catch((error) => fail(error.message));
  }
}

function handlePortError() {
  fail("MessagePort decoding failed");
}

function connect() {
  if (!host.awaitingInit || host.port !== null || !host.readyForInit) {
    return Promise.reject(new Error("Neon testkit Host is not awaiting INIT."));
  }
  host.awaitingInit = false;
  const channel = new MessageChannel();
  host.port = channel.port1;
  host.port.addEventListener("message", handlePortMessage);
  host.port.addEventListener("messageerror", handlePortError);
  host.port.start();
  window.postMessage({ type: "gameyard:init", context }, location.origin, [channel.port2]);
  return Promise.resolve();
}
host.init = connect;

function handleWindowMessage(event) {
  if (event.data?.type !== "gameyard:ready-for-init") return;
  event.stopImmediatePropagation();
  if (
    event.source !== window ||
    event.origin !== location.origin ||
    event.ports.length !== 0 ||
    !exactKeys(event.data, ["type", "protocol", "gameId", "buildId"]) ||
    event.data.protocol !== 1 ||
    event.data.gameId !== "neon-overdrive" ||
    event.data.buildId !== buildId ||
    host.readyForInit !== null
  ) {
    fail("received an invalid ready-for-init message");
    return;
  }
  host.readyForInit = structuredClone(event.data);
  host.preInit = {
    debugPresent: "__NEON_DEBUG__" in globalThis,
  };
  host.awaitingInit = true;
  document.documentElement.dataset.testkitHost = "awaiting-init";
  if (host.autoInit) void connect().catch((error) => fail(error.message));
}

host.drainEvents = () => host.events.splice(0, host.events.length);
host.setSettingsMode = (mode) => {
  if (!["auto", "deferred"].includes(mode)) {
    throw new RangeError(`Unknown Neon testkit settings mode: ${String(mode)}`);
  }
  host.settingsMode = mode;
};
host.applySettings = async (settings) => {
  await send("settings.apply", { settings });
  context.settings = structuredClone(settings);
};
host.applyLocale = async (locale) => {
  context.locale = locale;
  await send("locale.apply", { locale });
};
host.dispose = async () => {
  await send("lifecycle.dispose");
  host.port.removeEventListener("message", handlePortMessage);
  host.port.removeEventListener("messageerror", handlePortError);
  host.port.close();
  host.port = null;
  host.ready = false;
  window.removeEventListener("message", handleWindowMessage);
};

window.addEventListener("message", handleWindowMessage);
