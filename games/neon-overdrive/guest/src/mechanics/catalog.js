export const FIELD = Object.freeze({ width: 540, height: 960, tau: Math.PI * 2 });

export const COLORS = Object.freeze({
  cyan: "#00f7ff",
  cyanSoft: "#76fbff",
  pink: "#ff2bd6",
  pinkSoft: "#ff86e9",
  violet: "#8062ff",
  gold: "#ffd95a",
  red: "#ff355e",
  orange: "#ff8a4c",
  green: "#5bffb0",
  white: "#f7fbff",
  blue: "#4b80ff",
  ink: "#05040d",
});

export const ENEMY_DEFINITIONS = Object.freeze({
  scout: Object.freeze({ hp: 46, radius: 15, score: 520 }),
  diver: Object.freeze({ hp: 58, radius: 16, score: 680 }),
  spinner: Object.freeze({ hp: 155, radius: 23, score: 1650 }),
  turret: Object.freeze({ hp: 185, radius: 24, score: 1950 }),
  orbiter: Object.freeze({ hp: 130, radius: 20, score: 1450 }),
  carrier: Object.freeze({ hp: 610, radius: 40, score: 6200 }),
  elite: Object.freeze({ hp: 430, radius: 32, score: 4800 }),
});

export const DEFAULT_MODIFIERS = Object.freeze({
  fireRate: 1,
  drones: 2,
  overdriveDuration: 6.2,
  grazeRadius: 25,
  grazeGain: 1,
  nova: 0,
  maxShieldBonus: 0,
  closeDamage: 0,
  rushScore: 0,
  guardCost: 32,
  guardRadius: 145,
  chainDecay: 1,
  chainRetention: 0,
  missileRate: 1,
  missilePower: 1,
  arcLevel: 0,
  freeGuard: false,
});

export function createDefaultModifiers() {
  return { ...DEFAULT_MODIFIERS };
}
