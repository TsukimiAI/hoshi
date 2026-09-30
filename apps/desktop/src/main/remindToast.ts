import { BrowserWindow, ipcMain, screen } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getMainWindow, openAppBox } from "./pluginContrib";

export const TOAST_W = 268;
export const TOAST_H = 128;
const PET_LEFT = 8;
const PET_BOTTOM = 12;
const PET_W = 168;
const PET_H = 280;

type ToastItem = { title: string; body: string; eventId: string };

let toastWin: BrowserWindow | null = null;
let queued: ToastItem[] = [];
let visible = false;
let ipcReady = false;
let follow: (() => void) | null = null;
let followWin: BrowserWindow | null = null;
let pending: ToastItem | null = null;
let pageReady = false;
let getPluginsDir: () => string = () => "";
let getEnabled: () => string[] = () => [];
let getTheme: () => { id: string; tokens: { bg: string; font: string; dialog: string; menu: string; sound: string } } | null =
  () => null;

function toastHtml(): string {
  const dist = join(__dirname, "../renderer/remind-toast.html");
  if (existsSync(dist)) return dist;
  return join(__dirname, "../../src/renderer/remind-toast.html");
}

function toastBoundsFromPet(pet: { x: number; y: number; width: number; height: number }): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const wa = screen.getDisplayMatching({
    x: pet.x,
    y: pet.y,
    width: pet.width,
    height: pet.height
  }).workArea;
  const spriteX = pet.x + PET_LEFT;
  const spriteY = pet.y + pet.height - PET_BOTTOM - PET_H;
  let x = Math.round(spriteX + PET_W * 0.72);
  let y = Math.round(spriteY + PET_H * 0.06);
  if (x + TOAST_W > wa.x + wa.width) {
    x = wa.x + wa.width - TOAST_W;
  }
  if (x < wa.x) {
    x = wa.x;
  }
  if (y < wa.y) {
    y = wa.y;
  }
  if (y + TOAST_H > wa.y + wa.height) {
    y = Math.max(wa.y, wa.y + wa.height - TOAST_H);
  }
  return { x, y, width: TOAST_W, height: TOAST_H };
}

function layoutToast(): void {
  const main = getMainWindow();
  if (!main || main.isDestroyed() || !toastWin || toastWin.isDestroyed()) return;
  toastWin.setBounds(toastBoundsFromPet(main.getBounds()), false);
}

function unhookFollow(): void {
  if (followWin && follow && !followWin.isDestroyed()) {
    followWin.removeListener("move", follow);
    followWin.removeListener("moved", follow);
  }
  followWin = null;
  follow = null;
}

function hookFollow(win: BrowserWindow): void {
  unhookFollow();
  follow = () => layoutToast();
  followWin = win;
  win.on("move", follow);
  win.on("moved", follow);
}

function ensureIpc(): void {
  if (ipcReady) return;
  ipcReady = true;
  ipcMain.handle("hoshi:remind-toast-close", (event) => {
    if (!toastWin || event.sender !== toastWin.webContents) throw new Error("forbidden");
    hideToast();
  });
  ipcMain.handle("hoshi:remind-toast-open-apps", (event) => {
    if (!toastWin || event.sender !== toastWin.webContents) throw new Error("forbidden");
    hideToast();
    openAppBox(getPluginsDir(), getEnabled());
  });
}

function pushPayload(): void {
  if (!toastWin || toastWin.isDestroyed() || !pageReady || !pending) return;
  const tokens = getTheme()?.tokens ?? { bg: "#f5f5f7", font: "", dialog: "#1d1d1f", menu: "#ffffff", sound: "" };
  toastWin.webContents.send("hoshi:remind-toast", {
    title: pending.title,
    body: pending.body,
    tokens
  });
  layoutToast();
  toastWin.setAlwaysOnTop(true, "floating");
  toastWin.showInactive();
  toastWin.moveTop();
}

function hideToast(): void {
  visible = false;
  pending = null;
  if (toastWin && !toastWin.isDestroyed()) {
    toastWin.hide();
  }
  const next = queued.shift();
  if (next) {
    visible = true;
    void present(next);
  }
}

async function present(item: ToastItem): Promise<void> {
  const main = getMainWindow();
  if (!main || main.isDestroyed()) {
    visible = false;
    return;
  }
  pending = item;
  ensureIpc();
  try {
    if (!toastWin || toastWin.isDestroyed()) {
      pageReady = false;
      toastWin = new BrowserWindow({
        ...toastBoundsFromPet(main.getBounds()),
        frame: false,
        transparent: true,
        hasShadow: false,
        alwaysOnTop: true,
        resizable: false,
        skipTaskbar: true,
        show: false,
        webPreferences: {
          preload: join(__dirname, "../preload/remindToast.js"),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          autoplayPolicy: "no-user-gesture-required"
        }
      });
      toastWin.setAlwaysOnTop(true, "floating");
      toastWin.webContents.on("did-finish-load", () => {
        pageReady = true;
        pushPayload();
      });
      toastWin.on("closed", () => {
        toastWin = null;
        visible = false;
        pageReady = false;
        pending = null;
        unhookFollow();
      });
      await toastWin.loadFile(toastHtml());
    } else {
      pushPayload();
    }
    hookFollow(main);
    layoutToast();
  } catch {
    visible = false;
    pending = null;
    if (toastWin && !toastWin.isDestroyed()) {
      toastWin.destroy();
    }
    toastWin = null;
  }
}

export function configureRemindToast(input: {
  getPluginsDir: () => string;
  getEnabled: () => string[];
  getTheme: () => { id: string; tokens: { bg: string; font: string; dialog: string; menu: string; sound: string } } | null;
}): void {
  getPluginsDir = input.getPluginsDir;
  getEnabled = input.getEnabled;
  getTheme = input.getTheme;
}

export function showingRemindEventId(): string {
  return visible && pending ? pending.eventId : "";
}

export function showRemindToast(item: ToastItem): void {
  if (visible && toastWin && !toastWin.isDestroyed()) {
    queued = queued.filter((row) => row.eventId !== item.eventId);
    pending = item;
    pushPayload();
    return;
  }
  visible = true;
  void present(item);
}

export function refreshRemindToast(item: ToastItem): void {
  if (!visible || !pending || pending.eventId !== item.eventId) return;
  pending = item;
  pushPayload();
}

export function closeRemindToast(): void {
  queued = [];
  visible = false;
  pending = null;
  unhookFollow();
  if (toastWin && !toastWin.isDestroyed()) {
    toastWin.destroy();
  }
  toastWin = null;
}

export function relayoutRemindToast(): void {
  if (visible) layoutToast();
}
