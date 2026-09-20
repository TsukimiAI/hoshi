"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureTtsPlayer = ensureTtsPlayer;
exports.playTtsPcm = playTtsPcm;
exports.stopTtsPlayer = stopTtsPlayer;
exports.closeTtsPlayer = closeTtsPlayer;
const electron_1 = require("electron");
const node_path_1 = require("node:path");
let audioWindow = null;
async function ensureTtsPlayer() {
    if (audioWindow && !audioWindow.isDestroyed()) {
        return;
    }
    audioWindow = new electron_1.BrowserWindow({
        width: 80,
        height: 80,
        show: false,
        skipTaskbar: true,
        frame: false,
        focusable: false,
        webPreferences: {
            preload: (0, node_path_1.join)(__dirname, "../preload/tts.js"),
            contextIsolation: true,
            nodeIntegration: false,
            autoplayPolicy: "no-user-gesture-required",
            backgroundThrottling: false
        }
    });
    audioWindow.webContents.setBackgroundThrottling(false);
    audioWindow.webContents.setAudioMuted(false);
    await audioWindow.loadFile((0, node_path_1.join)(__dirname, "../renderer/audio-player.html"));
    audioWindow.on("closed", () => {
        audioWindow = null;
    });
}
function playTtsPcm(pcm, sampleRate) {
    if (!audioWindow || audioWindow.isDestroyed() || pcm.length < 2) {
        return;
    }
    audioWindow.webContents.send("hoshi:tts-pcm", Uint8Array.from(pcm), sampleRate);
}
function stopTtsPlayer() {
    if (audioWindow && !audioWindow.isDestroyed()) {
        audioWindow.webContents.send("hoshi:tts-stop");
    }
}
function closeTtsPlayer() {
    stopTtsPlayer();
    if (audioWindow && !audioWindow.isDestroyed()) {
        audioWindow.close();
    }
    audioWindow = null;
}
