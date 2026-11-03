import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { KnowledgeSettings } from "@hoshi/shared";
import { DEFAULT_HOSHI_SETTINGS } from "@hoshi/shared";
import type { SearchPin } from "./types";

export function parseEnvText(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const eq = line.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/** 与桌面端相同：读仓库根目录 `.env`，不覆盖已经在进程里的变量。 */
export function loadRepoEnv(cwd = process.cwd()): void {
  const file = join(cwd, ".env");
  if (!existsSync(file)) {
    return;
  }
  const parsed = parseEnvText(readFileSync(file, "utf8"));
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadRepoEnv();

export const EVAL_EMBEDDING_MODEL = "text-embedding-v4";
export const EVAL_DEFAULT_CHAT_MODEL = "qwen-plus";
export const EVAL_TOP_K = 5;

export const EVAL_SEARCH_PIN: SearchPin = {
  topK: EVAL_TOP_K,
  queryRewrite: "off",
  rerank: false,
  embeddingModel: EVAL_EMBEDDING_MODEL
};

export function pinnedKnowledgeSettings(): KnowledgeSettings {
  const knowledge = DEFAULT_HOSHI_SETTINGS.knowledge as KnowledgeSettings;
  return {
    ...knowledge,
    enabled: true,
    embedding: {
      ...knowledge.embedding,
      model: EVAL_EMBEDDING_MODEL
    },
    search: {
      ...knowledge.search,
      topK: EVAL_TOP_K,
      queryRewrite: "off"
    },
    rerank: {
      ...knowledge.rerank,
      enabled: false
    }
  };
}

export function resolveChatModel(): string {
  return process.env.HOSHI_MODEL?.trim() || EVAL_DEFAULT_CHAT_MODEL;
}

export function resolveApiKey(): string {
  return process.env.HOSHI_API_KEY?.trim() ?? "";
}

export function resolveBaseUrl(): string {
  return process.env.HOSHI_BASE_URL?.trim() || "https://dashscope.aliyuncs.com/compatible-mode/v1";
}
