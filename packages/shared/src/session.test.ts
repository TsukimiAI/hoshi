import { describe, expect, it } from "vitest";
import { SESSION_TITLE_MAX_LEN, sessionTitleFromUserMessage } from "./session";

describe("sessionTitleFromUserMessage", () => {
  it("压缩空白并截到 48 字", () => {
    expect(sessionTitleFromUserMessage("  你好   老师  ")).toBe("你好 老师");
    expect(sessionTitleFromUserMessage("a".repeat(60))).toHaveLength(SESSION_TITLE_MAX_LEN);
  });

  it("空内容得到空标题", () => {
    expect(sessionTitleFromUserMessage("   ")).toBe("");
  });
});
