import { describe, expect, it } from "vitest";
import "./pdfLayout";

type PdfTextItem = { str?: string; transform?: number[]; width?: number; height?: number; hasEOL?: boolean };
type Positioned = { str: string; x: number; y: number; h: number; w: number };

const { groupLines, normalizePdfItems, reconstructPdfPage, renderLine } = (
  globalThis as unknown as {
    hoshiPdfLayout: {
      normalizePdfItems: (items: PdfTextItem[]) => Positioned[];
      groupLines: (positioned: Positioned[]) => Positioned[][];
      renderLine: (line: Positioned[]) => string;
      reconstructPdfPage: (items: PdfTextItem[]) => string;
    };
  }
).hoshiPdfLayout;

function item(str: string, x: number, y: number, h = 10, w = 10): PdfTextItem {
  // pdf.js transform: [scaleX, skewX, skewY, scaleY, translateX, translateY]
  return { str, transform: [1, 0, 0, h, x, y], width: w, height: h };
}

describe("normalizePdfItems", () => {
  it("drops empty and coordinate-less items", () => {
    const out = normalizePdfItems([
      { str: "  ", transform: [1, 0, 0, 10, 0, 0] },
      { str: "no-transform" },
      { str: "ok", transform: [1, 0, 0, 12, 5, 100] }
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].str).toBe("ok");
    expect(out[0].h).toBe(12);
  });
});

describe("groupLines", () => {
  it("sorts top-to-bottom then left-to-right", () => {
    const lines = groupLines(normalizePdfItems([
      item("left", 10, 700),
      item("right", 90, 700),
      item("below", 10, 680)
    ]));
    expect(lines).toHaveLength(2);
    expect(lines[0].map((it) => it.str)).toEqual(["left", "right"]);
    expect(lines[1].map((it) => it.str)).toEqual(["below"]);
  });

  it("clusters items with close y into one line", () => {
    const lines = groupLines(normalizePdfItems([
      item("a", 10, 700),
      item("b", 30, 701),
      item("c", 50, 699)
    ]));
    expect(lines).toHaveLength(1);
    expect(lines[0].map((it) => it.str)).toEqual(["a", "b", "c"]);
  });
});

describe("renderLine", () => {
  it("joins nearby words with a single space", () => {
    const line = normalizePdfItems([item("hello", 10, 700), item("world", 30, 700)]);
    expect(renderLine(line)).toBe("hello world");
  });

  it("inserts a column separator for a wide horizontal gap", () => {
    const line = normalizePdfItems([item("name", 10, 700), item("age", 200, 700)]);
    expect(renderLine(line)).toBe("name | age");
  });
});

describe("reconstructPdfPage", () => {
  it("keeps normal line breaks without blank lines", () => {
    const text = reconstructPdfPage([
      item("first", 10, 700),
      item("second", 10, 688)
    ]);
    expect(text).toBe("first\nsecond");
  });

  it("inserts a blank line for a large vertical gap", () => {
    const text = reconstructPdfPage([
      item("para one", 10, 700),
      item("para two", 10, 660)
    ]);
    expect(text).toBe("para one\n\npara two");
  });

  it("reconstructs a table with a markdown separator row", () => {
    const text = reconstructPdfPage([
      item("Name", 10, 700),
      item("Age", 200, 700),
      item("Alice", 10, 688),
      item("30", 200, 688)
    ]);
    expect(text).toBe("| Name | Age |\n|---|---|\n| Alice | 30 |");
  });

  it("falls back to raw join when no coordinates exist", () => {
    const text = reconstructPdfPage([{ str: "a" }, { str: "b" }]);
    expect(text).toBe("ab");
  });
});
