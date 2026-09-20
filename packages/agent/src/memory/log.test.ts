import { describe, expect, it, vi } from "vitest";
import { logMemoryTurn, summarizeWrites } from "./log";

describe("summarizeWrites", () => {
  it("空为 none", () => {
    expect(summarizeWrites([])).toBe("none");
  });

  it("同类与 mixed", () => {
    expect(summarizeWrites([{ type: "insert", text: "a", kind: "habit", topic: "x" }])).toBe("insert");
    expect(
      summarizeWrites([
        { type: "insert", text: "a", kind: "habit", topic: "x" },
        { type: "update", id: "1", text: "b", topic: "x" }
      ])
    ).toBe("mixed");
  });
});

describe("logMemoryTurn", () => {
  it("带 src", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logMemoryTurn({
      phase: "chat",
      sessionId: "s",
      turnId: "t",
      inject: 1,
      ack: 0,
      extract: "skip",
      ms: 3
    });
    expect(JSON.parse(String(spy.mock.calls[0]?.[0]))).toEqual({
      src: "hoshi.memory",
      phase: "chat",
      sessionId: "s",
      turnId: "t",
      inject: 1,
      ack: 0,
      extract: "skip",
      ms: 3
    });
    spy.mockRestore();
  });
});
