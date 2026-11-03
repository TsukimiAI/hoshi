import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { loadVecExtension } from "../knowledge/schema";
import { migrateDb } from "../storage/db";
import { cosineSimilarity, ensureMemoryVectorTable, searchMemoryVectors, upsertMemoryVector } from "./vec";

describe("cosineSimilarity", () => {
  it("相同向量为 1", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });
});

describe("memory_vec", () => {
  it("按余弦召回红茶，不召回加班", () => {
    const db = new DatabaseSync(":memory:", { allowExtension: true });
    migrateDb(db);
    if (!loadVecExtension(db)) {
      db.close();
      return;
    }
    ensureMemoryVectorTable(db, 2);
    upsertMemoryVector(db, "tea", [1, 0]);
    upsertMemoryVector(db, "overtime", [0, 1]);
    const hits = searchMemoryVectors(db, [1, 0], 8);
    expect(hits[0]?.id).toBe("tea");
    expect(hits[0]?.score ?? 0).toBeGreaterThan(0.9);
    const ot = hits.find((hit) => hit.id === "overtime");
    expect(ot?.score ?? 0).toBeLessThan(0.2);
    db.close();
  });
});
