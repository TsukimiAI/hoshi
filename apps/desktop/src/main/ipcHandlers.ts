import { dialog, ipcMain, shell, type BrowserWindow, type WebContents } from "electron";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import {
  parseMcpServer,
  probeMcpServer,
  removeMcpServer,
  setMcpServerEnabled,
  upsertMcpServer,
  type McpServerConfig,
  type PersonaConfig
} from "@hoshi/agent";
import { PET_SCREEN, petScreenIntervalMs, petScreenUnchanged, resolveHoshiSettings, type HoshiSettings } from "@hoshi/shared";
import {
  deleteWhisperModelFiles,
  downloadWhisperModel,
  resolveWhisperVoice,
  whisperCacheState
} from "./whisperAssets";
import { saveHoshiSettings } from "./settingsStore";
import {
  listWallpaperHistory,
  readWallpaperDataUrl,
  removeWallpaper,
  useWallpaperHistory,
  writeWallpaper
} from "./wallpaper";
import { parseDocx } from "./docxParser";
import {
  closePluginRuntime,
  listPluginFanActions,
  openAppBox,
  openPluginWindow,
  pluginSpriteFile
} from "./pluginContrib";
import { augmentedPath } from "./envPath";
import { setRemindToastContentProtection } from "./remindToast";
import { capturePetScreen, reviveTransparentPetWindow, setPetScreenExcluded } from "./screenCapture";
import {
  createSandboxPlugin,
  uninstallPlugin,
  listSandboxPluginEntries,
  listLivePlugins,
  readSandboxPluginForm,
  patchSandboxPluginForm,
  publishSandboxPlugin,
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
  type SandboxPluginKind
} from "./workbenchSandbox";

function parseSandboxKind(value: unknown): SandboxPluginKind {
  return value === "mcp" || value === "panel" || value === "launcher" || value === "theme" ? value : "theme";
}

export interface IpcDeps {
  getSettings: () => HoshiSettings;
  setSettings: (next: HoshiSettings) => void;
  getMainWindow: () => BrowserWindow | null;
  getSettingsWindow: () => BrowserWindow | null;
  getWorkbenchWindow: () => BrowserWindow | null;
  userDataDir: string;
  pluginsDir: string;
  sandboxDir: string;
  pluginStorageDir: string;
  mcpPath: string;
  databasePath: string;
  agentBaseUrl: string;
  authToken: string;
  persona: PersonaConfig;
  pushSettings: () => void;
  applySettings: (settings: HoshiSettings) => void;
  openSettingsWindow: () => Promise<void>;
  openWorkbenchWindow: () => Promise<void>;
  getThemePreview: () => { bg: string; font: string; dialog: string; menu: string } | null;
  setThemePreview: (next: { bg: string; font: string; dialog: string; menu: string } | null) => void;
  pushThemePreview: () => void;
  listMcpServers: () => Array<{ name: string; enabled?: boolean; connected?: boolean }>;
  reloadMcp: () => Promise<unknown>;
}

