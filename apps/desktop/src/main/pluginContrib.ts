import { BrowserWindow, dialog, ipcMain, net, shell, type Session, type WebContents } from "electron";
import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, extname, isAbsolute, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  hasPluginContributes,
  hasPluginUi,
  parsePluginContributes,
  parsePluginUi,
  type PluginFanAction,
  type PluginContributes,
  type PluginUi
} from "@hoshi/shared";
import { pluginKvGet, pluginKvSet, sanitizeOpenTarget } from "@hoshi/agent";
import { pluginTemplateOf, resolveActiveTheme, type ThemeTokens } from "./workbenchSandbox";
import {
  disposeAllPluginCaps,
  disposePluginCaps,
  isPluginMediaAllowed,
  allowPluginMediaPaths,
  setPluginMediaRoot
} from "./pluginCaps";
import { disposeAllPluginExecute, disposePluginExecute } from "./pluginExecuteHost";
import {
  clampPanelSize,
  panelBoundsFromPet,
  parsePanelSize
} from "./pluginPanelLayout";

const REL_SEG = /^[A-Za-z0-9._-]+$/;
const IMAGE_EXT = new Set([".png", ".webp", ".jpg", ".jpeg"]);
const PLUGIN_CSP =
  "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: file: hoshi-media: https:; media-src 'self' blob: file: data: hoshi-media:; connect-src https: http: ws: wss:; font-src 'self' data:;";
const windows = new Map<string, BrowserWindow>();
const contentsToPlugin = new WeakMap<WebContents, string>();
const pluginContents = new Map<string, Set<WebContents>>();
const pluginDirs = new Map<string, string>();
let closeIpc = false;
let kvIpc = false;
const cspSessions = new WeakSet<Session>();
const mediaBound = new WeakMap<Session, string>();
const mediaRedirects = new WeakSet<Session>();
let storageDir = "";
let getMainWindow: () => BrowserWindow | null = () => null;
let windowSize = { width: 520, height: 360 };
let panelWin: BrowserWindow | null = null;
let panelPluginId = "";
let panelWidth = 0;
let panelHeight = 0;
let mainMoveWin: BrowserWindow | null = null;
let mainMoveFollow: (() => void) | null = null;
let runPlugin: ((pluginId: string, args: Record<string, unknown>) => Promise<string>) | null = null;
let getTheme: () => { id: string; tokens: ThemeTokens } | null = () => null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expandOpenTarget(raw: string): string {
  let target = raw.trim();
  if (/^file:/i.test(target)) {
    try {
      target = fileURLToPath(target);
    } catch {
      try {
        target = decodeURIComponent(target.replace(/^file:\/\/(localhost)?/i, ""));
      } catch {
        /* keep */
      }
    }
  }
  if (target.startsWith("~/")) target = join(homedir(), target.slice(2));
  return target;
}

function runMacOpen(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("/usr/bin/open", args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    child.stderr?.on("data", (chunk) => {
      err += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(err.trim() || "启动失败"));
    });
  });
}

function mdfind(expr: string): Promise<string[]> {
  return new Promise((resolve) => {
    const child = spawn("/usr/bin/mdfind", [expr], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    child.stdout?.on("data", (chunk) => {
      out += String(chunk);
    });
    child.on("error", () => resolve([]));
    child.on("close", () => {
      resolve(
        out
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
      );
    });
  });
}

function listMacApps(): string[] {
  const roots = [
    "/Applications",
    join(homedir(), "Applications"),
    "/System/Applications",
    "/System/Applications/Utilities"
  ];
  const apps: string[] = [];
  for (const root of roots) {
    let names: string[] = [];
    try {
      names = readdirSync(root);
    } catch {
      continue;
    }
    for (const name of names) {
      if (name.endsWith(".app")) apps.push(join(root, name));
    }
  }
  return apps;
}

function mdlsRaw(appPath: string, key: string): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn("/usr/bin/mdls", ["-name", key, "-raw", appPath], {
      stdio: ["ignore", "pipe", "ignore"]
    });
    let out = "";
    child.stdout?.on("data", (chunk) => {
      out += String(chunk);
    });
    child.on("error", () => resolve(""));
    child.on("close", () => {
      const text = out.replace(/\0/g, "").trim();
      resolve(!text || text === "(null)" ? "" : text);
    });
  });
}

