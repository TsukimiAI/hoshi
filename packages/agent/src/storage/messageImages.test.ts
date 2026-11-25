import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DB_SCHEMA_VERSION, migrateDb, openDatabase, userVersion } from "./db";
import { ChatImageStore, findImageLookback, historyWithLookback } from "../chatImages";
import { SessionRepo } from "./sessionRepo";

const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const dirs: string[] = [];

function makeRepo(): { repo: SessionRepo; root: string } {
  const root = mkdtempSync(join(tmpdir(), "hoshi-img-"));
  dirs.push(root);
  const db = openDatabase(":memory:");
  migrateDb(db);
  return { repo: new SessionRepo(db, new ChatImageStore(join(root, "chat-images"))), root };
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("message images", () => {
  it("schema version 跟上迁移", () => {
    const db = openDatabase(":memory:");
    migrateDb(db);
    expect(userVersion(db)).toBe(DB_SCHEMA_VERSION);
    db.close();
  });

  it("保存后能读回，删除消息和会话时文件一起消失", async () => {
    const { repo, root } = makeRepo();
    const session = await repo.createSession();
    const messageId = await repo.appendMessage({ sessionId: session.id, role: "user", content: "看图" });
    expect(messageId).toBeTruthy();
    await repo.saveMessageImages(session.id, messageId as string, [{ mime: "image/png", data: PNG }]);
    const listed = await repo.listMessages(session.id);
    expect(listed[0]?.imageCount).toBe(1);
    const read = await repo.readMessageImages(messageId as string);
    expect(read[0]?.mime).toBe("image/png");
    expect(read[0]?.data).toBe(PNG);
    const fileDir = join(root, "chat-images", session.id, messageId as string);
    expect(existsSync(fileDir)).toBe(true);

    await repo.deleteMessage(messageId as string);
    expect(existsSync(fileDir)).toBe(false);
    expect(await repo.readMessageImages(messageId as string)).toEqual([]);

    const again = await repo.appendMessage({ sessionId: session.id, role: "user", content: "再看" });
    await repo.saveMessageImages(session.id, again as string, [{ mime: "image/png", data: PNG }]);
    await repo.deleteSession(session.id);
    expect(existsSync(join(root, "chat-images", session.id))).toBe(false);
  });

  it("压缩删掉的消息不再留文件", async () => {
    const { repo, root } = makeRepo();
    const session = await repo.createSession();
    const first = await repo.appendMessage({ sessionId: session.id, role: "user", content: "一" });
    await repo.appendMessage({ sessionId: session.id, role: "assistant", content: "二" });
    await repo.saveMessageImages(session.id, first as string, [{ mime: "image/png", data: PNG }]);
    await repo.updateSummary(session.id, "old", 1);
    const ok = await repo.compactSession({
      sessionId: session.id,
      summaryText: "sum",
      summaryVersion: 2,
      expectedVersion: 1,
      deleteMessageIds: [first as string],
      beforeMessageCount: 2,
      afterMessageCount: 1,
      compressedTokenEstimate: 10,
      firstCompactedMessageId: first,
      lastCompactedMessageId: first
    });
    expect(ok).toBe(true);
    expect(existsSync(join(root, "chat-images", session.id, first as string))).toBe(false);
    expect((await repo.listMessages(session.id)).map((item) => item.imageCount)).toEqual([0]);
  });

  it("拒绝跳出图片目录", () => {
    const root = mkdtempSync(join(tmpdir(), "hoshi-img-"));
    dirs.push(root);
    const store = new ChatImageStore(join(root, "chat-images"));
    expect(store.read("../secret")).toBeNull();
    expect(store.resolveInside("../secret")).toBeNull();
  });
});

describe("historyWithLookback", () => {
  const shot = [{ mime: "image/png", data: PNG }];

  it("本轮无图时只挂最近一条用户图", () => {
    const history = [
      { role: "user" as const, content: "第一张" },
      { role: "assistant" as const, content: "好" },
      { role: "user" as const, content: "第二张" }
    ];
    const placed = historyWithLookback(history, { historyIndex: 2, images: shot });
    expect(placed[0]?.content).toBe("第一张");
    expect(placed[2]?.content).toEqual([
      { type: "text", text: "第二张" },
      { type: "image_url", image_url: { url: `data:image/png;base64,${PNG}` } }
    ]);
  });

  it("没有回看或下标不是用户消息时保持纯文字", () => {
    const history = [{ role: "assistant" as const, content: "好" }];
    expect(historyWithLookback(history, null)[0]?.content).toBe("好");
    expect(historyWithLookback(history, { historyIndex: 0, images: shot })[0]?.content).toBe("好");
  });

  it("findImageLookback 跳过更早的图并算上摘要偏移", () => {
    const found = findImageLookback(
      [
        { id: "a", role: "user", imageCount: 1 },
        { id: "b", role: "assistant", imageCount: 0 },
        { id: "c", role: "user", imageCount: 2 }
      ],
      1
    );
    expect(found).toEqual({ historyIndex: 3, messageId: "c" });
  });
});
