import { describe, expect, it } from "vitest";
import { resolveChatDeskMode } from "./server";

describe("resolveChatDeskMode", () => {
  it("desk 会话漏传 workspace 仍开画布", () => {
    expect(resolveChatDeskMode({ sessionKind: "desk" })).toEqual({ ok: true, desk: true });
  });

  it("desk 会话显式 workspace 仍 desk", () => {
    expect(resolveChatDeskMode({ sessionKind: "desk", workspace: "desk" })).toEqual({
      ok: true,
      desk: true
    });
  });

  it("chat 不传 workspace 保持桌宠", () => {
    expect(resolveChatDeskMode({ sessionKind: "chat" })).toEqual({ ok: true, desk: false });
  });

  it("chat 配 desk workspace 拒绝", () => {
    const result = resolveChatDeskMode({ sessionKind: "chat", workspace: "desk" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/desk session/);
    }
  });
});
