import {
  BuildIdSchema,
  GameIdSchema,
  GameVersionSchema,
  type BuildId,
  type GameId,
  type GameVersion,
} from "@gameyard/game-contract";

export const LAB_PRESET_SCHEMA_VERSION = 1 as const;
export const LAB_PRESET_MAX_BYTES = 16 * 1024;

export type LabParameterValue = string | number | boolean;

export type LabParameterSchema =
  | { readonly type: "boolean" }
  | {
      readonly type: "number";
      readonly integer: boolean;
      readonly minimum: number;
      readonly maximum: number;
    }
  | { readonly type: "enum"; readonly values: readonly string[] };

export interface LabSceneDefinition {
  readonly gameId: GameId;
  readonly gameVersion: GameVersion;
  readonly buildId: BuildId;
  readonly sceneId: string;
  readonly sceneVersion: number;
  readonly parameters: Readonly<Record<string, LabParameterSchema>>;
}

export interface LabPreset {
  readonly schemaVersion: typeof LAB_PRESET_SCHEMA_VERSION;
  readonly gameId: GameId;
  readonly gameVersion: GameVersion;
  readonly buildId: BuildId;
  readonly sceneId: string;
  readonly sceneVersion: number;
  readonly seed: number;
  readonly parameters: Readonly<Record<string, LabParameterValue>>;
}

export class LabPresetError extends Error {
  override readonly name = "LabPresetError";
}

const SCENE_ID_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const PARAMETER_ID_PATTERN = /^[a-z][A-Za-z0-9]*$/;
const LAB_PRESET_KEYS = [
  "schemaVersion",
  "gameId",
  "gameVersion",
  "buildId",
  "sceneId",
  "sceneVersion",
  "seed",
  "parameters",
] as const;

