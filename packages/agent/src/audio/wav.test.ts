import { describe, expect, it } from "vitest";
import { encodePcm16MonoWav } from "./wav";

describe("encodePcm16MonoWav", () => {
  it("写出 RIFF/WAVE PCM header", () => {
    const pcm = new Int16Array([0, 1, -1]);
    const wav = encodePcm16MonoWav(pcm, 16000);
    const ascii = (start: number, len: number) =>
      String.fromCharCode(...wav.subarray(start, start + len));
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    expect(ascii(0, 4)).toBe("RIFF");
    expect(ascii(8, 4)).toBe("WAVE");
    expect(ascii(12, 4)).toBe("fmt ");
    expect(ascii(36, 4)).toBe("data");
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(6);
    expect(wav.length).toBe(50);
  });
});
