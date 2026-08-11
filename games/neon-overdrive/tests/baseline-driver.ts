import type { Page } from "@playwright/test";

export const BASELINE_SEED = 0x4e454f4e;
export const FIXED_STEP = 1 / 60;

export type AudioEvent = {
  name: string;
  runTime: number;
  state: string;
};

export type GameObservation = {
  state: string;
  mode: string;
  stageIndex: number;
  runTime: number;
  modeTimer: number;
  score: number;
  displayScore: number;
  chain: number;
  drive: number;
  rank: number;
  shield: number;
  reboots: number;
  rushBossesSpawned: number;
  endlessBossesSpawned: number;
  player: {
    x: number;
    y: number;
    focus: boolean;
    power: number;
  };
  stats: {
    kills: number;
    drives: number;
    bosses: number;
    maxChain: number;
  };
  entities: {
    enemies: number;
    enemyBullets: number;
    playerBullets: number;
    particles: number;
    pickups: number;
    lasers: number;
  };
};

export async function bootSource(page: Page, options: { clearStorage?: boolean } = {}) {
  const clearStorage = options.clearStorage === true;
  await page.addInitScript(
    ({ seed, shouldClearStorage }) => {
      if (
        shouldClearStorage &&
        window.sessionStorage.getItem("neon-baseline-storage-cleared") !== "true"
      ) {
        window.localStorage.clear();
        window.sessionStorage.setItem("neon-baseline-storage-cleared", "true");
      }

      let randomState = seed >>> 0;
      Math.random = () => {
        randomState = (randomState + 0x6d2b79f5) >>> 0;
        let value = randomState;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
      };

      window.requestAnimationFrame = () => 1;
      window.cancelAnimationFrame = () => undefined;

      const buttons = Array.from({ length: 16 }, () => ({
        pressed: false,
        touched: false,
        value: 0,
      }));
      const pad = {
        axes: [0, 0, 0, 0],
        buttons,
        connected: true,
        id: "GameYard deterministic baseline pad",
        index: 0,
        mapping: "standard",
        timestamp: 0,
        vibrationActuator: null,
      };
      let connected = false;
      Object.defineProperty(navigator, "getGamepads", {
        configurable: true,
        value: () => (connected ? [pad] : []),
      });
      window.__NEON_BASELINE_INPUT__ = {
        setGamepad(next) {
          connected = next.connected;
          pad.axes[0] = next.x;
          pad.axes[1] = next.y;
          for (const button of buttons) {
            button.pressed = false;
            button.touched = false;
            button.value = 0;
          }
          const pressed = [
            [0, next.action],
            [4, next.focus],
            [9, next.pause],
          ] as const;
          for (const [index, isPressed] of pressed) {
            buttons[index].pressed = isPressed;
            buttons[index].touched = isPressed;
            buttons[index].value = isPressed ? 1 : 0;
          }
          pad.timestamp += 1;
        },
      };
    },
    { seed: BASELINE_SEED, shouldClearStorage: clearStorage },
  );

  await page.goto("/", { waitUntil: "load" });
  await page.waitForFunction(() => Boolean(window.__NEON_OVERDRIVE__));
  await page.addStyleTag({
    content: "*,*::before,*::after{animation:none!important;transition:none!important;}",
  });
  await page.evaluate(() => {
    const game = window.__NEON_OVERDRIVE__;
    const audioEvents: AudioEvent[] = [];
    game.audio.unlock = async () => {
      game.audio.started = true;
    };
    game.audio.sfx = (name: string) => {
      audioEvents.push({ name, runTime: game.runTime, state: game.state });
    };
    game.save.settings.master = 0;
    game.save.settings.music = 0;
    game.save.settings.fxDensity = 1;
    game.save.settings.screenShake = false;
    game.save.settings.flashes = false;
    game.canvas.setPointerCapture = () => undefined;
    game.canvas.releasePointerCapture = () => undefined;
    window.__NEON_BASELINE_AUDIO__ = audioEvents;
    game.render();
  });
}

export async function step(page: Page, seconds: number) {
  await page.evaluate(
    ({ duration, fixedStep }) => {
      const game = window.__NEON_OVERDRIVE__;
      const count = Math.ceil(duration / fixedStep);
      for (let index = 0; index < count; index += 1) game.update(fixedStep);
      game.render();
    },
    { duration: seconds, fixedStep: FIXED_STEP },
  );
}

