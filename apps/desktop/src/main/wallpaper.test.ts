import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  listWallpaperHistory,
  readWallpaperDataUrl,
  removeWallpaper,
  useWallpaperHistory,
  writeWallpaper
} from "./wallpaper";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "hoshi-wall-"));
  dirs.push(dir);
  return dir;
}

function jpegDataUrl(mark: number): string {
  const bytes = Buffer.alloc(40, 0);
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  bytes[10] = mark;
  bytes[38] = 0xff;
  bytes[39] = 0xd9;
  return `data:image/jpeg;base64,${bytes.toString("base64")}`;
}

function historyFiles(dir: string): string[] {
  const folder = join(dir, "appearance", "history");
  if (!existsSync(folder)) {
    return [];
  }
  return readdirSync(folder).filter((name) => name.endsWith(".jpg"));
}

describe("wallpaper", () => {
  it("写入后能读回，清除后当前图为空，历史还在", () => {
    const dir = tempDir();
    writeWallpaper(dir, jpegDataUrl(1));
    expect(readWallpaperDataUrl(dir).startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(listWallpaperHistory(dir)).toHaveLength(1);
    removeWallpaper(dir);
    expect(readWallpaperDataUrl(dir)).toBe("");
    expect(listWallpaperHistory(dir)).toHaveLength(1);
  });

  it("点历史会换回当前图，且不另插一行", () => {
    const dir = tempDir();
    writeWallpaper(dir, jpegDataUrl(1));
    writeWallpaper(dir, jpegDataUrl(2));
    const items = listWallpaperHistory(dir);
    expect(items).toHaveLength(2);
    const older = items[1];
    expect(older).toBeTruthy();
    removeWallpaper(dir);
    useWallpaperHistory(dir, older?.id ?? "");
    expect(readWallpaperDataUrl(dir)).toBe(older?.url);
    expect(listWallpaperHistory(dir)).toHaveLength(2);
  });

  it("已有当前图且库为空时，列历史会把它记进去", () => {
    const dir = tempDir();
    const url = jpegDataUrl(3);
    const bytes = Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
    const appearance = join(dir, "appearance");
    mkdirSync(appearance, { recursive: true });
    writeFileSync(join(appearance, "wallpaper.jpg"), bytes);
    const items = listWallpaperHistory(dir);
    expect(items).toHaveLength(1);
    expect(items[0]?.url).toBe(url);
    expect(readWallpaperDataUrl(dir)).toBe(url);
  });

  it("超过 8 张时删掉最旧的文件", () => {
    const dir = tempDir();
    for (let mark = 1; mark <= 9; mark += 1) {
      writeWallpaper(dir, jpegDataUrl(mark));
    }
    const items = listWallpaperHistory(dir);
    expect(items).toHaveLength(8);
    expect(historyFiles(dir)).toHaveLength(8);
    expect(items.some((item) => item.url === jpegDataUrl(1))).toBe(false);
    expect(items[0]?.url).toBe(jpegDataUrl(9));
  });

  it("拒绝非 jpeg", () => {
    const dir = tempDir();
    expect(() => writeWallpaper(dir, "data:image/png;base64,aaaa")).toThrow(/壁纸格式无效/);
    expect(readWallpaperDataUrl(dir)).toBe("");
    expect(historyFiles(dir)).toHaveLength(0);
  });
});