function asStrictObject(value: unknown, location: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new LabPresetError(`${location} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
  location: string,
): void {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new LabPresetError(`${location} must contain exactly: ${expectedKeys.join(", ")}`);
  }
}

function assertPositiveSafeInteger(value: unknown, location: string): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new LabPresetError(`${location} must be a positive safe integer`);
  }
}

function assertUint32(value: unknown, location: string): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 0xffff_ffff) {
    throw new LabPresetError(`${location} must be an unsigned 32-bit integer`);
  }
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function validateParameterSchema(name: string, value: LabParameterSchema): void {
  if (!PARAMETER_ID_PATTERN.test(name)) {
    throw new LabPresetError(`Lab parameter id is invalid: ${name}`);
  }
  const schema = asStrictObject(value, `Lab parameter ${name}`);
  if (schema.type === "boolean") {
    assertExactKeys(schema, ["type"], `Lab parameter ${name}`);
    return;
  }
  if (schema.type === "number") {
    assertExactKeys(schema, ["type", "integer", "minimum", "maximum"], `Lab parameter ${name}`);
    if (
      typeof schema.integer !== "boolean" ||
      typeof schema.minimum !== "number" ||
      !Number.isFinite(schema.minimum) ||
      typeof schema.maximum !== "number" ||
      !Number.isFinite(schema.maximum) ||
      schema.minimum > schema.maximum
    ) {
      throw new LabPresetError(`Lab parameter ${name} has an invalid number schema`);
    }
    return;
  }
  if (schema.type === "enum") {
    assertExactKeys(schema, ["type", "values"], `Lab parameter ${name}`);
    if (
      !Array.isArray(schema.values) ||
      schema.values.length === 0 ||
      schema.values.some((entry) => typeof entry !== "string" || entry.length === 0) ||
      new Set(schema.values).size !== schema.values.length
    ) {
      throw new LabPresetError(`Lab parameter ${name} enum values must be unique strings`);
    }
    return;
  }
  throw new LabPresetError(`Lab parameter ${name} has an unknown schema type`);
}

function validateSceneDefinition(definition: LabSceneDefinition): LabSceneDefinition {
  assertExactKeys(
    asStrictObject(definition, "Lab scene"),
    ["gameId", "gameVersion", "buildId", "sceneId", "sceneVersion", "parameters"],
    "Lab scene",
  );
  const gameId = GameIdSchema.safeParse(definition.gameId);
  const gameVersion = GameVersionSchema.safeParse(definition.gameVersion);
  const buildId = BuildIdSchema.safeParse(definition.buildId);
  if (!gameId.success || !gameVersion.success || !buildId.success) {
    throw new LabPresetError("Lab scene identity is invalid");
  }
  if (!SCENE_ID_PATTERN.test(definition.sceneId) || definition.sceneId.length > 64) {
    throw new LabPresetError(`Lab scene id is invalid: ${definition.sceneId}`);
  }
  assertPositiveSafeInteger(definition.sceneVersion, `Lab scene ${definition.sceneId} version`);
  const parameters = asStrictObject(
    definition.parameters,
    `Lab scene ${definition.sceneId} parameters`,
  );
  for (const [name, schema] of Object.entries(parameters)) {
    validateParameterSchema(name, schema as LabParameterSchema);
  }
  return definition;
}

function validateParameterValue(
  sceneId: string,
  name: string,
  value: unknown,
  schema: LabParameterSchema,
): asserts value is LabParameterValue {
  if (schema.type === "boolean") {
    if (typeof value !== "boolean") {
      throw new LabPresetError(`${sceneId}.${name} must be a boolean`);
    }
    return;
  }
  if (schema.type === "enum") {
    if (typeof value !== "string" || !schema.values.includes(value)) {
      throw new LabPresetError(`${sceneId}.${name} must be one of: ${schema.values.join(", ")}`);
    }
    return;
  }
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    (schema.integer && !Number.isInteger(value)) ||
    value < schema.minimum ||
    value > schema.maximum
  ) {
    throw new LabPresetError(
      `${sceneId}.${name} must be ${schema.integer ? "an integer" : "a number"} between ${schema.minimum} and ${schema.maximum}`,
    );
  }
}

export class LabSceneRegistry {
  readonly #scenes = new Map<string, LabSceneDefinition>();

  constructor(definitions: readonly LabSceneDefinition[]) {
    if (definitions.length === 0) {
      throw new LabPresetError("Lab scene registry requires at least one scene");
    }
    for (const definition of definitions) {
      const validated = validateSceneDefinition(definition);
      if (this.#scenes.has(validated.sceneId)) {
        throw new LabPresetError(`Duplicate Lab scene id: ${validated.sceneId}`);
      }
      this.#scenes.set(validated.sceneId, validated);
    }
  }

  list(): readonly LabSceneDefinition[] {
    return [...this.#scenes.values()];
  }

  createPreset(
    sceneId: string,
    seed: number,
    parameters: Readonly<Record<string, unknown>>,
  ): LabPreset {
    const scene = this.#requireScene(sceneId);
    return this.#parseForScene(
      {
        schemaVersion: LAB_PRESET_SCHEMA_VERSION,
        gameId: scene.gameId,
        gameVersion: scene.gameVersion,
        buildId: scene.buildId,
        sceneId: scene.sceneId,
        sceneVersion: scene.sceneVersion,
        seed,
        parameters,
      },
      scene,
    );
  }

  parsePreset(value: unknown): LabPreset {
    const preset = asStrictObject(value, "Lab preset");
    assertExactKeys(preset, LAB_PRESET_KEYS, "Lab preset");
    if (preset.schemaVersion !== LAB_PRESET_SCHEMA_VERSION) {
      throw new LabPresetError(`Lab preset schemaVersion must be ${LAB_PRESET_SCHEMA_VERSION}`);
    }
    if (typeof preset.sceneId !== "string") {
      throw new LabPresetError("Lab preset sceneId must be a string");
    }
    return this.#parseForScene(preset, this.#requireScene(preset.sceneId));
  }

  parseJson(json: string): LabPreset {
    if (byteLength(json) > LAB_PRESET_MAX_BYTES) {
      throw new LabPresetError(`Lab preset exceeds ${LAB_PRESET_MAX_BYTES} bytes`);
    }
    let value: unknown;
    try {
      value = JSON.parse(json);
    } catch {
      throw new LabPresetError("Lab preset is not valid JSON");
    }
    return this.parsePreset(value);
  }

  serialize(preset: LabPreset): string {
    const validated = this.parsePreset(preset);
    const json = `${JSON.stringify(validated, null, 2)}\n`;
    if (byteLength(json) > LAB_PRESET_MAX_BYTES) {
      throw new LabPresetError(`Lab preset exceeds ${LAB_PRESET_MAX_BYTES} bytes`);
    }
    return json;
  }

  #requireScene(sceneId: string): LabSceneDefinition {
    const scene = this.#scenes.get(sceneId);
    if (!scene) throw new LabPresetError(`Unknown Lab scene: ${sceneId}`);
    return scene;
  }

  #parseForScene(value: Record<string, unknown>, scene: LabSceneDefinition): LabPreset {
    if (
      value.gameId !== scene.gameId ||
      value.gameVersion !== scene.gameVersion ||
      value.buildId !== scene.buildId ||
      value.sceneId !== scene.sceneId ||
      value.sceneVersion !== scene.sceneVersion
    ) {
      throw new LabPresetError(`Lab preset identity does not exactly match scene ${scene.sceneId}`);
    }
    assertUint32(value.seed, "Lab preset seed");
    const parameters = asStrictObject(value.parameters, "Lab preset parameters");
    assertExactKeys(parameters, Object.keys(scene.parameters), "Lab preset parameters");
    const validatedParameters: Record<string, LabParameterValue> = {};
    for (const [name, schema] of Object.entries(scene.parameters)) {
      const parameter = parameters[name];
      validateParameterValue(scene.sceneId, name, parameter, schema);
      validatedParameters[name] = parameter;
    }
    return {
      schemaVersion: LAB_PRESET_SCHEMA_VERSION,
      gameId: scene.gameId,
      gameVersion: scene.gameVersion,
      buildId: scene.buildId,
      sceneId: scene.sceneId,
      sceneVersion: scene.sceneVersion,
      seed: value.seed,
      parameters: validatedParameters,
    };
  }
}

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
