"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const sentence_1 = require("./sentence");
(0, vitest_1.describe)("SentenceSplitter", () => {
    (0, vitest_1.it)("按标点切分句子", () => {
        const splitter = new sentence_1.SentenceSplitter();
        const out = splitter.push("你好。今天好吗？我很好！");
        (0, vitest_1.expect)(out).toEqual(["你好。", "今天好吗？"]);
        (0, vitest_1.expect)(splitter.flush()).toEqual(["我很好！"]);
    });
    (0, vitest_1.it)("跨 chunk 累积并在 flush 输出残句", () => {
        const splitter = new sentence_1.SentenceSplitter();
        (0, vitest_1.expect)(splitter.push("你好，今")).toEqual([]);
        (0, vitest_1.expect)(splitter.push("天天气不错")).toEqual([]);
        (0, vitest_1.expect)(splitter.flush()).toEqual(["你好，今天天气不错"]);
    });
    (0, vitest_1.it)("句号后情绪标记归入同一句", () => {
        const splitter = new sentence_1.SentenceSplitter();
        (0, vitest_1.expect)(splitter.push("好的。⟦happy⟧下一句。")).toEqual(["好的。⟦happy⟧"]);
        (0, vitest_1.expect)(splitter.flush()).toEqual(["下一句。"]);
    });
    (0, vitest_1.it)("丢弃 tool_call 块且不把残段当句子", () => {
        const splitter = new sentence_1.SentenceSplitter();
        (0, vitest_1.expect)(splitter.push("前面。")).toEqual([]);
        (0, vitest_1.expect)(splitter.push('<tool_call>\n{"name":"web_search","arguments":{"query":"今汐"}}\n</tool_call>后面。')).toEqual(["前面。"]);
        (0, vitest_1.expect)(splitter.flush()).toEqual(["后面。"]);
    });
    (0, vitest_1.it)("～emotion 作为句界且留给解析器", () => {
        const splitter = new sentence_1.SentenceSplitter();
        (0, vitest_1.expect)(splitter.push("释放高倍率技能～happy剧情上她是令尹。～normal")).toEqual([
            "释放高倍率技能～happy",
            "剧情上她是令尹。～normal"
        ]);
    });
    (0, vitest_1.it)("不把版本号小数点当句号", () => {
        const splitter = new sentence_1.SentenceSplitter();
        (0, vitest_1.expect)(splitter.push("3.8前瞻的资料已经过时了。8版本日期不确定。")).toEqual([
            "3.8前瞻的资料已经过时了。"
        ]);
        (0, vitest_1.expect)(splitter.flush()).toEqual(["8版本日期不确定。"]);
    });
});
