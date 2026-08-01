type ScheduledTask = {
  readonly id: number;
  dueAt: number;
  readonly callback: () => void;
  readonly intervalMs: number | undefined;
};

function assertDelay(delayMs: number, allowZero: boolean): void {
  if (!Number.isSafeInteger(delayMs) || delayMs < 0 || (!allowZero && delayMs === 0)) {
    throw new Error(`Invalid deterministic clock delay: ${delayMs}`);
  }
}

export class DeterministicClock {
  #now = 0;
  #nextId = 1;
  readonly #tasks = new Map<number, ScheduledTask>();
  readonly #activeIntervals = new Set<number>();

  get now(): number {
    return this.#now;
  }

  get pendingCount(): number {
    return this.#tasks.size;
  }

  setTimeout(callback: () => void, delayMs: number): number {
    assertDelay(delayMs, true);
    return this.#schedule(callback, delayMs, undefined);
  }

  clearTimeout(id: number): void {
    this.#tasks.delete(id);
  }

  setInterval(callback: () => void, intervalMs: number): number {
    assertDelay(intervalMs, false);
    const id = this.#schedule(callback, intervalMs, intervalMs);
    this.#activeIntervals.add(id);
    return id;
  }

  clearInterval(id: number): void {
    this.#activeIntervals.delete(id);
    this.#tasks.delete(id);
  }

  requestAnimationFrame(callback: FrameRequestCallback): number {
    return this.setTimeout(() => callback(this.#now), 16);
  }

  cancelAnimationFrame(id: number): void {
    this.clearTimeout(id);
  }

  advanceBy(durationMs: number): void {
    assertDelay(durationMs, true);
    const target = this.#now + durationMs;
    let executed = 0;

    while (true) {
      const next = [...this.#tasks.values()]
        .filter((task) => task.dueAt <= target)
        .sort((left, right) => left.dueAt - right.dueAt || left.id - right.id)[0];
      if (next === undefined) {
        break;
      }
      if (executed >= 10_000) {
        throw new Error("Deterministic clock exceeded 10000 tasks in one advance");
      }
      executed += 1;
      this.#tasks.delete(next.id);
      this.#now = next.dueAt;
      next.callback();
      if (next.intervalMs !== undefined && this.#activeIntervals.has(next.id)) {
        next.dueAt += next.intervalMs;
        this.#tasks.set(next.id, next);
      }
    }

    this.#now = target;
  }

  #schedule(callback: () => void, delayMs: number, intervalMs: number | undefined): number {
    const id = this.#nextId;
    this.#nextId += 1;
    this.#tasks.set(id, {
      id,
      dueAt: this.#now + delayMs,
      callback,
      intervalMs,
    });
    return id;
  }
}

function invokeListener(
  listener: EventListenerOrEventListenerObject,
  event: MessageEvent<unknown>,
): void {
  if (typeof listener === "function") {
    listener(event);
  } else {
    listener.handleEvent(event);
  }
}

export class FakeMessagePort {
  readonly #clock: DeterministicClock;
  readonly #listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  #peer: FakeMessagePort | undefined;
  #closed = false;

  constructor(clock: DeterministicClock) {
    this.#clock = clock;
  }

  get closed(): boolean {
    return this.#closed;
  }

  get listenerCount(): number {
    return [...this.#listeners.values()].reduce((total, listeners) => total + listeners.size, 0);
  }

  connect(peer: FakeMessagePort): void {
    if (this.#peer !== undefined) {
      throw new Error("Fake message port is already connected");
    }
    this.#peer = peer;
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const listeners = this.#listeners.get(type) ?? new Set<EventListenerOrEventListenerObject>();
    listeners.add(listener);
    this.#listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    this.#listeners.get(type)?.delete(listener);
  }

  postMessage(data: unknown): void {
    if (this.#closed) {
      throw new Error("Fake message port is closed");
    }
    const peer = this.#peer;
    if (peer === undefined) {
      throw new Error("Fake message port is not connected");
    }
    this.#clock.setTimeout(() => peer.dispatch("message", data), 0);
  }

  postMessageError(data: unknown): void {
    if (this.#closed) {
      throw new Error("Fake message port is closed");
    }
    const peer = this.#peer;
    if (peer === undefined) {
      throw new Error("Fake message port is not connected");
    }
    this.#clock.setTimeout(() => peer.dispatch("messageerror", data), 0);
  }

  start(): void {}

  close(): void {
    this.#closed = true;
    this.#listeners.clear();
  }

  dispatch(type: "message" | "messageerror", data: unknown): void {
    if (this.#closed) {
      return;
    }
    const event = { data } as MessageEvent<unknown>;
    for (const listener of this.#listeners.get(type) ?? []) {
      invokeListener(listener, event);
    }
  }
}

export function createFakeMessagePortPair(
  clock: DeterministicClock,
): readonly [FakeMessagePort, FakeMessagePort] {
  const first = new FakeMessagePort(clock);
  const second = new FakeMessagePort(clock);
  first.connect(second);
  second.connect(first);
  return [first, second];
}

export class FakeMessageChannel {
  readonly port1: FakeMessagePort;
  readonly port2: FakeMessagePort;

