import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveHoshiSettings } from "@hoshi/shared";
import { loadHoshiSettings, saveHoshiSettings, settingsFilePath } from "./settingsStore";

const xorCrypto = {
  available: () => true,
  encrypt: (plain: string) => Buffer.from(plain, "utf8").toString("base64"),
  decrypt: (payload: string) => Buffer.from(payload, "base64").toString("utf8")
};

describe("settingsStore", () => {
  it("保存后读取经过校验合并，且不保存人设", () => {
    const dir = mkdtempSync(join(tmpdir(), "hoshi-settings-"));
    try {
      const persisted = resolveHoshiSettings(
        {
          model: { apiKey: "k" },
          chat: { contextBudget: 0 },
          persona: { systemPrompt: "文件人设" }
        },
        { baseUrl: "https://env.example/v1" }
      );
      saveHoshiSettings(dir, persisted, xorCrypto);
      const loaded = loadHoshiSettings(dir, { baseUrl: "https://env.example/v1" }, xorCrypto);
      expect(loaded.model.apiKey).toBe("k");
      expect(loaded.model.baseUrl).toBe("https://env.example/v1");
      expect(loaded.chat.contextBudget).toBe(8000);
      expect(loaded).not.toHaveProperty("persona");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("磁盘无明文 apiKey", () => {
    const dir = mkdtempSync(join(tmpdir(), "hoshi-settings-"));
    try {
      const persisted = resolveHoshiSettings({ model: { apiKey: "secret-key-xyz" } }, {});
      saveHoshiSettings(dir, persisted, xorCrypto);
      const raw = readFileSync(settingsFilePath(dir), "utf8");
      expect(raw).not.toContain("secret-key-xyz");
      expect(JSON.parse(raw).enc).toBe("safeStorage");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("加密不可用则不写盘", () => {
    const dir = mkdtempSync(join(tmpdir(), "hoshi-settings-"));
    try {
      const path = settingsFilePath(dir);
      writeFileSync(path, '{"keep":true}\n');
      const before = readFileSync(path, "utf8");
      const persisted = resolveHoshiSettings({ model: { apiKey: "secret-key-xyz" } }, {});
      expect(() =>
        saveHoshiSettings(dir, persisted, {
          available: () => false,
          encrypt: () => "",
          decrypt: () => "{}"
        })
      ).toThrow("safeStorage unavailable");
      expect(readFileSync(path, "utf8")).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