export type HostAppInfo = { name: string; path: string; names: string[] };
export type PluginPickOpts = {
  multiple?: boolean;
  directories?: boolean;
  filters?: { name: string; extensions: string[] }[];
};

export async function listHostApps(): Promise<HostAppInfo[]> {
  if (process.platform !== "darwin") return [];
  const apps = listMacApps();
  return Promise.all(
    apps.map(async (appPath) => {
      const stem = basename(appPath, ".app");
      const display = await mdlsRaw(appPath, "kMDItemDisplayName");
      const names = [...new Set([stem, display].filter(Boolean))];
      return { name: display || stem, path: appPath, names };
    })
  );
}

export async function pickHostFiles(opts?: PluginPickOpts, parent?: BrowserWindow | null): Promise<string[]> {
  const properties: Array<"openFile" | "openDirectory" | "multiSelections"> = [];
  if (opts?.directories) properties.push("openDirectory");
  else properties.push("openFile");
  if (opts?.multiple !== false) properties.push("multiSelections");
  const filters = Array.isArray(opts?.filters)
    ? opts.filters.filter(
        (item) => item && typeof item.name === "string" && Array.isArray(item.extensions) && item.extensions.length > 0
      )
    : [];
  if (!opts?.directories && filters.length === 0) {
    throw new Error("pick 必须带 filters");
  }
  const dialogOpts = {
    properties,
    ...(filters.length > 0 ? { filters } : {})
  };
  const picked = parent
    ? await dialog.showOpenDialog(parent, dialogOpts)
    : await dialog.showOpenDialog(dialogOpts);
  return picked.canceled ? [] : picked.filePaths;
}

function mediaUrlFor(pluginId: string, abs: string): string {
  const norm = abs.replace(/\\/g, "/");
  return `hoshi-media://plugin/?id=${encodeURIComponent(pluginId)}&p=${encodeURIComponent(norm)}`;
}

function parseMediaRequest(url: string): { id: string; abs: string } | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "hoshi-media:") return null;
    if (parsed.hostname !== "plugin") return null;
    const id = parsed.searchParams.get("id") || "";
    const fromQuery = parsed.searchParams.get("p");
    if (!id || !fromQuery) return null;
    return { id, abs: decodeURIComponent(fromQuery) };
  } catch {
    return null;
  }
}

function handleMediaRequest(pluginId: string, request: Request): Response | Promise<Response> {
  const parsed = parseMediaRequest(request.url);
  if (!parsed || parsed.id !== pluginId) {
    return new Response("forbidden", { status: 403 });
  }
  const abs = parsed.abs;
  if (!isAbsolute(abs) || abs.includes("\0") || !existsSync(abs) || !statSync(abs).isFile()) {
    return new Response("not found", { status: 404 });
  }
  if (!isPluginMediaAllowed(pluginId, abs)) {
    return new Response("forbidden", { status: 403 });
  }
  const headers: Record<string, string> = {};
  const range = request.headers.get("range");
  if (range) headers.Range = range;
  return net.fetch(pathToFileURL(abs).href, {
    method: request.method,
    headers,
    bypassCustomProtocolHandlers: true
  });
}

function ensureMediaProtocol(ses: Session, pluginId: string): void {
  if (mediaBound.has(ses)) return;
  mediaBound.set(ses, pluginId);
  try {
    ses.protocol.handle("hoshi-media", (request) => handleMediaRequest(pluginId, request));
  } catch {
    /* already registered on this session */
  }
}

function hookMediaRedirect(session: Session, pluginId: string): void {
  if (mediaRedirects.has(session)) return;
  mediaRedirects.add(session);
  session.webRequest.onBeforeRequest({ urls: ["file://*"] }, (details, callback) => {
    try {
      const abs = fileURLToPath(details.url);
      if (!abs || isPluginMediaAllowed(pluginId, abs)) {
        callback({});
        return;
      }
      callback({ redirectURL: mediaUrlFor(pluginId, abs) });
    } catch {
      callback({});
    }
  });
}

