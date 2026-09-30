import { BrowserWindow, dialog, ipcMain, shell, type Session, type WebContents } from "electron";
import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, extname, isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  hasPluginContributes,
  hasPluginUi,
  parsePluginContributes,
  parsePluginUi,
  type PluginAppItem,
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
  pluginIdForMediaPath,
  setPluginMediaRoot
} from "./pluginCaps";
import { disposeAllPluginExecute, disposePluginExecute } from "./pluginExecuteHost";
import {
  appsHomeSize,
  appsTemplateSize,
  clampPanelSize,
  panelBoundsFromPet,
  parsePanelSize
} from "./pluginPanelLayout";
import { parseAudioTags, audioTagFromPath } from "./audioTags";
import { serveLocalMedia } from "./mediaFile";

export const HOST_MUSIC_ID = "hoshi_music";
export const HOST_SCHEDULE_ID = "hoshi_schedule";
const MUSIC_FILTERS = [{ name: "音频", extensions: ["mp3", "m4a", "flac", "wav", "aac", "ogg"] }];

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
let getMainWindowFn: () => BrowserWindow | null = () => null;
let onPanelLayout: (() => void) | null = null;
let onHostKvSet: ((pluginId: string, key: string) => void) | null = null;

export function getMainWindow(): BrowserWindow | null {
  return getMainWindowFn();
}

export function appsBoxSize(): { width: number; height: number } | null {
  if (!appsBox || !panelWin || panelWin.isDestroyed() || panelWidth <= 0 || panelHeight <= 0) {
    return null;
  }
  return { width: panelWidth, height: panelHeight };
}
let windowSize = { width: 520, height: 360 };
let panelWin: BrowserWindow | null = null;
let panelPluginId = "";
let appsBox = false;
let panelWidth = 0;
let panelHeight = 0;
let mainMoveWin: BrowserWindow | null = null;
let mainMoveFollow: (() => void) | null = null;
let runPlugin: ((pluginId: string, args: Record<string, unknown>) => Promise<string>) | null = null;
let getTheme: () => { id: string; tokens: ThemeTokens } | null = () => null;
let getPluginsDir: () => string = () => "";
let getEnabled: () => string[] = () => [];

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

function handleMediaRequest(request: Request): Response | Promise<Response> {
  const parsed = parseMediaRequest(request.url);
  if (!parsed) {
    return new Response("forbidden", { status: 403 });
  }
  const pluginId = parsed.id;
  const abs = parsed.abs;
  if (!isAbsolute(abs) || abs.includes("\0") || !existsSync(abs) || !statSync(abs).isFile()) {
    return new Response("not found", { status: 404 });
  }
  if (!isPluginMediaAllowed(pluginId, abs)) {
    return new Response("forbidden", { status: 403 });
  }
  return serveLocalMedia(abs, request);
}

function ensureMediaProtocol(ses: Session): void {
  if (mediaBound.has(ses)) return;
  mediaBound.set(ses, "*");
  try {
    ses.protocol.handle("hoshi-media", (request) => handleMediaRequest(request));
  } catch {
    /* already registered on this session */
  }
}

