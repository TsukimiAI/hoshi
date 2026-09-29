import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

function nvmBinDirs(): string[] {
  const nvmRoot = join(homedir(), ".nvm/versions/node");
  if (!existsSync(nvmRoot)) {
    return [];
  }
  const dirs: string[] = [];
  try {
    const alias = readFileSync(join(homedir(), ".nvm/alias/default"), "utf8").trim();
    if (alias) {
      dirs.push(join(nvmRoot, alias, "bin"), join(nvmRoot, `v${alias}`, "bin"));
    }
  } catch {
    // ignore
  }
  try {
    for (const name of readdirSync(nvmRoot)) {
      dirs.push(join(nvmRoot, name, "bin"));
    }
  } catch {
    // ignore
  }
  return dirs;
}

export function augmentedPath(envPath = process.env.PATH ?? ""): string {
  const extra = [
    "/opt/homebrew/bin",
    "/usr/local/bin",
    join(homedir(), ".local/bin"),
    join(homedir(), ".volta/bin"),
    ...nvmBinDirs()
  ];
  return [...extra, envPath].filter(Boolean).join(delimiter);
}
