import { sep } from "node:path";

const publicCatalogId = "virtual:gameyard/catalog";
const internalCatalogId = `\0${publicCatalogId}`;
const publicCoverPrefix = "virtual:gameyard/cover/";

function createCatalogModule(registry) {
  const imports = [];
  const entries = registry.games.map((game, gameIndex) => {
    const coverCandidates = game.covers.map((candidate, candidateIndex) => {
      const binding = `cover_${gameIndex}_${candidateIndex}`;
      imports.push(
        `import ${binding} from ${JSON.stringify(`${publicCoverPrefix}${gameIndex}/${candidateIndex}`)};`,
      );
      return `{url:${binding},width:${candidate.width},height:${candidate.height}}`;
    });
    const presentation = {
      schemaVersion: game.presentation.schemaVersion,
      id: game.presentation.id,
      title: game.presentation.title,
      taglines: game.presentation.taglines,
      accent: game.presentation.accent,
      stage: game.presentation.stage,
    };
    return `{order:${gameIndex + 1},manifest:${JSON.stringify(game.manifest)},presentation:{...${JSON.stringify(presentation)},cover:{candidates:[${coverCandidates.join(",")}]}}}`;
  });
  return `${imports.join("\n")}\nexport const GAMEYARD_CATALOG = [${entries.join(",")}];\n`;
}

export function createProductionRegistryVitePlugin(registry) {
  const coverIds = new Map();
  for (const [gameIndex, game] of registry.games.entries()) {
    for (const [candidateIndex, candidate] of game.covers.entries()) {
      coverIds.set(
        `${publicCoverPrefix}${gameIndex}/${candidateIndex}`,
        `${candidate.sourcePath.split(sep).join("/")}?url&no-inline`,
      );
    }
  }
  const catalogModule = createCatalogModule(registry);
  return {
    name: "gameyard-production-registry",
    enforce: "pre",
    resolveId(source) {
      if (source === publicCatalogId) return internalCatalogId;
      return coverIds.get(source) ?? null;
    },
    load(id) {
      return id === internalCatalogId ? catalogModule : null;
    },
  };
}
