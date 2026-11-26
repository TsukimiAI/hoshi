import type { AgentEvent, LlmUsage, SentenceEvent } from "@hoshi/shared";
import { isAbortTimeout, mergeTimeoutSignal, type LlmMessage } from "./llm/openai";
import { resolveSentenceEmotion } from "./emotion";
import type { PersonaConfig } from "./persona";
import { DESK_CRITIC_PROMPT, DESK_FORM_PROMPT, parseDeskCanvasChoice, parseDeskCritic, type DeskCanvasChoice } from "./retrieval/plan";
import { hasSpeechContent, SentenceSplitter } from "./sentence";
import type { LlmClient } from "./runtime";
import { looksLikeInternalCanvasTalk, withTimeout } from "./runtimeFormat";

export async function chooseDeskForm(
  llm: LlmClient,
  context: string,
  question: string,
  summary: string,
  sessionId?: string
): Promise<{ choice: DeskCanvasChoice; usage?: LlmUsage }> {
  const fallback: DeskCanvasChoice = { canvas: true, images: false, form: "note" };
  try {
    const result = await withTimeout(
      llm.completeChat(
        [
          { role: "system", content: DESK_FORM_PROMPT },
          { role: "user", content: `上下文：\n${context}\n要查的问题：${question}\n总结：${summary || "无"}` }
        ],
        [],
        { timeoutMs: 30000, enableSearch: false, purpose: "chat", sessionId }
      ),
      35000,
      "版式超时"
    );
    if (result.usage) {
      llm.noteUsage?.("chat", result.usage, sessionId);
    }
    const parsed = parseDeskCanvasChoice(result.content ?? "");
    if (!parsed) {
      return { choice: fallback, usage: result.usage };
    }
    if (parsed.form === "chart" && !/\d/.test(summary)) {
      return { choice: { ...parsed, form: "note" }, usage: result.usage };
    }
    return { choice: parsed, usage: result.usage };
  } catch {
    return { choice: fallback };
  }
}

export async function reviewCanvas(
  llm: LlmClient,
  input: {
    message: string;
    excerpt: string;
    cards: string;
    sessionId?: string;
  }
): Promise<{ fix: string | null; usage?: LlmUsage }> {
  try {
    const result = await withTimeout(
      llm.completeChat(
        [
          { role: "system", content: DESK_CRITIC_PROMPT },
          {
            role: "user",
            content: `问句：${input.message}\n摘录：${input.excerpt || "无"}\n卡片：${input.cards || "无"}`
          }
        ],
        [],
        { timeoutMs: 30000, enableSearch: false, purpose: "chat", sessionId: input.sessionId }
      ),
      35000,
      "评判超时"
    );
    if (result.usage) {
      llm.noteUsage?.("chat", result.usage, input.sessionId);
    }
    const verdict = parseDeskCritic(result.content ?? "");
    if (!verdict || verdict.pass) {
      return { fix: null, usage: result.usage };
    }
    return { fix: verdict.fix, usage: result.usage };
  } catch {
    return { fix: null };
  }
}

function toSentence(persona: PersonaConfig, sentence: string, index: number): SentenceEvent | null {
  const parsed = resolveSentenceEmotion(sentence, persona.defaultEmotion);
  if (!parsed.text || !hasSpeechContent(parsed.text) || looksLikeInternalCanvasTalk(parsed.text)) {
    return null;
  }
  return {
    event: "sentence",
    data: {
      text: parsed.text,
      emotion: parsed.emotion,
      index
    }
  };
}

export async function* streamSentences(
  llm: LlmClient,
  persona: PersonaConfig,
  messages: LlmMessage[],
  signal?: AbortSignal,
  onUsage?: (usage: LlmUsage) => void,
  sessionId?: string,
  enableSearch = true,
  timeoutMs = 90000
): AsyncGenerator<AgentEvent> {
  const splitter = new SentenceSplitter();
  let index = 0;
  try {
    for await (const part of llm.streamChat(messages, mergeTimeoutSignal(timeoutMs, signal), {
      purpose: "chat",
      sessionId,
      enableSearch
    })) {
      if (signal?.aborted) {
        return;
      }
      if (part.kind === "usage") {
        onUsage?.(part.usage);
        continue;
      }
      for (const sentence of splitter.push(part.text)) {
        const event = toSentence(persona, sentence, index);
        if (event) {
          index += 1;
          yield event;
        }
      }
    }
  } catch (error) {
    if (isAbortTimeout(error) || (error instanceof Error && /超时/.test(error.message))) {
      /* 口播超时交给外层用摘录补答 */
    } else {
      throw error;
    }
  }
  for (const sentence of splitter.flush()) {
    const event = toSentence(persona, sentence, index);
    if (event) {
      index += 1;
      yield event;
    }
  }
}

export async function* emitText(persona: PersonaConfig, text: string): AsyncGenerator<AgentEvent> {
  const splitter = new SentenceSplitter();
  let index = 0;
  for (const sentence of splitter.push(text)) {
    const event = toSentence(persona, sentence, index);
    if (event) {
      index += 1;
      yield event;
    }
  }
  for (const sentence of splitter.flush()) {
    const event = toSentence(persona, sentence, index);
    if (event) {
      index += 1;
      yield event;
    }
  }
}
