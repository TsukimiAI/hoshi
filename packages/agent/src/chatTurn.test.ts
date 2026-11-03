import { describe, expect, it, vi } from "vitest";
import { runSessionChat } from "./chatTurn";
import { AgentRuntime } from "./runtime";
import { EMOTIONS, type AgentEvent, type Emotion } from "@hoshi/shared";
import type { PersonaConfig } from "./persona";

function persona(): PersonaConfig {
  const sprites = Object.fromEntries(EMOTIONS.map((emotion) => [emotion, `/tmp/${emotion}.png`])) as Record<
    Emotion,
    string
  >;
  return {
    id: "t",
    name: "t",
    systemPrompt: "t",
    defaultEmotion: "normal",
    thinkingEmotion: "expect",
    emotions: [...EMOTIONS],
    sprites
  };
}

class SilentLlm {
  async completeChat() {
    throw new Error("no complete");
  }
  async *streamChat() {
    return;
  }
}

function repoStub(deleted: string[]) {
  return {
    appendMessage: vi.fn(async () => "user-1"),
    titleFromFirstUserMessage: vi.fn(async () => undefined),
    deleteMessage: vi.fn(async (id: string) => {
      deleted.push(id);
    })
  };
}

describe("runSessionChat abort", () => {
  it("无助手则删用户消息", async () => {
    const deleted: string[] = [];
    const repo = repoStub(deleted);
    const ac = new AbortController();
    ac.abort();
    const runtime = new AgentRuntime({ persona: persona(), llm: new SilentLlm() as never });
    const events = [];
    for await (const event of runSessionChat({
      repo: repo as never,
      memoryRepo: {
        listUnacked: async () => [],
        listActive: async () => [],
        markAcked: async () => undefined,
        retrieveForInject: async () => []
      } as never,
      runtime,
      llm: new SilentLlm() as never,
      chatSettings: {
        contextBudget: 8000,
        compactTriggerToken: 6000,
        compactTriggerMsgCount: 80,
        compactKeepRecent: 24,
        referenceSites: "",
        memoryAutoWrite: false,
        deepseekApiKey: ""
      },
      sessionId: "s",
      message: "hi",
      history: [],
      signal: ac.signal
    })) {
      events.push(event);
    }
    expect(deleted).toEqual(["user-1"]);
    expect(repo.deleteMessage).toHaveBeenCalledTimes(1);
  });

  it("有助手文本不删", async () => {
    const deleted: string[] = [];
    const repo = repoStub(deleted);
    const ac = new AbortController();
    const runtime = {
      async *chat() {
        yield { event: "sentence" as const, data: { text: "答。", emotion: "normal" as const, index: 0 } };
        ac.abort();
      }
    };
    for await (const _event of runSessionChat({
      repo: repo as never,
      memoryRepo: {
        listUnacked: async () => [],
        listActive: async () => [],
        markAcked: async () => undefined,
        retrieveForInject: async () => []
      } as never,
      runtime: runtime as never,
      llm: new SilentLlm() as never,
      chatSettings: {
        contextBudget: 8000,
        compactTriggerToken: 6000,
        compactTriggerMsgCount: 80,
        compactKeepRecent: 24,
        referenceSites: "",
        memoryAutoWrite: false,
        deepseekApiKey: ""
      },
      sessionId: "s",
      message: "hi",
      history: [],
      signal: ac.signal
    })) {
      // drain
    }
    expect(deleted).toEqual([]);
  });

  it("校验失败时带上 validationError", async () => {
    const events: AgentEvent[] = [];
    const runtime = {
      async *chat() {
        yield { event: "sentence" as const, data: { text: "没画成。", emotion: "normal" as const, index: 0 } };
        yield { event: "done" as const, data: { ok: true as const } };
      }
    };
    for await (const event of runSessionChat({
      repo: repoStub([]) as never,
      memoryRepo: {
        listUnacked: async () => [],
        listActive: async () => [],
        markAcked: async () => undefined,
        retrieveForInject: async () => []
      } as never,
      runtime: runtime as never,
      llm: new SilentLlm() as never,
      chatSettings: {
        contextBudget: 8000,
        compactTriggerToken: 6000,
        compactTriggerMsgCount: 80,
        compactKeepRecent: 24,
        referenceSites: "",
        memoryAutoWrite: false,
        deepseekApiKey: ""
      },
      sessionId: "s",
      message: "hi",
      history: [],
      workspace: "desk",
      commitCanvas: () => ({ items: [], validationError: "「气温」labels 为空" })
    })) {
      events.push(event);
    }
    const canvas = events.find((item) => item.event === "canvas");
    expect(canvas?.data?.validationError).toBe("「气温」labels 为空");
    expect(canvas?.data?.items).toEqual([]);
  });

  it("done 前发出 canvas 快照", async () => {
    const events: AgentEvent[] = [];
    const runtime = {
      async *chat() {
        yield { event: "sentence" as const, data: { text: "好。", emotion: "normal" as const, index: 0 } };
        yield { event: "done" as const, data: { ok: true as const } };
      }
    };
    for await (const event of runSessionChat({
      repo: repoStub([]) as never,
      memoryRepo: {
        listUnacked: async () => [],
        listActive: async () => [],
        markAcked: async () => undefined,
        retrieveForInject: async () => []
      } as never,
      runtime: runtime as never,
      llm: new SilentLlm() as never,
      chatSettings: {
        contextBudget: 8000,
        compactTriggerToken: 6000,
        compactTriggerMsgCount: 80,
        compactKeepRecent: 24,
        referenceSites: "",
        memoryAutoWrite: false,
        deepseekApiKey: ""
      },
      sessionId: "s",
      message: "hi",
      history: [],
      workspace: "desk",
      commitCanvas: () => ({ items: [] })
    })) {
      events.push(event);
    }
    const names = events.map((item) => item.event);
    expect(names[0]).toBe("turn");
    expect(names.indexOf("canvas")).toBeGreaterThan(-1);
    expect(names.indexOf("canvas")).toBeLessThan(names.indexOf("done"));
  });
});

