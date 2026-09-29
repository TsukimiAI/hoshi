import { describe, expect, it } from "vitest";
import { DEFAULT_HOSHI_SETTINGS, resolveHoshiSettings } from "./settings";

describe("resolveHoshiSettings", () => {
  it("无存储时使用代码默认值", () => {
    expect(resolveHoshiSettings(null)).toEqual(DEFAULT_HOSHI_SETTINGS);
  });

  it("settings.json 优先于 env，env 优先于默认值", () => {
    const resolved = resolveHoshiSettings(
      {
        model: { apiKey: "from-file", model: "qwen-file" },
        chat: { contextBudget: 5000 }
      },
      {
        apiKey: "from-env",
        baseUrl: "https://env.example/v1",
        model: "env-model"
      }
    );
    expect(resolved.model.apiKey).toBe("from-file");
    expect(resolved.model.model).toBe("qwen-file");
    expect(resolved.model.baseUrl).toBe("https://env.example/v1");
    expect(resolved.chat.contextBudget).toBe(5000);
    expect(resolved.chat.compactKeepRecent).toBe(24);
    expect(resolved.chat.referenceSites).toBe("");
    expect(resolved.chat.memoryAutoWrite).toBe(true);
    expect(resolved.chat.deepseekApiKey).toBe("");
    expect(resolved.plugins.enabled).toEqual([]);
    expect(resolved.plugins.configs.web_search).toBeUndefined();
  });

  it("非法数字回退默认值", () => {
    const resolved = resolveHoshiSettings({
      presentation: { typeCharMs: 0, fadeDelayMs: "bad" }
    });
    expect(resolved.presentation.typeCharMs).toBe(
      DEFAULT_HOSHI_SETTINGS.presentation.typeCharMs
    );
    expect(resolved.presentation.fadeDelayMs).toBe(
      DEFAULT_HOSHI_SETTINGS.presentation.fadeDelayMs
    );
  });

  it("保存时忽略人设字段并校验数字", () => {
    expect(
      resolveHoshiSettings(
        { persona: { systemPrompt: "自定义人设" }, chat: { contextBudget: 0 } },
        {}
      )
    ).toMatchObject({
      chat: { contextBudget: DEFAULT_HOSHI_SETTINGS.chat.contextBudget }
    });
    expect(
      resolveHoshiSettings({ persona: { systemPrompt: "自定义人设" } })
    ).not.toHaveProperty("persona");
  });

  it("插件启用与参考站点独立，丢弃旧 web_search 配置", () => {
    const resolved = resolveHoshiSettings({
      chat: { referenceSites: "https://a.com\nhttps://b.com" },
      plugins: {
        enabled: ["echo_tool", "echo_tool", ""],
        configs: { web_search: { apiKey: "x" }, echo_tool: { token: "t" } }
      }
    });
    expect(resolved.plugins.enabled).toEqual(["echo_tool"]);
    expect(resolved.plugins.configs.web_search).toBeUndefined();
    expect(resolved.plugins.configs.echo_tool).toEqual({ token: "t" });
    expect(resolved.chat.referenceSites).toBe("https://a.com\nhttps://b.com");
    expect(resolved.chat.memoryAutoWrite).toBe(true);
  });

  it("解析语音后端与热词", () => {
    expect(resolveHoshiSettings(null).voice.hotwords).toBe("星奈,老师");
    expect(resolveHoshiSettings({ voice: { ttsBackend: "gpt-sovits" } }).voice.ttsBackend).toBe(
      "gpt-sovits"
    );
    expect(resolveHoshiSettings({ voice: { ttsBackend: "bad" } }).voice.ttsBackend).toBe("dashscope");
    expect(
      resolveHoshiSettings({ voice: { hotwordVocabularyId: " vocab-1 " } }).voice.hotwordVocabularyId
    ).toBe("vocab-1");
    expect(resolveHoshiSettings(null).voice.ttsModel).toBe("cosyvoice-v2");
    expect(resolveHoshiSettings(null).voice.ttsVoice).toBe("longxiaochun_v2");
    expect(resolveHoshiSettings(null).voice.ttsEnabled).toBe(true);
    expect(resolveHoshiSettings({ voice: { ttsEnabled: false } }).voice.ttsEnabled).toBe(false);
    expect(resolveHoshiSettings({ voice: { ttsEnabled: "false" } }).voice.ttsEnabled).toBe(false);
    expect(
      resolveHoshiSettings({
        voice: { ttsModel: "cosyvoice-v3-flash", ttsVoice: "longxiaochun" }
      }).voice
    ).toMatchObject({ ttsModel: "cosyvoice-v2", ttsVoice: "longxiaochun_v2" });
    expect(
      resolveHoshiSettings({
        voice: { ttsModel: "longxiaochun_v3", ttsVoice: "" }
      }).voice
    ).toMatchObject({ ttsModel: "cosyvoice-v2", ttsVoice: "longxiaochun_v2" });
  });

  it("可关闭记忆自动写入", () => {
    expect(resolveHoshiSettings({ chat: { memoryAutoWrite: false } }).chat.memoryAutoWrite).toBe(
      false
    );
    expect(resolveHoshiSettings(null, { deepseekApiKey: "from-env" }).chat.deepseekApiKey).toBe(
      "from-env"
    );
  });
});
