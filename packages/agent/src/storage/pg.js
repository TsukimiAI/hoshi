"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPgPool = createPgPool;
exports.migratePg = migratePg;
const pg_1 = require("pg");
const CREATE_SQL = `
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  summary_text TEXT NOT NULL DEFAULT '',
  summary_version INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant')),
  content TEXT NOT NULL,
  emotion TEXT,
  token_estimate INTEGER NOT NULL DEFAULT 0,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  cached_tokens INTEGER,
  total_tokens INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS session_compactions (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  before_message_count INTEGER NOT NULL,
  after_message_count INTEGER NOT NULL,
  compressed_token_estimate INTEGER NOT NULL,
  summary_version INTEGER NOT NULL,
  first_compacted_message_id UUID,
  last_compacted_message_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS llm_usage (
  id UUID PRIMARY KEY,
  purpose TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT '',
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  cached_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS memories (
  id UUID PRIMARY KEY,
  text TEXT NOT NULL,
  source_session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;
const INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_session_created ON messages(session_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_compactions_session_created ON session_compactions(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memories_status_updated ON memories(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_usage_created ON llm_usage(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_usage_session ON llm_usage(session_id);
`;
const MEMORY_COLUMNS = [
    ["kind", "TEXT NOT NULL DEFAULT 'other'"],
    ["topic", "TEXT NOT NULL DEFAULT ''"],
    ["status", "TEXT NOT NULL DEFAULT 'active'"],
    ["superseded_by", "UUID"],
    ["updated_at", "TIMESTAMPTZ NOT NULL DEFAULT NOW()"],
    ["acked_at", "TIMESTAMPTZ"]
];
const MESSAGE_USAGE_COLUMNS = [
    ["prompt_tokens", "INTEGER"],
    ["completion_tokens", "INTEGER"],
    ["cached_tokens", "INTEGER"],
    ["total_tokens", "INTEGER"]
];
function createPgPool(databaseUrl) {
    return new pg_1.Pool({
        connectionString: databaseUrl,
        max: 10
    });
}
async function addColumnIfMissing(pool, table, column, ddl) {
    try {
        await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
    }
    catch (error) {
        const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
        if (code !== "42701") {
            throw error;
        }
    }
}
async function migratePg(pool) {
    await pool.query(CREATE_SQL);
    for (const [column, ddl] of MEMORY_COLUMNS) {
        await addColumnIfMissing(pool, "memories", column, ddl);
    }
    for (const [column, ddl] of MESSAGE_USAGE_COLUMNS) {
        await addColumnIfMissing(pool, "messages", column, ddl);
    }
    await pool.query(INDEX_SQL);
    await pool.query(`
INSERT INTO llm_usage (id, purpose, model, session_id, prompt_tokens, completion_tokens, cached_tokens, total_tokens, created_at)
SELECT id, 'chat', '', session_id,
       COALESCE(prompt_tokens, 0), COALESCE(completion_tokens, 0), COALESCE(cached_tokens, 0), total_tokens, created_at
FROM messages
WHERE total_tokens IS NOT NULL
ON CONFLICT DO NOTHING
`);
    await pool.query(`
DO $$ BEGIN
  ALTER TABLE memories ADD CONSTRAINT memories_status_check
    CHECK (status IN ('active', 'superseded'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
`);
}
