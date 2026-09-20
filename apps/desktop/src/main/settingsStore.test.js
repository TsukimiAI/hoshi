"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = require("node:fs");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const vitest_1 = require("vitest");
const shared_1 = require("@hoshi/shared");
const settingsStore_1 = require("./settingsStore");
const xorCrypto = {
    available: () => true,
    encrypt: (plain) => Buffer.from(plain, "utf8").toString("base64"),
    decrypt: (payload) => Buffer.from(payload, "base64").toString("utf8")
};
(0, vitest_1.describe)("settingsStore", () => {
    (0, vitest_1.it)("保存后读取经过校验合并，且不保存人设", () => {
        const dir = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)((0, node_os_1.tmpdir)(), "hoshi-settings-"));
        try {
            const persisted = (0, shared_1.resolveHoshiSettings)({
                model: { apiKey: "k" },
                chat: { contextBudget: 0 },
                persona: { systemPrompt: "文件人设" }
            }, { baseUrl: "https://env.example/v1" });
            (0, settingsStore_1.saveHoshiSettings)(dir, persisted, xorCrypto);
            const loaded = (0, settingsStore_1.loadHoshiSettings)(dir, { baseUrl: "https://env.example/v1" }, xorCrypto);
            (0, vitest_1.expect)(loaded.model.apiKey).toBe("k");
            (0, vitest_1.expect)(loaded.model.baseUrl).toBe("https://env.example/v1");
            (0, vitest_1.expect)(loaded.chat.contextBudget).toBe(8000);
            (0, vitest_1.expect)(loaded).not.toHaveProperty("persona");
        }
        finally {
            (0, node_fs_1.rmSync)(dir, { recursive: true, force: true });
        }
    });
    (0, vitest_1.it)("磁盘无明文 apiKey", () => {
        const dir = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)((0, node_os_1.tmpdir)(), "hoshi-settings-"));
        try {
            const persisted = (0, shared_1.resolveHoshiSettings)({ model: { apiKey: "secret-key-xyz" } }, {});
            (0, settingsStore_1.saveHoshiSettings)(dir, persisted, xorCrypto);
            const raw = (0, node_fs_1.readFileSync)((0, settingsStore_1.settingsFilePath)(dir), "utf8");
            (0, vitest_1.expect)(raw).not.toContain("secret-key-xyz");
            (0, vitest_1.expect)(JSON.parse(raw).enc).toBe("safeStorage");
        }
        finally {
            (0, node_fs_1.rmSync)(dir, { recursive: true, force: true });
        }
    });
});
