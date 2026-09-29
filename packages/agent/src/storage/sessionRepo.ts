import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { nowIso } from "./db";
import {
  DEFAULT_SESSION_TITLE,
  SESSION_TITLE_MAX_LEN,
  sessionTitleFromUserMessage,
  type ChatMessage,
  type ChatMessageRole,
  type Emotion,
  type LlmUsage,
  type SessionItem,
  type SessionKind,
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
  const kind = row.kind === "desk" ? "desk" : "chat";
  return {
    id: String(row.id),
    title: String(row.title),
    kind,
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

function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(",");
}

function shanghaiDayStartIso(): string {
  const now = new Date();
  const shifted = new Date(now.getTime() + 8 * 3600_000);
  const startUtcMs = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - 8 * 3600_000;
  return new Date(startUtcMs).toISOString();
}

export class SessionRepo {
  constructor(private readonly db: DatabaseSync) {}

  async createSession(title?: string, kind: SessionKind = "chat"): Promise<SessionItem> {
    const normalizedTitle = (title?.trim() || DEFAULT_SESSION_TITLE).slice(0, SESSION_TITLE_MAX_LEN);
    const id = randomUUID();
    const now = nowIso();
    const sessionKind: SessionKind = kind === "desk" ? "desk" : "chat";
    const row = this.db
      .prepare(
        `INSERT INTO sessions (id, title, kind, created_at, updated_at) VALUES (?, ?, ?, ?, ?) RETURNING *`
      )
      .get(id, normalizedTitle, sessionKind, now, now) as Record<string, unknown> | undefined;
    return mapSessionRow(row as Record<string, unknown>);
  }

  async getSession(id: string): Promise<(SessionItem & { summaryText: string }) | null> {
    const row = this.db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      return null;
    }
    return {
      ...mapSessionRow(row),
      summaryText: String(row.summary_text ?? "")
    };
  }

  async listSessions(limit = 30, kind: SessionKind = "chat"): Promise<SessionItem[]> {
    const safeLimit = Math.max(1, Math.min(limit, 100));
    const sessionKind: SessionKind = kind === "desk" ? "desk" : "chat";
    const rows = this.db
      .prepare(
        `SELECT * FROM sessions WHERE kind = ? ORDER BY COALESCE(last_message_at, updated_at) DESC LIMIT ?`
      )
      .all(sessionKind, safeLimit) as unknown as Record<string, unknown>[];
    return rows.map((row) => mapSessionRow(row));
  }

  async listMessages(sessionId: string, limit = 120): Promise<SessionMessage[]> {
    const safeLimit = Math.max(1, Math.min(limit, 400));
    const rows = this.db
      .prepare(
        `SELECT * FROM (
           SELECT * FROM messages WHERE session_id = ? ORDER BY created_at DESC, id DESC LIMIT ?
         ) ORDER BY created_at ASC, id ASC`
      )
      .all(sessionId, safeLimit) as unknown as Record<string, unknown>[];
    return rows.map((row) => mapMessageRow(row));
  }

  async deleteMessage(id: string): Promise<void> {
    this.db.prepare(`DELETE FROM messages WHERE id = ?`).run(id);
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
    this.db
      .prepare(
        `INSERT INTO messages (id, session_id, role, content, emotion, token_estimate, prompt_tokens, completion_tokens, cached_tokens, total_tokens, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.sessionId,
        input.role,
        content,
        input.emotion ?? null,
        tokenEstimate,
        input.usage?.promptTokens ?? null,
        input.usage?.completionTokens ?? null,
        input.usage?.cachedTokens ?? null,
        input.usage?.totalTokens ?? null,
        nowIso()
      );
    this.db
      .prepare(`UPDATE sessions SET updated_at = ?, last_message_at = ? WHERE id = ?`)
      .run(nowIso(), nowIso(), input.sessionId);
    return id;
  }

  async getSessionStats(sessionId: string): Promise<SessionStats> {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS message_count, COALESCE(SUM(token_estimate), 0) AS token_sum
         FROM messages WHERE session_id = ?`
      )
      .get(sessionId) as Record<string, unknown> | undefined;
    return {
      messageCount: Number(row?.message_count ?? 0),
      tokenEstimateSum: Number(row?.token_sum ?? 0)
    };
  }

  async insertUsage(input: {
    purpose: UsagePurpose;
    model: string;
    sessionId?: string;
    usage: LlmUsage;
  }): Promise<void> {
    let sessionId = asSessionUuid(input.sessionId);
    if (sessionId) {
      const row = this.db.prepare(`SELECT id FROM sessions WHERE id = ?`).get(sessionId) as
        | { id?: string }
        | undefined;
      if (!row?.id) {
        sessionId = null;
      }
    }
    this.db
      .prepare(
        `INSERT INTO llm_usage (id, purpose, model, session_id, prompt_tokens, completion_tokens, cached_tokens, total_tokens, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        randomUUID(),
        input.purpose,
        input.model,
        sessionId,
        input.usage.promptTokens,
        input.usage.completionTokens,
        input.usage.cachedTokens,
        input.usage.totalTokens,
        nowIso()
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
      COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
      COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
      COALESCE(SUM(cached_tokens), 0) AS cached_tokens,
      COALESCE(SUM(total_tokens), 0) AS total_tokens,
      COUNT(*) AS turns`;
    const all = this.db.prepare(`SELECT ${sumCols} FROM llm_usage`).get() as
      | Record<string, unknown>
      | undefined;
    const today = this.db
      .prepare(`SELECT ${sumCols} FROM llm_usage WHERE created_at >= ?`)
      .get(shanghaiDayStartIso()) as Record<string, unknown> | undefined;
    const purposeAll = this.db
      .prepare(`SELECT purpose, ${sumCols} FROM llm_usage GROUP BY purpose`)
      .all() as unknown as Record<string, unknown>[];
    const purposeToday = this.db
      .prepare(`SELECT purpose, ${sumCols} FROM llm_usage WHERE created_at >= ? GROUP BY purpose`)
      .all(shanghaiDayStartIso()) as unknown as Record<string, unknown>[];
    const byPurpose = Object.fromEntries(
      USAGE_PURPOSES.map((purpose) => [purpose, { all: empty, today: empty }])
    ) as UsageSummaryResponse["byPurpose"];
    for (const row of purposeAll) {
      const purpose = row.purpose as UsagePurpose;
      if (byPurpose[purpose]) {
        byPurpose[purpose] = { ...byPurpose[purpose], all: mapTotals(row) };
      }
    }
    for (const row of purposeToday) {
      const purpose = row.purpose as UsagePurpose;
      if (byPurpose[purpose]) {
        byPurpose[purpose] = { ...byPurpose[purpose], today: mapTotals(row) };
      }
    }
    const sessions = this.db
      .prepare(
        `SELECT s.id AS session_id, s.title,
                COALESCE(SUM(u.prompt_tokens), 0) AS prompt_tokens,
                COALESCE(SUM(u.completion_tokens), 0) AS completion_tokens,
                COALESCE(SUM(u.cached_tokens), 0) AS cached_tokens,
                COALESCE(SUM(u.total_tokens), 0) AS total_tokens,
                COUNT(*) AS turns
         FROM sessions s
         JOIN llm_usage u ON u.session_id = s.id
         GROUP BY s.id, s.title
         ORDER BY SUM(u.total_tokens) DESC
         LIMIT 20`
      )
      .all() as unknown as Record<string, unknown>[];
    return {
      all: mapTotals(all),
      today: mapTotals(today),
      byPurpose,
      sessions: sessions.map(
        (row): SessionUsageItem => ({
          sessionId: String(row.session_id),
          title: String(row.title),
          promptTokens: Number(row.prompt_tokens ?? 0),
          completionTokens: Number(row.completion_tokens ?? 0),
          cachedTokens: Number(row.cached_tokens ?? 0),
          totalTokens: Number(row.total_tokens ?? 0),
          turns: Number(row.turns ?? 0)
        })
      )
    };
  }

  async updateSummary(sessionId: string, summaryText: string, summaryVersion: number): Promise<void> {
    this.db
      .prepare(`UPDATE sessions SET summary_text = ?, summary_version = ?, updated_at = ? WHERE id = ?`)
      .run(summaryText, summaryVersion, nowIso(), sessionId);
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
    this.db
      .prepare(
        `INSERT INTO session_compactions
         (id, session_id, before_message_count, after_message_count, compressed_token_estimate, summary_version, first_compacted_message_id, last_compacted_message_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        randomUUID(),
        input.sessionId,
        input.beforeMessageCount,
        input.afterMessageCount,
        input.compressedTokenEstimate,
        input.summaryVersion,
        input.firstCompactedMessageId,
        input.lastCompactedMessageId,
        nowIso()
      );
  }

  async deleteMessagesByIds(ids: string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    this.db.prepare(`DELETE FROM messages WHERE id IN (${placeholders(ids.length)})`).run(...ids);
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
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const updated = this.db
        .prepare(
          `UPDATE sessions SET summary_text = ?, summary_version = ?, updated_at = ? WHERE id = ? AND summary_version = ?`
        )
        .run(input.summaryText, input.summaryVersion, nowIso(), input.sessionId, input.expectedVersion);
      if (updated.changes === 0) {
        this.db.exec("ROLLBACK");
        return false;
      }
      if (input.deleteMessageIds.length > 0) {
        this.db
          .prepare(`DELETE FROM messages WHERE id IN (${placeholders(input.deleteMessageIds.length)})`)
          .run(...input.deleteMessageIds);
      }
      this.db
        .prepare(
          `INSERT INTO session_compactions
           (id, session_id, before_message_count, after_message_count, compressed_token_estimate, summary_version, first_compacted_message_id, last_compacted_message_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          randomUUID(),
          input.sessionId,
          input.beforeMessageCount,
          input.afterMessageCount,
          input.compressedTokenEstimate,
          input.summaryVersion,
          input.firstCompactedMessageId,
          input.lastCompactedMessageId,
          nowIso()
        );
      this.db.exec("COMMIT");
      return true;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  async deleteSession(id: string): Promise<boolean> {
    const result = this.db.prepare(`DELETE FROM sessions WHERE id = ?`).run(id);
    return result.changes > 0;
  }

  async titleFromFirstUserMessage(sessionId: string, message: string): Promise<void> {
    const title = sessionTitleFromUserMessage(message);
    if (!title) {
      return;
    }
    this.db
      .prepare(`UPDATE sessions SET title = ?, updated_at = ? WHERE id = ? AND title = ?`)
      .run(title, nowIso(), sessionId, DEFAULT_SESSION_TITLE);
  }

  static toPromptHistory(messages: SessionMessage[]): ChatMessage[] {
    return messages.map((message) => ({
      role: message.role,
      content: message.content
    }));
  }
}
