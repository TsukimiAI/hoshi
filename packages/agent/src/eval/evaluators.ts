import { DatabaseSync } from "node:sqlite";
import type { MemoryItem } from "@hoshi/shared";
import type { EmbeddingProvider } from "../knowledge/embedding";
import { loadVecExtension } from "../knowledge/schema";
import { selectMemoriesForInject } from "../memory/inject";
import { resetMemoryVectorTable, searchMemoryVectors, upsertMemoryVector } from "../memory/vec";
import { classifyDeskTurn, knowledgeRoute, shouldWebSearch } from "../retrieval/plan";
import { migrateDb } from "../storage/db";
import type { FailureRow, InjectCase, MetricScore, RouterCase } from "./types";

function ratio(ok: number, n: number): number {
  return n > 0 ? ok / n : 0;
}

export function scoreRouter(cases: RouterCase[]): {
  metrics: Record<string, MetricScore>;
  failures: FailureRow[];
} {
  let webOk = 0;
  let kbOk = 0;
  let deskOk = 0;
  const failures: FailureRow[] = [];
  for (const item of cases) {
    const web = shouldWebSearch(item.text);
    const kb = knowledgeRoute(item.text).kind;
    const desk = classifyDeskTurn(item.text).kind;
    if (web === item.web) {
      webOk += 1;
    } else {
      failures.push({
        id: item.id,
        metric: "router.web.accuracy",
        reason: `expected web=${item.web} got ${web}`
      });
    }
    if (kb === item.kb) {
      kbOk += 1;
    } else {
      failures.push({
        id: item.id,
        metric: "router.kb.accuracy",
        reason: `expected kb=${item.kb} got ${kb}`
      });
    }
    if (desk === item.desk) {
      deskOk += 1;
    } else {
      failures.push({
        id: item.id,
        metric: "router.desk.accuracy",
        reason: `expected desk=${item.desk} got ${desk}`
      });
    }
  }
  const n = cases.length;
  return {
    metrics: {
      "router.web.accuracy": { value: ratio(webOk, n), n, kind: "code" },
      "router.kb.accuracy": { value: ratio(kbOk, n), n, kind: "code" },
      "router.desk.accuracy": { value: ratio(deskOk, n), n, kind: "code" }
    },
    failures
  };
}

function toItems(seeds: InjectCase["memories"]): MemoryItem[] {
  return seeds.map((seed) => ({
    id: seed.id,
    text: seed.text,
    kind: seed.kind,
    topic: seed.topic,
    status: "active" as const,
    sourceSessionId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ackedAt: null
  }));
}

export function scoreInjectParaphrase(cases: InjectCase[]): {
  metrics: Record<string, MetricScore>;
  failures: FailureRow[];
} {
  let tp = 0;
  let pred = 0;
  let gold = 0;
  const failures: FailureRow[] = [];
  for (const item of cases) {
    const ids = selectMemoriesForInject(toItems(item.memories), item.query).map((row) => row.id);
    const need = new Set(item.expectIds);
    gold += need.size;
    if (ids.length === 0) {
      failures.push({
        id: item.id,
        metric: "memory.inject.recall",
        reason: `injected none, expected ${item.expectIds.join(",") || "∅"}`
      });
      continue;
    }
    pred += ids.length;
    for (const id of ids) {
      if (need.has(id)) {
        tp += 1;
      }
    }
    const missing = item.expectIds.filter((id) => !ids.includes(id));
    const extra = ids.filter((id) => !need.has(id));
    if (missing.length > 0 || extra.length > 0) {
      failures.push({
        id: item.id,
        metric: "memory.inject.recall",
        reason: `got ${ids.join(",")} expected ${item.expectIds.join(",")}`
      });
    }
  }
  return {
    metrics: {
      "memory.inject.precision": { value: pred > 0 ? tp / pred : 0, n: cases.length, kind: "code" },
      "memory.inject.recall": { value: gold > 0 ? tp / gold : 0, n: cases.length, kind: "code" }
    },
    failures
  };
}

export async function scoreInjectEmbedded(
  cases: InjectCase[],
  embedding: EmbeddingProvider
): Promise<{
  metrics: Record<string, MetricScore>;
  failures: FailureRow[];
}> {
  const db = new DatabaseSync(":memory:", { allowExtension: true });
  migrateDb(db);
  if (!loadVecExtension(db)) {
    db.close();
    return {
      metrics: {
        "memory.inject.precision": skippedMetric("code", "sqlite-vec unavailable", cases.length),
        "memory.inject.recall": skippedMetric("code", "sqlite-vec unavailable", cases.length)
      },
      failures: []
    };
  }
  let tp = 0;
  let pred = 0;
  let gold = 0;
  const failures: FailureRow[] = [];
  try {
    for (const item of cases) {
      const texts = [item.query, ...item.memories.map((row) => row.text)];
      const vectors = await embedding.embed(texts);
      const queryVec = vectors[0];
      if (!queryVec) {
        failures.push({ id: item.id, metric: "memory.inject.recall", reason: "query embed empty" });
        gold += item.expectIds.length;
        continue;
      }
      resetMemoryVectorTable(db, queryVec.length);
      for (let i = 0; i < item.memories.length; i += 1) {
        const vec = vectors[i + 1];
        if (vec) {
          upsertMemoryVector(db, item.memories[i].id, vec);
        }
      }
      const hits = searchMemoryVectors(db, queryVec, 8);
      const ids = selectMemoriesForInject(toItems(item.memories), item.query, hits).map((row) => row.id);
      const need = new Set(item.expectIds);
      gold += need.size;
      pred += ids.length;
      for (const id of ids) {
        if (need.has(id)) {
          tp += 1;
        }
      }
      const missing = item.expectIds.filter((id) => !ids.includes(id));
      const extra = ids.filter((id) => !need.has(id));
      if (missing.length > 0 || extra.length > 0) {
        failures.push({
          id: item.id,
          metric: "memory.inject.recall",
          reason: `got ${ids.join(",") || "none"} expected ${item.expectIds.join(",")} scores=${hits
            .map((hit) => `${hit.id}:${hit.score.toFixed(2)}`)
            .join(",")}`
        });
      }
    }
  } finally {
    db.close();
  }
  return {
    metrics: {
      "memory.inject.precision": { value: pred > 0 ? tp / pred : 0, n: cases.length, kind: "code" },
      "memory.inject.recall": { value: gold > 0 ? tp / gold : 0, n: cases.length, kind: "code" }
    },
    failures
  };
}

export function skippedMetric(kind: MetricScore["kind"], reason: string, n = 0): MetricScore {
  return { value: 0, n, kind, skipped: reason };
}
