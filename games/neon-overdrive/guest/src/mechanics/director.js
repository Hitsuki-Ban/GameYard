import { COLORS, FIELD } from "./catalog.js";

export const STORY_BOSS_AT = Object.freeze([52, 60, 70]);
export const RUSH_BOSS_INTERVAL_SECONDS = 45;
export const RUSH_BOSS_COUNT = 3;
export const ENDLESS_SECTOR_SECONDS = 70;

const MODES = new Set(["story", "rush", "endless"]);

function enemy(time, enemyType, options) {
  return Object.freeze({ time, kind: "enemy", enemyType, options: Object.freeze(options) });
}

function repeat(events, start, count, interval, factory) {
  for (let index = 0; index < count; index += 1) {
    events.push(factory(start + index * interval, index));
  }
}

export function buildStorySchedule(stage) {
  if (!Number.isSafeInteger(stage) || stage < 0 || stage > 2) {
    throw new RangeError("Story stage must be 0, 1, or 2.");
  }
  const events = [];
  const width = FIELD.width;
  if (stage === 0) {
    repeat(events, 1.2, 6, 0.42, (time, index) =>
      enemy(time, "scout", {
        x: index % 2 ? 70 : width - 70,
        y: -30,
        originX: index % 2 ? 70 : width - 70,
        amp: 64,
        phase: index * 0.7,
        speed: 105,
        color: index % 2 ? COLORS.cyan : COLORS.pink,
      }),
    );
    repeat(events, 5.2, 8, 0.28, (time, index) =>
      enemy(time, "scout", {
        x: 54 + index * 60,
        y: -25 - (index % 2) * 20,
        originX: 54 + index * 60,
        amp: 24,
        phase: index,
        speed: 125,
        fireDelay: 0.7 + index * 0.08,
      }),
    );
    repeat(events, 9.2, 3, 1.2, (time, index) =>
      enemy(time, "spinner", {
        x: 135 + index * 135,
        y: -40,
        targetY: 150 + (index % 2) * 55,
        phase: index * 1.7,
      }),
    );
    repeat(events, 14, 10, 0.33, (time, index) =>
      enemy(time, "diver", {
        x: index % 2 ? -35 : width + 35,
        y: 90 + (index % 5) * 72,
        side: index % 2 ? 1 : -1,
        phase: index,
      }),
    );
    events.push(enemy(19, "carrier", { x: width / 2, y: -70, targetY: 180 }));
    repeat(events, 20.3, 8, 0.46, (time, index) =>
      enemy(time, "scout", {
        x: 45 + (index % 4) * 150,
        y: -30 - Math.floor(index / 4) * 55,
        originX: 45 + (index % 4) * 150,
        amp: 50,
        phase: index * 0.6,
        speed: 115,
      }),
    );
    repeat(events, 27, 4, 1, (time, index) =>
      enemy(time, "turret", {
        x: index % 2 ? 115 : width - 115,
        y: -45,
        targetY: 130 + (index % 2) * 170,
        phase: index,
      }),
    );
    repeat(events, 32.3, 12, 0.24, (time, index) =>
      enemy(time, "scout", {
        x: index % 2 ? 35 : width - 35,
        y: -20 - (index % 3) * 20,
        originX: index % 2 ? 35 : width - 35,
        amp: 155,
        phase: index * 0.32,
        speed: 150,
      }),
    );
    events.push(enemy(37, "elite", { x: width / 2, y: -70, targetY: 210, phase: 0 }));
    repeat(events, 39, 8, 0.5, (time, index) =>
      enemy(time, "diver", {
        x: index % 2 ? -30 : width + 30,
        y: 80 + (index % 4) * 115,
        side: index % 2 ? 1 : -1,
        phase: index * 0.7,
      }),
    );
    repeat(events, 45, 3, 0.95, (time, index) =>
      enemy(time, "spinner", {
        x: 105 + index * 165,
        y: -42,
        targetY: 125 + index * 62,
        phase: index * 2,
      }),
    );
  } else if (stage === 1) {
    repeat(events, 1, 12, 0.28, (time, index) =>
      enemy(time, "scout", {
        x: 30 + (index % 6) * 96,
        y: -30 - Math.floor(index / 6) * 70,
        originX: 30 + (index % 6) * 96,
        amp: 36,
        phase: index * 0.9,
        speed: 142,
      }),
    );
    repeat(events, 5.3, 4, 0.92, (time, index) =>
      enemy(time, "orbiter", {
        x: index % 2 ? -35 : width + 35,
        y: 160 + (index % 2) * 120,
        side: index % 2 ? 1 : -1,
        phase: index * 1.4,
      }),
    );
    repeat(events, 10, 6, 0.72, (time, index) =>
      enemy(time, "turret", {
        x: 75 + (index % 3) * 195,
        y: -50 - Math.floor(index / 3) * 80,
        targetY: 110 + (index % 3) * 90,
        phase: index * 0.8,
      }),
    );
    events.push(enemy(16, "carrier", { x: 145, y: -70, targetY: 185, phase: 1 }));
    events.push(enemy(17.1, "carrier", { x: width - 145, y: -70, targetY: 240, phase: 2 }));
    repeat(events, 21.5, 14, 0.25, (time, index) =>
      enemy(time, "diver", {
        x: index % 2 ? -35 : width + 35,
        y: 70 + (index % 7) * 78,
        side: index % 2 ? 1 : -1,
        phase: index * 0.45,
        mirror: true,
      }),
    );
    repeat(events, 27.5, 5, 0.85, (time, index) =>
      enemy(time, "spinner", {
        x: 75 + index * 97,
        y: -45,
        targetY: 125 + Math.sin(index) * 55,
        phase: index * 1.1,
        splitShots: true,
      }),
    );
    events.push(enemy(34, "elite", { x: 150, y: -65, targetY: 180, phase: 2 }));
    events.push(enemy(34.7, "elite", { x: width - 150, y: -65, targetY: 245, phase: 3 }));
    repeat(events, 39.5, 16, 0.26, (time, index) =>
      enemy(time, "scout", {
        x: 40 + (index % 8) * 66,
        y: -25 - Math.floor(index / 8) * 55,
        originX: 40 + (index % 8) * 66,
        amp: 92,
        phase: index * 0.5,
        speed: 165,
        revenge: true,
      }),
    );
    repeat(events, 45.5, 6, 0.8, (time, index) =>
      enemy(time, index % 2 ? "turret" : "orbiter", {
        x: index % 2 ? 90 : width - 90,
        y: -45,
        targetY: 120 + (index % 3) * 135,
        side: index % 2 ? 1 : -1,
        phase: index,
      }),
    );
    events.push(
      enemy(52, "carrier", {
        x: width / 2,
        y: -80,
        targetY: 200,
        phase: 4,
        armored: true,
      }),
    );
  } else {
    repeat(events, 0.9, 18, 0.22, (time, index) =>
      enemy(time, "scout", {
        x: 25 + (index % 9) * 61,
        y: -25 - Math.floor(index / 9) * 60,
        originX: 25 + (index % 9) * 61,
        amp: 82,
        phase: index * 0.52,
        speed: 175,
        revenge: true,
      }),
    );
    repeat(events, 6.2, 8, 0.64, (time, index) =>
      enemy(time, "orbiter", {
        x: index % 2 ? -40 : width + 40,
        y: 95 + (index % 4) * 120,
        side: index % 2 ? 1 : -1,
        phase: index * 0.9,
        revenge: true,
      }),
    );
    repeat(events, 12, 6, 0.76, (time, index) =>
      enemy(time, "spinner", {
        x: 55 + index * 86,
        y: -45,
        targetY: 100 + (index % 3) * 90,
        phase: index * 1.6,
        splitShots: true,
        revenge: true,
      }),
    );
    events.push(
      enemy(18, "elite", {
        x: width / 2,
        y: -80,
        targetY: 170,
        phase: 5,
        armored: true,
      }),
    );
    repeat(events, 20, 16, 0.25, (time, index) =>
      enemy(time, "diver", {
        x: index % 2 ? -38 : width + 38,
        y: 60 + (index % 8) * 82,
        side: index % 2 ? 1 : -1,
        phase: index * 0.61,
        mirror: true,
        revenge: true,
      }),
    );
    events.push(enemy(27.5, "carrier", { x: 130, y: -80, targetY: 175, phase: 5, armored: true }));
    events.push(
      enemy(28.2, "carrier", {
        x: width - 130,
        y: -80,
        targetY: 240,
        phase: 6,
        armored: true,
      }),
    );
    repeat(events, 34, 10, 0.48, (time, index) =>
      enemy(time, "turret", {
        x: index % 2 ? 78 : width - 78,
        y: -50 - (index % 3) * 25,
        targetY: 90 + (index % 5) * 128,
        phase: index * 0.77,
        revenge: true,
      }),
    );
    repeat(events, 42, 20, 0.2, (time, index) =>
      enemy(time, "scout", {
        x: index % 2 ? 42 : width - 42,
        y: -20 - (index % 4) * 16,
        originX: index % 2 ? 42 : width - 42,
        amp: 190,
        phase: index * 0.29,
        speed: 190,
        revenge: true,
      }),
    );
    events.push(enemy(48, "elite", { x: 110, y: -70, targetY: 155, phase: 7, armored: true }));
    events.push(
      enemy(48.6, "elite", {
        x: width - 110,
        y: -70,
        targetY: 240,
        phase: 8,
        armored: true,
      }),
    );
    repeat(events, 54, 10, 0.57, (time, index) =>
      enemy(time, index % 3 === 0 ? "spinner" : "diver", {
        x: index % 2 ? -35 : width + 35,
        y: 75 + (index % 5) * 120,
        side: index % 2 ? 1 : -1,
        phase: index,
        splitShots: true,
        revenge: true,
      }),
    );
    events.push(
      enemy(62, "carrier", {
        x: width / 2,
        y: -90,
        targetY: 185,
        phase: 9,
        armored: true,
        finalEscort: true,
      }),
    );
  }
  return Object.freeze(events.sort((left, right) => left.time - right.time));
}

