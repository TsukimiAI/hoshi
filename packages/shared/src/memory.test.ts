import { describe, expect, it } from "vitest";
import { memoryAckBadge } from "./memory";

describe("memoryAckBadge", () => {
  it("空 ackedAt 为未确认", () => {
    expect(memoryAckBadge(null)).toBe("未确认");
    expect(memoryAckBadge(undefined)).toBe("未确认");
    expect(memoryAckBadge("")).toBe("未确认");
  });

  it("有确认时间则不标", () => {
    expect(memoryAckBadge("2026-01-01T00:00:00.000Z")).toBe("");
  });
});
