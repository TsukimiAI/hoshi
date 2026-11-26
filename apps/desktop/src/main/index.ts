import "./registerMediaScheme";
import { registerMainIpc } from "./ipcHandlers";
import { app, BrowserWindow, dialog, ipcMain, nativeImage, session, shell, type WebContents } from "electron";
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, statSync, renameSync, copyFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
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
import { PET_SCREEN, petScreenIntervalMs, petScreenUnchanged, resolveHoshiSettings } from "@hoshi/shared";
import { downloadWhisperModel, resolveWhisperVoice } from "./whisperAssets";
import { loadHoshiSettings, saveHoshiSettings } from "./settingsStore";
import {
  listWallpaperHistory,
  readWallpaperDataUrl,
  removeWallpaper,
  useWallpaperHistory,
  writeWallpaper
} from "./wallpaper";
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
import { configureRemindToast, relayoutRemindToast, setRemindToastContentProtection } from "./remindToast";
import { capturePetScreen, isPetScreenExcluded, reviveTransparentPetWindow, setPetScreenExcluded } from "./screenCapture";
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

  const personaPath = resolve(repoRoot, "personas/default/persona.json");

  const userDataDir = app.getPath("userData");
  const databasePath = join(userDataDir, "hoshi.db");
  let settings = loadHoshiSettings(userDataDir);
  setPetScreenExcluded(settings.screen.enabled);
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
    settingsWindow.setContentProtection(isPetScreenExcluded());
    settingsWindow.on("closed", () => {
      settingsWindow = null;
    });
    await settingsWindow.loadFile(join(__dirname, "../renderer/settings.html"));
    settingsWindow.show();
    settingsWindow.focus();
  };

  const pokePetMouse = (): void => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("hoshi:pet-mouse-reset");
    }
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
    pokePetMouse();
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
    pokePetMouse();
  };


  let themePreview: { bg: string; font: string; dialog: string; menu: string } | null = null;
  const pushThemePreview = (): void => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("hoshi:theme-preview", themePreview);
    }
  };

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

  registerMainIpc({
    getSettings: () => settings,
    setSettings: (next) => {
      settings = next;
    },
    getMainWindow: () => mainWindow,
    getSettingsWindow: () => settingsWindow,
    getWorkbenchWindow: () => workbenchWindow,
    userDataDir,
    pluginsDir,
    sandboxDir,
    pluginStorageDir,
    mcpPath,
    databasePath,
    agentBaseUrl,
    authToken,
    persona,
    pushSettings,
    applySettings,
    openSettingsWindow,
    openWorkbenchWindow,
    getThemePreview: () => themePreview,
    setThemePreview: (next) => {
      themePreview = next;
    },
    pushThemePreview,
    listMcpServers,
    reloadMcp
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
  mainWindow.setContentProtection(isPetScreenExcluded());
  reviveTransparentPetWindow(mainWindow);
  mainWindow.webContents.setBackgroundThrottling(false);
  mainWindow.webContents.setAudioMuted(false);

  await mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  reviveTransparentPetWindow(mainWindow);
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

function applyAppIcon(): void {
  const icon = nativeImage.createFromPath(join(__dirname, "../resources/icon.png"));
  if (icon.isEmpty()) return;
  if (process.platform === "darwin") app.dock?.setIcon(icon);
}

app.whenReady().then(() => {
  applyAppIcon();
  void bootstrap();
});

app.on("window-all-closed", () => {
  app.quit();
});
