import "./registerMediaScheme";
import { app, BrowserWindow, dialog, ipcMain, session, shell } from "electron";
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, statSync, renameSync, copyFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import {
  createAgentServer,
  parseMcpServer,
  probeMcpServer,
  removeMcpServer,
  setMcpServerEnabled,
  setTtsPcmSink,
  upsertMcpServer,
  type McpServerConfig
} from "@hoshi/agent";
import { resolveHoshiSettings } from "@hoshi/shared";
import { downloadWhisperModel, resolveWhisperVoice } from "./whisperAssets";
import { loadHoshiSettings, saveHoshiSettings } from "./settingsStore";
import { parseDocx } from "./docxParser";
import { closeTtsPlayer, ensureTtsPlayer, playTtsPcm, stopTtsPlayer } from "./ttsPlayer";
import {
  closePluginWindows,
  closePluginRuntime,
  configurePluginHost,
  listPluginFanActions,
  notifyAppsChanged,
  notifyPluginKv,
  openAppBox,
  openPluginWindow,
  openHostAppName,
  listHostApps,
  pickHostFiles,
  pluginSpriteFile,
  setPluginRun
} from "./pluginContrib";
import {
  capNotify,
  setCapShortcutFire
} from "./pluginCaps";
import { configureIsolatedExecute, isolatedPluginRun } from "./pluginExecuteHost";
import { augmentedPath } from "./envPath";
import { configureRemindToast, relayoutRemindToast } from "./remindToast";
import { onScheduleEventsChanged, startScheduleReminders, stopScheduleReminders } from "./scheduleRemind";
import {
  createSandboxPlugin,
  uninstallPlugin,
  listSandboxPluginEntries,
  listLivePlugins,
  migrateSandboxMcp,
  readSandboxPluginForm,
  patchSandboxPluginForm,
  publishSandboxPlugin,
  seedWorkbenchSandbox,
  watchPublishQueue,
  writeSandboxAsset,
  writeThemePack,
  readThemePack,
  readLiveThemePack,
  themeSoundDataUrl,
  writeLayout,
  readLayout,
  sandboxAssetDataUrl,
  liveAssetDataUrl,
  exclusiveThemeEnabled,
  resolveActiveTheme,
  lockLiveTemplates,
  setTemplateMetaRoot,
  type SandboxPluginKind
} from "./workbenchSandbox";

function parseSandboxKind(value: unknown): SandboxPluginKind {
  return value === "mcp" || value === "panel" || value === "launcher" || value === "theme" ? value : "theme";
}

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");

let mainWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let workbenchWindow: BrowserWindow | null = null;
const WINDOW_SIZE = { width: 520, height: 360 };
const SETTINGS_WINDOW_SIZE = { width: 760, height: 520 };
const WORKBENCH_WINDOW_SIZE = { width: 1100, height: 720 };

