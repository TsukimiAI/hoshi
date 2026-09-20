"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const shared_1 = require("@hoshi/shared");
const openai_1 = require("./openai");
(0, vitest_1.describe)("buildChatCompletionBody", () => {
    (0, vitest_1.it)("始终带 enable_search", () => {
        (0, vitest_1.expect)((0, openai_1.buildChatCompletionBody)("qwen", [{ role: "user", content: "hi" }], { stream: true })).toMatchObject({
            model: "qwen",
            stream: true,
            enable_search: true,
            extra_body: { enable_search: true },
            stream_options: { include_usage: true }
        });
    });
    (0, vitest_1.it)("非流式不带 stream_options", () => {
        (0, vitest_1.expect)((0, openai_1.buildChatCompletionBody)("qwen", [{ role: "user", content: "hi" }], { stream: false })).not.toHaveProperty("stream_options");
    });
    (0, vitest_1.it)("无 tool 时不写 tools", () => {
        const body = (0, openai_1.buildChatCompletionBody)("qwen", [{ role: "user", content: "hi" }], {
            stream: false
        });
        (0, vitest_1.expect)(body.tools).toBeUndefined();
    });
    (0, vitest_1.it)("enableSearch false 时不带联网", () => {
        const body = (0, openai_1.buildChatCompletionBody)("qwen", [{ role: "user", content: "hi" }], {
            stream: false,
            enableSearch: false
        });
        (0, vitest_1.expect)(body.enable_search).toBeUndefined();
        (0, vitest_1.expect)(body.extra_body).toBeUndefined();
    });
});
(0, vitest_1.describe)("parseUsage", () => {
    (0, vitest_1.it)("归一 prompt/completion 与 cache", () => {
        (0, vitest_1.expect)((0, shared_1.parseUsage)({
            prompt_tokens: 10,
            completion_tokens: 4,
            total_tokens: 14,
            prompt_tokens_details: { cached_tokens: 3 }
        })).toEqual({ promptTokens: 10, completionTokens: 4, totalTokens: 14, cachedTokens: 3 });
    });
    (0, vitest_1.it)("兼容 input_tokens 且缺 total 时相加", () => {
        (0, vitest_1.expect)((0, shared_1.parseUsage)({ input_tokens: 2, output_tokens: 5 })).toEqual({
            promptTokens: 2,
            completionTokens: 5,
            totalTokens: 7,
            cachedTokens: 0
        });
    });
    (0, vitest_1.it)("无 usage 字段不伪造", () => {
        (0, vitest_1.expect)((0, shared_1.parseUsage)(undefined)).toBeUndefined();
        (0, vitest_1.expect)((0, shared_1.parseUsage)({})).toBeUndefined();
    });
});
