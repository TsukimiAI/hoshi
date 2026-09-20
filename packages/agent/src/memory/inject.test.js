"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const inject_1 = require("./inject");
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
(0, vitest_1.describe)("buildMemoryInjectPrompt", () => {
    (0, vitest_1.it)("空列表返回 null", () => {
        (0, vitest_1.expect)((0, inject_1.buildMemoryInjectPrompt)([])).toBeNull();
        (0, vitest_1.expect)((0, inject_1.buildMemoryInjectPrompt)(["  "])).toBeNull();
    });
    (0, vitest_1.it)("有内容则加前缀", () => {
        (0, vitest_1.expect)((0, inject_1.buildMemoryInjectPrompt)(["老师喜欢红茶"])).toBe("关于老师的长期记忆：\n- 老师喜欢红茶");
    });
});
(0, vitest_1.describe)("buildMemoryAckPrompt", () => {
    (0, vitest_1.it)("空则不插", () => {
        (0, vitest_1.expect)((0, inject_1.buildMemoryAckPrompt)([])).toBeNull();
    });
    (0, vitest_1.it)("最多两句认账", () => {
        (0, vitest_1.expect)((0, inject_1.buildMemoryAckPrompt)(["老师平时喜欢喝绿茶"])).toContain("用一句星奈口吻带过已记住");
    });
});
(0, vitest_1.describe)("selectMemoriesForInject", () => {
    (0, vitest_1.it)("不含 superseded", () => {
        const selected = (0, inject_1.selectMemoriesForInject)([
            mem({ id: "old", kind: "preference", text: "老师以前爱喝红茶", status: "superseded" }),
            mem({ id: "now", kind: "preference", text: "老师平时喜欢喝绿茶" })
        ], "喝茶");
        (0, vitest_1.expect)(selected.map((item) => item.id)).toEqual(["now"]);
    });
    (0, vitest_1.it)("身份优先于无重叠的旧习惯", () => {
        const selected = (0, inject_1.selectMemoriesForInject)([
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
        ], "你好");
        (0, vitest_1.expect)(selected[0]?.id).toBe("id");
        (0, vitest_1.expect)(selected.map((item) => item.id)).not.toContain("habit");
    });
    (0, vitest_1.it)("短查询按内容命中，不靠老师二字", () => {
        (0, vitest_1.expect)((0, inject_1.memoryOverlapsQuery)("喝茶", "老师平时喜欢喝绿茶")).toBe(true);
        (0, vitest_1.expect)((0, inject_1.memoryOverlapsQuery)("你好", "老师平时喜欢喝绿茶")).toBe(false);
    });
    (0, vitest_1.it)("重叠记忆按相关度排序", () => {
        const selected = (0, inject_1.selectMemoriesForInject)([
            mem({ id: "weak", kind: "habit", text: "老师喝过一次咖啡也喝茶" }),
            mem({ id: "tea", kind: "preference", text: "老师平时喜欢喝绿茶" })
        ], "绿茶");
        (0, vitest_1.expect)(selected[0]?.id).toBe("tea");
    });
});
