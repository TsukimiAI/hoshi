import { describe, expect, it } from "vitest";
import { buildIntegratePrompt, composeTurnHint, extractDeskTopic, extractPortraitName, extractPortraitNames, knowledgeHitLooksEmpty, knowledgeRoute, knowledgeSearchQuery, looksLikeCompareQuery, looksLikePersonQuery, looksLikeUsableWebBrief, looksLikeWorkQuery, portraitLookupQuery, shouldAttachIllustration, shouldWebSearch } from "./plan";

describe("shouldWebSearch", () => {
  it("天气和股价要联网", () => {
    expect(shouldWebSearch("今日股票情况")).toBe(true);
    expect(shouldWebSearch("本月上海天气")).toBe(true);
  });

  it("闲聊不联网，概念和整理要联网", () => {
    expect(shouldWebSearch("你好")).toBe(false);
    expect(shouldWebSearch("解释一下虚拟内存")).toBe(true);
    expect(shouldWebSearch("三体中几个重要角色的名字，人设和重要剧情是怎样的")).toBe(true);
    expect(extractDeskTopic("三体中几个重要角色的名字，人设和重要剧情是怎样的")).toBe("三体");
    expect(extractDeskTopic("崩铁现在数值膨胀严重，哪些角色还能使用？")).toBe("崩铁");
    expect(shouldWebSearch("知识库里有一个笔记叫MIT6，总结一下内容")).toBe(false);
    expect(knowledgeSearchQuery("知识库里有一个笔记叫MIT6，总结一下内容")).toBe("MIT6");
    expect(extractDeskTopic("知识库里有一个笔记叫MIT6，总结一下内容")).toBe("MIT6");
    expect(knowledgeSearchQuery("分点详细总结一下我MIT6笔记的内容")).toBe("MIT6");
    expect(shouldWebSearch("分点详细总结一下我MIT6笔记的内容")).toBe(false);
    expect(shouldWebSearch("MIT6里BSS段是什么")).toBe(false);
    expect(knowledgeRoute("分点详细总结一下我MIT6笔记的内容")).toEqual({
      kind: "summarize",
      query: "MIT6"
    });
    expect(knowledgeRoute("MIT6里BSS段是什么")).toEqual({
      kind: "lookup",
      query: "MIT6里BSS段是什么"
    });
    expect(knowledgeRoute("本月上海天气").kind).toBe("skip");
    expect(knowledgeRoute("你好").kind).toBe("skip");
  });

  it("人物介绍要联网", () => {
    expect(looksLikePersonQuery("爱因斯坦是谁")).toBe(true);
    expect(shouldWebSearch("爱因斯坦是谁")).toBe(true);
    expect(looksLikePersonQuery("我想了解椎名真昼，可以在萌娘百科")).toBe(true);
    expect(shouldWebSearch("我想了解椎名真昼，可以在萌娘百科")).toBe(true);
    expect(extractPortraitName("我想了解椎名真昼，可以在萌娘百科")).toBe("椎名真昼");
    expect(extractPortraitNames("分析椎名真昼和塞西莉亚的异同")).toEqual(["椎名真昼", "塞西莉亚"]);
    expect(
      shouldAttachIllustration({ hint: "分析椎名真昼和塞西莉亚的异同", title: "椎名真昼" })
    ).toBe(true);
    expect(
      extractPortraitNames("分析邻家天使的椎名真昼和白圣女中的塞西莉亚的异同点和萌点")
    ).toEqual(["椎名真昼", "塞西莉亚"]);
    expect(extractPortraitName("爱因斯坦是谁")).toBe("爱因斯坦");
    expect(extractPortraitName("我想了解鸣潮的爱弥斯")).toBe("爱弥斯");
    expect(portraitLookupQuery("分析邻家天使的椎名真昼和白圣女中的塞西莉亚的异同", "塞西莉亚")).toBe(
      "白圣女 塞西莉亚"
    );
    expect(portraitLookupQuery("分析邻家天使的椎名真昼和白圣女中的塞西莉亚的异同", "椎名真昼")).toBe(
      "邻家天使 椎名真昼"
    );
    expect(looksLikeCompareQuery("对比分析鸣潮爱弥斯和莫宁的萌点")).toBe(true);
    expect(extractPortraitNames("对比分析鸣潮爱弥斯和莫宁的萌点")).toEqual(["爱弥斯", "莫宁"]);
    expect(extractPortraitNames("拉海洛的巫女大人指的是绯雪，不是锁琅")).toEqual(["绯雪"]);
    expect(
      composeTurnHint(
        "可以上网查一查有关这位角色的情报",
        "收集一下鸣潮3.7版本情报信息\n拉海洛的巫女大人指的是绯雪，不是锁琅"
      )
    ).toBe("可以上网查一查有关这位角色的情报\n本轮：绯雪");
    expect(composeTurnHint("爱因斯坦是谁", "上一问的锁琅和心")).toBe("爱因斯坦是谁");
  });

  it("影视图书要配图", () => {
    expect(looksLikeWorkQuery("这部电影讲了什么")).toBe(true);
    expect(looksLikeWorkQuery("推荐这本轻小说")).toBe(true);
    expect(shouldAttachIllustration({ hint: "孤独摇滚这部番怎么样", title: "孤独摇滚" })).toBe(true);
    expect(shouldAttachIllustration({ hint: "随便问问天气", title: "上海", kicker: "预报" })).toBe(false);
    expect(shouldAttachIllustration({ hint: "解释虚拟内存", title: "虚拟内存", kicker: "知识点", tags: ["概念"] })).toBe(
      false
    );
    expect(shouldAttachIllustration({ hint: "分析椎名真昼和塞西莉亚", title: "要点" })).toBe(false);
    expect(
      shouldAttachIllustration({ hint: "写张卡", title: "爱因斯坦", kicker: "物理学家" })
    ).toBe(true);
    expect(
      shouldAttachIllustration({
        hint: "收集一下鸣潮3.7版本情报信息",
        title: "心（鸣潮）",
        kicker: "Ver.3.7 登场的新五星共鸣者"
      })
    ).toBe(true);
    expect(portraitLookupQuery("收集一下鸣潮3.7版本情报信息", "心（鸣潮）")).toBe("鸣潮 心");
    expect(portraitLookupQuery("收集一下鸣潮3.7版本情报信息", "鸣潮 Ver.3.7")).toBe("鸣潮");
    expect(
      shouldAttachIllustration({ hint: "收集一下鸣潮3.7版本情报信息", title: "鸣潮 3.7 版本" })
    ).toBe(false);
  });

  it("老师明确要求搜索则联网", () => {
    expect(shouldWebSearch("帮我搜一下这个报错")).toBe(true);
  });
});

