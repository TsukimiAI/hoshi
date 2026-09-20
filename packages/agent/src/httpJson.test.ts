import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { BodyTooLargeError, JSON_BODY_LIMIT, readJson } from "./httpJson";

function fakeReq(chunks: Buffer[]): Readable {
  return Readable.from(chunks);
}

describe("readJson", () => {
  it("解析对象", async () => {
    const req = fakeReq([Buffer.from('{"a":1}')]);
    await expect(readJson<{ a: number }>(req as never)).resolves.toEqual({ a: 1 });
  });

  it("超限抛 BodyTooLargeError", async () => {
    const req = fakeReq([Buffer.alloc(JSON_BODY_LIMIT + 1)]);
    await expect(readJson(req as never)).rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it("自定义上限", async () => {
    const req = fakeReq([Buffer.alloc(8)]);
    await expect(readJson(req as never, 4)).rejects.toBeInstanceOf(BodyTooLargeError);
  });
});
