import { describe, expect, it } from "vitest";
import { parsePluginContributes, parsePluginUi } from "./plugin";

describe("parsePluginContributes", () => {
  it("只保留 sprites", () => {
    const parsed = parsePluginContributes({
      sprites: { happy: "art/happy.png" },
      webviews: [{ id: "player", title: "音乐", entry: "ui/index.html", width: 360 }],
      commands: [{ id: "open", title: "音乐", webview: "player" }]
    });
    expect(parsed).toEqual({ sprites: { happy: "art/happy.png" } });
  });

  it("无 sprites 则忽略窗口字段", () => {
    expect(
      parsePluginContributes({
        windows: [{ id: "player", title: "音乐", entry: "ui/index.html" }]
      })
    ).toBeUndefined();
  });
});

describe("parsePluginUi", () => {
  it("读 menu/panel 并钳 size", () => {
    expect(
      parsePluginUi({
        menu: { label: "音乐播放器" },
        panel: { file: "panel.html", size: [10, 900] }
      })
    ).toEqual({
      menu: { label: "音乐播放器" },
      panel: { file: "panel.html", size: [160, 520] }
    });
  });

  it("默认 size，拒绝穿越路径", () => {
    expect(
      parsePluginUi({
        menu: { label: "播放" },
        panel: { file: "panel.html" }
      })?.panel.size
    ).toEqual([280, 360]);
    expect(
      parsePluginUi({
        menu: { label: "播放" },
        panel: { file: "../x.html" }
      })
    ).toBeUndefined();
  });
});
