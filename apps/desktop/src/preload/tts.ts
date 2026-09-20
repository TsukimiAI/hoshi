import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("hoshiTts", {
  onPcm(handler: (bytes: Uint8Array, sampleRate: number) => void) {
    ipcRenderer.on("hoshi:tts-pcm", (_event, bytes: Uint8Array, sampleRate: number) => {
      handler(bytes, sampleRate);
    });
  },
  onStop(handler: () => void) {
    ipcRenderer.on("hoshi:tts-stop", () => {
      handler();
    });
  }
});