describe("buildIntegratePrompt", () => {
  it("写明三路来源", () => {
    const text = buildIntegratePrompt({
      web: true,
      webBody: "上海 9/22 最高 28",
      kbEnabled: true,
      kbBody: "《笔记》虚存是磁盘上的交换。"
    });
    expect(text).toContain("联网：已检索");
    expect(text).toContain("上海 9/22");
    expect(text).toContain("知识库：已命中");
    expect(text).toContain("固有知识");
  });

  it("画布工具联网不预填摘录", () => {
    const text = buildIntegratePrompt({
      web: true,
      webTools: true,
      kbEnabled: false,
      kbBody: null
    });
    expect(text).toContain("web_search");
    expect(text).toContain("外部数据");
    expect(text).not.toContain("已检索");
  });
});

describe("looksLikeUsableWebBrief", () => {
  it("要有数字或来源，套话不算", () => {
    expect(looksLikeUsableWebBrief("上海最高 28")).toBe(true);
    expect(looksLikeUsableWebBrief("来源：\nhttps://example.com")).toBe(true);
    expect(looksLikeUsableWebBrief("未检索到实测数字")).toBe(false);
    expect(looksLikeUsableWebBrief("")).toBe(false);
    expect(
      looksLikeUsableWebBrief(
        "爱弥斯是库洛游戏《鸣潮》中的登场角色，曾是今州星炬学院的隧者合格者，如今以电子幽灵的形态行动。"
      )
    ).toBe(true);
  });
});

describe("knowledgeHitLooksEmpty", () => {
  it("识别空结果", () => {
    expect(knowledgeHitLooksEmpty("知识库没有与该问题相关的文档。")).toBe(true);
    expect(knowledgeHitLooksEmpty("[1] 《笔记》内容")).toBe(false);
  });
});
