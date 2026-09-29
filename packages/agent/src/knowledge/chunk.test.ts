import { describe, expect, it } from "vitest";
import { chunkDocument, CHUNK_MAX_CHARS } from "./chunk";

describe("chunkDocument", () => {
  it("空文本返回空", () => {
    expect(chunkDocument("")).toEqual([]);
  });

  it("短文本单块", () => {
    const chunks = chunkDocument("这是一段很短的测试文本。");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toContain("测试文本");
  });

  it("按标题记录 headingPath", () => {
    const text = "# 第一章\n\n第一节内容。\n\n## 1.1 小节\n\n第二段内容。";
    const chunks = chunkDocument(text);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].headingPath).toEqual(["第一章"]);
  });

  it("段落对齐：正常段落不在中间截断", () => {
    const paragraphs = Array.from({ length: 40 }, (_, i) =>
      `第${i}段：这是一段用于测试分块的连续内容，内容完整且没有空行打断，长度适中。`
    );
    const chunks = chunkDocument(paragraphs.join("\n\n"));
    expect(chunks.length).toBeGreaterThan(1);
    for (let i = 0; i < chunks.length; i += 1) {
      const lastParagraph = chunks[i].text.split("\n\n").pop() ?? "";
      expect(paragraphs.includes(lastParagraph)).toBe(true);
    }
  });

  it("无重叠：每个段落只出现在一个块", () => {
    const paragraphs = Array.from({ length: 30 }, (_, i) => `第${i}段内容，一段完整文字。`);
    const chunks = chunkDocument(paragraphs.join("\n\n"));
    for (const paragraph of paragraphs) {
      const count = chunks.filter((chunk) => chunk.text.includes(paragraph)).length;
      expect(count).toBe(1);
    }
  });

  it("超长无空行文本按句切分", () => {
    const long = Array.from({ length: 300 }, (_, i) => `这是第${i}句没有空行分隔的连续内容。`).join("");
    const chunks = chunkDocument(long);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(CHUNK_MAX_CHARS);
    }
  });

  it("代码块与表格作为原子块保留", () => {
    const text = "前面一段内容。\n\n```\ncode line 1\ncode line 2\n```\n\n| 列A | 列B |\n|---|---|\n| 1 | 2 |";
    const chunks = chunkDocument(text);
    const all = chunks.map((chunk) => chunk.text).join("\n\n");
    expect(all).toContain("```\ncode line 1");
    expect(all).toContain("| 列A | 列B |");
  });
});
