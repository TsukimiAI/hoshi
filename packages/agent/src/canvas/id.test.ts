import { describe, expect, it } from "vitest";
import { canvasItemIdFromPath } from "./id";

describe("canvasItemIdFromPath", () => {
  it("接受 UUID 和 slug", () => {
    expect(canvasItemIdFromPath("/v1/canvas/weather-week")).toBe("weather-week");
    expect(canvasItemIdFromPath("/v1/canvas/11111111-1111-1111-1111-111111111111")).toBe(
      "11111111-1111-1111-1111-111111111111"
    );
    expect(canvasItemIdFromPath("/v1/canvas/a%20b")).toBe("a b");
  });

  it("拒绝列表路径和穿越", () => {
    expect(canvasItemIdFromPath("/v1/canvas")).toBeNull();
    expect(canvasItemIdFromPath("/v1/canvas/")).toBeNull();
    expect(canvasItemIdFromPath("/v1/canvas/../x")).toBeNull();
    expect(canvasItemIdFromPath("/v1/canvas/restore")).toBeNull();
    expect(canvasItemIdFromPath("/v1/canvas/reorder")).toBeNull();
  });
});
