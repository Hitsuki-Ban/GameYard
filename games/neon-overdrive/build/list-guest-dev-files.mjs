import { readdir } from "node:fs/promises";
import path from "node:path";

const guestRoot = path.resolve(import.meta.dirname, "../guest");

async function collectDirectoryFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectDirectoryFiles(entryPath)));
    else if (entry.isFile()) files.push(entryPath);
    else throw new Error(`Unsupported Neon Guest input: ${entryPath}`);
  }
  return files;
}

export async function listNeonGuestDevFiles() {
  const files = (await collectDirectoryFiles(guestRoot))
    .map((file) => path.relative(guestRoot, file).split(path.sep).join("/"))
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  for (const required of ["index.html", "src/main.ts"]) {
    if (!files.includes(required)) throw new Error(`Neon Guest is missing ${required}.`);
  }
  return ["game.manifest.json", ...files].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
}
