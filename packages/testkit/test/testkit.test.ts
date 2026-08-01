import { describe, expect, it } from "vite-plus/test";

import {
  DeterministicClock,
  createFakeMessagePortPair,
  createFakeWindowPair,
  snapshotResources,
} from "../src/index";

describe("DeterministicClock", () => {
  it("runs timers, intervals, and animation frames in stable order", () => {
    const clock = new DeterministicClock();
    const calls: string[] = [];
    const interval = clock.setInterval(() => calls.push(`interval:${clock.now}`), 5);
    clock.setTimeout(() => calls.push(`timeout:${clock.now}`), 10);
    clock.requestAnimationFrame((now) => calls.push(`raf:${now}`));

    clock.advanceBy(16);
    clock.clearInterval(interval);

    expect(calls).toEqual(["interval:5", "interval:10", "timeout:10", "interval:15", "raf:16"]);
    expect(clock.pendingCount).toBe(0);
  });
});

describe("transport fakes", () => {
  it("delivers port messages through the explicit clock and reports resources", () => {
    const pair = createFakeWindowPair("https://gameyard.test");
    const [hostPort, guestPort] = createFakeMessagePortPair(pair.clock);
    const messages: unknown[] = [];
    guestPort.addEventListener("message", ((event: MessageEvent<unknown>) => {
      messages.push(event.data);
    }) as EventListener);

    hostPort.postMessage({ type: "test" });
    expect(messages).toEqual([]);
    pair.clock.advanceBy(0);
    expect(messages).toEqual([{ type: "test" }]);
    expect(snapshotResources(pair.guest, pair.clock, [hostPort, guestPort])).toEqual({
      listeners: 1,
      scheduledTasks: 0,
      openPorts: 2,
    });
  });

  it("preserves source, origin, and transferred ports for window messages", () => {
    const pair = createFakeWindowPair("https://gameyard.test");
    const [, guestPort] = createFakeMessagePortPair(pair.clock);
    const received: MessageEvent<unknown>[] = [];
    pair.guest.addEventListener("message", ((event: MessageEvent<unknown>) => {
      received.push(event);
    }) as EventListener);

    pair.guestProxy.postMessage({ type: "init" }, pair.guest.location.origin, [
      guestPort as unknown as MessagePort,
    ]);
    pair.clock.advanceBy(0);

    expect(received).toHaveLength(1);
    expect(received[0]?.source).toBe(pair.hostProxy);
    expect(received[0]?.origin).toBe(pair.host.location.origin);
    expect(received[0]?.ports).toEqual([guestPort]);
  });
});
