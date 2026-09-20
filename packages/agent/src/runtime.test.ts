import { describe, expect, it } from "vitest";
import { EMOTIONS, type ChatMessage, type Emotion } from "@hoshi/shared";
import { AgentRuntime } from "./runtime";
import type { PersonaConfig } from "./persona";

class FakeLlm {
  lastStreamMessages: unknown[] | null = null;
  constructor(
    private readonly chunks: string[],
    private readonly complete?: {
      content: string;
      toolCalls: Array<{ id: string; name: string; argumentsJson: string }>;
      usage?: { promptTokens: number; completionTokens: number; totalTokens: number; cachedTokens: number };
    },
    private readonly streamUsage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      cachedTokens: number;
    }
  ) {}
  async completeChat() {
    if (!this.complete) {
      throw new Error("completeChat should not be called");
    }
    return this.complete;
  }
  async *streamChat(messages: ChatMessage[]) {
    this.lastStreamMessages = messages;
    for (const chunk of this.chunks) {
      yield { kind: "delta" as const, text: chunk };
    }
    if (this.streamUsage) {
      yield { kind: "usage" as const, usage: this.streamUsage };
    }
  }
}

function createPersona(): PersonaConfig {
  const sprites = Object.fromEntries(
    EMOTIONS.map((emotion) => [emotion, `/tmp/${emotion}.png`])
  ) as Record<Emotion, string>;
  return {
    id: "test",
    name: "test",
    systemPrompt: "test",
    defaultEmotion: "normal",
    thinkingEmotion: "expect",
    emotions: [...EMOTIONS],
    sprites
  };
}

describe("AgentRuntime", () => {
  it("输出 thinking -> sentence -> done", async () => {
    const runtime = new AgentRuntime({
      persona: createPersona(),
      llm: new FakeLlm(["你好。⟦happy⟧"], undefined, {
        promptTokens: 12,
        completionTokens: 3,
        totalTokens: 15,
        cachedTokens: 0
      }) as never
    });

    const events = [];
    for await (const e of runtime.chat({ message: "hi", history: [] })) {
      events.push(e);
    }

    expect(events[0]).toEqual({ event: "emotion", data: { emotion: "expect" } });
    expect(events[1]).toEqual({
      event: "sentence",
      data: { text: "你好。", emotion: "happy", index: 0 }
    });
    expect(events[events.length - 1]).toEqual({
      event: "done",
      data: {
        ok: true,
        usage: { promptTokens: 12, completionTokens: 3, totalTokens: 15, cachedTokens: 0 }
      }
    });
  });

  it("空消息返回 error 事件", async () => {
    const runtime = new AgentRuntime({
      persona: createPersona(),
      llm: new FakeLlm(["ignored"]) as never
    });

    const events = [];
    for await (const e of runtime.chat({ message: "   ", history: [] })) {
      events.push(e);
    }

    expect(events).toEqual([{ event: "error", data: { message: "message is required" } }]);
  });

  it("无显式标记时进行句级情绪回退判定", async () => {
    const runtime = new AgentRuntime({
      persona: createPersona(),
      llm: new FakeLlm(["太好了，谢谢老师。"]) as never
    });

    const events = [];
    for await (const e of runtime.chat({ message: "hi", history: [] })) {
      events.push(e);
    }

    expect(events[1]).toEqual({
      event: "sentence",
      data: { text: "太好了，谢谢老师。", emotion: "happy", index: 0 }
    });
  });

  it("有 tool 时执行一轮再流式回复", async () => {
    const executed: string[] = [];
    const runtime = new AgentRuntime({
      persona: createPersona(),
      llm: new FakeLlm(["查到了。"], {
        content: "",
        toolCalls: [{ id: "call_1", name: "web_search", argumentsJson: "{\"query\":\"上海天气\"}" }]
      }) as never,
      plugins: {
        tools: () => [
          {
            type: "function",
            function: {
              name: "web_search",
              description: "search",
              parameters: { type: "object", properties: {} }
            }
          }
        ],
        execute: async (name, args) => {
          executed.push(`${name}:${String(args.query)}`);
          return "晴";
        }
      }
    });

    const events = [];
    for await (const e of runtime.chat({ message: "天气", history: [] })) {
      events.push(e);
    }

    expect(executed).toEqual(["web_search:上海天气"]);
    expect(events[1]).toEqual({
      event: "sentence",
      data: { text: "查到了。", emotion: "normal", index: 0 }
    });
  });

  it("插件超时不挂死", async () => {
    const runtime = new AgentRuntime({
      persona: createPersona(),
      pluginTimeoutMs: 20,
      llm: new FakeLlm(["超时了。"], {
        content: "",
        toolCalls: [{ id: "call_1", name: "slow", argumentsJson: "{}" }]
      }) as never,
      plugins: {
        tools: () => [
          {
            type: "function",
            function: {
              name: "slow",
              description: "slow",
              parameters: { type: "object", properties: {} }
            }
          }
        ],
        execute: async () => {
          await new Promise((resolve) => setTimeout(resolve, 200));
          return "late";
        }
      }
    });
    const events = [];
    for await (const e of runtime.chat({ message: "hi", history: [] })) {
      events.push(e);
    }
    expect(events.some((item) => item.event === "sentence")).toBe(true);
    expect(events.at(-1)).toEqual({ event: "done", data: { ok: true } });
  });

  it("无插件 tool 时不 completeChat，有参考站点则注入 system", async () => {
    const llm = new FakeLlm(["你好。"]);
    const runtime = new AgentRuntime({
      persona: createPersona(),
      llm: llm as never,
      referenceSites: "https://a.com"
    });
    const events = [];
    for await (const e of runtime.chat({ message: "hi", history: [] })) {
      events.push(e);
    }
    expect(events[1]).toMatchObject({ event: "sentence", data: { text: "你好。" } });
    const systems = (llm.lastStreamMessages as Array<{ role: string; content: string }>).filter(
      (item) => item.role === "system"
    );
    expect(systems[0]?.content).toBe("test");
    expect(systems[1]?.content).toContain("⟦emotion⟧");
    expect(systems[1]?.content).toContain("tool_call");
    expect(systems[1]?.content).toContain("～happy");
    expect(systems[2]?.content).toContain("https://a.com");
    expect(systems[2]?.content).toContain("先判断当前问题是否可能在这些站点上找到靠谱答案");
  });

  it("有长期记忆则注入 system，空表不插", async () => {
    const withMem = new FakeLlm(["你好。"]);
    const runtime = new AgentRuntime({
      persona: createPersona(),
      llm: withMem as never
    });
    for await (const _ of runtime.chat(
      { message: "hi", history: [] },
      { longTermMemories: ["老师喜欢红茶"] }
    )) {
      void _;
    }
    const systems = (withMem.lastStreamMessages as Array<{ role: string; content: string }>).filter(
      (item) => item.role === "system"
    );
    expect(systems.some((item) => item.content.includes("关于老师的长期记忆"))).toBe(true);
    expect(systems.some((item) => item.content.includes("老师喜欢红茶"))).toBe(true);

    const empty = new FakeLlm(["你好。"]);
    const emptyRuntime = new AgentRuntime({
      persona: createPersona(),
      llm: empty as never
    });
    for await (const _ of emptyRuntime.chat({ message: "hi", history: [] })) {
      void _;
    }
    const emptySystems = (empty.lastStreamMessages as Array<{ role: string; content: string }>).filter(
      (item) => item.role === "system"
    );
    expect(emptySystems.some((item) => item.content.includes("关于老师的长期记忆"))).toBe(false);
  });
});
