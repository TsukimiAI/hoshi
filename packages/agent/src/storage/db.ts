import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export const DB_SCHEMA_VERSION = 5;

let lastIsoMs = 0;

export function nowIso(): string {
  let ms = Date.now();
  if (ms <= lastIsoMs) {
    ms = lastIsoMs + 1;
  }
  lastIsoMs = ms;
  return new Date(ms).toISOString();
}

const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary_text TEXT NOT NULL DEFAULT '',
  summary_version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_message_at TEXT
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant')),
  content TEXT NOT NULL,
  emotion TEXT,
  token_estimate INTEGER NOT NULL DEFAULT 0,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  cached_tokens INTEGER,
  total_tokens INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS session_compactions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  before_message_count INTEGER NOT NULL,
  after_message_count INTEGER NOT NULL,
  compressed_token_estimate INTEGER NOT NULL,
  summary_version INTEGER NOT NULL,
  first_compacted_message_id TEXT,
  last_compacted_message_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS llm_usage (
  id TEXT PRIMARY KEY,
  purpose TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT '',
  session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  cached_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'other',
  topic TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded')),
  superseded_by TEXT,
  source_session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  acked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_session_created ON messages(session_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_compactions_session_created ON session_compactions(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memories_status_updated ON memories(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_usage_created ON llm_usage(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_usage_session ON llm_usage(session_id);
`;

const SCHEMA_V2 = `
ALTER TABLE memories ADD COLUMN meta TEXT NOT NULL DEFAULT '{}';
`;

const SCHEMA_V3 = `
ALTER TABLE sessions ADD COLUMN kind TEXT NOT NULL DEFAULT 'chat';
CREATE TABLE IF NOT EXISTS canvas_items (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  payload TEXT NOT NULL,
  x REAL NOT NULL DEFAULT 40,
  y REAL NOT NULL DEFAULT 40,
  w REAL NOT NULL DEFAULT 320,
  h REAL NOT NULL DEFAULT 220,
  z INTEGER NOT NULL DEFAULT 0,
  source_session_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_canvas_items_updated ON canvas_items(updated_at DESC);
`;

const SCHEMA_V4 = `
CREATE TABLE IF NOT EXISTS canvas_snapshots (
  turn_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  document TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_canvas_snapshots_session ON canvas_snapshots(session_id, created_at ASC);
`;

function migrateCanvasV5(db: DatabaseSync): void {
  const cols = db.prepare(`PRAGMA table_info(canvas_items)`).all() as Array<{ name?: string }>;
  if (!cols.some((col) => col.name === "session_id")) {
    db.exec(`ALTER TABLE canvas_items ADD COLUMN session_id TEXT`);
  }
  db.exec(`
    UPDATE canvas_items SET session_id = source_session_id
    WHERE session_id IS NULL AND source_session_id IS NOT NULL
      AND source_session_id IN (SELECT id FROM sessions)
  `);
  const desk = db
    .prepare(
      `SELECT id FROM sessions WHERE kind = 'desk' ORDER BY COALESCE(last_message_at, updated_at) DESC LIMIT 1`
    )
    .get() as { id?: string } | undefined;
  if (desk?.id) {
    db.prepare(`UPDATE canvas_items SET session_id = ? WHERE session_id IS NULL`).run(desk.id);
  }
  db.exec(`DELETE FROM canvas_items WHERE session_id IS NULL OR session_id = ''`);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_canvas_items_session_z ON canvas_items(session_id, z, updated_at)`
  );
  db.exec(`
    CREATE TABLE IF NOT EXISTS canvas_turn_activity (
      turn_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      user_message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      steps_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_canvas_turn_activity_session
      ON canvas_turn_activity(session_id, created_at ASC);
  `);
}

const MIGRATIONS: Array<string | ((db: DatabaseSync) => void)> = [
  SCHEMA_V1,
  SCHEMA_V2,
  SCHEMA_V3,
  SCHEMA_V4,
  migrateCanvasV5
];

export function openDatabase(dbPath: string, opts?: { allowExtension?: boolean }): DatabaseSync {
  if (dbPath !== ":memory:") {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath, { allowExtension: opts?.allowExtension ?? true });
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}

export function userVersion(db: DatabaseSync): number {
  const row = db.prepare("PRAGMA user_version").get() as { user_version?: number } | undefined;
  return Number(row?.user_version ?? 0);
}

export function migrateDb(db: DatabaseSync): void {
  let version = userVersion(db);
  while (version < MIGRATIONS.length) {
    const step = MIGRATIONS[version];
    if (typeof step === "function") {
      step(db);
    } else {
      db.exec(step);
    }
    version += 1;
    db.exec(`PRAGMA user_version = ${version}`);
  }
}
