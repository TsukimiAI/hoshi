import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { MemoryItem, MemoryKind, MemoryMeta } from "@hoshi/shared";
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

export class MemoryRepo {
  constructor(private readonly db: DatabaseSync) {}

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

  private async evictIfNeeded(): Promise<void> {
    while ((await this.count()) >= MEMORY_TABLE_MAX) {
      const superseded = this.db
        .prepare(`DELETE FROM memories WHERE id = (SELECT id FROM memories WHERE status = 'superseded' ORDER BY updated_at ASC LIMIT 1)`)
        .run();
      if (superseded.changes > 0) {
        continue;
      }
      const soft = this.db
        .prepare(
          `DELETE FROM memories WHERE id = (SELECT id FROM memories WHERE status = 'active' AND kind IN ('other', 'habit') ORDER BY updated_at ASC LIMIT 1)`
        )
        .run();
      if (soft.changes === 0) {
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
    return mapRow(row as Record<string, unknown>);
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
    return row ? mapRow(row) : null;
  }

  async restore(id: string): Promise<MemoryItem | null> {
    const row = this.db
      .prepare(
        `UPDATE memories SET status = 'active', superseded_by = NULL, acked_at = ?, updated_at = ? WHERE id = ? AND status = 'superseded' RETURNING *`
      )
      .get(nowIso(), nowIso(), id) as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  }

  async supersede(id: string, supersededBy: string | null = null): Promise<boolean> {
    const result = this.db
      .prepare(`UPDATE memories SET status = 'superseded', superseded_by = ?, updated_at = ? WHERE id = ? AND status = 'active'`)
      .run(supersededBy, nowIso(), id);
    return result.changes > 0;
  }
}
