import "./lab.css";

interface LabValues {
  stageRadius: number;
  stageGap: number;
  accent: string;
  frameOffset: number;
}

interface PaneRuntime {
  addBinding(
    target: LabValues,
    key: keyof LabValues,
    options: Readonly<Record<string, string | number>>,
  ): void;
  on(eventName: "change", handler: () => void): void;
  dispose(): void;
}

interface PaneConstructor {
  new (options: { readonly container: HTMLElement; readonly title: string }): PaneRuntime;
}

type CssVariableReader = Pick<CSSStyleDeclaration, "getPropertyValue">;

function readRequiredCssVariable(styles: CssVariableReader, variableName: string): string {
  const value = styles.getPropertyValue(variableName).trim();
  if (value.length === 0) {
    throw new Error(`Required CSS variable ${variableName} is missing.`);
  }
  return value;
}

export function readRequiredPixelCssVariable(
  styles: CssVariableReader,
  variableName: string,
): number {
  const value = readRequiredCssVariable(styles, variableName);
  if (!/^-?(?:\d+|\d*\.\d+)px$/.test(value)) {
    throw new Error(
      `Required CSS variable ${variableName} must be a finite pixel value; received "${value}".`,
    );
  }
  const parsed = Number(value.slice(0, -2));
  if (!Number.isFinite(parsed)) {
    throw new Error(`Required CSS variable ${variableName} must be finite; received "${value}".`);
  }
  return parsed;
}

export function readRequiredHexColorCssVariable(
  styles: CssVariableReader,
  variableName: string,
): string {
  const value = readRequiredCssVariable(styles, variableName);
  if (!/^#[\da-f]{6}$/i.test(value)) {
    throw new Error(
      `Required CSS variable ${variableName} must be a six-digit hex color; received "${value}".`,
    );
  }
  return value;
}

export async function createLabPane(
  container: HTMLElement,
  onChange: (label: string) => void,
): Promise<() => void> {
  const tweakpane = await import("tweakpane");
  const Pane = tweakpane.Pane as unknown as PaneConstructor;
  const root = document.documentElement;
  const rootStyles = getComputedStyle(root);
  const values: LabValues = {
    stageRadius: readRequiredPixelCssVariable(rootStyles, "--stage-radius"),
    stageGap: readRequiredPixelCssVariable(rootStyles, "--stage-gap"),
    accent: readRequiredHexColorCssVariable(rootStyles, "--lab-accent"),
    frameOffset: readRequiredPixelCssVariable(rootStyles, "--frame-offset"),
  };
  const pane = new Pane({ container, title: "Kinetic White / Session" });

  pane.addBinding(values, "stageRadius", { label: "Stage radius", min: 0, max: 64, step: 1 });
  pane.addBinding(values, "stageGap", { label: "Stage gap", min: 8, max: 64, step: 1 });
  pane.addBinding(values, "accent", { label: "Lab accent", view: "color" });
  pane.addBinding(values, "frameOffset", { label: "Frame offset", min: -48, max: 48, step: 1 });
  pane.on("change", () => {
    root.style.setProperty("--stage-radius", `${values.stageRadius}px`);
    root.style.setProperty("--stage-gap", `${values.stageGap}px`);
    root.style.setProperty("--lab-accent", values.accent);
    root.style.setProperty("--frame-offset", `${values.frameOffset}px`);
    onChange("css-vars");
  });

  return () => pane.dispose();
}
