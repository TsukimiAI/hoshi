import mammoth from "mammoth";

const ENTITY_MAP: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'"
};

function decodeEntities(text: string): string {
  return text.replace(/&(?:nbsp|amp|lt|gt|quot|apos|#39);/g, (match) => ENTITY_MAP[match] ?? match);
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

function renderTableCell(html: string): string {
  return decodeEntities(stripTags(html).replace(/\s+/g, " ")).trim();
}

function renderTable(tableHtml: string): string {
  const rows: string[] = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let row: RegExpExecArray | null;
  while ((row = rowRe.exec(tableHtml)) !== null) {
    const cells: string[] = [];
    const cellRe = /<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi;
    let cell: RegExpExecArray | null;
    while ((cell = cellRe.exec(row[1])) !== null) {
      cells.push(renderTableCell(cell[1]));
    }
    if (cells.length > 0) {
      rows.push(`| ${cells.join(" | ")} |`);
    }
  }
  return rows.join("\n");
}

/**
 * Converts a .docx buffer to markdown-flavoured plain text suitable for the
 * knowledge base chunker: headings keep their `#` markers, list items become
 * `- ` bullets, and tables become `| a | b |` rows (treated as atomic blocks).
 */
export async function parseDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.convertToHtml({ buffer }, { ignoreEmptyParagraphs: true });
  let html = result.value;

  // 1. Tables -> markdown rows (before paragraphs so cell-internal <p> don't leak).
  html = html.replace(/<table[\s\S]*?<\/table>/gi, (table) => `\n\n${renderTable(table)}\n\n`);

  // 2. Headings.
  html = html.replace(/<h([1-6])[^>]*>/gi, (_all, level: string) => `${"#".repeat(Number(level))} `);
  html = html.replace(/<\/h[1-6]>/gi, "\n\n");

  // 3. List items.
  html = html.replace(/<li[^>]*>/gi, "- ");
  html = html.replace(/<\/li>/gi, "\n");
  html = html.replace(/<\/(?:ul|ol)>/gi, "\n\n");

  // 4. Paragraphs and line breaks.
  html = html.replace(/<\/p>/gi, "\n\n");
  html = html.replace(/\s*<br\s*\/?>\s*/gi, "\n");

  // 5. Strip any remaining tags, decode entities, normalise whitespace.
  let text = html.replace(/<[^>]+>/g, "");
  text = decodeEntities(text);
  text = text.replace(/[ \t]+/g, " ");
  text = text.split("\n").map((line) => line.trim()).join("\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}
