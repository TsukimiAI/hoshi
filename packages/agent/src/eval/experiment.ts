import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { OpenAiCompatClient } from "../llm/openai";
import type { LlmMessage } from "../llm/openai";
import { OpenAiCompatEmbedding } from "../knowledge/embedding";
import { KnowledgeService } from "../knowledge/service";
import { runKbEval } from "../knowledge/eval";
import { runRagasEval } from "../knowledge/ragas";
import { loadVecExtension } from "../knowledge/schema";
import { migrateDb } from "../storage/db";
import { runLiveEval } from "../memory/eval/live";
import { scoreInjectEmbedded, scoreRouter, skippedMetric } from "./evaluators";
import { loadInjectDataset, loadKbCorpus, loadKbQrels, loadRouterDataset } from "./load";
import {
  EVAL_EMBEDDING_MODEL,
  EVAL_SEARCH_PIN,
  pinnedKnowledgeSettings,
  resolveApiKey,
  resolveBaseUrl,
  resolveChatModel
} from "./settings";
import type { ExperimentRecord, EvalTier, FailureRow, MetricScore } from "./types";

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.message === "模型请求超时";
}

async function withTimeoutRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      if (!isTimeoutError(error) || i === attempts - 1) {
        throw error;
      }
    }
  }
  throw last;
}

function completeChat(client: OpenAiCompatClient, temperature?: number) {
  return async (messages: LlmMessage[]): Promise<string> => {
    const response = await withTimeoutRetry(() =>
      client.completeChat(messages, [], { enableSearch: false, timeoutMs: 60000, temperature })
    );
    return response.content;
  };
}

function vecAvailable(): boolean {
  const db = new DatabaseSync(":memory:", { allowExtension: true });
  const ok = loadVecExtension(db);
  db.close();
  return ok;
}

