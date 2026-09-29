import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { migrateDb } from "./db";
import { SessionRepo } from "./sessionRepo";

function makeRepo(): { db: DatabaseSync; repo: SessionRepo } {
  const db = new DatabaseSync(":memory:");
  migrateDb(db);
  return { db, repo: new SessionRepo(db) };
}

const baseCompactInput = {
  summaryText: "sum",
  summaryVersion: 2,
  expectedVersion: 1,
  deleteMessageIds: [] as string[],
  beforeMessageCount: 10,
  afterMessageCount: 4,
  compressedTokenEstimate: 100,
  firstCompactedMessageId: "a",
  lastCompactedMessageId: "b"
};

describe("compactSession", () => {
  it("版本匹配时更新摘要并删除消息", async () => {
    const { db, repo } = makeRepo();
    const session = await repo.createSession();
    const first = await repo.appendMessage({ sessionId: session.id, role: "user", content: "一" });
    await repo.appendMessage({ sessionId: session.id, role: "assistant", content: "二" });
    await repo.updateSummary(session.id, "old", 1);

    const ok = await repo.compactSession({
      ...baseCompactInput,
      sessionId: session.id,
      deleteMessageIds: [first as string]
    });
    expect(ok).toBe(true);

    const got = await repo.getSession(session.id);
    expect(got?.summaryText).toBe("sum");
    expect(got?.summaryVersion).toBe(2);
    const messages = await repo.listMessages(session.id);
    expect(messages.map((m) => m.content)).toEqual(["二"]);
    db.close();
  });

  it("版本冲突时不删消息并回滚", async () => {
    const { db, repo } = makeRepo();
    const session = await repo.createSession();
    await repo.appendMessage({ sessionId: session.id, role: "user", content: "一" });
    await repo.appendMessage({ sessionId: session.id, role: "assistant", content: "二" });

    const ok = await repo.compactSession({
      ...baseCompactInput,
      sessionId: session.id,
      deleteMessageIds: ["11111111-1111-1111-1111-111111111111"]
    });
    expect(ok).toBe(false);

    const got = await repo.getSession(session.id);
    expect(got?.summaryVersion).toBe(0);
    expect((await repo.listMessages(session.id)).length).toBe(2);
    db.close();
  });
});

describe("listSessions", () => {
  it("按 kind 隔离桌宠与画布会话", async () => {
    const { repo } = makeRepo();
    await repo.createSession("宠", "chat");
    await repo.createSession("布", "desk");
    const chat = await repo.listSessions(10, "chat");
    const desk = await repo.listSessions(10, "desk");
    expect(chat.map((item) => item.title)).toEqual(["宠"]);
    expect(desk.map((item) => item.title)).toEqual(["布"]);
    expect(desk[0].kind).toBe("desk");
  });
});

describe("listMessages", () => {
  it("取最近 N 条并保持正序", async () => {
    const { repo } = makeRepo();
    const session = await repo.createSession();
    for (let i = 0; i < 5; i += 1) {
      await repo.appendMessage({ sessionId: session.id, role: "user", content: String(i) });
    }
    const messages = await repo.listMessages(session.id, 3);
    expect(messages.map((m) => m.content)).toEqual(["2", "3", "4"]);
  });
});

describe("getUsageSummary", () => {
  it("汇总 all/today/byPurpose", async () => {
    const { repo } = makeRepo();
    await repo.insertUsage({
      purpose: "chat",
      model: "m",
      usage: { promptTokens: 10, completionTokens: 5, cachedTokens: 2, totalTokens: 15 }
    });
    const summary = await repo.getUsageSummary();
    expect(summary.all.totalTokens).toBe(15);
    expect(summary.all.turns).toBe(1);
    expect(summary.byPurpose.chat.all.totalTokens).toBe(15);
  });

  it("未知会话用量不触发外键失败", async () => {
    const { repo } = makeRepo();
    await expect(
      repo.insertUsage({
        purpose: "extract",
        model: "m",
        sessionId: "00000000-0000-4000-8000-000000000000",
        usage: { promptTokens: 1, completionTokens: 1, cachedTokens: 0, totalTokens: 2 }
      })
    ).resolves.toBeUndefined();
    const summary = await repo.getUsageSummary();
    expect(summary.all.totalTokens).toBe(2);
  });
});
