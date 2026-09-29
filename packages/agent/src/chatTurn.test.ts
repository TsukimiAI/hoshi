import { describe, expect, it, vi } from "vitest";
import { runSessionChat } from "./chatTurn";
import { AgentRuntime } from "./runtime";
import { EMOTIONS, type Emotion } from "@hoshi/shared";
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
        markAcked: async () => undefined
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
        markAcked: async () => undefined
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

  it("done 前发出 canvas 快照", async () => {
    const events: Array<{ event: string }> = [];
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
        markAcked: async () => undefined
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
