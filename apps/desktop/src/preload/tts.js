"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld("hoshiTts", {
    onPcm(handler) {
        electron_1.ipcRenderer.on("hoshi:tts-pcm", (_event, bytes, sampleRate) => {
            handler(bytes, sampleRate);
        });
    },
    onStop(handler) {
        electron_1.ipcRenderer.on("hoshi:tts-stop", () => {
            handler();
        });
    }
});
