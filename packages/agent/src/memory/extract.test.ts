import { describe, expect, it } from "vitest";
import {
  buildExtractUserContent,
  canExtractMemory,
  extractLongTermOps,
  filterFacts,
  parseOpsJson,
  sanitizeFactText,
  shouldExtract
} from "./extract";

describe("shouldExtract", () => {
  it("天气等一次性否决", () => {
    expect(shouldExtract("今天上海天气怎么样")).toBe(false);
    expect(shouldExtract("帮我写一段代码")).toBe(false);
  });

  it("含记住等准入，记住优先于天气否决", () => {
    expect(shouldExtract("嗯")).toBe(false);
    expect(shouldExtract("我叫韩")).toBe(true);
    expect(shouldExtract("请记住我喜欢喝红茶")).toBe(true);
    expect(shouldExtract("请记住今天天气")).toBe(true);
    expect(shouldExtract("今天上海天气怎么样")).toBe(false);
  });
});

describe("canExtractMemory", () => {
  it("关闭自动写入则不抽", () => {
    expect(canExtractMemory(false, "请记住我喜欢红茶", "好的老师。")).toBe(false);
  });

  it("开启且双方有正文才抽", () => {
    expect(canExtractMemory(true, "请记住我喜欢红茶", "好的老师。")).toBe(true);
    expect(canExtractMemory(true, "请记住我喜欢红茶", "  ")).toBe(false);
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

  it("解析 ops 并限制 3 条，非法 kind 为 other", () => {
    expect(
      parseOpsJson(
        '{"ops":[{"action":"upsert","kind":"preference","text":"老师平时喜欢喝红茶"},{"action":"retract","kind":"preference","text":"老师以前爱喝绿茶"},{"action":"upsert","kind":"nope","text":"老师周末经常加班"},{"action":"upsert","kind":"habit","text":"老师晚上才开始写代码"}]}'
      )
    ).toEqual([
      { action: "upsert", kind: "preference", topic: "", text: "老师平时喜欢喝红茶" },
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
  it("拒绝过短与密钥", () => {
    expect(sanitizeFactText("太短")).toBeNull();
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
        assistantText: "好的。",
        existing: [],
        completeChat: async () => "oops"
      })
    ).toEqual([]);
    expect(
      await extractLongTermOps({
        userText: "请记住我喜欢红茶",
        assistantText: "好的。",
        existing: [],
        completeChat: async () => {
          throw new Error("fail");
        }
      })
    ).toEqual([]);
  });

  it("天气跳过不调用模型", async () => {
    let called = 0;
    expect(
      await extractLongTermOps({
        userText: "今天上海天气怎么样",
        assistantText: "晴。",
        existing: [],
        completeChat: async () => {
          called += 1;
          return '{"ops":[]}';
        }
      })
    ).toEqual([]);
    expect(called).toBe(0);
  });

  it("有效 ops", async () => {
    expect(
      await extractLongTermOps({
        userText: "请记住我喜欢红茶",
        assistantText: "记住了。",
        existing: [],
        completeChat: async () =>
          '{"ops":[{"action":"upsert","kind":"preference","topic":"drink","text":"老师平时喜欢喝红茶"}]}'
      })
    ).toEqual([{ action: "upsert", kind: "preference", topic: "drink", text: "老师平时喜欢喝红茶" }]);
  });

  it("喂给模型的已有记忆最多 12 条", () => {
    const existing = Array.from({ length: 15 }, (_, i) => ({
      text: `老师习惯编号${String(i).padStart(2, "0")}`,
      kind: "habit",
      topic: "habit"
    }));
    const content = buildExtractUserContent("请记住我喜欢红茶", "好的。", existing);
    expect(content).toContain("[habit/habit] 老师习惯编号00");
    expect(content).toContain("老师习惯编号11");
    expect(content).not.toContain("老师习惯编号12");
  });
});
