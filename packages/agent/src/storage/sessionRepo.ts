import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import {
  DEFAULT_SESSION_TITLE,
  SESSION_TITLE_MAX_LEN,
  sessionTitleFromUserMessage,
  type ChatMessage,
  type ChatMessageRole,
  type Emotion,
  type LlmUsage,
  type SessionItem,
  type SessionMessage,
  type SessionUsageItem,
  type UsagePurpose,
  type UsageSummaryResponse,
  type UsageTotals,
  USAGE_PURPOSES
} from "@hoshi/shared";

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapSessionRow(row: Record<string, unknown>): SessionItem {
  return {
    id: String(row.id),
    title: String(row.title),
    createdAt: toIso(row.created_at as Date | string),
    updatedAt: toIso(row.updated_at as Date | string),
    lastMessageAt: row.last_message_at ? toIso(row.last_message_at as Date | string) : null,
    summaryVersion: Number(row.summary_version ?? 0)
  };
}

function usageFromRow(row: Record<string, unknown>): LlmUsage | undefined {
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

function mapMessageRow(row: Record<string, unknown>): SessionMessage {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    role: row.role as ChatMessageRole,
    content: String(row.content),
    emotion: (row.emotion as Emotion | null) ?? null,
    createdAt: toIso(row.created_at as Date | string),
    tokenEstimate: Number(row.token_estimate ?? 0),
    usage: usageFromRow(row)
  };
}

function asSessionUuid(id?: string): string | null {
  const value = id?.trim() ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    return null;
  }
  return value;
}

export function estimateTokenCount(text: string): number {
  return Math.max(1, Math.ceil(text.length / 1.8));
}

export interface SessionStats {
  messageCount: number;
  tokenEstimateSum: number;
}

export class SessionRepo {
  constructor(private readonly pool: Pool) {}

  async createSession(title?: string): Promise<SessionItem> {
    const normalizedTitle = (title?.trim() || DEFAULT_SESSION_TITLE).slice(0, SESSION_TITLE_MAX_LEN);
    const id = randomUUID();
    const { rows } = await this.pool.query(
      `INSERT INTO sessions (id, title) VALUES ($1, $2) RETURNING *`,
      [id, normalizedTitle]
    );
    return mapSessionRow(rows[0] as Record<string, unknown>);
  }

  async getSession(id: string): Promise<(SessionItem & { summaryText: string }) | null> {
    const { rows } = await this.pool.query(`SELECT * FROM sessions WHERE id = $1`, [id]);
    const row = rows[0] as Record<string, unknown> | undefined;
    if (!row) {
      return null;
    }
    return {
      ...mapSessionRow(row),
      summaryText: String(row.summary_text ?? "")
    };
  }

  async listSessions(limit = 30): Promise<SessionItem[]> {
    const safeLimit = Math.max(1, Math.min(limit, 100));
    const { rows } = await this.pool.query(
      `SELECT * FROM sessions ORDER BY COALESCE(last_message_at, updated_at) DESC LIMIT $1`,
      [safeLimit]
    );
    return rows.map((row: unknown) => mapSessionRow(row as Record<string, unknown>));
  }

  async listMessages(sessionId: string, limit = 120): Promise<SessionMessage[]> {
    const safeLimit = Math.max(1, Math.min(limit, 400));
    const { rows } = await this.pool.query(
      `SELECT * FROM (
         SELECT * FROM messages WHERE session_id = $1
         ORDER BY created_at DESC, id DESC
         LIMIT $2
       ) t ORDER BY created_at ASC, id ASC`,
      [sessionId, safeLimit]
    );
    return rows.map((row: unknown) => mapMessageRow(row as Record<string, unknown>));
  }

  async deleteMessage(id: string): Promise<void> {
    await this.pool.query(`DELETE FROM messages WHERE id = $1`, [id]);
  }

