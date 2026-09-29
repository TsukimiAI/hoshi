import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = join(root, "resources");
const dest = join(root, "dist", "resources");
if (!existsSync(src)) {
  throw new Error(`缺少 ${src}`);
}
rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true });
