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

CREATE TABLE IF NOT EXISTS memories (
  id UUID PRIMARY KEY,
  text TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'other',
  topic TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded')),
  superseded_by UUID,
  source_session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_session_created ON messages(session_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_compactions_session_created ON session_compactions(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memories_status_updated ON memories(status, updated_at DESC);
