import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import type { ChatSettings } from "@hoshi/shared";
import type { OpenAiCompatClient } from "./llm/openai";
import { buildSessionContext } from "./sessionContext";
import { migrateDb } from "./storage/db";
import { SessionRepo } from "./storage/sessionRepo";

const chat: ChatSettings = {
  contextBudget: 8000,
  compactTriggerToken: 1,
  compactTriggerMsgCount: 2,
  compactKeepRecent: 1,
  referenceSites: "",
  memoryAutoWrite: false,
  deepseekApiKey: "",
  searchBaseUrl: "",
  searchModel: ""
};

describe("buildSessionContext", () => {
  it("压缩和提示都跳过看屏消息", async () => {
    const db = new DatabaseSync(":memory:");
    migrateDb(db);
    const repo = new SessionRepo(db);
    const session = await repo.createSession();
    await repo.appendMessage({ sessionId: session.id, role: "user", content: "第一句普通的" });
    await repo.appendMessage({
      sessionId: session.id,
      role: "assistant",
      content: "老师在看烤肉视频",
      intervalId: "iv-1"
    });
    await repo.appendMessage({ sessionId: session.id, role: "user", content: "第二句普通的" });
    const llm = {
      async completeChat() {
        return { content: "摘要只该有普通对话" };
      }
    };
    const context = await buildSessionContext(repo, session.id, chat, llm as unknown as OpenAiCompatClient);
    const blob = JSON.stringify(context.history);
    expect(blob).not.toContain("烤肉");
    expect(blob).toContain("第二句普通的");
    const left = await repo.listMessages(session.id);
    expect(left.some((item) => item.intervalId === "iv-1" && item.content.includes("烤肉"))).toBe(true);
  });
});
