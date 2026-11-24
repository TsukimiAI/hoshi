export type DeskLayoutCard = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  placed: boolean;
};

const GAP = 16;
const PAD = 18;

function overlaps(a: DeskLayoutCard, b: DeskLayoutCard): boolean {
  return a.x < b.x + b.w + GAP && a.x + a.w + GAP > b.x && a.y < b.y + b.h + GAP && a.y + a.h + GAP > b.y;
}

/** 未拖动的卡片按实测宽高从左到右换行排开，并躲开已经拖动过的卡片。 */
export function packDeskCards(cards: DeskLayoutCard[], boardWidth: number): DeskLayoutCard[] {
  const width = Math.max(boardWidth, PAD * 2 + 280);
  const placed = cards.filter((card) => card.placed).map((card) => ({ ...card }));
  const occupied = placed.map((card) => ({ ...card }));
  const packed: DeskLayoutCard[] = [];
  let x = PAD;
  let y = PAD;
  let rowHeight = 0;
  for (const card of cards) {
    if (card.placed) {
      continue;
    }
    let left = x;
    let top = y;
    if (left > PAD && left + card.w > width - PAD) {
      left = PAD;
      top = y + rowHeight + GAP;
      rowHeight = 0;
    }
    let guard = 0;
    while (guard < 48) {
      const hit = occupied.find((box) => overlaps({ ...card, x: left, y: top }, box));
      if (!hit) {
        break;
      }
      top = hit.y + hit.h + GAP;
      left = PAD;
      rowHeight = 0;
      guard += 1;
    }
    const next = { ...card, x: left, y: top };
    packed.push(next);
    occupied.push(next);
    x = left + card.w + GAP;
    y = top;
    rowHeight = Math.max(rowHeight, card.h);
  }
  return [...placed, ...packed];
}
