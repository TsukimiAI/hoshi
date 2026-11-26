import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";

const MAX_BYTES = 4_000_000;
export const WALLPAPER_HISTORY_LIMIT = 8;
const HISTORY_ID = /^[a-z0-9]{8,32}$/i;

let lastCreatedMs = 0;

export function wallpaperFilePath(userDataDir: string): string {
  return join(userDataDir, "appearance", "wallpaper.jpg");
}

function appearanceDir(userDataDir: string): string {
  return join(userDataDir, "appearance");
}

function historyDir(userDataDir: string): string {
  return join(userDataDir, "appearance", "history");
}

function dbPath(userDataDir: string): string {
  return join(appearanceDir(userDataDir), "wallpapers.db");
}

export function isWallpaperHistoryId(id: string): boolean {
  return HISTORY_ID.test(id);
}

function historyFilePath(userDataDir: string, id: string): string | null {
  if (!isWallpaperHistoryId(id)) {
    return null;
  }
  const root = resolve(historyDir(userDataDir));
  const file = resolve(root, `${id}.jpg`);
  if (file !== root && !file.startsWith(`${root}${sep}`)) {
    return null;
  }
  return file;
}

function createdAt(): string {
  let ms = Date.now();
  if (ms <= lastCreatedMs) {
    ms = lastCreatedMs + 1;
  }
  lastCreatedMs = ms;
  return new Date(ms).toISOString();
}

function newHistoryId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function decodeJpeg(dataUrl: string): Buffer {
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl.trim());
  if (!match?.[1]) {
    throw new Error("壁纸格式无效");
  }
  const bytes = Buffer.from(match[1].replace(/\s+/g, ""), "base64");
  if (bytes.length < 32 || bytes.length > MAX_BYTES || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error("壁纸格式无效");
  }
  return bytes;
}

function withDb<T>(userDataDir: string, fn: (db: DatabaseSync) => T): T {
  mkdirSync(appearanceDir(userDataDir), { recursive: true });
  const db = new DatabaseSync(dbPath(userDataDir));
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS wallpaper_history (
        id TEXT PRIMARY KEY,
        rel_path TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);
    return fn(db);
  } finally {
    db.close();
  }
}

function trimHistory(db: DatabaseSync, userDataDir: string): void {
  const rows = db
    .prepare(`SELECT id FROM wallpaper_history ORDER BY created_at DESC`)
    .all() as Array<{ id?: string }>;
  for (const row of rows.slice(WALLPAPER_HISTORY_LIMIT)) {
    const id = String(row.id ?? "");
    db.prepare(`DELETE FROM wallpaper_history WHERE id = ?`).run(id);
    const file = historyFilePath(userDataDir, id);
    if (file && existsSync(file)) {
      rmSync(file);
    }
  }
}

function rememberHistoryBytes(userDataDir: string, bytes: Buffer): void {
  const id = newHistoryId();
  const file = historyFilePath(userDataDir, id);
  if (!file) {
    throw new Error("壁纸格式无效");
  }
  mkdirSync(historyDir(userDataDir), { recursive: true });
  writeFileSync(file, bytes);
  try {
    withDb(userDataDir, (db) => {
      db.prepare(
        `INSERT INTO wallpaper_history (id, rel_path, created_at) VALUES (?, ?, ?)`
      ).run(id, `history/${id}.jpg`, createdAt());
      trimHistory(db, userDataDir);
    });
  } catch (error) {
    if (existsSync(file)) {
      rmSync(file);
    }
    throw error;
  }
}

function dropMissing(userDataDir: string): void {
  withDb(userDataDir, (db) => {
    const rows = db.prepare(`SELECT id FROM wallpaper_history`).all() as Array<{ id?: string }>;
    for (const row of rows) {
      const id = String(row.id ?? "");
      const file = historyFilePath(userDataDir, id);
      if (!file || !existsSync(file)) {
        db.prepare(`DELETE FROM wallpaper_history WHERE id = ?`).run(id);
      }
    }
  });
}

function historyCount(userDataDir: string): number {
  return withDb(userDataDir, (db) => {
    const row = db.prepare(`SELECT COUNT(*) AS n FROM wallpaper_history`).get() as { n?: number } | undefined;
    return Number(row?.n ?? 0);
  });
}

export function writeWallpaper(userDataDir: string, dataUrl: string): void {
  const bytes = decodeJpeg(dataUrl);
  mkdirSync(appearanceDir(userDataDir), { recursive: true });
  writeFileSync(wallpaperFilePath(userDataDir), bytes);
  rememberHistoryBytes(userDataDir, bytes);
}

export function readWallpaperDataUrl(userDataDir: string): string {
  const file = wallpaperFilePath(userDataDir);
  if (!existsSync(file)) {
    return "";
  }
  return `data:image/jpeg;base64,${readFileSync(file).toString("base64")}`;
}

export function removeWallpaper(userDataDir: string): void {
  const file = wallpaperFilePath(userDataDir);
  if (existsSync(file)) {
    rmSync(file);
  }
}

export function listWallpaperHistory(userDataDir: string): Array<{ id: string; url: string }> {
  dropMissing(userDataDir);
  if (historyCount(userDataDir) === 0 && existsSync(wallpaperFilePath(userDataDir))) {
    rememberHistoryBytes(userDataDir, readFileSync(wallpaperFilePath(userDataDir)));
  }
  return withDb(userDataDir, (db) => {
    const rows = db
      .prepare(`SELECT id FROM wallpaper_history ORDER BY created_at DESC`)
      .all() as Array<{ id?: string }>;
    const items: Array<{ id: string; url: string }> = [];
    for (const row of rows) {
      const id = String(row.id ?? "");
      const file = historyFilePath(userDataDir, id);
      if (!file || !existsSync(file)) {
        continue;
      }
      items.push({
        id,
        url: `data:image/jpeg;base64,${readFileSync(file).toString("base64")}`
      });
    }
    return items;
  });
}

export function useWallpaperHistory(userDataDir: string, id: string): void {
  const file = historyFilePath(userDataDir, id);
  if (!file || !existsSync(file)) {
    throw new Error("壁纸不存在");
  }
  const known = withDb(userDataDir, (db) => {
    const row = db.prepare(`SELECT id FROM wallpaper_history WHERE id = ?`).get(id) as
      | { id?: string }
      | undefined;
    return Boolean(row?.id);
  });
  if (!known) {
    throw new Error("壁纸不存在");
  }
  mkdirSync(appearanceDir(userDataDir), { recursive: true });
  copyFileSync(file, wallpaperFilePath(userDataDir));
}