async function resolveMacApp(target: string): Promise<string | null> {
  if (existsSync(target)) return target;
  const name = basename(target).replace(/\.app$/i, "");
  if (!name) return null;
  const safe = name.replace(/["\\]/g, "");
  const hits = await mdfind(
    `kMDItemContentType == "com.apple.application-bundle" && kMDItemDisplayName == "${safe}"`
  );
  const fromMd = hits.find((path) => path.endsWith(".app") && existsSync(path));
  if (fromMd) return fromMd;
  const needle = name.toLowerCase();
  return listMacApps().find((path) => basename(path, ".app").toLowerCase() === needle) ?? null;
}

export async function openHostAppName(raw: unknown): Promise<string> {
  const name = String(raw ?? "").trim();
  if (
    !name ||
    name.length > 256 ||
    /[/\\]/.test(name) ||
    name.startsWith("~") ||
    /^file:/i.test(name) ||
    /^(https?:|mailto:)/i.test(name)
  ) {
    throw new Error("只许应用名");
  }
  if (process.platform === "darwin") {
    const resolved = await resolveMacApp(name);
    if (resolved) {
      await runMacOpen([resolved]);
      return "已打开";
    }
    if (/^[A-Za-z0-9][A-Za-z0-9-]*(\.[A-Za-z0-9][A-Za-z0-9-]*){2,}$/.test(name)) {
      await runMacOpen(["-b", name]);
      return "已打开";
    }
    await runMacOpen(["-a", name.replace(/\.app$/i, "")]);
    return "已打开";
  }
  throw new Error("只许应用名");
}

export async function openHostTarget(raw: unknown): Promise<string> {
  const target = expandOpenTarget(sanitizeOpenTarget(raw));
  if (/^(https?:|mailto:)/i.test(target)) {
    await shell.openExternal(target);
    return "已打开";
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(target)) {
    await shell.openExternal(target);
    return "已打开";
  }
  if (process.platform === "darwin") {
    const resolved = (await resolveMacApp(target)) ?? target;
    if (existsSync(resolved)) {
      await runMacOpen([resolved]);
      return "已打开";
    }
    if (/^[A-Za-z0-9][A-Za-z0-9-]*(\.[A-Za-z0-9][A-Za-z0-9-]*){2,}$/.test(target)) {
      await runMacOpen(["-b", target]);
      return "已打开";
    }
    const appName = basename(target).replace(/\.app$/i, "");
    if (!target.includes("/") || /\.app$/i.test(target)) {
      await runMacOpen(["-a", appName]);
      return "已打开";
    }
    throw new Error("路径没找到，启动失败");
  }
  const err = await shell.openPath(target);
  if (err) throw new Error(err);
  return "已打开";
}

function isInside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

function resolveRel(root: string, rel: string): string {
  const parts = rel
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part && part !== ".");
  if (parts.length === 0 || parts.some((part) => part === ".." || !REL_SEG.test(part))) {
    throw new Error("路径非法");
  }
  const target = join(root, ...parts);
  if (!existsSync(target)) {
    throw new Error("资源不存在");
  }
  const real = realpathSync(target);
  if (real !== root && !isInside(root, real)) {
    throw new Error("路径非法");
  }
  return real;
}

type HostedPlugin = {
  id: string;
  name: string;
  dir: string;
  contributes?: PluginContributes;
  ui?: PluginUi;
  menuLabel: string;
};

function readPluginHost(dir: string): Omit<HostedPlugin, "dir"> | null {
  const manifestPath = join(dir, "plugin.json");
  if (!existsSync(manifestPath)) {
    return null;
  }
  try {
    const raw = JSON.parse(readFileSync(manifestPath, "utf8")) as unknown;
    if (!isRecord(raw) || typeof raw.id !== "string") {
      return null;
    }
    const contributes = parsePluginContributes(raw.contributes);
    const ui = parsePluginUi(raw.ui);
    const tpl = pluginTemplateOf(dir);
    const hostChrome = tpl === "panel" || tpl === "launcher";
    if (!hasPluginContributes(contributes) && !hasPluginUi(ui) && !hostChrome) {
      return null;
    }
    const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : raw.id.trim();
    const uiRec = isRecord(raw.ui) && isRecord(raw.ui.menu) ? raw.ui.menu : {};
    const slots = isRecord(raw.slots) ? raw.slots : {};
    const menuLabel =
      (typeof slots.title === "string" && slots.title.trim()
        ? slots.title.trim()
        : typeof uiRec.label === "string"
          ? uiRec.label.trim()
          : "") || name;
    return {
      id: raw.id.trim(),
      name,
      menuLabel: menuLabel.slice(0, 8),
      ...(contributes && hasPluginContributes(contributes) ? { contributes } : {}),
      ...(ui ? { ui } : {})
    };
  } catch {
    return null;
  }
}

function enabledPlugins(pluginsDir: string, enabled: string[]): HostedPlugin[] {
  if (!existsSync(pluginsDir)) {
    return [];
  }
  const allow = new Set(enabled);
  const byId = new Map<string, HostedPlugin>();
  for (const name of readdirSync(pluginsDir)) {
    const dir = join(pluginsDir, name);
    try {
      if (!statSync(dir).isDirectory()) {
        continue;
      }
    } catch {
      continue;
    }
    const parsed = readPluginHost(dir);
    if (!parsed || !allow.has(parsed.id)) {
      continue;
    }
    byId.set(parsed.id, { ...parsed, dir: realpathSync(dir) });
  }
  return enabled.flatMap((id) => {
    const item = byId.get(id);
    return item ? [item] : [];
  });
}

function hookCsp(session: Session): void {
  if (cspSessions.has(session)) {
    return;
  }
  cspSessions.add(session);
  session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [PLUGIN_CSP]
      }
    });
  });
}

