import { app, BrowserWindow, ipcMain, session, shell } from "electron";
import { mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { createAgentServer, setTtsPcmSink } from "@hoshi/agent";
import { resolveHoshiSettings } from "@hoshi/shared";
import { downloadWhisperModel, resolveWhisperVoice } from "./whisperAssets";
import { loadHoshiSettings, saveHoshiSettings } from "./settingsStore";
import { closeTtsPlayer, ensureTtsPlayer, playTtsPcm, stopTtsPlayer } from "./ttsPlayer";

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");

let mainWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
const WINDOW_SIZE = { width: 520, height: 360 };
const SETTINGS_WINDOW_SIZE = { width: 760, height: 520 };

async function bootstrap() {
  const repoRoot = resolve(__dirname, "../../../..");
  loadDotenv({ path: resolve(repoRoot, ".env") });

  const personaPath = resolve(repoRoot, "personas/default/persona.json");
  const databaseUrl = process.env.DATABASE_URL ?? "";
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const userDataDir = app.getPath("userData");
  const envSeed = {
    apiKey: process.env.HOSHI_API_KEY,
    baseUrl: process.env.HOSHI_BASE_URL,
    model: process.env.HOSHI_MODEL
  };
  let settings = loadHoshiSettings(userDataDir, envSeed);
  const pluginsDir = join(userDataDir, "plugins");
  mkdirSync(pluginsDir, { recursive: true });

  const { server, persona, applySettings, authToken } = createAgentServer({
    personaPath,
    apiKey: settings.model.apiKey,
    baseUrl: settings.model.baseUrl,
    model: settings.model.model,
    databaseUrl,
    pluginsDir
  });
  applySettings({ ...settings, voice: resolveWhisperVoice(settings.voice) });
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

  ipcMain.handle("hoshi:get-config", () => ({
    agentBaseUrl,
    agentToken: authToken,
    defaultEmotion: persona.defaultEmotion,
    thinkingEmotion: persona.thinkingEmotion,
    presentation: settings.presentation
  }));

  ipcMain.handle("hoshi:get-settings", () => settings);

  ipcMain.handle("hoshi:save-settings", (_event, next: unknown) => {
    settings = resolveHoshiSettings(next, envSeed);
    saveHoshiSettings(userDataDir, settings);
    applySettings({ ...settings, voice: resolveWhisperVoice(settings.voice) });
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("hoshi:settings-updated", settings);
    }
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

  ipcMain.handle("hoshi:open-settings", async () => {
    await openSettingsWindow();
  });

  ipcMain.handle("hoshi:open-plugins-dir", async () => {
    mkdirSync(pluginsDir, { recursive: true });
    await shell.openPath(pluginsDir);
  });

  ipcMain.handle("hoshi:get-sprite-data", (_event, emotion: string) => {
    const spritePath = persona.sprites[emotion as keyof typeof persona.sprites];
    if (!spritePath) {
      throw new Error(`unknown emotion: ${emotion}`);
    }
    const base64 = readFileSync(spritePath).toString("base64");
    return `data:image/png;base64,${base64}`;
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
  mainWindow.on("closed", () => {
    mainWindow = null;
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.close();
    }
    closeTtsPlayer();
    app.quit();
  });
}

app.whenReady().then(() => {
  void bootstrap();
});

app.on("window-all-closed", () => {
  app.quit();
});
