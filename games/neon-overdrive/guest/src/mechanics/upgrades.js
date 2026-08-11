import { COLORS } from "./catalog.js";

export const UPGRADES = Object.freeze(
  [
    {
      id: "voltage",
      name: "高压狂热",
      icon: "⚡",
      accent: COLORS.cyan,
      description: "主炮射速提高 22%，火力反馈更密集。",
      max: 4,
      effect: { fireRateMultiplier: 1.22 },
    },
    {
      id: "satellite",
      name: "伴飞星群",
      icon: "✦",
      accent: COLORS.violet,
      description: "增加一枚伴飞炮；最多形成六机齐射。",
      max: 4,
      effect: { droneDelta: 1, droneMaximum: 6 },
    },
    {
      id: "echo",
      name: "余响延长",
      icon: "∞",
      accent: COLORS.pink,
      description: "OVERDRIVE 持续时间增加 1.6 秒。",
      max: 3,
      effect: { overdriveDurationDelta: 1.6 },
    },
    {
      id: "magnet",
      name: "危险磁场",
      icon: "◎",
      accent: COLORS.green,
      description: "擦弹范围与充能效率提高，危险更容易变成资源。",
      max: 3,
      effect: { grazeRadiusDelta: 4, grazeGainMultiplier: 1.2 },
    },
    {
      id: "nova",
      name: "终幕新星",
      icon: "☼",
      accent: COLORS.gold,
      description: "超载结束时追加全屏伤害与二次爆炸。",
      max: 3,
      effect: { novaDelta: 1 },
    },
    {
      id: "armor",
      name: "复合护层",
      icon: "⬡",
      accent: COLORS.cyanSoft,
      description: "最大护盾 +1，并立即补满一格。",
      max: 2,
      effect: { maxShieldBonusDelta: 1, maxShieldDelta: 1, shieldDelta: 1 },
    },
    {
      id: "hunter",
      name: "贴脸猎杀",
      icon: "➤",
      accent: COLORS.red,
      description: "近距离攻击与 RUSH 结算大幅强化。",
      max: 3,
      effect: { closeDamageDelta: 0.24, rushScoreDelta: 0.3 },
    },
    {
      id: "recycler",
      name: "保险回收",
      icon: "⟳",
      accent: COLORS.orange,
      description: "自动保险消耗降低，并扩大紧急清弹范围。",
      max: 3,
      effect: { guardCostDelta: -5, guardCostMinimum: 18, guardRadiusDelta: 22 },
    },
    {
      id: "chain",
      name: "连锁锁存",
      icon: "⌁",
      accent: COLORS.pinkSoft,
      description: "CHAIN 衰减减慢 28%，失误后的保留量提高。",
      max: 3,
      effect: { chainDecayMultiplier: 0.72, chainRetentionDelta: 0.08 },
    },
    {
      id: "missile",
      name: "追迹饱和",
      icon: "⌖",
      accent: COLORS.gold,
      description: "追踪弹发射频率与爆炸范围提高。",
      max: 3,
      effect: { missileRateMultiplier: 1.28, missilePowerMultiplier: 1.18 },
    },
    {
      id: "arc",
      name: "擦弹电弧",
      icon: "ϟ",
      accent: COLORS.violet,
      description: "连续擦弹会向最近敌人释放自动电弧。",
      max: 3,
      effect: { arcLevelDelta: 1 },
    },
    {
      id: "mercy",
      name: "重启协议",
      icon: "✚",
      accent: COLORS.green,
      description: "每幕首次真实受击无损，并触发大范围反击。",
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
