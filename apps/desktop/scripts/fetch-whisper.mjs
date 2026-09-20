import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { cpus, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ARCH = process.arch === "arm64" ? "arm64" : "x64";
const OUT_DIR = join(ROOT, "vendor", "whisper", ARCH);
const TAG = "v1.8.2";
const SRC_URL = `https://github.com/ggml-org/whisper.cpp/archive/refs/tags/${TAG}.tar.gz`;

function findNamed(dir, match) {
  const names = readdirSync(dir, { withFileTypes: true });
  for (const entry of names) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      const hit = findNamed(p, match);
      if (hit) {
        return hit;
      }
    } else if (match(entry.name)) {
      return p;
    }
  }
  return "";
}

async function download(url, dest) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) {
    throw new Error(`download ${res.status} ${url}`);
  }
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}

function copyRuntime(srcDir) {
  mkdirSync(OUT_DIR, { recursive: true });
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(p);
        continue;
      }
      if (
        entry.name === "whisper-cli" ||
        entry.name === "whisper-cli.exe" ||
        entry.name.endsWith(".dylib") ||
        entry.name.endsWith(".so") ||
        entry.name.endsWith(".dll") ||
        entry.name.endsWith(".metal")
      ) {
        files.push(p);
      }
    }
  };
  walk(srcDir);
  for (const src of files) {
    const dest = join(OUT_DIR, src.slice(src.lastIndexOf("/") + 1));
    copyFileSync(src, dest);
    if (dest.endsWith("whisper-cli") || dest.endsWith("whisper-cli.exe")) {
      chmodSync(dest, 0o755);
    }
  }
}

const destCli = join(OUT_DIR, "whisper-cli");
const stamp = join(OUT_DIR, ".bundle");
if (existsSync(destCli) && existsSync(stamp) && statSync(destCli).size > 1000) {
  console.log("whisper-cli exists");
  process.exit(0);
}

mkdirSync(OUT_DIR, { recursive: true });
try {
  execFileSync("cmake", ["--version"], { stdio: "ignore" });
} catch {
  throw new Error("需要 cmake（macOS 发行包不含 whisper-cli）");
}

const tgz = join(tmpdir(), `hoshi-whisper-${TAG}.tar.gz`);
const unpack = join(tmpdir(), `hoshi-whisper-${TAG}-src`);
rmSync(unpack, { recursive: true, force: true });
mkdirSync(unpack, { recursive: true });
console.log("fetch", SRC_URL);
await download(SRC_URL, tgz);
execFileSync("tar", ["-xzf", tgz, "-C", unpack], { stdio: "inherit" });
const srcRoot = findNamed(unpack, (name) => name === "CMakeLists.txt");
if (!srcRoot) {
  throw new Error("whisper.cpp CMakeLists.txt not found");
}
const cmakeRoot = dirname(srcRoot);
const buildDir = join(cmakeRoot, "build");
console.log("cmake", cmakeRoot);
execFileSync(
  "cmake",
  ["-S", cmakeRoot, "-B", buildDir, "-DCMAKE_BUILD_TYPE=Release", "-DGGML_METAL=ON"],
  { stdio: "inherit" }
);
execFileSync(
  "cmake",
  ["--build", buildDir, "--config", "Release", "-j", String(Math.max(1, cpus().length)), "--target", "whisper-cli"],
  { stdio: "inherit" }
);
const found = findNamed(buildDir, (name) => name === "whisper-cli" || name === "whisper-cli.exe");
if (!found) {
  throw new Error("whisper-cli not built");
}
copyRuntime(buildDir);
if (!existsSync(destCli)) {
  copyFileSync(found, destCli);
  chmodSync(destCli, 0o755);
}
console.log("wrote", destCli);
writeFileSync(stamp, "1");
