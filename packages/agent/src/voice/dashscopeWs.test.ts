import { describe, expect, it } from "vitest";
import { inferenceWsUrl } from "./dashscopeWs";

describe("inferenceWsUrl", () => {
  it("北京", () => {
    expect(inferenceWsUrl("https://dashscope.aliyuncs.com/compatible-mode/v1")).toBe(
      "wss://dashscope.aliyuncs.com/api-ws/v1/inference"
    );
  });

  it("新加坡", () => {
    expect(inferenceWsUrl("https://dashscope-intl.aliyuncs.com/compatible-mode/v1")).toBe(
      "wss://dashscope-intl.aliyuncs.com/api-ws/v1/inference"
    );
  });
});
