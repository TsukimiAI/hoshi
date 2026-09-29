type ParentPort = {
  on(event: "message", listener: (e: { data: unknown }) => void): void;
  postMessage(data: unknown): void;
};

const parentPort = (process as NodeJS.Process & { parentPort?: ParentPort }).parentPort;

function insideRoot(root: string, target: string): boolean {
  const path = require("path") as typeof import("path");
  const abs = path.resolve(target);
  const base = path.resolve(root);
  return abs === base || abs.startsWith(base + path.sep);
}

function writingFlags(flags: unknown): boolean {
  if (flags == null) return false;
  if (typeof flags === "number") {
    const c = require("fs").constants as { O_WRONLY: number; O_RDWR: number; O_APPEND: number };
    return (flags & (c.O_WRONLY | c.O_RDWR | c.O_APPEND)) !== 0;
  }
  const s = String(flags);
  return /[aw]/i.test(s) || s.includes("+");
}

function patchFs(pluginRoot: string): void {
  const fs = require("fs") as Record<string, unknown> & { __hoshiPatch?: boolean };
  if (fs.__hoshiPatch) return;
  fs.__hoshiPatch = true;
  const wrapPath = (name: string, idx: number): void => {
    const orig = fs[name];
    if (typeof orig !== "function") return;
    fs[name] = (...args: unknown[]) => {
      const p = args[idx];
      if (typeof p === "string" && !insideRoot(pluginRoot, p)) {
        throw new Error("插件禁止写插件目录外");
      }
      return (orig as (...a: unknown[]) => unknown).apply(fs, args);
    };
  };
  const wrapDest = (name: string): void => {
    const orig = fs[name];
    if (typeof orig !== "function") return;
    fs[name] = (...args: unknown[]) => {
      const dest = args[1];
      if (typeof dest === "string" && !insideRoot(pluginRoot, dest)) {
        throw new Error("插件禁止写插件目录外");
      }
      return (orig as (...a: unknown[]) => unknown).apply(fs, args);
    };
  };
  for (const name of [
    "writeFileSync",
    "writeFile",
    "appendFileSync",
    "appendFile",
    "mkdirSync",
    "mkdir",
    "unlinkSync",
    "unlink",
    "rmSync",
    "rm",
    "rmdirSync",
    "rmdir",
    "truncateSync",
    "truncate",
    "chmodSync",
    "chmod",
    "createWriteStream"
  ]) {
    wrapPath(name, 0);
  }
  wrapDest("renameSync");
  wrapDest("rename");
  wrapDest("copyFileSync");
  wrapDest("copyFile");
  const wrapOpen = (name: string): void => {
    const orig = fs[name];
    if (typeof orig !== "function") return;
    fs[name] = (...args: unknown[]) => {
      const p = args[0];
      if (typeof p === "string" && writingFlags(args[1]) && !insideRoot(pluginRoot, p)) {
        throw new Error("插件禁止写插件目录外");
      }
      return (orig as (...a: unknown[]) => unknown).apply(fs, args);
    };
  };
  wrapOpen("openSync");
  wrapOpen("open");
  const promises = fs.promises as Record<string, unknown> | undefined;
  if (promises) {
    const wrapP = (name: string, idx: number): void => {
      const orig = promises[name];
      if (typeof orig !== "function") return;
      promises[name] = (...args: unknown[]) => {
        const p = args[idx];
        if (typeof p === "string" && !insideRoot(pluginRoot, p)) {
          throw new Error("插件禁止写插件目录外");
        }
        return (orig as (...a: unknown[]) => unknown).apply(promises, args);
      };
    };
    wrapP("writeFile", 0);
    wrapP("appendFile", 0);
    wrapP("mkdir", 0);
    wrapP("unlink", 0);
    wrapP("rm", 0);
    wrapP("rmdir", 0);
    wrapP("truncate", 0);
    wrapP("rename", 1);
    wrapP("copyFile", 1);
  }
}

let requireBlocked = false;

function blockUnsafeRequire(): void {
  if (requireBlocked) return;
  requireBlocked = true;
  const Module = require("module") as { _load: (request: string, parent: unknown, isMain: boolean) => unknown };
  const orig = Module._load.bind(Module);
  Module._load = (request, parent, isMain) => {
    const name = String(request).replace(/^node:/, "");
    if (name === "child_process" || name === "electron" || name.startsWith("electron/")) {
      throw new Error(`插件禁止 ${request}`);
    }
    return orig(request, parent, isMain);
  };
}

function rpc(method: string, params: unknown): Promise<unknown> {
  const callId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return new Promise((resolve, reject) => {
    pending.set(callId, { resolve, reject });
    parentPort?.postMessage({ type: "ctx", callId, method, params });
  });
}

const pending = new Map<string, { resolve: (value: unknown) => void; reject: (err: Error) => void }>();

function makeCtx(config: Record<string, string>) {
  return {
    config,
    storage: {
      get: (key: string) => rpc("storage.get", { key }) as Promise<string | null>,
      set: (key: string, value: unknown) => {
        void rpc("storage.set", { key, value });
      }
    },
    openExternal: (target: string) => rpc("openExternal", { target }) as Promise<string>,
    listApps: () => rpc("listApps", {}) as Promise<unknown>,
    pick: (opts?: unknown) => rpc("pick", { opts }) as Promise<string[]>,
    notify: (title: string, body?: string) => rpc("notify", { title, body }) as Promise<unknown>
  };
}

async function run(pluginPath: string, args: Record<string, unknown>, config: Record<string, string>): Promise<string> {
  const path = require("path") as typeof import("path");
  patchFs(path.dirname(path.resolve(pluginPath)));
  blockUnsafeRequire();
  delete require.cache[require.resolve(pluginPath)];
  const mod = require(pluginPath) as { execute?: (a: unknown, c: unknown) => Promise<string> };
  if (typeof mod.execute !== "function") {
    throw new Error("缺少 execute");
  }
  const ctx = makeCtx(config);
  const out = await mod.execute(args, ctx);
  return String(out ?? "");
}

parentPort?.on("message", (event) => {
  const msg = event.data as Record<string, unknown>;
  if (msg.type === "ctx-ok") {
    pending.get(String(msg.callId))?.resolve(msg.value);
    pending.delete(String(msg.callId));
    return;
  }
  if (msg.type === "ctx-err") {
    pending.get(String(msg.callId))?.reject(new Error(String(msg.error ?? "ctx 失败")));
    pending.delete(String(msg.callId));
    return;
  }
  if (msg.type !== "run") return;
  const reqId = String(msg.reqId ?? "");
  void run(String(msg.pluginPath ?? ""), (msg.args as Record<string, unknown>) ?? {}, (msg.config as Record<string, string>) ?? {})
    .then((result) => parentPort?.postMessage({ type: "done", reqId, ok: true, result }))
    .catch((error: unknown) =>
      parentPort?.postMessage({
        type: "done",
        reqId,
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      })
    );
});
