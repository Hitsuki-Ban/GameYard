import { LabSceneRegistry, type LabPreset, type LabSceneDefinition } from "@gameyard/testkit";
import type { BuildId, GameId, GameVersion } from "@gameyard/game-contract";

import "./lab.css";

export interface LabRuntimeIdentity {
  readonly gameId: GameId;
  readonly gameVersion: GameVersion;
  readonly buildId: BuildId;
}

export interface HubLabStartupState {
  readonly localePreference: "en" | "ja" | "zh-Hans";
  readonly masterVolume: number;
  readonly musicVolume: number;
  readonly sfxVolume: number;
  readonly reducedMotion: boolean;
  readonly screenShake: boolean;
  readonly lifecycle: "active" | "paused";
}

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
  refresh(): void;
  dispose(): void;
}

interface PaneConstructor {
  new (options: { readonly container: HTMLElement; readonly title: string }): PaneRuntime;
}

interface LabPaneOptions {
  readonly identity: LabRuntimeIdentity;
  readonly onApply: (state: HubLabStartupState, preset: LabPreset) => void | Promise<void>;
  readonly onChange: (label: string) => void;
}

type CssVariableReader = Pick<CSSStyleDeclaration, "getPropertyValue">;

const PARAMETER_SCHEMAS: LabSceneDefinition["parameters"] = {
  localePreference: { type: "enum", values: ["en", "ja", "zh-Hans"] },
  masterVolume: { type: "number", integer: false, minimum: 0, maximum: 1 },
  musicVolume: { type: "number", integer: false, minimum: 0, maximum: 1 },
  sfxVolume: { type: "number", integer: false, minimum: 0, maximum: 1 },
  reducedMotion: { type: "boolean" },
  screenShake: { type: "boolean" },
  lifecycle: { type: "enum", values: ["active", "paused"] },
  stageRadius: { type: "number", integer: true, minimum: 0, maximum: 64 },
  stageGap: { type: "number", integer: true, minimum: 8, maximum: 64 },
  accent: { type: "enum", values: ["#1646c8", "#e9472d", "#28282a"] },
  frameOffset: { type: "number", integer: true, minimum: -48, maximum: 48 },
};

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

function accentForGame(gameId: GameId): "#1646c8" | "#e9472d" | "#28282a" {
  switch (gameId) {
    case "pulse-link-overdrive":
      return "#1646c8";
    case "tumbledrum":
      return "#e9472d";
    case "crown-breaker":
      return "#28282a";
    default:
      throw new Error(`Unsupported Lab game id: ${gameId}`);
  }
}

export function createHubLabScenes(identity: LabRuntimeIdentity): {
  readonly registry: LabSceneRegistry;
  readonly presets: readonly LabPreset[];
} {
  const definitions = [
    {
      ...identity,
      sceneId: "ready-balanced",
      sceneVersion: 1,
      parameters: PARAMETER_SCHEMAS,
    },
    {
      ...identity,
      sceneId: "paused-accessible",
      sceneVersion: 1,
      parameters: PARAMETER_SCHEMAS,
    },
  ] as const satisfies readonly LabSceneDefinition[];
  const registry = new LabSceneRegistry(definitions);
  const accent = accentForGame(identity.gameId);
  return {
    registry,
    presets: [
      registry.createPreset("ready-balanced", 0x4759_0001, {
        localePreference: "en",
        masterVolume: 0.8,
        musicVolume: 0.6,
        sfxVolume: 0.8,
        reducedMotion: false,
        screenShake: true,
        lifecycle: "active",
        stageRadius: 28,
        stageGap: 28,
        accent,
        frameOffset: 0,
      }),
      registry.createPreset("paused-accessible", 0x4759_0002, {
        localePreference: "ja",
        masterVolume: 0.5,
        musicVolume: 0.25,
        sfxVolume: 0.6,
        reducedMotion: true,
        screenShake: false,
        lifecycle: "paused",
        stageRadius: 16,
        stageGap: 20,
        accent,
        frameOffset: 0,
      }),
    ],
  };
}

function startupState(preset: LabPreset): HubLabStartupState {
  const parameters = preset.parameters;
  return {
    localePreference: parameters.localePreference as HubLabStartupState["localePreference"],
    masterVolume: parameters.masterVolume as number,
    musicVolume: parameters.musicVolume as number,
    sfxVolume: parameters.sfxVolume as number,
    reducedMotion: parameters.reducedMotion as boolean,
    screenShake: parameters.screenShake as boolean,
    lifecycle: parameters.lifecycle as HubLabStartupState["lifecycle"],
  };
}

function applyCssParameters(root: HTMLElement, preset: LabPreset): void {
  const parameters = preset.parameters;
  root.style.setProperty("--stage-radius", `${String(parameters.stageRadius)}px`);
  root.style.setProperty("--stage-gap", `${String(parameters.stageGap)}px`);
  root.style.setProperty("--lab-accent", String(parameters.accent));
  root.style.setProperty("--frame-offset", `${String(parameters.frameOffset)}px`);
}

function setStatus(element: HTMLElement, message: string, isError: boolean): void {
  element.textContent = message;
  element.dataset.error = String(isError);
}

