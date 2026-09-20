"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const emotion_1 = require("./emotion");
(0, vitest_1.describe)("parseSentenceEmotion", () => {
    (0, vitest_1.it)("解析合法 emotion 标记", () => {
        const out = (0, emotion_1.parseSentenceEmotion)("好的，老师。⟦happy⟧", "normal");
        (0, vitest_1.expect)(out).toEqual({ text: "好的，老师。", emotion: "happy", explicit: true });
    });
    (0, vitest_1.it)("非法标记回落到默认情绪", () => {
        const out = (0, emotion_1.parseSentenceEmotion)("嗯。⟦unknown⟧", "normal");
        (0, vitest_1.expect)(out).toEqual({ text: "嗯。", emotion: "normal", explicit: false });
    });
    (0, vitest_1.it)("无标记时保持原文本", () => {
        const out = (0, emotion_1.parseSentenceEmotion)("老师早上好", "expect");
        (0, vitest_1.expect)(out).toEqual({ text: "老师早上好", emotion: "expect", explicit: false });
    });
    (0, vitest_1.it)("解析句末 ～emotion 并去掉标记", () => {
        (0, vitest_1.expect)((0, emotion_1.parseSentenceEmotion)("释放高倍率技能～happy", "normal")).toEqual({
            text: "释放高倍率技能",
            emotion: "happy",
            explicit: true
        });
        (0, vitest_1.expect)((0, emotion_1.parseSentenceEmotion)("抽卡优先级通常是0链～normal", "sad")).toEqual({
            text: "抽卡优先级通常是0链",
            emotion: "normal",
            explicit: true
        });
    });
});
(0, vitest_1.describe)("inferSentenceEmotion", () => {
    (0, vitest_1.it)("能识别积极文本", () => {
        (0, vitest_1.expect)((0, emotion_1.inferSentenceEmotion)("太好了，谢谢老师", "normal")).toBe("happy");
    });
    (0, vitest_1.it)("能识别负面文本", () => {
        (0, vitest_1.expect)((0, emotion_1.inferSentenceEmotion)("我今天很难过", "normal")).toBe("sad");
    });
    (0, vitest_1.it)("无匹配时回落默认", () => {
        (0, vitest_1.expect)((0, emotion_1.inferSentenceEmotion)("我们继续下一题", "normal")).toBe("normal");
    });
});
