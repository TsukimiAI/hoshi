import { describe, expect, it } from "vitest";
import "./panelAction";

const { resolveLeftClickAction, resolveRightClickAction } = (
  globalThis as unknown as {
    hoshiPanelAction: {
      resolveLeftClickAction: (state: {
        fanVisible: boolean;
        dockVisible: boolean;
        chatVisible: boolean;
      }) => "showChat" | "showFan" | "closeAll";
      resolveRightClickAction: (state: {
        fanVisible: boolean;
        dockVisible: boolean;
        chatVisible: boolean;
      }) => "showChat" | "showFan" | "closeAll";
    };
  }
).hoshiPanelAction;

describe("panel actions", () => {
  it("左键：对话打开时收回，否则打开对话", () => {
    expect(
      resolveLeftClickAction({
        fanVisible: false,
        dockVisible: true,
        chatVisible: true
      })
    ).toBe("closeAll");
    expect(
      resolveLeftClickAction({
        fanVisible: true,
        dockVisible: false,
        chatVisible: false
      })
    ).toBe("showChat");
  });

  it("右键：侧栏打开时收回，否则打开侧栏", () => {
    expect(
      resolveRightClickAction({
        fanVisible: true,
        dockVisible: false,
        chatVisible: false
      })
    ).toBe("closeAll");
    expect(
      resolveRightClickAction({
        fanVisible: false,
        dockVisible: true,
        chatVisible: false
      })
    ).toBe("closeAll");
    expect(
      resolveRightClickAction({
        fanVisible: false,
        dockVisible: false,
        chatVisible: false
      })
    ).toBe("showFan");
  });
});
