import { randomUUID } from "node:crypto";
import { isEmotion, PET_SCREEN, type AgentEvent, type Emotion } from "@hoshi/shared";
import { parseSentenceEmotion } from "../emotion";
import type { LlmMessage } from "../llm/openai";
import type { PetScreenSlot } from "./slot";

export type PetGlanceDecision = {
  speak: boolean;
  text: string;
  emotion: Emotion;
};

const SILENCE: PetGlanceDecision = { speak: false, text: "", emotion: "normal" };

const GLANCE_NOTE =
  "这是空闲时的一眼。多数时候保持沉默，输出 {\"speak\":false}。只有画面明显变了，而且值得关心或真的想问一句时，才输出 {\"speak\":true,\"text\":\"一两句口语\",\"emotion\":\"normal\"}。不要报菜名式描述整个桌面。不要复述密码、验证码、密钥、证件号、银行卡和私聊原文。";

export function parsePetGlance(raw: string): PetGlanceDecision {
  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return SILENCE;
  }
  if (!parsed || typeof parsed !== "object") {
    return SILENCE;
  }
  const record = parsed as { speak?: unknown; text?: unknown; emotion?: unknown };
  if (record.speak !== true) {
    return SILENCE;
  }
  const text = typeof record.text === "string" ? record.text.trim() : "";
  if (!text) {
    return SILENCE;
  }
  const emotion =
    typeof record.emotion === "string" && isEmotion(record.emotion) ? record.emotion : "normal";
  return { speak: true, text, emotion };
}

export function splitGlanceSentences(text: string): string[] {
  const parts = text
    .split(/(?<=[。！？])/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return parts.length > 0 ? parts : [text.trim()];
}

export async function runPetGlance(input: {
  sessionId: string;
  sessionKind: "chat" | "desk";
  enabled: boolean;
  stillEnabled: () => boolean;
  personaPrompt: string;
  now: number;
  signal?: AbortSignal;
  slot: PetScreenSlot;
  completeChat: (messages: LlmMessage[]) => Promise<{ content: string | null }>;
  appendMessage: (row: {
    sessionId: string;
    role: "assistant";
    content: string;
    emotion: Emotion;
    intervalId?: string;
  }) => Promise<unknown>;
}): Promise<AgentEvent[]> {
  const done: AgentEvent = { event: "done", data: { ok: true } };
  if (input.sessionKind !== "chat") {
    return [{ event: "error", data: { message: "只有桌宠会话可以看桌面" } }];
  }
  if (!input.enabled) {
    input.slot.clearPixels();
    return [{ event: "error", data: { message: "看着桌面没有打开" } }];
  }
  const frame = input.slot.read(input.sessionId, input.now);
  if (!frame) {
    return [{ event: "error", data: { message: "还没有画面" } }];
  }
  const commented = input.slot.commented();
  const neverSpoken = commented.at === 0 && commented.hash === "";
  if (
    !neverSpoken &&
    (commented.hash === frame.hash || input.now - commented.at < PET_SCREEN.cooldownMs)
  ) {
    return [done];
  }
  if (!input.slot.tryBegin()) {
    return [done];
  }
  try {
    const result = await input.completeChat([
      { role: "system", content: `${input.personaPrompt}\n\n${GLANCE_NOTE}` },
      {
        role: "user",
        content: [
          { type: "text", text: "星奈看了一眼老师的桌面。" },
          { type: "image_url", image_url: { url: `data:${frame.mime};base64,${frame.data}` } }
        ]
      }
    ]);
    if (
      input.signal?.aborted ||
      !input.stillEnabled() ||
      input.slot.read(input.sessionId, input.now)?.hash !== frame.hash
    ) {
      return [done];
    }
    const decision = parsePetGlance(result.content ?? "");
    if (!decision.speak) {
      return [done];
    }
    const spoken = parseSentenceEmotion(decision.text, decision.emotion).text;
    if (!spoken) {
      return [done];
    }
    const sentences = splitGlanceSentences(spoken);
    const events: AgentEvent[] = [
      { event: "emotion", data: { emotion: decision.emotion } },
      ...sentences.map(
        (text, index): AgentEvent => ({
          event: "sentence",
          data: { text, emotion: decision.emotion, index }
        })
      ),
      done
    ];
    const intervalId = input.stillEnabled() ? randomUUID() : undefined;
    await input.appendMessage({
      sessionId: input.sessionId,
      role: "assistant",
      content: spoken,
      emotion: decision.emotion,
      ...(intervalId ? { intervalId } : {})
    });
    if (intervalId && input.slot.read(input.sessionId, input.now)?.hash === frame.hash) {
      input.slot.markSpoken(frame.hash, input.now);
      input.slot.beginInterval(input.sessionId, intervalId, input.now);
    }
    return events;
  } finally {
    input.slot.end();
  }
}
