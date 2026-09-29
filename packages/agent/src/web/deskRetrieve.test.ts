import { describe, expect, it } from "vitest";
import { buildDeskSearchQueries, excerptMatchesQuestion, wikiUrlsFromSearchRaw } from "./deskRetrieve";

describe("buildDeskSearchQueries", () => {
  it("无人名整理题用作品主题查询，不用整句", () => {
    const queries = buildDeskSearchQueries("三体中几个重要角色的名字，人设和重要剧情是怎样的");
    expect(queries.some((item) => item.includes("三体") && item.includes("人设"))).toBe(true);
    expect(queries.some((item) => item.includes("剧情"))).toBe(true);
    expect(queries.every((item) => !item.includes("怎样的"))).toBe(true);
  });
  it("对照问句按角色名生成设定查询", () => {
    const queries = buildDeskSearchQueries("对比分析鸣潮爱弥斯和莫宁的萌点");
    expect(queries.some((item) => item.includes("爱弥斯"))).toBe(true);
    expect(queries.some((item) => item.includes("莫宁"))).toBe(true);
    expect(queries.length).toBeGreaterThanOrEqual(2);
    expect(queries.length).toBeLessThanOrEqual(4);
  });

  it("这位角色结合上文，不拿整句去搜", () => {
    const queries = buildDeskSearchQueries("可以上网查一查有关这位角色的情报", "拉海洛的巫女大人指的是绯雪，不是锁琅\n鸣潮心是一位怎样的角色");
    expect(queries.some((item) => item.includes("绯雪"))).toBe(true);
    expect(queries.every((item) => !item.includes("可以上网"))).toBe(true);
  });

  it("指代题即使写了作品名，仍用上文角色", () => {
    const queries = buildDeskSearchQueries(
      "可以上网查一查鸣潮中的这位角色",
      "拉海洛的巫女大人指的是绯雪，不是锁琅"
    );
    expect(queries.some((item) => item.includes("绯雪"))).toBe(true);
  });

  it("完整新问句不沿用上一页角色", () => {
    const queries = buildDeskSearchQueries(
      "崩铁现在数值膨胀严重，哪些角色还能使用？",
      "拉海洛的巫女大人指的是绯雪，不是锁琅\n鸣潮"
    );
    expect(queries.some((item) => item.includes("崩铁") && item.includes("数值膨胀"))).toBe(true);
    expect(queries.every((item) => !item.includes("绯雪") && !item.includes("鸣潮"))).toBe(true);
  });

  it("短追问仍用上文角色", () => {
    const queries = buildDeskSearchQueries("再详细一点", "拉海洛的巫女大人指的是绯雪，不是锁琅");
    expect(queries.some((item) => item.includes("绯雪"))).toBe(true);
  });

  it("新作品问句不沿用上一页角色", () => {
    const prior = "拉海洛的巫女大人指的是绯雪，不是锁琅\n更像是作品设定的巫女身份或称号和锁琅\n鸣潮";
    const queries = buildDeskSearchQueries("重返未来1999中最强，最保值的角色是哪个", prior);
    expect(queries.some((item) => item.includes("重返未来1999") && item.includes("最强"))).toBe(true);
    expect(queries.every((item) => !item.includes("绯雪") && !item.includes("巫女") && !item.includes("鸣潮"))).toBe(
      true
    );
  });

  it("有主题的整理题不混入旧卡人名", () => {
    const queries = buildDeskSearchQueries("三体中几个重要角色的名字，人设和重要剧情是怎样的", "指的是绯雪");
    expect(queries.some((item) => item.includes("三体"))).toBe(true);
    expect(queries.every((item) => !item.includes("绯雪"))).toBe(true);
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
