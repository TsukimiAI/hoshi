import { describe, expect, it } from "vitest";
import { isKnowledgeHitOnTopic, queryTopicGrams } from "./relevance";

describe("isKnowledgeHitOnTopic", () => {
  it("天气问句不匹配操作系统讲义", () => {
    const lecture =
      "如果你看一下二进制的布局，这有一些文本T，数据段D，通常还有所谓的BSS段。当编译器生成二进制文件时";
    expect(isKnowledgeHitOnTopic("本月上海天气", lecture)).toBe(false);
    expect(isKnowledgeHitOnTopic("今日股票", lecture)).toBe(false);
  });

  it("讲义问句能对上原文", () => {
    const lecture = "编译器生成二进制文件时基本填充文本段、数据段和BSS段。";
    expect(isKnowledgeHitOnTopic("解释一下二进制布局和BSS段", lecture)).toBe(true);
  });

  it("点名知识库笔记时，MIT6 能对上 MIT 6 讲义", () => {
    const lecture =
      "MIT 6\n如果你看一下二进制的布局，这有一些文本T，数据段D，通常还有所谓的BSS段。";
    expect(isKnowledgeHitOnTopic("知识库里有一个笔记叫MIT6，总结一下内容", lecture)).toBe(true);
    expect(isKnowledgeHitOnTopic("MIT6", lecture)).toBe(true);
  });

  it("短查询不过滤", () => {
    expect(queryTopicGrams("猫").length).toBeLessThan(2);
    expect(isKnowledgeHitOnTopic("猫", "狗喜欢跑步")).toBe(true);
  });

  it("页表问句能对上只含页表的中文段", () => {
    expect(isKnowledgeHitOnTopic("操作系统里的页表概念", "页表把虚拟地址翻译成物理地址。")).toBe(true);
  });

  it("页表问句能对上英文 page table 讲义", () => {
    expect(
      isKnowledgeHitOnTopic(
        "操作系统里的页表概念",
        "A page table maps virtual addresses to physical frames."
      )
    ).toBe(true);
  });

  it("文件系统讲义不能当成页表答案", () => {
    expect(isKnowledgeHitOnTopic("操作系统里的页表概念", "文件系统用 inode 记录文件元数据。")).toBe(
      false
    );
  });
});
