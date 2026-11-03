import { describe, expect, it } from "vitest";
import {
  buildExtractUserContent,
  canExtractMemory,
  extractLongTermOps,
  filterFacts,
  isDuplicateFact,
  parseOpsJson,
  sanitizeFactText,
  shouldExtract
} from "./extract";

describe("shouldExtract", () => {
  it("跳过寒暄天气代码联播报错语气", () => {
    expect(shouldExtract("今天上海天气怎么样")).toBe(false);
    expect(shouldExtract("帮我写一段代码")).toBe(false);
    expect(shouldExtract("这个函数怎么编译")).toBe(false);
    expect(shouldExtract("新闻联播看了吗")).toBe(false);
    expect(shouldExtract("嗯好的")).toBe(false);
    expect(shouldExtract("帮我看看这个报错 traceback")).toBe(false);
    expect(shouldExtract("你好")).toBe(false);
    expect(shouldExtract("   ")).toBe(false);
  });

  it("默认不抽，有事实信号才抽", () => {
    expect(shouldExtract("我叫韩")).toBe(true);
    expect(shouldExtract("请记住今天天气")).toBe(true);
    expect(shouldExtract("请记住新闻联播要点")).toBe(true);
    expect(shouldExtract("请记住我喜欢红茶")).toBe(true);
    expect(shouldExtract("别忘了老师不喝咖啡")).toBe(true);
    expect(shouldExtract("晚上我有点忙")).toBe(true);
    expect(shouldExtract("晚上有点忙")).toBe(false);
    expect(shouldExtract("喝茶")).toBe(false);
    expect(shouldExtract("加班")).toBe(false);
    expect(shouldExtract("给我一杯红茶")).toBe(false);
  });
});

describe("canExtractMemory", () => {
  it("关闭自动写入则不抽", () => {
    expect(canExtractMemory(false, "请记住我喜欢红茶")).toBe(false);
  });

  it("只看用户句，不要求助手正文", () => {
    expect(canExtractMemory(true, "请记住我喜欢红茶")).toBe(true);
    expect(canExtractMemory(true, "我叫韩")).toBe(true);
    expect(canExtractMemory(true, "今天天气怎么样")).toBe(false);
  });
});

describe("isDuplicateFact", () => {
  it("高度重叠才合并，短句不吞长句", () => {
    expect(isDuplicateFact("老师现在改喝绿茶了", ["老师现在改喝绿茶"])).toBe(true);
    expect(isDuplicateFact("老师喜欢红茶", ["老师平时喜欢喝红茶，而且只喝正山小种"])).toBe(false);
  });
});

describe("parseOpsJson", () => {
  it("丢掉含天气的 upsert", () => {
    expect(
      parseOpsJson(
        '{"ops":[{"action":"upsert","kind":"other","text":"老师请记住今天天气晴朗"}]}'
      )
    ).toEqual([]);
  });

  it("解析失败为空", () => {
    expect(parseOpsJson("not json")).toEqual([]);
    expect(parseOpsJson("{}")).toEqual([]);
  });

  it("解析 ops 并限制 3 条，非法 kind 为 other，保留 id", () => {
    expect(
      parseOpsJson(
        '{"ops":[{"action":"upsert","kind":"preference","id":"tea","text":"老师平时喜欢喝红茶"},{"action":"retract","kind":"preference","text":"老师以前爱喝绿茶"},{"action":"upsert","kind":"nope","text":"老师周末经常加班"},{"action":"upsert","kind":"habit","text":"老师晚上才开始写代码"}]}'
      )
    ).toEqual([
      { action: "upsert", kind: "preference", topic: "", text: "老师平时喜欢喝红茶", id: "tea" },
      { action: "retract", kind: "preference", topic: "", text: "老师以前爱喝绿茶" },
      { action: "upsert", kind: "other", topic: "", text: "老师周末经常加班" }
    ]);
  });

  it("兼容旧 facts 数组", () => {
    expect(parseOpsJson('{"facts":["老师平时喜欢喝红茶"]}')).toEqual([
      { action: "upsert", kind: "other", topic: "", text: "老师平时喜欢喝红茶" }
    ]);
  });
});

