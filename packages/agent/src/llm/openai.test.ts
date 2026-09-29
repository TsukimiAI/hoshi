import { describe, expect, it } from "vitest";
import { parseUsage } from "@hoshi/shared";
import { buildChatCompletionBody, isAbortTimeout } from "./openai";

describe("buildChatCompletionBody", () => {
  it("始终带 enable_search", () => {
    expect(
      buildChatCompletionBody("qwen", [{ role: "user", content: "hi" }], { stream: true })
    ).toMatchObject({
      model: "qwen",
      stream: true,
      enable_search: true,
      extra_body: {
        enable_search: true,
        search_options: { forced_search: true, enable_source: true }
      },
      stream_options: { include_usage: true }
    });
  });

  it("非流式不带 stream_options", () => {
    expect(
      buildChatCompletionBody("qwen", [{ role: "user", content: "hi" }], { stream: false })
    ).not.toHaveProperty("stream_options");
  });

  it("无 tool 时不写 tools", () => {
    const body = buildChatCompletionBody("qwen", [{ role: "user", content: "hi" }], {
      stream: false
    });
    expect(body.tools).toBeUndefined();
  });

  it("enableSearch false 时不带联网", () => {
    const body = buildChatCompletionBody("qwen", [{ role: "user", content: "hi" }], {
      stream: false,
      enableSearch: false
    });
    expect(body.enable_search).toBeUndefined();
    expect(body.extra_body).toBeUndefined();
  });
});

describe("parseUsage", () => {
  it("归一 prompt/completion 与 cache", () => {
    expect(
      parseUsage({
        prompt_tokens: 10,
        completion_tokens: 4,
        total_tokens: 14,
        prompt_tokens_details: { cached_tokens: 3 }
      })
    ).toEqual({ promptTokens: 10, completionTokens: 4, totalTokens: 14, cachedTokens: 3 });
  });

  it("兼容 input_tokens 且缺 total 时相加", () => {
    expect(parseUsage({ input_tokens: 2, output_tokens: 5 })).toEqual({
      promptTokens: 2,
      completionTokens: 5,
      totalTokens: 7,
      cachedTokens: 0
    });
  });

  it("无 usage 字段不伪造", () => {
    expect(parseUsage(undefined)).toBeUndefined();
    expect(parseUsage({})).toBeUndefined();
  });
});

describe("isAbortTimeout", () => {
  it("识别 Node TimeoutError 英文", () => {
    const error = new Error("The operation was aborted due to timeout");
    error.name = "TimeoutError";
    expect(isAbortTimeout(error)).toBe(true);
    expect(isAbortTimeout(new Error("boom"))).toBe(false);
  });
});
