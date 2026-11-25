import { type Emotion } from "@hoshi/shared";
import { describe, expect, it, vi } from "vitest";
import { parsePetGlance, runPetGlance } from "./glance";
import type { LlmMessage } from "../llm/openai";
import { PetScreenSlot } from "./slot";

const HASH = "a".repeat(16);

function slotWithFrame(now = 10_000): PetScreenSlot {
  const slot = new PetScreenSlot();
  slot.put({ sessionId: "s", mime: "image/jpeg", data: "YQ==", hash: HASH, now });
  return slot;
}

function messagesHaveImage(messages: LlmMessage[]): boolean {
  return messages.some((message) => {
    if (!Array.isArray(message.content)) {
      return false;
    }
    return message.content.some((part) => part.type === "image_url");
  });
}

describe("parsePetGlance", () => {
  it("围栏、沉默和坏 JSON 都不说", () => {
    expect(parsePetGlance("```json\n{\"speak\":false}\n```").speak).toBe(false);
    expect(parsePetGlance("不是 json").speak).toBe(false);
    expect(parsePetGlance("{\"speak\":true,\"text\":\"  \",\"emotion\":\"happy\"}").speak).toBe(false);
  });

  it("非法情绪当成 normal", () => {
    expect(parsePetGlance("{\"speak\":true,\"text\":\"在看书呀\",\"emotion\":\"nope\"}")).toEqual({
      speak: true,
      text: "在看书呀",
      emotion: "normal"
    });
  });
});

describe("runPetGlance", () => {
  it("desk 和关开关不调用模型", async () => {
    const completeChat = vi.fn(async () => ({ content: "{\"speak\":true,\"text\":\"嗨\",\"emotion\":\"happy\"}" }));
    const appendMessage = vi.fn(async () => "id");
    const desk = await runPetGlance({
      sessionId: "s",
      sessionKind: "desk",
      enabled: true,
      stillEnabled: () => true,
      personaPrompt: "人设",
      now: 10_000,
      slot: slotWithFrame(),
      completeChat,
      appendMessage
    });
    expect(desk[0]).toMatchObject({ event: "error" });
    const off = await runPetGlance({
      sessionId: "s",
      sessionKind: "chat",
      enabled: false,
      stillEnabled: () => false,
      personaPrompt: "人设",
      now: 10_000,
      slot: slotWithFrame(),
      completeChat,
      appendMessage
    });
    expect(off[0]).toMatchObject({ event: "error" });
    expect(completeChat).not.toHaveBeenCalled();
    expect(appendMessage).not.toHaveBeenCalled();
  });

  it("沉默不写消息，也不挡住下一次", async () => {
    const slot = slotWithFrame();
    const completeChat = vi.fn(async () => ({ content: "{\"speak\":false}" }));
    const appendMessage = vi.fn(async () => "id");
    const first = await runPetGlance({
      sessionId: "s",
      sessionKind: "chat",
      enabled: true,
      stillEnabled: () => true,
      personaPrompt: "人设",
      now: 10_000,
      slot,
      completeChat,
      appendMessage
    });
    expect(first.map((event) => event.event)).toEqual(["done"]);
    expect(appendMessage).not.toHaveBeenCalled();
    expect(slot.commented()).toEqual({ hash: "", at: 0 });
    await runPetGlance({
      sessionId: "s",
      sessionKind: "chat",
      enabled: true,
      stillEnabled: () => true,
      personaPrompt: "人设",
      now: 11_000,
      slot,
      completeChat,
      appendMessage
    });
    expect(completeChat).toHaveBeenCalledTimes(2);
  });

  it("说话只追加带情绪的助手消息，并把图片交给模型", async () => {
    const slot = slotWithFrame();
    let seen = false;
    const appendMessage = vi.fn(async () => "id");
    const events = await runPetGlance({
      sessionId: "s",
      sessionKind: "chat",
      enabled: true,
      stillEnabled: () => true,
      personaPrompt: "人设",
      now: 10_000,
      slot,
      completeChat: async (messages) => {
        seen = messagesHaveImage(messages);
        expect(messages[0]?.content).toContain("人设");
        return { content: "{\"speak\":true,\"text\":\"在看书呀。要休息吗？\",\"emotion\":\"happy\"}" };
      },
      appendMessage
    });
    expect(seen).toBe(true);
    expect(events.filter((event) => event.event === "sentence")).toHaveLength(2);
    expect(appendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "s",
        role: "assistant",
        content: "在看书呀。要休息吗？",
        emotion: "happy" satisfies Emotion
      })
    );
    expect(slot.openInterval()?.sessionId).toBe("s");
    expect(slot.openInterval()?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(slot.commented()).toEqual({ hash: HASH, at: 10_000 });
  });

  it("进行中的第二次不调用模型", async () => {
    const slot = slotWithFrame();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    const run = () =>
      runPetGlance({
        sessionId: "s",
        sessionKind: "chat",
        enabled: true,
        stillEnabled: () => true,
        personaPrompt: "人设",
        now: 10_000,
        slot,
        completeChat: async () => {
          calls += 1;
          await gate;
          return { content: "{\"speak\":false}" };
        },
        appendMessage: async () => "id"
      });
    const first = run();
    const second = await run();
    expect(second.map((event) => event.event)).toEqual(["done"]);
    expect(calls).toBe(1);
    release();
    await first;
  });

  it("模型返回前关掉开关则不落库", async () => {
    const slot = slotWithFrame();
    let enabled = true;
    const appendMessage = vi.fn(async () => "id");
    const events = await runPetGlance({
      sessionId: "s",
      sessionKind: "chat",
      enabled: true,
      stillEnabled: () => enabled,
      personaPrompt: "人设",
      now: 10_000,
      slot,
      completeChat: async () => {
        enabled = false;
        return { content: "{\"speak\":true,\"text\":\"在看书呀\",\"emotion\":\"happy\"}" };
      },
      appendMessage
    });
    expect(events.map((event) => event.event)).toEqual(["done"]);
    expect(appendMessage).not.toHaveBeenCalled();
    expect(slot.commented().hash).toBe("");
  });

  it("冷却内第二次不调用模型", async () => {
    const slot = slotWithFrame();
    const completeChat = vi.fn(async () => ({
      content: "{\"speak\":true,\"text\":\"在看书呀\",\"emotion\":\"happy\"}"
    }));
    await runPetGlance({
      sessionId: "s",
      sessionKind: "chat",
      enabled: true,
      stillEnabled: () => true,
      personaPrompt: "人设",
      now: 10_000,
      slot,
      completeChat,
      appendMessage: async () => "id"
    });
    const again = await runPetGlance({
      sessionId: "s",
      sessionKind: "chat",
      enabled: true,
      stillEnabled: () => true,
      personaPrompt: "人设",
      now: 11_000,
      slot,
      completeChat,
      appendMessage: async () => "id"
    });
    expect(again.map((event) => event.event)).toEqual(["done"]);
    expect(completeChat).toHaveBeenCalledTimes(1);
  });
});
