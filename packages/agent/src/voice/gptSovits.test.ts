import { describe, expect, it } from "vitest";
import { assertLocalGsvUrl, pcmFromWav } from "./gptSovits";
import { encodePcm16MonoWav } from "../audio/wav";

describe("gptSovits helpers", () => {
  it("只允许本机 url", () => {
    expect(assertLocalGsvUrl("http://127.0.0.1:9880/")).toBe("http://127.0.0.1:9880");
    expect(() => assertLocalGsvUrl("http://example.com")).toThrow();
  });

  it("按 chunk 解析 wav", () => {
    const pcm = new Int16Array([1, -1, 2]);
    const wav = Buffer.from(encodePcm16MonoWav(pcm, 32000));
    const parsed = pcmFromWav(wav);
    expect(parsed?.rate).toBe(32000);
    expect(parsed?.pcm.length).toBe(6);
  });
});
