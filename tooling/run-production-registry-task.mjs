import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { loadProductionRegistry } from "./production-registry.mjs";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const vpExecutable = process.platform === "win32" ? "vp.exe" : "vp";

function runVp(args, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(vpExecutable, args, { cwd, stdio: "inherit", shell: false });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`vp ${args.join(" ")} terminated by signal ${signal}.`));
      } else if (code !== 0) {
        reject(new Error(`vp ${args.join(" ")} exited with code ${String(code)}.`));
      } else {
        resolvePromise();
      }
    });
  });
}

export function createProductionRegistryTaskCommands(registry, task) {
  if (task === "dev") {
    const filters = registry.games.flatMap((game) => ["--filter", game.packageName]);
    return [["run", "--parallel", ...filters, "--filter", "hub", "dev"]];
  }
  if (task === "build") {
    return [
      ...registry.games.map((game) => ["run", "--no-cache", "--filter", game.packageName, "build"]),
      ["run", "--no-cache", "--filter", "hub", "build"],
    ];
  }
  throw new Error('Registry task must be exactly "dev" or "build".');
}

export async function runProductionRegistryTask(task, root = projectRoot) {
  const registry = await loadProductionRegistry(root);
  for (const command of createProductionRegistryTaskCommands(registry, task)) {
    await runVp(command, registry.projectRoot);
  }
}

async function main() {
  if (process.argv.length !== 3) {
    throw new Error("Usage: run-production-registry-task.mjs <dev|build>");
  }
  await runProductionRegistryTask(process.argv[2]);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) await main();
