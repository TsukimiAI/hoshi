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
  searchNotes?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function messageText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((part) => {
      if (typeof part === "string") {
        return part;
      }
      if (isRecord(part) && typeof part.text === "string") {
        return part.text;
      }
      return "";
    })
    .join("")
    .trim();
}

export function formatSearchNotes(json: unknown): string {
  if (!isRecord(json) || !isRecord(json.search_info) || !Array.isArray(json.search_info.search_results)) {
    return "";
  }
  const lines: string[] = [];
  for (const item of json.search_info.search_results) {
    if (!isRecord(item)) {
      continue;
    }
    const title = typeof item.title === "string" ? item.title.trim() : "";
    const url = typeof item.url === "string" ? item.url.trim() : "";
    if (!title && !url) {
      continue;
    }
    lines.push([title, url].filter(Boolean).join(" "));
  }
  return lines.join("\n");
}

export function composeWebBrief(content: string, searchNotes?: string): string {
  const body = content.trim();
  const notes = (searchNotes ?? "").trim();
  if (body && notes) {
    return `${body}\n来源：\n${notes}`;
  }
  if (body) {
    return body;
  }
  if (notes) {
    return `来源：\n${notes}`;
  }
  return "";
}

export function parseCompleteChatResponse(json: unknown): CompleteChatResult {
  const usage = isRecord(json) ? parseUsage(json.usage) : undefined;
  const searchNotes = formatSearchNotes(json);
  const extra = {
    ...(usage ? { usage } : {}),
    ...(searchNotes ? { searchNotes } : {})
  };
  if (!isRecord(json) || !Array.isArray(json.choices)) {
    return { content: "", toolCalls: [], ...extra };
  }
  const choice = json.choices[0];
  if (!isRecord(choice) || !isRecord(choice.message)) {
    return { content: "", toolCalls: [], ...extra };
  }
  const message = choice.message;
  const content = messageText(message.content);
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
  return { content, toolCalls, ...extra };
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
