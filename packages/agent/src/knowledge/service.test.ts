import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import type { KnowledgeSettings } from "@hoshi/shared";
import { DEFAULT_HOSHI_SETTINGS } from "@hoshi/shared";
import { migrateDb } from "../storage/db";
import type { EmbeddingProvider } from "./embedding";
import type { RerankProvider } from "./rerank";
import { KnowledgeService } from "./service";

function keywordEmbedding(): EmbeddingProvider {
  return {
    modelKey: () => "fake:test",
    async embed(texts: string[]): Promise<number[][]> {
      return texts.map((text) => {
        const v = [0, 0, 0, 0];
        if (text.includes("猫")) v[0] = 1;
        if (text.includes("狗")) v[1] = 1;
        if (text.includes("天气")) v[2] = 1;
        return v;
      });
    }
  };
}

function makeService(): { db: DatabaseSync; service: KnowledgeService } {
  const db = new DatabaseSync(":memory:", { allowExtension: true });
  migrateDb(db);
  const service = new KnowledgeService(db, keywordEmbedding(), DEFAULT_HOSHI_SETTINGS.knowledge as KnowledgeSettings);
  return { db, service };
}

describe("KnowledgeService", () => {
  it("入库并检索", async () => {
    const { db, service } = makeService();
    const collection = await service.createCollection("测试库");
    const { doc } = await service.ingestDocument({
      collectionId: collection.id,
      title: "宠物手册",
      sourceName: "pet.md",
      mime: "text/markdown",
      text: "# 猫\n\n猫是一种喜欢独处的动物。\n\n# 狗\n\n狗喜欢与人互动。"
    });
    expect(doc.status).toBe("parsing");
    await service.flushQueue();

    const ready = await service.getDocument(doc.id);
    expect(ready?.status).toBe("ready");
    const listed = await service.listDocuments(collection.id);
    expect(listed[0]?.chunkCount).toBeGreaterThan(0);

    const hits = await service.search("猫");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].text).toContain("猫");
    db.close();
  });

  it("无结果返回空", async () => {
    const { db, service } = makeService();
    const collection = await service.createCollection("空库");
    const hits = await service.search("鸟");
    expect(hits).toEqual([]);
    db.close();
  });

  it("标题 MIT 6 能被 MIT6 笔记问句命中，即使正文不含 MIT6", async () => {
    const { db, service } = makeService();
    const collection = await service.createCollection("库");
    await service.ingestDocument({
      collectionId: collection.id,
      title: "MIT 6",
      sourceName: "",
      mime: "text/plain",
      text: "二进制布局包含文本段、数据段和 BSS 段。编译器生成二进制文件时会填充这些段。"
    });
    await service.flushQueue();
    const hits = await service.search("分点详细总结一下我MIT6笔记的内容");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].documentTitle).toBe("MIT 6");
    expect(hits[0].text).toContain("BSS");
    expect(hits[0].text).not.toContain("MIT6");
    db.close();
  });

  it("总结按 seq 多取，查句命中文档内 BSS 而不是篇首", async () => {
    const { db, service } = makeService();
    const collection = await service.createCollection("库");
    await service.ingestDocument({
      collectionId: collection.id,
      title: "MIT 6",
      sourceName: "",
      mime: "text/plain",
      text: [
        "# 前言",
        `${"程序最终会变成二进制文件，先看整体布局。".repeat(8)}`,
        "# BSS",
        "BSS 段存放未初始化的全局变量，进程启动时由加载器清零。",
        "# 收尾",
        `${"链接器还会处理重定位和符号表。".repeat(8)}`
      ].join("\n\n")
    });
    await service.flushQueue();
    const summarized = await service.search("分点详细总结一下我MIT6笔记的内容", { mode: "summarize" });
    expect(summarized.length).toBeGreaterThan(1);
    expect(summarized.every((hit, index) => index === 0 || hit.seq >= summarized[index - 1].seq)).toBe(true);
    expect(summarized.some((hit) => hit.text.includes("BSS"))).toBe(true);

    const lookup = await service.search("MIT6里BSS段是什么", { mode: "lookup" });
    expect(lookup.length).toBeGreaterThan(0);
    expect(lookup[0].text).toContain("BSS");
    expect(lookup[0].text).not.toContain("先看整体布局");
    db.close();
  });

  it("关键词（FTS5）检索命中", async () => {
    const { db, service } = makeService();
    const collection = await service.createCollection("库");
    await service.ingestDocument({
      collectionId: collection.id,
      title: "物理笔记",
      sourceName: "",
      mime: "text/plain",
      text: "量子计算利用量子叠加与量子纠缠实现并行运算。"
    });
    await service.flushQueue();
    const hits = await service.search("量子叠加");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].text).toContain("量子叠加");
    db.close();
  });

  it("编辑分块并重新嵌入", async () => {
    const { db, service } = makeService();
    const collection = await service.createCollection("库");
    const { doc } = await service.ingestDocument({
      collectionId: collection.id,
      title: "动物",
      sourceName: "",
      mime: "text/plain",
      text: "猫是一种喜欢独处的动物。"
    });
    await service.flushQueue();
    const { chunks } = await service.listChunks(doc.id);
    expect(chunks.length).toBeGreaterThan(0);
    const chunkId = chunks[0].id;

    const ok = await service.updateChunk(chunkId, "狗是一种喜欢互动的动物。");
    expect(ok).toBe(true);

    const hits = await service.search("狗");
    expect(hits.some((hit) => hit.chunkId === chunkId)).toBe(true);
    db.close();
  });

  it("rerank 失败回退 RRF 顺序", async () => {
    const db = new DatabaseSync(":memory:", { allowExtension: true });
    migrateDb(db);
    const settings: KnowledgeSettings = {
      ...DEFAULT_HOSHI_SETTINGS.knowledge,
      rerank: { ...DEFAULT_HOSHI_SETTINGS.knowledge.rerank, enabled: true }
    };
    const failingRerank: RerankProvider = {
      async rerank() {
        throw new Error("boom");
      }
    };
    const service = new KnowledgeService(db, keywordEmbedding(), settings, failingRerank);
    const collection = await service.createCollection("库");
    const text = Array.from({ length: 10 }, (_, i) => `第${i}段关于猫的内容，描述猫的行为习惯。`).join("\n\n");
    await service.ingestDocument({ collectionId: collection.id, title: "猫", sourceName: "", mime: "text/plain", text });
    await service.flushQueue();

    const hits = await service.search("猫");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].text).toContain("猫");
    db.close();
  });

  it("相邻块回填包含邻居上下文", async () => {
    const { db, service } = makeService();
    const collection = await service.createCollection("库");
    const filler = "这是一段用于测试相邻块回填的连续文字内容。".repeat(12);
    const paragraphs = Array.from({ length: 8 }, (_, i) => `第${i}段：${filler}`);
    const { doc } = await service.ingestDocument({
      collectionId: collection.id,
      title: "文档",
      sourceName: "",
      mime: "text/plain",
      text: paragraphs.join("\n\n")
    });
    await service.flushQueue();

    const { chunks } = await service.listChunks(doc.id);
    expect(chunks.length).toBeGreaterThan(1);

    const hits = await service.search("第3段");
    expect(hits.length).toBeGreaterThan(0);
    const hit = hits[0];
    const context = await service.expandHitContext(hit, 1);
    expect(context).toContain(hit.text);
    // 回填了相邻块，上下文比命中块本身更长
    expect(context.length).toBeGreaterThan(hit.text.length);
    db.close();
  });

  it("短词（双字）检索能命中", async () => {
    const { db, service } = makeService();
    const collection = await service.createCollection("库");
    await service.ingestDocument({
      collectionId: collection.id,
      title: "文档",
      sourceName: "",
      mime: "text/plain",
      text: "银杏是一种古老的孑遗植物，被称为活化石。"
    });
    await service.flushQueue();
    const hits = await service.search("银杏");
    expect(hits.some((hit) => hit.text.includes("银杏"))).toBe(true);
    db.close();
  });

  it("同名同内容去重，同名不同内容覆盖更新", async () => {
    const { db, service } = makeService();
    const collection = await service.createCollection("库");
    const input = {
      collectionId: collection.id,
      title: "文档",
      sourceName: "a.md",
      mime: "text/plain",
      text: "内容一，关于猫。"
    };

    const first = await service.ingestDocument(input);
    expect(first.action).toBe("created");

    const second = await service.ingestDocument(input);
    expect(second.action).toBe("skipped");
    expect(second.doc.id).toBe(first.doc.id);

    const third = await service.ingestDocument({ ...input, text: "内容二，关于狗。" });
    expect(third.action).toBe("updated");
    expect(third.doc.id).toBe(first.doc.id);

    await service.flushQueue();
    const docs = await service.listDocuments(collection.id);
    expect(docs.length).toBe(1);
    db.close();
  });

  it("粘贴（无 sourceName）按内容哈希去重", async () => {
    const { db, service } = makeService();
    const collection = await service.createCollection("库");
    const input = {
      collectionId: collection.id,
      title: "未命名文档",
      sourceName: "",
      mime: "text/plain",
      text: "关于猫的粘贴内容。"
    };

    const first = await service.ingestDocument(input);
    expect(first.action).toBe("created");

    const second = await service.ingestDocument(input);
    expect(second.action).toBe("skipped");
    expect(second.doc.id).toBe(first.doc.id);

    await service.flushQueue();
    const docs = await service.listDocuments(collection.id);
    expect(docs.length).toBe(1);
    db.close();
  });

  it("失败文档可重试恢复", async () => {
    let shouldFail = true;
    const flakyEmbedding: EmbeddingProvider = {
      modelKey: () => "fake:flaky",
      async embed(texts: string[]): Promise<number[][]> {
        if (shouldFail) {
          throw new Error("Embedding request failed: 400 invalid");
        }
        return texts.map(() => [1, 0, 0, 0]);
      }
    };
    const db = new DatabaseSync(":memory:", { allowExtension: true });
    migrateDb(db);
    const service = new KnowledgeService(db, flakyEmbedding, DEFAULT_HOSHI_SETTINGS.knowledge as KnowledgeSettings);
    const collection = await service.createCollection("库");
    const { doc } = await service.ingestDocument({
      collectionId: collection.id,
      title: "文档",
      sourceName: "a.md",
      mime: "text/plain",
      text: "关于猫的内容。"
    });
    await service.flushQueue();
    expect((await service.getDocument(doc.id))?.status).toBe("failed");

    shouldFail = false;
    const retried = await service.retryDocument(doc.id);
    expect(retried).toBeTruthy();
    await service.flushQueue();
    expect((await service.getDocument(doc.id))?.status).toBe("ready");
    db.close();
  });

  it("job 队列持久化并可查询", async () => {
    const { db, service } = makeService();
    const collection = await service.createCollection("库");
    const { doc } = await service.ingestDocument({
      collectionId: collection.id,
      title: "文档",
      sourceName: "a.md",
      mime: "text/plain",
      text: "关于猫的内容。"
    });
    expect(doc.status).toBe("parsing");
    expect(service.pendingJobs()).toBeGreaterThan(0);

    await service.flushQueue();
    expect(service.pendingJobs()).toBe(0);

    const jobs = service.listJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].documentId).toBe(doc.id);
    expect(jobs[0].status).toBe("done");
    db.close();
  });

  it("崩溃恢复：running 的 job 重启后重新处理且不重复分块", async () => {
    const db = new DatabaseSync(":memory:", { allowExtension: true });
    migrateDb(db);
    const service1 = new KnowledgeService(db, keywordEmbedding(), DEFAULT_HOSHI_SETTINGS.knowledge as KnowledgeSettings);
    const collection = await service1.createCollection("库");
    const { doc } = await service1.ingestDocument({
      collectionId: collection.id,
      title: "文档",
      sourceName: "a.md",
      mime: "text/plain",
      text: "# 猫\n\n猫是一种动物。\n\n# 狗\n\n狗也是一种动物。"
    });
    await service1.flushQueue();
    const before = (await service1.listChunks(doc.id)).total;
    expect(before).toBeGreaterThan(0);

    // 模拟「已插入分块但未标记 ready」的崩溃点：job 卡在 running、文档卡在 embedding。
    db.prepare(`UPDATE kb_jobs SET status = 'running' WHERE document_id = ?`).run(doc.id);
    db.prepare(`UPDATE kb_documents SET status = 'embedding' WHERE id = ?`).run(doc.id);

    // 重启：新 service 构造时把 running 回退为 pending 并恢复处理。
    const service2 = new KnowledgeService(db, keywordEmbedding(), DEFAULT_HOSHI_SETTINGS.knowledge as KnowledgeSettings);
    await service2.flushQueue();

    expect((await service2.getDocument(doc.id))?.status).toBe("ready");
    const after = (await service2.listChunks(doc.id)).total;
    expect(after).toBe(before);
    const jobs = service2.listJobs();
    expect(jobs.find((job) => job.documentId === doc.id)?.status).toBe("done");
    db.close();
  });

  it("目录列出 ready 文档标题", async () => {
    const { db, service } = makeService();
    const collection = await service.createCollection("讲义");
    await service.ingestDocument({
      collectionId: collection.id,
      title: "MIT 6",
      sourceName: "lec.pdf",
      mime: "text/plain",
      text: "二进制布局。"
    });
    await service.flushQueue();
    const catalog = await service.listCatalog();
    expect(catalog).toEqual([
      expect.objectContaining({ title: "MIT 6", collectionName: "讲义", sourceName: "lec.pdf" })
    ]);
    db.close();
  });

  it("重建索引幂等：健康库上重复执行不报错", async () => {
    const { db, service } = makeService();
    const collection = await service.createCollection("库");
    await service.ingestDocument({
      collectionId: collection.id,
      title: "文档",
      sourceName: "a.md",
      mime: "text/plain",
      text: "# 猫\n\n猫是一种动物。\n\n# 狗\n\n狗也是一种动物。"
    });
    await service.flushQueue();

    const first = await service.reindexAll();
    expect(first.chunks).toBeGreaterThan(0);
    // 之前会因 kb_vec 主键冲突抛错，现在应幂等成功
    const second = await service.reindexAll();
    expect(second.chunks).toBe(first.chunks);
    db.close();
  });

  it("嵌入维度变化自动重嵌既有文档，语义检索不失效", async () => {
    let dim = 4;
    const mutableEmbedding: EmbeddingProvider = {
      modelKey: () => `fake:${dim}`,
      async embed(texts: string[]): Promise<number[][]> {
        return texts.map((text) => {
          const v = new Array<number>(dim).fill(0);
          if (text.includes("猫")) v[0] = 1;
          if (text.includes("狗")) v[1] = 1;
          return v;
        });
      }
    };
    const db = new DatabaseSync(":memory:", { allowExtension: true });
    migrateDb(db);
    const service = new KnowledgeService(db, mutableEmbedding, DEFAULT_HOSHI_SETTINGS.knowledge as KnowledgeSettings);
    const collection = await service.createCollection("库");

    await service.ingestDocument({
      collectionId: collection.id,
      title: "A",
      sourceName: "a.md",
      mime: "text/plain",
      text: "关于猫的内容。"
    });
    await service.flushQueue();

    // 换模型：维度从 4 变成 6
    dim = 6;
    await service.ingestDocument({
      collectionId: collection.id,
      title: "B",
      sourceName: "b.md",
      mime: "text/plain",
      text: "关于狗的内容。"
    });
    await service.flushQueue();

    // 旧文档 A 仍能被语义检索命中（已被自动重嵌到新维度）
    const hits = await service.search("猫");
    expect(hits.some((hit) => hit.text.includes("猫"))).toBe(true);
    db.close();
  });
});