function unhookMainMove(): void {
  if (mainMoveWin && mainMoveFollow && !mainMoveWin.isDestroyed()) {
    mainMoveWin.removeListener("move", mainMoveFollow);
    mainMoveWin.removeListener("moved", mainMoveFollow);
  }
  mainMoveWin = null;
  mainMoveFollow = null;
}

function hookMainMove(win: BrowserWindow): void {
  unhookMainMove();
  const follow = (): void => {
    if (panelWin && !panelWin.isDestroyed() && panelWidth > 0 && panelHeight > 0) {
      layoutPanel(panelWidth, panelHeight);
    }
  };
  mainMoveWin = win;
  mainMoveFollow = follow;
  win.on("move", follow);
  win.on("moved", follow);
}

function layoutPanel(pw: number, ph: number): void {
  const win = getMainWindow();
  if (!win || win.isDestroyed() || !panelWin || panelWin.isDestroyed()) {
    return;
  }
  const size = clampPanelSize(pw, ph);
  panelWidth = size.width;
  panelHeight = size.height;
  panelWin.setBounds(panelBoundsFromPet(win.getBounds(), size), false);
}

export function closePluginPanel(): void {
  unhookMainMove();
  const dying = panelWin;
  panelWin = null;
  panelPluginId = "";
  panelWidth = 0;
  panelHeight = 0;
  if (dying && !dying.isDestroyed()) {
    dying.destroy();
  }
}

function pluginIdOf(sender: WebContents): string | undefined {
  return contentsToPlugin.get(sender);
}

function templateOf(pluginId: string) {
  const dir = pluginDirs.get(pluginId);
  return dir ? pluginTemplateOf(dir) : "theme";
}

function handlePluginClose(sender: WebContents): boolean {
  if (panelWin && sender === panelWin.webContents) {
    closePluginPanel();
    return true;
  }
  return false;
}

function ensureCloseIpc(): void {
  if (closeIpc) {
    return;
  }
  closeIpc = true;
  ipcMain.on("hoshi:plugin-close", (event) => {
    if (handlePluginClose(event.sender)) {
      return;
    }
    const win = BrowserWindow.fromWebContents(event.sender);
    const main = getMainWindow();
    if (win && win !== main && !win.isDestroyed()) {
      win.close();
    }
  });
  ipcMain.on("hoshi:plugin-id", (event) => {
    event.returnValue = pluginIdOf(event.sender) ?? "";
  });
}

