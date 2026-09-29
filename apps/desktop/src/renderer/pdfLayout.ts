// 布局感知的 PDF 文本重建：按坐标重排行/列，识别表格列与段落间距。
// pdf.js 默认按内容流顺序返回文本项，跨栏、表格、页眉页脚会乱序；
// 这里依据每个文本项的 transform（x/y 坐标 + 字号）重排成正常阅读顺序，
// 并把大水平间距还原成表格分隔符、大垂直间距还原成段落空行。

interface PdfTextItem {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
  hasEOL?: boolean;
}

interface PositionedItem {
  str: string;
  x: number;
  y: number;
  h: number;
  w: number;
}

/** 文本项的横向宽度阈值：超过此水平间距视为表格/分栏分隔。 */
const COLUMN_GAP_RATIO = 1.6;
/** 同一行内聚类的垂直容差（相对字号）。 */
const LINE_TOLERANCE_RATIO = 0.5;
/** 段落空行的垂直间距阈值（相对字号）。 */
const PARAGRAPH_GAP_RATIO = 2.2;
/** 表格行连续出现的最小行数，达到后补一行 markdown 表头分隔。 */
const TABLE_MIN_ROWS = 2;

function normalizePdfItems(items: PdfTextItem[]): PositionedItem[] {
  const out: PositionedItem[] = [];
  for (const item of items) {
    if (typeof item.str !== "string") {
      continue;
    }
    const trimmed = item.str.trim();
    if (!trimmed) {
      continue;
    }
    const transform = Array.isArray(item.transform) && item.transform.length >= 6 ? item.transform : null;
    if (!transform) {
      continue;
    }
    const h = Math.abs(transform[3]) || Math.abs(item.height ?? 0) || 10;
    out.push({
      str: trimmed,
      x: transform[4],
      y: transform[5],
      h,
      w: item.width ?? trimmed.length * h * 0.5
    });
  }
  return out;
}

function groupLines(positioned: PositionedItem[]): PositionedItem[][] {
  if (positioned.length === 0) {
    return [];
  }
  // PDF 坐标 y 向上增长：按 y 降序即自上而下，同 y 按 x 升序即自左而右。
  const sorted = [...positioned].sort((a, b) => (Math.abs(b.y - a.y) > 1 ? b.y - a.y : a.x - b.x));
  const lines: PositionedItem[][] = [];
  let current: PositionedItem[] = [];
  let currentY = 0;
  for (const item of sorted) {
    if (current.length === 0) {
      current = [item];
      currentY = item.y;
      continue;
    }
    const tolerance = Math.max(2, Math.min(current[0].h, item.h) * LINE_TOLERANCE_RATIO);
    if (Math.abs(item.y - currentY) <= tolerance) {
      current.push(item);
    } else {
      lines.push(current.sort((a, b) => a.x - b.x));
      current = [item];
      currentY = item.y;
    }
  }
  if (current.length > 0) {
    lines.push(current.sort((a, b) => a.x - b.x));
  }
  return lines;
}

function renderLine(line: PositionedItem[]): string {
  if (line.length === 0) {
    return "";
  }
  let text = "";
  let lastRight = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < line.length; i += 1) {
    const item = line[i];
    if (i > 0) {
      const gap = item.x - lastRight;
      if (gap > Math.max(8, item.h * COLUMN_GAP_RATIO)) {
        text += " | ";
      } else if (gap > Math.max(2, item.h * 0.25)) {
        text += " ";
      }
    }
    text += item.str;
    lastRight = item.x + item.w;
  }
  return text;
}

/**
 * 把一个 PDF 页面的文本项重建为 markdown 风格纯文本。
 * 若所有文本项都缺少坐标（极端情况），退回按原始顺序拼接。
 */
function reconstructPdfPage(items: PdfTextItem[]): string {
  const positioned = normalizePdfItems(items);
  if (positioned.length === 0) {
    return items.map((item) => (typeof item.str === "string" ? item.str : "")).join("");
  }
  const lines = groupLines(positioned);
  const rendered: string[] = [];
  let prevBaseline: number | null = null;
  let prevFont = 10;
  for (const line of lines) {
    const firstItem = line[0];
    if (prevBaseline !== null) {
      const gap = prevBaseline - firstItem.y;
      if (gap > Math.max(PARAGRAPH_GAP_RATIO * prevFont, PARAGRAPH_GAP_RATIO * firstItem.h)) {
        rendered.push("");
      }
    }
    rendered.push(renderLine(line));
    prevBaseline = firstItem.y;
    prevFont = firstItem.h;
  }

  const text = rendered.join("\n").replace(/\n{3,}/g, "\n\n").trim();

  // 连续多行含「 | 」视为表格，给首行后补 markdown 表头分隔，使其成为原子块。
  return addTableSeparators(text);
}

function addTableSeparators(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.includes(" | ")) {
      let j = i;
      while (j < lines.length && lines[j].includes(" | ")) {
        j += 1;
      }
      const rows = lines.slice(i, j);
      if (rows.length >= TABLE_MIN_ROWS) {
        const colCount = (rows[0].match(/\|/g) ?? []).length + 1;
        const separator = `|${Array.from({ length: colCount }, () => "---").join("|")}|`;
        out.push(`| ${rows[0]} |`, separator, ...rows.slice(1).map((r) => `| ${r} |`));
        i = j;
        continue;
      }
    }
    out.push(line);
    i += 1;
  }
  return out.join("\n");
}

// 渲染层无模块系统（classic <script>），函数以顶层声明暴露给 workbench.js，
// 同时挂到 globalThis 供 vitest 侧引用（与 panelAction 同款模式）。
(globalThis as unknown as {
  hoshiPdfLayout: {
    normalizePdfItems: typeof normalizePdfItems;
    groupLines: typeof groupLines;
    renderLine: typeof renderLine;
    reconstructPdfPage: typeof reconstructPdfPage;
  };
}).hoshiPdfLayout = {
  normalizePdfItems,
  groupLines,
  renderLine,
  reconstructPdfPage
};