export function registerMainIpc(deps: IpcDeps): void {
  ipcMain.handle("hoshi:preview-theme", (_event, tokens: unknown) => {
    const rec = tokens && typeof tokens === "object" ? (tokens as Record<string, unknown>) : null;
    deps.setThemePreview(
      rec
        ? {
            bg: typeof rec.bg === "string" ? rec.bg : "",
            font: typeof rec.font === "string" ? rec.font : "",
            dialog: typeof rec.dialog === "string" ? rec.dialog : "",
            menu: typeof rec.menu === "string" ? rec.menu : ""
          }
        : null
    );
    deps.pushThemePreview();
    return { ok: true as const };
  });
  ipcMain.handle("hoshi:pet-screen-limits", () => ({
    intervalMs: petScreenIntervalMs(),
    cooldownMs: PET_SCREEN.cooldownMs
  }));

  ipcMain.handle("hoshi:pet-screen-unchanged", (_event, prev: unknown, next: unknown) =>
    petScreenUnchanged(String(prev ?? ""), String(next ?? ""))
  );

  ipcMain.handle("hoshi:get-config", () => ({
    agentBaseUrl: deps.agentBaseUrl,
    agentToken: deps.authToken,
    defaultEmotion: deps.persona.defaultEmotion,
    thinkingEmotion: deps.persona.thinkingEmotion,
    presentation: deps.getSettings().presentation
  }));

  ipcMain.handle("hoshi:get-settings", () => deps.getSettings());

  ipcMain.handle("hoshi:get-wallpaper", () => readWallpaperDataUrl(deps.userDataDir));

  const setWallpaperEnabled = (wallpaper: boolean): void => {
    deps.setSettings({
      ...deps.getSettings(),
      appearance: { wallpaper }
    });
    saveHoshiSettings(deps.userDataDir, deps.getSettings());
    deps.pushSettings();
  };

  ipcMain.handle("hoshi:set-wallpaper", (_event, dataUrl: unknown) => {
    if (typeof dataUrl !== "string") {
      throw new Error("壁纸格式无效");
    }
    writeWallpaper(deps.userDataDir, dataUrl);
    setWallpaperEnabled(true);
    return { ok: true as const };
  });

  ipcMain.handle("hoshi:get-wallpaper-history", () => listWallpaperHistory(deps.userDataDir));

  ipcMain.handle("hoshi:use-wallpaper-history", (_event, id: unknown) => {
    useWallpaperHistory(deps.userDataDir, typeof id === "string" ? id : "");
    setWallpaperEnabled(true);
    return { ok: true as const };
  });

  ipcMain.handle("hoshi:clear-wallpaper", () => {
    removeWallpaper(deps.userDataDir);
    deps.setSettings({
      ...deps.getSettings(),
      appearance: { ...deps.getSettings().appearance, wallpaper: false }
    });
    saveHoshiSettings(deps.userDataDir, deps.getSettings());
    deps.pushSettings();
    return { ok: true as const };
  });

  ipcMain.handle("hoshi:save-settings", (_event, next: unknown) => {
    const appearance = deps.getSettings().appearance;
    const wasEnabled = new Set(deps.getSettings().plugins.enabled);
    deps.setSettings(resolveHoshiSettings(next));
    deps.getSettings().appearance = appearance;
    deps.getSettings().plugins.enabled = exclusiveThemeEnabled(deps.pluginsDir, deps.getSettings().plugins.enabled);
    for (const id of wasEnabled) {
      if (!deps.getSettings().plugins.enabled.includes(id)) {
        closePluginRuntime(id);
      }
    }
    saveHoshiSettings(deps.userDataDir, deps.getSettings());
    applyPetScreenExclusion(deps.getSettings().screen.enabled);
    deps.applySettings({ ...deps.getSettings(), voice: resolveWhisperVoice(deps.getSettings().voice) });
    deps.pushSettings();
    return deps.getSettings();
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

  let whisperAbort: AbortController | null = null;
  let whisperSender: WebContents | null = null;
  let whisperProgress = { loaded: 0, total: 0 };
  let whisperSettle = Promise.resolve();
  let settleWhisper = (): void => undefined;

  const publishWhisperProgress = (loaded: number, total: number): void => {
    whisperProgress = { loaded, total };
    if (whisperSender && !whisperSender.isDestroyed()) {
      whisperSender.send("hoshi:whisper-download-progress", { loaded, total });
    }
  };

  ipcMain.handle("hoshi:whisper-model-status", (event) => {
    whisperSender = event.sender;
    const cache = whisperCacheState();
    return {
      ready: cache.ready,
      partialBytes: cache.partialBytes,
      residualBytes: cache.residualBytes,
      downloading: whisperAbort !== null,
      loaded: whisperProgress.loaded,
      total: whisperProgress.total
    };
  });

  ipcMain.handle("hoshi:download-whisper-model", async (event) => {
    if (whisperAbort) {
      whisperSender = event.sender;
      return { ok: true as const, path: "", skipped: false, stopped: false, busy: true };
    }
    const controller = new AbortController();
    whisperAbort = controller;
    whisperSender = event.sender;
    whisperSettle = new Promise((resolve) => {
      settleWhisper = resolve;
    });
    const cache = whisperCacheState();
    whisperProgress = { loaded: cache.partialBytes, total: 0 };
    try {
      const result = await downloadWhisperModel((loaded, total) => {
        publishWhisperProgress(loaded, total);
      }, controller.signal);
      deps.applySettings({ ...deps.getSettings(), voice: resolveWhisperVoice(deps.getSettings().voice) });
      return { ok: true as const, path: result.path, skipped: result.skipped, stopped: false, busy: false };
    } catch (error) {
      if (controller.signal.aborted) {
        return { ok: true as const, path: "", skipped: false, stopped: true, busy: false };
      }
      throw error;
    } finally {
      if (whisperAbort === controller) {
        whisperAbort = null;
      }
      settleWhisper();
    }
  });

  ipcMain.handle("hoshi:stop-whisper-download", async () => {
    const pending = whisperSettle;
    whisperAbort?.abort();
    await pending;
    return { ok: true as const };
  });

  ipcMain.handle("hoshi:delete-whisper-model", () => {
    if (whisperAbort) {
      return { ok: false as const, removed: 0 };
    }
    whisperProgress = { loaded: 0, total: 0 };
    const removed = deleteWhisperModelFiles();
    return { ok: true as const, removed };
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
    if (parsed.hostname.toLowerCase() === "thumb.wikimedia.org") {
      parsed.hostname = "upload.wikimedia.org";
    }
    try {
      const res = await fetch(parsed.toString(), {
        signal: AbortSignal.timeout(20000),
        redirect: "follow",
        headers: {
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          "User-Agent": "Hoshi/0.1 (desktop workbench; knowledge cards)"
        }
      });
      if (!res.ok) {
        return { mime: "", data: "" };
      }
      const mime = (res.headers.get("content-type") ?? "application/octet-stream").split(";")[0].trim();
      if (!mime.startsWith("image/")) {
        return { mime: "", data: "" };
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength > 6 * 1024 * 1024) {
        return { mime: "", data: "" };
      }
      return { mime, data: buf.toString("base64") };
    } catch {
      return { mime: "", data: "" };
    }
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
    const mainWindow = deps.getMainWindow();
    const result =
      mainWindow && !mainWindow.isDestroyed()
        ? await dialog.showSaveDialog(mainWindow, options)
        : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) {
      return { ok: false as const };
    }
    copyFileSync(deps.databasePath, result.filePath);
    for (const suffix of ["-wal", "-shm"]) {
      const src = `${deps.databasePath}${suffix}`;
      if (existsSync(src)) {
        copyFileSync(src, `${result.filePath}${suffix}`);
      }
    }
    return { ok: true as const, path: result.filePath };
  });

  ipcMain.handle("hoshi:open-settings", async () => {
    await deps.openSettingsWindow();
  });

  ipcMain.handle("hoshi:open-workbench", async () => {
    await deps.openWorkbenchWindow();
  });

  ipcMain.handle("hoshi:workbench-ime", (_event, focused: unknown) => {
    const mainWindow = deps.getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }
    mainWindow.setAlwaysOnTop(focused !== true, "floating");
  });

  ipcMain.handle("hoshi:list-sandbox-plugins", () => listSandboxPluginEntries(deps.sandboxDir));

  ipcMain.handle("hoshi:list-live-plugins", () => listLivePlugins(deps.pluginsDir, deps.getSettings()));

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

  ipcMain.handle("hoshi:list-mcp-servers", () => deps.listMcpServers());

  ipcMain.handle("hoshi:list-mcp-templates", () => loadMcpTemplates());

  ipcMain.handle("hoshi:upsert-mcp-server", async (_event, payload: unknown) => {
    const server = parseMcpPayload(payload);
    upsertMcpServer(deps.mcpPath, server);
    await deps.reloadMcp();
    const row = deps.listMcpServers().find((item) => item.name === server.name);
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
    setMcpServerEnabled(deps.mcpPath, name, record.enabled !== false);
    await deps.reloadMcp();
    return { ok: true as const, servers: deps.listMcpServers() };
  });

  ipcMain.handle("hoshi:remove-mcp-server", async (_event, name: unknown) => {
    removeMcpServer(deps.mcpPath, String(name ?? ""));
    await deps.reloadMcp();
    return { ok: true as const };
  });

  ipcMain.handle("hoshi:reveal-mcp-config", async () => {
    if (!existsSync(deps.mcpPath)) {
      writeFileSync(deps.mcpPath, `${JSON.stringify({ servers: [] }, null, 2)}\n`);
    }
    shell.showItemInFolder(deps.mcpPath);
    return { ok: true as const };
  });

  ipcMain.handle("hoshi:get-theme", () => resolveActiveTheme(deps.pluginsDir, deps.getSettings().plugins.enabled));

  ipcMain.handle("hoshi:read-theme-pack", (_event, dirName: unknown) => {
    return readThemePack(deps.sandboxDir, String(dirName ?? ""));
  });

  ipcMain.handle("hoshi:read-live-theme-pack", (_event, dirName: unknown) => {
    return readLiveThemePack(deps.pluginsDir, String(dirName ?? ""));
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
    return writeThemePack(deps.sandboxDir, String(record.id ?? ""), {
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

  ipcMain.handle("hoshi:read-layout", (_event, dirName: unknown) => readLayout(deps.sandboxDir, String(dirName ?? "")));

  ipcMain.handle("hoshi:write-layout", (_event, payload: unknown) => {
    const record = payload && typeof payload === "object" ? (payload as { id?: unknown; nodes?: unknown }) : {};
    const nodes = Array.isArray(record.nodes)
      ? record.nodes.filter((item): item is { id: string; type: "image" | "text" | "deco"; x: number; y: number; w: number; h: number; src?: string; text?: string } =>
          Boolean(item) && typeof item === "object" && typeof (item as { id?: unknown }).id === "string"
        )
      : [];
    return writeLayout(deps.sandboxDir, String(record.id ?? ""), nodes);
  });

  ipcMain.handle("hoshi:upload-sandbox-asset", (_event, payload: unknown) => {
    const record =
      payload && typeof payload === "object" ? (payload as { id?: unknown; rel?: unknown; b64?: unknown }) : {};
    const buf = Buffer.from(String(record.b64 ?? ""), "base64");
    return writeSandboxAsset(deps.sandboxDir, String(record.id ?? ""), String(record.rel ?? ""), buf);
  });

  ipcMain.handle("hoshi:sandbox-asset-url", (_event, payload: unknown) => {
    const record = payload && typeof payload === "object" ? (payload as { id?: unknown; rel?: unknown; live?: unknown }) : {};
    const id = String(record.id ?? "");
    const rel = String(record.rel ?? "");
    if (record.live === true) return { url: liveAssetDataUrl(deps.pluginsDir, id, rel) };
    return { url: sandboxAssetDataUrl(deps.sandboxDir, id, rel) };
  });

  ipcMain.handle("hoshi:read-sandbox-plugin-form", (_event, dirName: unknown) => {
    return readSandboxPluginForm(deps.sandboxDir, String(dirName ?? ""));
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
    return patchSandboxPluginForm(deps.sandboxDir, String(record.id ?? ""), {
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
    createSandboxPlugin(deps.sandboxDir, dirName, kind);
    return { id: dirName };
  });

  ipcMain.handle("hoshi:delete-sandbox-plugin", async (_event, dirName: unknown) => {
    const id = String(dirName ?? "");
    closePluginRuntime(id);
    uninstallPlugin({
      sandboxDir: deps.sandboxDir,
      pluginsDir: deps.pluginsDir,
      mcpPath: deps.mcpPath,
      storageDir: deps.pluginStorageDir,
      settings: deps.getSettings(),
      dirName: id
    });
    saveHoshiSettings(deps.userDataDir, deps.getSettings());
    deps.applySettings({ ...deps.getSettings(), voice: resolveWhisperVoice(deps.getSettings().voice) });
    deps.pushSettings();
    return { id };
  });

  ipcMain.handle("hoshi:publish-sandbox-plugin", async (_event, dirName: unknown) => {
    try {
      const result = await publishSandboxPlugin({
        sandboxDir: deps.sandboxDir,
        pluginsDir: deps.pluginsDir,
        mcpPath: deps.mcpPath,
        dirName: String(dirName ?? ""),
        settings: deps.getSettings()
      });
      saveHoshiSettings(deps.userDataDir, deps.getSettings());
      deps.applySettings({ ...deps.getSettings(), voice: resolveWhisperVoice(deps.getSettings().voice) });
      deps.pushSettings();
      return { ok: true as const, id: result.id, ...(result.howToUse ? { howToUse: result.howToUse } : {}) };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : "上线失败" };
    }
  });

  ipcMain.handle("hoshi:open-plugins-dir", async () => {
    mkdirSync(deps.pluginsDir, { recursive: true });
    await shell.openPath(deps.pluginsDir);
  });

  ipcMain.handle("hoshi:get-theme-sound", () => {
    return themeSoundDataUrl(deps.pluginsDir, deps.getSettings().plugins.enabled);
  });

  ipcMain.handle("hoshi:get-sprite-data", (_event, emotion: string) => {
    const overlay = pluginSpriteFile(deps.pluginsDir, deps.getSettings().plugins.enabled, emotion);
    const spritePath = overlay ?? deps.persona.sprites[emotion as keyof typeof deps.persona.sprites];
    if (!spritePath) {
      throw new Error(`unknown emotion: ${emotion}`);
    }
    const ext = extname(spritePath).toLowerCase();
    const mime = ext === ".webp" ? "image/webp" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
    const base64 = readFileSync(spritePath).toString("base64");
    return `data:${mime};base64,${base64}`;
  });

  ipcMain.handle("hoshi:list-plugin-actions", () => listPluginFanActions(deps.pluginsDir, deps.getSettings().plugins.enabled));

  ipcMain.handle("hoshi:open-plugin-window", (_event, payload: unknown) => {
    const record = payload && typeof payload === "object" ? (payload as { pluginId?: unknown; window?: unknown }) : {};
    openPluginWindow(deps.pluginsDir, deps.getSettings().plugins.enabled, String(record.pluginId ?? ""), String(record.window ?? ""));
  });

  ipcMain.handle("hoshi:open-plugin-panel", () => {
    openAppBox(deps.pluginsDir, deps.getSettings().plugins.enabled);
  });
  ipcMain.handle("hoshi:open-app-box", () => {
    openAppBox(deps.pluginsDir, deps.getSettings().plugins.enabled);
  });

  const petSender = (sender: WebContents): boolean => {
    const mainWindow = deps.getMainWindow();
    return Boolean(mainWindow && !mainWindow.isDestroyed() && sender === mainWindow.webContents);
  };

  const applyPetScreenExclusion = (on: boolean): void => {
    setPetScreenExcluded(on);
    const mainWindow = deps.getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setContentProtection(on);
      reviveTransparentPetWindow(mainWindow);
    }
    const settingsWindow = deps.getSettingsWindow();
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.setContentProtection(on);
    }
    setRemindToastContentProtection(on);
  };

  ipcMain.handle("hoshi:set-screen-excluded", (event, on: unknown) => {
    if (!petSender(event.sender)) {
      return { ok: false as const };
    }
    applyPetScreenExclusion(on === true);
    return { ok: true as const };
  });

  ipcMain.handle("hoshi:capture-screen", async (event) => {
    const mainWindow = deps.getMainWindow();
    if (!petSender(event.sender) || !mainWindow) {
      return { ok: false as const, reason: "failed" as const };
    }
    const shot = await capturePetScreen(mainWindow);
    reviveTransparentPetWindow(mainWindow);
    return shot;
  });

  ipcMain.handle("hoshi:set-ignore-mouse-events", (_event, ignore: boolean) => {
    const mainWindow = deps.getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }
    const workbenchWindow = deps.getWorkbenchWindow();
    const workbenchOpen = Boolean(workbenchWindow && !workbenchWindow.isDestroyed());
    if (!ignore) {
      mainWindow.setFocusable(true);
    } else if (workbenchOpen && !mainWindow.isFocused()) {
      mainWindow.setFocusable(false);
    }
    mainWindow.setIgnoreMouseEvents(ignore, { forward: true });
  });

  ipcMain.handle("hoshi:move-window-by", (_event, dx: number, dy: number) => {
    const mainWindow = deps.getMainWindow();
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
}
