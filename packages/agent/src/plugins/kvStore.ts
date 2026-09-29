import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PLUGIN_ID = /^[A-Za-z0-9_-]+$/;
const KEY = /^[A-Za-z0-9._/-]{1,128}$/;
const VALUE_MAX = 1_000_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function kvPath(storageDir: string, pluginId: string): string {
  if (!PLUGIN_ID.test(pluginId)) {
    throw new Error("插件 id 无效");
  }
  return join(storageDir, `${pluginId}.json`);
}

export function readPluginKv(storageDir: string, pluginId: string): Record<string, string> {
  const file = kvPath(storageDir, pluginId);
  if (!existsSync(file)) {
    return {};
  }
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
    if (!isRecord(raw)) {
      return {};
    }
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (typeof value === "string") {
        out[key] = value;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function pluginKvGet(storageDir: string, pluginId: string, key: string): string | null {
  if (!KEY.test(key)) {
    return null;
  }
  return readPluginKv(storageDir, pluginId)[key] ?? null;
}

export function kvEncode(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value == null) {
    return "";
  }
  return JSON.stringify(value);
}

export function pluginKvSet(storageDir: string, pluginId: string, key: string, value: unknown): void {
  if (!KEY.test(key)) {
    throw new Error("key 无效");
  }
  const text = kvEncode(value);
  if (text.length > VALUE_MAX) {
    throw new Error("value 无效");
  }
  mkdirSync(storageDir, { recursive: true });
  const data = readPluginKv(storageDir, pluginId);
  data[key] = text;
  writeFileSync(kvPath(storageDir, pluginId), `${JSON.stringify(data)}\n`);
}
