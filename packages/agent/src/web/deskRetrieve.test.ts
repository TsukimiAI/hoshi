import { describe, expect, it } from "vitest";
import { deskFollowupQuery, deskQueryList, excerptMatchesQuestion, fallbackDeskSearchQuery, hitsByIndex, keepDeskExtra, listSearchHits, pageUrlsFromSearchRaw, weatherUrlsFromSearchRaw, wikiUrlsFromSearchRaw } from "./deskRetrieve";

describe("deskQueryList", () => {
  it("第一条就是原问句，空问句不搜", () => {
    const message = "鸣潮目前的T0角色和队伍";
    expect(deskQueryList(message, ["鸣潮 T0 配队", message])[0]).toBe(message);
    expect(deskQueryList(message, ["鸣潮 T0 配队"])).toEqual([message, "鸣潮 T0 配队"]);
    expect(deskQueryList("  ")).toEqual([]);
  });

  it("搜索结果按引擎顺序保留，帮助页丢掉，编号交给模型选", () => {
    const raw = `
1. 天气
   https://zh.moegirl.org.cn/天气
   天气（Weather）是指某一个地区距离地表较近的大气层
2. 搜索代码
   https://zh.moegirl.org.cn/Help:搜索
   Skip to content 萌娘百科 CirrusSearch 搜索代码
3. hololive
   https://zh.moegirl.org.cn/Hololive
   hololive每一期 成员介绍 图片
4. NIKKE
   https://nikke.example/cn
   胜利女神 国服 新角色`;
    const listed = listSearchHits(raw);
    expect(listed.map((hit) => hit.url)).toEqual([
      "https://zh.moegirl.org.cn/天气",
      "https://zh.moegirl.org.cn/Hololive",
      "https://nikke.example/cn"
    ]);
    expect(hitsByIndex(listed, [3, 2]).map((hit) => hit.url)).toEqual([
      "https://nikke.example/cn",
      "https://zh.moegirl.org.cn/Hololive"
    ]);
  });

  it("再去萌娘查时带上上一问", () => {
    const prior = "hololive每一期的成员介绍和图片";
    const message = "在萌娘或者其他地方再查查";
    expect(deskFollowupQuery(message, prior)).toBe(prior);
    expect(fallbackDeskSearchQuery(message, prior)).toBe(`${prior} ${message}`);
    expect(fallbackDeskSearchQuery("鸣潮目前的T0角色和队伍", prior)).toBe("鸣潮目前的T0角色和队伍");
    expect(keepDeskExtra("萌娘百科 站内搜索")).toBe(false);
    expect(keepDeskExtra("萌娘 Wiki 条目")).toBe(false);
  });
});

describe("wikiUrlsFromSearchRaw", () => {
  it("只收下维基/萌百链接", () => {
    const urls = wikiUrlsFromSearchRaw(`来源：
1. a https://zh.wikipedia.org/wiki/Foo
2. b https://baike.baidu.com/item/x
3. c https://zh.moegirl.org.cn/Bar`);
    expect(urls).toEqual(["https://zh.wikipedia.org/wiki/Foo", "https://zh.moegirl.org.cn/Bar"]);
  });

  it("本轮作品对不上的维基链接不抓", () => {
    const raw = `来源：
1. 绯雪 - 维基百科，自由的百科全书
   https://zh.wikipedia.org/wiki/绯雪
2. 重返未来1999
   https://zh.wikipedia.org/wiki/重返未来1999`;
    const urls = wikiUrlsFromSearchRaw(raw, "重返未来1999中最强，最保值的角色是哪个");
    expect(urls).toEqual(["https://zh.wikipedia.org/wiki/重返未来1999"]);
  });
});

describe("pageUrlsFromSearchRaw", () => {
  it("作品题优先抓普通网页，维基只作补充", () => {
    const raw = `来源：
1. 重返未来1999强度榜
   https://game.example.com/1999-tier
2. 维基
   https://zh.wikipedia.org/wiki/重返未来1999`;
    const urls = pageUrlsFromSearchRaw(raw, "重返未来1999中最强，最保值的角色是哪个", "work");
    expect(urls[0]).toBe("https://game.example.com/1999-tier");
    expect(urls).toContain("https://zh.wikipedia.org/wiki/重返未来1999");
  });

  it("人物题仍优先维基/萌百", () => {
    const raw = `来源：
1. 博客
   https://blog.example.com/einstein
2. 维基
   https://zh.wikipedia.org/wiki/爱因斯坦`;
    const urls = pageUrlsFromSearchRaw(raw, "爱因斯坦是谁", "person");
    expect(urls[0]).toBe("https://zh.wikipedia.org/wiki/爱因斯坦");
  });
});

describe("weatherUrlsFromSearchRaw", () => {
  it("时效题收下天气预报链接，跳过百科", () => {
    const urls = weatherUrlsFromSearchRaw(`来源：
1. 上海天气
   https://weather.example.com/shanghai
2. 百科
   https://baike.baidu.com/item/x
3. 角色
   https://zh.moegirl.org.cn/Foo`);
    expect(urls).toEqual(["https://weather.example.com/shanghai"]);
  });
});

describe("excerptMatchesQuestion", () => {
  it("别的作品条目不算这一问的摘录", () => {
    const ask = "重返未来1999中最强，最保值的角色是哪个";
    expect(excerptMatchesQuestion("# 绯雪\n\n绯雪是鸣潮中的共鸣者。", ask)).toBe(false);
    expect(excerptMatchesQuestion("# 重返未来：1999\n\n重返未来1999是一款角色扮演游戏。", ask)).toBe(true);
    expect(excerptMatchesQuestion("# 绯雪\n\n拉海洛的巫女。", "可以上网查一查有关这位角色的情报")).toBe(true);
    expect(excerptMatchesQuestion("# 绯雪\n\n绯雪是鸣潮角色。", "崩铁现在数值膨胀严重，哪些角色还能使用？")).toBe(
      false
    );
  });
});
