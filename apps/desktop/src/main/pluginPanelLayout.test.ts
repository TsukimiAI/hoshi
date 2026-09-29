import { describe, expect, it } from "vitest";
import {
  PANEL_MAX_H,
  PANEL_MIN_H,
  PET_SLOT,
  clampPanelSize,
  panelBoundsFromPet,
  parsePanelSize,
  petWindowChanged,
  pinPetBounds
} from "./pluginPanelLayout";

const pet = { x: 40, y: 80, width: 520, height: 360 };

describe("clampPanelSize", () => {
  it("钳运行时尺寸，最小化高度可低于立绘窗", () => {
    expect(clampPanelSize(10, 900)).toEqual({ width: 200, height: PANEL_MAX_H });
    expect(clampPanelSize(280, 56)).toEqual({ width: 280, height: 56 });
    expect(clampPanelSize(9999, 1)).toEqual({ width: 800, height: PANEL_MIN_H });
  });
});

describe("parsePanelSize", () => {
  it("读 size 元组", () => {
    expect(parsePanelSize({ size: [320, 560] })).toEqual({ width: 320, height: 560 });
  });
});

describe("pinPetBounds", () => {
  it("面板改大小时立绘窗只钉死默认宽高，底边不动", () => {
    const stretched = { x: 40, y: 20, width: 800, height: 560 };
    const pinned = pinPetBounds(stretched, { width: 520, height: 360 });
    expect(pinned).toEqual({ x: 40, y: 220, width: 520, height: 360 });
    expect(pinned.y + pinned.height).toBe(stretched.y + stretched.height);
  });

  it("已是默认尺寸则不变", () => {
    expect(pinPetBounds(pet, { width: 520, height: 360 })).toEqual(pet);
    expect(petWindowChanged(pet, pinPetBounds(pet, { width: 520, height: 360 }))).toBe(false);
  });
});

describe("panelBoundsFromPet", () => {
  it("面板贴立绘右侧，不改 pet rect", () => {
    const before = { ...pet };
    const panel = panelBoundsFromPet(pet, { width: 320, height: 560 });
    expect(pet).toEqual(before);
    expect(panel).toEqual({
      x: pet.x + PET_SLOT,
      y: pet.y + pet.height - 560,
      width: 320,
      height: 560
    });
  });
});