function settings(memoryAutoWrite: boolean) {
  return {
    contextBudget: 8000,
    compactTriggerToken: 6000,
    compactTriggerMsgCount: 80,
    compactKeepRecent: 24,
    referenceSites: "",
    memoryAutoWrite,
    deepseekApiKey: ""
  };
}

describe("runSessionChat memory", () => {
  it("先写入名字再注入同一轮", async () => {
    const order: string[] = [];
    const stored: Array<{ id: string; text: string }> = [];
    let injected: Array<string | { text: string }> = [];
    const runtime = {
      async *chat(_body: unknown, extra: { longTermMemories?: Array<string | { text: string }> }) {
        injected = extra.longTermMemories ?? [];
        yield { event: "sentence" as const, data: { text: "好的韩老师。", emotion: "normal" as const, index: 0 } };
        yield { event: "done" as const, data: { ok: true as const } };
      }
    };
    const events: AgentEvent[] = [];
    for await (const event of runSessionChat({
      repo: repoStub([]) as never,
      memoryRepo: {
        listUnacked: async () => stored,
        listActive: async () => stored,
        markAcked: async () => undefined,
        retrieveForInject: async () => {
          order.push("retrieve");
          return stored;
        },
        neighborsForExtract: async () => [],
        similarForTexts: async () => new Map(),
        insert: async (text: string) => {
          order.push("insert");
          stored.push({ id: "n1", text });
        },
        updateText: async () => undefined,
        supersede: async () => undefined
      } as never,
      runtime: runtime as never,
      llm: {
        completeChat: async () => ({
          content:
            '{"ops":[{"action":"upsert","kind":"identity","topic":"name","text":"老师希望被叫做韩"}]}'
        })
      } as never,
      chatSettings: settings(true),
      sessionId: "s",
      message: "我叫韩",
      history: []
    })) {
      events.push(event);
    }
    expect(order).toEqual(["insert", "retrieve"]);
    expect(
      injected
        .map((item) => (typeof item === "string" ? item : item.text))
        .join("")
    ).toContain("韩");
    const phases = events
      .filter((item) => item.event === "progress")
      .map((item) => `${item.data?.phase}:${item.data?.name}`);
    expect(phases[0]).toBe("tool_start:记忆");
    expect(phases[1]).toBe("tool_done:记忆");
    expect(events.findIndex((item) => item.event === "progress")).toBeLessThan(
      events.findIndex((item) => item.event === "sentence")
    );
  });

  it("好的韩老师只确认名字", async () => {
    const markAcked = vi.fn(async () => undefined);
    const runtime = {
      async *chat() {
        yield { event: "sentence" as const, data: { text: "好的韩老师。", emotion: "normal" as const, index: 0 } };
        yield { event: "done" as const, data: { ok: true as const } };
      }
    };
    for await (const _event of runSessionChat({
      repo: repoStub([]) as never,
      memoryRepo: {
        listUnacked: async () => [
          { id: "name", text: "老师希望被叫做韩" },
          { id: "tea", text: "老师平时喜欢喝红茶" }
        ],
        listActive: async () => [],
        markAcked,
        retrieveForInject: async () => []
      } as never,
      runtime: runtime as never,
      llm: new SilentLlm() as never,
      chatSettings: settings(false),
      sessionId: "s",
      message: "你好",
      history: []
    })) {
      // drain
    }
    expect(markAcked).toHaveBeenCalledWith(["name"]);
  });

  it("只回好的不确认", async () => {
    const markAcked = vi.fn(async () => undefined);
    const runtime = {
      async *chat() {
        yield { event: "sentence" as const, data: { text: "好的。", emotion: "normal" as const, index: 0 } };
        yield { event: "done" as const, data: { ok: true as const } };
      }
    };
    for await (const _event of runSessionChat({
      repo: repoStub([]) as never,
      memoryRepo: {
        listUnacked: async () => [
          { id: "name", text: "老师希望被叫做韩" },
          { id: "tea", text: "老师平时喜欢喝红茶" }
        ],
        listActive: async () => [],
        markAcked,
        retrieveForInject: async () => []
      } as never,
      runtime: runtime as never,
      llm: new SilentLlm() as never,
      chatSettings: settings(false),
      sessionId: "s",
      message: "你好",
      history: []
    })) {
      // drain
    }
    expect(markAcked).not.toHaveBeenCalled();
  });
});
