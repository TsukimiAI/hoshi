import { describe, expect, it } from "vitest";
import { parseCompleteChatResponse, parseToolArgs } from "./parseTool";

describe("parseCompleteChatResponse", () => {
  it("解析 tool_calls", () => {
    expect(
      parseCompleteChatResponse({
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
      })
    ).toEqual({
      content: "",
      toolCalls: [{ id: "call_1", name: "web_search", argumentsJson: "{\"query\":\"上海天气\"}" }]
    });
  });

  it("无 tool_calls 时只取文本", () => {
    expect(
      parseCompleteChatResponse({
        choices: [{ message: { content: "你好。" } }]
      })
    ).toEqual({ content: "你好。", toolCalls: [] });
  });

  it("带上 usage", () => {
    expect(
      parseCompleteChatResponse({
        choices: [{ message: { content: "你好。" } }],
        usage: { prompt_tokens: 8, completion_tokens: 2, total_tokens: 10 }
      })
    ).toEqual({
      content: "你好。",
      toolCalls: [],
      usage: { promptTokens: 8, completionTokens: 2, totalTokens: 10, cachedTokens: 0 }
    });
  });
});

describe("parseToolArgs", () => {
  it("解析 JSON 对象", () => {
    expect(parseToolArgs("{\"query\":\"hi\"}")).toEqual({ query: "hi" });
  });

  it("非法 JSON 回退 raw", () => {
    expect(parseToolArgs("not-json")).toEqual({ raw: "not-json" });
  });
});
