"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const sessionRepo_1 = require("./sessionRepo");
function fakePool(failOn, updateRowCount = 1) {
    const queries = [];
    const run = async (sql) => {
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
    return { queries, pool: pool };
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
(0, vitest_1.describe)("compactSession", () => {
    (0, vitest_1.it)("BEGIN 后 COMMIT", async () => {
        const { queries, pool } = fakePool();
        await (0, vitest_1.expect)(new sessionRepo_1.SessionRepo(pool).compactSession(compactInput)).resolves.toBe(true);
        (0, vitest_1.expect)(queries[0]).toBe("BEGIN");
        (0, vitest_1.expect)(queries.some((item) => item.startsWith("COMMIT"))).toBe(true);
        (0, vitest_1.expect)(queries.some((item) => item.includes("AND summary_version"))).toBe(true);
        (0, vitest_1.expect)(queries.at(-1)).toBe("release");
    });
    (0, vitest_1.it)("失败 ROLLBACK", async () => {
        const { queries, pool } = fakePool("INSERT INTO session_compactions");
        await (0, vitest_1.expect)(new sessionRepo_1.SessionRepo(pool).compactSession(compactInput)).rejects.toThrow("fail");
        (0, vitest_1.expect)(queries.some((item) => item.startsWith("ROLLBACK"))).toBe(true);
        (0, vitest_1.expect)(queries.at(-1)).toBe("release");
    });
    (0, vitest_1.it)("版本冲突不删消息", async () => {
        const { queries, pool } = fakePool(undefined, 0);
        await (0, vitest_1.expect)(new sessionRepo_1.SessionRepo(pool).compactSession(compactInput)).resolves.toBe(false);
        (0, vitest_1.expect)(queries.some((item) => item.startsWith("ROLLBACK"))).toBe(true);
        (0, vitest_1.expect)(queries.some((item) => item.includes("DELETE FROM messages"))).toBe(false);
    });
});
(0, vitest_1.describe)("listMessages", () => {
    (0, vitest_1.it)("取最近再正序", async () => {
        const { queries, pool } = fakePool();
        await new sessionRepo_1.SessionRepo(pool).listMessages("sid", 12);
        const sql = queries[0] ?? "";
        (0, vitest_1.expect)(sql).toContain("ORDER BY created_at DESC, id DESC");
        (0, vitest_1.expect)(sql).toContain("LIMIT $2");
        (0, vitest_1.expect)(sql).toContain("ORDER BY created_at ASC, id ASC");
    });
});
