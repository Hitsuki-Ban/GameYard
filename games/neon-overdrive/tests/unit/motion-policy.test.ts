import { describe, expect, it } from "vite-plus/test";

import { deriveMotionPolicy } from "../../guest/src/motion-policy.js";

describe("Neon motion policy", () => {
  it("uses the fixed full-motion table when reduced motion is off", () => {
    expect(deriveMotionPolicy({ reduced: false, screenShake: true })).toEqual({
      canvas: "full",
      css: "full",
      flash: "full",
      shake: "enabled",
      particles: "full",
    });
    expect(deriveMotionPolicy({ reduced: false, screenShake: false })).toEqual({
      canvas: "full",
      css: "full",
      flash: "full",
      shake: "disabled",
      particles: "full",
    });
  });

  it("gives reduced motion priority over the screen-shake setting", () => {
    const reduced = {
      canvas: "reduced",
      css: "reduced",
      flash: "reduced",
      shake: "disabled",
      particles: "reduced",
    };
    expect(deriveMotionPolicy({ reduced: true, screenShake: true })).toBe(
      deriveMotionPolicy({ reduced: true, screenShake: false }),
    );
    expect(deriveMotionPolicy({ reduced: true, screenShake: true })).toEqual(reduced);
  });

  it("rejects incomplete or expanded motion settings", () => {
    expect(() => deriveMotionPolicy({ reduced: true } as never)).toThrow();
    expect(() =>
      deriveMotionPolicy({ reduced: false, screenShake: true, legacy: true } as never),
    ).toThrow();
  });
});
