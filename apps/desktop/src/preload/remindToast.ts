import { contextBridge, ipcRenderer } from "electron";

type ThemeTokens = { bg: string; font: string; dialog: string; menu: string; sound: string };

contextBridge.exposeInMainWorld("hoshiRemind", {
  close: () => ipcRenderer.invoke("hoshi:remind-toast-close"),
  openApps: () => ipcRenderer.invoke("hoshi:remind-toast-open-apps"),
  onPayload: (cb: (payload: { title: string; body: string; tokens: ThemeTokens }) => void) => {
    ipcRenderer.on("hoshi:remind-toast", (_event, payload: { title: string; body: string; tokens: ThemeTokens }) => {
      cb(payload);
    });
  }
});