export function createDirectorState(stage) {
  return {
    time: 0,
    storyEventIndex: 0,
    storyBossSpawned: false,
    storyBossAt: STORY_BOSS_AT[stage],
    storySchedule: buildStorySchedule(stage),
    waveClock: 0,
    waveNumber: 0,
    rushBossesSpawned: 0,
    endlessBossesSpawned: 0,
  };
}

export function resetStoryDirector(state, stage) {
  assertState(state);
  state.time = 0;
  state.storyEventIndex = 0;
  state.storyBossSpawned = false;
  state.storyBossAt = STORY_BOSS_AT[stage];
  state.storySchedule = buildStorySchedule(stage);
  state.waveClock = 0;
}

function assertState(state) {
  if (state === null || typeof state !== "object" || Array.isArray(state)) {
    throw new TypeError("Director state must be an object.");
  }
}

function assertPorts(ports) {
  for (const name of ["spawnEnemy", "clearEnemies", "spawnBoss"]) {
    if (typeof ports?.[name] !== "function")
      throw new TypeError(`Director port ${name} is required.`);
  }
}

function assertRng(rng) {
  if (typeof rng?.integer !== "function" || typeof rng?.range !== "function") {
    throw new TypeError("Director requires integer and range RNG ports.");
  }
}

export function stepDirector({
  state,
  dt,
  mode,
  stageIndex,
  modeTimer,
  sequenceLock,
  bossActive,
  rng,
  ports,
}) {
  assertState(state);
  assertPorts(ports);
  assertRng(rng);
  if (!Number.isFinite(dt) || dt <= 0) throw new RangeError("Director dt must be positive.");
  if (!MODES.has(mode)) throw new RangeError(`Unknown director mode: ${mode}`);
  if (!Number.isSafeInteger(stageIndex) || stageIndex < 0 || stageIndex > 2) {
    throw new RangeError("Director stageIndex must be 0, 1, or 2.");
  }
  if (!Number.isFinite(modeTimer)) throw new TypeError("Director modeTimer must be finite.");
  if (typeof sequenceLock !== "boolean" || typeof bossActive !== "boolean") {
    throw new TypeError("Director lifecycle flags must be boolean.");
  }
  if (sequenceLock || bossActive) return;

  state.time += dt;
  if (mode === "story") {
    while (
      state.storyEventIndex < state.storySchedule.length &&
      state.storySchedule[state.storyEventIndex].time <= state.time
    ) {
      const event = state.storySchedule[state.storyEventIndex];
      ports.spawnEnemy(event.enemyType, { ...event.options });
      state.storyEventIndex += 1;
    }
    if (!state.storyBossSpawned && state.time >= state.storyBossAt) {
      state.storyBossSpawned = true;
      ports.spawnBoss(stageIndex, false);
    }
    return;
  }

  state.waveClock -= dt;
  if (mode === "rush") {
    if (state.waveClock <= 0) {
      state.waveNumber += 1;
      const wave = state.waveNumber;
      const typeCycle = ["scout", "diver", "spinner", "turret", "orbiter", "elite"];
      const type = typeCycle[wave % typeCycle.length];
      const count = type === "elite" ? 1 : type === "turret" || type === "spinner" ? 3 : 7;
      for (let index = 0; index < count; index += 1) {
        ports.spawnEnemy(type, {
          x:
            count === 1
              ? FIELD.width / 2
              : 45 + (index * (FIELD.width - 90)) / Math.max(1, count - 1),
          y: -45 - (index % 3) * 30,
          originX: 45 + (index * (FIELD.width - 90)) / Math.max(1, count - 1),
          targetY: 110 + (index % 3) * 95,
          side: index % 2 ? 1 : -1,
          phase: wave * 0.8 + index,
          speed: 135 + wave * 2.2,
          revenge: wave > 8,
        });
      }
      state.waveClock = Math.max(1.55, 3.4 - wave * 0.035);
    }
    const marker = Math.floor((180 - modeTimer) / RUSH_BOSS_INTERVAL_SECONDS);
    if (marker > state.rushBossesSpawned && marker <= RUSH_BOSS_COUNT) {
      state.rushBossesSpawned = marker;
      ports.clearEnemies(false);
      ports.spawnBoss((marker - 1) % 3, true);
    }
    return;
  }

  if (state.waveClock <= 0) {
    state.waveNumber += 1;
    const sector = Math.floor(state.time / ENDLESS_SECTOR_SECONDS);
    const type = ["scout", "diver", "spinner", "turret", "orbiter", "carrier"][rng.integer(0, 5)];
    const count =
      type === "carrier"
        ? 1
        : type === "spinner" || type === "turret"
          ? 3 + Math.min(2, sector)
          : 6 + Math.min(8, sector * 2);
    for (let index = 0; index < count; index += 1) {
      ports.spawnEnemy(type, {
        x:
          count === 1
            ? rng.range(110, FIELD.width - 110)
            : 35 + (index * (FIELD.width - 70)) / Math.max(1, count - 1),
        y: -50 - (index % 4) * 28,
        originX: 35 + (index * (FIELD.width - 70)) / Math.max(1, count - 1),
        targetY: 100 + (index % 4) * 105,
        side: index % 2 ? 1 : -1,
        phase: state.waveNumber * 0.73 + index,
        speed: 140 + sector * 12,
        revenge: sector >= 1,
        armored: sector >= 3,
      });
    }
    state.waveClock = Math.max(1.25, 3.1 - sector * 0.18);
  }
  const sector = Math.floor(state.time / ENDLESS_SECTOR_SECONDS);
  if (sector > state.endlessBossesSpawned) {
    state.endlessBossesSpawned = sector;
    ports.clearEnemies(false);
    ports.spawnBoss(sector % 3, true);
  }
}