  constructor(clock: DeterministicClock) {
    [this.port1, this.port2] = createFakeMessagePortPair(clock);
  }
}

export function createFakeMessageChannelConstructor(
  clock: DeterministicClock,
): new () => MessageChannel {
  return class {
    readonly port1: MessagePort;
    readonly port2: MessagePort;

    constructor() {
      const channel = new FakeMessageChannel(clock);
      this.port1 = channel.port1 as unknown as MessagePort;
      this.port2 = channel.port2 as unknown as MessagePort;
    }
  } as new () => MessageChannel;
}

export class FakeWindowContext {
  readonly location: { readonly origin: string };
  readonly #clock: DeterministicClock;
  readonly #listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();

  constructor(origin: string, clock: DeterministicClock) {
    this.location = { origin };
    this.#clock = clock;
  }

  get listenerCount(): number {
    return [...this.#listeners.values()].reduce((total, listeners) => total + listeners.size, 0);
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const listeners = this.#listeners.get(type) ?? new Set<EventListenerOrEventListenerObject>();
    listeners.add(listener);
    this.#listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    this.#listeners.get(type)?.delete(listener);
  }

  dispatch(type: string, event: Event): void {
    for (const listener of this.#listeners.get(type) ?? []) {
      if (typeof listener === "function") {
        listener(event);
      } else {
        listener.handleEvent(event);
      }
    }
  }

  receiveMessage(
    data: unknown,
    source: FakeWindowProxy,
    origin: string,
    ports: readonly MessagePort[],
  ): void {
    const event = { data, source, origin, ports } as unknown as MessageEvent<unknown>;
    this.dispatch("message", event);
  }

  setTimeout(callback: () => void, delayMs: number): number {
    return this.#clock.setTimeout(callback, delayMs);
  }

  clearTimeout(id: number): void {
    this.#clock.clearTimeout(id);
  }

  setInterval(callback: () => void, intervalMs: number): number {
    return this.#clock.setInterval(callback, intervalMs);
  }

  clearInterval(id: number): void {
    this.#clock.clearInterval(id);
  }

  requestAnimationFrame(callback: FrameRequestCallback): number {
    return this.#clock.requestAnimationFrame(callback);
  }

  cancelAnimationFrame(id: number): void {
    this.#clock.cancelAnimationFrame(id);
  }
}

export class FakeWindowProxy {
  readonly #receiver: FakeWindowContext;
  readonly #clock: DeterministicClock;
  #source: FakeWindowProxy | undefined;

  constructor(receiver: FakeWindowContext, clock: DeterministicClock) {
    this.#receiver = receiver;
    this.#clock = clock;
  }

  setSource(source: FakeWindowProxy): void {
    if (this.#source !== undefined) {
      throw new Error("Fake window proxy source is already assigned");
    }
    this.#source = source;
  }

  postMessage(data: unknown, targetOrigin: string, transfer: Transferable[] = []): void {
    const source = this.#source;
    if (source === undefined) {
      throw new Error("Fake window proxy source is not assigned");
    }
    if (targetOrigin !== this.#receiver.location.origin) {
      return;
    }
    const ports = transfer.filter((item): item is MessagePort => "postMessage" in item);
    this.#clock.setTimeout(
      () => this.#receiver.receiveMessage(data, source, source.origin, ports),
      0,
    );
  }

  get origin(): string {
    return this.#sourceReceiverOrigin();
  }

  #sourceReceiverOrigin(): string {
    return this.#receiver.location.origin;
  }
}

export interface FakeWindowPair {
  readonly clock: DeterministicClock;
  readonly host: FakeWindowContext;
  readonly guest: FakeWindowContext;
  readonly hostProxy: FakeWindowProxy;
  readonly guestProxy: FakeWindowProxy;
}

export function createFakeWindowPair(origin: string): FakeWindowPair {
  const clock = new DeterministicClock();
  const host = new FakeWindowContext(origin, clock);
  const guest = new FakeWindowContext(origin, clock);
  const hostProxy = new FakeWindowProxy(host, clock);
  const guestProxy = new FakeWindowProxy(guest, clock);
  hostProxy.setSource(guestProxy);
  guestProxy.setSource(hostProxy);
  return { clock, host, guest, hostProxy, guestProxy };
}

export interface ResourceSnapshot {
  readonly listeners: number;
  readonly scheduledTasks: number;
  readonly openPorts: number;
}

export function snapshotResources(
  context: FakeWindowContext,
  clock: DeterministicClock,
  ports: readonly FakeMessagePort[],
): ResourceSnapshot {
  return {
    listeners: context.listenerCount + ports.reduce((total, port) => total + port.listenerCount, 0),
    scheduledTasks: clock.pendingCount,
    openPorts: ports.filter((port) => !port.closed).length,
  };
}
