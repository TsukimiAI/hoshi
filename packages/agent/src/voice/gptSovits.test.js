"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const gptSovits_1 = require("./gptSovits");
const wav_1 = require("../audio/wav");
(0, vitest_1.describe)("gptSovits helpers", () => {
    (0, vitest_1.it)("只允许本机 url", () => {
        (0, vitest_1.expect)((0, gptSovits_1.assertLocalGsvUrl)("http://127.0.0.1:9880/")).toBe("http://127.0.0.1:9880");
        (0, vitest_1.expect)(() => (0, gptSovits_1.assertLocalGsvUrl)("http://example.com")).toThrow();
    });
    (0, vitest_1.it)("按 chunk 解析 wav", () => {
        const pcm = new Int16Array([1, -1, 2]);
        const wav = Buffer.from((0, wav_1.encodePcm16MonoWav)(pcm, 32000));
        const parsed = (0, gptSovits_1.pcmFromWav)(wav);
        (0, vitest_1.expect)(parsed?.rate).toBe(32000);
        (0, vitest_1.expect)(parsed?.pcm.length).toBe(6);
    });
});
