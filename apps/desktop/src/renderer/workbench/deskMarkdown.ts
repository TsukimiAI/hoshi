export type DeskMarkdownBlock =
  | { type: "h"; level: 1 | 2 | 3; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "p"; text: string }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "code"; text: string };

function splitTableRow(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) {
    return null;
  }
  let body = trimmed;
  if (body.startsWith("|")) {
    body = body.slice(1);
  }
  if (body.endsWith("|")) {
    body = body.slice(0, -1);
  }
  const cells = body.split("|").map((cell) => cell.trim());
  if (cells.length < 2) {
    return null;
  }
  return cells;
}

function isSeparator(cells: string[]): boolean {
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, "")));
}

/** 把卡片正文里的 Markdown 拆成标题、列表、表格和段落。表格必须带分隔行。 */
export function parseDeskMarkdown(source: string): DeskMarkdownBlock[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: DeskMarkdownBlock[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    if (!trimmed) {
      index += 1;
      continue;
    }
    if (trimmed.startsWith("```")) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? "").trim().startsWith("```")) {
        code.push(lines[index] ?? "");
        index += 1;
      }
      index += 1;
      blocks.push({ type: "code", text: code.join("\n") });
      continue;
    }
    const row = splitTableRow(trimmed);
    const next = splitTableRow((lines[index + 1] ?? "").trim());
    if (row && next && isSeparator(next)) {
      const headers = row;
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length) {
        const cellLine = (lines[index] ?? "").trim();
        if (!cellLine) {
          break;
        }
        const cells = splitTableRow(cellLine);
        if (!cells || isSeparator(cells)) {
          break;
        }
        rows.push(headers.map((_, cell) => cells[cell] ?? ""));
        index += 1;
      }
      blocks.push({ type: "table", headers, rows });
      continue;
    }
    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length as 1 | 2 | 3;
      blocks.push({ type: "h", level, text: heading[2] });
      index += 1;
      continue;
    }
    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      const items = [bullet[1]];
      index += 1;
      while (index < lines.length) {
        const more = (lines[index] ?? "").trim().match(/^[-*]\s+(.+)$/);
        if (!more) {
          break;
        }
        items.push(more[1]);
        index += 1;
      }
      blocks.push({ type: "ul", items });
      continue;
    }
    const numbered = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (numbered) {
      const items = [numbered[1]];
      index += 1;
      while (index < lines.length) {
        const more = (lines[index] ?? "").trim().match(/^\d+[.)]\s+(.+)$/);
        if (!more) {
          break;
        }
        items.push(more[1]);
        index += 1;
      }
      blocks.push({ type: "ol", items });
      continue;
    }
    blocks.push({ type: "p", text: trimmed });
    index += 1;
  }
  return blocks;
}