function pluginSlotsOf(pluginId: string): {
  title: string;
  multiple: boolean;
  filters: { name: string; extensions: string[] }[];
} {
  const dir = pluginDirs.get(pluginId);
  const fallback = { title: pluginId, multiple: true, filters: [] as { name: string; extensions: string[] }[] };
  if (!dir) return fallback;
  try {
    const raw = JSON.parse(readFileSync(join(dir, "plugin.json"), "utf8")) as unknown;
    if (!isRecord(raw)) return fallback;
    const uiRec = isRecord(raw.ui) && isRecord(raw.ui.menu) ? raw.ui.menu : {};
    const menuLabel = typeof uiRec.label === "string" ? uiRec.label.trim() : "";
    const slots = isRecord(raw.slots) ? raw.slots : {};
    const title =
      typeof slots.title === "string" && slots.title.trim()
        ? slots.title.trim().slice(0, 24)
        : menuLabel || (typeof raw.name === "string" ? raw.name.trim() : pluginId);
    const multiple = slots.multiple !== false;
    const filters = Array.isArray(slots.filters)
      ? slots.filters.flatMap((item) => {
          if (!isRecord(item) || typeof item.name !== "string" || !Array.isArray(item.extensions)) return [];
          const extensions = item.extensions.map((ext) => String(ext)).filter(Boolean);
          return extensions.length ? [{ name: item.name, extensions }] : [];
        })
      : [];
    return { title, multiple, filters };
  } catch {
    return fallback;
  }
}

function ensureKvIpc(): void {
  if (kvIpc) {
    return;
  }
  kvIpc = true;
  ipcMain.handle("hoshi:plugin-kv-get", (event, key: unknown) => {
    const id = pluginIdOf(event.sender);
    if (!id || !storageDir) {
      throw new Error("forbidden");
    }
    return pluginKvGet(storageDir, id, String(key ?? ""));
  });
  ipcMain.handle("hoshi:plugin-kv-set", (event, key: unknown, value: unknown) => {
    const id = pluginIdOf(event.sender);
    if (!id || !storageDir) {
      throw new Error("forbidden");
    }
    pluginKvSet(storageDir, id, String(key ?? ""), value);
    notifyPluginKv(id, String(key ?? ""), typeof value === "string" ? value : JSON.stringify(value ?? ""));
  });
  ipcMain.handle("hoshi:plugin-slots", (event) => {
    const id = pluginIdOf(event.sender);
    if (!id) throw new Error("forbidden");
    return pluginSlotsOf(id);
  });
  ipcMain.handle("hoshi:plugin-layout", (event) => {
    const id = pluginIdOf(event.sender);
    if (!id) throw new Error("forbidden");
    const dir = pluginDirs.get(id);
    if (!dir) return { nodes: [] };
    try {
      const raw = JSON.parse(readFileSync(join(dir, "layout.json"), "utf8")) as unknown;
      const nodes = isRecord(raw) && Array.isArray(raw.nodes) ? raw.nodes : [];
      return {
        nodes: nodes.map((item) => {
          if (!isRecord(item)) return item;
          if (typeof item.src === "string" && item.src && !isAbsolute(item.src)) {
            return { ...item, src: join(dir, item.src) };
          }
          return item;
        })
      };
    } catch {
      return { nodes: [] };
    }
  });
  ipcMain.handle("hoshi:plugin-theme", () => getTheme()?.tokens ?? null);
  ipcMain.handle("hoshi:plugin-pick", async (event, opts: unknown) => {
    const id = pluginIdOf(event.sender);
    if (!id) {
      throw new Error("forbidden");
    }
    if (templateOf(id) !== "panel") {
      throw new Error("ctx 禁止 pick");
    }
    const rec = isRecord(opts) ? opts : {};
    const filters = Array.isArray(rec.filters)
      ? rec.filters.flatMap((item) => {
          if (!isRecord(item) || typeof item.name !== "string" || !Array.isArray(item.extensions)) return [];
          return [
            {
              name: item.name,
              extensions: item.extensions.map((ext) => String(ext))
            }
          ];
        })
      : undefined;
    return pickHostFiles(
      {
        multiple: rec.multiple !== false,
        directories: rec.directories === true,
        filters
      },
      BrowserWindow.fromWebContents(event.sender) ?? getMainWindow()
    ).then((paths) => {
      allowPluginMediaPaths(id, paths);
      return paths;
    });
  });
  ipcMain.handle("hoshi:plugin-panel-size", (event, payload: unknown) => {
    if (!panelWin || event.sender !== panelWin.webContents) {
      throw new Error("forbidden");
    }
    const size = parsePanelSize(payload);
    layoutPanel(size.width, size.height);
  });
  ipcMain.handle("hoshi:plugin-run", async (event, args: unknown) => {
    const id = pluginIdOf(event.sender);
    if (!id || !runPlugin) {
      throw new Error("forbidden");
    }
    if (templateOf(id) !== "panel") {
      throw new Error("ctx 禁止 run");
    }
    const rec = isRecord(args) ? args : {};
    return runPlugin(id, rec);
  });
  ipcMain.handle("hoshi:plugin-open-external", async (event, target: unknown) => {
    const id = pluginIdOf(event.sender);
    if (!id || templateOf(id) !== "launcher") {
      throw new Error("forbidden");
    }
    return openHostAppName(String(target ?? ""));
  });
  ipcMain.handle("hoshi:plugin-list-apps", async (event) => {
    const id = pluginIdOf(event.sender);
    if (!id || templateOf(id) !== "launcher") throw new Error("forbidden");
    return listHostApps();
  });
  ipcMain.handle("hoshi:plugin-clipboard-read", () => {
    throw new Error("forbidden");
  });
  ipcMain.handle("hoshi:plugin-clipboard-write", () => {
    throw new Error("forbidden");
  });
  ipcMain.handle("hoshi:plugin-shortcut-on", () => {
    throw new Error("forbidden");
  });
  ipcMain.handle("hoshi:plugin-shortcut-off", () => {
    throw new Error("forbidden");
  });
}

