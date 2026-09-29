import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { migrateDb } from "../storage/db";
import { CanvasRepo } from "../storage/canvasRepo";
import { CanvasToolHost, runWithCanvasTurn } from "./tool";
import { SessionRepo } from "../storage/sessionRepo";

async function makeHost(): Promise<{ host: CanvasToolHost; sessionId: string; repo: CanvasRepo }> {
  const db = new DatabaseSync(":memory:");
  migrateDb(db);
  const sessions = new SessionRepo(db);
  const session = await sessions.createSession("画布", "desk");
  const repo = new CanvasRepo(db);
  const host = new CanvasToolHost(repo, async () => null);
  host.setEnabled(true, session.id);
  return { host, sessionId: session.id, repo };
}

describe("CanvasToolHost", () => {
  it("未启用时不暴露工具", async () => {
    const { host } = await makeHost();
    host.setEnabled(false);
    expect(host.tools()).toEqual([]);
    expect(await host.execute("canvas_put", { kind: "note", title: "a", body: "b" })).toContain(
      "不可用"
    );
  });

  it("回合上下文里不受全局 setEnabled(false) 影响", async () => {
    const { host, sessionId, repo } = await makeHost();
    await runWithCanvasTurn({ sessionId, hint: "我想了解椎名真昼" }, async () => {
      host.setEnabled(false);
      expect(host.tools().some((tool) => tool.function.name === "canvas_set")).toBe(true);
      const result = await host.execute("canvas_set", {
        items: [{ kind: "note", title: "真昼", body: "轻小说女主角。" }]
      });
      expect(result).toContain("已更新画布");
      expect(repo.list(sessionId)).toHaveLength(1);
    });
  });

  it("写入图表并列出变更", async () => {
    const { host } = await makeHost();
    const result = await host.execute("canvas_put", {
      kind: "chart",
      title: "天气",
      chartType: "line",
      labels: ["一", "二"],
      series: [{ name: "气温", values: [20, 22] }]
    });
    expect(result).toContain("已放到画布");
    const items = host.takeChanges();
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("chart");
    expect(items[0].title).toBe("天气");
  });

  it("拒绝非 http 图片", async () => {
    const { host } = await makeHost();
    const result = await host.execute("canvas_put", {
      kind: "image",
      title: "图",
      url: "javascript:alert(1)"
    });
    expect(result).toContain("http");
    expect(host.takeChanges()).toHaveLength(0);
  });

  it("可用自定义 id 覆盖并删除", async () => {
    const { host } = await makeHost();
    await host.execute("canvas_put", {
      id: "weather-week",
      kind: "note",
      title: "天气",
      body: "缺数据"
    });
    expect(host.takeChanges()[0]?.id).toBe("weather-week");
    expect(await host.execute("canvas_remove", { id: "weather-week" })).toContain("已从画布移除");
    expect(await host.execute("canvas_remove", { id: "weather-week" })).toContain("没有");
  });

  it("卡片正文把字面 \\n 还原成换行", async () => {
    const { host } = await makeHost();
    await host.execute("canvas_put", {
      kind: "card",
      title: "说明",
      body: "第一行\\n第二行"
    });
    expect(host.takeChanges()[0]?.payload).toMatchObject({ body: "第一行\n第二行" });
  });

  it("拒绝待补模板卡", async () => {
    const { host } = await makeHost();
    const result = await host.execute("canvas_put", {
      kind: "card",
      title: "最近一周天气 · 还缺两样东西",
      body: "请把每天气温发给我"
    });
    expect(result).toContain("拒绝");
    expect(host.takeChanges()).toHaveLength(0);
  });

  it("同会话相同标题覆盖而不是再贴一张", async () => {
    const { host, sessionId, repo } = await makeHost();
    await host.execute("canvas_put", {
      kind: "chart",
      title: "上海一周天气",
      chartType: "line",
      labels: ["一"],
      series: [{ name: "最高", values: [20] }]
    });
    await host.execute("canvas_put", {
      kind: "chart",
      title: "上海 一周 天气",
      chartType: "line",
      labels: ["一", "二"],
      series: [{ name: "最高", values: [20, 22] }]
    });
    expect(repo.list(sessionId)).toHaveLength(1);
    const chart = repo.list(sessionId)[0]?.payload as { labels?: string[] };
    expect(chart.labels).toEqual(["一", "二"]);
  });

  it("活板已有卡时 put 新主题被拒绝", async () => {
    const { host, sessionId, repo } = await makeHost();
    await host.execute("canvas_put", { kind: "note", title: "旧卡", body: "a" });
    const denied = await host.execute("canvas_put", { kind: "note", title: "新卡", body: "b" });
    expect(denied).toContain("canvas_set");
    expect(repo.list(sessionId)).toHaveLength(1);
    const covered = await host.execute("canvas_put", { kind: "note", title: "旧卡", body: "updated" });
    expect(covered).toContain("已放到画布");
    expect(repo.list(sessionId)[0]?.payload).toMatchObject({ body: "updated" });
  });

  it("换页话术禁止 insert 型 put", async () => {
    const { host } = await makeHost();
    host.setTurnHint("换成这一页天气图");
    const denied = await host.execute("canvas_put", { kind: "note", title: "新", body: "x" });
    expect(denied).toContain("canvas_set");
  });

  it("概念题拒绝空图表", async () => {
    const { host } = await makeHost();
    host.setTurnHint("虚拟内存是什么");
    const result = await host.execute("canvas_put", {
      kind: "chart",
      title: "虚存",
      chartType: "bar",
      labels: ["a"],
      series: [{ name: "x", values: [1] }]
    });
    expect(result).toContain("kind=card");
  });

  it("按 ids 重排 z", async () => {
    const { sessionId, repo } = await makeHost();
    const a = repo.upsert({ sessionId, kind: "note", title: "A", payload: { body: "a" } });
    const b = repo.upsert({ sessionId, kind: "note", title: "B", payload: { body: "b" } });
    const ordered = repo.reorder(sessionId, [b.id, a.id]);
    expect(ordered.map((item) => item.id)).toEqual([b.id, a.id]);
    expect(ordered[0]?.z).toBe(1);
    expect(ordered[1]?.z).toBe(2);
  });

  it("不同会话活板隔离", async () => {
    const db = new DatabaseSync(":memory:");
    migrateDb(db);
    const sessions = new SessionRepo(db);
    const a = await sessions.createSession("A", "desk");
    const b = await sessions.createSession("B", "desk");
    const repo = new CanvasRepo(db);
    const hostA = new CanvasToolHost(repo, async () => null);
    hostA.setEnabled(true, a.id);
    await hostA.execute("canvas_put", {
      kind: "note",
      title: "仅A",
      body: "hello"
    });
    expect(repo.list(a.id)).toHaveLength(1);
    expect(repo.list(b.id)).toHaveLength(0);
  });

  it("按回合归档快照", async () => {
    const db = new DatabaseSync(":memory:");
    migrateDb(db);
    const sessions = new SessionRepo(db);
    const session = await sessions.createSession("画布", "desk");
    const userId = await sessions.appendMessage({
      sessionId: session.id,
      role: "user",
      content: "天气"
    });
    const repo = new CanvasRepo(db);
    repo.saveSnapshot({
      turnId: "turn-1",
      sessionId: session.id,
      userMessageId: userId as string,
      document: { version: 1, turnId: "turn-1", sessionId: session.id, items: [] }
    });
    repo.saveActivity({
      turnId: "turn-1",
      sessionId: session.id,
      userMessageId: userId as string,
      steps: [{ kind: "tool", name: "联网", detail: "已检索", elapsedMs: 12 }]
    });
    expect(repo.listSnapshots(session.id)[0]?.turnId).toBe("turn-1");
    expect(repo.listActivity(session.id)[0]?.steps[0]?.name).toBe("联网");
  });

  it("canvas_set 以提交列表为准并删掉旧卡", async () => {
    const { host, sessionId, repo } = await makeHost();
    await host.execute("canvas_put", { kind: "note", title: "旧卡", body: "gone" });
    const result = await host.execute("canvas_set", {
      items: [
        {
          kind: "table",
          title: "气温",
          columns: ["日", "高"],
          rows: [["一", "20"]]
        },
        {
          kind: "markdown",
          title: "说明",
          body: "# 标题\n- 列表"
        }
      ]
    });
    expect(result).toContain("已更新画布：2");
    const items = repo.list(sessionId);
    expect(items.map((item) => item.kind).sort()).toEqual(["markdown", "table"]);
    expect(items.some((item) => item.title === "旧卡")).toBe(false);
  });

  it("canvas_set 接受 cards 别名", async () => {
    const { host, sessionId, repo } = await makeHost();
    const result = await host.execute("canvas_set", {
      cards: [
        {
          kind: "card",
          title: "今汐",
          kicker: "鸣潮",
          body: "今州令尹"
        }
      ]
    });
    expect(result).toContain("已更新画布：1");
    expect(repo.list(sessionId)[0]?.title).toBe("今汐");
  });

  it("新人物题 canvas_set 丢掉上一回合的人物卡", async () => {
    const { host, sessionId, repo } = await makeHost();
    host.setTurnHint("我想了解椎名真昼");
    await host.execute("canvas_set", {
      items: [{ kind: "card", title: "椎名真昼", body: "女主角" }]
    });
    host.setTurnHint("我想了解鸣潮的爱弥斯");
    const result = await host.execute("canvas_set", {
      items: [
        { kind: "card", title: "椎名真昼", body: "女主角" },
        { kind: "card", title: "爱弥斯", body: "电子幽灵" }
      ]
    });
    expect(result).toContain("已更新画布：1");
    const titles = repo.list(sessionId).map((item) => item.title);
    expect(titles).toEqual(["爱弥斯"]);
  });

  it("可从快照恢复活板", async () => {
    const db = new DatabaseSync(":memory:");
    migrateDb(db);
    const sessions = new SessionRepo(db);
    const session = await sessions.createSession("画布", "desk");
    const userId = await sessions.appendMessage({
      sessionId: session.id,
      role: "user",
      content: "当时"
    });
    const repo = new CanvasRepo(db);
    repo.upsert({ sessionId: session.id, kind: "note", title: "现", payload: { body: "now" } });
    repo.saveSnapshot({
      turnId: "turn-restore",
      sessionId: session.id,
      userMessageId: userId as string,
      document: {
        version: 1,
        turnId: "turn-restore",
        sessionId: session.id,
        items: [
          {
            id: "snap-a",
            kind: "card",
            title: "当时",
            payload: { body: "old" },
            x: 0,
            y: 0,
            w: 200,
            h: 100,
            z: 1,
            sourceSessionId: session.id,
            createdAt: "t",
            updatedAt: "t"
          }
        ]
      }
    });
    const items = repo.restoreFromSnapshot(session.id, "turn-restore");
    expect(items).toHaveLength(1);
    expect(items?.[0].title).toBe("当时");
  });

  it("知识卡写入 kicker，人物补肖像", async () => {
    const db = new DatabaseSync(":memory:");
    migrateDb(db);
    const sessions = new SessionRepo(db);
    const session = await sessions.createSession("画布", "desk");
    const repo = new CanvasRepo(db);
    const host = new CanvasToolHost(repo, async (name) =>
      name === "爱因斯坦" ? "https://upload.wikimedia.org/e.jpg" : null
    );
    host.setEnabled(true, session.id);
    host.setTurnHint("爱因斯坦是谁");
    await host.execute("canvas_put", {
      kind: "card",
      title: "爱因斯坦",
      kicker: "物理学家",
      body: "相对论。",
      tags: ["物理"]
    });
    const written = repo.list(session.id)[0];
    expect(written?.payload).toMatchObject({
      body: "相对论。",
      kicker: "物理学家",
      tags: ["物理"],
      portraitPending: true
    });
    expect((written?.payload as { portraitUrl?: string }).portraitUrl).toBeUndefined();
    await host.flushPortraits(session.id);
    expect(repo.list(session.id)[0]?.payload).toMatchObject({
      body: "相对论。",
      kicker: "物理学家",
      portraitUrl: "https://upload.wikimedia.org/e.jpg",
      tags: ["物理"]
    });
    expect((repo.list(session.id)[0]?.payload as { portraitPending?: boolean }).portraitPending).toBeUndefined();
  });

  it("萌娘百科问法用人名去配肖像", async () => {
    const db = new DatabaseSync(":memory:");
    migrateDb(db);
    const sessions = new SessionRepo(db);
    const session = await sessions.createSession("画布", "desk");
    const repo = new CanvasRepo(db);
    const names: string[] = [];
    const host = new CanvasToolHost(repo, async (name) => {
      names.push(name);
      return "https://img.moegirl.org.cn/m.jpg";
    });
    host.setEnabled(true, session.id);
    host.setTurnHint("我想了解椎名真昼，可以在萌娘百科");
    await host.execute("canvas_put", {
      kind: "card",
      title: "椎名真昼",
      body: "轻小说女主角。"
    });
    await host.flushPortraits(session.id);
    expect(names).toEqual(["椎名真昼"]);
    expect(repo.list(session.id)[0]?.payload).toMatchObject({
      portraitUrl: "https://img.moegirl.org.cn/m.jpg"
    });
  });

  it("词条页链接不当肖像，改为查找", async () => {
    const db = new DatabaseSync(":memory:");
    migrateDb(db);
    const sessions = new SessionRepo(db);
    const session = await sessions.createSession("画布", "desk");
    const repo = new CanvasRepo(db);
    const host = new CanvasToolHost(repo, async () => "https://storage.moegirl.org.cn/moegirl/commons/x.PNG");
    host.setEnabled(true, session.id);
    host.setTurnHint("我想了解椎名真昼");
    await host.execute("canvas_put", {
      kind: "card",
      title: "椎名真昼",
      body: "轻小说女主角。",
      portraitUrl: "https://zh.moegirl.org.cn/椎名真昼"
    });
    expect((repo.list(session.id)[0]?.payload as { portraitUrl?: string }).portraitUrl).toBeUndefined();
    await host.flushPortraits(session.id);
    expect(repo.list(session.id)[0]?.payload).toMatchObject({
      portraitUrl: "https://storage.moegirl.org.cn/moegirl/commons/x.PNG"
    });
  });

  it("人物图无 url 时用肖像查找", async () => {
    const db = new DatabaseSync(":memory:");
    migrateDb(db);
    const sessions = new SessionRepo(db);
    const session = await sessions.createSession("画布", "desk");
    const repo = new CanvasRepo(db);
    const host = new CanvasToolHost(repo, async () => "https://upload.wikimedia.org/p.jpg");
    host.setEnabled(true, session.id);
    const result = await host.execute("canvas_put", { kind: "image", title: "居里夫人" });
    expect(result).toContain("已放到画布");
    expect(host.takeChanges()[0]?.payload).toMatchObject({ url: "https://upload.wikimedia.org/p.jpg" });
  });

  it("合法肖像地址同步写入，不查找", async () => {
    const db = new DatabaseSync(":memory:");
    migrateDb(db);
    const sessions = new SessionRepo(db);
    const session = await sessions.createSession("画布", "desk");
    const repo = new CanvasRepo(db);
    const names: string[] = [];
    const host = new CanvasToolHost(repo, async (name) => {
      names.push(name);
      return "https://upload.wikimedia.org/ignored.jpg";
    });
    host.setEnabled(true, session.id);
    host.setTurnHint("爱因斯坦是谁");
    await host.execute("canvas_put", {
      kind: "card",
      title: "爱因斯坦",
      body: "相对论。",
      portraitUrl: "https://upload.wikimedia.org/e.jpg"
    });
    expect(repo.list(session.id)[0]?.payload).toMatchObject({
      portraitUrl: "https://upload.wikimedia.org/e.jpg"
    });
    expect((repo.list(session.id)[0]?.payload as { portraitPending?: boolean }).portraitPending).toBeUndefined();
    await host.flushPortraits(session.id);
    expect(names).toEqual([]);
  });

  it("同一姓名只查找一次，失败后会再查", async () => {
    const db = new DatabaseSync(":memory:");
    migrateDb(db);
    const sessions = new SessionRepo(db);
    const session = await sessions.createSession("画布", "desk");
    const repo = new CanvasRepo(db);
    const names: string[] = [];
    let failFirst = true;
    const host = new CanvasToolHost(repo, async (name) => {
      names.push(name);
      if (failFirst) {
        failFirst = false;
        return null;
      }
      return "https://upload.wikimedia.org/e.jpg";
    });
    host.setEnabled(true, session.id);
    host.setTurnHint("爱因斯坦是谁");
    await host.execute("canvas_put", {
      kind: "card",
      title: "爱因斯坦",
      body: "第一遍。"
    });
    await host.flushPortraits(session.id);
    expect((repo.list(session.id)[0]?.payload as { portraitUrl?: string }).portraitUrl).toBeUndefined();
    await host.execute("canvas_put", {
      kind: "card",
      title: "爱因斯坦",
      body: "第二遍。"
    });
    await host.flushPortraits(session.id);
    expect(names).toEqual(["爱因斯坦", "爱因斯坦"]);
    expect(repo.list(session.id)[0]?.payload).toMatchObject({
      body: "第二遍。",
      portraitUrl: "https://upload.wikimedia.org/e.jpg"
    });
    await host.execute("canvas_put", {
      kind: "card",
      title: "爱因斯坦",
      body: "第三遍。"
    });
    await host.flushPortraits(session.id);
    expect(names).toEqual(["爱因斯坦", "爱因斯坦"]);
    expect(repo.list(session.id)[0]?.payload).toMatchObject({
      body: "第三遍。",
      portraitUrl: "https://upload.wikimedia.org/e.jpg"
    });
  });

  it("人物图查找失败则不写库", async () => {
    const db = new DatabaseSync(":memory:");
    migrateDb(db);
    const sessions = new SessionRepo(db);
    const session = await sessions.createSession("画布", "desk");
    const repo = new CanvasRepo(db);
    const host = new CanvasToolHost(repo, async () => null);
    host.setEnabled(true, session.id);
    const result = await host.execute("canvas_put", { kind: "image", title: "居里夫人" });
    expect(result).toContain("图片需要");
    expect(repo.list(session.id)).toHaveLength(0);
  });

  it("人物对照卡按短标题配肖像", async () => {
    const db = new DatabaseSync(":memory:");
    migrateDb(db);
    const sessions = new SessionRepo(db);
    const session = await sessions.createSession("画布", "desk");
    const repo = new CanvasRepo(db);
    const names: string[] = [];
    const host = new CanvasToolHost(repo, async (name) => {
      names.push(name);
      return `https://upload.wikimedia.org/${encodeURIComponent(name)}.jpg`;
    });
    host.setEnabled(true, session.id);
    host.setTurnHint("分析邻家天使的椎名真昼和白圣女中的塞西莉亚的异同");
    await host.execute("canvas_set", {
      items: [
        { kind: "card", title: "椎名真昼", kicker: "角色", body: "A。" },
        { kind: "card", title: "塞西莉亚", kicker: "角色", body: "B。" },
        {
          kind: "markdown",
          title: "异同与萌点",
          body: "都认真，真昼偏生活，塞西莉亚偏圣洁。"
        }
      ]
    });
    await host.flushPortraits(session.id);
    expect(names).toEqual(["邻家天使 椎名真昼", "白圣女 塞西莉亚"]);
    expect((repo.list(session.id)[0]?.payload as { portraitUrl?: string }).portraitUrl).toContain("upload.wikimedia.org");
  });

  it("对照题两张人物卡可以落盘", async () => {
    const { host, repo, sessionId } = await makeHost();
    host.setTurnHint("分析椎名真昼和塞西莉亚的异同");
    const result = await host.execute("canvas_set", {
      items: [
        { kind: "card", title: "椎名真昼", body: "邻家天使的女主角，擅长料理。" },
        { kind: "card", title: "塞西莉亚", body: "白圣女，认真圣洁。" }
      ]
    });
    expect(result).toContain("已更新画布：2");
    expect(repo.list(sessionId).map((item) => item.title)).toEqual(["椎名真昼", "塞西莉亚"]);
  });

  it("影视图书卡按作品名配图", async () => {
    const db = new DatabaseSync(":memory:");
    migrateDb(db);
    const sessions = new SessionRepo(db);
    const session = await sessions.createSession("画布", "desk");
    const repo = new CanvasRepo(db);
    const names: string[] = [];
    const host = new CanvasToolHost(repo, async (name) => {
      names.push(name);
      return "https://upload.wikimedia.org/cover.jpg";
    });
    host.setEnabled(true, session.id);
    host.setTurnHint("孤独摇滚这部番怎么样");
    await host.execute("canvas_put", {
      kind: "card",
      title: "孤独摇滚",
      kicker: "动画",
      body: "乐队题材。"
    });
    await host.flushPortraits(session.id);
    expect(names).toEqual(["孤独摇滚"]);
    expect(repo.list(session.id)[0]?.payload).toMatchObject({
      portraitUrl: "https://upload.wikimedia.org/cover.jpg"
    });
  });

  it("作品名括号标题会查图，找不到则去掉占位", async () => {
    const db = new DatabaseSync(":memory:");
    migrateDb(db);
    const sessions = new SessionRepo(db);
    const session = await sessions.createSession("画布", "desk");
    const repo = new CanvasRepo(db);
    const names: string[] = [];
    const host = new CanvasToolHost(repo, async (name) => {
      names.push(name);
      return null;
    });
    host.setEnabled(true, session.id);
    host.setTurnHint("收集一下鸣潮3.7版本情报信息");
    await host.execute("canvas_set", {
      items: [
        {
          kind: "card",
          title: "心（鸣潮）",
          kicker: "Ver.3.7 登场的新五星共鸣者",
          body: "新五星共鸣者。"
        }
      ]
    });
    expect(repo.list(session.id)[0]?.payload).toMatchObject({ portraitPending: true });
    await host.flushPortraits(session.id);
    expect(names).toEqual(["鸣潮 心"]);
    expect((repo.list(session.id)[0]?.payload as { portraitPending?: boolean }).portraitPending).toBeUndefined();
    expect((repo.list(session.id)[0]?.payload as { portraitUrl?: string }).portraitUrl).toBeUndefined();
  });
});
