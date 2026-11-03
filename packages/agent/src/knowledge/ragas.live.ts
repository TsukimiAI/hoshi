import { DatabaseSync } from "node:sqlite";
import type { KnowledgeSettings } from "@hoshi/shared";
import { DEFAULT_HOSHI_SETTINGS } from "@hoshi/shared";
import { loadKbCorpus, loadKbQrels } from "../eval/load";
import { EVAL_EMBEDDING_MODEL, EVAL_SEARCH_PIN, loadRepoEnv } from "../eval/settings";
import { OpenAiCompatClient } from "../llm/openai";
import type { LlmMessage } from "../llm/openai";
import { migrateDb } from "../storage/db";
import { OpenAiCompatEmbedding } from "./embedding";
import { KnowledgeService } from "./service";
import { runRagasEval, type RagasEvalResult } from "./ragas";

export function ragasEvalCaseCount(): number {
  return loadKbQrels().cases.length;
}

export async function runRagasEvalFromEnv(): Promise<RagasEvalResult | { skipped: string }> {
  loadRepoEnv();
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
    model: EVAL_EMBEDDING_MODEL,
    apiKey: "",
    baseUrl: ""
  }));

  const corpus = loadKbCorpus();
  const qrels = loadKbQrels();
  const db = new DatabaseSync(":memory:", { allowExtension: true });
  migrateDb(db);
  const service = new KnowledgeService(db, embedding, DEFAULT_HOSHI_SETTINGS.knowledge as KnowledgeSettings);
  const collection = await service.createCollection("eval");
  for (const doc of corpus.documents) {
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
      let last: unknown;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const response = await client.completeChat(messages, [], {
            enableSearch: false,
            timeoutMs: 60000,
            temperature: 0
          });
          return response.content;
        } catch (error) {
          last = error;
          const timedOut = error instanceof Error && error.message === "模型请求超时";
          if (!timedOut || attempt === 2) {
            throw error;
          }
        }
      }
      throw last;
    },
    cases: qrels.cases.map((item) => ({ query: item.query })),
    topK: EVAL_SEARCH_PIN.topK
  });
  db.close();
  return result;
}