describe("sanitizeFactText", () => {
  it("拒绝过短与密钥，短名字可过", () => {
    expect(sanitizeFactText("太短")).toBeNull();
    expect(sanitizeFactText("老师叫韩")).toBe("老师叫韩");
    expect(sanitizeFactText("老师是研究生")).toBe("老师是研究生");
    expect(sanitizeFactText("老师不喝咖啡")).toBe("老师不喝咖啡");
    expect(sanitizeFactText("老师的 api key 是 abcdefg")).toBeNull();
    expect(sanitizeFactText("老师的住址在浦东新区")).toBeNull();
    expect(sanitizeFactText("老师平时喜欢喝红茶")).toBe("老师平时喜欢喝红茶");
    expect(sanitizeFactText("老师请记住今天天气晴朗")).toBeNull();
    expect(sanitizeFactText("老师请记住新闻联播要点")).toBeNull();
    expect(sanitizeFactText("老师记下今天晴气温二十度")).toBeNull();
    expect(sanitizeFactText("老师家在浦东新区某某路")).toBeNull();
    expect(sanitizeFactText("老师是新闻系研究生")).toBe("老师是新闻系研究生");
    expect(sanitizeFactText("老师讨厌每天聊天气")).toBe("老师讨厌每天聊天气");
    expect(sanitizeFactText("老师住在学校里面")).toBe("老师住在学校里面");
  });
});

describe("filterFacts", () => {
  it("过短、拒绝表、去重", () => {
    expect(filterFacts(["太短", "老师的 api key 是 abcdefg"], [])).toEqual([]);
    expect(filterFacts(["1. 老师喜欢在晚上写代码"], ["老师喜欢在晚上写代码"])).toEqual([]);
    expect(
      filterFacts(["老师平时喜欢喝红茶", "老师周末经常加班", "老师住在上海浦东"], [])
    ).toEqual(["老师平时喜欢喝红茶", "老师周末经常加班"]);
  });
});

describe("extractLongTermOps", () => {
  it("JSON 非法或失败则空，且不抛", async () => {
    expect(
      await extractLongTermOps({
        userText: "请记住我喜欢红茶",
        existing: [],
        completeChat: async () => "oops"
      })
    ).toEqual([]);
    expect(
      await extractLongTermOps({
        userText: "请记住我喜欢红茶",
        existing: [],
        completeChat: async () => {
          throw new Error("fail");
        }
      })
    ).toEqual([]);
  });

  it("只喂用户句也会调用模型", async () => {
    let called = 0;
    expect(
      await extractLongTermOps({
        userText: "请记住今天天气",
        existing: [],
        completeChat: async () => {
          called += 1;
          return '{"ops":[]}';
        }
      })
    ).toEqual([]);
    expect(called).toBe(1);
  });

  it("模型空返回时不补名字特例", async () => {
    expect(
      await extractLongTermOps({
        userText: "我叫韩",
        existing: [],
        completeChat: async () => '{"ops":[]}'
      })
    ).toEqual([]);
  });

  it("有效 ops", async () => {
    expect(
      await extractLongTermOps({
        userText: "请记住我喜欢红茶",
        existing: [],
        completeChat: async () =>
          '{"ops":[{"action":"upsert","kind":"preference","topic":"drink","text":"老师平时喜欢喝红茶"}]}'
      })
    ).toEqual([{ action: "upsert", kind: "preference", topic: "drink", text: "老师平时喜欢喝红茶" }]);
  });

  it("喂给模型的已有记忆带 id，最多 8 条", () => {
    const existing = Array.from({ length: 12 }, (_, i) => ({
      id: `h${i}`,
      text: `老师习惯编号${String(i).padStart(2, "0")}`,
      kind: "habit",
      topic: "habit"
    }));
    const content = buildExtractUserContent("请记住我喜欢红茶", existing);
    expect(content).toContain("id=h0");
    expect(content).toContain("老师习惯编号07");
    expect(content).not.toContain("老师习惯编号08");
    expect(content).not.toContain("星奈");
  });
});