async function bootstrap() {
  const repoRoot = resolve(__dirname, "../../../..");
  loadDotenv({ path: resolve(repoRoot, ".env") });

  const personaPath = resolve(repoRoot, "personas/default/persona.json");

  const userDataDir = app.getPath("userData");
  const databasePath = join(userDataDir, "hoshi.db");
  const envSeed = {
    apiKey: process.env.HOSHI_API_KEY,
    baseUrl: process.env.HOSHI_BASE_URL,
    model: process.env.HOSHI_MODEL,
    deepseekApiKey: process.env.HOSHI_DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY
  };
  let settings = loadHoshiSettings(userDataDir, envSeed);
  const pluginsDir = join(userDataDir, "plugins");
  const pluginStorageRoot = join(userDataDir, "plugin-storage");
  const pluginStorageDir = join(pluginStorageRoot, "live");
  mkdirSync(pluginsDir, { recursive: true });
  mkdirSync(pluginStorageDir, { recursive: true });
  if (existsSync(pluginStorageRoot)) {
    for (const name of readdirSync(pluginStorageRoot)) {
      if (!name.endsWith(".json")) {
        continue;
      }
      const from = join(pluginStorageRoot, name);
      const to = join(pluginStorageDir, name);
      if (statSync(from).isFile() && !existsSync(to)) {
        renameSync(from, to);
      }
    }
  }
  const sandboxDir = join(userDataDir, "workbench-sandbox");
  mkdirSync(join(sandboxDir, ".storage"), { recursive: true });
  const templateMetaDir = join(userDataDir, "plugin-meta");
  setTemplateMetaRoot(templateMetaDir);
  const oldMeta = join(sandboxDir, ".plugin-meta");
  if (existsSync(oldMeta)) {
    for (const name of readdirSync(oldMeta)) {
      const from = join(oldMeta, name);
      const to = join(templateMetaDir, name);
      if (statSync(from).isFile() && !existsSync(to)) {
        renameSync(from, to);
      }
    }
  }
  const workbenchSrc = join(__dirname, "../../resources/workbench");
  const workbenchPacked = join(__dirname, "../resources/workbench");
  const workbenchTemplateDir =
    !app.isPackaged && existsSync(join(workbenchSrc, "plugins", "_template_theme", "theme.json"))
      ? workbenchSrc
      : workbenchPacked;
  seedWorkbenchSandbox(workbenchTemplateDir, sandboxDir);
  lockLiveTemplates(pluginsDir);
  configurePluginHost({
    storageDir: pluginStorageDir,
    getMainWindow: () => mainWindow,
    windowSize: WINDOW_SIZE,
    getTheme: () => resolveActiveTheme(pluginsDir, settings.plugins.enabled),
    getPluginsDir: () => pluginsDir,
    getEnabled: () => settings.plugins.enabled,
    onPanelLayout: () => relayoutRemindToast(),
    onHostKvSet: onScheduleEventsChanged
  });
  configureRemindToast({
    getPluginsDir: () => pluginsDir,
    getEnabled: () => settings.plugins.enabled,
    getTheme: () => resolveActiveTheme(pluginsDir, settings.plugins.enabled)
  });
  configureIsolatedExecute({
    storageDir: pluginStorageDir,
    pluginsDir,
    openExternal: openHostAppName,
    listApps: listHostApps,
    pick: (opts) => pickHostFiles(opts as Parameters<typeof pickHostFiles>[0], mainWindow)
  });

  const mcpPath = join(userDataDir, "mcp.json");
  if (!existsSync(mcpPath)) {
    writeFileSync(mcpPath, `${JSON.stringify({ servers: [] }, null, 2)}\n`);
  }
  migrateSandboxMcp(sandboxDir, mcpPath);
  const pushSettings = (): void => {
    for (const win of [mainWindow, settingsWindow, workbenchWindow]) {
      if (win && !win.isDestroyed()) {
        win.webContents.send("hoshi:settings-updated", settings);
      }
    }
    notifyAppsChanged();
  };
  const { server, persona, applySettings, authToken, mcpReady, close, executeByPluginId, listMcpServers, reloadMcp } =
    createAgentServer({
    personaPath,
    apiKey: settings.model.apiKey,
    baseUrl: settings.model.baseUrl,
    model: settings.model.model,
    databasePath,
    pluginsDir,
    mcpPath,
    pathEnv: augmentedPath(),
    storageDir: pluginStorageDir,
    onPluginKvSet: (pluginId, key, value) => {
      notifyPluginKv(pluginId, key, value);
      onScheduleEventsChanged(pluginId, key);
    },
    openExternal: openHostAppName,
    listApps: listHostApps,
    pickFiles: (opts) => pickHostFiles(opts, mainWindow),
    pluginCaps: {
      notify: capNotify
    },
    isolatedRun: isolatedPluginRun
  });
  await mcpReady;
  setPluginRun((pluginId, args) => executeByPluginId(pluginId, args));
  setCapShortcutFire((pluginId, args) => {
    void executeByPluginId(pluginId, args);
  });
  applySettings({ ...settings, voice: resolveWhisperVoice(settings.voice) });
  const publishWatch = watchPublishQueue(sandboxDir, async (dirName) => {
    await publishSandboxPlugin({
      sandboxDir,
      pluginsDir,
      mcpPath,
      dirName,
      settings
    });
    saveHoshiSettings(userDataDir, settings);
    applySettings({ ...settings, voice: resolveWhisperVoice(settings.voice) });
    pushSettings();
  });
  await ensureTtsPlayer();
  setTtsPcmSink(playTtsPcm, stopTtsPlayer);

  session.defaultSession.setPermissionCheckHandler((_webContents, permission, _origin, details) => {
    if (permission !== "media") {
      return true;
    }
    return details.mediaType !== "video";
  });
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    if (permission !== "media") {
      callback(true);
      return;
    }
    const types =
      "mediaTypes" in details && Array.isArray(details.mediaTypes) ? details.mediaTypes : [];
    callback(!types.includes("video"));
  });

  await new Promise<void>((resolveListen) => {
    server.listen(0, "127.0.0.1", () => resolveListen());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("failed to bind agent server");
  }
  const agentBaseUrl = `http://127.0.0.1:${address.port}`;

  const openSettingsWindow = async (): Promise<void> => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.show();
      settingsWindow.focus();
      return;
    }
    settingsWindow = new BrowserWindow({
      width: SETTINGS_WINDOW_SIZE.width,
      height: SETTINGS_WINDOW_SIZE.height,
      minWidth: 640,
      minHeight: 420,
      title: "星奈设置",
      autoHideMenuBar: true,
      alwaysOnTop: true,
      webPreferences: {
        preload: join(__dirname, "../preload/index.js"),
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    settingsWindow.on("closed", () => {
      settingsWindow = null;
    });
    await settingsWindow.loadFile(join(__dirname, "../renderer/settings.html"));
    settingsWindow.show();
    settingsWindow.focus();
  };

  const parkPet = (): void => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }
    mainWindow.setVisibleOnAllWorkspaces(false);
    mainWindow.setFocusable(false);
    mainWindow.showInactive();
    mainWindow.setAlwaysOnTop(true, "floating");
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
  };

  const restorePet = (): void => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }
    mainWindow.setVisibleOnAllWorkspaces(false);
    mainWindow.setFocusable(true);
    mainWindow.show();
    mainWindow.setAlwaysOnTop(true, "floating");
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
  };

  let themePreview: { bg: string; font: string; dialog: string; menu: string } | null = null;
  const pushThemePreview = (): void => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("hoshi:theme-preview", themePreview);
    }
  };
  ipcMain.handle("hoshi:preview-theme", (_event, tokens: unknown) => {
    const rec = tokens && typeof tokens === "object" ? (tokens as Record<string, unknown>) : null;
    themePreview = rec
      ? {
          bg: typeof rec.bg === "string" ? rec.bg : "",
          font: typeof rec.font === "string" ? rec.font : "",
          dialog: typeof rec.dialog === "string" ? rec.dialog : "",
          menu: typeof rec.menu === "string" ? rec.menu : ""
        }
      : null;
    pushThemePreview();
    return { ok: true as const };
  });

  const openWorkbenchWindow = async (): Promise<void> => {
    seedWorkbenchSandbox(workbenchTemplateDir, sandboxDir);
    if (workbenchWindow && !workbenchWindow.isDestroyed()) {
      workbenchWindow.setAlwaysOnTop(false);
      workbenchWindow.show();
      workbenchWindow.focus();
      parkPet();
      return;
    }
    workbenchWindow = new BrowserWindow({
      width: WORKBENCH_WINDOW_SIZE.width,
      height: WORKBENCH_WINDOW_SIZE.height,
      minWidth: 800,
      minHeight: 520,
      title: "星奈工作台",
      autoHideMenuBar: true,
      alwaysOnTop: false,
      focusable: true,
      webPreferences: {
        preload: join(__dirname, "../preload/index.js"),
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    workbenchWindow.setAlwaysOnTop(false);
    workbenchWindow.on("closed", () => {
      workbenchWindow = null;
      if (themePreview) {
        themePreview = null;
        pushThemePreview();
      }
      restorePet();
    });
    await workbenchWindow.loadFile(join(__dirname, "../renderer/workbench.html"));
    workbenchWindow.show();
    workbenchWindow.setAlwaysOnTop(false);
    workbenchWindow.focus();
    parkPet();
  };

  ipcMain.handle("hoshi:get-config", () => ({
    agentBaseUrl,
    agentToken: authToken,
    defaultEmotion: persona.defaultEmotion,
    thinkingEmotion: persona.thinkingEmotion,
    presentation: settings.presentation
  }));

  ipcMain.handle("hoshi:get-settings", () => settings);

  ipcMain.handle("hoshi:save-settings", (_event, next: unknown) => {
    const wasEnabled = new Set(settings.plugins.enabled);
    settings = resolveHoshiSettings(next, envSeed);
    settings.plugins.enabled = exclusiveThemeEnabled(pluginsDir, settings.plugins.enabled);
    for (const id of wasEnabled) {
      if (!settings.plugins.enabled.includes(id)) {
        closePluginRuntime(id);
      }
    }
    saveHoshiSettings(userDataDir, settings);
    applySettings({ ...settings, voice: resolveWhisperVoice(settings.voice) });
    pushSettings();
    return settings;
  });

  ipcMain.handle("hoshi:test-gsv", async (_event, baseUrl: unknown) => {
    let parsed: URL;
    try {
      parsed = new URL(String(baseUrl ?? "").trim());
    } catch {
      throw new Error("地址无效");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("地址无效");
    }
    if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
      throw new Error("仅允许本机地址");
    }
    const res = await fetch(parsed.toString().replace(/\/$/, ""), {
      signal: AbortSignal.timeout(4000)
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return { ok: true as const };
  });

  ipcMain.handle("hoshi:download-whisper-model", async () => {
    const path = await downloadWhisperModel();
    applySettings({ ...settings, voice: resolveWhisperVoice(settings.voice) });
    return { ok: true as const, path };
  });

  ipcMain.handle("hoshi:fetch-url", async (_event, url: unknown) => {
    const raw = String(url ?? "").trim();
    if (!raw) {
      throw new Error("URL 为空");
    }
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      throw new Error("URL 无效");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("仅支持 http/https");
    }
    const res = await fetch(parsed.toString(), {
      signal: AbortSignal.timeout(20000),
      redirect: "follow"
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const text = await res.text();
    return { text, contentType: res.headers.get("content-type") ?? "" };
  });

  ipcMain.handle("hoshi:fetch-image", async (_event, url: unknown) => {
    const raw = String(url ?? "").trim();
    if (!raw) {
      throw new Error("图片地址为空");
    }
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      throw new Error("图片地址无效");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("仅支持 http/https");
    }
    const res = await fetch(parsed.toString(), {
      signal: AbortSignal.timeout(20000),
      redirect: "follow",
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "User-Agent": "Hoshi/0.1 (desktop workbench; knowledge cards)"
      }
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const mime = (res.headers.get("content-type") ?? "application/octet-stream").split(";")[0].trim();
    if (!mime.startsWith("image/")) {
      throw new Error("不是图片");
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > 6 * 1024 * 1024) {
      throw new Error("图片过大");
    }
    return { mime, data: buf.toString("base64") };
  });

  ipcMain.handle("hoshi:parse-docx", async (_event, b64: unknown) => {
    const raw = String(b64 ?? "").trim();
    if (!raw) {
      throw new Error("文件内容为空");
    }
    let buffer: Buffer;
    try {
      buffer = Buffer.from(raw, "base64");
    } catch {
      throw new Error("文件内容无效");
    }
    const text = await parseDocx(buffer);
    return { text };
  });

  ipcMain.handle("hoshi:export-db", async () => {
    const options = {
      title: "导出数据库备份",
      defaultPath: "hoshi-backup.db",
      filters: [{ name: "SQLite", extensions: ["db"] }]
    };
    const result =
      mainWindow && !mainWindow.isDestroyed()
        ? await dialog.showSaveDialog(mainWindow, options)
        : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) {
      return { ok: false as const };
    }
    copyFileSync(databasePath, result.filePath);
    for (const suffix of ["-wal", "-shm"]) {
      const src = `${databasePath}${suffix}`;
      if (existsSync(src)) {
        copyFileSync(src, `${result.filePath}${suffix}`);
      }
    }
    return { ok: true as const, path: result.filePath };
  });

  ipcMain.handle("hoshi:open-settings", async () => {
    await openSettingsWindow();
  });

  ipcMain.handle("hoshi:open-workbench", async () => {
    await openWorkbenchWindow();
  });

  ipcMain.handle("hoshi:workbench-ime", (_event, focused: unknown) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }
    mainWindow.setAlwaysOnTop(focused !== true, "floating");
  });

  ipcMain.handle("hoshi:list-sandbox-plugins", () => listSandboxPluginEntries(sandboxDir));

  ipcMain.handle("hoshi:list-live-plugins", () => listLivePlugins(pluginsDir, settings));

  function parseMcpPayload(payload: unknown): McpServerConfig {
    const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
    const parsed = parseMcpServer({
      name: record.name ?? record.id,
      command: record.command,
      args: record.args,
      env: record.env,
      enabled: record.enabled
    });
    if (!parsed) {
      throw new Error("连接器无效");
    }
    return parsed;
  }

  function loadMcpTemplates(): {
    id: string;
    name: string;
    description: string;
    hints: string;
    command: string;
    args: string[];
    env: Record<string, string>;
  }[] {
    const file = join(__dirname, "../resources/workbench/protocol/mcp-templates.json");
    if (!existsSync(file)) {
      return [];
    }
    try {
      const raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
      if (!Array.isArray(raw)) {
        return [];
      }
      return raw.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const rec = item as Record<string, unknown>;
        if (typeof rec.id !== "string" || typeof rec.command !== "string") return [];
        const args = Array.isArray(rec.args) ? rec.args.filter((v): v is string => typeof v === "string") : [];
        const env: Record<string, string> = {};
        if (rec.env && typeof rec.env === "object" && !Array.isArray(rec.env)) {
          for (const [key, value] of Object.entries(rec.env as Record<string, unknown>)) {
            if (typeof value === "string") env[key] = value;
          }
        }
        return [
          {
            id: rec.id,
            name: typeof rec.name === "string" ? rec.name : rec.id,
            description: typeof rec.description === "string" ? rec.description : "",
            hints: typeof rec.hints === "string" ? rec.hints : "",
            command: rec.command,
            args,
            env
          }
        ];
      });
    } catch {
      return [];
    }
  }

  ipcMain.handle("hoshi:list-mcp-servers", () => listMcpServers());

  ipcMain.handle("hoshi:list-mcp-templates", () => loadMcpTemplates());

  ipcMain.handle("hoshi:upsert-mcp-server", async (_event, payload: unknown) => {
    const server = parseMcpPayload(payload);
    upsertMcpServer(mcpPath, server);
    await reloadMcp();
    const row = listMcpServers().find((item) => item.name === server.name);
    return {
      ok: Boolean(row?.enabled && row.connected),
      server: row ?? null
    };
  });

  ipcMain.handle("hoshi:probe-mcp-server", async (_event, payload: unknown) => {
    return probeMcpServer(parseMcpPayload(payload), augmentedPath());
  });

  ipcMain.handle("hoshi:set-mcp-enabled", async (_event, payload: unknown) => {
    const record = payload && typeof payload === "object" ? (payload as { name?: unknown; enabled?: unknown }) : {};
    const name = String(record.name ?? "");
    setMcpServerEnabled(mcpPath, name, record.enabled !== false);
    await reloadMcp();
    return { ok: true as const, servers: listMcpServers() };
  });

  ipcMain.handle("hoshi:remove-mcp-server", async (_event, name: unknown) => {
    removeMcpServer(mcpPath, String(name ?? ""));
    await reloadMcp();
    return { ok: true as const };
  });

  ipcMain.handle("hoshi:reveal-mcp-config", async () => {
    if (!existsSync(mcpPath)) {
      writeFileSync(mcpPath, `${JSON.stringify({ servers: [] }, null, 2)}\n`);
    }
    shell.showItemInFolder(mcpPath);
    return { ok: true as const };
  });

  ipcMain.handle("hoshi:get-theme", () => resolveActiveTheme(pluginsDir, settings.plugins.enabled));

  ipcMain.handle("hoshi:read-theme-pack", (_event, dirName: unknown) => {
    return readThemePack(sandboxDir, String(dirName ?? ""));
  });

  ipcMain.handle("hoshi:read-live-theme-pack", (_event, dirName: unknown) => {
    return readLiveThemePack(pluginsDir, String(dirName ?? ""));
  });

  ipcMain.handle("hoshi:write-theme-pack", (_event, payload: unknown) => {
    const record = payload && typeof payload === "object" ? (payload as { id?: unknown; pack?: unknown }) : {};
    const pack =
      record.pack && typeof record.pack === "object"
        ? (record.pack as {
            name?: unknown;
            description?: unknown;
            tokens?: { bg?: string; font?: string; dialog?: string; menu?: string; sound?: string };
            sprites?: Record<string, string>;
          })
        : {};
    return writeThemePack(sandboxDir, String(record.id ?? ""), {
      name: typeof pack.name === "string" ? pack.name : "",
      description: typeof pack.description === "string" ? pack.description : "",
      tokens: {
        bg: pack.tokens?.bg ?? "",
        font: pack.tokens?.font ?? "",
        dialog: pack.tokens?.dialog ?? "",
        menu: pack.tokens?.menu ?? "",
        sound: pack.tokens?.sound ?? ""
      },
      sprites: pack.sprites ?? {}
    });
  });

  ipcMain.handle("hoshi:read-layout", (_event, dirName: unknown) => readLayout(sandboxDir, String(dirName ?? "")));

  ipcMain.handle("hoshi:write-layout", (_event, payload: unknown) => {
    const record = payload && typeof payload === "object" ? (payload as { id?: unknown; nodes?: unknown }) : {};
    const nodes = Array.isArray(record.nodes)
      ? record.nodes.filter((item): item is { id: string; type: "image" | "text" | "deco"; x: number; y: number; w: number; h: number; src?: string; text?: string } =>
          Boolean(item) && typeof item === "object" && typeof (item as { id?: unknown }).id === "string"
        )
      : [];
    return writeLayout(sandboxDir, String(record.id ?? ""), nodes);
  });

  ipcMain.handle("hoshi:upload-sandbox-asset", (_event, payload: unknown) => {
    const record =
      payload && typeof payload === "object" ? (payload as { id?: unknown; rel?: unknown; b64?: unknown }) : {};
    const buf = Buffer.from(String(record.b64 ?? ""), "base64");
    return writeSandboxAsset(sandboxDir, String(record.id ?? ""), String(record.rel ?? ""), buf);
  });

  ipcMain.handle("hoshi:sandbox-asset-url", (_event, payload: unknown) => {
    const record = payload && typeof payload === "object" ? (payload as { id?: unknown; rel?: unknown; live?: unknown }) : {};
    const id = String(record.id ?? "");
    const rel = String(record.rel ?? "");
    if (record.live === true) return { url: liveAssetDataUrl(pluginsDir, id, rel) };
    return { url: sandboxAssetDataUrl(sandboxDir, id, rel) };
  });

  ipcMain.handle("hoshi:read-sandbox-plugin-form", (_event, dirName: unknown) => {
    return readSandboxPluginForm(sandboxDir, String(dirName ?? ""));
  });

  ipcMain.handle("hoshi:patch-sandbox-plugin-form", (_event, payload: unknown) => {
    const record =
      payload && typeof payload === "object"
        ? (payload as {
            id?: unknown;
            name?: unknown;
            description?: unknown;
            label?: unknown;
            title?: unknown;
            multiple?: unknown;
            filters?: unknown;
          })
        : {};
    const filters = Array.isArray(record.filters)
      ? record.filters
          .filter((item): item is { name: unknown; extensions?: unknown } => Boolean(item) && typeof item === "object")
          .map((item) => ({
            name: String(item.name ?? ""),
            extensions: Array.isArray(item.extensions)
              ? item.extensions.filter((ext): ext is string => typeof ext === "string")
              : []
          }))
      : undefined;
    return patchSandboxPluginForm(sandboxDir, String(record.id ?? ""), {
      name: typeof record.name === "string" ? record.name : undefined,
      description: typeof record.description === "string" ? record.description : undefined,
      label: typeof record.label === "string" ? record.label : undefined,
      title: typeof record.title === "string" ? record.title : undefined,
      multiple: typeof record.multiple === "boolean" ? record.multiple : undefined,
      filters
    });
  });

  ipcMain.handle("hoshi:create-sandbox-plugin", (_event, payload: unknown) => {
    const record =
      payload && typeof payload === "object" ? (payload as { id?: unknown; kind?: unknown }) : {};
    const dirName = typeof payload === "string" ? payload : String(record.id ?? "");
    const kind = parseSandboxKind(record.kind);
    createSandboxPlugin(sandboxDir, dirName, kind);
    return { id: dirName };
  });

  ipcMain.handle("hoshi:delete-sandbox-plugin", async (_event, dirName: unknown) => {
    const id = String(dirName ?? "");
    closePluginRuntime(id);
    uninstallPlugin({
      sandboxDir,
      pluginsDir,
      mcpPath,
      storageDir: pluginStorageDir,
      settings,
      dirName: id
    });
    saveHoshiSettings(userDataDir, settings);
    applySettings({ ...settings, voice: resolveWhisperVoice(settings.voice) });
    pushSettings();
    return { id };
  });

  ipcMain.handle("hoshi:publish-sandbox-plugin", async (_event, dirName: unknown) => {
    try {
      const result = await publishSandboxPlugin({
        sandboxDir,
        pluginsDir,
        mcpPath,
        dirName: String(dirName ?? ""),
        settings
      });
      saveHoshiSettings(userDataDir, settings);
      applySettings({ ...settings, voice: resolveWhisperVoice(settings.voice) });
      pushSettings();
      return { ok: true as const, id: result.id, ...(result.howToUse ? { howToUse: result.howToUse } : {}) };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : "上线失败" };
    }
  });

  ipcMain.handle("hoshi:open-plugins-dir", async () => {
    mkdirSync(pluginsDir, { recursive: true });
    await shell.openPath(pluginsDir);
  });

  ipcMain.handle("hoshi:get-theme-sound", () => {
    return themeSoundDataUrl(pluginsDir, settings.plugins.enabled);
  });

  ipcMain.handle("hoshi:get-sprite-data", (_event, emotion: string) => {
    const overlay = pluginSpriteFile(pluginsDir, settings.plugins.enabled, emotion);
    const spritePath = overlay ?? persona.sprites[emotion as keyof typeof persona.sprites];
    if (!spritePath) {
      throw new Error(`unknown emotion: ${emotion}`);
    }
    const ext = extname(spritePath).toLowerCase();
    const mime = ext === ".webp" ? "image/webp" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
    const base64 = readFileSync(spritePath).toString("base64");
    return `data:${mime};base64,${base64}`;
  });

  ipcMain.handle("hoshi:list-plugin-actions", () => listPluginFanActions(pluginsDir, settings.plugins.enabled));

  ipcMain.handle("hoshi:open-plugin-window", (_event, payload: unknown) => {
    const record = payload && typeof payload === "object" ? (payload as { pluginId?: unknown; window?: unknown }) : {};
    openPluginWindow(pluginsDir, settings.plugins.enabled, String(record.pluginId ?? ""), String(record.window ?? ""));
  });

  ipcMain.handle("hoshi:open-plugin-panel", () => {
    openAppBox(pluginsDir, settings.plugins.enabled);
  });
  ipcMain.handle("hoshi:open-app-box", () => {
    openAppBox(pluginsDir, settings.plugins.enabled);
  });

  ipcMain.handle("hoshi:set-ignore-mouse-events", (_event, ignore: boolean) => {
    if (!mainWindow) {
      return;
    }
    mainWindow.setIgnoreMouseEvents(ignore, { forward: true });
  });

  ipcMain.handle("hoshi:move-window-by", (_event, dx: number, dy: number) => {
    if (!mainWindow) {
      return;
    }
    const bounds = mainWindow.getBounds();
    mainWindow.setBounds(
      {
        x: Math.round(bounds.x + dx),
        y: Math.round(bounds.y + dy),
        width: bounds.width,
        height: bounds.height
      },
      false
    );
  });

  mainWindow = new BrowserWindow({
    width: WINDOW_SIZE.width,
    height: WINDOW_SIZE.height,
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      autoplayPolicy: "no-user-gesture-required",
      backgroundThrottling: false
    }
  });
  mainWindow.webContents.setBackgroundThrottling(false);
  mainWindow.webContents.setAudioMuted(false);

  await mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  mainWindow.setIgnoreMouseEvents(true, { forward: true });
  startScheduleReminders({
    storageDir: pluginStorageDir
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
    stopScheduleReminders();
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.close();
    }
    if (workbenchWindow && !workbenchWindow.isDestroyed()) {
      workbenchWindow.close();
    }
    closeTtsPlayer();
    closePluginWindows();
    close();
    publishWatch.close();
    app.quit();
  });
}

app.whenReady().then(() => {
  void bootstrap();
});

app.on("window-all-closed", () => {
  app.quit();
});
