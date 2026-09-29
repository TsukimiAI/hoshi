import type { LlmMessage } from "../llm/openai";

export type QueryRewriteMode = "off" | "rewrite" | "multi";

const REWRITE_PROMPT = `你是检索查询改写助手。把用户的问题改写成适合语义检索的短查询。
规则：
- 去掉口语、礼貌用语、无意义前缀（如"请问""帮我查一下""你好"）。
- 保留核心意图和关键实体。
- 如果是复合问题（含多个独立诉求），拆成 2~3 个独立子查询；否则只给 1 条。
- 只输出 JSON，形如：{"queries":["查询1","查询2"]}`;

export function parseQueries(raw: string): string[] {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as { queries?: unknown };
    if (!Array.isArray(parsed.queries)) {
      return [];
    }
    return parsed.queries
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map((item) => item.trim())
      .slice(0, 3);
  } catch {
    return [];
  }
}

export async function rewriteQuery(
  completeChat: (messages: LlmMessage[]) => Promise<string>,
  query: string,
  mode: "rewrite" | "multi"
): Promise<string[]> {
  const raw = await completeChat([
    { role: "system", content: REWRITE_PROMPT },
    { role: "user", content: `问题：${query}` }
  ]);
  const queries = parseQueries(raw);
  if (queries.length === 0) {
    return [query];
  }
  return mode === "rewrite" ? [queries[0]] : queries.slice(0, 3);
}
