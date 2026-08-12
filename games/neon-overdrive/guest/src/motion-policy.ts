import { MotionSettingsSchema, type MotionSettings } from "@gameyard/game-contract";

export type MotionPresentation = "full" | "reduced";
export type ShakePresentation = "enabled" | "disabled";

export interface MotionPolicy {
  readonly canvas: MotionPresentation;
  readonly css: MotionPresentation;
  readonly flash: MotionPresentation;
  readonly shake: ShakePresentation;
  readonly particles: MotionPresentation;
}

const FULL_WITH_SHAKE = Object.freeze({
  canvas: "full",
  css: "full",
  flash: "full",
  shake: "enabled",
  particles: "full",
} as const satisfies MotionPolicy);

const FULL_WITHOUT_SHAKE = Object.freeze({
  canvas: "full",
  css: "full",
  flash: "full",
  shake: "disabled",
  particles: "full",
} as const satisfies MotionPolicy);

const REDUCED = Object.freeze({
  canvas: "reduced",
  css: "reduced",
  flash: "reduced",
  shake: "disabled",
  particles: "reduced",
} as const satisfies MotionPolicy);

const POLICY_TABLE = Object.freeze({
  "false:false": FULL_WITHOUT_SHAKE,
  "false:true": FULL_WITH_SHAKE,
  "true:false": REDUCED,
  "true:true": REDUCED,
});

export function deriveMotionPolicy(settings: MotionSettings): MotionPolicy {
  const parsed = MotionSettingsSchema.parse(settings);
  return POLICY_TABLE[`${parsed.reduced}:${parsed.screenShake}`];
}
