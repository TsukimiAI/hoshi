import { describe, expect, it } from "vitest";
import { inferSentenceEmotion, parseSentenceEmotion } from "./emotion";

describe("parseSentenceEmotion", () => {
  it("解析合法 emotion 标记", () => {
    const out = parseSentenceEmotion("好的，老师。⟦happy⟧", "normal");
    expect(out).toEqual({ text: "好的，老师。", emotion: "happy", explicit: true });
  });

  it("非法标记回落到默认情绪", () => {
    const out = parseSentenceEmotion("嗯。⟦unknown⟧", "normal");
    expect(out).toEqual({ text: "嗯。", emotion: "normal", explicit: false });
  });

  it("无标记时保持原文本", () => {
    const out = parseSentenceEmotion("老师早上好", "expect");
    expect(out).toEqual({ text: "老师早上好", emotion: "expect", explicit: false });
  });

  it("解析句末 ～emotion 并去掉标记", () => {
    expect(parseSentenceEmotion("释放高倍率技能～happy", "normal")).toEqual({
      text: "释放高倍率技能",
      emotion: "happy",
      explicit: true
    });
    expect(parseSentenceEmotion("抽卡优先级通常是0链～normal", "sad")).toEqual({
      text: "抽卡优先级通常是0链",
      emotion: "normal",
      explicit: true
    });
  });
});

describe("inferSentenceEmotion", () => {
  it("能识别积极文本", () => {
    expect(inferSentenceEmotion("太好了，谢谢老师", "normal")).toBe("happy");
  });

  it("能识别负面文本", () => {
    expect(inferSentenceEmotion("我今天很难过", "normal")).toBe("sad");
  });

  it("无匹配时回落默认", () => {
    expect(inferSentenceEmotion("我们继续下一题", "normal")).toBe("normal");
  });
});
