import { BrowserWindow } from "electron";
import { join } from "node:path";

let audioWindow: BrowserWindow | null = null;

export async function ensureTtsPlayer(): Promise<void> {
  if (audioWindow && !audioWindow.isDestroyed()) {
    return;
  }
  audioWindow = new BrowserWindow({
    width: 80,
    height: 80,
    show: false,
    skipTaskbar: true,
    frame: false,
    focusable: false,
    webPreferences: {
      preload: join(__dirname, "../preload/tts.js"),
      contextIsolation: true,
      nodeIntegration: false,
      autoplayPolicy: "no-user-gesture-required",
      backgroundThrottling: false
    }
  });
  audioWindow.webContents.setBackgroundThrottling(false);
  audioWindow.webContents.setAudioMuted(false);
  await audioWindow.loadFile(join(__dirname, "../renderer/audio-player.html"));
  audioWindow.on("closed", () => {
    audioWindow = null;
  });
}

export function playTtsPcm(pcm: Buffer, sampleRate: number): void {
  if (!audioWindow || audioWindow.isDestroyed() || pcm.length < 2) {
    return;
  }
  audioWindow.webContents.send("hoshi:tts-pcm", Uint8Array.from(pcm), sampleRate);
}

export function stopTtsPlayer(): void {
  if (audioWindow && !audioWindow.isDestroyed()) {
    audioWindow.webContents.send("hoshi:tts-stop");
  }
}

export function closeTtsPlayer(): void {
  stopTtsPlayer();
  if (audioWindow && !audioWindow.isDestroyed()) {
    audioWindow.close();
  }
  audioWindow = null;
}
