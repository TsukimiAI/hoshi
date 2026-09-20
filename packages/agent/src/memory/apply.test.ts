import { describe, expect, it } from "vitest";
import type { MemoryItem } from "@hoshi/shared";
import { inferTopic, planMemoryWrites } from "./apply";

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

describe("inferTopic", () => {
  it("研究生进 job", () => {
    expect(inferTopic("老师是研究生")).toBe("job");
    expect(inferTopic("老师目前是研究生")).toBe("job");
    expect(inferTopic("老师是学生会成员")).not.toBe("job");
    expect(inferTopic("老师名叫韩")).toBe("name");
  });
});

describe("planMemoryWrites", () => {
  it("retract 作废重叠旧条", () => {
    expect(
      planMemoryWrites(
        [{ action: "retract", kind: "preference", topic: "", text: "老师平时喜欢喝红茶" }],
        [mem({ id: "a", kind: "preference", text: "老师平时喜欢喝红茶。" })]
      )
    ).toEqual([{ type: "supersede", id: "a" }]);
  });

  it("同 kind 互含则就地更新", () => {
    expect(
      planMemoryWrites(
        [{ action: "upsert", kind: "preference", topic: "", text: "老师现在改喝绿茶了" }],
        [mem({ id: "a", kind: "preference", text: "老师现在改喝绿茶" })]
      )
      ).toEqual([{ type: "update", id: "a", text: "老师现在改喝绿茶了", topic: "drink" }]);
  });

  it("无重叠则插入", () => {
    expect(
      planMemoryWrites(
        [{ action: "upsert", kind: "identity", topic: "", text: "老师希望被叫做小韩" }],
        [mem({ id: "a", kind: "habit", text: "老师周末经常加班写代码" })]
      )
    ).toEqual([{ type: "insert", text: "老师希望被叫做小韩", kind: "identity", topic: "name" }]);
  });

  it("同 kind 同 topic 改口只更新", () => {
    expect(
      planMemoryWrites(
        [{ action: "upsert", kind: "preference", topic: "drink", text: "老师现在不喝红茶了" }],
        [mem({ id: "a", kind: "preference", topic: "drink", text: "老师平时喜欢喝红茶" })]
      )
    ).toEqual([{ type: "update", id: "a", text: "老师现在不喝红茶了", topic: "drink" }]);
  });

  it("空 topic 的 upsert 不覆盖已有 topic", () => {
    expect(
      planMemoryWrites(
        [{ action: "upsert", kind: "preference", topic: "", text: "老师平时喜欢喝红茶啊" }],
        [mem({ id: "a", kind: "preference", topic: "drink", text: "老师平时喜欢喝红茶" })]
      )
    ).toEqual([{ type: "update", id: "a", text: "老师平时喜欢喝红茶啊", topic: "drink" }]);
  });

  it("正文能推断时覆盖模型乱 topic", () => {
    expect(
      planMemoryWrites(
        [{ action: "upsert", kind: "identity", topic: "student", text: "老师目前是研究生。" }],
        []
      )
    ).toEqual([{ type: "insert", text: "老师目前是研究生。", kind: "identity", topic: "job" }]);
    expect(
      planMemoryWrites(
        [{ action: "upsert", kind: "habit", topic: "coding", text: "老师习惯晚上写代码" }],
        []
      )
    ).toEqual([{ type: "insert", text: "老师习惯晚上写代码", kind: "habit", topic: "schedule" }]);
  });
});