export async function observe(page: Page): Promise<GameObservation> {
  return page.evaluate(() => {
    const game = window.__NEON_OVERDRIVE__;
    return {
      state: game.state,
      mode: game.mode,
      stageIndex: game.stageIndex,
      runTime: game.runTime,
      modeTimer: game.modeTimer,
      score: Math.floor(game.score),
      displayScore: Math.floor(game.displayScore),
      chain: game.chain,
      drive: game.drive,
      rank: game.rank,
      shield: game.shield,
      reboots: game.reboots,
      rushBossesSpawned: game.rushBossesSpawned,
      endlessBossesSpawned: game.endlessBossesSpawned,
      player: {
        x: game.player.x,
        y: game.player.y,
        focus: game.player.focus,
        power: game.player.power,
      },
      stats: {
        kills: game.stats.kills,
        drives: game.stats.drives,
        bosses: game.stats.bosses,
        maxChain: game.stats.maxChain,
      },
      entities: {
        enemies: game.enemies.length,
        enemyBullets: game.enemyBullets.length,
        playerBullets: game.playerBullets.length,
        particles: game.particles.length,
        pickups: game.pickups.length,
        lasers: game.lasers.length,
      },
    };
  });
}

export async function resetPlayer(page: Page) {
  await page.evaluate(() => {
    const game = window.__NEON_OVERDRIVE__;
    game.player.x = 270;
    game.player.y = 787.2;
    game.player.prevX = game.player.x;
    game.player.prevY = game.player.y;
    game.player.vx = 0;
    game.player.vy = 0;
    game.player.pointerOffsetSet = false;
    game.input.keys.clear();
    game.input.pressed.clear();
    game.input.pointer.active = false;
    game.input.pointer.inside = false;
    window.__NEON_BASELINE_INPUT__.setGamepad({
      connected: false,
      x: 0,
      y: 0,
      action: false,
      focus: false,
      pause: false,
    });
  });
}

export async function prepareDrive(page: Page) {
  await page.evaluate(() => {
    const game = window.__NEON_OVERDRIVE__;
    game.drive = 100;
    game.driveReadyTime = 0;
    game.overdriveTime = 0;
    game.overdriveMax = 0;
    game.overdriveGuard = false;
    game.firstDriveUsed = false;
    game.hitStop = 0;
    game.updateHUD(true);
  });
}

export async function setGamepad(
  page: Page,
  next: {
    connected: boolean;
    x: number;
    y: number;
    action: boolean;
    focus: boolean;
    pause: boolean;
  },
) {
  await page.evaluate((value) => window.__NEON_BASELINE_INPUT__.setGamepad(value), next);
}

export async function spawnScoringTarget(page: Page) {
  return page.evaluate(() => {
    const game = window.__NEON_OVERDRIVE__;
    game.clearEnemies(false);
    const scoreBefore = Math.floor(game.score);
    const chainBefore = game.chain;
    const killsBefore = game.stats.kills;
    game.spawnEnemy("scout", {
      x: game.player.x,
      y: game.player.y - 120,
      originX: game.player.x,
      amp: 0,
    });
    const target = game.enemies.at(-1);
    target.hp = 0;
    game.updateEnemies(1 / 60);
    game.updateHUD(true);
    game.render();
    return {
      scoreBefore,
      scoreAfter: Math.floor(game.score),
      chainBefore,
      chainAfter: game.chain,
      killsBefore,
      kills: game.stats.kills,
    };
  });
}

export async function audioEvents(page: Page): Promise<AudioEvent[]> {
  return page.evaluate(() => window.__NEON_BASELINE_AUDIO__.map((event) => ({ ...event })));
}

declare global {
  interface Window {
    __NEON_OVERDRIVE__: any;
    __NEON_BASELINE_AUDIO__: AudioEvent[];
    __NEON_BASELINE_INPUT__: {
      setGamepad(next: {
        connected: boolean;
        x: number;
        y: number;
        action: boolean;
        focus: boolean;
        pause: boolean;
      }): void;
    };
  }
}
