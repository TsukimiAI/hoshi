import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { nowIso } from "../storage/db";
import {
  ensureVectorTable,
  tableExists,
  vectorAvailable
} from "./schema";
import { extractKnowledgeNoteName } from "../retrieval/plan";
import type {
  KnowledgeChunkItem,
  KnowledgeCollection,
  KnowledgeDocument,
  KnowledgeDocumentStatus,
  KnowledgeJob,
  KnowledgeJobStatus,
  KnowledgeSearchHit
} from "./types";

type ChunkSearchOpts = {
  topK: number;
  collectionIds?: string[];
  documentId?: string;
};

function appendChunkScope(
  sql: string,
  params: Array<string | number | Float32Array>,
  opts: { collectionIds?: string[]; documentId?: string }
): string {
  let next = sql;
  if (opts.collectionIds && opts.collectionIds.length > 0) {
    const placeholders = opts.collectionIds.map(() => "?").join(",");
    next += ` AND d.collection_id IN (${placeholders})`;
    params.push(...opts.collectionIds);
  }
  if (opts.documentId) {
    next += ` AND c.document_id = ?`;
    params.push(opts.documentId);
  }
  return next;
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function parseMeta(raw: unknown): { page?: number; headingPath?: string[] } {
  if (typeof raw !== "string" || !raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as { page?: number; headingPath?: string[] }) : {};
  } catch {
    return {};
  }
}

function mapCollection(row: Record<string, unknown>, documentCount = 0): KnowledgeCollection {
  return {
    id: String(row.id),
    name: String(row.name),
    description: String(row.description ?? ""),
    enabled: Number(row.enabled ?? 1) === 1,
    documentCount,
    createdAt: iso(row.created_at as Date | string),
    updatedAt: iso(row.updated_at as Date | string)
  };
}

function mapDocument(row: Record<string, unknown>, chunkCount = 0): KnowledgeDocument {
  return {
    id: String(row.id),
    collectionId: String(row.collection_id),
    title: String(row.title),
    sourceName: String(row.source_name ?? ""),
    mime: String(row.mime ?? ""),
    sizeBytes: Number(row.size_bytes ?? 0),
    status: row.status as KnowledgeDocumentStatus,
    error: String(row.error ?? ""),
    chunkCount,
    createdAt: iso(row.created_at as Date | string),
    updatedAt: iso(row.updated_at as Date | string)
  };
}

function mapChunk(row: Record<string, unknown>): KnowledgeChunkItem {
  return {
    id: String(row.id),
    documentId: String(row.document_id),
    seq: Number(row.seq ?? 0),
    text: String(row.text),
    meta: parseMeta(row.meta)
  };
}

function keywordSearchTerms(query: string): string[] {
  const name = extractKnowledgeNoteName(query);
  const terms = new Set<string>();
  const add = (raw: string) => {
    const text = raw.replace(/\s+/g, " ").trim();
    if (text.length >= 2) {
      terms.add(text);
    }
  };
  if (name) {
    add(name);
    add(name.replace(/([A-Za-z]+)(\d+)/g, "$1 $2"));
    return [...terms];
  }
  add(query.trim());
  for (const token of query.match(/[A-Za-z0-9]{2,}/g) ?? []) {
    add(token);
  }
  return [...terms];
}

export interface ChunkToInsert {
  text: string;
  headingPath: string[];
  embedding: number[];
}

export class KnowledgeRepo {
  constructor(private readonly db: DatabaseSync) {}

  // ---- collections ----

  async listCollections(): Promise<KnowledgeCollection[]> {
    const rows = this.db
      .prepare(
        `SELECT c.*, COUNT(d.id) AS document_count
         FROM kb_collections c
         LEFT JOIN kb_documents d ON d.collection_id = c.id
         GROUP BY c.id
         ORDER BY c.updated_at DESC`
      )
      .all() as unknown as Record<string, unknown>[];
    return rows.map((row) => mapCollection(row, Number(row.document_count ?? 0)));
  }

