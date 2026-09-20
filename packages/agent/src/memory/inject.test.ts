import { describe, expect, it } from "vitest";
import type { MemoryItem } from "@hoshi/shared";
import { buildMemoryAckPrompt, buildMemoryInjectPrompt, memoryOverlapsQuery, selectMemoriesForInject } from "./inject";

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
});

describe("buildMemoryAckPrompt", () => {
  it("空则不插", () => {
    expect(buildMemoryAckPrompt([])).toBeNull();
  });

  it("最多两句认账", () => {
    expect(buildMemoryAckPrompt(["老师平时喜欢喝绿茶"])).toContain("用一句星奈口吻带过已记住");
  });
});

describe("selectMemoriesForInject", () => {
  it("不含 superseded", () => {
    const selected = selectMemoriesForInject(
      [
        mem({ id: "old", kind: "preference", text: "老师以前爱喝红茶", status: "superseded" }),
        mem({ id: "now", kind: "preference", text: "老师平时喜欢喝绿茶" })
      ],
      "喝茶"
    );
    expect(selected.map((item) => item.id)).toEqual(["now"]);
  });

  it("身份优先于无重叠的旧习惯", () => {
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
    expect(selected[0]?.id).toBe("id");
    expect(selected.map((item) => item.id)).not.toContain("habit");
  });

  it("短查询按内容命中，不靠老师二字", () => {
    expect(memoryOverlapsQuery("喝茶", "老师平时喜欢喝绿茶")).toBe(true);
    expect(memoryOverlapsQuery("你好", "老师平时喜欢喝绿茶")).toBe(false);
  });

  it("重叠记忆按相关度排序", () => {
    const selected = selectMemoriesForInject(
      [
        mem({ id: "weak", kind: "habit", text: "老师喝过一次咖啡也喝茶" }),
        mem({ id: "tea", kind: "preference", text: "老师平时喜欢喝绿茶" })
      ],
      "绿茶"
    );
    expect(selected[0]?.id).toBe("tea");
  });
});
