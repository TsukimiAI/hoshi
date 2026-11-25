import { describe, expect, it } from "vitest";
import {
  PET_SCREEN,
  dHashDistance,
  dHashFromGray,
  petScreenIntervalMs,
  petScreenUnchanged,
  pickDisplaySource,
  screenCaptureGate
} from "./petScreen";

function fill(value: number): number[] {
  return Array.from({ length: 72 }, () => value);
}

describe("dHash", () => {
  it("相同采样距离为 0", () => {
    const hash = dHashFromGray(fill(40));
    expect(dHashDistance(hash, dHashFromGray(fill(40)))).toBe(0);
    expect(petScreenUnchanged(hash, hash)).toBe(true);
  });

  it("改一个角后距离上升", () => {
    const base = fill(40);
    const changed = fill(40);
    changed[0] = 255;
    const distance = dHashDistance(dHashFromGray(base), dHashFromGray(changed));
    expect(distance).toBeGreaterThan(0);
  });

  it("全黑与全白的距离大于阈值", () => {
    const distance = dHashDistance(dHashFromGray(fill(0)), dHashFromGray(fill(255)));
    expect(distance).toBeGreaterThan(PET_SCREEN.hashThreshold);
    expect(petScreenUnchanged(dHashFromGray(fill(0)), dHashFromGray(fill(255)))).toBe(false);
  });

  it("距离不超过阈值视为同一画面", () => {
    const base = dHashFromGray(fill(0));
    const near = (1n << 3n).toString(16).padStart(16, "0");
    expect(dHashDistance(base, near)).toBe(1);
    expect(petScreenUnchanged(base, near)).toBe(true);
    const far = "ffffffffffffffff";
    expect(petScreenUnchanged(base, far)).toBe(false);
  });
});

describe("petScreenIntervalMs", () => {
  it("不得密于下限", () => {
    expect(petScreenIntervalMs(1000)).toBe(PET_SCREEN.minIntervalMs);
    expect(petScreenIntervalMs(PET_SCREEN.intervalMs)).toBe(PET_SCREEN.intervalMs);
    expect(petScreenIntervalMs(Number.NaN)).toBe(PET_SCREEN.intervalMs);
  });
});

describe("pickDisplaySource", () => {
  const sources = [{ display_id: "1" }, { display_id: "2" }];

  it("按显示器 id 选择，对不上用第一块，空列表为空", () => {
    expect(pickDisplaySource(sources, "2")).toEqual({ display_id: "2" });
    expect(pickDisplaySource(sources, "9")).toEqual({ display_id: "1" });
    expect(pickDisplaySource([], "1")).toBeNull();
  });
});

describe("screenCaptureGate", () => {
  it("restricted 停止，denied 只放行一次", () => {
    expect(screenCaptureGate("restricted", false)).toBe("restricted");
    expect(screenCaptureGate("granted", false)).toBe("proceed");
    expect(screenCaptureGate("not-determined", false)).toBe("proceed");
    expect(screenCaptureGate("denied", false)).toBe("proceed");
    expect(screenCaptureGate("denied", true)).toBe("denied");
  });
});