  async getCollection(id: string): Promise<KnowledgeCollection | null> {
    const row = this.db.prepare(`SELECT * FROM kb_collections WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? mapCollection(row) : null;
  }

  async createCollection(name: string, description = ""): Promise<KnowledgeCollection> {
    const id = randomUUID();
    const now = nowIso();
    const row = this.db
      .prepare(
        `INSERT INTO kb_collections (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?) RETURNING *`
      )
      .get(id, name.trim() || "未命名知识库", description, now, now) as Record<string, unknown>;
    return mapCollection(row);
  }

  async patchCollection(
    id: string,
    patch: { name?: string; description?: string; enabled?: boolean }
  ): Promise<KnowledgeCollection | null> {
    const sets: string[] = ["updated_at = ?"];
    const values: Array<string | number> = [nowIso()];
    if (patch.name !== undefined) {
      values.push(patch.name.trim() || "未命名知识库");
      sets.push("name = ?");
    }
    if (patch.description !== undefined) {
      values.push(patch.description);
      sets.push("description = ?");
    }
    if (patch.enabled !== undefined) {
      values.push(patch.enabled ? 1 : 0);
      sets.push("enabled = ?");
    }
    values.push(id);
    const row = this.db
      .prepare(`UPDATE kb_collections SET ${sets.join(", ")} WHERE id = ? RETURNING *`)
      .get(...values) as Record<string, unknown> | undefined;
    return row ? mapCollection(row) : null;
  }

  async deleteCollection(id: string): Promise<boolean> {
    const result = this.db.prepare(`DELETE FROM kb_collections WHERE id = ?`).run(id);
    return result.changes > 0;
  }

  // ---- documents ----

  async listDocuments(collectionId: string): Promise<KnowledgeDocument[]> {
    const rows = this.db
      .prepare(
        `SELECT d.*, COUNT(c.id) AS chunk_count
         FROM kb_documents d
         LEFT JOIN kb_chunks c ON c.document_id = d.id
         WHERE d.collection_id = ?
         GROUP BY d.id
         ORDER BY d.updated_at DESC`
      )
      .all(collectionId) as unknown as Record<string, unknown>[];
    return rows.map((row) => mapDocument(row, Number(row.chunk_count ?? 0)));
  }

  async listReadyDocuments(collectionIds?: string[]): Promise<KnowledgeDocument[]> {
    let sql = `
      SELECT d.*, COUNT(c.id) AS chunk_count
      FROM kb_documents d
      JOIN kb_collections col ON col.id = d.collection_id
      LEFT JOIN kb_chunks c ON c.document_id = d.id
      WHERE d.status = 'ready' AND col.enabled = 1`;
    const params: string[] = [];
    if (collectionIds && collectionIds.length > 0) {
      sql += ` AND d.collection_id IN (${collectionIds.map(() => "?").join(",")})`;
      params.push(...collectionIds);
    }
    sql += ` GROUP BY d.id ORDER BY d.updated_at DESC`;
    const rows = this.db.prepare(sql).all(...params) as unknown as Record<string, unknown>[];
    return rows.map((row) => mapDocument(row, Number(row.chunk_count ?? 0)));
  }

  async listDocumentHits(documentId: string, limit: number): Promise<KnowledgeSearchHit[]> {
    const safeLimit = Math.max(1, Math.min(limit, 50));
    const rows = this.db
      .prepare(
        `SELECT c.id AS chunk_id, c.text, c.seq, c.document_id, d.title, d.collection_id, col.name AS collection_name
         FROM kb_chunks c
         JOIN kb_documents d ON d.id = c.document_id
         JOIN kb_collections col ON col.id = d.collection_id
         WHERE c.document_id = ? AND d.status = 'ready' AND col.enabled = 1
         ORDER BY c.seq ASC
         LIMIT ?`
      )
      .all(documentId, safeLimit) as unknown as Record<string, unknown>[];
    return rows.map((row) => ({
      chunkId: String(row.chunk_id),
      docId: String(row.document_id),
      documentTitle: String(row.title),
      collectionId: String(row.collection_id),
      collectionName: String(row.collection_name ?? ""),
      seq: Number(row.seq ?? 0),
      text: String(row.text),
      score: 1
    }));
  }

  async getDocument(id: string): Promise<KnowledgeDocument | null> {
    const row = this.db.prepare(`SELECT * FROM kb_documents WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? mapDocument(row) : null;
  }

  async createDocument(input: {
    collectionId: string;
    title: string;
    sourceName: string;
    mime: string;
    sizeBytes: number;
    contentHash: string;
    sourceText: string;
  }): Promise<KnowledgeDocument> {
    const id = randomUUID();
    const now = nowIso();
    const row = this.db
      .prepare(
        `INSERT INTO kb_documents (id, collection_id, title, source_name, mime, size_bytes, content_hash, source_text, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'parsing', ?, ?) RETURNING *`
      )
      .get(
        id,
        input.collectionId,
        input.title,
        input.sourceName,
        input.mime,
        input.sizeBytes,
        input.contentHash,
        input.sourceText,
        now,
        now
      ) as Record<string, unknown>;
    return mapDocument(row);
  }

  async updateDocumentStatus(id: string, status: KnowledgeDocumentStatus, error = ""): Promise<void> {
    this.db
      .prepare(`UPDATE kb_documents SET status = ?, error = ?, updated_at = ? WHERE id = ?`)
      .run(status, error, nowIso(), id);
  }

  async setDocumentDisabled(id: string, disabled: boolean): Promise<boolean> {
    const result = this.db
      .prepare(`UPDATE kb_documents SET status = ?, error = '', updated_at = ? WHERE id = ?`)
      .run(disabled ? "disabled" : "ready", nowIso(), id);
    return result.changes > 0;
  }

  async getDocumentSource(id: string): Promise<string> {
    const row = this.db.prepare(`SELECT source_text FROM kb_documents WHERE id = ?`).get(id) as
      | { source_text?: string }
      | undefined;
    return row?.source_text ?? "";
  }

  async findBySourceName(
    collectionId: string,
    sourceName: string
  ): Promise<{ id: string; contentHash: string } | null> {
    if (!sourceName) {
      return null;
    }
    const row = this.db
      .prepare(`SELECT id, content_hash FROM kb_documents WHERE collection_id = ? AND source_name = ?`)
      .get(collectionId, sourceName) as { id?: string; content_hash?: string } | undefined;
    return row?.id ? { id: String(row.id), contentHash: String(row.content_hash ?? "") } : null;
  }

  async findByContentHash(
    collectionId: string,
    contentHash: string
  ): Promise<{ id: string; contentHash: string } | null> {
    const row = this.db
      .prepare(`SELECT id, content_hash FROM kb_documents WHERE collection_id = ? AND content_hash = ?`)
      .get(collectionId, contentHash) as { id?: string; content_hash?: string } | undefined;
    return row?.id ? { id: String(row.id), contentHash: String(row.content_hash ?? "") } : null;
  }

  async deleteChunksByDocument(documentId: string): Promise<void> {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (tableExists(this.db, "kb_vec")) {
        this.db
          .prepare(`DELETE FROM kb_vec WHERE chunk_id IN (SELECT id FROM kb_chunks WHERE document_id = ?)`)
          .run(documentId);
      }
      if (tableExists(this.db, "kb_fts")) {
        this.db
          .prepare(`DELETE FROM kb_fts WHERE chunk_id IN (SELECT id FROM kb_chunks WHERE document_id = ?)`)
          .run(documentId);
      }
      this.db.prepare(`DELETE FROM kb_chunks WHERE document_id = ?`).run(documentId);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  async updateDocumentForReingest(
    id: string,
    sourceText: string,
    contentHash: string,
    sizeBytes: number
  ): Promise<void> {
    this.db
      .prepare(
        `UPDATE kb_documents SET source_text = ?, content_hash = ?, size_bytes = ?, status = 'parsing', error = '', updated_at = ? WHERE id = ?`
      )
      .run(sourceText, contentHash, sizeBytes, nowIso(), id);
  }

  async deleteDocument(id: string): Promise<boolean> {
    await this.deleteChunksByDocument(id);
    const result = this.db.prepare(`DELETE FROM kb_documents WHERE id = ?`).run(id);
    return result.changes > 0;
  }

  // ---- jobs ----

  enqueueJob(documentId: string, kind = "ingest"): string {
    const id = randomUUID();
    const now = nowIso();
    this.db
      .prepare(
        `INSERT INTO kb_jobs (id, document_id, kind, status, attempt, created_at, updated_at)
         VALUES (?, ?, ?, 'pending', 0, ?, ?)`
      )
      .run(id, documentId, kind, now, now);
    return id;
  }

  claimNextJob(): { id: string; documentId: string; kind: string; attempt: number } | null {
    const row = this.db
      .prepare(
        `UPDATE kb_jobs SET status = 'running', attempt = attempt + 1, error = '', updated_at = ?
         WHERE id = (SELECT id FROM kb_jobs WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1)
         RETURNING id, document_id, kind, attempt`
      )
      .get(nowIso()) as Record<string, unknown> | undefined;
    if (!row) {
      return null;
    }
    return {
      id: String(row.id),
      documentId: String(row.document_id),
      kind: String(row.kind),
      attempt: Number(row.attempt)
    };
  }

  completeJob(id: string): void {
    this.db.prepare(`UPDATE kb_jobs SET status = 'done', error = '', updated_at = ? WHERE id = ?`).run(nowIso(), id);
  }

  failJob(id: string, error: string): void {
    this.db.prepare(`UPDATE kb_jobs SET status = 'failed', error = ?, updated_at = ? WHERE id = ?`).run(error, nowIso(), id);
  }

  /** 把该文档一条失败的 job 重置为待处理；若没有失败 job 则新建一条。 */
  requeueJob(documentId: string): void {
    const reset = this.db
      .prepare(`UPDATE kb_jobs SET status = 'pending', error = '', updated_at = ? WHERE document_id = ? AND status = 'failed'`)
      .run(nowIso(), documentId);
    if (Number(reset.changes) === 0) {
      this.enqueueJob(documentId);
    }
  }

  /** 启动时调用：崩溃前处于 running 的 job 回退为 pending，等待重新处理。 */
  resetRunningJobsToPending(): number {
    const result = this.db
      .prepare(`UPDATE kb_jobs SET status = 'pending', error = '', updated_at = ? WHERE status = 'running'`)
      .run(nowIso());
    return Number(result.changes);
  }

  countPendingJobs(): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS n FROM kb_jobs WHERE status IN ('pending','running')`)
      .get() as { n?: number } | undefined;
    return Number(row?.n ?? 0);
  }

  listJobs(opts: { status?: KnowledgeJobStatus; limit?: number } = {}): KnowledgeJob[] {
    const safeLimit = Math.max(1, Math.min(opts.limit ?? 100, 500));
    const rows = opts.status
      ? (this.db
          .prepare(`SELECT * FROM kb_jobs WHERE status = ? ORDER BY created_at DESC LIMIT ?`)
          .all(opts.status, safeLimit) as unknown as Record<string, unknown>[])
      : (this.db
          .prepare(`SELECT * FROM kb_jobs ORDER BY created_at DESC LIMIT ?`)
          .all(safeLimit) as unknown as Record<string, unknown>[]);
    return rows.map((row) => ({
      id: String(row.id),
      documentId: String(row.document_id),
      kind: String(row.kind),
      status: row.status as KnowledgeJobStatus,
      attempt: Number(row.attempt ?? 0),
      error: String(row.error ?? ""),
      createdAt: iso(row.created_at as Date | string),
      updatedAt: iso(row.updated_at as Date | string)
    }));
  }

  // ---- chunks ----

  async insertChunks(documentId: string, collectionId: string, chunks: ChunkToInsert[]): Promise<void> {
    if (chunks.length === 0) {
      return;
    }
    const insertChunk = this.db.prepare(
      `INSERT INTO kb_chunks (id, document_id, seq, text, tokens, meta, content_hash) VALUES (?, ?, ?, ?, ?, ?, '')`
    );
    const insertVec = this.db.prepare(
      `INSERT INTO kb_vec (chunk_id, collection_id, embedding) VALUES (?, ?, ?)`
    );
    const insertFts = this.db.prepare(`INSERT INTO kb_fts (chunk_id, text) VALUES (?, ?)`);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      chunks.forEach((chunk, index) => {
        const id = randomUUID();
        const meta = JSON.stringify({ headingPath: chunk.headingPath });
        insertChunk.run(id, documentId, index, chunk.text, Math.ceil(chunk.text.length / 1.8), meta);
        insertVec.run(id, collectionId, new Float32Array(chunk.embedding));
        insertFts.run(id, chunk.text);
      });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  async listChunks(documentId: string, offset = 0, limit = 50): Promise<{ chunks: KnowledgeChunkItem[]; total: number }> {
    const safeOffset = Math.max(0, Math.floor(offset));
    const safeLimit = Math.max(1, Math.min(limit, 200));
    const totalRow = this.db
      .prepare(`SELECT COUNT(*) AS n FROM kb_chunks WHERE document_id = ?`)
      .get(documentId) as { n?: number } | undefined;
    const rows = this.db
      .prepare(`SELECT * FROM kb_chunks WHERE document_id = ? ORDER BY seq ASC LIMIT ? OFFSET ?`)
      .all(documentId, safeLimit, safeOffset) as unknown as Record<string, unknown>[];
    return { chunks: rows.map(mapChunk), total: Number(totalRow?.n ?? 0) };
  }

  async searchVector(
    embedding: number[],
    opts: { topK: number; minScore: number; collectionIds?: string[]; documentId?: string }
  ): Promise<KnowledgeSearchHit[]> {
    if (!vectorAvailable(this.db)) {
      return [];
    }
    ensureVectorTableSafe(this.db, embedding.length);
    const safeTopK = Math.max(1, Math.min(opts.topK, 50));
    const fetchK = Math.max(safeTopK * 3, 20);
    let sql = `
      SELECT v.chunk_id, v.distance, c.text, c.seq, c.document_id, d.title, d.collection_id, col.name AS collection_name
      FROM (
        SELECT chunk_id, distance FROM kb_vec WHERE embedding MATCH ? ORDER BY distance LIMIT ?
      ) v
      JOIN kb_chunks c ON c.id = v.chunk_id
      JOIN kb_documents d ON d.id = c.document_id
      JOIN kb_collections col ON col.id = d.collection_id
      WHERE d.status = 'ready' AND col.enabled = 1`;
    const params: Array<string | number | Float32Array> = [new Float32Array(embedding), fetchK];
    sql = appendChunkScope(sql, params, opts);
    const rows = this.db.prepare(sql).all(...params) as unknown as Record<string, unknown>[];
    const hits = rows.map((row) => ({
      chunkId: String(row.chunk_id),
      docId: String(row.document_id),
      documentTitle: String(row.title),
      collectionId: String(row.collection_id),
      collectionName: String(row.collection_name ?? ""),
      seq: Number(row.seq ?? 0),
      text: String(row.text),
      score: 1 - Number(row.distance)
    }));
    return hits.slice(0, safeTopK).filter((hit) => hit.score >= opts.minScore);
  }

  async searchKeyword(query: string, opts: ChunkSearchOpts): Promise<KnowledgeSearchHit[]> {
    const terms = keywordSearchTerms(query);
    if (terms.length === 0) {
      return [];
    }
    const merged = new Map<string, KnowledgeSearchHit>();
    for (const term of terms) {
      const hits =
        term.replace(/\s+/g, "").length <= 2
          ? await this.searchKeywordLike(term, opts)
          : await this.searchKeywordFts(term, opts);
      const extra =
        hits.length === 0 && term.replace(/\s+/g, "").length > 2
          ? await this.searchKeywordLike(term, opts)
          : [];
      for (const hit of [...hits, ...extra]) {
        if (!merged.has(hit.chunkId)) {
          merged.set(hit.chunkId, hit);
        }
      }
    }
    return [...merged.values()].slice(0, Math.max(1, Math.min(opts.topK, 50)));
  }

  private async searchKeywordFts(query: string, opts: ChunkSearchOpts): Promise<KnowledgeSearchHit[]> {
    const safeTopK = Math.max(1, Math.min(opts.topK, 50));
    const escaped = query.replace(/"/g, '""');
    const ftsQuery = `"${escaped}"`;
    let sql = `
      SELECT kb_fts.chunk_id, c.text, c.seq, c.document_id, d.title, d.collection_id, col.name AS collection_name
      FROM kb_fts
      JOIN kb_chunks c ON c.id = kb_fts.chunk_id
      JOIN kb_documents d ON d.id = c.document_id
      JOIN kb_collections col ON col.id = d.collection_id
      WHERE kb_fts MATCH ? AND d.status = 'ready' AND col.enabled = 1`;
    const params: Array<string | number> = [ftsQuery];
    sql = appendChunkScope(sql, params, opts);
    sql += ` ORDER BY bm25(kb_fts) LIMIT ?`;
    params.push(safeTopK);
    const rows = this.db.prepare(sql).all(...params) as unknown as Record<string, unknown>[];
    return rows.map((row) => ({
      chunkId: String(row.chunk_id),
      docId: String(row.document_id),
      documentTitle: String(row.title),
      collectionId: String(row.collection_id),
      collectionName: String(row.collection_name ?? ""),
      seq: Number(row.seq ?? 0),
      text: String(row.text),
      score: 0
    }));
  }

  private async searchKeywordLike(query: string, opts: ChunkSearchOpts): Promise<KnowledgeSearchHit[]> {
    const safeTopK = Math.max(1, Math.min(opts.topK, 50));
    const escaped = query.replace(/[%_\\]/g, (ch) => `\\${ch}`);
    const pattern = `%${escaped}%`;
    let sql = `
      SELECT c.id AS chunk_id, c.text, c.seq, c.document_id, d.title, d.collection_id, col.name AS collection_name
      FROM kb_chunks c
      JOIN kb_documents d ON d.id = c.document_id
      JOIN kb_collections col ON col.id = d.collection_id
      WHERE (c.text LIKE ? ESCAPE '\\' OR d.title LIKE ? ESCAPE '\\') AND d.status = 'ready' AND col.enabled = 1`;
    const params: Array<string | number> = [pattern, pattern];
    sql = appendChunkScope(sql, params, opts);
    sql += ` LIMIT ?`;
    params.push(safeTopK);
    const rows = this.db.prepare(sql).all(...params) as unknown as Record<string, unknown>[];
    return rows.map((row) => ({
      chunkId: String(row.chunk_id),
      docId: String(row.document_id),
      documentTitle: String(row.title),
      collectionId: String(row.collection_id),
      collectionName: String(row.collection_name ?? ""),
      seq: Number(row.seq ?? 0),
      text: String(row.text),
      score: 0
    }));
  }

  async getNeighbors(documentId: string, seq: number, range: number): Promise<string[]> {
    const rows = this.db
      .prepare(
        `SELECT text FROM kb_chunks WHERE document_id = ? AND seq >= ? AND seq <= ? ORDER BY seq`
      )
      .all(documentId, seq - range, seq + range) as unknown as Array<{ text: string }>;
    return rows.map((row) => row.text);
  }

  async listReindexableChunks(): Promise<
    Array<{ chunkId: string; collectionId: string; title: string; text: string; headingPath: string[] }>
  > {
    const rows = this.db
      .prepare(
        `SELECT c.id AS chunk_id, d.collection_id, d.title, c.text, c.meta
         FROM kb_chunks c
         JOIN kb_documents d ON d.id = c.document_id
         WHERE d.status = 'ready'`
      )
      .all() as unknown as Record<string, unknown>[];
    return rows.map((row) => ({
      chunkId: String(row.chunk_id),
      collectionId: String(row.collection_id),
      title: String(row.title),
      text: String(row.text),
      headingPath: parseMeta(row.meta).headingPath ?? []
    }));
  }

  /**
   * 全量替换向量：先清空 kb_vec 再插入，使「重建索引」幂等（健康库上重复执行也不会 UNIQUE 冲突）。
   * 仅应被 reindexAll 调用——它重嵌全部 ready 文档，语义上就是整体重建。
   */
  async replaceAllVectors(entries: Array<{ chunkId: string; collectionId: string; embedding: number[] }>): Promise<void> {
    if (entries.length === 0) {
      return;
    }
    const stmt = this.db.prepare(`INSERT INTO kb_vec (chunk_id, collection_id, embedding) VALUES (?, ?, ?)`);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare(`DELETE FROM kb_vec`).run();
      for (const entry of entries) {
        stmt.run(entry.chunkId, entry.collectionId, new Float32Array(entry.embedding));
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  async getChunkContext(
    chunkId: string
  ): Promise<{ documentId: string; collectionId: string; title: string; text: string; headingPath: string[] } | null> {
    const row = this.db
      .prepare(
        `SELECT c.text, c.meta, d.id AS document_id, d.collection_id, d.title
         FROM kb_chunks c
         JOIN kb_documents d ON d.id = c.document_id
         WHERE c.id = ?`
      )
      .get(chunkId) as Record<string, unknown> | undefined;
    if (!row) {
      return null;
    }
    return {
      documentId: String(row.document_id),
      collectionId: String(row.collection_id),
      title: String(row.title),
      text: String(row.text),
      headingPath: parseMeta(row.meta).headingPath ?? []
    };
  }

  async updateChunk(
    chunkId: string,
    collectionId: string,
    text: string,
    headingPath: string[],
    embedding: number[]
  ): Promise<void> {
    const meta = JSON.stringify({ headingPath });
    const tokens = Math.ceil(text.length / 1.8);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(`UPDATE kb_chunks SET text = ?, tokens = ?, meta = ?, content_hash = '' WHERE id = ?`)
        .run(text, tokens, meta, chunkId);
      this.db.prepare(`DELETE FROM kb_vec WHERE chunk_id = ?`).run(chunkId);
      this.db
        .prepare(`INSERT INTO kb_vec (chunk_id, collection_id, embedding) VALUES (?, ?, ?)`)
        .run(chunkId, collectionId, new Float32Array(embedding));
      this.db.prepare(`DELETE FROM kb_fts WHERE chunk_id = ?`).run(chunkId);
      this.db.prepare(`INSERT INTO kb_fts (chunk_id, text) VALUES (?, ?)`).run(chunkId, text);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}

function ensureVectorTableSafe(db: DatabaseSync, dim: number): boolean {
  ensureVectorTable(db, dim);
  return true;
}
