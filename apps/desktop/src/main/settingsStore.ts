import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { safeStorage } from "electron";
import {
  resolveHoshiSettings,
  type HoshiSettings,
  type SettingsEnvSeed
} from "@hoshi/shared";

export function settingsFilePath(userDataDir: string): string {
  return join(userDataDir, "settings.json");
}

export interface SettingsCrypto {
  available: () => boolean;
  encrypt: (plain: string) => string;
  decrypt: (payload: string) => string;
}

function defaultCrypto(): SettingsCrypto {
  return {
    available: () => safeStorage.isEncryptionAvailable(),
    encrypt: (plain) => safeStorage.encryptString(plain).toString("base64"),
    decrypt: (payload) => safeStorage.decryptString(Buffer.from(payload, "base64"))
  };
}

let cryptoImpl: SettingsCrypto = defaultCrypto();

export function setSettingsCrypto(next: SettingsCrypto | null): void {
  cryptoImpl = next ?? defaultCrypto();
}

function isEnvelope(raw: unknown): raw is { enc: string; payload: string } {
  if (!raw || typeof raw !== "object") {
    return false;
  }
  const rec = raw as { enc?: unknown; payload?: unknown };
  return rec.enc === "safeStorage" && typeof rec.payload === "string";
}

export function loadHoshiSettings(
  userDataDir: string,
  env: SettingsEnvSeed,
  crypto: SettingsCrypto = cryptoImpl
): HoshiSettings {
  const filePath = settingsFilePath(userDataDir);
  if (!existsSync(filePath)) {
    return resolveHoshiSettings(null, env);
  }
  try {
    const raw = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
    if (isEnvelope(raw)) {
      const json = JSON.parse(crypto.decrypt(raw.payload)) as unknown;
      return resolveHoshiSettings(json, env);
    }
    return resolveHoshiSettings(raw, env);
  } catch {
    return resolveHoshiSettings(null, env);
  }
}

export function saveHoshiSettings(
  userDataDir: string,
  settings: HoshiSettings,
  crypto: SettingsCrypto = cryptoImpl
): void {
  const filePath = settingsFilePath(userDataDir);
  mkdirSync(dirname(filePath), { recursive: true });
  if (!crypto.available()) {
    throw new Error("safeStorage unavailable");
  }
  writeFileSync(
    filePath,
    `${JSON.stringify({ enc: "safeStorage", payload: crypto.encrypt(JSON.stringify(settings)) })}\n`,
    "utf8"
  );
}
