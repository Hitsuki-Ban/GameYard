import { fileURLToPath } from "node:url";

import { assembleSite } from "./site-assembler.mjs";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const result = await assembleSite(projectRoot);

console.log(
  `Site assembled: ${result.buildId}; ${result.fileCount} files; ${result.gameCount} games.`,
);