export function configurePluginHost(input: {
  storageDir: string;
  getMainWindow: () => BrowserWindow | null;
  windowSize: { width: number; height: number };
  getTheme?: () => { id: string; tokens: ThemeTokens } | null;
}): void {
  storageDir = input.storageDir;
  getMainWindow = input.getMainWindow;
  windowSize = input.windowSize;
  if (input.getTheme) getTheme = input.getTheme;
  ensureCloseIpc();
  ensureKvIpc();
}

export function setPluginRun(
  fn: (pluginId: string, args: Record<string, unknown>) => Promise<string>
): void {
  runPlugin = fn;
}

export function notifyPluginKv(pluginId: string, key: string, value: string): void {
  const set = pluginContents.get(pluginId);
  if (!set) {
    return;
  }
  for (const wc of set) {
    if (!wc.isDestroyed()) {
      wc.send("hoshi:plugin-kv-change", { key, value });
    }
  }
}

export function listPluginFanActions(pluginsDir: string, enabled: string[]): PluginFanAction[] {
  const out: PluginFanAction[] = [];
  for (const plugin of enabledPlugins(pluginsDir, enabled)) {
    const tpl = pluginTemplateOf(plugin.dir);
    if (tpl === "panel" || tpl === "launcher") {
      out.push({
        pluginId: plugin.id,
        id: `ui:${plugin.id}`,
        label: plugin.menuLabel,
        window: "panel",
        kind: "panel"
      });
    }
  }
  return out.slice(0, 8);
}

export function pluginSpriteFile(pluginsDir: string, enabled: string[], emotion: string): string | null {
  let found: string | null = null;
  for (const plugin of enabledPlugins(pluginsDir, enabled)) {
    if (pluginTemplateOf(plugin.dir) !== "theme") {
      continue;
    }
    const rel = plugin.contributes?.sprites?.[emotion as keyof NonNullable<PluginContributes["sprites"]>];
    if (!rel) {
      continue;
    }
    try {
      const file = resolveRel(plugin.dir, rel);
      if (IMAGE_EXT.has(extname(file).toLowerCase()) && statSync(file).isFile()) {
        found = file;
      }
    } catch {
      continue;
    }
  }
  return found;
}

