"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const parseTool_1 = require("./parseTool");
(0, vitest_1.describe)("parseCompleteChatResponse", () => {
    (0, vitest_1.it)("解析 tool_calls", () => {
        (0, vitest_1.expect)((0, parseTool_1.parseCompleteChatResponse)({
            choices: [
                {
                    message: {
                        content: "",
                        tool_calls: [
                            {
                                id: "call_1",
                                type: "function",
                                function: { name: "web_search", arguments: "{\"query\":\"上海天气\"}" }
                            }
                        ]
                    }
                }
            ]
        })).toEqual({
            content: "",
            toolCalls: [{ id: "call_1", name: "web_search", argumentsJson: "{\"query\":\"上海天气\"}" }]
        });
    });
    (0, vitest_1.it)("无 tool_calls 时只取文本", () => {
        (0, vitest_1.expect)((0, parseTool_1.parseCompleteChatResponse)({
            choices: [{ message: { content: "你好。" } }]
        })).toEqual({ content: "你好。", toolCalls: [] });
    });
    (0, vitest_1.it)("带上 usage", () => {
        (0, vitest_1.expect)((0, parseTool_1.parseCompleteChatResponse)({
            choices: [{ message: { content: "你好。" } }],
            usage: { prompt_tokens: 8, completion_tokens: 2, total_tokens: 10 }
        })).toEqual({
            content: "你好。",
            toolCalls: [],
            usage: { promptTokens: 8, completionTokens: 2, totalTokens: 10, cachedTokens: 0 }
        });
    });
});
(0, vitest_1.describe)("parseToolArgs", () => {
    (0, vitest_1.it)("解析 JSON 对象", () => {
        (0, vitest_1.expect)((0, parseTool_1.parseToolArgs)("{\"query\":\"hi\"}")).toEqual({ query: "hi" });
    });
    (0, vitest_1.it)("非法 JSON 回退 raw", () => {
        (0, vitest_1.expect)((0, parseTool_1.parseToolArgs)("not-json")).toEqual({ raw: "not-json" });
    });
});
