import { Notification, clipboard, globalShortcut } from "electron";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { isAbsolute, sep } from "node:path";
import { augmentedPath } from "./envPath";

export type ExecResult = { code: number; stdout: string; stderr: string };

type CapSession = {
  procs: Set<ChildProcess>;
  shortcuts: Set<string>;
};

const sessions = new Map<string, CapSession>();
let shortcutFire: ((pluginId: string, args: Record<string, unknown>) => void) | null = null;

export function setCapShortcutFire(fn: (pluginId: string, args: Record<string, unknown>) => void): void {
  shortcutFire = fn;
}

function sessionOf(pluginId: string): CapSession {
  let s = sessions.get(pluginId);
  if (!s) {
    s = { procs: new Set(), shortcuts: new Set() };
    sessions.set(pluginId, s);
  }
  return s;
}

function sanitizeBin(raw: unknown): string {
  const file = typeof raw === "string" ? raw.trim() : "";
  if (!file || file.length > 4096 || /[\0\n\r]/.test(file)) {
    throw new Error("命令无效");
  }
  return file;
}

function sanitizeArgs(raw: unknown): string[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) throw new Error("args 须为数组");
  if (raw.length > 64) throw new Error("参数过多");
  return raw.map((item) => {
    const s = String(item);
    if (s.length > 4096 || /[\0]/.test(s)) throw new Error("参数无效");
    return s;
  });
}

function sanitizeAccel(raw: unknown): string {
  const acc = typeof raw === "string" ? raw.trim() : "";
  if (!acc || acc.length > 64 || !/^[A-Za-z0-9+_\-]+$/.test(acc)) {
    throw new Error("快捷键无效");
  }
  return acc;
}

function track(pluginId: string, child: ChildProcess): void {
  const s = sessionOf(pluginId);
  s.procs.add(child);
  child.once("exit", () => {
    s.procs.delete(child);
  });
}

export function disposePluginCaps(pluginId: string): void {
  const s = sessions.get(pluginId);
  mediaRoots.delete(pluginId);
  mediaFiles.delete(pluginId);
  if (!s) return;
  for (const child of s.procs) {
    try {
      child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }
  for (const acc of s.shortcuts) {
    try {
      globalShortcut.unregister(acc);
    } catch {
      /* ignore */
    }
  }
  sessions.delete(pluginId);
}

export function disposeAllPluginCaps(): void {
  for (const id of [...sessions.keys()]) disposePluginCaps(id);
}

export function capExec(
  pluginId: string,
  file: unknown,
  args?: unknown,
  opts?: { cwd?: string; timeoutMs?: number }
): Promise<ExecResult> {
  const bin = sanitizeBin(file);
  const argv = sanitizeArgs(args);
  const timeoutMs = Math.min(Math.max(opts?.timeoutMs ?? 30_000, 1_000), 120_000);
  const cwd = typeof opts?.cwd === "string" && isAbsolute(opts.cwd) ? opts.cwd : undefined;
  return new Promise((resolve, reject) => {
    const child = execFile(
      bin,
      argv,
      {
        cwd,
        timeout: timeoutMs,
        maxBuffer: 2 * 1024 * 1024,
        windowsHide: true,
        env: { ...process.env, PATH: augmentedPath() }
      },
      (error, stdout, stderr) => {
        const code = typeof error === "object" && error && "code" in error ? Number(error.code) : 0;
        if (error && !stdout && !stderr) {
          reject(error);
          return;
        }
        resolve({
          code: Number.isFinite(code) ? code : error ? 1 : 0,
          stdout: String(stdout ?? ""),
          stderr: String(stderr ?? "")
        });
      }
    );
    track(pluginId, child);
  });
}

export function capSpawn(pluginId: string, file: unknown, args?: unknown, cwd?: string): { pid: number } {
  const bin = sanitizeBin(file);
  const argv = sanitizeArgs(args);
  const child = spawn(bin, argv, {
    cwd: typeof cwd === "string" && isAbsolute(cwd) ? cwd : undefined,
    env: { ...process.env, PATH: augmentedPath() },
    stdio: ["ignore", "ignore", "ignore"],
    detached: false,
    windowsHide: true
  });
  if (child.pid == null) throw new Error("启动失败");
  track(pluginId, child);
  return { pid: child.pid };
}

export function capNotify(title: unknown, body: unknown): void {
  const t = String(title ?? "").trim().slice(0, 120) || "拾星";
  const b = String(body ?? "").trim().slice(0, 2000);
  if (Notification.isSupported()) new Notification({ title: t, body: b }).show();
}

export function capClipboardRead(): string {
  return clipboard.readText();
}

export function capClipboardWrite(text: unknown): void {
  clipboard.writeText(String(text ?? "").slice(0, 1_000_000));
}

export function capShortcutOn(pluginId: string, accelerator: unknown): boolean {
  const acc = sanitizeAccel(accelerator);
  const s = sessionOf(pluginId);
  if (s.shortcuts.has(acc)) return true;
  const ok = globalShortcut.register(acc, () => {
    shortcutFire?.(pluginId, { action: "shortcut", accelerator: acc });
  });
  if (ok) s.shortcuts.add(acc);
  return ok;
}

export function capShortcutOff(pluginId: string, accelerator: unknown): void {
  const acc = sanitizeAccel(accelerator);
  const s = sessions.get(pluginId);
  if (!s?.shortcuts.has(acc)) return;
  globalShortcut.unregister(acc);
  s.shortcuts.delete(acc);
}

const mediaRoots = new Map<string, string>();
const mediaFiles = new Map<string, Set<string>>();

function realPath(p: string): string {
  try {
    return existsSync(p) ? realpathSync(p) : p;
  } catch {
    return p;
  }
}

export function setPluginMediaRoot(pluginId: string, dir: string): void {
  mediaRoots.set(pluginId, realPath(dir));
}

export function allowPluginMediaPaths(pluginId: string, paths: string[]): void {
  let set = mediaFiles.get(pluginId);
  if (!set) {
    set = new Set();
    mediaFiles.set(pluginId, set);
  }
  for (const p of paths) {
    if (typeof p === "string" && p.trim()) set.add(realPath(p.trim()));
  }
}

export function isPluginMediaAllowed(pluginId: string, abs: string): boolean {
  if (!pluginId || !abs || !isAbsolute(abs)) return false;
  const target = realPath(abs);
  const root = mediaRoots.get(pluginId);
  if (root && (target === root || target.startsWith(root + sep))) return true;
  const set = mediaFiles.get(pluginId);
  return set ? set.has(target) : false;
}
