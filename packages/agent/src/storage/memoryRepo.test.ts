import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import type { MemoryKind } from "@hoshi/shared";
import { migrateDb } from "./db";
import { MEMORY_TABLE_MAX, MemoryRepo } from "./memoryRepo";

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

describe("MemoryRepo evictIfNeeded", () => {
  async function seed(
    repo: MemoryRepo,
    n: number,
    kind: MemoryKind,
    prefix: string
  ): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 0; i < n; i += 1) {
      const item = await repo.insert(`${prefix}${String(i).padStart(3, "0")}老师周末经常加班`, null, kind);
      ids.push(item.id);
    }
    return ids;
  }

  function stamp(db: DatabaseSync, id: string, updatedAt: string): void {
    db.prepare(`UPDATE memories SET updated_at = ? WHERE id = ?`).run(updatedAt, id);
  }

  it("满员先硬删未确认 habit，留下身份和偏好", async () => {
    const { db, repo } = makeRepo();
    const habits = await seed(repo, MEMORY_TABLE_MAX - 2, "habit", "h");
    const identity = await repo.insert("老师希望被叫做韩", null, "identity", "name");
    const preference = await repo.insert("老师平时喜欢喝红茶", null, "preference", "drink");
    stamp(db, habits[0], "2020-01-01T00:00:00.000Z");
    expect(await repo.count()).toBe(MEMORY_TABLE_MAX);

    await repo.insert("老师晚上才开始写代码", null, "habit");
    expect(await repo.get(habits[0])).toBeNull();
    expect(await repo.get(identity.id)).not.toBeNull();
    expect(await repo.get(preference.id)).not.toBeNull();
    expect(await repo.count()).toBe(MEMORY_TABLE_MAX);
    db.close();
  });

  it("未确认 habit 先于更旧的已确认 habit 删除", async () => {
    const { db, repo } = makeRepo();
    const acked = await repo.insert("老师周末经常加班写代码", null, "habit");
    const unacked = await repo.insert("老师晚上才开始写代码", null, "habit");
    await repo.markAcked([acked.id]);
    stamp(db, acked.id, "2019-01-01T00:00:00.000Z");
    stamp(db, unacked.id, "2026-01-01T00:00:00.000Z");
    await seed(repo, MEMORY_TABLE_MAX - 2, "other", "o");
    expect(await repo.count()).toBe(MEMORY_TABLE_MAX);

    await repo.insert("老师习惯午休", null, "habit");
    expect(await repo.get(unacked.id)).toBeNull();
    expect(await repo.get(acked.id)).not.toBeNull();
    db.close();
  });

  it("全是身份时满员不删", async () => {
    const { db, repo } = makeRepo();
    const ids = await seed(repo, MEMORY_TABLE_MAX, "identity", "id");
    await repo.insert("老师希望被叫做小韩", null, "identity", "name");
    expect(await repo.count()).toBe(MEMORY_TABLE_MAX + 1);
    expect(await repo.get(ids[0])).not.toBeNull();
    db.close();
  });
});
