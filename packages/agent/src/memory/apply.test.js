"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const apply_1 = require("./apply");
function mem(partial) {
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
(0, vitest_1.describe)("inferTopic", () => {
    (0, vitest_1.it)("研究生进 job", () => {
        (0, vitest_1.expect)((0, apply_1.inferTopic)("老师是研究生")).toBe("job");
        (0, vitest_1.expect)((0, apply_1.inferTopic)("老师目前是研究生")).toBe("job");
        (0, vitest_1.expect)((0, apply_1.inferTopic)("老师是学生会成员")).not.toBe("job");
        (0, vitest_1.expect)((0, apply_1.inferTopic)("老师名叫韩")).toBe("name");
    });
});
(0, vitest_1.describe)("planMemoryWrites", () => {
    (0, vitest_1.it)("retract 作废重叠旧条", () => {
        (0, vitest_1.expect)((0, apply_1.planMemoryWrites)([{ action: "retract", kind: "preference", topic: "", text: "老师平时喜欢喝红茶" }], [mem({ id: "a", kind: "preference", text: "老师平时喜欢喝红茶。" })])).toEqual([{ type: "supersede", id: "a" }]);
    });
    (0, vitest_1.it)("同 kind 互含则就地更新", () => {
        (0, vitest_1.expect)((0, apply_1.planMemoryWrites)([{ action: "upsert", kind: "preference", topic: "", text: "老师现在改喝绿茶了" }], [mem({ id: "a", kind: "preference", text: "老师现在改喝绿茶" })])).toEqual([{ type: "update", id: "a", text: "老师现在改喝绿茶了", topic: "drink" }]);
    });
    (0, vitest_1.it)("无重叠则插入", () => {
        (0, vitest_1.expect)((0, apply_1.planMemoryWrites)([{ action: "upsert", kind: "identity", topic: "", text: "老师希望被叫做小韩" }], [mem({ id: "a", kind: "habit", text: "老师周末经常加班写代码" })])).toEqual([{ type: "insert", text: "老师希望被叫做小韩", kind: "identity", topic: "name" }]);
    });
    (0, vitest_1.it)("同 kind 同 topic 改口只更新", () => {
        (0, vitest_1.expect)((0, apply_1.planMemoryWrites)([{ action: "upsert", kind: "preference", topic: "drink", text: "老师现在不喝红茶了" }], [mem({ id: "a", kind: "preference", topic: "drink", text: "老师平时喜欢喝红茶" })])).toEqual([{ type: "update", id: "a", text: "老师现在不喝红茶了", topic: "drink" }]);
    });
    (0, vitest_1.it)("空 topic 的 upsert 不覆盖已有 topic", () => {
        (0, vitest_1.expect)((0, apply_1.planMemoryWrites)([{ action: "upsert", kind: "preference", topic: "", text: "老师平时喜欢喝红茶啊" }], [mem({ id: "a", kind: "preference", topic: "drink", text: "老师平时喜欢喝红茶" })])).toEqual([{ type: "update", id: "a", text: "老师平时喜欢喝红茶啊", topic: "drink" }]);
    });
    (0, vitest_1.it)("正文能推断时覆盖模型乱 topic", () => {
        (0, vitest_1.expect)((0, apply_1.planMemoryWrites)([{ action: "upsert", kind: "identity", topic: "student", text: "老师目前是研究生。" }], [])).toEqual([{ type: "insert", text: "老师目前是研究生。", kind: "identity", topic: "job" }]);
        (0, vitest_1.expect)((0, apply_1.planMemoryWrites)([{ action: "upsert", kind: "habit", topic: "coding", text: "老师习惯晚上写代码" }], [])).toEqual([{ type: "insert", text: "老师习惯晚上写代码", kind: "habit", topic: "schedule" }]);
    });
});
