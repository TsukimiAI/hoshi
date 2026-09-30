import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseByteRange, serveLocalMedia } from "./mediaFile";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs.length = 0;
});

describe("parseByteRange", () => {
  it("无 Range 返回全文", () => {
    expect(parseByteRange(100, null)).toBe("full");
  });
  it("解析起始到结尾", () => {
    expect(parseByteRange(100, "bytes=40-")).toEqual({ start: 40, end: 99 });
  });
  it("解析闭区间", () => {
    expect(parseByteRange(100, "bytes=10-19")).toEqual({ start: 10, end: 19 });
  });
  it("解析后缀", () => {
    expect(parseByteRange(100, "bytes=-20")).toEqual({ start: 80, end: 99 });
  });
  it("越界为 416", () => {
    expect(parseByteRange(100, "bytes=100-120")).toBe("unsatisfiable");
  });
});

describe("serveLocalMedia", () => {
  it("206 返回切片并带 Accept-Ranges", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hoshi-media-"));
    dirs.push(dir);
    const abs = join(dir, "a.mp3");
    writeFileSync(abs, Buffer.from("0123456789"));
    const res = serveLocalMedia(abs, new Request("hoshi-media://plugin/", { headers: { Range: "bytes=2-5" } }));
    expect(res.status).toBe(206);
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
    expect(res.headers.get("Content-Range")).toBe("bytes 2-5/10");
    expect(res.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(await res.text()).toBe("2345");
  });
});
