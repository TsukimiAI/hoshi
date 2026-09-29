import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { KnowledgeSettings } from "@hoshi/shared";
import { chunkDocument, type ChunkSeg } from "./chunk";
import type { EmbeddingProvider } from "./embedding";
import { KnowledgeRepo, type ChunkToInsert } from "./repo";
import type { RerankProvider } from "./rerank";
import { currentEmbeddingDim, ensureVectorTable, migrateKb, vectorAvailable } from "./schema";
import {
  compactKnowledgeKey,
  knowledgeLookupQuery,
  knowledgeRoute,
  knowledgeTitleLookupKey
} from "../retrieval/plan";
import type { KnowledgeCapabilities, KnowledgeDocument, KnowledgeSearchHit, SearchTrace } from "./types";

export const MAX_TEXT_CHARS = 2_000_000;
const MAX_CHUNKS_PER_DOC = 2000;
const SUMMARIZE_CHUNK_LIMIT = 40;

export type KnowledgeSearchMode = "summarize" | "lookup";

export type KnowledgeSearchOpts = {
  collectionIds?: string[];
  topK?: number;
  mode?: KnowledgeSearchMode;
};

function contentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export interface IngestResult {
  doc: KnowledgeDocument;
  action: "created" | "updated" | "skipped";
}

function isRetryable(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  const statusMatch = /failed: (\d{3})/.exec(msg);
  if (statusMatch) {
    const status = Number(statusMatch[1]);
    return status === 429 || status >= 500;
  }
  return /timeout|abort|ECONN|ENOTFOUND|fetch failed|network/i.test(msg);
}

function embedText(title: string, seg: ChunkSeg): string {
  const prefix = seg.headingPath.length > 0 ? `${title}｜${seg.headingPath.join(" > ")}` : title;
  return `《${prefix}》\n\n${seg.text}`;
}

export class KnowledgeService {
  private readonly repo: KnowledgeRepo;
  private draining = false;
  private drainDone: Promise<void> = Promise.resolve();

  constructor(
    private readonly db: DatabaseSync,
    private readonly embedding: EmbeddingProvider,
    private settings: KnowledgeSettings,
    private readonly rerank?: RerankProvider,
    private readonly rewriteQueryFn?: (query: string, mode: "rewrite" | "multi") => Promise<string[]>
  ) {
    migrateKb(db);
    this.repo = new KnowledgeRepo(db);
    // 崩溃前处于 running 的 job 回退为 pending；真正的恢复在 applySettings（拿到真实配置）后触发。
    this.repo.resetRunningJobsToPending();
  }

  applySettings(settings: KnowledgeSettings): void {
    this.settings = settings;
    // 首次拿到真实配置后启动队列，恢复上次未完成的入库任务。
    this.kickDrain();
  }

  /** 等待当前所有待处理 job 处理完毕（测试与关机前调用）。 */
  async flushQueue(): Promise<void> {
    this.kickDrain();
    await this.drainDone;
    if (this.repo.countPendingJobs() > 0) {
      await this.flushQueue();
    }
  }

  capabilities(): KnowledgeCapabilities {
    return {
      vectorAvailable: vectorAvailable(this.db),
      embeddingModel: this.embedding.modelKey(),
      embeddingDim: currentEmbeddingDim(this.db),
      pendingJobs: this.repo.countPendingJobs()
    };
  }

  isEnabled(): boolean {
    return this.settings.enabled;
  }

  contextBudgetChars(): number {
    return this.settings.search.contextBudgetChars;
  }

  listCollections() {
    return this.repo.listCollections();
  }

  createCollection(name: string, description = "") {
    return this.repo.createCollection(name, description);
  }

  patchCollection(id: string, patch: { name?: string; description?: string; enabled?: boolean }) {
    return this.repo.patchCollection(id, patch);
  }

  deleteCollection(id: string) {
    return this.repo.deleteCollection(id);
  }

  listDocuments(collectionId: string) {
    return this.repo.listDocuments(collectionId);
  }

