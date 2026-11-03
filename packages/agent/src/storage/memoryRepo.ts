import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { MemoryItem, MemoryKind, MemoryMeta } from "@hoshi/shared";
import type { EmbeddingProvider } from "../knowledge/embedding";
import type { MemorySimilarHit } from "../memory/apply";
import { MEMORY_EXTRACT_NEIGHBORS } from "../memory/extract";
import {
  MEMORY_ARCHIVE_MAX,
  MEMORY_QUERY_EMBED_TIMEOUT_MS,
  selectMemoriesForInject
} from "../memory/inject";
import {
  deleteMemoryVector,
  ensureMemoryVecReady,
  searchMemoryVectors,
  upsertMemoryVector
} from "../memory/vec";
import { nowIso } from "./db";

export const MEMORY_TABLE_MAX = 200;

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapKind(value: unknown): MemoryKind {
  if (
    value === "identity" ||
    value === "preference" ||
    value === "habit" ||
    value === "agreement" ||
    value === "other"
  ) {
    return value;
  }
  return "other";
}

function parseMeta(raw: unknown): MemoryMeta | null {
  if (typeof raw !== "string" || !raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    return Object.keys(record).length > 0 ? (record as MemoryMeta) : null;
  } catch {
    return null;
  }
}

function mapRow(row: Record<string, unknown>): MemoryItem {
  return {
    id: String(row.id),
    text: String(row.text),
    kind: mapKind(row.kind),
    topic: typeof row.topic === "string" ? row.topic : "",
    status: row.status === "superseded" ? "superseded" : "active",
    sourceSessionId: row.source_session_id ? String(row.source_session_id) : null,
    createdAt: toIso(row.created_at as Date | string),
    updatedAt: toIso((row.updated_at as Date | string | undefined) ?? (row.created_at as Date | string)),
    ackedAt: row.acked_at ? toIso(row.acked_at as Date | string) : null,
    meta: parseMeta(row.meta)
  };
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(",");
}

async function embedWithTimeout(
  embedding: EmbeddingProvider,
  texts: string[],
  timeoutMs: number
): Promise<number[][]> {
  return await Promise.race([
    embedding.embed(texts),
    new Promise<number[][]>((_, reject) => {
      setTimeout(() => reject(new Error("embed timeout")), timeoutMs);
    })
  ]);
}

export class MemoryRepo {
  constructor(
    private readonly db: DatabaseSync,
    private readonly embedding?: EmbeddingProvider
  ) {
    ensureMemoryVecReady(db);
  }

  async listActive(limit = 200): Promise<MemoryItem[]> {
    const safeLimit = Math.max(1, Math.min(limit, 400));
    const rows = this.db
      .prepare(`SELECT * FROM memories WHERE status = 'active' ORDER BY updated_at DESC LIMIT ?`)
      .all(safeLimit) as unknown as Record<string, unknown>[];
    return rows.map((row) => mapRow(row));
  }

  async listSuperseded(limit = 50): Promise<MemoryItem[]> {
    const safeLimit = Math.max(1, Math.min(limit, 50));
    const rows = this.db
      .prepare(`SELECT * FROM memories WHERE status = 'superseded' ORDER BY updated_at DESC LIMIT ?`)
      .all(safeLimit) as unknown as Record<string, unknown>[];
    return rows.map((row) => mapRow(row));
  }

  async listUnacked(limit = 2): Promise<MemoryItem[]> {
    const safeLimit = Math.max(1, Math.min(limit, 10));
    const rows = this.db
      .prepare(
        `SELECT * FROM memories WHERE status = 'active' AND acked_at IS NULL ORDER BY updated_at DESC LIMIT ?`
      )
      .all(safeLimit) as unknown as Record<string, unknown>[];
    return rows.map((row) => mapRow(row));
  }

  async markAcked(ids: string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    this.db
      .prepare(`UPDATE memories SET acked_at = ? WHERE id IN (${placeholders(ids.length)}) AND status = 'active'`)
      .run(nowIso(), ...ids);
  }