function hookMediaRedirect(session: Session): void {
  if (mediaRedirects.has(session)) return;
  mediaRedirects.add(session);
  session.webRequest.onBeforeRequest({ urls: ["file://*"] }, (details, callback) => {
    try {
      const abs = fileURLToPath(details.url);
      if (!abs) {
        callback({});
        return;
      }
      const id = pluginIdForMediaPath(abs);
      if (id && isPluginMediaAllowed(id, abs)) {
        callback({});
        return;
      }
      if (id) {
        callback({ redirectURL: mediaUrlFor(id, abs) });
        return;
      }
      callback({});
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
  onPanelLayout?.();
}

export function closePluginPanel(): void {
  unhookMainMove();
  const dying = panelWin;
  panelWin = null;
  panelPluginId = "";
  appsBox = false;
  panelWidth = 0;
  panelHeight = 0;
  if (dying && !dying.isDestroyed()) {
    dying.destroy();
  }
  onPanelLayout?.();
}

function pluginIdOf(sender: WebContents): string | undefined {
  return contentsToPlugin.get(sender);
}

function templateOf(pluginId: string) {
  if (pluginId === HOST_MUSIC_ID) return "panel";
  const dir = pluginDirs.get(pluginId);
  return dir ? pluginTemplateOf(dir) : "theme";
}

function canPickFiles(pluginId: string): boolean {
  return pluginId === HOST_MUSIC_ID || templateOf(pluginId) === "panel";
}

function canRunPlugin(pluginId: string): boolean {
  return pluginId !== HOST_MUSIC_ID && templateOf(pluginId) === "panel";
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

function pluginAppTitle(dir: string, fallback: string): string {
  try {
    const raw = JSON.parse(readFileSync(join(dir, "plugin.json"), "utf8")) as unknown;
    if (!isRecord(raw)) return fallback.slice(0, 24);
    const uiRec = isRecord(raw.ui) && isRecord(raw.ui.menu) ? raw.ui.menu : {};
    const menuLabel = typeof uiRec.label === "string" ? uiRec.label.trim() : "";
    const slots = isRecord(raw.slots) ? raw.slots : {};
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    const title =
      typeof slots.title === "string" && slots.title.trim()
        ? slots.title.trim()
        : menuLabel || name || fallback;
    return title.slice(0, 24);
  } catch {
    return fallback.slice(0, 24);
  }
}

function pluginSlotsOf(pluginId: string): {
  title: string;
  multiple: boolean;
  filters: { name: string; extensions: string[] }[];
} {
  const dir = pluginDirs.get(pluginId);
  if (pluginId === HOST_MUSIC_ID) {
    return { title: "音乐", multiple: true, filters: MUSIC_FILTERS };
  }
  const fallback = { title: pluginId, multiple: true, filters: [] as { name: string; extensions: string[] }[] };
  if (!dir) return fallback;
  try {
    const raw = JSON.parse(readFileSync(join(dir, "plugin.json"), "utf8")) as unknown;
    if (!isRecord(raw)) return fallback;
    const slots = isRecord(raw.slots) ? raw.slots : {};
    const title = pluginAppTitle(dir, pluginId);
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
    const keyText = String(key ?? "");
    notifyPluginKv(id, keyText, typeof value === "string" ? value : JSON.stringify(value ?? ""));
    onHostKvSet?.(id, keyText);
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
    if (!canPickFiles(id)) {
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
    if (appsBox) {
      return;
    }
    const size = parsePanelSize(payload);
    layoutPanel(size.width, size.height);
  });
  ipcMain.handle("hoshi:apps-set-size", (event, payload: unknown) => {
    if (!panelWin || event.sender !== panelWin.webContents || !appsBox) {
      throw new Error("forbidden");
    }
    const size = parsePanelSize(payload);
    layoutPanel(size.width, size.height);
  });
  ipcMain.handle("hoshi:list-plugin-apps", (event) => {
    if (!panelWin || event.sender !== panelWin.webContents || !appsBox) {
      throw new Error("forbidden");
    }
    const apps = listPluginApps(getPluginsDir(), getEnabled());
    return { apps, size: appsHomeSize(apps.length) };
  });
  ipcMain.handle("hoshi:plugin-activate", (event, pluginId: unknown) => {
    if (!panelWin || event.sender !== panelWin.webContents || !appsBox) {
      throw new Error("forbidden");
    }
    const id = String(pluginId ?? "");
    if (id === HOST_MUSIC_ID) {
      bindHostContents(event.sender, id);
      return { pluginId: id, template: "music" as const, size: appsTemplateSize("music") };
    }
    if (id === HOST_SCHEDULE_ID) {
      bindHostContents(event.sender, id);
      return { pluginId: id, template: "schedule" as const, size: appsTemplateSize("schedule") };
    }
    const plugin = enabledPlugins(getPluginsDir(), getEnabled()).find((item) => item.id === id);
    if (!plugin) {
      throw new Error("面板不存在");
    }
    const tpl = pluginTemplateOf(plugin.dir);
    if (tpl !== "panel" && tpl !== "launcher") {
      throw new Error("面板不存在");
    }
    bindWebContents(event.sender, id, plugin.dir);
    return { pluginId: id, template: tpl, size: appsTemplateSize(tpl) };
  });
  ipcMain.handle("hoshi:music-probe", (event, paths: unknown) => {
    const id = pluginIdOf(event.sender);
    if (id !== HOST_MUSIC_ID) {
      throw new Error("forbidden");
    }
    const list = Array.isArray(paths) ? paths.map((item) => String(item ?? "")) : [];
    const out = [];
    for (const file of list) {
      if (!file || !isAbsolute(file) || !existsSync(file)) continue;
      try {
        if (!statSync(file).isFile()) continue;
        allowPluginMediaPaths(id, [file]);
        const buf = readFileSync(file);
        const slice = buf.length > 4_000_000 ? buf.subarray(0, 4_000_000) : buf;
        out.push(parseAudioTags(file, slice));
      } catch {
        out.push(audioTagFromPath(file));
      }
    }
    return out;
  });
  ipcMain.handle("hoshi:plugin-run", async (event, args: unknown) => {
    const id = pluginIdOf(event.sender);
    if (!id || !runPlugin) {
      throw new Error("forbidden");
    }
    if (!canRunPlugin(id)) {
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
  getPluginsDir?: () => string;
  getEnabled?: () => string[];
  onPanelLayout?: () => void;
  onHostKvSet?: (pluginId: string, key: string) => void;
}): void {
  storageDir = input.storageDir;
  getMainWindowFn = input.getMainWindow;
  windowSize = input.windowSize;
  if (input.getTheme) getTheme = input.getTheme;
  if (input.getPluginsDir) getPluginsDir = input.getPluginsDir;
  if (input.getEnabled) getEnabled = input.getEnabled;
  onPanelLayout = input.onPanelLayout ?? null;
  onHostKvSet = input.onHostKvSet ?? null;
  ensureCloseIpc();
  ensureKvIpc();
}

export function setPluginRun(
  fn: (pluginId: string, args: Record<string, unknown>) => Promise<string>
): void {
  runPlugin = fn;
}

export function notifyAppsChanged(removedId?: string): void {
  if (!panelWin || panelWin.isDestroyed() || !appsBox) {
    return;
  }
  panelWin.webContents.send("hoshi:apps-changed", { removedId: removedId ?? "" });
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

export function listPluginApps(pluginsDir: string, enabled: string[]): PluginAppItem[] {
  const out: PluginAppItem[] = [
    { pluginId: HOST_MUSIC_ID, title: "音乐", template: "music", icon: "music" },
    { pluginId: HOST_SCHEDULE_ID, title: "日程", template: "schedule", icon: "schedule" }
  ];
  for (const plugin of enabledPlugins(pluginsDir, enabled)) {
    const tpl = pluginTemplateOf(plugin.dir);
    if (tpl !== "panel" && tpl !== "launcher") {
      continue;
    }
    out.push({
      pluginId: plugin.id,
      title: pluginAppTitle(plugin.dir, plugin.name || plugin.id),
      template: tpl,
      icon: tpl
    });
  }
  return out;
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

const chromeBound = new WeakSet<WebContents>();

function bindPluginChrome(wc: WebContents): void {
  if (chromeBound.has(wc)) {
    return;
  }
  chromeBound.add(wc);
  hookCsp(wc.session);
  ensureMediaProtocol(wc.session);
  hookMediaRedirect(wc.session);
  wc.setWindowOpenHandler(() => ({ action: "deny" }));
  wc.on("will-navigate", (event, url) => {
    if (url !== wc.getURL()) {
      event.preventDefault();
    }
  });
  wc.on("destroyed", () => {
    const id = contentsToPlugin.get(wc);
    if (id) {
      pluginContents.get(id)?.delete(wc);
    }
  });
}

function bindHostContents(wc: WebContents, pluginId: string): void {
  bindPluginChrome(wc);
  const prev = contentsToPlugin.get(wc);
  if (prev && prev !== pluginId) {
    pluginContents.get(prev)?.delete(wc);
  }
  contentsToPlugin.set(wc, pluginId);
  let set = pluginContents.get(pluginId);
  if (!set) {
    set = new Set();
    pluginContents.set(pluginId, set);
  }
  set.add(wc);
}

function bindWebContents(wc: WebContents, pluginId: string, pluginDir: string): void {
  bindPluginChrome(wc);
  const prev = contentsToPlugin.get(wc);
  if (prev && prev !== pluginId) {
    pluginContents.get(prev)?.delete(wc);
  }
  contentsToPlugin.set(wc, pluginId);
  pluginDirs.set(pluginId, pluginDir);
  let set = pluginContents.get(pluginId);
  if (!set) {
    set = new Set();
    pluginContents.set(pluginId, set);
  }
  set.add(wc);
  setPluginMediaRoot(pluginId, pluginDir);
}

function appsEntry(): string {
  return join(__dirname, "../resources/plugin-chrome/apps.html");
}

export function openAppBox(pluginsDir: string, enabled: string[]): void {
  ensureCloseIpc();
  ensureKvIpc();
  const entry = appsEntry();
  if (extname(entry).toLowerCase() !== ".html" || !statSync(entry).isFile()) {
    throw new Error("入口无效");
  }
  const win = getMainWindow();
  if (!win || win.isDestroyed()) {
    throw new Error("窗口不存在");
  }
  const size = appsHomeSize(listPluginApps(pluginsDir, enabled).length);
  if (panelWin && appsBox && !panelWin.isDestroyed()) {
    notifyAppsChanged();
    panelWin.show();
    panelWin.focus();
    onPanelLayout?.();
    return;
  }
  closePluginPanel();
  panelWidth = size.width;
  panelHeight = size.height;
  panelPluginId = "";
  appsBox = true;
  hookMainMove(win);
  const pet = win.getBounds();
  const view = new BrowserWindow({
    ...panelBoundsFromPet(pet, size),
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/pluginView.js"),
      partition: "persist:hoshi-apps",
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
      appsBox = false;
      panelWidth = 0;
      panelHeight = 0;
    }
  });
  layoutPanel(size.width, size.height);
  bindPluginChrome(view.webContents);
  view.webContents.setAudioMuted(false);
  void view.webContents.loadFile(entry).then(() => {
    if (!view.isDestroyed()) {
      view.show();
    }
  });
}

export function openPluginPanel(pluginsDir: string, enabled: string[], _pluginId?: string): void {
  openAppBox(pluginsDir, enabled);
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
  if (pluginId === HOST_MUSIC_ID || pluginId === HOST_SCHEDULE_ID) {
    return;
  }
  disposePluginCaps(pluginId);
  disposePluginExecute(pluginId);
  pluginContents.delete(pluginId);
  pluginDirs.delete(pluginId);
  if (panelWin && !panelWin.isDestroyed() && contentsToPlugin.get(panelWin.webContents) === pluginId) {
    contentsToPlugin.delete(panelWin.webContents);
  }
  if (appsBox) {
    notifyAppsChanged(pluginId);
  } else if (panelPluginId === pluginId) {
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
