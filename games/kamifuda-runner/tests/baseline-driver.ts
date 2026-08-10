import type { Page } from "@playwright/test";

export type GameObservation = {
  mode: string;
  phase: string;
  difficulty: "normal" | "hard";
  score: number;
  runTime: number;
  player: null | {
    nx: number;
    count: number;
    power: number;
    tempo: number;
    shield: number;
    form: string;
    momentum: number;
    charms: string[];
  };
  stats: {
    damageLost: number;
    kills: number;
    manualStamps: number;
  };
};

export type ProfileFacts = {
  hardUnlocked: boolean;
  skins: string[];
  totalSeals: number;
  normal: { runs: number; clears: number; best: number };
  hard: { runs: number; clears: number; best: number };
};

export async function bootCandidate(page: Page) {
  await page.addInitScript(() => {
    window.requestAnimationFrame = () => 1;
    window.cancelAnimationFrame = () => undefined;
    window.localStorage.clear();
  });
  await page.goto("/", { waitUntil: "load" });
  await page.waitForFunction(() => window.__KAMIFUDA_HOST__?.ready === true);
  await page.waitForFunction(() => typeof window.__KAMIFUDA_DEBUG__?.snapshot === "function");
  await page.addStyleTag({
    content: "*,*::before,*::after{animation:none!important;transition:none!important;}",
  });
  await page.evaluate(() => {
    const debug = window.__KAMIFUDA_DEBUG__;
    debug.state.profile.settings.reducedMotion = true;
    debug.state.profile.settings.sound = false;
    debug.renderOnly();
  });
}

function observeInPage() {
  const source = window.__KAMIFUDA_DEBUG__.snapshot();
  return {
    mode: source.mode,
    phase: source.phase,
    difficulty: source.difficulty,
    score: Math.round(source.score),
    runTime: source.runTime,
    player: source.player
      ? {
          nx: source.player.nx,
          count: source.player.count,
          power: source.player.power,
          tempo: source.player.tempo,
          shield: source.player.shield,
          form: source.player.form,
          momentum: source.player.momentum,
          charms: [...source.player.charms],
        }
      : null,
    stats: {
      damageLost: source.stats.damageLost,
      kills: source.stats.kills,
      manualStamps: source.stats.manualStamps,
    },
  } satisfies GameObservation;
}

export async function observe(page: Page): Promise<GameObservation> {
  return page.evaluate(observeInPage);
}

export async function startDeterministic(page: Page, seed: number, difficulty: "normal" | "hard") {
  return page.evaluate(
    ({ runSeed, runDifficulty }) => {
      window.__KAMIFUDA_DEBUG__.start(runSeed, runDifficulty);
      return window.__KAMIFUDA_DEBUG__.step(1.6);
    },
    { runSeed: seed, runDifficulty: difficulty },
  );
}

export async function advance(page: Page, seconds: number) {
  await page.evaluate((duration) => window.__KAMIFUDA_DEBUG__.step(duration), seconds);
}

export async function chargeStamp(page: Page) {
  await page.evaluate(() => {
    const debug = window.__KAMIFUDA_DEBUG__;
    debug.state.player.momentum = 100;
    debug.step(1 / 120);
  });
}

export async function applyDamage(page: Page, amount: number) {
  return page.evaluate((damage) => {
    const debug = window.__KAMIFUDA_DEBUG__;
    debug.state.player.invuln = 0;
    debug.hurt(damage, "chaff", debug.state.player.nx, debug.state.player.y);
    debug.renderOnly();
    return {
      count: debug.state.player.count,
      shield: debug.state.player.shield,
      damageLost: debug.state.stats.damageLost,
    };
  }, amount);
}

export async function defeatOneEnemy(page: Page) {
  return page.evaluate(() => {
    const debug = window.__KAMIFUDA_DEBUG__;
    const before = debug.state.score;
    debug.spawnEnemy({
      kind: "chaff",
      nx: debug.state.player.nx,
      scale: 1,
      spawnY: debug.state.layout.playerY - 150,
    });
    const enemy = debug.state.enemies.at(-1);
    debug.damageEnemy(enemy, {
      damage: 100_000,
      form: "fan",
      nx: enemy.nx,
      y: enemy.y,
      stamp: false,
    });
    debug.renderOnly();
    return { scoreBefore: before, scoreAfter: debug.state.score, kills: debug.state.stats.kills };
  });
}

export async function showUpgrade(page: Page) {
  await page.evaluate(() => {
    const debug = window.__KAMIFUDA_DEBUG__;
    debug.state.act = 1;
    debug.state.mode = "transition";
    debug.state.phase = "bossDefeat";
    debug.state.phaseTimer = 1;
    debug.state.phaseDuration = 0;
    debug.step(1 / 120);
  });
}

export async function finishRun(page: Page, clear: boolean) {
  await page.evaluate((didClear) => {
    const debug = window.__KAMIFUDA_DEBUG__;
    debug.endRun(didClear, didClear ? null : "chaff");
    debug.step(didClear ? 1.05 : 0.9);
  }, clear);
}

export async function unlockHard(page: Page) {
  await page.evaluate(() => window.__KAMIFUDA_DEBUG__.unlockHard());
}

export async function profileFacts(page: Page): Promise<ProfileFacts> {
  return page.evaluate(() => {
    const profile = window.__KAMIFUDA_DEBUG__.state.profile;
    return {
      hardUnlocked: profile.unlocks.hard,
      skins: [...profile.unlocks.skins],
      totalSeals: profile.records.totalSeals,
      normal: {
        runs: profile.records.normal.runs,
        clears: profile.records.normal.clears,
        best: profile.records.normal.best,
      },
      hard: {
        runs: profile.records.hard.runs,
        clears: profile.records.hard.clears,
        best: profile.records.hard.best,
      },
    };
  });
}

declare global {
  interface Window {
    __KAMIFUDA_DEBUG__: any;
    __KAMIFUDA_HOST__: any;
  }
}
