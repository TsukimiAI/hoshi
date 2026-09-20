import type {
  AgentEvent,
  ChatMessage,
  ChatRequestBody,
  LlmUsage,
  SentenceEvent,
  UsagePurpose
} from "@hoshi/shared";
import { addUsage } from "@hoshi/shared";
import { toLlmMessages, type LlmCallOptions, type LlmMessage, type StreamChatPart } from "./llm/openai";
import { resolveSentenceEmotion } from "./emotion";
import type { PersonaConfig } from "./persona";
import { parseToolArgs } from "./plugins/parseTool";
import type { LlmTool } from "./plugins/types";
import { buildMemoryAckPrompt, buildMemoryInjectPrompt } from "./memory/inject";
import { buildSearchSitesPrompt, parseSiteLines, SEARCH_USAGE_PROMPT } from "./searchPrompt";
import { hasSpeechContent, SentenceSplitter } from "./sentence";

export interface PluginHost {
  tools(): LlmTool[];
  execute(name: string, args: Record<string, unknown>): Promise<string>;
}

export interface LlmClient {
  completeChat(
    messages: LlmMessage[],
    tools: LlmTool[],
    options?: LlmCallOptions
  ): Promise<{
    content: string;
    toolCalls: Array<{ id: string; name: string; argumentsJson: string }>;
    usage?: LlmUsage;
  }>;
  noteUsage?(
    purpose: UsagePurpose,
    usage: LlmUsage,
    sessionId?: string,
    model?: string
  ): void;
  streamChat(
    messages: LlmMessage[],
    signal?: AbortSignal,
    options?: Pick<LlmCallOptions, "purpose" | "sessionId">
  ): AsyncGenerator<StreamChatPart>;
}

export interface AgentRuntimeConfig {
  persona: PersonaConfig;
  llm: LlmClient;
  plugins?: PluginHost;
  referenceSites?: string;
  pluginTimeoutMs?: number;
}

export class AgentRuntime {
  private referenceSites: string;

  constructor(private readonly config: AgentRuntimeConfig) {
    this.referenceSites = config.referenceSites ?? "";
  }

  private pluginTimeoutMs(): number {
    return this.config.pluginTimeoutMs ?? 15000;
  }

  setReferenceSites(referenceSites: string): void {
    this.referenceSites = referenceSites;
  }

  async *chat(
    body: ChatRequestBody,
    extra?: {
      longTermMemories?: string[];
      memoryAckTexts?: string[];
      signal?: AbortSignal;
      sessionId?: string;
    }
  ): AsyncGenerator<AgentEvent> {
    const message = body.message?.trim();
    if (!message) {
      yield { event: "error", data: { message: "message is required" } };
      return;
    }

    yield {
      event: "emotion",
      data: { emotion: this.config.persona.thinkingEmotion }
    };

    const promptMessages: ChatMessage[] = [
      { role: "system", content: this.config.persona.systemPrompt },
      { role: "system", content: SEARCH_USAGE_PROMPT }
    ];
    const sitePrompt = buildSearchSitesPrompt(parseSiteLines(this.referenceSites));
    if (sitePrompt) {
      promptMessages.push({ role: "system", content: sitePrompt });
    }
    const memoryPrompt = buildMemoryInjectPrompt(extra?.longTermMemories ?? []);
    if (memoryPrompt) {
      promptMessages.push({ role: "system", content: memoryPrompt });
    }
    const ackPrompt = buildMemoryAckPrompt(extra?.memoryAckTexts ?? []);
    if (ackPrompt) {
      promptMessages.push({ role: "system", content: ackPrompt });
    }
    promptMessages.push(...(body.history ?? []), { role: "user", content: message });
    const messages: LlmMessage[] = toLlmMessages(promptMessages);

    const sessionId = extra?.sessionId ?? body.sessionId;
    const tools = this.config.plugins?.tools() ?? [];
    let speakMessages = messages;
    let turnUsage: LlmUsage | undefined;
    if (tools.length > 0) {
      const complete = await this.config.llm.completeChat(messages, tools, {
        timeoutMs: 20000,
        sessionId
      });
      if (complete.usage) {
        this.config.llm.noteUsage?.(
          complete.toolCalls.length > 0 ? "tool" : "chat",
          complete.usage,
          sessionId
        );
      }
      turnUsage = addUsage(turnUsage, complete.usage);
      if (extra?.signal?.aborted) {
        return;
      }
      if (complete.toolCalls.length > 0) {
        const assistantToolCalls = complete.toolCalls.map((call) => ({
          id: call.id,
          type: "function" as const,
          function: { name: call.name, arguments: call.argumentsJson }
        }));
        speakMessages = [
          ...messages,
          { role: "assistant", content: complete.content || null, tool_calls: assistantToolCalls }
        ];
        for (const call of complete.toolCalls) {
          if (extra?.signal?.aborted) {
            return;
          }
          const result = await withTimeout(
            this.config.plugins!.execute(call.name, parseToolArgs(call.argumentsJson)),
            this.pluginTimeoutMs(),
            `tool ${call.name} timeout`
          ).catch((error) => (error instanceof Error ? error.message : "tool failed"));
          speakMessages.push({
            role: "tool",
            tool_call_id: call.id,
            content: result
          });
        }
      } else {
        yield* this.emitText(complete.content);
        yield doneEvent(turnUsage);
        return;
      }
    }

    try {
      yield* this.streamSentences(speakMessages, extra?.signal, (usage) => {
        turnUsage = addUsage(turnUsage, usage);
      }, sessionId);
      if (extra?.signal?.aborted) {
        return;
      }
      yield doneEvent(turnUsage);
    } catch (error) {
      if (extra?.signal?.aborted || (error instanceof Error && error.name === "AbortError")) {
        return;
      }
      throw error;
    }
  }

  private async *streamSentences(
    messages: LlmMessage[],
    signal?: AbortSignal,
    onUsage?: (usage: LlmUsage) => void,
    sessionId?: string
  ): AsyncGenerator<AgentEvent> {
    const splitter = new SentenceSplitter();
    let index = 0;
    for await (const part of this.config.llm.streamChat(messages, signal, {
      purpose: "chat",
      sessionId
    })) {
      if (signal?.aborted) {
        return;
      }
      if (part.kind === "usage") {
        onUsage?.(part.usage);
        continue;
      }
      for (const sentence of splitter.push(part.text)) {
        const event = this.toSentence(sentence, index);
        if (event) {
          index += 1;
          yield event;
        }
      }
    }
    for (const sentence of splitter.flush()) {
      const event = this.toSentence(sentence, index);
      if (event) {
        index += 1;
        yield event;
      }
    }
  }

  private async *emitText(text: string): AsyncGenerator<AgentEvent> {
    const splitter = new SentenceSplitter();
    let index = 0;
    for (const sentence of splitter.push(text)) {
      const event = this.toSentence(sentence, index);
      if (event) {
        index += 1;
        yield event;
      }
    }
    for (const sentence of splitter.flush()) {
      const event = this.toSentence(sentence, index);
      if (event) {
        index += 1;
        yield event;
      }
    }
  }

  private toSentence(sentence: string, index: number): SentenceEvent | null {
    const parsed = resolveSentenceEmotion(sentence, this.config.persona.defaultEmotion);
    if (!parsed.text || !hasSpeechContent(parsed.text)) {
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
}

function doneEvent(usage?: LlmUsage): AgentEvent {
  return usage
    ? { event: "done", data: { ok: true, usage } }
    : { event: "done", data: { ok: true } };
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(label)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
