import { COLORS } from "./catalog.js";

export const UPGRADES = Object.freeze(
  [
    {
      id: "voltage",
      icon: "⚡",
      accent: COLORS.cyan,
      max: 4,
      effect: { fireRateMultiplier: 1.22 },
    },
    {
      id: "satellite",
      icon: "✦",
      accent: COLORS.violet,
      max: 4,
      effect: { droneDelta: 1, droneMaximum: 6 },
    },
    {
      id: "echo",
      icon: "∞",
      accent: COLORS.pink,
      max: 3,
      effect: { overdriveDurationDelta: 1.6 },
    },
    {
      id: "magnet",
      icon: "◎",
      accent: COLORS.green,
      max: 3,
      effect: { grazeRadiusDelta: 4, grazeGainMultiplier: 1.2 },
    },
    {
      id: "nova",
      icon: "☼",
      accent: COLORS.gold,
      max: 3,
      effect: { novaDelta: 1 },
    },
    {
      id: "armor",
      icon: "⬡",
      accent: COLORS.cyanSoft,
      max: 2,
      effect: { maxShieldBonusDelta: 1, maxShieldDelta: 1, shieldDelta: 1 },
    },
    {
      id: "hunter",
      icon: "➤",
      accent: COLORS.red,
      max: 3,
      effect: { closeDamageDelta: 0.24, rushScoreDelta: 0.3 },
    },
    {
      id: "recycler",
      icon: "⟳",
      accent: COLORS.orange,
      max: 3,
      effect: { guardCostDelta: -5, guardCostMinimum: 18, guardRadiusDelta: 22 },
    },
    {
      id: "chain",
      icon: "⌁",
      accent: COLORS.pinkSoft,
      max: 3,
      effect: { chainDecayMultiplier: 0.72, chainRetentionDelta: 0.08 },
    },
    {
      id: "missile",
      icon: "⌖",
      accent: COLORS.gold,
      max: 3,
      effect: { missileRateMultiplier: 1.28, missilePowerMultiplier: 1.18 },
    },
    {
      id: "arc",
      icon: "ϟ",
      accent: COLORS.violet,
      max: 3,
      effect: { arcLevelDelta: 1 },
    },
    {
      id: "mercy",
      icon: "✚",
      accent: COLORS.green,
      max: 1,
      effect: { freeGuard: true },
    },
  ].map((upgrade) => Object.freeze({ ...upgrade, effect: Object.freeze(upgrade.effect) })),
);

const upgradesById = new Map(UPGRADES.map((upgrade) => [upgrade.id, upgrade]));

function requireNumber(record, key) {
  if (!Number.isFinite(record[key])) throw new TypeError(`Modifier ${key} must be finite.`);
}

export function getUpgrade(upgradeId) {
  if (typeof upgradeId !== "string") throw new TypeError("Upgrade id must be a string.");
  const upgrade = upgradesById.get(upgradeId);
  if (upgrade === undefined) throw new RangeError(`Unknown upgrade: ${upgradeId}`);
  return upgrade;
}

export function applyUpgrade({ upgradeId, currentLevel, modifiers, shield, maxShield }) {
  const upgrade = getUpgrade(upgradeId);
  if (!Number.isSafeInteger(currentLevel) || currentLevel < 0 || currentLevel >= upgrade.max) {
    throw new RangeError(`Upgrade ${upgradeId} level must be below ${upgrade.max}.`);
  }
  if (modifiers === null || typeof modifiers !== "object" || Array.isArray(modifiers)) {
    throw new TypeError("Upgrade modifiers must be an object.");
  }
  if (![shield, maxShield].every(Number.isFinite) || shield < 0 || maxShield < shield) {
    throw new RangeError("Upgrade shield state is invalid.");
  }
  const next = { ...modifiers };
  const effect = upgrade.effect;
  if (effect.fireRateMultiplier) {
    requireNumber(next, "fireRate");
    next.fireRate *= effect.fireRateMultiplier;
  }
  if (effect.droneDelta) {
    requireNumber(next, "drones");
    next.drones = Math.min(effect.droneMaximum, next.drones + effect.droneDelta);
  }
  if (effect.overdriveDurationDelta) {
    requireNumber(next, "overdriveDuration");
    next.overdriveDuration += effect.overdriveDurationDelta;
  }
  if (effect.grazeRadiusDelta) {
    requireNumber(next, "grazeRadius");
    requireNumber(next, "grazeGain");
    next.grazeRadius += effect.grazeRadiusDelta;
    next.grazeGain *= effect.grazeGainMultiplier;
  }
  if (effect.novaDelta) {
    requireNumber(next, "nova");
    next.nova += effect.novaDelta;
  }
  if (effect.maxShieldBonusDelta) {
    requireNumber(next, "maxShieldBonus");
    next.maxShieldBonus += effect.maxShieldBonusDelta;
    maxShield += effect.maxShieldDelta;
    shield = Math.min(maxShield, shield + effect.shieldDelta);
  }
  if (effect.closeDamageDelta) {
    requireNumber(next, "closeDamage");
    requireNumber(next, "rushScore");
    next.closeDamage += effect.closeDamageDelta;
    next.rushScore += effect.rushScoreDelta;
  }
  if (effect.guardCostDelta) {
    requireNumber(next, "guardCost");
    requireNumber(next, "guardRadius");
    next.guardCost = Math.max(effect.guardCostMinimum, next.guardCost + effect.guardCostDelta);
    next.guardRadius += effect.guardRadiusDelta;
  }
  if (effect.chainDecayMultiplier) {
    requireNumber(next, "chainDecay");
    requireNumber(next, "chainRetention");
    next.chainDecay *= effect.chainDecayMultiplier;
    next.chainRetention += effect.chainRetentionDelta;
  }
  if (effect.missileRateMultiplier) {
    requireNumber(next, "missileRate");
    requireNumber(next, "missilePower");
    next.missileRate *= effect.missileRateMultiplier;
    next.missilePower *= effect.missilePowerMultiplier;
  }
  if (effect.arcLevelDelta) {
    requireNumber(next, "arcLevel");
    next.arcLevel += effect.arcLevelDelta;
  }
  if (effect.freeGuard) next.freeGuard = true;
  return { modifiers: next, shield, maxShield, level: currentLevel + 1 };
}
