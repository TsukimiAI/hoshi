import { DatabaseSync } from "node:sqlite";
import type { KnowledgeSettings } from "@hoshi/shared";
import { migrateDb } from "../storage/db";
import type { EmbeddingProvider } from "./embedding";
import { KnowledgeService } from "./service";

export interface KbEvalDoc {
  title: string;
  text: string;
}

export interface KbEvalCase {
  query: string;
  expectDocTitle: string;
}

export interface KbEvalResult {
  hitAtK: number;
  mrr: number;
  total: number;
  failures: string[];
}

export async function runKbEval(opts: {
  embedding: EmbeddingProvider;
  settings: KnowledgeSettings;
  documents: KbEvalDoc[];
  cases: KbEvalCase[];
  topK?: number;
}): Promise<KbEvalResult> {
  const db = new DatabaseSync(":memory:", { allowExtension: true });
  migrateDb(db);
  const service = new KnowledgeService(db, opts.embedding, opts.settings);
  const collection = await service.createCollection("eval");
  for (const doc of opts.documents) {
    await service.ingestDocument({
      collectionId: collection.id,
      title: doc.title,
      sourceName: "",
      mime: "text/plain",
      text: doc.text
    });
  }
  await service.flushQueue();

  const topK = opts.topK ?? opts.settings.search.topK;
  let rrSum = 0;
  let hits = 0;
  const failures: string[] = [];
  for (const testCase of opts.cases) {
    const results = await service.search(testCase.query, { topK });
    const rank = results.findIndex((hit) => hit.documentTitle === testCase.expectDocTitle);
    if (rank >= 0) {
      hits += 1;
      rrSum += 1 / (rank + 1);
    } else {
      failures.push(
        `${testCase.query} -> ${testCase.expectDocTitle}（实际: ${results
          .map((hit) => hit.documentTitle)
          .join(", ") || "无"}）`
      );
    }
  }
  db.close();
  const total = opts.cases.length;
  return {
    hitAtK: total > 0 ? hits / total : 0,
    mrr: total > 0 ? rrSum / total : 0,
    total,
    failures
  };
}