  async listCatalog(): Promise<
    Array<{ title: string; collectionName: string; sourceName: string; chunkCount: number }>
  > {
    const collections = await this.repo.listCollections();
    const names = new Map(collections.map((item) => [item.id, item.name]));
    const docs = await this.repo.listReadyDocuments();
    return docs.map((doc) => ({
      title: doc.title,
      collectionName: names.get(doc.collectionId) ?? "",
      sourceName: doc.sourceName,
      chunkCount: doc.chunkCount
    }));
  }

  getDocument(id: string) {
    return this.repo.getDocument(id);
  }

  deleteDocument(id: string) {
    return this.repo.deleteDocument(id);
  }

  async setDocumentDisabled(id: string, disabled: boolean): Promise<boolean> {
    return this.repo.setDocumentDisabled(id, disabled);
  }

  listChunks(documentId: string, offset = 0, limit = 50) {
    return this.repo.listChunks(documentId, offset, limit);
  }

  async ingestDocument(input: {
    collectionId: string;
    title: string;
    sourceName: string;
    mime: string;
    text: string;
  }): Promise<IngestResult> {
    const hash = contentHash(input.text);
    const sizeBytes = Buffer.byteLength(input.text, "utf8");

    const existing = input.sourceName
      ? await this.repo.findBySourceName(input.collectionId, input.sourceName)
      : await this.repo.findByContentHash(input.collectionId, hash);

    if (existing) {
      if (existing.contentHash === hash) {
        const doc = await this.repo.getDocument(existing.id);
        return { doc: doc as KnowledgeDocument, action: "skipped" };
      }
      if (input.sourceName) {
        await this.repo.deleteChunksByDocument(existing.id);
        await this.repo.updateDocumentForReingest(existing.id, input.text, hash, sizeBytes);
        await this.repo.enqueueJob(existing.id);
        this.kickDrain();
        const doc = await this.repo.getDocument(existing.id);
        return { doc: doc as KnowledgeDocument, action: "updated" };
      }
    }

    const doc = await this.repo.createDocument({
      collectionId: input.collectionId,
      title: input.title,
      sourceName: input.sourceName,
      mime: input.mime,
      sizeBytes,
      contentHash: hash,
      sourceText: input.text
    });
    await this.repo.enqueueJob(doc.id);
    this.kickDrain();
    return { doc, action: "created" };
  }

  async retryDocument(documentId: string): Promise<KnowledgeDocument | null> {
    const doc = await this.repo.getDocument(documentId);
    if (!doc) {
      return null;
    }
    const source = await this.repo.getDocumentSource(documentId);
    if (!source.trim()) {
      return null;
    }
    await this.repo.deleteChunksByDocument(documentId);
    await this.repo.updateDocumentForReingest(
      documentId,
      source,
      contentHash(source),
      Buffer.byteLength(source, "utf8")
    );
    await this.repo.requeueJob(documentId);
    this.kickDrain();
    return doc;
  }

  listJobs(opts?: { status?: "pending" | "running" | "done" | "failed"; limit?: number }) {
    return this.repo.listJobs(opts);
  }

  pendingJobs(): number {
    return this.repo.countPendingJobs();
  }

  private kickDrain(): void {
    if (this.draining) {
      return;
    }
    this.draining = true;
    this.drainDone = this.runDrain().finally(() => {
      this.draining = false;
    });
  }

  private async runDrain(): Promise<void> {
    let job = this.repo.claimNextJob();
    while (job !== null) {
      try {
        await this.processJob(job);
      } catch (error) {
        await this.repo.failJob(job.id, error instanceof Error ? error.message : "处理失败");
      }
      job = this.repo.claimNextJob();
    }
  }

  private async processJob(job: { id: string; documentId: string; kind: string; attempt: number }): Promise<void> {
    const doc = await this.repo.getDocument(job.documentId);
    if (!doc) {
      // 文档已被删除，丢弃该 job。
      await this.repo.completeJob(job.id);
      return;
    }
    const source = await this.repo.getDocumentSource(job.documentId);
    if (!source.trim()) {
      await this.repo.completeJob(job.id);
      return;
    }
    const ok = await this.runIngest(job.documentId, doc.collectionId, doc.title, source);
    if (ok) {
      await this.repo.completeJob(job.id);
    } else {
      const failed = await this.repo.getDocument(job.documentId);
      await this.repo.failJob(job.id, failed?.error ?? "入库失败");
    }
  }

