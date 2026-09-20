import { parseUsage, type ChatMessage, type LlmUsage, type UsagePurpose } from "@hoshi/shared";
import type { LlmTool } from "../plugins/types";
import { parseCompleteChatResponse, type CompleteChatResult } from "../plugins/parseTool";

export interface OpenAiCompatConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface LlmMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

export function buildChatCompletionBody(
  model: string,
  messages: LlmMessage[],
  options: { stream: boolean; tools?: LlmTool[]; enableSearch?: boolean }
): Record<string, unknown> {
  const enableSearch = options.enableSearch !== false;
  const body: Record<string, unknown> = {
    model,
    stream: options.stream,
    messages
  };
  if (enableSearch) {
    body.enable_search = true;
    body.extra_body = { enable_search: true };
  }
  if (options.stream) {
    body.stream_options = { include_usage: true };
  }
  if (options.tools && options.tools.length > 0) {
    body.tools = options.tools;
    body.tool_choice = "auto";
  }
  return body;
}

export type StreamChatPart =
  | { kind: "delta"; text: string }
  | { kind: "usage"; usage: LlmUsage };

export type LlmCallOptions = {
  enableSearch?: boolean;
  timeoutMs?: number;
  purpose?: UsagePurpose;
  sessionId?: string;
  model?: string;
};

export type UsageRecorder = (input: {
  purpose: UsagePurpose;
  model: string;
  sessionId?: string;
  usage: LlmUsage;
}) => void;

export function toLlmMessages(messages: ChatMessage[]): LlmMessage[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content
  }));
}

function mergeTimeoutSignal(timeoutMs: number, signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!signal) {
    return timeout;
  }
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([timeout, signal]);
  }
  const merged = new AbortController();
  const onAbort = (): void => {
    merged.abort();
  };
  if (signal.aborted || timeout.aborted) {
    merged.abort();
    return merged.signal;
  }
  signal.addEventListener("abort", onAbort, { once: true });
  timeout.addEventListener("abort", onAbort, { once: true });
  return merged.signal;
}

export class OpenAiCompatClient {
  constructor(
    private config: OpenAiCompatConfig,
    private readonly recordUsage?: UsageRecorder
  ) {}

  updateConfig(config: OpenAiCompatConfig): void {
    this.config = config;
  }

  snapshot(): OpenAiCompatConfig {
    return { ...this.config };
  }

  noteUsage(purpose: UsagePurpose, usage: LlmUsage, sessionId?: string, model?: string): void {
    try {
      this.recordUsage?.({
        purpose,
        model: model ?? this.config.model,
        sessionId,
        usage
      });
    } catch {
      // ignore
    }
  }

  private capture(usage: LlmUsage | undefined, options?: LlmCallOptions, model?: string): void {
    if (!usage || !options?.purpose) {
      return;
    }
    this.noteUsage(options.purpose, usage, options.sessionId, model ?? options.model);
  }

  async completeChat(
    messages: LlmMessage[],
    tools: LlmTool[] = [],
    options?: LlmCallOptions
  ): Promise<CompleteChatResult> {
    const init: RequestInit = {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(
        buildChatCompletionBody(this.config.model, messages, {
          stream: false,
          tools,
          enableSearch: options?.enableSearch
        })
      )
    };
    if (options?.timeoutMs && options.timeoutMs > 0) {
      init.signal = AbortSignal.timeout(options.timeoutMs);
    }
    const response = await fetch(
      `${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`,
      init
    );
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`LLM request failed: ${response.status} ${text.slice(0, 200)}`);
    }
    const result = parseCompleteChatResponse((await response.json()) as unknown);
    this.capture(result.usage, options);
    return result;
  }

  async transcribeWav(
    audioWavBase64: string,
    options?: {
      timeoutMs?: number;
      signal?: AbortSignal;
      apiKey?: string;
      baseUrl?: string;
      sessionId?: string;
    }
  ): Promise<string> {
    const raw = audioWavBase64.trim().replace(/^data:audio\/wav;base64,/i, "");
    if (!raw) {
      return "";
    }
    const timeoutMs = options?.timeoutMs ?? 20000;
    const apiKey = options?.apiKey?.trim() || this.config.apiKey;
    const baseUrl = (options?.baseUrl?.trim() || this.config.baseUrl).replace(/\/$/, "");
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "qwen3-asr-flash",
        stream: false,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "input_audio",
                input_audio: { data: `data:audio/wav;base64,${raw}` }
              }
            ]
          }
        ],
        asr_options: { language: "zh", enable_itn: true }
      }),
      signal: mergeTimeoutSignal(timeoutMs, options?.signal)
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`ASR request failed: ${response.status} ${text.slice(0, 200)}`);
    }
    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
      usage?: unknown;
    };
    this.capture(parseUsage(json.usage), {
      purpose: "asr",
      sessionId: options?.sessionId,
      model: "qwen3-asr-flash"
    }, "qwen3-asr-flash");
    const content = json.choices?.[0]?.message?.content;
    if (typeof content === "string") {
      return content.trim();
    }
    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (typeof part === "string") {
            return part;
          }
          if (part && typeof part === "object" && "text" in part) {
            return String((part as { text?: string }).text ?? "");
          }
          return "";
        })
        .join("")
        .trim();
    }
    return "";
  }

  async *streamChat(
    messages: LlmMessage[],
    signal?: AbortSignal,
    options?: Pick<LlmCallOptions, "purpose" | "sessionId">
  ): AsyncGenerator<StreamChatPart> {
    const response = await fetch(
      `${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(
          buildChatCompletionBody(this.config.model, messages, { stream: true })
        ),
        signal
      }
    );

    if (!response.ok || !response.body) {
      throw new Error(`LLM request failed: ${response.status}`);
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let lastUsage: LlmUsage | undefined;
    const consumeBlock = (part: string): "done" | StreamChatPart[] => {
      const dataLine = part.split("\n").find((line) => line.startsWith("data: "));
      if (!dataLine) {
        return [];
      }
      const payload = dataLine.slice(6).trim();
      if (payload === "[DONE]") {
        return "done";
      }
      const out: StreamChatPart[] = [];
      try {
        const json = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string } }>;
          usage?: unknown;
        };
        const usage = parseUsage(json.usage);
        if (usage) {
          lastUsage = usage;
          out.push({ kind: "usage", usage });
        }
        const content = json.choices?.[0]?.delta?.content;
        if (content) {
          out.push({ kind: "delta", text: content });
        }
      } catch {
        return [];
      }
      return out;
    };
    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        const result = consumeBlock(part);
        if (result === "done") {
          this.capture(lastUsage, options);
          return;
        }
        for (const item of result) {
          yield item;
        }
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) {
      const result = consumeBlock(buffer);
      if (result !== "done") {
        for (const item of result) {
          yield item;
        }
      }
    }
    this.capture(lastUsage, options);
  }
}
