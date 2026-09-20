import { parseUsage, type LlmUsage } from "@hoshi/shared";

export interface ParsedToolCall {
  id: string;
  name: string;
  argumentsJson: string;
}

export interface CompleteChatResult {
  content: string;
  toolCalls: ParsedToolCall[];
  usage?: LlmUsage;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseCompleteChatResponse(json: unknown): CompleteChatResult {
  const usage = isRecord(json) ? parseUsage(json.usage) : undefined;
  if (!isRecord(json) || !Array.isArray(json.choices)) {
    return { content: "", toolCalls: [], ...(usage ? { usage } : {}) };
  }
  const choice = json.choices[0];
  if (!isRecord(choice) || !isRecord(choice.message)) {
    return { content: "", toolCalls: [], ...(usage ? { usage } : {}) };
  }
  const message = choice.message;
  const content = typeof message.content === "string" ? message.content : "";
  const toolCalls: ParsedToolCall[] = [];
  if (Array.isArray(message.tool_calls)) {
    for (const item of message.tool_calls) {
      if (!isRecord(item) || !isRecord(item.function)) {
        continue;
      }
      const name = typeof item.function.name === "string" ? item.function.name : "";
      if (!name) {
        continue;
      }
      const id = typeof item.id === "string" && item.id ? item.id : `call_${toolCalls.length}`;
      const argumentsJson =
        typeof item.function.arguments === "string" ? item.function.arguments : "{}";
      toolCalls.push({ id, name, argumentsJson });
    }
  }
  return { content, toolCalls, ...(usage ? { usage } : {}) };
}

export function parseToolArgs(argumentsJson: string): Record<string, unknown> {
  try {
    const value = JSON.parse(argumentsJson) as unknown;
    if (isRecord(value)) {
      return value;
    }
    return { value };
  } catch {
    return { raw: argumentsJson };
  }
}
