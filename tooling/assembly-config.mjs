const assemblyConfigFilename = "site.assembly.json";
const gameIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertExactKeys(value, expected, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  const keys = Object.keys(value).sort(compareStrings);
  const expectedKeys = [...expected].sort(compareStrings);
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new Error(`${label} fields must be exactly: ${expectedKeys.join(", ")}.`);
  }
}

export function parseRepositoryRelativePath(value, label) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\\") ||
    value.includes(":") ||
    value.includes("%") ||
    value.includes("?") ||
    value.includes("#") ||
    value.startsWith("/") ||
    value.endsWith("/") ||
    value.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new Error(`${label} must be a normalized repository-relative POSIX path.`);
  }
  return value;
}

function assertUniquePaths(paths, label) {
  const folded = paths.map((path) => path.toLowerCase()).sort(compareStrings);
  for (let index = 0; index < folded.length; index += 1) {
    const current = folded[index];
    const previous = folded[index - 1];
    if (previous === current)
      throw new Error(`${label} contains a duplicate path: ${paths[index]}`);
    if (previous && current.startsWith(`${previous}/`)) {
      throw new Error(`${label} contains overlapping paths: ${previous} and ${current}`);
    }
  }
}

function parseGameConfig(value, index) {
  const label = `site.assembly.json games[${index}]`;
  assertExactKeys(value, ["id", "stage", "productionInputs"], label);
  if (typeof value.id !== "string" || value.id.length > 128 || !gameIdPattern.test(value.id)) {
    throw new Error(`${label}.id must be a stable lowercase game ID.`);
  }
  const stage = parseRepositoryRelativePath(value.stage, `${label}.stage`);
  if (!Array.isArray(value.productionInputs) || value.productionInputs.length === 0) {
    throw new Error(`${label}.productionInputs must be a non-empty array.`);
  }
  const productionInputs = value.productionInputs.map((input, inputIndex) =>
    parseRepositoryRelativePath(input, `${label}.productionInputs[${inputIndex}]`),
  );
  assertUniquePaths(productionInputs, `${label}.productionInputs`);
  for (const input of productionInputs) {
    const folded = input.toLowerCase();
    const foldedStage = stage.toLowerCase();
    if (
      folded === "dist" ||
      folded.startsWith("dist/") ||
      folded === ".gameyard" ||
      folded.startsWith(".gameyard/") ||
      folded === foldedStage ||
      folded.startsWith(`${foldedStage}/`)
    ) {
      throw new Error(
        `${label}.productionInputs must not include stage or distribution output: ${input}`,
      );
    }
  }
  return { id: value.id, stage, productionInputs };
}

export function parseAssemblyConfig(value) {
  assertExactKeys(value, ["schemaVersion", "hubStage", "games"], assemblyConfigFilename);
  if (value.schemaVersion !== 1) throw new Error("site.assembly.json schemaVersion must be 1.");
  if (value.hubStage !== ".gameyard/stage/hub") {
    throw new Error('site.assembly.json hubStage must be ".gameyard/stage/hub".');
  }
  if (!Array.isArray(value.games)) throw new Error("site.assembly.json games must be an array.");

  const games = value.games.map(parseGameConfig);
  const ids = new Set();
  const stages = new Set();
  for (const game of games) {
    const foldedId = game.id.toLowerCase();
    const foldedStage = game.stage.toLowerCase();
    if (ids.has(foldedId))
      throw new Error(`site.assembly.json has a game ID collision: ${game.id}`);
    if (stages.has(foldedStage)) {
      throw new Error(`site.assembly.json has a game stage collision: ${game.stage}`);
    }
    ids.add(foldedId);
    stages.add(foldedStage);
  }

  return { schemaVersion: 1, hubStage: value.hubStage, games };
}