export async function createLabPane(
  container: HTMLElement,
  options: LabPaneOptions,
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
  const { registry, presets } = createHubLabScenes(options.identity);
  const presetByScene = new Map(presets.map((preset) => [preset.sceneId, preset]));

  const controls = document.createElement("div");
  controls.className = "lab-scenes";
  const label = document.createElement("label");
  label.textContent = "Startup scene";
  const select = document.createElement("select");
  select.setAttribute("aria-label", "Lab startup scene");
  for (const preset of presets) {
    select.append(
      Object.assign(document.createElement("option"), {
        value: preset.sceneId,
        textContent: preset.sceneId,
      }),
    );
  }
  label.append(select);
  const buttons = document.createElement("div");
  buttons.className = "lab-scenes__actions";
  const applyButton = Object.assign(document.createElement("button"), {
    type: "button",
    textContent: "Apply scene",
  });
  const exportButton = Object.assign(document.createElement("button"), {
    type: "button",
    textContent: "Export preset",
  });
  const importButton = Object.assign(document.createElement("button"), {
    type: "button",
    textContent: "Import preset",
  });
  buttons.append(applyButton, exportButton, importButton);
  const textarea = document.createElement("textarea");
  textarea.setAttribute("aria-label", "Lab preset JSON");
  textarea.spellcheck = false;
  const status = document.createElement("p");
  status.className = "lab-scenes__status";
  status.setAttribute("aria-live", "polite");
  controls.append(label, buttons, textarea, status);
  container.append(controls);

  const paneHost = document.createElement("div");
  container.append(paneHost);
  const pane = new Pane({ container: paneHost, title: "Kinetic White / Session" });
  pane.addBinding(values, "stageRadius", { label: "Stage radius", min: 0, max: 64, step: 1 });
  pane.addBinding(values, "stageGap", { label: "Stage gap", min: 8, max: 64, step: 1 });
  pane.addBinding(values, "accent", { label: "Lab accent", view: "color" });
  pane.addBinding(values, "frameOffset", { label: "Frame offset", min: -48, max: 48, step: 1 });
  pane.on("change", () => {
    root.style.setProperty("--stage-radius", `${values.stageRadius}px`);
    root.style.setProperty("--stage-gap", `${values.stageGap}px`);
    root.style.setProperty("--lab-accent", values.accent);
    root.style.setProperty("--frame-offset", `${values.frameOffset}px`);
    options.onChange("css-vars");
  });

  const applyPreset = async (preset: LabPreset): Promise<void> => {
    values.stageRadius = preset.parameters.stageRadius as number;
    values.stageGap = preset.parameters.stageGap as number;
    values.accent = preset.parameters.accent as string;
    values.frameOffset = preset.parameters.frameOffset as number;
    pane.refresh();
    applyCssParameters(root, preset);
    await options.onApply(startupState(preset), preset);
    options.onChange(`scene:${preset.sceneId}`);
    setStatus(status, `Applied ${preset.sceneId}.`, false);
  };
  let applyInFlight = false;
  const runPreset = (preset: LabPreset): void => {
    if (applyInFlight) {
      setStatus(status, "A Lab scene is already being applied.", true);
      return;
    }
    applyInFlight = true;
    applyButton.disabled = true;
    importButton.disabled = true;
    select.disabled = true;
    void applyPreset(preset)
      .catch((error: unknown) =>
        setStatus(status, error instanceof Error ? error.message : String(error), true),
      )
      .finally(() => {
        applyInFlight = false;
        applyButton.disabled = false;
        importButton.disabled = false;
        select.disabled = false;
      });
  };
  const selectedPreset = (): LabPreset => {
    const preset = presetByScene.get(select.value);
    if (!preset) throw new Error(`Unknown selected Lab scene: ${select.value}`);
    return preset;
  };
  const currentPreset = (): LabPreset => {
    const selected = selectedPreset();
    return registry.createPreset(selected.sceneId, selected.seed, {
      ...selected.parameters,
      stageRadius: values.stageRadius,
      stageGap: values.stageGap,
      accent: values.accent,
      frameOffset: values.frameOffset,
    });
  };

  const handleApply = (): void => {
    runPreset(selectedPreset());
  };
  const handleExport = (): void => {
    try {
      textarea.value = registry.serialize(currentPreset());
      setStatus(status, `Exported ${select.value}.`, false);
    } catch (error) {
      setStatus(status, error instanceof Error ? error.message : String(error), true);
    }
  };
  const handleImport = (): void => {
    try {
      const preset = registry.parseJson(textarea.value);
      select.value = preset.sceneId;
      runPreset(preset);
    } catch (error) {
      setStatus(status, error instanceof Error ? error.message : String(error), true);
    }
  };
  applyButton.addEventListener("click", handleApply);
  exportButton.addEventListener("click", handleExport);
  importButton.addEventListener("click", handleImport);

  return () => {
    applyButton.removeEventListener("click", handleApply);
    exportButton.removeEventListener("click", handleExport);
    importButton.removeEventListener("click", handleImport);
    pane.dispose();
    controls.remove();
    paneHost.remove();
  };
}
