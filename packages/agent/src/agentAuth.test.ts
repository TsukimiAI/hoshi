import { describe, expect, it } from "vitest";
import { httpAuthorized, wsAuthorized } from "./agentAuth";

describe("agentAuth", () => {
  it("Bearer 匹配", () => {
    expect(httpAuthorized({ headers: { authorization: "Bearer tok" } } as never, "tok")).toBe(true);
    expect(httpAuthorized({ headers: { authorization: "Bearer other" } } as never, "tok")).toBe(false);
  });

  it("WS query token", () => {
    expect(wsAuthorized(new URL("http://127.0.0.1/v1/voice?token=tok"), "tok")).toBe(true);
    expect(wsAuthorized(new URL("http://127.0.0.1/v1/voice"), "tok")).toBe(false);
  });
});
