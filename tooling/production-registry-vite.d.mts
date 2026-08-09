import type { Plugin } from "vite";

import type { LoadedProductionRegistry } from "./production-registry.mjs";

export function createProductionRegistryVitePlugin(registry: LoadedProductionRegistry): Plugin;
