"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const session_1 = require("./session");
(0, vitest_1.describe)("sessionTitleFromUserMessage", () => {
    (0, vitest_1.it)("压缩空白并截到 48 字", () => {
        (0, vitest_1.expect)((0, session_1.sessionTitleFromUserMessage)("  你好   老师  ")).toBe("你好 老师");
        (0, vitest_1.expect)((0, session_1.sessionTitleFromUserMessage)("a".repeat(60))).toHaveLength(session_1.SESSION_TITLE_MAX_LEN);
    });
    (0, vitest_1.it)("空内容得到空标题", () => {
        (0, vitest_1.expect)((0, session_1.sessionTitleFromUserMessage)("   ")).toBe("");
    });
});
