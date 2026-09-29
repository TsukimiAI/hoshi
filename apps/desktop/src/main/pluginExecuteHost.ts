import { utilityProcess, type UtilityProcess } from "electron";
import { join, dirname } from "node:path";
import { pluginKvGet, pluginKvSet } from "@hoshi/agent";
import { allowPluginMediaPaths } from "./pluginCaps";
import { pluginTemplateOf, type PluginTemplateKind } from "./workbenchSandbox";

type PendingRun = {
  resolve: (value: string) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

const CTX_ALLOW: Record<PluginTemplateKind, Set<string>> = {
  panel: new Set(["storage.get", "storage.set", "pick"]),
  launcher: new Set(["listApps", "openExternal"]),
  mcp: new Set(),
  theme: new Set()
};

const workers = new Map<string, UtilityProcess>();
const runs = new Map<string, PendingRun>();
const pluginRoots = new Map<string, string>();
let storageDir = "";
let pluginsDir = "";
let openExternal: ((target: unknown) => Promise<string>) | null = null;
let listApps: (() => Promise<unknown>) | null = null;
let pickFiles: ((opts?: unknown) => Promise<string[]>) | null = null;

export function configureIsolatedExecute(input: {
  storageDir: string;
  pluginsDir: string;
  openExternal: (target: unknown) => Promise<string>;
  listApps: () => Promise<unknown>;
  pick: (opts?: unknown) => Promise<string[]>;
}): void {
  storageDir = input.storageDir;
  pluginsDir = input.pluginsDir;
  openExternal = input.openExternal;
  listApps = input.listApps;
  pickFiles = input.pick;
}

function workerPath(): string {
  return join(__dirname, "pluginExecuteWorker.js");
}

function ensureWorker(pluginId: string): UtilityProcess {
  const existing = workers.get(pluginId);
  if (existing && existing.pid) return existing;
  const child = utilityProcess.fork(workerPath(), [], { stdio: "pipe" });
  child.on("message", (msg: unknown) => {
    void onWorkerMessage(pluginId, child, msg);
  });
  child.on("exit", () => {
    if (workers.get(pluginId) === child) workers.delete(pluginId);
    for (const [id, pending] of [...runs.entries()]) {
      if (id.startsWith(`${pluginId}:`)) {
        clearTimeout(pending.timer);
        pending.reject(new Error("插件进程已退出"));
        runs.delete(id);
      }
    }
  });
  workers.set(pluginId, child);
  return child;
}

async function dispatchCtx(pluginId: string, method: string, params: Record<string, unknown>): Promise<unknown> {
  const dir = pluginRoots.get(pluginId) ?? (pluginsDir ? join(pluginsDir, pluginId) : "");
  const allow = CTX_ALLOW[dir ? pluginTemplateOf(dir) : "theme"];
  if (!allow.has(method)) {
    throw new Error(`ctx 禁止 ${method}`);
  }
  if (method === "storage.get") {
    return storageDir ? pluginKvGet(storageDir, pluginId, String(params.key ?? "")) : null;
  }
  if (method === "storage.set") {
    if (storageDir) pluginKvSet(storageDir, pluginId, String(params.key ?? ""), params.value);
    return null;
  }
  if (method === "openExternal") {
    if (!openExternal) throw new Error("宿主未提供 openExternal");
    return openExternal(params.target);
  }
  if (method === "listApps") return listApps ? listApps() : [];
  if (method === "pick") {
    if (!pickFiles) throw new Error("宿主未提供 pick");
    const paths = await pickFiles(params.opts);
    allowPluginMediaPaths(pluginId, Array.isArray(paths) ? paths.map(String) : []);
    return paths;
  }
  throw new Error(`未知 ctx: ${method}`);
}

async function onWorkerMessage(pluginId: string, child: UtilityProcess, raw: unknown): Promise<void> {
  const msg = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  if (msg.type === "ctx") {
    const callId = String(msg.callId ?? "");
    try {
      const value = await dispatchCtx(pluginId, String(msg.method ?? ""), (msg.params as Record<string, unknown>) ?? {});
      child.postMessage({ type: "ctx-ok", callId, value });
    } catch (error) {
      child.postMessage({
        type: "ctx-err",
        callId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
    return;
  }
  if (msg.type !== "done") return;
  const reqId = String(msg.reqId ?? "");
  const pending = runs.get(reqId);
  if (!pending) return;
  clearTimeout(pending.timer);
  runs.delete(reqId);
  if (msg.ok === true) pending.resolve(String(msg.result ?? ""));
  else pending.reject(new Error(String(msg.error ?? "执行失败")));
}

export function disposePluginExecute(pluginId: string): void {
  pluginRoots.delete(pluginId);
  const child = workers.get(pluginId);
  workers.delete(pluginId);
  try {
    child?.kill();
  } catch {
    /* ignore */
  }
}

export function disposeAllPluginExecute(): void {
  for (const id of [...workers.keys()]) disposePluginExecute(id);
}

export function isolatedPluginRun(
  pluginId: string,
  mainPath: string,
  args: Record<string, unknown>,
  config: Record<string, string>
): Promise<string> {
  const tpl = pluginTemplateOf(dirname(mainPath));
  if (tpl === "panel" || tpl === "launcher") {
    return Promise.resolve(JSON.stringify({ ok: true }));
  }
  const reqId = `${pluginId}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  pluginRoots.set(pluginId, dirname(mainPath));
  const child = ensureWorker(pluginId);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      runs.delete(reqId);
      reject(new Error("插件执行超时"));
    }, 60_000);
    runs.set(reqId, { resolve, reject, timer });
    child.postMessage({ type: "run", reqId, pluginPath: mainPath, args, config });
  });
}
