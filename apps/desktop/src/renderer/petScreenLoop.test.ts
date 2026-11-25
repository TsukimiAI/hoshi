import { describe, expect, it } from "vitest";
import "./petScreenLoop";

const { planPetScreenTick, commitPetScreenUpload, notePetScreenSpoken, isPetScreenFailureText } = (
  globalThis as unknown as {
    hoshiPetScreen: {
      planPetScreenTick: (input: {
        enabled: boolean;
        shot: { ok: boolean; reason?: "denied" | "restricted" | "no-source" | "failed"; hash?: string };
        sessionId: string;
        lastSessionId: string;
        lastHash: string;
        unchanged: (prev: string, next: string) => boolean;
        now: number;
        lastSpokenAt: number;
        cooldownMs: number;
        busy: {
          live: boolean;
          holding: boolean;
          draft: boolean;
          generating: boolean;
          typing: boolean;
          speaking: boolean;
          glancing: boolean;
        };
      }) => { upload: boolean; glance: boolean; status: string | null };
      commitPetScreenUpload: (
        prev: { sessionId: string; hash: string },
        uploaded: { ok: boolean; sessionId: string; hash: string }
      ) => { sessionId: string; hash: string };
      notePetScreenSpoken: (prevAt: number, spoke: boolean, now: number) => number;
      isPetScreenFailureText: (text: string) => boolean;
    };
  }
).hoshiPetScreen;

const idle = {
  live: false,
  holding: false,
  draft: false,
  generating: false,
  typing: false,
  speaking: false,
  glancing: false
};

function tick(
  patch: Partial<{
    enabled: boolean;
    shot: { ok: boolean; reason?: "denied" | "restricted" | "no-source" | "failed"; hash?: string };
    sessionId: string;
    lastSessionId: string;
    lastHash: string;
    now: number;
    lastSpokenAt: number;
    cooldownMs: number;
    busy: typeof idle;
  }>
) {
  return planPetScreenTick({
    enabled: patch.enabled ?? true,
    shot: patch.shot ?? { ok: true, hash: "bbbbbbbbbbbbbbbb" },
    sessionId: patch.sessionId ?? "s",
    lastSessionId: patch.lastSessionId ?? "s",
    lastHash: patch.lastHash ?? "aaaaaaaaaaaaaaaa",
    unchanged: (prev, next) => prev === next,
    now: patch.now ?? 100_000,
    lastSpokenAt: patch.lastSpokenAt ?? 0,
    cooldownMs: patch.cooldownMs ?? 60_000,
    busy: patch.busy ?? idle
  });
}

describe("planPetScreenTick", () => {
  it("开关关着什么都不做", () => {
    expect(tick({ enabled: false })).toEqual({ upload: false, glance: false, status: null });
  });

  it("截图失败不上传，也不替换已记住的哈希", () => {
    const prev = { sessionId: "s", hash: "aaaaaaaaaaaaaaaa" };
    const plan = tick({ shot: { ok: false, reason: "denied" } });
    expect(plan.upload).toBe(false);
    expect(plan.glance).toBe(false);
    expect(plan.status).toBe("需要允许录屏，才能看着桌面");
    expect(commitPetScreenUpload(prev, { ok: false, sessionId: "s", hash: "bbbbbbbbbbbbbbbb" })).toEqual(prev);
    expect(isPetScreenFailureText(plan.status ?? "")).toBe(true);
  });

  it("同一会话画面没变", () => {
    expect(
      tick({ shot: { ok: true, hash: "aaaaaaaaaaaaaaaa" }, lastHash: "aaaaaaaaaaaaaaaa" })
    ).toEqual({ upload: false, glance: false, status: null });
  });

  it("换了会话即使哈希相同也上传", () => {
    const plan = tick({
      sessionId: "next",
      lastSessionId: "s",
      shot: { ok: true, hash: "aaaaaaaaaaaaaaaa" },
      lastHash: "aaaaaaaaaaaaaaaa"
    });
    expect(plan.upload).toBe(true);
    expect(plan.glance).toBe(true);
  });

  it("空闲被占用时只上传", () => {
    const plan = tick({ busy: { ...idle, draft: true } });
    expect(plan.upload).toBe(true);
    expect(plan.glance).toBe(false);
  });

  it("glance 还没结束时仍上传", () => {
    const plan = tick({ busy: { ...idle, glancing: true } });
    expect(plan.upload).toBe(true);
    expect(plan.glance).toBe(false);
  });

  it("冷却内只上传", () => {
    const plan = tick({ lastSpokenAt: 50_000, now: 100_000, cooldownMs: 60_000 });
    expect(plan.upload).toBe(true);
    expect(plan.glance).toBe(false);
  });

  it("空闲且过了冷却才 glance", () => {
    const plan = tick({ lastSpokenAt: 40_000, now: 100_000, cooldownMs: 60_000 });
    expect(plan).toEqual({ upload: true, glance: true, status: null });
    expect(notePetScreenSpoken(40_000, false, 100_000)).toBe(40_000);
    expect(notePetScreenSpoken(40_000, true, 100_000)).toBe(100_000);
  });
});
