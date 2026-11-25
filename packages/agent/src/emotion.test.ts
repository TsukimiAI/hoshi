import { describe, expect, it } from "vitest";
import { inferSentenceEmotion, parseSentenceEmotion, resolveSentenceEmotion } from "./emotion";
import { SentenceSplitter } from "./sentence";

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

  it("裸写的表情词和被切断的词不留在口播里", () => {
    expect(parseSentenceEmotion("不能编一个名字。doubt可以把公告贴过来。expect", "normal").text).toBe(
      "不能编一个名字。可以把公告贴过来。"
    );
    expect(parseSentenceEmotion("我不能编造具体角色名ignation", "normal").text).toBe("我不能编造具体角色名");
  });

  it("括号、标签和句中的波浪号也不留在口播里", () => {
    expect(parseSentenceEmotion("好的，老师。（happy）", "normal")).toEqual({
      text: "好的，老师。",
      emotion: "happy",
      explicit: true
    });
    expect(parseSentenceEmotion("嗯(shy)", "normal").text).toBe("嗯");
    expect(parseSentenceEmotion("我看看【expect】", "normal").text).toBe("我看看");
    expect(parseSentenceEmotion("⟦ happy ⟧先这样", "normal").text).toBe("先这样");
    expect(parseSentenceEmotion("不能编名字。情绪：doubt", "normal").text).toBe("不能编名字。");
    expect(parseSentenceEmotion("第一句～happy，第二句", "normal").text).toBe("第一句，第二句");
    expect(parseSentenceEmotion("好的。⟦开心⟧", "normal")).toEqual({
      text: "好的。",
      emotion: "happy",
      explicit: true
    });
    expect(parseSentenceEmotion("嗯（害羞）", "normal").text).toBe("嗯");
    expect(parseSentenceEmotion("先这样～无奈", "normal").text).toBe("先这样");
    expect(parseSentenceEmotion("就这样。very_happy", "normal").text).toBe("就这样。");
    expect(parseSentenceEmotion("我有点害羞，先这样。", "normal").text).toBe("我有点害羞，先这样。");
    expect(parseSentenceEmotion("看这里（老师）", "normal").text).toBe("看这里（老师）");
    expect(parseSentenceEmotion("点被误判成句号、`⟦expect⟧` 还在。", "normal").text).toBe(
      "点被误判成句号、`⟦expect⟧` 还在。"
    );
  });

  it("整段回复里的情绪标记不会留在口播", () => {
    const raw =
      "老师又在调我的情绪标记啦，句子切分哪里不准直接告诉我嘛～ ⟦expect⟧ 还是有问题，我截不到图不知道为什么。只能复制回复给你";
    const splitter = new SentenceSplitter();
    const text = [...splitter.push(raw), ...splitter.flush()]
      .map((part) => resolveSentenceEmotion(part, "normal").text)
      .join("");
    expect(text).not.toContain("⟦");
    expect(text).not.toContain("⟧");
    expect(text).not.toContain("expect");
    expect(text).toContain("还是有问题");
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
