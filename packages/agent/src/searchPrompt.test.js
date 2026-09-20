"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const searchPrompt_1 = require("./searchPrompt");
(0, vitest_1.describe)("buildSearchSitesPrompt", () => {
    (0, vitest_1.it)("无站点返回 null", () => {
        (0, vitest_1.expect)((0, searchPrompt_1.buildSearchSitesPrompt)([])).toBeNull();
    });
    (0, vitest_1.it)("含评估文案与地址列表", () => {
        const prompt = (0, searchPrompt_1.buildSearchSitesPrompt)(["https://a.com", "b.com"]);
        (0, vitest_1.expect)(prompt).toContain("老师配置了这些参考站点：");
        (0, vitest_1.expect)(prompt).toContain("https://a.com");
        (0, vitest_1.expect)(prompt).toContain("b.com");
        (0, vitest_1.expect)(prompt).toContain("先判断当前问题是否可能在这些站点上找到靠谱答案");
        (0, vitest_1.expect)(prompt).toContain("不要为了用站点而用站点");
    });
});
(0, vitest_1.describe)("SEARCH_USAGE_PROMPT", () => {
    (0, vitest_1.it)("要求 ⟦emotion⟧ 并禁止 tool_call 与波浪线情绪", () => {
        (0, vitest_1.expect)(searchPrompt_1.SEARCH_USAGE_PROMPT).toContain("⟦emotion⟧");
        (0, vitest_1.expect)(searchPrompt_1.SEARCH_USAGE_PROMPT).toContain("tool_call");
        (0, vitest_1.expect)(searchPrompt_1.SEARCH_USAGE_PROMPT).toContain("～happy");
        (0, vitest_1.expect)(searchPrompt_1.SEARCH_USAGE_PROMPT).toContain("~happy");
    });
});
(0, vitest_1.describe)("parseSiteLines", () => {
    (0, vitest_1.it)("忽略空行", () => {
        (0, vitest_1.expect)((0, searchPrompt_1.parseSiteLines)("a.com\n\n  b.com  ")).toEqual(["a.com", "b.com"]);
    });
});
