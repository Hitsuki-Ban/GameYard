import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const stageRoot = path.resolve(projectRoot, "../../.gameyard/stage/games/crown-breaker");
const legacyPrefix = ["crown", "Breaker"].join("");
const forbidden = [
  "__CB_TEST__",
  "__GAMEYARD_TESTKIT__",
  "createTestHooks",
  "configureBattle",
  "resetStorage",
  `${legacyPrefix}.save`,
  `${legacyPrefix}.run`,
  `${legacyPrefix}.settings`,
  ["serviceWorker", "register"].join("."),
  "sw.js",
  "manifest.webmanifest",
];

async function filesAt(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesAt(target)));
    else files.push(target);
  }
  return files;
}

const files = await filesAt(stageRoot);
if (!files.some((file) => path.basename(file) === "game.manifest.json"))
  throw new Error("CrownBreaker production manifest is missing.");
for (const file of files) {
  const relative = path.relative(stageRoot, file).replaceAll("\\", "/");
  if (/^(?:sw\.js|manifest(?:\.[^.]+)?\.webmanifest)$/.test(relative))
    throw new Error(`Forbidden PWA artifact: ${relative}`);
  if (!/\.(?:html|js|json|css)$/.test(file)) continue;
  const source = await readFile(file, "utf8");
  for (const marker of forbidden) {
    if (source.includes(marker))
      throw new Error(`Production artifact ${relative} contains forbidden marker ${marker}.`);
  }
}
process.stdout.write(`CrownBreaker production artifact passed (${files.length} files).\n`);
