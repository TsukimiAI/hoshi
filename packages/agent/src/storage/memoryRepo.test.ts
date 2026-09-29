import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { migrateDb } from "./db";
import { MemoryRepo } from "./memoryRepo";

function makeRepo(): { db: DatabaseSync; repo: MemoryRepo } {
  const db = new DatabaseSync(":memory:", { allowExtension: true });
  migrateDb(db);
  return { db, repo: new MemoryRepo(db) };
}

describe("MemoryRepo meta（摘录来源）", () => {
  it("带 meta 插入后可读回摘录来源", async () => {
    const { db, repo } = makeRepo();
    const item = await repo.insert("银杏是一种古老的孑遗植物。", null, "other", "植物百科", {
      source: "knowledge",
      chunkId: "chunk-1",
      documentId: "doc-1",
      documentTitle: "植物百科",
      collectionId: "col-1"
    });
    expect(item.meta?.source).toBe("knowledge");
    expect(item.meta?.documentTitle).toBe("植物百科");
    expect(item.meta?.chunkId).toBe("chunk-1");

    const listed = await repo.listActive();
    expect(listed[0]?.meta?.source).toBe("knowledge");
    expect(listed[0]?.meta?.documentTitle).toBe("植物百科");
    db.close();
  });

  it("不带 meta 的普通记忆 meta 为 null", async () => {
    const { db, repo } = makeRepo();
    const item = await repo.insert("用户喜欢喝咖啡。", null, "preference");
    expect(item.meta).toBeNull();
    db.close();
  });
});
