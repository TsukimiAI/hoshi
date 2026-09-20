"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const emotion_1 = require("./emotion");
(0, vitest_1.describe)("emotion helpers", () => {
    (0, vitest_1.it)("包含 18 个预定义情绪", () => {
        (0, vitest_1.expect)(emotion_1.EMOTIONS.length).toBe(18);
    });
    (0, vitest_1.it)("识别合法情绪", () => {
        (0, vitest_1.expect)((0, emotion_1.isEmotion)("normal")).toBe(true);
        (0, vitest_1.expect)((0, emotion_1.isEmotion)("very-happy")).toBe(true);
    });
    (0, vitest_1.it)("拒绝非法情绪", () => {
        (0, vitest_1.expect)((0, emotion_1.isEmotion)("foo")).toBe(false);
    });
});
