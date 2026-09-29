import { describe, expect, it } from "vitest";
import { buildSearchSitesPrompt, parseSiteLines, SEARCH_USAGE_PROMPT } from "./searchPrompt";

describe("buildSearchSitesPrompt", () => {
  it("无站点返回 null", () => {
    expect(buildSearchSitesPrompt([])).toBeNull();
  });

  it("含评估文案与地址列表", () => {
    const prompt = buildSearchSitesPrompt(["https://a.com", "b.com"]);
    expect(prompt).toContain("老师配置了这些参考站点：");
    expect(prompt).toContain("https://a.com");
    expect(prompt).toContain("b.com");
    expect(prompt).toContain("先判断当前问题是否可能在这些站点上找到靠谱答案");
    expect(prompt).toContain("不要为了用站点而用站点");
  });
});

describe("SEARCH_USAGE_PROMPT", () => {
  it("要求 ⟦emotion⟧ 并禁止 tool_call 与波浪线情绪", () => {
    expect(SEARCH_USAGE_PROMPT).toContain("⟦emotion⟧");
    expect(SEARCH_USAGE_PROMPT).toContain("tool_call");
    expect(SEARCH_USAGE_PROMPT).toContain("～happy");
    expect(SEARCH_USAGE_PROMPT).toContain("~happy");
    expect(SEARCH_USAGE_PROMPT).toContain("系统判定");
  });
});

describe("parseSiteLines", () => {
  it("忽略空行", () => {
    expect(parseSiteLines("a.com\n\n  b.com  ")).toEqual(["a.com", "b.com"]);
  });
});
