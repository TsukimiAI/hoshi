import { describe, expect, it } from "vitest";
import { EMOTIONS, isEmotion } from "./emotion";

describe("emotion helpers", () => {
  it("包含 18 个预定义情绪", () => {
    expect(EMOTIONS.length).toBe(18);
  });

  it("识别合法情绪", () => {
    expect(isEmotion("normal")).toBe(true);
    expect(isEmotion("very-happy")).toBe(true);
  });

  it("拒绝非法情绪", () => {
    expect(isEmotion("foo")).toBe(false);
  });
});