  async appendMessage(input: {
    sessionId: string;
    role: ChatMessageRole;
    content: string;
    emotion?: Emotion | null;
    usage?: LlmUsage;
  }): Promise<string | null> {
    const content = input.content.trim();
    if (!content) {
      return null;
    }
    const id = randomUUID();
    const tokenEstimate = estimateTokenCount(content);
    await this.pool.query(
      `INSERT INTO messages (id, session_id, role, content, emotion, token_estimate, prompt_tokens, completion_tokens, cached_tokens, total_tokens)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
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
      ]
    );
    await this.pool.query(
      `UPDATE sessions
       SET updated_at = NOW(), last_message_at = NOW()
       WHERE id = $1`,
      [input.sessionId]
    );
    return id;
  }

  async getSessionStats(sessionId: string): Promise<SessionStats> {
    const { rows } = await this.pool.query(
      `SELECT COUNT(*)::int AS message_count,
              COALESCE(SUM(token_estimate), 0)::int AS token_sum
       FROM messages
       WHERE session_id = $1`,
      [sessionId]
    );
    const row = rows[0] as Record<string, unknown>;
    return {
      messageCount: Number(row.message_count ?? 0),
      tokenEstimateSum: Number(row.token_sum ?? 0)
    };
  }

  async insertUsage(input: {
    purpose: UsagePurpose;
    model: string;
    sessionId?: string;
    usage: LlmUsage;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO llm_usage (id, purpose, model, session_id, prompt_tokens, completion_tokens, cached_tokens, total_tokens)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        randomUUID(),
        input.purpose,
        input.model,
        asSessionUuid(input.sessionId),
        input.usage.promptTokens,
        input.usage.completionTokens,
        input.usage.cachedTokens,
        input.usage.totalTokens
      ]
    );
  }

  async getUsageSummary(): Promise<UsageSummaryResponse> {
    const mapTotals = (row: Record<string, unknown> | undefined): UsageTotals => ({
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
    const today = await this.pool.query(
      `SELECT ${sumCols} FROM llm_usage WHERE ${todayWhere}`
    );
    const purposeAll = await this.pool.query(
      `SELECT purpose, ${sumCols} FROM llm_usage GROUP BY purpose`
    );
    const purposeToday = await this.pool.query(
      `SELECT purpose, ${sumCols} FROM llm_usage WHERE ${todayWhere} GROUP BY purpose`
    );
    const byPurpose = Object.fromEntries(
      USAGE_PURPOSES.map((purpose) => [purpose, { all: empty, today: empty }])
    ) as UsageSummaryResponse["byPurpose"];
    for (const row of purposeAll.rows as Record<string, unknown>[]) {
      const purpose = row.purpose as UsagePurpose;
      if (byPurpose[purpose]) {
        byPurpose[purpose] = { ...byPurpose[purpose], all: mapTotals(row) };
      }
    }
    for (const row of purposeToday.rows as Record<string, unknown>[]) {
      const purpose = row.purpose as UsagePurpose;
      if (byPurpose[purpose]) {
        byPurpose[purpose] = { ...byPurpose[purpose], today: mapTotals(row) };
      }
    }
    const sessions = await this.pool.query(
      `SELECT s.id AS session_id, s.title,
              COALESCE(SUM(u.prompt_tokens), 0)::int AS prompt_tokens,
              COALESCE(SUM(u.completion_tokens), 0)::int AS completion_tokens,
              COALESCE(SUM(u.cached_tokens), 0)::int AS cached_tokens,
              COALESCE(SUM(u.total_tokens), 0)::int AS total_tokens,
              COUNT(*)::int AS turns
       FROM sessions s
       JOIN llm_usage u ON u.session_id = s.id
       GROUP BY s.id, s.title
       ORDER BY SUM(u.total_tokens) DESC
       LIMIT 20`
    );
    return {
      all: mapTotals(all.rows[0] as Record<string, unknown> | undefined),
      today: mapTotals(today.rows[0] as Record<string, unknown> | undefined),
      byPurpose,
      sessions: sessions.rows.map((row: Record<string, unknown>): SessionUsageItem => ({
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

  async updateSummary(sessionId: string, summaryText: string, summaryVersion: number): Promise<void> {
    await this.pool.query(
      `UPDATE sessions
       SET summary_text = $2,
           summary_version = $3,
           updated_at = NOW()
       WHERE id = $1`,
      [sessionId, summaryText, summaryVersion]
    );
  }

  async recordCompaction(input: {
    sessionId: string;
    beforeMessageCount: number;
    afterMessageCount: number;
    compressedTokenEstimate: number;
    summaryVersion: number;
    firstCompactedMessageId: string | null;
    lastCompactedMessageId: string | null;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO session_compactions
      (id, session_id, before_message_count, after_message_count, compressed_token_estimate, summary_version, first_compacted_message_id, last_compacted_message_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        randomUUID(),
        input.sessionId,
        input.beforeMessageCount,
        input.afterMessageCount,
        input.compressedTokenEstimate,
        input.summaryVersion,
        input.firstCompactedMessageId,
        input.lastCompactedMessageId
      ]
    );
  }

  async deleteMessagesByIds(ids: string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    await this.pool.query(`DELETE FROM messages WHERE id = ANY($1::uuid[])`, [ids]);
  }

  async compactSession(input: {
    sessionId: string;
    summaryText: string;
    summaryVersion: number;
    expectedVersion: number;
    deleteMessageIds: string[];
    beforeMessageCount: number;
    afterMessageCount: number;
    compressedTokenEstimate: number;
    firstCompactedMessageId: string | null;
    lastCompactedMessageId: string | null;
  }): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query(
        `UPDATE sessions
         SET summary_text = $2,
             summary_version = $3,
             updated_at = NOW()
         WHERE id = $1 AND summary_version = $4`,
        [input.sessionId, input.summaryText, input.summaryVersion, input.expectedVersion]
      );
      if ((updated.rowCount ?? 0) === 0) {
        await client.query("ROLLBACK");
        return false;
      }
      if (input.deleteMessageIds.length > 0) {
        await client.query(`DELETE FROM messages WHERE id = ANY($1::uuid[])`, [input.deleteMessageIds]);
      }
      await client.query(
        `INSERT INTO session_compactions
        (id, session_id, before_message_count, after_message_count, compressed_token_estimate, summary_version, first_compacted_message_id, last_compacted_message_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          randomUUID(),
          input.sessionId,
          input.beforeMessageCount,
          input.afterMessageCount,
          input.compressedTokenEstimate,
          input.summaryVersion,
          input.firstCompactedMessageId,
          input.lastCompactedMessageId
        ]
      );
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteSession(id: string): Promise<boolean> {
    const result = await this.pool.query(`DELETE FROM sessions WHERE id = $1`, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async titleFromFirstUserMessage(sessionId: string, message: string): Promise<void> {
    const title = sessionTitleFromUserMessage(message);
    if (!title) {
      return;
    }
    await this.pool.query(
      `UPDATE sessions SET title = $2, updated_at = NOW() WHERE id = $1 AND title = $3`,
      [sessionId, title, DEFAULT_SESSION_TITLE]
    );
  }

  static toPromptHistory(messages: SessionMessage[]): ChatMessage[] {
    return messages.map((message) => ({
      role: message.role,
      content: message.content
    }));
  }
}
