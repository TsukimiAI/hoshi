"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const sessionContext_1 = require("./sessionContext");
(0, vitest_1.describe)("sliceCompactSummary", () => {
    (0, vitest_1.it)("超长截尾", () => {
        const line = "x".repeat(2000);
        const out = (0, sessionContext_1.sliceCompactSummary)("", [line, line]);
        (0, vitest_1.expect)(out.length).toBe(3200);
        (0, vitest_1.expect)(out.endsWith("x")).toBe(true);
    });
});
