import { describe, expect, it } from "vitest";
import { parseAudioTags, audioTagFromPath } from "./audioTags";

function synchsafe(n: number): Buffer {
  const buf = Buffer.alloc(4);
  buf[0] = (n >> 21) & 0x7f;
  buf[1] = (n >> 14) & 0x7f;
  buf[2] = (n >> 7) & 0x7f;
  buf[3] = n & 0x7f;
  return buf;
}

function textFrame(id: string, text: string): Buffer {
  const body = Buffer.concat([Buffer.from([0]), Buffer.from(text, "latin1")]);
  const head = Buffer.alloc(10);
  head.write(id, 0, 4, "latin1");
  head.writeUInt32BE(body.length, 4);
  return Buffer.concat([head, body]);
}

describe("parseAudioTags", () => {
  it("无标签用文件名", () => {
    expect(audioTagFromPath("/tmp/demo song.mp3")).toEqual({
      path: "/tmp/demo song.mp3",
      title: "demo song",
      artist: "",
      album: "",
      picture: null
    });
    expect(parseAudioTags("/music/foo.mp3", Buffer.from("not id3")).title).toBe("foo");
  });

  it("读 ID3v2 标题与艺人", () => {
    const frames = Buffer.concat([textFrame("TIT2", "Night"), textFrame("TPE1", "Hoshi")]);
    const header = Buffer.alloc(10);
    header.write("ID3", 0, 3, "latin1");
    header[3] = 3;
    header[4] = 0;
    synchsafe(frames.length).copy(header, 6);
    const buf = Buffer.concat([header, frames]);
    const tag = parseAudioTags("/x/a.mp3", buf);
    expect(tag.title).toBe("Night");
    expect(tag.artist).toBe("Hoshi");
  });
});
