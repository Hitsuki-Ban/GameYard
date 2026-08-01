import { describe, expect, it } from "vite-plus/test";

import { readRequiredHexColorCssVariable, readRequiredPixelCssVariable } from "./lab";

function cssVariables(
  values: Readonly<Record<string, string>>,
): Pick<CSSStyleDeclaration, "getPropertyValue"> {
  return {
    getPropertyValue: (name) => values[name] ?? "",
  };
}

describe("Lab CSS variable contract", () => {
  it("reads the declared pixel and color values exactly", () => {
    const styles = cssVariables({
      "--stage-radius": "28px",
      "--frame-offset": "0px",
      "--lab-accent": "#1646c8",
    });
    expect(readRequiredPixelCssVariable(styles, "--stage-radius")).toBe(28);
    expect(readRequiredPixelCssVariable(styles, "--frame-offset")).toBe(0);
    expect(readRequiredHexColorCssVariable(styles, "--lab-accent")).toBe("#1646c8");
  });

  it("throws when a required value is missing or malformed", () => {
    const styles = cssVariables({ "--bad-pixels": "28", "--bad-color": "blue" });
    expect(() => readRequiredPixelCssVariable(styles, "--missing")).toThrow(
      "Required CSS variable --missing is missing.",
    );
    expect(() => readRequiredPixelCssVariable(styles, "--bad-pixels")).toThrow(
      'Required CSS variable --bad-pixels must be a finite pixel value; received "28".',
    );
    expect(() => readRequiredHexColorCssVariable(styles, "--bad-color")).toThrow(
      'Required CSS variable --bad-color must be a six-digit hex color; received "blue".',
    );
  });
});
