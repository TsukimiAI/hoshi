import { DatabaseSync } from "node:sqlite";
import type { KnowledgeSettings } from "@hoshi/shared";
import { DEFAULT_HOSHI_SETTINGS } from "@hoshi/shared";
import { OpenAiCompatClient } from "../llm/openai";
import type { LlmMessage } from "../llm/openai";
import { migrateDb } from "../storage/db";
import { OpenAiCompatEmbedding } from "./embedding";
import { KnowledgeService } from "./service";
import { runRagasEval, type RagasEvalResult } from "./ragas";

const SEED_DOCS = [
  {
    title: "养猫手册",
    text: "猫是肉食动物，需要高蛋白饮食。猫砂需要每天清理。猫通常每天睡 12-16 小时。"
  },
  {
    title: "量子物理入门",
    text: "量子纠缠是量子力学中的现象，两个粒子无论相距多远都会相互关联。叠加态指粒子同时处于多个状态。"
  },
  {
    title: "股票投资",
    text: "股票投资应分散风险，长期持有比频繁交易更稳健。定投是一种适合普通人的投资方式。"
  }
];

const CASES = [
  { query: "猫一天睡多久？" },
  { query: "什么是量子纠缠？" },
  { query: "普通人怎么投资股票？" }
];

export async function runRagasEvalFromEnv(): Promise<RagasEvalResult | { skipped: string }> {
  const apiKey = process.env.HOSHI_API_KEY?.trim() ?? "";
  if (!apiKey) {
    return { skipped: "missing HOSHI_API_KEY" };
  }
  const client = new OpenAiCompatClient({
    apiKey,
    baseUrl: process.env.HOSHI_BASE_URL?.trim() || "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: process.env.HOSHI_MODEL?.trim() || "qwen-plus"
  });
  const embedding = new OpenAiCompatEmbedding(client, () => ({
    model: "text-embedding-v4",
    apiKey: "",
    baseUrl: ""
  }));

  const db = new DatabaseSync(":memory:", { allowExtension: true });
  migrateDb(db);
  const service = new KnowledgeService(db, embedding, DEFAULT_HOSHI_SETTINGS.knowledge as KnowledgeSettings);
  const collection = await service.createCollection("eval");
  for (const doc of SEED_DOCS) {
    await service.ingestDocument({
      collectionId: collection.id,
      title: doc.title,
      sourceName: "",
      mime: "text/plain",
      text: doc.text
    });
  }
  await service.flushQueue();

  const result = await runRagasEval({
    service,
    completeChat: async (messages: LlmMessage[]) => {
      const response = await client.completeChat(messages, [], { enableSearch: false, timeoutMs: 20000 });
      return response.content;
    },
    cases: CASES
  });
  db.close();
  return result;
}
