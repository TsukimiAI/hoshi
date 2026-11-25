import { desktopCapturer, screen, systemPreferences, type BrowserWindow, type NativeImage } from "electron";
import {
  PET_SCREEN,
  dHashFromGray,
  pickDisplaySource,
  screenCaptureGate,
  type PetScreenShot
} from "@hoshi/shared";

const HASH_WIDTH = 9;
const HASH_HEIGHT = 8;

let deniedAttempted = false;
let excluded = false;

export function isPetScreenExcluded(): boolean {
  return excluded;
}

export function setPetScreenExcluded(on: boolean): void {
  excluded = on;
}

/** macOS 上给透明窗口开内容保护或调用 desktopCapturer 后，网页层会丢，立绘变成破图。 */
export function reviveTransparentPetWindow(win: BrowserWindow): void {
  if (process.platform !== "darwin" || win.isDestroyed()) {
    return;
  }
  win.setBackgroundColor("#00000000");
  const opacity = win.getOpacity();
  win.setOpacity(opacity > 0.99 ? 0.99 : opacity);
  setTimeout(() => {
    if (!win.isDestroyed()) {
      win.setOpacity(1);
    }
  }, 50);
}

export async function capturePetScreen(win: BrowserWindow): Promise<PetScreenShot> {
  let status = "unknown";
  try {
    status = systemPreferences.getMediaAccessStatus("screen");
  } catch {
    status = "unknown";
  }
  const gate = screenCaptureGate(status, deniedAttempted);
  if (gate === "restricted") {
    return { ok: false, reason: "restricted" };
  }
  if (gate === "denied") {
    return { ok: false, reason: "denied" };
  }
  if (status === "denied") {
    deniedAttempted = true;
  }

  let displayId = "";
  if (!win.isDestroyed()) {
    displayId = String(screen.getDisplayMatching(win.getBounds()).id);
  }
  try {
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: PET_SCREEN.maxEdge, height: PET_SCREEN.maxEdge }
    });
    const source = pickDisplaySource(sources, displayId);
    if (!source || source.thumbnail.isEmpty()) {
      return { ok: false, reason: "no-source" };
    }
    return shotFromThumbnail(source.thumbnail);
  } catch {
    return { ok: false, reason: "failed" };
  }
}

function shotFromThumbnail(image: NativeImage): PetScreenShot {
  const jpeg = image.toJPEG(PET_SCREEN.jpegQuality);
  if (jpeg.length === 0) {
    return { ok: false, reason: "failed" };
  }
  const bgra = image.resize({ width: HASH_WIDTH, height: HASH_HEIGHT, quality: "good" }).toBitmap();
  const gray = grayFromBgra(bgra);
  if (!gray) {
    return { ok: false, reason: "failed" };
  }
  return {
    ok: true,
    mime: "image/jpeg",
    data: jpeg.toString("base64"),
    hash: dHashFromGray(gray)
  };
}

function grayFromBgra(bgra: Buffer): number[] | null {
  if (bgra.length !== HASH_WIDTH * HASH_HEIGHT * 4) {
    return null;
  }
  const samples: number[] = [];
  for (let i = 0; i < HASH_WIDTH * HASH_HEIGHT; i += 1) {
    const offset = i * 4;
    const blue = bgra[offset] ?? 0;
    const green = bgra[offset + 1] ?? 0;
    const red = bgra[offset + 2] ?? 0;
    samples.push((red + green + blue) / 3);
  }
  return samples;
}
