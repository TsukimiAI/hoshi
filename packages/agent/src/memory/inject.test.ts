import { describe, expect, it } from "vitest";
import type { MemoryItem } from "@hoshi/shared";
import {
  buildMemoryAckPrompt,
  buildMemoryInjectPrompt,
  clipMemoryLine,
  mentionsMemory,
  selectAckedMemoryIds,
  selectArchiveMemories,
  selectCoreMemories,
  selectMemoriesForInject
} from "./inject";

function mem(partial: Partial<MemoryItem> & Pick<MemoryItem, "id" | "text" | "kind">): MemoryItem {
  return {
    topic: "",
    status: "active",
    sourceSessionId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ackedAt: null,
    ...partial
  };
}

describe("buildMemoryInjectPrompt", () => {
  it("空列表返回 null", () => {
    expect(buildMemoryInjectPrompt([])).toBeNull();
    expect(buildMemoryInjectPrompt(["  "])).toBeNull();
  });

  it("有内容则加前缀", () => {
    expect(buildMemoryInjectPrompt(["老师喜欢红茶"])).toBe(
      "关于老师的长期记忆：\n- 老师喜欢红茶"
    );
  });

  it("截断过长单条", () => {
    const long = "银杏".repeat(120);
    const prompt = buildMemoryInjectPrompt([long]);
    expect(prompt?.includes("…")).toBe(true);
    expect(clipMemoryLine(long).length).toBeLessThanOrEqual(160);
  });

  it("知识库摘录另栏", () => {
    const prompt = buildMemoryInjectPrompt([
      { text: "老师喜欢红茶" },
      { text: "银杏是孑遗植物。", meta: { source: "knowledge", documentTitle: "植物" } }
    ]);
    expect(prompt).toContain("关于老师的长期记忆：\n- 老师喜欢红茶");
    expect(prompt).toContain("老师摘录的笔记，不是老师本人的话：\n- 银杏是孑遗植物。");
  });
});

describe("buildMemoryAckPrompt", () => {
  it("空则不插", () => {
    expect(buildMemoryAckPrompt([])).toBeNull();
  });

  it("最多两句认账", () => {
    expect(buildMemoryAckPrompt(["老师平时喜欢喝绿茶"])).toContain("用一句星奈口吻带过已记住");
  });
});

describe("mentionsMemory", () => {
  it("好的韩老师确认名字，只回好的不确认红茶", () => {
    expect(mentionsMemory("好的韩老师。", "老师希望被叫做韩")).toBe(true);
    expect(mentionsMemory("好的。", "老师希望被叫做韩")).toBe(false);
    expect(mentionsMemory("好的。", "老师平时喜欢喝红茶")).toBe(false);
    expect(mentionsMemory("好的韩老师。", "老师平时喜欢喝红茶")).toBe(false);
    expect(mentionsMemory("记下红茶了。", "老师平时喜欢喝红茶")).toBe(true);
    expect(mentionsMemory("喝红茶。", "老师平时喜欢喝红茶")).toBe(false);
    expect(mentionsMemory("红茶花开了好大一朵。", "老师平时喜欢喝红茶")).toBe(false);
    expect(mentionsMemory("记下了。", "老师平时喜欢喝红茶")).toBe(false);
  });
});

describe("selectAckedMemoryIds", () => {
  it("只确认对上口的那一条", () => {
    expect(
      selectAckedMemoryIds("好的韩老师。", [
        { id: "name", text: "老师希望被叫做韩" },
        { id: "tea", text: "老师平时喜欢喝红茶" }
      ])
    ).toEqual(["name"]);
    expect(
      selectAckedMemoryIds("好的。", [
        { id: "name", text: "老师希望被叫做韩" },
        { id: "tea", text: "老师平时喜欢喝红茶" }
      ])
    ).toEqual([]);
  });
});

describe("selectMemoriesForInject", () => {
  it("不含 superseded", () => {
    const selected = selectMemoriesForInject(
      [
        mem({ id: "old", kind: "preference", text: "老师以前爱喝红茶", status: "superseded" }),
        mem({ id: "now", kind: "preference", text: "老师平时喜欢喝绿茶" })
      ],
      "喝茶",
      [{ id: "now", score: 0.7 }]
    );
    expect(selected.map((item) => item.id)).toEqual(["now"]);
  });

  it("无档案命中时只带身份", () => {
    const selected = selectMemoriesForInject(
      [
        mem({
          id: "habit",
          kind: "habit",
          text: "老师周末经常加班写代码",
          updatedAt: "2026-06-01T00:00:00.000Z"
        }),
        mem({
          id: "id",
          kind: "identity",
          text: "老师希望被叫做小韩",
          updatedAt: "2026-01-01T00:00:00.000Z"
        })
      ],
      "你好"
    );
    expect(selected.map((item) => item.id)).toEqual(["id"]);
  });

  it("喝什么能召回红茶，不带加班", () => {
    const items = [
      mem({ id: "tea", kind: "preference", text: "老师平时喜欢喝红茶" }),
      mem({ id: "overtime", kind: "habit", text: "老师晚上经常加班" }),
      mem({ id: "name", kind: "identity", text: "老师叫韩" })
    ];
    const selected = selectMemoriesForInject(items, "喝什么", [
      { id: "tea", score: 0.72 },
      { id: "overtime", score: 0.12 }
    ]);
    expect(selected.map((item) => item.id)).toEqual(["name", "tea"]);
  });

  it("6 条身份时 name 仍进核心", () => {
    const items = [
      mem({ id: "job1", kind: "identity", topic: "job", text: "老师是研究生", updatedAt: "2026-06-01T00:00:00.000Z" }),
      mem({ id: "job2", kind: "identity", topic: "job", text: "老师在读硕士", updatedAt: "2026-06-02T00:00:00.000Z" }),
      mem({ id: "job3", kind: "identity", topic: "job", text: "老师做后端", updatedAt: "2026-06-03T00:00:00.000Z" }),
      mem({ id: "job4", kind: "identity", topic: "job", text: "老师写 TypeScript", updatedAt: "2026-06-04T00:00:00.000Z" }),
      mem({ id: "job5", kind: "identity", topic: "job", text: "老师在上海", updatedAt: "2026-06-05T00:00:00.000Z" }),
      mem({
        id: "name",
        kind: "identity",
        topic: "name",
        text: "老师希望被叫做韩",
        updatedAt: "2020-01-01T00:00:00.000Z"
      })
    ];
    expect(selectCoreMemories(items).map((item) => item.id)).toContain("name");
    expect(selectCoreMemories(items)).toHaveLength(3);
  });

  it("擦边相等不带加班", () => {
    const items = [
      mem({ id: "tea", kind: "preference", text: "老师平时喜欢喝红茶" }),
      mem({ id: "overtime", kind: "habit", text: "老师晚上经常加班" })
    ];
    expect(
      selectArchiveMemories(items, [
        { id: "tea", score: 0.5 },
        { id: "overtime", score: 0.43 }
      ]).map((item) => item.id)
    ).toEqual(["tea"]);
  });
});
