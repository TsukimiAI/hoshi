import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { MemoryItem, MemoryKind } from "@hoshi/shared";

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
    ackedAt: row.acked_at ? toIso(row.acked_at as Date | string) : null
  };
}

export class MemoryRepo {
  constructor(private readonly pool: Pool) {}

  async listActive(limit = 200): Promise<MemoryItem[]> {
    const safeLimit = Math.max(1, Math.min(limit, 400));
    const { rows } = await this.pool.query(
      `SELECT * FROM memories WHERE status = 'active' ORDER BY updated_at DESC LIMIT $1`,
      [safeLimit]
    );
    return rows.map((row: unknown) => mapRow(row as Record<string, unknown>));
  }

  async listSuperseded(limit = 50): Promise<MemoryItem[]> {
    const safeLimit = Math.max(1, Math.min(limit, 50));
    const { rows } = await this.pool.query(
      `SELECT * FROM memories WHERE status = 'superseded' ORDER BY updated_at DESC LIMIT $1`,
      [safeLimit]
    );
    return rows.map((row: unknown) => mapRow(row as Record<string, unknown>));
  }

  async listUnacked(limit = 2): Promise<MemoryItem[]> {
    const safeLimit = Math.max(1, Math.min(limit, 10));
    const { rows } = await this.pool.query(
      `SELECT * FROM memories
       WHERE status = 'active' AND acked_at IS NULL
       ORDER BY updated_at DESC LIMIT $1`,
      [safeLimit]
    );
    return rows.map((row: unknown) => mapRow(row as Record<string, unknown>));
  }

  async markAcked(ids: string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    await this.pool.query(
      `UPDATE memories SET acked_at = NOW() WHERE id = ANY($1::uuid[]) AND status = 'active'`,
      [ids]
    );
  }

  async get(id: string): Promise<MemoryItem | null> {
    const { rows } = await this.pool.query(`SELECT * FROM memories WHERE id = $1`, [id]);
    const row = rows[0] as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  }

  async count(): Promise<number> {
    const { rows } = await this.pool.query(`SELECT COUNT(*)::int AS n FROM memories`);
    return Number((rows[0] as Record<string, unknown>).n ?? 0);
  }

  private async evictIfNeeded(): Promise<void> {
    while ((await this.count()) >= MEMORY_TABLE_MAX) {
      const superseded = await this.pool.query(
        `DELETE FROM memories WHERE id = (
           SELECT id FROM memories WHERE status = 'superseded' ORDER BY updated_at ASC LIMIT 1
         ) RETURNING id`
      );
      if ((superseded.rowCount ?? 0) > 0) {
        continue;
      }
      const soft = await this.pool.query(
        `DELETE FROM memories WHERE id = (
           SELECT id FROM memories
           WHERE status = 'active' AND kind IN ('other', 'habit')
           ORDER BY updated_at ASC LIMIT 1
         ) RETURNING id`
      );
      if ((soft.rowCount ?? 0) === 0) {
        break;
      }
    }
  }

  async insert(
    text: string,
    sourceSessionId: string | null,
    kind: MemoryKind = "other",
    topic = ""
  ): Promise<MemoryItem> {
    await this.evictIfNeeded();
    const id = randomUUID();
    const { rows } = await this.pool.query(
      `INSERT INTO memories (id, text, kind, topic, status, source_session_id, acked_at)
       VALUES ($1, $2, $3, $4, 'active', $5, NULL) RETURNING *`,
      [id, text, kind, topic, sourceSessionId]
    );
    return mapRow(rows[0] as Record<string, unknown>);
  }

  async updateText(
    id: string,
    text: string,
    options?: { topic?: string; acked?: boolean }
  ): Promise<MemoryItem | null> {
    const topic = options?.topic;
    const acked = options?.acked;
    const sets = ["text = $2", "updated_at = NOW()"];
    const values: unknown[] = [id, text];
    if (topic !== undefined) {
      values.push(topic);
      sets.push(`topic = $${values.length}`);
    }
    if (acked === true) {
      sets.push("acked_at = NOW()");
    } else if (acked === false) {
      sets.push("acked_at = NULL");
    }
    const { rows } = await this.pool.query(
      `UPDATE memories SET ${sets.join(", ")} WHERE id = $1 AND status = 'active' RETURNING *`,
      values
    );
    const row = rows[0] as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  }

  async restore(id: string): Promise<MemoryItem | null> {
    const { rows } = await this.pool.query(
      `UPDATE memories
       SET status = 'active', superseded_by = NULL, acked_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND status = 'superseded'
       RETURNING *`,
      [id]
    );
    const row = rows[0] as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  }

  async supersede(id: string, supersededBy: string | null = null): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE memories
       SET status = 'superseded', superseded_by = $2, updated_at = NOW()
       WHERE id = $1 AND status = 'active'`,
      [id, supersededBy]
    );
    return (result.rowCount ?? 0) > 0;
  }
}
