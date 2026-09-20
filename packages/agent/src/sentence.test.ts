import { describe, expect, it } from "vitest";
import { SentenceSplitter } from "./sentence";

describe("SentenceSplitter", () => {
  it("按标点切分句子", () => {
    const splitter = new SentenceSplitter();
    const out = splitter.push("你好。今天好吗？我很好！");
    expect(out).toEqual(["你好。", "今天好吗？"]);
    expect(splitter.flush()).toEqual(["我很好！"]);
  });

  it("跨 chunk 累积并在 flush 输出残句", () => {
    const splitter = new SentenceSplitter();
    expect(splitter.push("你好，今")).toEqual([]);
    expect(splitter.push("天天气不错")).toEqual([]);
    expect(splitter.flush()).toEqual(["你好，今天天气不错"]);
  });

  it("句号后情绪标记归入同一句", () => {
    const splitter = new SentenceSplitter();
    expect(splitter.push("好的。⟦happy⟧下一句。")).toEqual(["好的。⟦happy⟧"]);
    expect(splitter.flush()).toEqual(["下一句。"]);
  });

  it("丢弃 tool_call 块且不把残段当句子", () => {
    const splitter = new SentenceSplitter();
    expect(splitter.push("前面。")).toEqual([]);
    expect(
      splitter.push(
        '<tool_call>\n{"name":"web_search","arguments":{"query":"今汐"}}\n</tool_call>后面。'
      )
    ).toEqual(["前面。"]);
    expect(splitter.flush()).toEqual(["后面。"]);
  });

  it("～emotion 作为句界且留给解析器", () => {
    const splitter = new SentenceSplitter();
    expect(splitter.push("释放高倍率技能～happy剧情上她是令尹。～normal")).toEqual([
      "释放高倍率技能～happy",
      "剧情上她是令尹。～normal"
    ]);
  });

  it("不把版本号小数点当句号", () => {
    const splitter = new SentenceSplitter();
    expect(splitter.push("3.8前瞻的资料已经过时了。8版本日期不确定。")).toEqual([
      "3.8前瞻的资料已经过时了。"
    ]);
    expect(splitter.flush()).toEqual(["8版本日期不确定。"]);
  });
});
