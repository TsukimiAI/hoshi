import { describe, expect, it } from "vitest";
import { canvasLayoutRole } from "@hoshi/shared";
import { buildDeskCanvasGuide, buildIntegratePrompt, classifyDeskTurn, composeTurnHint, extractDeskTopic, extractPortraitName, extractPortraitNames, knowledgeHitLooksEmpty, knowledgeRoute, knowledgeSearchQuery, looksLikeCompareQuery, looksLikePersonQuery, looksLikeUsableWebBrief, looksLikeWorkQuery, parseDeskCanvasChoice, parseDeskCritic, portraitLookupQuery, shouldAttachIllustration } from "./plan";

describe("desk turn", () => {
  it("天气和比赛是时效题，不进知识库", () => {
    expect(classifyDeskTurn("今日股票情况").kind).toBe("live");
    expect(classifyDeskTurn("本月上海天气").kind).toBe("live");
    expect(classifyDeskTurn("昨晚那场比赛谁赢了").kind).toBe("live");
    expect(knowledgeRoute("昨晚那场比赛谁赢了").kind).toBe("skip");
    expect(knowledgeRoute("本月上海天气").kind).toBe("skip");
    expect(knowledgeRoute("你好").kind).toBe("skip");
  });

  it("概念和笔记走各自的知识库路由", () => {
    expect(classifyDeskTurn("解释一下虚拟内存").kind).toBe("concept");
    expect(extractDeskTopic("三体中几个重要角色的名字，人设和重要剧情是怎样的")).toBe("三体");
    expect(extractDeskTopic("崩铁现在数值膨胀严重，哪些角色还能使用？")).toBe("崩铁");
    expect(knowledgeSearchQuery("知识库里有一个笔记叫MIT6，总结一下内容")).toBe("MIT6");
    expect(extractDeskTopic("知识库里有一个笔记叫MIT6，总结一下内容")).toBe("MIT6");
    expect(knowledgeSearchQuery("分点详细总结一下我MIT6笔记的内容")).toBe("MIT6");
    expect(knowledgeRoute("分点详细总结一下我MIT6笔记的内容")).toEqual({
      kind: "summarize",
      query: "MIT6"
    });
    expect(knowledgeRoute("MIT6里BSS段是什么")).toEqual({
      kind: "lookup",
      query: "MIT6里BSS段是什么"
    });
    expect(knowledgeSearchQuery("总结下我知识库里MIT6的内容")).toBe("MIT6");
    expect(knowledgeRoute("总结下我知识库里MIT6的内容")).toEqual({
      kind: "summarize",
      query: "MIT6"
    });
    expect(classifyDeskTurn("总结下我知识库里MIT6的内容").kind).toBe("note");
    expect(extractDeskTopic("总结下我知识库里MIT6的内容")).toBe("MIT6");
  });

  it("人物介绍抽出名字", () => {
    expect(looksLikePersonQuery("爱因斯坦是谁")).toBe(true);
    expect(looksLikePersonQuery("我想了解本周上海天气")).toBe(false);
    expect(looksLikePersonQuery("我想了解一个月内上海的温度情况")).toBe(false);
    expect(classifyDeskTurn("我想了解一个月内上海的温度情况").kind).toBe("live");
    expect(extractPortraitName("我想了解一个月内上海的温度情况")).toBe("");
    expect(shouldAttachIllustration({ hint: "我想了解一个月内上海的温度情况", title: "温度情况" })).toBe(false);
    expect(looksLikePersonQuery("我想了解椎名真昼，可以在萌娘百科")).toBe(true);
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

  it("知识库没命中时禁止编造讲义", () => {
    const text = buildIntegratePrompt({
      web: false,
      kbEnabled: true,
      kbBody: null,
      noteQuestion: true
    });
    expect(text).toContain("没有与当前问题相关的文档");
    expect(text).toContain("禁止用固有知识编造");
    expect(text).toContain("核对文件名");
  });

  it("赛事题知识库没命中时按网页摘录直接回答", () => {
    const text = buildIntegratePrompt({
      web: true,
      webBody: "（根据来源整理的摘要，可以用来回答）\n2026 全球总决赛冠军是 BLG。",
      forCanvas: false,
      kbEnabled: true,
      kbBody: null,
      noteQuestion: false
    });
    expect(text).toContain("按工具结果回答");
    expect(text).toContain("老师笔记优先知识库");
    expect(text).toContain("BLG");
    expect(text).toContain("没有相关笔记");
    expect(text).not.toContain("核对文件名");
    expect(text).toContain("不要改口成依据不足");
    expect(text).toContain("优先知识库");
  });

  it("检索过但没有数字时，不要说没开联网", () => {
    const text = buildIntegratePrompt({
      web: true,
      webSearched: true,
      kbEnabled: false,
      kbBody: null
    });
    expect(text).toContain("已经检索过");
    expect(text).not.toContain("联网：未开启");
  });

  it("画布工具联网不预填摘录", () => {
    const text = buildIntegratePrompt({
      web: true,
      webTools: true,
      kbEnabled: false,
      kbBody: null
    });
    expect(text).toContain("web_search");
    expect(text).toContain("够用就直接回答");
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

describe("router 六道金标", () => {
  it("整理知识库讲义是 summarize + note", () => {
    const text = "整理一下知识库里操作系统讲义";
    expect(knowledgeRoute(text)).toEqual({ kind: "summarize", query: "操作系统" });
    expect(classifyDeskTurn(text).kind).toBe("note");
  });

  it("梳理我的笔记是 summarize + note", () => {
    const text = "梳理一下我的操作系统笔记";
    expect(knowledgeRoute(text)).toEqual({ kind: "summarize", query: "操作系统" });
    expect(classifyDeskTurn(text).kind).toBe("note");
  });

  it("对比人物仍 lookup", () => {
    const text = "对比分析孙悟空和哪吒的区别";
    expect(knowledgeRoute(text).kind).toBe("lookup");
    expect(classifyDeskTurn(text).kind).toBe("compare");
  });

  it("崩铁现在仍 lookup", () => {
    const text = "崩铁现在数值膨胀严重，哪些角色还能使用？";
    expect(knowledgeRoute(text).kind).toBe("lookup");
    expect(classifyDeskTurn(text).kind).toBe("work");
  });

  it("虚拟内存和有没有养猫手册不误收成笔记总结", () => {
    expect(knowledgeRoute("解释一下虚拟内存").kind).toBe("lookup");
    expect(knowledgeRoute("知识库里有没有养猫手册")).toEqual({ kind: "lookup", query: "知识库里有没有养猫手册" });
  });
});

describe("desk plan", () => {
  it("解析版式，非法则空", () => {
    expect(parseDeskCanvasChoice('{"canvas":true,"images":false,"form":"table"}')).toEqual({
      canvas: true,
      images: false,
      form: "table"
    });
    expect(parseDeskCanvasChoice('{"canvas":true,"images":true,"form":"none"}')).toEqual({
      canvas: false,
      images: true,
      form: "none"
    });
    expect(parseDeskCanvasChoice("不是 json")).toBeNull();
    expect(parseDeskCritic('{"pass":false,"fix":"没回答问题"}')).toEqual({ pass: false, fix: "没回答问题" });
    expect(parseDeskCritic('{"pass":false}')).toBeNull();
    expect(parseDeskCritic('{"pass":true}')).toEqual({ pass: true });
  });

  it("table 版式要求落画布", () => {
    expect(buildDeskCanvasGuide({ canvas: true, images: false, form: "table" })).toContain("kind=table");
    expect(buildDeskCanvasGuide({ canvas: false, images: false, form: "none" })).toContain("不落画布");
    expect(
      buildIntegratePrompt({
        web: true,
        webBody: "鸣潮 T0 秧秧",
        forCanvas: true,
        webLiveFact: false,
        kbEnabled: false,
        kbBody: null
      })
    ).toContain("写入画布");
  });

  it("布局角色按种类跨列", () => {
    expect(canvasLayoutRole("chart", { chartType: "line", labels: [], series: [] })).toBe("wide");
    expect(canvasLayoutRole("table", { columns: [], rows: [] })).toBe("wide");
    expect(canvasLayoutRole("markdown", { body: "短" })).toBe("half");
    expect(canvasLayoutRole("markdown", { body: "长".repeat(181) })).toBe("wide");
    expect(canvasLayoutRole("card", { body: "人物" })).toBe("half");
  });
});
