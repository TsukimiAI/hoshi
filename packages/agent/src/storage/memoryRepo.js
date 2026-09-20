"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryRepo = exports.MEMORY_TABLE_MAX = void 0;
const node_crypto_1 = require("node:crypto");
exports.MEMORY_TABLE_MAX = 200;
function toIso(value) {
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
function mapKind(value) {
    if (value === "identity" ||
        value === "preference" ||
        value === "habit" ||
        value === "agreement" ||
        value === "other") {
        return value;
    }
    return "other";
}
function mapRow(row) {
    return {
        id: String(row.id),
        text: String(row.text),
        kind: mapKind(row.kind),
        topic: typeof row.topic === "string" ? row.topic : "",
        status: row.status === "superseded" ? "superseded" : "active",
        sourceSessionId: row.source_session_id ? String(row.source_session_id) : null,
        createdAt: toIso(row.created_at),
        updatedAt: toIso(row.updated_at ?? row.created_at),
        ackedAt: row.acked_at ? toIso(row.acked_at) : null
    };
}
class MemoryRepo {
    pool;
    constructor(pool) {
        this.pool = pool;
    }
    async listActive(limit = 200) {
        const safeLimit = Math.max(1, Math.min(limit, 400));
        const { rows } = await this.pool.query(`SELECT * FROM memories WHERE status = 'active' ORDER BY updated_at DESC LIMIT $1`, [safeLimit]);
        return rows.map((row) => mapRow(row));
    }
    async listSuperseded(limit = 50) {
        const safeLimit = Math.max(1, Math.min(limit, 50));
        const { rows } = await this.pool.query(`SELECT * FROM memories WHERE status = 'superseded' ORDER BY updated_at DESC LIMIT $1`, [safeLimit]);
        return rows.map((row) => mapRow(row));
    }
    async listUnacked(limit = 2) {
        const safeLimit = Math.max(1, Math.min(limit, 10));
        const { rows } = await this.pool.query(`SELECT * FROM memories
       WHERE status = 'active' AND acked_at IS NULL
       ORDER BY updated_at DESC LIMIT $1`, [safeLimit]);
        return rows.map((row) => mapRow(row));
    }
    async markAcked(ids) {
        if (ids.length === 0) {
            return;
        }
        await this.pool.query(`UPDATE memories SET acked_at = NOW() WHERE id = ANY($1::uuid[]) AND status = 'active'`, [ids]);
    }
    async get(id) {
        const { rows } = await this.pool.query(`SELECT * FROM memories WHERE id = $1`, [id]);
        const row = rows[0];
        return row ? mapRow(row) : null;
    }
    async count() {
        const { rows } = await this.pool.query(`SELECT COUNT(*)::int AS n FROM memories`);
        return Number(rows[0].n ?? 0);
    }
    async evictIfNeeded() {
        while ((await this.count()) >= exports.MEMORY_TABLE_MAX) {
            const superseded = await this.pool.query(`DELETE FROM memories WHERE id = (
           SELECT id FROM memories WHERE status = 'superseded' ORDER BY updated_at ASC LIMIT 1
         ) RETURNING id`);
            if ((superseded.rowCount ?? 0) > 0) {
                continue;
            }
            const soft = await this.pool.query(`DELETE FROM memories WHERE id = (
           SELECT id FROM memories
           WHERE status = 'active' AND kind IN ('other', 'habit')
           ORDER BY updated_at ASC LIMIT 1
         ) RETURNING id`);
            if ((soft.rowCount ?? 0) === 0) {
                break;
            }
        }
    }
    async insert(text, sourceSessionId, kind = "other", topic = "") {
        await this.evictIfNeeded();
        const id = (0, node_crypto_1.randomUUID)();
        const { rows } = await this.pool.query(`INSERT INTO memories (id, text, kind, topic, status, source_session_id, acked_at)
       VALUES ($1, $2, $3, $4, 'active', $5, NULL) RETURNING *`, [id, text, kind, topic, sourceSessionId]);
        return mapRow(rows[0]);
    }
    async updateText(id, text, options) {
        const topic = options?.topic;
        const acked = options?.acked;
        const sets = ["text = $2", "updated_at = NOW()"];
        const values = [id, text];
        if (topic !== undefined) {
            values.push(topic);
            sets.push(`topic = $${values.length}`);
        }
        if (acked === true) {
            sets.push("acked_at = NOW()");
        }
        else if (acked === false) {
            sets.push("acked_at = NULL");
        }
        const { rows } = await this.pool.query(`UPDATE memories SET ${sets.join(", ")} WHERE id = $1 AND status = 'active' RETURNING *`, values);
        const row = rows[0];
        return row ? mapRow(row) : null;
    }
    async restore(id) {
        const { rows } = await this.pool.query(`UPDATE memories
       SET status = 'active', superseded_by = NULL, acked_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND status = 'superseded'
       RETURNING *`, [id]);
        const row = rows[0];
        return row ? mapRow(row) : null;
    }
    async supersede(id, supersededBy = null) {
        const result = await this.pool.query(`UPDATE memories
       SET status = 'superseded', superseded_by = $2, updated_at = NOW()
       WHERE id = $1 AND status = 'active'`, [id, supersededBy]);
        return (result.rowCount ?? 0) > 0;
    }
}
exports.MemoryRepo = MemoryRepo;
