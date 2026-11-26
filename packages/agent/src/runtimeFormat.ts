import type { AgentEvent, ChatMessage, LlmUsage } from "@hoshi/shared";
import type { LlmMessage } from "./llm/openai";
import { humanizeSearchNotes } from "./web/notes";
import { glossaryExpansions, isKnowledgeHitOnTopic, TERM_ALIASES } from "./knowledge/relevance";

export function itemTitles(list: unknown): string[] {
  if (!Array.isArray(list)) {
    return [];
  }
  return list
    .map((item) => {
      const rec = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      return typeof rec.title === "string" ? rec.title.trim() : "";
    })
    .filter(Boolean);
}

export function summarizePageArgs(args: Record<string, unknown>): string | null {
  const items = Array.isArray(args.items) ? args.items : Array.isArray(args.cards) ? args.cards : null;
  if (!items) {
    return null;
  }
  const titles = itemTitles(items);
  if (titles.length) {
    return `整页 ${items.length} 张：${titles.slice(0, 3).join("、")}`;
  }
  return `整页 ${items.length} 张`;
}

export function summarizeToolArgs(argumentsJson: string): string {
  try {
    const parsed = JSON.parse(argumentsJson) as Record<string, unknown>;
    const nested =
      parsed.arguments && typeof parsed.arguments === "object"
        ? (parsed.arguments as Record<string, unknown>)
        : parsed;
    if (typeof nested.query === "string" && nested.query.trim()) {
      return nested.query.trim();
    }
    if (Array.isArray(nested.queries)) {
      const queries = nested.queries
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => item.trim());
      if (queries.length) {
        return queries.slice(0, 4).join("；");
      }
    }
    if (typeof nested.title === "string" && nested.title.trim()) {
      return nested.title.trim();
    }
    const page = summarizePageArgs(nested) ?? summarizePageArgs(parsed);
    if (page) {
      return page;
    }
    if (typeof nested.url === "string" && nested.url.trim()) {
      return nested.url.trim();
    }
    return JSON.stringify(nested);
  } catch {
    return argumentsJson;
  }
}

export function toolResultOk(name: string, result: string): boolean {
  if (name === "canvas_put") {
    return result.startsWith("已放到画布");
  }
  if (name === "canvas_set") {
    return result.startsWith("已更新画布");
  }
  if (name === "canvas_remove") {
    return result.startsWith("已从画布移除");
  }
  return !/失败|不可用|缺少|拒绝：/.test(result);
}

export function looksLikeInternalCanvasTalk(text: string): boolean {
  return /kind=chart|画布拒绝|时效这一页|只认 chart|老师要是拿到逐日|逐日实测记录/.test(text);
}

export function timeoutSpeakFallback(webBody: string | null): string {
  const raw = (webBody ?? "").trim();
  if (/没搜到贴合资料|没留下贴合/.test(raw)) {
    return "这轮检索没有留下和问题贴合的资料。";
  }
  const brief = humanizeSearchNotes(raw);
  if (brief.length >= 24) {
    return `口播超时了，先按检索到的资料说：${brief.slice(0, 280)}`;
  }
  return "回答超时，请再试一次。";
}

export function deskContextText(history: ChatMessage[] | undefined, message: string): string {
  const lines: string[] = [];
  for (const item of history ?? []) {
    const text = item.content.replace(/\s+/g, " ").trim().slice(0, 1500);
    if (!text) {
      continue;
    }
    if (item.role === "system") {
      lines.push(text);
      continue;
    }
    if (item.role !== "user" && item.role !== "assistant") {
      continue;
    }
    lines.push(`${item.role === "user" ? "老师" : "星奈"}：${text}`);
  }
  const current = `老师：${message.replace(/\s+/g, " ").trim()}`;
  if (lines.at(-1) !== current) {
    lines.push(current);
  }
  return lines.join("\n");
}

export function lastCanvasArguments(messages: LlmMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role !== "assistant" || !message.tool_calls) {
      continue;
    }
    const call = [...message.tool_calls].reverse().find((item) => item.function.name.startsWith("canvas_"));
    if (call) {
      return call.function.arguments;
    }
  }
  return "";
}

export function knowledgeExcerptFits(context: string, excerpt: string): boolean {
  if (isKnowledgeHitOnTopic(context, excerpt)) {
    return true;
  }
  const expansions = new Set(glossaryExpansions(context));
  if (expansions.size === 0) {
    return false;
  }
  return TERM_ALIASES.some((item) => expansions.has(item.en) && excerpt.includes(item.zh));
}

export function doneEvent(usage?: LlmUsage): AgentEvent {
  return usage
    ? { event: "done", data: { ok: true, usage } }
    : { event: "done", data: { ok: true } };
}

export async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  if (ms <= 0) {
    return promise;
  }
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
