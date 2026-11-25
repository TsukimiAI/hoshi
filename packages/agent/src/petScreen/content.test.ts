import { describe, expect, it } from "vitest";
import { PET_SCREEN_TURN_NOTE, screenForTurn, userContentWithScreen } from "./content";

describe("screenForTurn", () => {
  const screen = { mime: "image/jpeg" as const, data: "QQ==" };

  it("普通聊天不带屏幕", () => {
    expect(screenForTurn("句子切分还是不准", screen)).toBeNull();
    expect(screenForTurn("你好", screen)).toBeNull();
    expect(screenForTurn("看这个", null)).toBeNull();
  });

  it("话里指着画面时才带上", () => {
    expect(screenForTurn("这个报错什么意思", screen)).toEqual(screen);
    expect(screenForTurn("看这个", screen)).toEqual(screen);
  });
});

describe("userContentWithScreen", () => {
  it("没有屏幕时与只带附图的结果相同", () => {
    expect(userContentWithScreen("你好", [], null)).toBe("你好");
    const images = [{ mime: "image/png", data: "YQ==" }];
    expect(userContentWithScreen("你好", images, undefined)).toEqual([
      { type: "text", text: "你好" },
      { type: "image_url", image_url: { url: "data:image/png;base64,YQ==" } }
    ]);
  });

  it("没有附图时仍是内容数组，说明在屏幕图前面", () => {
    expect(userContentWithScreen("这个报错", [], { mime: "image/jpeg", data: "QQ==" })).toEqual([
      { type: "text", text: "这个报错" },
      { type: "text", text: PET_SCREEN_TURN_NOTE },
      { type: "image_url", image_url: { url: "data:image/jpeg;base64,QQ==" } }
    ]);
  });

  it("附图和屏幕都在时，说明夹在中间", () => {
    const parts = userContentWithScreen(
      "看这个",
      [{ mime: "image/png", data: "YQ==" }],
      { mime: "image/jpeg", data: "QQ==" }
    );
    expect(parts).toEqual([
      { type: "text", text: "看这个" },
      { type: "image_url", image_url: { url: "data:image/png;base64,YQ==" } },
      { type: "text", text: PET_SCREEN_TURN_NOTE },
      { type: "image_url", image_url: { url: "data:image/jpeg;base64,QQ==" } }
    ]);
  });
});
