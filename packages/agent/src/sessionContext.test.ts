import { describe, expect, it } from "vitest";
import { sliceCompactSummary } from "./sessionContext";

describe("sliceCompactSummary", () => {
  it("超长截尾", () => {
    const line = "x".repeat(2000);
    const out = sliceCompactSummary("", [line, line]);
    expect(out.length).toBe(3200);
    expect(out.endsWith("x")).toBe(true);
  });
});
