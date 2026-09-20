"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionRepo = void 0;
exports.estimateTokenCount = estimateTokenCount;
const node_crypto_1 = require("node:crypto");
const shared_1 = require("@hoshi/shared");
function toIso(value) {
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
function mapSessionRow(row) {
    return {
        id: String(row.id),
        title: String(row.title),
        createdAt: toIso(row.created_at),
        updatedAt: toIso(row.updated_at),
        lastMessageAt: row.last_message_at ? toIso(row.last_message_at) : null,
        summaryVersion: Number(row.summary_version ?? 0)
    };
}
function usageFromRow(row) {
    if (row.prompt_tokens == null && row.completion_tokens == null && row.total_tokens == null) {
        return undefined;
    }
    const promptTokens = Number(row.prompt_tokens ?? 0);
    const completionTokens = Number(row.completion_tokens ?? 0);
    return {
        promptTokens,
        completionTokens,
        totalTokens: Number(row.total_tokens ?? promptTokens + completionTokens),
        cachedTokens: Number(row.cached_tokens ?? 0)
    };
}
function mapMessageRow(row) {
    return {
        id: String(row.id),
        sessionId: String(row.session_id),
        role: row.role,
        content: String(row.content),
        emotion: row.emotion ?? null,
        createdAt: toIso(row.created_at),
        tokenEstimate: Number(row.token_estimate ?? 0),
        usage: usageFromRow(row)
    };
}
function asSessionUuid(id) {
    const value = id?.trim() ?? "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
        return null;
    }
    return value;
}
function estimateTokenCount(text) {
    return Math.max(1, Math.ceil(text.length / 1.8));
}
class SessionRepo {
    pool;
    constructor(pool) {
        this.pool = pool;
    }
    async createSession(title) {
        const normalizedTitle = (title?.trim() || shared_1.DEFAULT_SESSION_TITLE).slice(0, shared_1.SESSION_TITLE_MAX_LEN);
        const id = (0, node_crypto_1.randomUUID)();
        const { rows } = await this.pool.query(`INSERT INTO sessions (id, title) VALUES ($1, $2) RETURNING *`, [id, normalizedTitle]);
        return mapSessionRow(rows[0]);
    }
    async getSession(id) {
        const { rows } = await this.pool.query(`SELECT * FROM sessions WHERE id = $1`, [id]);
        const row = rows[0];
        if (!row) {
            return null;
        }
        return {
            ...mapSessionRow(row),
            summaryText: String(row.summary_text ?? "")
        };
    }
    async listSessions(limit = 30) {
        const safeLimit = Math.max(1, Math.min(limit, 100));
        const { rows } = await this.pool.query(`SELECT * FROM sessions ORDER BY COALESCE(last_message_at, updated_at) DESC LIMIT $1`, [safeLimit]);
        return rows.map((row) => mapSessionRow(row));
    }
    async listMessages(sessionId, limit = 120) {
        const safeLimit = Math.max(1, Math.min(limit, 400));
        const { rows } = await this.pool.query(`SELECT * FROM (
         SELECT * FROM messages WHERE session_id = $1
         ORDER BY created_at DESC, id DESC
         LIMIT $2
       ) t ORDER BY created_at ASC, id ASC`, [sessionId, safeLimit]);
        return rows.map((row) => mapMessageRow(row));
    }
    async deleteMessage(id) {
        await this.pool.query(`DELETE FROM messages WHERE id = $1`, [id]);
    }
    async appendMessage(input) {
        const content = input.content.trim();
        if (!content) {
            return null;
        }
        const id = (0, node_crypto_1.randomUUID)();
        const tokenEstimate = estimateTokenCount(content);
        await this.pool.query(`INSERT INTO messages (id, session_id, role, content, emotion, token_estimate, prompt_tokens, completion_tokens, cached_tokens, total_tokens)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`, [
            id,
            input.sessionId,
            input.role,
            content,
            input.emotion ?? null,
            tokenEstimate,
            input.usage?.promptTokens ?? null,
            input.usage?.completionTokens ?? null,
            input.usage?.cachedTokens ?? null,
            input.usage?.totalTokens ?? null
        ]);
        await this.pool.query(`UPDATE sessions
       SET updated_at = NOW(), last_message_at = NOW()
       WHERE id = $1`, [input.sessionId]);
        return id;
    }
    async getSessionStats(sessionId) {
        const { rows } = await this.pool.query(`SELECT COUNT(*)::int AS message_count,
              COALESCE(SUM(token_estimate), 0)::int AS token_sum
       FROM messages
       WHERE session_id = $1`, [sessionId]);
        const row = rows[0];
        return {
            messageCount: Number(row.message_count ?? 0),
            tokenEstimateSum: Number(row.token_sum ?? 0)
        };
    }
    async insertUsage(input) {
        await this.pool.query(`INSERT INTO llm_usage (id, purpose, model, session_id, prompt_tokens, completion_tokens, cached_tokens, total_tokens)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [
            (0, node_crypto_1.randomUUID)(),
            input.purpose,
            input.model,
            asSessionUuid(input.sessionId),
            input.usage.promptTokens,
            input.usage.completionTokens,
            input.usage.cachedTokens,
            input.usage.totalTokens
        ]);
    }
    async getUsageSummary() {
        const mapTotals = (row) => ({
            promptTokens: Number(row?.prompt_tokens ?? 0),
            completionTokens: Number(row?.completion_tokens ?? 0),
            cachedTokens: Number(row?.cached_tokens ?? 0),
            totalTokens: Number(row?.total_tokens ?? 0),
            turns: Number(row?.turns ?? 0)
        });
        const empty = mapTotals(undefined);
        const sumCols = `
      COALESCE(SUM(prompt_tokens), 0)::int AS prompt_tokens,
      COALESCE(SUM(completion_tokens), 0)::int AS completion_tokens,
      COALESCE(SUM(cached_tokens), 0)::int AS cached_tokens,
      COALESCE(SUM(total_tokens), 0)::int AS total_tokens,
      COUNT(*)::int AS turns`;
        const todayWhere = `(timezone('Asia/Shanghai', created_at))::date = (timezone('Asia/Shanghai', now()))::date`;
        const all = await this.pool.query(`SELECT ${sumCols} FROM llm_usage`);
        const today = await this.pool.query(`SELECT ${sumCols} FROM llm_usage WHERE ${todayWhere}`);
        const purposeAll = await this.pool.query(`SELECT purpose, ${sumCols} FROM llm_usage GROUP BY purpose`);
        const purposeToday = await this.pool.query(`SELECT purpose, ${sumCols} FROM llm_usage WHERE ${todayWhere} GROUP BY purpose`);
        const byPurpose = Object.fromEntries(shared_1.USAGE_PURPOSES.map((purpose) => [purpose, { all: empty, today: empty }]));
        for (const row of purposeAll.rows) {
            const purpose = row.purpose;
            if (byPurpose[purpose]) {
                byPurpose[purpose] = { ...byPurpose[purpose], all: mapTotals(row) };
            }
        }
        for (const row of purposeToday.rows) {
            const purpose = row.purpose;
            if (byPurpose[purpose]) {
                byPurpose[purpose] = { ...byPurpose[purpose], today: mapTotals(row) };
            }
        }
        const sessions = await this.pool.query(`SELECT s.id AS session_id, s.title,
              COALESCE(SUM(u.prompt_tokens), 0)::int AS prompt_tokens,
              COALESCE(SUM(u.completion_tokens), 0)::int AS completion_tokens,
              COALESCE(SUM(u.cached_tokens), 0)::int AS cached_tokens,
              COALESCE(SUM(u.total_tokens), 0)::int AS total_tokens,
              COUNT(*)::int AS turns
       FROM sessions s
       JOIN llm_usage u ON u.session_id = s.id
       GROUP BY s.id, s.title
       ORDER BY SUM(u.total_tokens) DESC
       LIMIT 20`);
        return {
            all: mapTotals(all.rows[0]),
            today: mapTotals(today.rows[0]),
            byPurpose,
            sessions: sessions.rows.map((row) => ({
                sessionId: String(row.session_id),
                title: String(row.title),
                promptTokens: Number(row.prompt_tokens ?? 0),
                completionTokens: Number(row.completion_tokens ?? 0),
                cachedTokens: Number(row.cached_tokens ?? 0),
                totalTokens: Number(row.total_tokens ?? 0),
                turns: Number(row.turns ?? 0)
            }))
        };
    }
    async updateSummary(sessionId, summaryText, summaryVersion) {
        await this.pool.query(`UPDATE sessions
       SET summary_text = $2,
           summary_version = $3,
           updated_at = NOW()
       WHERE id = $1`, [sessionId, summaryText, summaryVersion]);
    }
    async recordCompaction(input) {
        await this.pool.query(`INSERT INTO session_compactions
      (id, session_id, before_message_count, after_message_count, compressed_token_estimate, summary_version, first_compacted_message_id, last_compacted_message_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [
            (0, node_crypto_1.randomUUID)(),
            input.sessionId,
            input.beforeMessageCount,
            input.afterMessageCount,
            input.compressedTokenEstimate,
            input.summaryVersion,
            input.firstCompactedMessageId,
            input.lastCompactedMessageId
        ]);
    }
    async deleteMessagesByIds(ids) {
        if (ids.length === 0) {
            return;
        }
        await this.pool.query(`DELETE FROM messages WHERE id = ANY($1::uuid[])`, [ids]);
    }
    async compactSession(input) {
        const client = await this.pool.connect();
        try {
            await client.query("BEGIN");
            const updated = await client.query(`UPDATE sessions
         SET summary_text = $2,
             summary_version = $3,
             updated_at = NOW()
         WHERE id = $1 AND summary_version = $4`, [input.sessionId, input.summaryText, input.summaryVersion, input.expectedVersion]);
            if ((updated.rowCount ?? 0) === 0) {
                await client.query("ROLLBACK");
                return false;
            }
            if (input.deleteMessageIds.length > 0) {
                await client.query(`DELETE FROM messages WHERE id = ANY($1::uuid[])`, [input.deleteMessageIds]);
            }
            await client.query(`INSERT INTO session_compactions
        (id, session_id, before_message_count, after_message_count, compressed_token_estimate, summary_version, first_compacted_message_id, last_compacted_message_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [
                (0, node_crypto_1.randomUUID)(),
                input.sessionId,
                input.beforeMessageCount,
                input.afterMessageCount,
                input.compressedTokenEstimate,
                input.summaryVersion,
                input.firstCompactedMessageId,
                input.lastCompactedMessageId
            ]);
            await client.query("COMMIT");
            return true;
        }
        catch (error) {
            await client.query("ROLLBACK");
            throw error;
        }
        finally {
            client.release();
        }
    }
    async deleteSession(id) {
        const result = await this.pool.query(`DELETE FROM sessions WHERE id = $1`, [id]);
        return (result.rowCount ?? 0) > 0;
    }
    async titleFromFirstUserMessage(sessionId, message) {
        const title = (0, shared_1.sessionTitleFromUserMessage)(message);
        if (!title) {
            return;
        }
        await this.pool.query(`UPDATE sessions SET title = $2, updated_at = NOW() WHERE id = $1 AND title = $3`, [sessionId, title, shared_1.DEFAULT_SESSION_TITLE]);
    }
    static toPromptHistory(messages) {
        return messages.map((message) => ({
            role: message.role,
            content: message.content
        }));
    }
}
exports.SessionRepo = SessionRepo;