  async get(id: string): Promise<MemoryItem | null> {
    const row = this.db.prepare(`SELECT * FROM memories WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? mapRow(row) : null;
  }

  async count(): Promise<number> {
    const row = this.db.prepare(`SELECT COUNT(*) AS n FROM memories`).get() as
      | Record<string, unknown>
      | undefined;
    return Number(row?.n ?? 0);
  }

  private markEmbedded(id: string, embedded: boolean): void {
    try {
      this.db.prepare(`UPDATE memories SET embedded = ? WHERE id = ?`).run(embedded ? 1 : 0, id);
    } catch {
      // schema 未升到 v6 时忽略
    }
  }

  private async embedText(text: string, timeoutMs?: number): Promise<number[] | null> {
    if (!this.embedding) {
      return null;
    }
    try {
      const [vec] = await embedWithTimeout(
        this.embedding,
        [text],
        timeoutMs ?? MEMORY_QUERY_EMBED_TIMEOUT_MS
      );
      return vec ?? null;
    } catch {
      return null;
    }
  }

  async syncVector(id: string, text: string): Promise<void> {
    const vec = await this.embedText(text, 15000);
    if (!vec) {
      return;
    }
    try {
      upsertMemoryVector(this.db, id, vec);
      this.markEmbedded(id, true);
    } catch {
      this.markEmbedded(id, false);
    }
  }

  private dropVector(id: string): void {
    try {
      deleteMemoryVector(this.db, id);
    } catch {
      // vec 表尚未建立
    }
    this.markEmbedded(id, false);
  }

  async retrieveForInject(query: string): Promise<MemoryItem[]> {
    const items = await this.listActive();
    const vec = await this.embedText(query, MEMORY_QUERY_EMBED_TIMEOUT_MS);
    if (!vec) {
      return selectMemoriesForInject(items);
    }
    try {
      const hits = searchMemoryVectors(this.db, vec, MEMORY_ARCHIVE_MAX * 3);
      return selectMemoriesForInject(items, query, hits);
    } catch {
      return selectMemoriesForInject(items);
    }
  }

  async neighborsForExtract(turnText: string): Promise<MemoryItem[]> {
    const items = await this.listActive();
    const vec = await this.embedText(turnText, MEMORY_QUERY_EMBED_TIMEOUT_MS);
    if (!vec) {
      return items.slice(0, MEMORY_EXTRACT_NEIGHBORS);
    }
    try {
      const hits = searchMemoryVectors(this.db, vec, MEMORY_EXTRACT_NEIGHBORS);
      const byId = new Map(items.map((item) => [item.id, item]));
      const picked: MemoryItem[] = [];
      const used = new Set<string>();
      for (const hit of hits) {
        const item = byId.get(hit.id);
        if (!item || used.has(item.id)) {
          continue;
        }
        used.add(item.id);
        picked.push(item);
        if (picked.length >= MEMORY_EXTRACT_NEIGHBORS) {
          break;
        }
      }
      if (picked.length < MEMORY_EXTRACT_NEIGHBORS) {
        for (const item of items) {
          if (used.has(item.id)) {
            continue;
          }
          picked.push(item);
          if (picked.length >= MEMORY_EXTRACT_NEIGHBORS) {
            break;
          }
        }
      }
      return picked;
    } catch {
      return items.slice(0, MEMORY_EXTRACT_NEIGHBORS);
    }
  }

  async similarForTexts(texts: string[]): Promise<Map<string, MemorySimilarHit[]>> {
    const out = new Map<string, MemorySimilarHit[]>();
    for (const text of texts) {
      const vec = await this.embedText(text, MEMORY_QUERY_EMBED_TIMEOUT_MS);
      if (!vec) {
        out.set(text, []);
        continue;
      }
      try {
        out.set(text, searchMemoryVectors(this.db, vec, 5));
      } catch {
        out.set(text, []);
      }
    }
    return out;
  }

  async backfillEmbeddings(): Promise<void> {
    if (!this.embedding) {
      return;
    }
    const rows = this.db
      .prepare(
        `SELECT id, text FROM memories WHERE status = 'active' AND COALESCE(embedded, 0) = 0 LIMIT 200`
      )
      .all() as unknown as Array<{ id: string; text: string }>;
    for (const row of rows) {
      await this.syncVector(row.id, row.text);
    }
  }

  private deleteOldest(sql: string): string | null {
    const row = this.db.prepare(sql).get() as { id?: string } | undefined;
    const id = row?.id;
    if (!id) {
      return null;
    }
    this.dropVector(id);
    this.db.prepare(`DELETE FROM memories WHERE id = ?`).run(id);
    return id;
  }

  private async evictIfNeeded(): Promise<void> {
    while ((await this.count()) >= MEMORY_TABLE_MAX) {
      const superseded = this.deleteOldest(
        `SELECT id FROM memories WHERE status = 'superseded' ORDER BY updated_at ASC LIMIT 1`
      );
      if (superseded) {
        continue;
      }
      const unacked = this.deleteOldest(
        `SELECT id FROM memories WHERE status = 'active' AND acked_at IS NULL AND kind IN ('other', 'habit') ORDER BY updated_at ASC LIMIT 1`
      );
      if (unacked) {
        continue;
      }
      const acked = this.deleteOldest(
        `SELECT id FROM memories WHERE status = 'active' AND acked_at IS NOT NULL AND kind IN ('other', 'habit') ORDER BY updated_at ASC LIMIT 1`
      );
      if (!acked) {
        break;
      }
    }
  }

  async insert(
    text: string,
    sourceSessionId: string | null,
    kind: MemoryKind = "other",
    topic = "",
    meta: MemoryMeta | null = null
  ): Promise<MemoryItem> {
    await this.evictIfNeeded();
    const id = randomUUID();
    const now = nowIso();
    const row = this.db
      .prepare(
        `INSERT INTO memories (id, text, kind, topic, status, source_session_id, meta, created_at, updated_at, acked_at)
         VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, NULL) RETURNING *`
      )
      .get(id, text, kind, topic, sourceSessionId, meta ? JSON.stringify(meta) : "{}", now, now) as
      | Record<string, unknown>
      | undefined;
    const item = mapRow(row as Record<string, unknown>);
    await this.syncVector(item.id, item.text);
    return item;
  }

  async updateText(
    id: string,
    text: string,
    options?: { topic?: string; acked?: boolean }
  ): Promise<MemoryItem | null> {
    const topic = options?.topic;
    const acked = options?.acked;
    const sets = ["text = ?", "updated_at = ?"];
    const values: string[] = [text, nowIso()];
    if (topic !== undefined) {
      values.push(topic);
      sets.push("topic = ?");
    }
    if (acked === true) {
      values.push(nowIso());
      sets.push("acked_at = ?");
    } else if (acked === false) {
      sets.push("acked_at = NULL");
    }
    values.push(id);
    const row = this.db
      .prepare(`UPDATE memories SET ${sets.join(", ")} WHERE id = ? AND status = 'active' RETURNING *`)
      .get(...values) as Record<string, unknown> | undefined;
    const item = row ? mapRow(row) : null;
    if (item) {
      await this.syncVector(item.id, item.text);
    }
    return item;
  }

  async restore(id: string): Promise<MemoryItem | null> {
    const row = this.db
      .prepare(
        `UPDATE memories SET status = 'active', superseded_by = NULL, acked_at = ?, updated_at = ? WHERE id = ? AND status = 'superseded' RETURNING *`
      )
      .get(nowIso(), nowIso(), id) as Record<string, unknown> | undefined;
    const item = row ? mapRow(row) : null;
    if (item) {
      await this.syncVector(item.id, item.text);
    }
    return item;
  }

  async supersede(id: string, supersededBy: string | null = null): Promise<boolean> {
    const result = this.db
      .prepare(`UPDATE memories SET status = 'superseded', superseded_by = ?, updated_at = ? WHERE id = ? AND status = 'active'`)
      .run(supersededBy, nowIso(), id);
    if (result.changes > 0) {
      this.dropVector(id);
    }
    return result.changes > 0;
  }
}
