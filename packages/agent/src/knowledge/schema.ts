import type { DatabaseSync } from "node:sqlite";
import { getLoadablePath } from "sqlite-vec";
import { nowIso } from "../storage/db";

const vecLoaded = new WeakSet<DatabaseSync>();

export function loadVecExtension(db: DatabaseSync): boolean {
  if (vecLoaded.has(db)) {
    return true;
  }
  try {
    db.loadExtension(getLoadablePath());
    vecLoaded.add(db);
    return true;
  } catch (error) {
    console.error(
      JSON.stringify({
        src: "hoshi.kb",
        phase: "load_vec_extension",
        ok: false,
        message: error instanceof Error ? error.message : "sqlite-vec 加载失败"
      })
    );
    return false;
  }
}

const CORE_SCHEMA = `
CREATE TABLE IF NOT EXISTS kb_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS kb_collections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS kb_documents (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL REFERENCES kb_collections(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  source_name TEXT NOT NULL DEFAULT '',
  mime TEXT NOT NULL DEFAULT '',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  content_hash TEXT NOT NULL DEFAULT '',
  source_text TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'parsing'
    CHECK (status IN ('parsing','chunking','embedding','ready','failed','disabled')),
  error TEXT NOT NULL DEFAULT '',
  meta TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS kb_chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  text TEXT NOT NULL,
  tokens INTEGER NOT NULL DEFAULT 0,
  meta TEXT NOT NULL DEFAULT '{}',
  content_hash TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS kb_jobs (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'ingest',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','done','failed')),
  attempt INTEGER NOT NULL DEFAULT 0,
  error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_kb_documents_collection ON kb_documents(collection_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_kb_chunks_doc_seq ON kb_chunks(document_id, seq);
CREATE INDEX IF NOT EXISTS idx_kb_jobs_status ON kb_jobs(status, created_at ASC);
`;

export function tableExists(db: DatabaseSync, name: string): boolean {
  const row = db
    .prepare(`SELECT 1 AS x FROM sqlite_master WHERE type IN ('table','view') AND name = ?`)
    .get(name) as { x?: number } | undefined;
  return Boolean(row);
}

function metaGet(db: DatabaseSync, key: string): string | null {
  const row = db.prepare(`SELECT value FROM kb_meta WHERE key = ?`).get(key) as
    | { value?: string }
    | undefined;
  return row?.value ?? null;
}

function metaSet(db: DatabaseSync, key: string, value: string): void {
  db.prepare(
    `INSERT INTO kb_meta (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, value, nowIso());
}

export function migrateKb(db: DatabaseSync): void {
  const vecOk = loadVecExtension(db);
  db.exec(CORE_SCHEMA);
  metaSet(db, "vec_ext", vecOk ? "1" : "0");
  ensureColumn(db, "kb_documents", "source_text", "TEXT NOT NULL DEFAULT ''");
  if (!tableExists(db, "kb_fts")) {
    db.exec(`CREATE VIRTUAL TABLE kb_fts USING fts5(chunk_id UNINDEXED, text, tokenize='trigram')`);
  }
}

function ensureColumn(db: DatabaseSync, table: string, column: string, ddl: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as unknown as Array<{ name: string }>;
  if (!cols.some((entry) => entry.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

export function currentEmbeddingDim(db: DatabaseSync): number {
  const raw = metaGet(db, "embedding_dim");
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

// 维度一致则复用；不一致则重建 vec0 表（调用方负责全库重新嵌入）
export function ensureVectorTable(db: DatabaseSync, dim: number): void {
  if (!vectorAvailable(db)) {
    throw new Error("向量扩展不可用");
  }
  const existing = currentEmbeddingDim(db);
  if (existing === dim && tableExists(db, "kb_vec")) {
    return;
  }
  if (tableExists(db, "kb_vec")) {
    db.exec(`DROP TABLE kb_vec`);
  }
  db.exec(
    `CREATE VIRTUAL TABLE kb_vec USING vec0(
       chunk_id TEXT PRIMARY KEY,
       collection_id TEXT,
       embedding float[${dim}] distance_metric=cosine
     )`
  );
  metaSet(db, "embedding_dim", String(dim));
}

export function vectorAvailable(db: DatabaseSync): boolean {
  return vecLoaded.has(db);
}
