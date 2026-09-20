"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const settings_1 = require("./settings");
(0, vitest_1.describe)("resolveHoshiSettings", () => {
    (0, vitest_1.it)("无存储时使用代码默认值", () => {
        (0, vitest_1.expect)((0, settings_1.resolveHoshiSettings)(null)).toEqual(settings_1.DEFAULT_HOSHI_SETTINGS);
    });
    (0, vitest_1.it)("settings.json 优先于 env，env 优先于默认值", () => {
        const resolved = (0, settings_1.resolveHoshiSettings)({
            model: { apiKey: "from-file", model: "qwen-file" },
            chat: { contextBudget: 5000 }
        }, {
            apiKey: "from-env",
            baseUrl: "https://env.example/v1",
            model: "env-model"
        });
        (0, vitest_1.expect)(resolved.model.apiKey).toBe("from-file");
        (0, vitest_1.expect)(resolved.model.model).toBe("qwen-file");
        (0, vitest_1.expect)(resolved.model.baseUrl).toBe("https://env.example/v1");
        (0, vitest_1.expect)(resolved.chat.contextBudget).toBe(5000);
        (0, vitest_1.expect)(resolved.chat.compactKeepRecent).toBe(24);
        (0, vitest_1.expect)(resolved.chat.referenceSites).toBe("");
        (0, vitest_1.expect)(resolved.chat.memoryAutoWrite).toBe(true);
        (0, vitest_1.expect)(resolved.plugins.enabled).toEqual([]);
        (0, vitest_1.expect)(resolved.plugins.configs.web_search).toBeUndefined();
    });
    (0, vitest_1.it)("非法数字回退默认值", () => {
        const resolved = (0, settings_1.resolveHoshiSettings)({
            presentation: { typeCharMs: 0, fadeDelayMs: "bad" }
        });
        (0, vitest_1.expect)(resolved.presentation.typeCharMs).toBe(settings_1.DEFAULT_HOSHI_SETTINGS.presentation.typeCharMs);
        (0, vitest_1.expect)(resolved.presentation.fadeDelayMs).toBe(settings_1.DEFAULT_HOSHI_SETTINGS.presentation.fadeDelayMs);
    });
    (0, vitest_1.it)("保存时忽略人设字段并校验数字", () => {
        (0, vitest_1.expect)((0, settings_1.resolveHoshiSettings)({ persona: { systemPrompt: "自定义人设" }, chat: { contextBudget: 0 } }, {})).toMatchObject({
            chat: { contextBudget: settings_1.DEFAULT_HOSHI_SETTINGS.chat.contextBudget }
        });
        (0, vitest_1.expect)((0, settings_1.resolveHoshiSettings)({ persona: { systemPrompt: "自定义人设" } })).not.toHaveProperty("persona");
    });
    (0, vitest_1.it)("插件启用与参考站点独立，丢弃旧 web_search 配置", () => {
        const resolved = (0, settings_1.resolveHoshiSettings)({
            chat: { referenceSites: "https://a.com\nhttps://b.com" },
            plugins: {
                enabled: ["echo_tool", "echo_tool", ""],
                configs: { web_search: { apiKey: "x" }, echo_tool: { token: "t" } }
            }
        });
        (0, vitest_1.expect)(resolved.plugins.enabled).toEqual(["echo_tool"]);
        (0, vitest_1.expect)(resolved.plugins.configs.web_search).toBeUndefined();
        (0, vitest_1.expect)(resolved.plugins.configs.echo_tool).toEqual({ token: "t" });
        (0, vitest_1.expect)(resolved.chat.referenceSites).toBe("https://a.com\nhttps://b.com");
        (0, vitest_1.expect)(resolved.chat.memoryAutoWrite).toBe(true);
    });
    (0, vitest_1.it)("解析语音后端与热词", () => {
        (0, vitest_1.expect)((0, settings_1.resolveHoshiSettings)(null).voice.hotwords).toBe("星奈,老师");
        (0, vitest_1.expect)((0, settings_1.resolveHoshiSettings)({ voice: { ttsBackend: "gpt-sovits" } }).voice.ttsBackend).toBe("gpt-sovits");
        (0, vitest_1.expect)((0, settings_1.resolveHoshiSettings)({ voice: { ttsBackend: "bad" } }).voice.ttsBackend).toBe("dashscope");
        (0, vitest_1.expect)((0, settings_1.resolveHoshiSettings)({ voice: { hotwordVocabularyId: " vocab-1 " } }).voice.hotwordVocabularyId).toBe("vocab-1");
        (0, vitest_1.expect)((0, settings_1.resolveHoshiSettings)(null).voice.ttsModel).toBe("cosyvoice-v2");
        (0, vitest_1.expect)((0, settings_1.resolveHoshiSettings)(null).voice.ttsVoice).toBe("longxiaochun_v2");
        (0, vitest_1.expect)((0, settings_1.resolveHoshiSettings)(null).voice.ttsEnabled).toBe(true);
        (0, vitest_1.expect)((0, settings_1.resolveHoshiSettings)({ voice: { ttsEnabled: false } }).voice.ttsEnabled).toBe(false);
        (0, vitest_1.expect)((0, settings_1.resolveHoshiSettings)({ voice: { ttsEnabled: "false" } }).voice.ttsEnabled).toBe(false);
        (0, vitest_1.expect)((0, settings_1.resolveHoshiSettings)({
            voice: { ttsModel: "cosyvoice-v3-flash", ttsVoice: "longxiaochun" }
        }).voice).toMatchObject({ ttsModel: "cosyvoice-v2", ttsVoice: "longxiaochun_v2" });
        (0, vitest_1.expect)((0, settings_1.resolveHoshiSettings)({
            voice: { ttsModel: "longxiaochun_v3", ttsVoice: "" }
        }).voice).toMatchObject({ ttsModel: "cosyvoice-v2", ttsVoice: "longxiaochun_v2" });
    });
    (0, vitest_1.it)("可关闭记忆自动写入", () => {
        (0, vitest_1.expect)((0, settings_1.resolveHoshiSettings)({ chat: { memoryAutoWrite: false } }).chat.memoryAutoWrite).toBe(false);
    });
});