export async function runExperiment(tier: EvalTier): Promise<ExperimentRecord> {
  const router = loadRouterDataset();
  const inject = loadInjectDataset();
  const corpus = loadKbCorpus();
  const qrels = loadKbQrels();
  const datasets = [
    { name: router.name, version: router.version, n: router.cases.length },
    { name: inject.name, version: inject.version, n: inject.cases.length }
  ];
  if (tier === "live") {
    datasets.push(
      { name: corpus.name, version: corpus.version, n: corpus.documents.length },
      { name: qrels.name, version: qrels.version, n: qrels.cases.length }
    );
  }

  const metrics: Record<string, MetricScore> = {};
  const failures: FailureRow[] = [];

  const routerScores = scoreRouter(router.cases);
  Object.assign(metrics, routerScores.metrics);
  failures.push(...routerScores.failures);

  metrics["memory.inject.precision"] = skippedMetric("code", "needs embeddings", inject.cases.length);
  metrics["memory.inject.recall"] = skippedMetric("code", "needs embeddings", inject.cases.length);

  const record: ExperimentRecord = {
    experimentId: `eval-${randomUUID()}`,
    createdAt: new Date().toISOString(),
    tier,
    datasets,
    search: EVAL_SEARCH_PIN,
    metrics,
    failures
  };

  if (tier !== "live") {
    return record;
  }

  const apiKey = resolveApiKey();
  const chatModel = resolveChatModel();
  record.chatModel = chatModel;
  record.embeddingModel = EVAL_EMBEDDING_MODEL;

  if (!apiKey) {
    const skip = "missing HOSHI_API_KEY";
    metrics["memory.extract.abstain"] = skippedMetric("model", skip);
    metrics["memory.extract.must_hit"] = skippedMetric("model", skip);
    metrics["memory.extract.update"] = skippedMetric("model", skip);
    metrics["kb.hit_at_k"] = skippedMetric("code", skip);
    metrics["kb.mrr"] = skippedMetric("code", skip);
    metrics["ragas.faithfulness"] = skippedMetric("model", skip);
    metrics["ragas.answer_relevancy"] = skippedMetric("model", skip);
    metrics["ragas.context_relevancy"] = skippedMetric("model", skip);
    return record;
  }

  const client = new OpenAiCompatClient({
    apiKey,
    baseUrl: resolveBaseUrl(),
    model: chatModel
  });

  try {
    const memory = await runLiveEval(completeChat(client, 0));
    metrics["memory.extract.abstain"] = {
      value: memory.extract_abstain_acc,
      n: memory.abstain_n,
      kind: "model"
    };
    metrics["memory.extract.must_hit"] = {
      value: memory.extract_must_hit,
      n: memory.must_n,
      kind: "model"
    };
    metrics["memory.extract.update"] = {
      value: memory.extract_update_acc,
      n: memory.update_n,
      kind: "model"
    };
    for (const line of memory.failures) {
      failures.push({ id: "memory_live", metric: "memory.extract", reason: line });
    }
  } catch (error) {
    const skip = error instanceof Error ? error.message : String(error);
    metrics["memory.extract.abstain"] = skippedMetric("model", skip);
    metrics["memory.extract.must_hit"] = skippedMetric("model", skip);
    metrics["memory.extract.update"] = skippedMetric("model", skip);
    failures.push({ id: "memory_live", metric: "memory.extract", reason: skip });
  }

  const embedding = new OpenAiCompatEmbedding(client, () => ({
    model: EVAL_EMBEDDING_MODEL,
    apiKey: "",
    baseUrl: ""
  }));

  try {
    const injectScores = await scoreInjectEmbedded(inject.cases, embedding);
    Object.assign(metrics, injectScores.metrics);
    failures.push(...injectScores.failures);
  } catch (error) {
    const skip = error instanceof Error ? error.message : String(error);
    metrics["memory.inject.precision"] = skippedMetric("code", skip, inject.cases.length);
    metrics["memory.inject.recall"] = skippedMetric("code", skip, inject.cases.length);
    failures.push({ id: "memory_inject", metric: "memory.inject.recall", reason: skip });
  }

  if (!vecAvailable()) {
    const skip = "sqlite-vec unavailable";
    metrics["kb.hit_at_k"] = skippedMetric("code", skip, qrels.cases.length);
    metrics["kb.mrr"] = skippedMetric("code", skip, qrels.cases.length);
  } else {
    const retrieval = await runKbEval({
      embedding,
      settings: pinnedKnowledgeSettings(),
      documents: corpus.documents,
      cases: qrels.cases.map((item) => ({ query: item.query, expectDocTitle: item.expectDocTitle })),
      topK: EVAL_SEARCH_PIN.topK
    });
    metrics["kb.hit_at_k"] = { value: retrieval.hitAtK, n: retrieval.total, kind: "code" };
    metrics["kb.mrr"] = { value: retrieval.mrr, n: retrieval.total, kind: "code" };
    for (const line of retrieval.failures) {
      failures.push({ id: "kb_retrieval", metric: "kb.hit_at_k", reason: line });
    }
  }

  const db = new DatabaseSync(":memory:", { allowExtension: true });
  migrateDb(db);
  const service = new KnowledgeService(db, embedding, pinnedKnowledgeSettings());
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
  try {
    const ragas = await runRagasEval({
      service,
      completeChat: completeChat(client, 0),
      cases: qrels.cases.map((item) => ({ query: item.query })),
      topK: EVAL_SEARCH_PIN.topK
    });
    if (ragas.cases.length === 0) {
      const skip = ragas.skipped[0]?.reason || "ragas 全部失败";
      metrics["ragas.faithfulness"] = skippedMetric("model", skip, qrels.cases.length);
      metrics["ragas.answer_relevancy"] = skippedMetric("model", skip, qrels.cases.length);
      metrics["ragas.context_relevancy"] = skippedMetric("model", skip, qrels.cases.length);
    } else {
      metrics["ragas.faithfulness"] = {
        value: ragas.avgFaithfulness,
        n: ragas.cases.length,
        kind: "model"
      };
      metrics["ragas.answer_relevancy"] = {
        value: ragas.avgAnswerRelevance,
        n: ragas.cases.length,
        kind: "model"
      };
      metrics["ragas.context_relevancy"] = {
        value: ragas.avgContextRelevance,
        n: ragas.cases.length,
        kind: "model"
      };
    }
    for (const row of ragas.skipped) {
      failures.push({ id: row.query, metric: "ragas", reason: row.reason });
    }
  } catch (error) {
    const skip = error instanceof Error ? error.message : String(error);
    metrics["ragas.faithfulness"] = skippedMetric("model", skip, qrels.cases.length);
    metrics["ragas.answer_relevancy"] = skippedMetric("model", skip, qrels.cases.length);
    metrics["ragas.context_relevancy"] = skippedMetric("model", skip, qrels.cases.length);
    failures.push({ id: "ragas", metric: "ragas", reason: skip });
  }
  db.close();
  return record;
}
