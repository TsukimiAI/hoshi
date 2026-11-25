import { describe, expect, it } from "vitest";
import "./helpers";

const { stripVisibleEmotionMarks } = globalThis as unknown as {
  stripVisibleEmotionMarks: (text: string) => string;
};

describe("stripVisibleEmotionMarks", () => {
  it("去掉气泡里的情绪标记", () => {
    expect(
      stripVisibleEmotionMarks("告诉我嘛～ ⟦expect⟧ 还是有问题。")
    ).toBe("告诉我嘛～ 还是有问题。");
    expect(stripVisibleEmotionMarks("看 is.has（happy）")).toBe("看 is.has");
    expect(stripVisibleEmotionMarks("引用 `⟦expect⟧` 就好。")).toBe("引用 `⟦expect⟧` 就好。");
  });
});
