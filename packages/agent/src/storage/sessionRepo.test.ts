import { describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { SessionRepo } from "./sessionRepo";

function fakePool(failOn?: string, updateRowCount = 1): { queries: string[]; pool: Pool } {
  const queries: string[] = [];
  const run = async (sql: string) => {
    const normalized = sql.replace(/\s+/g, " ").trim();
    queries.push(normalized);
    if (failOn && normalized.includes(failOn)) {
      throw new Error("fail");
    }
    const rowCount = normalized.startsWith("UPDATE sessions") ? updateRowCount : 1;
    return { rows: [], rowCount };
  };
  const pool = {
    query: run,
    connect: async () => ({
      query: run,
      release: () => {
        queries.push("release");
      }
    })
  };
  return { queries, pool: pool as unknown as Pool };
}

const compactInput = {
  sessionId: "s",
  summaryText: "sum",
  summaryVersion: 2,
  expectedVersion: 1,
  deleteMessageIds: ["11111111-1111-1111-1111-111111111111"],
  beforeMessageCount: 10,
  afterMessageCount: 4,
  compressedTokenEstimate: 100,
  firstCompactedMessageId: "a",
  lastCompactedMessageId: "b"
};

describe("compactSession", () => {
  it("BEGIN 后 COMMIT", async () => {
    const { queries, pool } = fakePool();
    await expect(new SessionRepo(pool).compactSession(compactInput)).resolves.toBe(true);
    expect(queries[0]).toBe("BEGIN");
    expect(queries.some((item) => item.startsWith("COMMIT"))).toBe(true);
    expect(queries.some((item) => item.includes("AND summary_version"))).toBe(true);
    expect(queries.at(-1)).toBe("release");
  });

  it("失败 ROLLBACK", async () => {
    const { queries, pool } = fakePool("INSERT INTO session_compactions");
    await expect(new SessionRepo(pool).compactSession(compactInput)).rejects.toThrow("fail");
    expect(queries.some((item) => item.startsWith("ROLLBACK"))).toBe(true);
    expect(queries.at(-1)).toBe("release");
  });

  it("版本冲突不删消息", async () => {
    const { queries, pool } = fakePool(undefined, 0);
    await expect(new SessionRepo(pool).compactSession(compactInput)).resolves.toBe(false);
    expect(queries.some((item) => item.startsWith("ROLLBACK"))).toBe(true);
    expect(queries.some((item) => item.includes("DELETE FROM messages"))).toBe(false);
  });
});

describe("listMessages", () => {
  it("取最近再正序", async () => {
    const { queries, pool } = fakePool();
    await new SessionRepo(pool).listMessages("sid", 12);
    const sql = queries[0] ?? "";
    expect(sql).toContain("ORDER BY created_at DESC, id DESC");
    expect(sql).toContain("LIMIT $2");
    expect(sql).toContain("ORDER BY created_at ASC, id ASC");
  });
});
