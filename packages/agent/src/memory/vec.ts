import type { DatabaseSync } from "node:sqlite";
import { loadVecExtension, tableExists, vectorAvailable } from "../knowledge/schema";

export const MEMORY_VEC_TABLE = "memory_vec";
const STATE_TABLE = "memory_vec_state";

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) {
    return 0;
  }
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) {
    return 0;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function ensureMemoryVecReady(db: DatabaseSync): boolean {
  return loadVecExtension(db);
}

export function currentMemoryEmbeddingDim(db: DatabaseSync): number {
  if (!tableExists(db, STATE_TABLE)) {
    return 0;
  }
  const row = db.prepare(`SELECT dim FROM ${STATE_TABLE} WHERE id = 1`).get() as { dim?: number } | undefined;
  const n = Number(row?.dim ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function ensureMemoryVectorTable(db: DatabaseSync, dim: number): void {
  if (!vectorAvailable(db) && !loadVecExtension(db)) {
    throw new Error("向量扩展不可用");
  }
  const existing = currentMemoryEmbeddingDim(db);
  if (existing === dim && tableExists(db, MEMORY_VEC_TABLE)) {
    return;
  }
  if (tableExists(db, MEMORY_VEC_TABLE)) {
    db.exec(`DROP TABLE ${MEMORY_VEC_TABLE}`);
  }
  db.exec(
    `CREATE VIRTUAL TABLE ${MEMORY_VEC_TABLE} USING vec0(
       memory_id TEXT PRIMARY KEY,
       embedding float[${dim}] distance_metric=cosine
     )`
  );
  db.exec(`CREATE TABLE IF NOT EXISTS ${STATE_TABLE} (id INTEGER PRIMARY KEY CHECK (id = 1), dim INTEGER NOT NULL)`);
  db.prepare(`INSERT INTO ${STATE_TABLE} (id, dim) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET dim = excluded.dim`).run(
    dim
  );
}

export function upsertMemoryVector(db: DatabaseSync, memoryId: string, embedding: number[]): void {
  if (!vectorAvailable(db) && !loadVecExtension(db)) {
    return;
  }
  ensureMemoryVectorTable(db, embedding.length);
  db.prepare(`DELETE FROM ${MEMORY_VEC_TABLE} WHERE memory_id = ?`).run(memoryId);
  db.prepare(`INSERT INTO ${MEMORY_VEC_TABLE} (memory_id, embedding) VALUES (?, ?)`).run(
    memoryId,
    new Float32Array(embedding)
  );
}

export function deleteMemoryVector(db: DatabaseSync, memoryId: string): void {
  if (!tableExists(db, MEMORY_VEC_TABLE)) {
    return;
  }
  db.prepare(`DELETE FROM ${MEMORY_VEC_TABLE} WHERE memory_id = ?`).run(memoryId);
}

export function resetMemoryVectorTable(db: DatabaseSync, dim: number): void {
  if (tableExists(db, MEMORY_VEC_TABLE)) {
    db.exec(`DROP TABLE ${MEMORY_VEC_TABLE}`);
  }
  ensureMemoryVectorTable(db, dim);
}

export function searchMemoryVectors(
  db: DatabaseSync,
  embedding: number[],
  limit: number
): Array<{ id: string; score: number }> {
  if (!vectorAvailable(db) && !loadVecExtension(db)) {
    return [];
  }
  if (!tableExists(db, MEMORY_VEC_TABLE)) {
    return [];
  }
  const safeLimit = Math.max(1, Math.min(limit, 50));
  const rows = db
    .prepare(
      `SELECT memory_id, distance FROM ${MEMORY_VEC_TABLE} WHERE embedding MATCH ? ORDER BY distance LIMIT ?`
    )
    .all(new Float32Array(embedding), safeLimit) as unknown as Array<{ memory_id?: string; distance?: number }>;
  return rows.map((row) => ({
    id: String(row.memory_id ?? ""),
    score: 1 - Number(row.distance ?? 1)
  }));
}

