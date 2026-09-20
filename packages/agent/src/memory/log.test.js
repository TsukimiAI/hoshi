"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const log_1 = require("./log");
(0, vitest_1.describe)("summarizeWrites", () => {
    (0, vitest_1.it)("空为 none", () => {
        (0, vitest_1.expect)((0, log_1.summarizeWrites)([])).toBe("none");
    });
    (0, vitest_1.it)("同类与 mixed", () => {
        (0, vitest_1.expect)((0, log_1.summarizeWrites)([{ type: "insert", text: "a", kind: "habit", topic: "x" }])).toBe("insert");
        (0, vitest_1.expect)((0, log_1.summarizeWrites)([
            { type: "insert", text: "a", kind: "habit", topic: "x" },
            { type: "update", id: "1", text: "b", topic: "x" }
        ])).toBe("mixed");
    });
});
(0, vitest_1.describe)("logMemoryTurn", () => {
    (0, vitest_1.it)("带 src", () => {
        const spy = vitest_1.vi.spyOn(console, "error").mockImplementation(() => undefined);
        (0, log_1.logMemoryTurn)({
            phase: "chat",
            sessionId: "s",
            turnId: "t",
            inject: 1,
            ack: 0,
            extract: "skip",
            ms: 3
        });
        (0, vitest_1.expect)(JSON.parse(String(spy.mock.calls[0]?.[0]))).toEqual({
            src: "hoshi.memory",
            phase: "chat",
            sessionId: "s",
            turnId: "t",
            inject: 1,
            ack: 0,
            extract: "skip",
            ms: 3
        });
        spy.mockRestore();
    });
});
