"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const wav_1 = require("./wav");
(0, vitest_1.describe)("encodePcm16MonoWav", () => {
    (0, vitest_1.it)("写出 RIFF/WAVE PCM header", () => {
        const pcm = new Int16Array([0, 1, -1]);
        const wav = (0, wav_1.encodePcm16MonoWav)(pcm, 16000);
        const ascii = (start, len) => String.fromCharCode(...wav.subarray(start, start + len));
        const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
        (0, vitest_1.expect)(ascii(0, 4)).toBe("RIFF");
        (0, vitest_1.expect)(ascii(8, 4)).toBe("WAVE");
        (0, vitest_1.expect)(ascii(12, 4)).toBe("fmt ");
        (0, vitest_1.expect)(ascii(36, 4)).toBe("data");
        (0, vitest_1.expect)(view.getUint16(20, true)).toBe(1);
        (0, vitest_1.expect)(view.getUint16(22, true)).toBe(1);
        (0, vitest_1.expect)(view.getUint32(24, true)).toBe(16000);
        (0, vitest_1.expect)(view.getUint16(34, true)).toBe(16);
        (0, vitest_1.expect)(view.getUint32(40, true)).toBe(6);
        (0, vitest_1.expect)(wav.length).toBe(50);
    });
});
