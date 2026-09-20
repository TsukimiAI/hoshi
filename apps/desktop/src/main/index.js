"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const dotenv_1 = require("dotenv");
const agent_1 = require("@hoshi/agent");
const shared_1 = require("@hoshi/shared");
const whisperAssets_1 = require("./whisperAssets");
const settingsStore_1 = require("./settingsStore");
const ttsPlayer_1 = require("./ttsPlayer");
electron_1.app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
electron_1.app.commandLine.appendSwitch("disable-renderer-backgrounding");
electron_1.app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
let mainWindow = null;
let settingsWindow = null;
const WINDOW_SIZE = { width: 520, height: 360 };
const SETTINGS_WINDOW_SIZE = { width: 760, height: 520 };
async function bootstrap() {
    const repoRoot = (0, node_path_1.resolve)(__dirname, "../../../..");
    (0, dotenv_1.config)({ path: (0, node_path_1.resolve)(repoRoot, ".env") });
    const personaPath = (0, node_path_1.resolve)(repoRoot, "personas/default/persona.json");
    const databaseUrl = process.env.DATABASE_URL ?? "";
    if (!databaseUrl) {
        throw new Error("DATABASE_URL is required");
    }
    const userDataDir = electron_1.app.getPath("userData");
    const envSeed = {
        apiKey: process.env.HOSHI_API_KEY,
        baseUrl: process.env.HOSHI_BASE_URL,
        model: process.env.HOSHI_MODEL
    };
    let settings = (0, settingsStore_1.loadHoshiSettings)(userDataDir, envSeed);
    const pluginsDir = (0, node_path_1.join)(userDataDir, "plugins");
    (0, node_fs_1.mkdirSync)(pluginsDir, { recursive: true });
    const { server, persona, applySettings, authToken } = (0, agent_1.createAgentServer)({
        personaPath,
        apiKey: settings.model.apiKey,
        baseUrl: settings.model.baseUrl,
        model: settings.model.model,
        databaseUrl,
        pluginsDir
    });
    applySettings({ ...settings, voice: (0, whisperAssets_1.resolveWhisperVoice)(settings.voice) });
    await (0, ttsPlayer_1.ensureTtsPlayer)();
    (0, agent_1.setTtsPcmSink)(ttsPlayer_1.playTtsPcm, ttsPlayer_1.stopTtsPlayer);
    electron_1.session.defaultSession.setPermissionCheckHandler((_webContents, permission, _origin, details) => {
        if (permission !== "media") {
            return true;
        }
        return details.mediaType !== "video";
    });
    electron_1.session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback, details) => {
        if (permission !== "media") {
            callback(true);
            return;
        }
        const types = "mediaTypes" in details && Array.isArray(details.mediaTypes) ? details.mediaTypes : [];
        callback(!types.includes("video"));
    });
    await new Promise((resolveListen) => {
        server.listen(0, "127.0.0.1", () => resolveListen());
    });
    const address = server.address();
    if (!address || typeof address === "string") {
        throw new Error("failed to bind agent server");
    }
    const agentBaseUrl = `http://127.0.0.1:${address.port}`;
    const openSettingsWindow = async () => {
        if (settingsWindow && !settingsWindow.isDestroyed()) {
            settingsWindow.show();
            settingsWindow.focus();
            return;
        }
        settingsWindow = new electron_1.BrowserWindow({
            width: SETTINGS_WINDOW_SIZE.width,
            height: SETTINGS_WINDOW_SIZE.height,
            minWidth: 640,
            minHeight: 420,
            title: "星奈设置",
            autoHideMenuBar: true,
            alwaysOnTop: true,
            webPreferences: {
                preload: (0, node_path_1.join)(__dirname, "../preload/index.js"),
                contextIsolation: true,
                nodeIntegration: false
            }
        });
        settingsWindow.on("closed", () => {
            settingsWindow = null;
        });
        await settingsWindow.loadFile((0, node_path_1.join)(__dirname, "../renderer/settings.html"));
        settingsWindow.show();
        settingsWindow.focus();
    };
    electron_1.ipcMain.handle("hoshi:get-config", () => ({
        agentBaseUrl,
        agentToken: authToken,
        defaultEmotion: persona.defaultEmotion,
        thinkingEmotion: persona.thinkingEmotion,
        presentation: settings.presentation
    }));
    electron_1.ipcMain.handle("hoshi:get-settings", () => settings);
    electron_1.ipcMain.handle("hoshi:save-settings", (_event, next) => {
        settings = (0, shared_1.resolveHoshiSettings)(next, envSeed);
        (0, settingsStore_1.saveHoshiSettings)(userDataDir, settings);
        applySettings({ ...settings, voice: (0, whisperAssets_1.resolveWhisperVoice)(settings.voice) });
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("hoshi:settings-updated", settings);
        }
        return settings;
    });
    electron_1.ipcMain.handle("hoshi:test-gsv", async (_event, baseUrl) => {
        let parsed;
        try {
            parsed = new URL(String(baseUrl ?? "").trim());
        }
        catch {
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
        return { ok: true };
    });
    electron_1.ipcMain.handle("hoshi:download-whisper-model", async () => {
        const path = await (0, whisperAssets_1.downloadWhisperModel)();
        applySettings({ ...settings, voice: (0, whisperAssets_1.resolveWhisperVoice)(settings.voice) });
        return { ok: true, path };
    });
    electron_1.ipcMain.handle("hoshi:open-settings", async () => {
        await openSettingsWindow();
    });
    electron_1.ipcMain.handle("hoshi:open-plugins-dir", async () => {
        (0, node_fs_1.mkdirSync)(pluginsDir, { recursive: true });
        await electron_1.shell.openPath(pluginsDir);
    });
    electron_1.ipcMain.handle("hoshi:get-sprite-data", (_event, emotion) => {
        const spritePath = persona.sprites[emotion];
        if (!spritePath) {
            throw new Error(`unknown emotion: ${emotion}`);
        }
        const base64 = (0, node_fs_1.readFileSync)(spritePath).toString("base64");
        return `data:image/png;base64,${base64}`;
    });
    electron_1.ipcMain.handle("hoshi:set-ignore-mouse-events", (_event, ignore) => {
        if (!mainWindow) {
            return;
        }
        mainWindow.setIgnoreMouseEvents(ignore, { forward: true });
    });
    electron_1.ipcMain.handle("hoshi:move-window-by", (_event, dx, dy) => {
        if (!mainWindow) {
            return;
        }
        const bounds = mainWindow.getBounds();
        mainWindow.setBounds({
            x: Math.round(bounds.x + dx),
            y: Math.round(bounds.y + dy),
            width: bounds.width,
            height: bounds.height
        }, false);
    });
    mainWindow = new electron_1.BrowserWindow({
        width: WINDOW_SIZE.width,
        height: WINDOW_SIZE.height,
        frame: false,
        transparent: true,
        hasShadow: false,
        alwaysOnTop: true,
        resizable: false,
        skipTaskbar: true,
        webPreferences: {
            preload: (0, node_path_1.join)(__dirname, "../preload/index.js"),
            contextIsolation: true,
            nodeIntegration: false,
            autoplayPolicy: "no-user-gesture-required",
            backgroundThrottling: false
        }
    });
    mainWindow.webContents.setBackgroundThrottling(false);
    mainWindow.webContents.setAudioMuted(false);
    await mainWindow.loadFile((0, node_path_1.join)(__dirname, "../renderer/index.html"));
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
    mainWindow.on("closed", () => {
        mainWindow = null;
        if (settingsWindow && !settingsWindow.isDestroyed()) {
            settingsWindow.close();
        }
        (0, ttsPlayer_1.closeTtsPlayer)();
        electron_1.app.quit();
    });
}
electron_1.app.whenReady().then(() => {
    void bootstrap();
});
electron_1.app.on("window-all-closed", () => {
    electron_1.app.quit();
});
