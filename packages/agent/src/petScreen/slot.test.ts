import { CHAT_IMAGE_MAX_DATA_CHARS, PET_SCREEN } from "@hoshi/shared";
import { describe, expect, it } from "vitest";
import { freshPetScreen, PetScreenSlot } from "./slot";

const HASH = "a".repeat(16);
const OTHER = "b".repeat(16);

describe("PetScreenSlot", () => {
  it("相同哈希不刷新时间，换会话会改绑定", () => {
    const slot = new PetScreenSlot();
    expect(
      slot.put({ sessionId: "a", mime: "image/jpeg", data: "YQ==", hash: HASH, now: 10 })
    ).toEqual({ ok: true, stored: true });
    expect(
      slot.put({ sessionId: "a", mime: "image/jpeg", data: "YQ==", hash: HASH.toUpperCase(), now: 99 })
    ).toEqual({ ok: true, stored: false });
    expect(slot.read("a", 10 + PET_SCREEN.frameTtlMs + 1)).toBeNull();

    expect(
      slot.put({ sessionId: "b", mime: "image/jpeg", data: "YQ==", hash: HASH, now: 50 })
    ).toEqual({ ok: true, stored: true });
    expect(slot.read("a", 50)).toBeNull();
    expect(slot.read("b", 50)?.at).toBe(50);
  });

  it("过期、会话不匹配读不到", () => {
    const slot = new PetScreenSlot();
    slot.put({ sessionId: "a", mime: "image/jpeg", data: "YQ==", hash: HASH, now: 0 });
    expect(slot.read("a", PET_SCREEN.frameTtlMs + 1)).toBeNull();
    expect(slot.read("b", 0)).toBeNull();
  });

  it("关闭和删除清掉像素，不重置冷却", () => {
    const slot = new PetScreenSlot();
    slot.put({ sessionId: "a", mime: "image/jpeg", data: "YQ==", hash: HASH, now: 0 });
    slot.markSpoken(HASH, 5);
    slot.clearPixels();
    expect(slot.read("a", 0)).toBeNull();
    expect(slot.commented()).toEqual({ hash: HASH, at: 5 });

    slot.put({ sessionId: "a", mime: "image/jpeg", data: "YQ==", hash: OTHER, now: 0 });
    slot.clearIfSession("b");
    expect(slot.read("a", 0)?.hash).toBe(OTHER);
    slot.clearIfSession("a");
    expect(slot.read("a", 0)).toBeNull();
    expect(slot.commented().hash).toBe(HASH);
  });

  it("拒绝空图、错误类型和坏哈希", () => {
    const slot = new PetScreenSlot();
    expect(slot.put({ sessionId: "a", mime: "image/png", data: "YQ==", hash: HASH, now: 0 }).ok).toBe(
      false
    );
    expect(slot.put({ sessionId: "a", mime: "image/jpeg", data: "", hash: HASH, now: 0 }).ok).toBe(
      false
    );
    expect(slot.put({ sessionId: "a", mime: "image/jpeg", data: "YQ==", hash: "zz", now: 0 }).ok).toBe(
      false
    );
    expect(
      slot.put({
        sessionId: "a",
        mime: "image/jpeg",
        data: "a".repeat(CHAT_IMAGE_MAX_DATA_CHARS + 1),
        hash: HASH,
        now: 0
      }).ok
    ).toBe(false);
  });
});

describe("freshPetScreen", () => {
  it("只有打开的桌宠会话、且帧未过期才返回", () => {
    const slot = new PetScreenSlot();
    slot.put({ sessionId: "s", mime: "image/jpeg", data: "YQ==", hash: HASH, now: 0 });
    const base = { sessionId: "s", now: 0, slot };
    expect(freshPetScreen({ ...base, enabled: true, kind: "chat" })).toEqual({
      mime: "image/jpeg",
      data: "YQ=="
    });
    expect(freshPetScreen({ ...base, enabled: false, kind: "chat" })).toBeNull();
    expect(freshPetScreen({ ...base, enabled: true, kind: "desk" })).toBeNull();
    expect(freshPetScreen({ ...base, enabled: true, kind: "chat", sessionId: "other" })).toBeNull();
    expect(
      freshPetScreen({ ...base, enabled: true, kind: "chat", now: PET_SCREEN.frameTtlMs + 1 })
    ).toBeNull();
  });
});

describe("glance interval", () => {
  it("新区间盖掉旧的，清掉之后接不上", () => {
    const slot = new PetScreenSlot();
    slot.beginInterval("s", "old", 1);
    slot.beginInterval("s", "new", 2);
    expect(slot.openInterval()).toEqual({ id: "new", sessionId: "s", at: 2 });
    slot.clearInterval();
    expect(slot.openInterval()).toBeNull();
    slot.beginInterval("s", "iv", 3);
    slot.clearIfSession("s");
    expect(slot.openInterval()).toBeNull();
  });
});
