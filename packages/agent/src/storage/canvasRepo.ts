import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type {
  CanvasDocument,
  CanvasItem,
  CanvasKind,
  CanvasPayload,
  CanvasSnapshot,
  CanvasTurnActivity,
  CanvasTurnActivityStep
} from "@hoshi/shared";
import { nowIso } from "./db";

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parsePayload(raw: string): CanvasPayload {
  try {
    return JSON.parse(raw) as CanvasPayload;
  } catch {
    return { body: raw };
  }
}

export function normalizeCanvasTitle(title: string): string {
  return title.replace(/[\s\u3000]+/g, "").toLowerCase();
}

function mapRow(row: Record<string, unknown>): CanvasItem {
  const sessionId = row.session_id ? String(row.session_id) : null;
  return {
    id: String(row.id),
    kind: row.kind as CanvasKind,
    title: String(row.title ?? ""),
    payload: parsePayload(String(row.payload ?? "{}")),
    x: Number(row.x ?? 40),
    y: Number(row.y ?? 40),
    w: Number(row.w ?? 320),
    h: Number(row.h ?? 220),
    z: Number(row.z ?? 0),
    sourceSessionId: row.source_session_id ? String(row.source_session_id) : sessionId,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function nextSlot(existing: CanvasItem[]): { x: number; y: number } {
  const col = existing.length % 3;
  const row = Math.floor(existing.length / 3);
  return { x: 24 + col * 340, y: 24 + row * 250 };
}

export class CanvasRepo {
  constructor(private readonly db: DatabaseSync) {}

  list(sessionId: string, limit = 80): CanvasItem[] {
    const sid = sessionId.trim();
    if (!sid) {
      return [];
    }
    const safe = Math.max(1, Math.min(limit, 200));
    const rows = this.db
      .prepare(
        `SELECT * FROM canvas_items WHERE session_id = ? ORDER BY z ASC, updated_at ASC LIMIT ?`
      )
      .all(sid, safe) as unknown as Record<string, unknown>[];
    return rows.map((row) => mapRow(row));
  }

  get(id: string, sessionId?: string): CanvasItem | null {
    const row = this.db.prepare(`SELECT * FROM canvas_items WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      return null;
    }
    const item = mapRow(row);
    if (sessionId && String(row.session_id ?? "") !== sessionId) {
      return null;
    }
    return item;
  }

  findIdByTitle(sessionId: string, title: string): string | undefined {
    const key = normalizeCanvasTitle(title);
    if (!key) {
      return undefined;
    }
    return this.list(sessionId).find((item) => normalizeCanvasTitle(item.title) === key)?.id;
  }

  upsert(input: {
    sessionId: string;
    id?: string;
    kind: CanvasKind;
    title: string;
    payload: CanvasPayload;
    x?: number;
    y?: number;
    w?: number;
    h?: number;
  }): CanvasItem {
    const sessionId = input.sessionId.trim();
    if (!sessionId) {
      throw new Error("canvas sessionId is required");
    }
    const existingId = input.id?.trim();
    const now = nowIso();
    if (existingId) {
      const prev = this.get(existingId, sessionId);
      if (prev) {
        this.db
          .prepare(
            `UPDATE canvas_items SET kind = ?, title = ?, payload = ?, x = ?, y = ?, w = ?, h = ?,
             source_session_id = ?, updated_at = ? WHERE id = ? AND session_id = ?`
          )
          .run(
            input.kind,
            input.title,
            JSON.stringify(input.payload),
            input.x ?? prev.x,
            input.y ?? prev.y,
            input.w ?? prev.w,
            input.h ?? prev.h,
            sessionId,
            now,
            existingId,
            sessionId
          );
        return this.get(existingId, sessionId) as CanvasItem;
      }
    }
    const items = this.list(sessionId);
    const slot = nextSlot(items);
    const id = existingId || randomUUID();
    const z = items.reduce((max, item) => Math.max(max, item.z), 0) + 1;
    this.db
      .prepare(
        `INSERT INTO canvas_items (id, kind, title, payload, x, y, w, h, z, source_session_id, session_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.kind,
        input.title,
        JSON.stringify(input.payload),
        input.x ?? slot.x,
        input.y ?? slot.y,
        input.w ??
          (input.kind === "chart" ? 620 : input.kind === "table" ? 520 : input.kind === "card" ? 280 : 320),
        input.h ??
          (input.kind === "chart" ? 460 : input.kind === "table" ? 280 : input.kind === "card" ? 200 : 240),
        z,
        sessionId,
        sessionId,
        now,
        now
      );
    return this.get(id, sessionId) as CanvasItem;
  }

  patchLayout(
    id: string,
    patch: { x?: number; y?: number; w?: number; h?: number; z?: number },
    sessionId?: string
  ): CanvasItem | null {
    const prev = this.get(id, sessionId);
    if (!prev) {
      return null;
    }
    this.db
      .prepare(`UPDATE canvas_items SET x = ?, y = ?, w = ?, h = ?, z = ?, updated_at = ? WHERE id = ?`)
      .run(
        patch.x ?? prev.x,
        patch.y ?? prev.y,
        patch.w ?? prev.w,
        patch.h ?? prev.h,
        patch.z ?? prev.z,
        nowIso(),
        id
      );
    return this.get(id, sessionId);
  }

  replaceSession(
    sessionId: string,
    specs: Array<{
      id?: string;
      kind: CanvasKind;
      title: string;
      payload: CanvasPayload;
    }>
  ): CanvasItem[] {
    const sid = sessionId.trim();
    if (!sid) {
      throw new Error("canvas sessionId is required");
    }
    this.db.exec("BEGIN");
    try {
      const kept = new Set<string>();
      const order: string[] = [];
      for (const spec of specs) {
        const requestedId = spec.id?.trim();
        const id =
          (requestedId && this.get(requestedId, sid)?.id) ||
          this.findIdByTitle(sid, spec.title) ||
          requestedId ||
          undefined;
        const item = this.upsert({
          sessionId: sid,
          id,
          kind: spec.kind,
          title: spec.title,
          payload: spec.payload
        });
        kept.add(item.id);
        order.push(item.id);
      }
      for (const existing of this.list(sid, 200)) {
        if (!kept.has(existing.id)) {
          this.remove(existing.id, sid);
        }
      }
      order.forEach((id, index) => {
        this.patchLayout(id, { z: index + 1 }, sid);
      });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.list(sid);
  }

  reorder(sessionId: string, ids: string[]): CanvasItem[] {
    const sid = sessionId.trim();
    if (!sid) {
      return [];
    }
    const existing = this.list(sid, 200);
    const have = new Set(existing.map((item) => item.id));
    const ordered: string[] = [];
    const seen = new Set<string>();
    for (const raw of ids) {
      const id = raw.trim();
      if (have.has(id) && !seen.has(id)) {
        ordered.push(id);
        seen.add(id);
      }
    }
    for (const item of existing) {
      if (!seen.has(item.id)) {
        ordered.push(item.id);
      }
    }
    this.db.exec("BEGIN");
    try {
      ordered.forEach((id, index) => {
        this.patchLayout(id, { z: index + 1 }, sid);
      });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.list(sid);
  }

  getSnapshot(turnId: string): CanvasSnapshot | null {
    const row = this.db
      .prepare(
        `SELECT turn_id, session_id, user_message_id, document, created_at
         FROM canvas_snapshots WHERE turn_id = ?`
      )
      .get(turnId) as Record<string, unknown> | undefined;
    if (!row) {
      return null;
    }
    let document: CanvasDocument;
    try {
      document = JSON.parse(String(row.document)) as CanvasDocument;
    } catch {
      document = {
        version: 1,
        turnId: String(row.turn_id),
        sessionId: String(row.session_id),
        items: []
      };
    }
    return {
      turnId: String(row.turn_id),
      sessionId: String(row.session_id),
      userMessageId: String(row.user_message_id),
      document,
      createdAt: String(row.created_at)
    };
  }

  restoreFromSnapshot(sessionId: string, turnId: string): CanvasItem[] | null {
    const snap = this.getSnapshot(turnId);
    if (!snap || snap.sessionId !== sessionId) {
      return null;
    }
    return this.replaceSession(
      sessionId,
      snap.document.items.map((item) => ({
        id: item.id,
        kind: item.kind,
        title: item.title,
        payload: item.payload
      }))
    );
  }

  remove(id: string, sessionId?: string): boolean {
    if (sessionId) {
      return (
        this.db.prepare(`DELETE FROM canvas_items WHERE id = ? AND session_id = ?`).run(id, sessionId)
          .changes > 0
      );
    }
    return this.db.prepare(`DELETE FROM canvas_items WHERE id = ?`).run(id).changes > 0;
  }

  saveSnapshot(input: {
    turnId: string;
    sessionId: string;
    userMessageId: string;
    document: CanvasDocument;
  }): CanvasSnapshot {
    const createdAt = nowIso();
    this.db
      .prepare(
        `INSERT INTO canvas_snapshots (turn_id, session_id, user_message_id, document, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(turn_id) DO UPDATE SET document = excluded.document, created_at = excluded.created_at`
      )
      .run(input.turnId, input.sessionId, input.userMessageId, JSON.stringify(input.document), createdAt);
    return {
      turnId: input.turnId,
      sessionId: input.sessionId,
      userMessageId: input.userMessageId,
      document: input.document,
      createdAt
    };
  }

  listSnapshots(sessionId: string): CanvasSnapshot[] {
    const rows = this.db
      .prepare(
        `SELECT turn_id, session_id, user_message_id, document, created_at
         FROM canvas_snapshots WHERE session_id = ? ORDER BY created_at ASC`
      )
      .all(sessionId) as unknown as Record<string, unknown>[];
    return rows.map((row) => {
      let document: CanvasDocument;
      try {
        document = JSON.parse(String(row.document)) as CanvasDocument;
      } catch {
        document = {
          version: 1,
          turnId: String(row.turn_id),
          sessionId: String(row.session_id),
          items: []
        };
      }
      return {
        turnId: String(row.turn_id),
        sessionId: String(row.session_id),
        userMessageId: String(row.user_message_id),
        document,
        createdAt: String(row.created_at)
      };
    });
  }

  saveActivity(input: {
    turnId: string;
    sessionId: string;
    userMessageId: string;
    steps: CanvasTurnActivityStep[];
  }): CanvasTurnActivity {
    const createdAt = nowIso();
    this.db
      .prepare(
        `INSERT INTO canvas_turn_activity (turn_id, session_id, user_message_id, steps_json, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(turn_id) DO UPDATE SET steps_json = excluded.steps_json, created_at = excluded.created_at`
      )
      .run(input.turnId, input.sessionId, input.userMessageId, JSON.stringify(input.steps), createdAt);
    return {
      turnId: input.turnId,
      sessionId: input.sessionId,
      userMessageId: input.userMessageId,
      steps: input.steps,
      createdAt
    };
  }

  listActivity(sessionId: string): CanvasTurnActivity[] {
    const rows = this.db
      .prepare(
        `SELECT turn_id, session_id, user_message_id, steps_json, created_at
         FROM canvas_turn_activity WHERE session_id = ? ORDER BY created_at ASC`
      )
      .all(sessionId) as unknown as Record<string, unknown>[];
    return rows.map((row) => {
      let steps: CanvasTurnActivityStep[] = [];
      try {
        const parsed = JSON.parse(String(row.steps_json)) as CanvasTurnActivityStep[];
        steps = Array.isArray(parsed) ? parsed : [];
      } catch {
        steps = [];
      }
      return {
        turnId: String(row.turn_id),
        sessionId: String(row.session_id),
        userMessageId: String(row.user_message_id),
        steps,
        createdAt: String(row.created_at)
      };
    });
  }

  summarizeForPrompt(sessionId: string, limit = 24): string {
    const items = this.list(sessionId, limit);
    if (items.length === 0) {
      return "当前会话画布是空的。";
    }
    return items
      .map((item) => {
        const extra =
          item.kind === "chart"
            ? `图:${asRecord(item.payload)?.chartType ?? "bar"}`
            : item.kind === "image"
              ? String(asRecord(item.payload)?.url ?? "").slice(0, 80)
              : "";
        return `- ${item.kind} id=${item.id} 「${item.title}」${extra ? ` ${extra}` : ""}`;
      })
      .join("\n");
  }
}