  private async embedWithRetry(texts: string[]): Promise<number[][]> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.embedding.embed(texts);
      } catch (error) {
        lastError = error;
        if (!isRetryable(error)) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000 * 3 ** attempt));
      }
    }
    throw lastError;
  }

  private async runIngest(documentId: string, collectionId: string, title: string, text: string): Promise<boolean> {
    try {
      if (text.length > MAX_TEXT_CHARS) {
        throw new Error(`文本超过上限 ${MAX_TEXT_CHARS} 字符`);
      }
      // 幂等：重跑（含崩溃后恢复）前清理可能残留的旧分块。
      await this.repo.deleteChunksByDocument(documentId);
      await this.repo.updateDocumentStatus(documentId, "chunking");
      const segs = chunkDocument(text);
      if (segs.length === 0) {
        throw new Error("未提取到文本");
      }
      if (segs.length > MAX_CHUNKS_PER_DOC) {
        throw new Error(`分块超过上限 ${MAX_CHUNKS_PER_DOC}`);
      }
      await this.repo.updateDocumentStatus(documentId, "embedding");
      const inputs = segs.map((seg) => embedText(title, seg));
      const vectors = await this.embedWithRetry(inputs);
      if (vectors.length !== segs.length || vectors.some((v) => v.length === 0)) {
        throw new Error("嵌入结果不完整");
      }
      const dim = vectors[0].length;
      const oldDim = currentEmbeddingDim(this.db);
      ensureVectorTable(this.db, dim);
      const toInsert: ChunkToInsert[] = segs.map((seg, index) => ({
        text: seg.text,
        headingPath: seg.headingPath,
        embedding: vectors[index]
      }));
      await this.repo.insertChunks(documentId, collectionId, toInsert);
      await this.repo.updateDocumentStatus(documentId, "ready");
      if (oldDim > 0 && oldDim !== dim) {
        // 嵌入维度变化（换了模型）：vec 表已重建为空，立即重嵌既有文档，避免语义检索静默失效。
        await this.reindexAfterDimChange(dim);
      }
      return true;
    } catch (error) {
      await this.repo.updateDocumentStatus(documentId, "failed", error instanceof Error ? error.message : "入库失败");
      return false;
    }
  }

  private async reindexAfterDimChange(dim: number): Promise<void> {
    try {
      await this.reindexAll();
    } catch (error) {
      console.error(
        JSON.stringify({
          src: "hoshi.kb",
          phase: "reindex_after_dim_change",
          dim,
          ok: false,
          message: error instanceof Error ? error.message : "重建索引失败"
        })
      );
    }
  }

  async search(query: string, opts?: KnowledgeSearchOpts): Promise<KnowledgeSearchHit[]> {
    return (await this.searchInternal(query, opts)).hits;
  }

  async searchWithTrace(
    query: string,
    opts?: KnowledgeSearchOpts
  ): Promise<{ hits: KnowledgeSearchHit[]; trace: SearchTrace }> {
    return this.searchInternal(query, opts);
  }

  private async searchInternal(
    query: string,
    opts?: KnowledgeSearchOpts
  ): Promise<{ hits: KnowledgeSearchHit[]; trace: SearchTrace }> {
    const totalStart = Date.now();
    const emptyTrace = (q: string): SearchTrace => ({
      query: q,
      vectorHits: [],
      keywordHits: [],
      fusedHits: [],
      finalHits: [],
      reranked: false,
      latencyMs: { embed: 0, vector: 0, keyword: 0, fuse: 0, rerank: 0, total: 0 }
    });

    if (!this.settings.enabled) {
      const trace = emptyTrace(query);
      trace.latencyMs.total = Date.now() - totalStart;
      return { hits: [], trace };
    }
    const trimmed = query.trim();
    if (!trimmed) {
      const trace = emptyTrace(query);
      trace.latencyMs.total = Date.now() - totalStart;
      return { hits: [], trace };
    }
    const topK = Math.max(1, Math.min(opts?.topK ?? this.settings.search.topK, 50));
    const collectionIds = opts?.collectionIds;
    const routed = knowledgeRoute(trimmed);
    const recallMode: KnowledgeSearchMode =
      opts?.mode ?? (routed.kind === "summarize" ? "summarize" : "lookup");
    const noteName = knowledgeTitleLookupKey(trimmed);
    let scopedDocumentId: string | undefined;
    if (noteName) {
      const docs = await this.repo.listReadyDocuments(collectionIds);
      const key = compactKnowledgeKey(noteName);
      const matched = docs.find((doc) => {
        const titleKey = compactKnowledgeKey(doc.title);
        if (!titleKey || !key) {
          return false;
        }
        return titleKey.includes(key) || (key.includes(titleKey) && titleKey.length >= 3);
      });
      if (matched && recallMode === "summarize") {
        const hits = await this.repo.listDocumentHits(matched.id, SUMMARIZE_CHUNK_LIMIT);
        const trace = emptyTrace(trimmed);
        trace.finalHits = hits.map((hit) => ({
          chunkId: hit.chunkId,
          score: hit.score,
          text: hit.text.slice(0, 120)
        }));
        trace.latencyMs.total = Date.now() - totalStart;
        return { hits, trace };
      }
      if (matched) {
        scopedDocumentId = matched.id;
      }
    }
    const searchText = scopedDocumentId ? knowledgeLookupQuery(trimmed) : trimmed;
    const fetchK = Math.max(topK * 3, 20);

    const rewriteMode = this.settings.search.queryRewrite ?? "off";
    let queries: string[] = [searchText];
    if (rewriteMode !== "off" && this.rewriteQueryFn && !scopedDocumentId) {
      try {
        const rewritten = await this.rewriteQueryFn(searchText, rewriteMode);
        if (rewritten.length > 0) {
          queries = rewritten;
        }
      } catch {
        queries = [searchText];
      }
    }

    // 对每个 query 检索并融合（RRF 分数跨 query 累加）
    const merged = new Map<string, { hit: KnowledgeSearchHit; score: number }>();
    let firstVectorHits: KnowledgeSearchHit[] = [];
    let firstKeywordHits: KnowledgeSearchHit[] = [];
    let embedMs = 0;
    let vectorMs = 0;
    let keywordMs = 0;
    let fuseMs = 0;

    for (let qi = 0; qi < queries.length; qi += 1) {
      const q = queries[qi];

      const embedStart = Date.now();
      const [vec] = await this.embedding.embed([q]);
      embedMs += Date.now() - embedStart;

      const vectorStart = Date.now();
      const vectorHits =
        vec && vec.length > 0
          ? await this.repo.searchVector(vec, {
              topK: fetchK,
              minScore: this.settings.search.minScore,
              collectionIds,
              documentId: scopedDocumentId
            })
          : [];
      vectorMs += Date.now() - vectorStart;

      const keywordStart = Date.now();
      const keywordHits = await this.repo.searchKeyword(q, {
        topK: fetchK,
        collectionIds,
        documentId: scopedDocumentId
      });
      keywordMs += Date.now() - keywordStart;

      const fuseStart = Date.now();
      const addRanked = (hits: KnowledgeSearchHit[]): void => {
        hits.forEach((hit, index) => {
          const contribution = 1 / (60 + index + 1);
          const existing = merged.get(hit.chunkId);
          if (existing) {
            existing.score += contribution;
          } else {
            merged.set(hit.chunkId, { hit, score: contribution });
          }
        });
      };
      if (scopedDocumentId) {
        addRanked(keywordHits);
        addRanked(vectorHits);
      } else {
        addRanked(vectorHits);
        addRanked(keywordHits);
      }
      fuseMs += Date.now() - fuseStart;

      if (qi === 0) {
        firstVectorHits = vectorHits;
        firstKeywordHits = keywordHits;
      }
    }

    const fused = [...merged.values()].sort((a, b) => b.score - a.score);
    const candidates = fused.slice(0, Math.max(topK * 4, 20)).map((entry) => entry.hit);
    let finalHits = candidates.slice(0, topK);
    let reranked = false;
    let rerankMs = 0;

    if (this.settings.rerank.enabled && this.rerank && candidates.length > topK) {
      const rerankStart = Date.now();
      try {
        const ranked = await this.rerank.rerank(
          searchText,
          candidates.map((hit) => ({ id: hit.chunkId, text: hit.text }))
        );
        const scoreMap = new Map(ranked.map((item) => [item.id, item.score]));
        finalHits = candidates
          .filter((hit) => scoreMap.has(hit.chunkId))
          .map((hit) => ({ ...hit, score: scoreMap.get(hit.chunkId) ?? 0 }))
          .sort((a, b) => b.score - a.score)
          .slice(0, topK);
        reranked = true;
      } catch (error) {
        console.error(
          JSON.stringify({
            src: "hoshi.kb",
            phase: "rerank",
            ok: false,
            message: error instanceof Error ? error.message : "rerank failed"
          })
        );
      }
      rerankMs = Date.now() - rerankStart;
    }

    const toTrace = (hit: KnowledgeSearchHit): { chunkId: string; score: number; text: string } => ({
      chunkId: hit.chunkId,
      score: hit.score,
      text: hit.text.slice(0, 120)
    });
    const trace: SearchTrace = {
      query: trimmed,
      ...(queries.length > 1 ? { queries } : {}),
      vectorHits: firstVectorHits.slice(0, 10).map(toTrace),
      keywordHits: firstKeywordHits.slice(0, 10).map(toTrace),
      fusedHits: fused.slice(0, 10).map((entry) => toTrace(entry.hit)),
      finalHits: finalHits.map(toTrace),
      reranked,
      latencyMs: {
        embed: embedMs,
        vector: vectorMs,
        keyword: keywordMs,
        fuse: fuseMs,
        rerank: rerankMs,
        total: Date.now() - totalStart
      }
    };
    return { hits: finalHits, trace };
  }

  async expandHitContext(hit: KnowledgeSearchHit, range = 1): Promise<string> {
    const neighbors = await this.repo.getNeighbors(hit.docId, hit.seq, range);
    return neighbors.join("\n\n");
  }

  async reindexAll(): Promise<{ chunks: number }> {
    const chunks = await this.repo.listReindexableChunks();
    if (chunks.length === 0) {
      return { chunks: 0 };
    }
    console.error(JSON.stringify({ src: "hoshi.kb", phase: "reindex", ok: true, chunks: chunks.length }));
    const inputs = chunks.map((chunk) => embedText(chunk.title, { text: chunk.text, headingPath: chunk.headingPath }));
    const vectors = await this.embedWithRetry(inputs);
    if (vectors.length !== chunks.length || vectors.some((v) => v.length === 0)) {
      throw new Error("嵌入结果不完整");
    }
    const dim = vectors[0].length;
    ensureVectorTable(this.db, dim);
    const entries = chunks.map((chunk, index) => ({
      chunkId: chunk.chunkId,
      collectionId: chunk.collectionId,
      embedding: vectors[index]
    }));
    await this.repo.replaceAllVectors(entries);
    return { chunks: chunks.length };
  }

  getChunkContext(chunkId: string) {
    return this.repo.getChunkContext(chunkId);
  }

  async updateChunk(chunkId: string, text: string): Promise<boolean> {
    const trimmed = text.trim();
    if (!trimmed) {
      return false;
    }
    const context = await this.repo.getChunkContext(chunkId);
    if (!context) {
      return false;
    }
    const [vec] = await this.embedding.embed([
      embedText(context.title, { text: trimmed, headingPath: context.headingPath })
    ]);
    if (!vec || vec.length === 0) {
      return false;
    }
    await this.repo.updateChunk(chunkId, context.collectionId, trimmed, context.headingPath, vec);
    return true;
  }
}
