import type { WebHit } from "./types";

export const DEEPSEEK_ANTHROPIC_MESSAGES = "https://api.deepseek.com/anthropic/v1/messages";
export const DEEPSEEK_SEARCH_MODEL = "deepseek-chat";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function extractWebSearchHits(json: unknown): WebHit[] {
  const hits: WebHit[] = [];
  const seen = new Set<string>();
  const take = (node: Record<string, unknown>): void => {
    const url = asString(node.url);
    if (!url || seen.has(url)) {
      return;
    }
    seen.add(url);
    hits.push({
      url,
      title: asString(node.title) || url,
      date: asString(node.page_age) || asString(node.date) || undefined,
      snippet: asString(node.snippet) || asString(node.excerpt) || asString(node.text) || undefined
    });
  };
  const visit = (node: unknown, inResults: boolean): void => {
    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item, inResults);
      }
      return;
    }
    if (!isRecord(node)) {
      return;
    }
    const type = asString(node.type);
    if (type === "web_search_tool_result") {
      if (isRecord(node.content) && asString(node.content.type).includes("error")) {
        throw new Error(asString(node.content.error_code) || "提供方检索错误");
      }
      visit(node.content, true);
      return;
    }
    if (type === "web_search_result" || (inResults && asString(node.url))) {
      take(node);
    }
    if (Array.isArray(node.content) && type !== "web_search_tool_result") {
      visit(node.content, inResults);
    }
  };
  if (isRecord(json)) {
    visit(json.content, false);
  }
  return hits;
}

export function extractOptionalAnswer(json: unknown): string {
  if (!isRecord(json) || !Array.isArray(json.content)) {
    return "";
  }
  const parts: string[] = [];
  for (const item of json.content) {
    if (isRecord(item) && asString(item.type) === "text") {
      const text = asString(item.text);
      if (text) {
        parts.push(text);
      }
    }
  }
  return parts.join("\n").trim();
}

export async function searchDeepSeekOfficial(
  query: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<{ hits: WebHit[]; optionalAnswer: string }> {
  const response = await fetchImpl(DEEPSEEK_ANTHROPIC_MESSAGES, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: DEEPSEEK_SEARCH_MODEL,
      max_tokens: 1024,
      messages: [{ role: "user", content: `Search the web for: ${query}` }],
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 1 }]
    }),
    signal
  });
  const raw = await response.text();
  let json: unknown = null;
  try {
    json = raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    json = null;
  }
  if (!response.ok) {
    const err = isRecord(json) ? json.error : null;
    const message =
      (typeof err === "string" ? err : isRecord(err) ? asString(err.message) : "") ||
      raw.slice(0, 180) ||
      `HTTP ${response.status}`;
    throw new Error(`deepseek-official：${message}`);
  }
  const hits = extractWebSearchHits(json);
  if (hits.length === 0) {
    throw new Error("deepseek-official：响应里没有检索结果块");
  }
  return { hits, optionalAnswer: extractOptionalAnswer(json) };
}