function bindWebContents(wc: WebContents, pluginId: string, pluginDir: string): void {
  contentsToPlugin.set(wc, pluginId);
  pluginDirs.set(pluginId, pluginDir);
  let set = pluginContents.get(pluginId);
  if (!set) {
    set = new Set();
    pluginContents.set(pluginId, set);
  }
  set.add(wc);
  wc.on("destroyed", () => {
    set.delete(wc);
  });
  hookCsp(wc.session);
  ensureMediaProtocol(wc.session, pluginId);
  setPluginMediaRoot(pluginId, pluginDir);
  hookMediaRedirect(wc.session, pluginId);
  wc.setWindowOpenHandler(() => ({ action: "deny" }));
  wc.on("will-navigate", (event, url) => {
    if (url !== wc.getURL()) {
      event.preventDefault();
    }
  });
}

export function openPluginPanel(pluginsDir: string, enabled: string[], pluginId: string): void {
  ensureCloseIpc();
  ensureKvIpc();
  const plugin = enabledPlugins(pluginsDir, enabled).find((item) => item.id === pluginId);
  if (!plugin) {
    throw new Error("面板不存在");
  }
  const tpl = pluginTemplateOf(plugin.dir);
  if (tpl !== "panel" && tpl !== "launcher") {
    throw new Error("面板不存在");
  }
  const entry = join(
    __dirname,
    "../resources/plugin-chrome",
    tpl === "launcher" ? "launcher.html" : "player.html"
  );
  if (extname(entry).toLowerCase() !== ".html" || !statSync(entry).isFile()) {
    throw new Error("入口无效");
  }
  const win = getMainWindow();
  if (!win || win.isDestroyed()) {
    throw new Error("窗口不存在");
  }
  const want = tpl === "launcher" ? clampPanelSize(280, 420) : clampPanelSize(280, 360);
  if (panelWin && panelPluginId === pluginId && !panelWin.isDestroyed()) {
    layoutPanel(panelWidth || want.width, panelHeight || want.height);
    panelWin.show();
    panelWin.focus();
    return;
  }
  closePluginPanel();
  const size = want;
  panelWidth = size.width;
  panelHeight = size.height;
  panelPluginId = pluginId;
  hookMainMove(win);
  const pet = win.getBounds();
  const view = new BrowserWindow({
    ...panelBoundsFromPet(pet, size),
    frame: false,
    transparent: false,
    hasShadow: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/pluginView.js"),
      partition: `persist:hoshi-plugin-${pluginId}`,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      autoplayPolicy: "no-user-gesture-required"
    }
  });
  panelWin = view;
  view.setAlwaysOnTop(true);
  view.on("closed", () => {
    if (panelWin === view) {
      panelWin = null;
      panelPluginId = "";
      panelWidth = 0;
      panelHeight = 0;
    }
  });
  layoutPanel(size.width, size.height);
  bindWebContents(view.webContents, pluginId, plugin.dir);
  view.webContents.setAudioMuted(false);
  void view.webContents.loadFile(entry).then(() => {
    if (!view.isDestroyed()) {
      view.show();
    }
  });
}

export function openPluginWindow(
  _pluginsDir: string,
  _enabled: string[],
  _pluginId: string,
  _windowId: string
): void {
  throw new Error("窗口不存在");
}

export function closePluginRuntime(pluginId: string): void {
  disposePluginCaps(pluginId);
  disposePluginExecute(pluginId);
  pluginContents.delete(pluginId);
  pluginDirs.delete(pluginId);
  if (panelPluginId === pluginId) {
    closePluginPanel();
  }
  const prefix = `${pluginId}:`;
  for (const [key, win] of [...windows.entries()]) {
    if (!key.startsWith(prefix)) continue;
    windows.delete(key);
    if (!win.isDestroyed()) win.close();
  }
}

export function closePluginWindows(): void {
  disposeAllPluginCaps();
  disposeAllPluginExecute();
  closePluginPanel();
  for (const win of windows.values()) {
    if (!win.isDestroyed()) {
      win.close();
    }
  }
  windows.clear();
  pluginContents.clear();
  pluginDirs.clear();
}
