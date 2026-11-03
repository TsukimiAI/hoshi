import { describe, expect, it } from "vitest";
import { CosyVoiceClient } from "./cosyVoice";

describe("CosyVoiceClient.finish", () => {
  it("未启动时等待结束并只回调一次", async () => {
    let done = 0;
    const client = new CosyVoiceClient("key", "http://127.0.0.1", "m", "v", () => undefined, () => {
      done += 1;
    });
    await client.finish();
    await client.finish();
    expect(done).toBe(1);
  });
});
