import { describe, expect, it } from "vitest";
import { parseDeskMarkdown } from "./deskMarkdown";

describe("parseDeskMarkdown", () => {
  it("把分隔行表格收成表头和数据行", () => {
    const blocks = parseDeskMarkdown(`说明一句。
|方案|思路|代价|
|---|---|---|
|多级页表|树状稀疏化|主流|
|反查|物理页框索引|条目多|`);
    expect(blocks[0]).toEqual({ type: "p", text: "说明一句。" });
    expect(blocks[1]).toEqual({
      type: "table",
      headers: ["方案", "思路", "代价"],
      rows: [
        ["多级页表", "树状稀疏化", "主流"],
        ["反查", "物理页框索引", "条目多"]
      ]
    });
  });

  it("没有分隔行的竖线仍是段落", () => {
    expect(parseDeskMarkdown("ASID | PCID 只是说明")).toEqual([
      { type: "p", text: "ASID | PCID 只是说明" }
    ]);
  });

  it("保留列表和代码块", () => {
    const blocks = parseDeskMarkdown(`- 第一项
- 第二项

\`\`\`
|不是表格|
\`\`\``);
    expect(blocks[0]).toEqual({ type: "ul", items: ["第一项", "第二项"] });
    expect(blocks[1]).toEqual({ type: "code", text: "|不是表格|" });
  });
});
