import { describe, expect, it } from "vitest";
import { packDeskCards, type DeskLayoutCard } from "./deskLayout";

function card(partial: Partial<DeskLayoutCard> & Pick<DeskLayoutCard, "id" | "w" | "h">): DeskLayoutCard {
  return { x: 0, y: 0, placed: false, ...partial };
}

describe("packDeskCards", () => {
  it("按实测宽度换行，宽卡不盖住旁边的卡", () => {
    const packed = packDeskCards(
      [
        card({ id: "a", w: 400, h: 220 }),
        card({ id: "b", w: 560, h: 200 }),
        card({ id: "c", w: 280, h: 160 })
      ],
      700
    );
    const byId = new Map(packed.map((item) => [item.id, item]));
    const a = byId.get("a");
    const b = byId.get("b");
    const c = byId.get("c");
    expect(a).toMatchObject({ x: 18, y: 18 });
    expect(b?.y).toBeGreaterThan((a?.y ?? 0) + (a?.h ?? 0));
    expect(c?.x).toBe(18);
    expect(c?.y).toBeGreaterThan((b?.y ?? 0) + (b?.h ?? 0));
  });

  it("拖过的卡片保持坐标，其余卡片躲开它", () => {
    const packed = packDeskCards(
      [
        card({ id: "fixed", w: 300, h: 200, x: 40, y: 40, placed: true }),
        card({ id: "auto", w: 300, h: 120 })
      ],
      700
    );
    expect(packed.find((item) => item.id === "fixed")).toMatchObject({ x: 40, y: 40 });
    const auto = packed.find((item) => item.id === "auto");
    expect(auto?.y).toBeGreaterThanOrEqual(40 + 200 + 16);
  });
});
