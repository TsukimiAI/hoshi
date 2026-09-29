export interface ChunkSeg {
  text: string;
  headingPath: string[];
}

export const CHUNK_TARGET_CHARS = 700;
export const CHUNK_MAX_CHARS = 1200;

const HEADING_RE = /^(#{1,3})\s+(.*)$/;

interface Section {
  heading: string[];
  body: string;
}

function splitSections(text: string): Section[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const sections: Section[] = [];
  let heading: string[] = [];
  let body: string[] = [];
  const flush = (): void => {
    const joined = body.join("\n").trim();
    if (joined) {
      sections.push({ heading: [...heading], body: joined });
    }
    body = [];
  };
  for (const line of lines) {
    const match = HEADING_RE.exec(line);
    if (match) {
      flush();
      const level = match[1].length;
      heading = heading.slice(0, level - 1);
      heading.push(match[2].trim());
    } else {
      body.push(line);
    }
  }
  flush();
  return sections;
}

function splitParagraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function splitSentences(text: string): string[] {
  const raw = text.split(/(?<=[。！？!?；;])/);
  const out: string[] = [];
  for (const part of raw) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }
    if (trimmed.length > CHUNK_MAX_CHARS) {
      for (let i = 0; i < trimmed.length; i += CHUNK_MAX_CHARS) {
        out.push(trimmed.slice(i, i + CHUNK_MAX_CHARS));
      }
    } else {
      out.push(trimmed);
    }
  }
  return out;
}

// 代码围栏 / markdown 表格：作为原子块，不硬切
function isAtomicBlock(text: string): boolean {
  if (/```/.test(text)) {
    return true;
  }
  const lines = text.split("\n");
  if (lines.length >= 2 && lines[0].includes("|") && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[1])) {
    return true;
  }
  return false;
}

export function chunkDocument(text: string): ChunkSeg[] {
  const sections = splitSections(text);
  const chunks: ChunkSeg[] = [];

  const packUnits = (units: Array<{ text: string; atomic: boolean }>, heading: string[]): void => {
    let buf: string[] = [];
    let bufLen = 0;
    const flush = (): void => {
      const content = buf.join("\n\n").trim();
      if (content) {
        chunks.push({ text: content, headingPath: heading });
      }
      buf = [];
      bufLen = 0;
    };
    for (const unit of units) {
      if (unit.atomic) {
        flush();
        chunks.push({ text: unit.text, headingPath: heading });
        continue;
      }
      if (bufLen > 0 && bufLen + unit.text.length > CHUNK_TARGET_CHARS) {
        flush();
      }
      buf.push(unit.text);
      bufLen += unit.text.length;
    }
    flush();
  };

  for (const section of sections) {
    const units: Array<{ text: string; atomic: boolean }> = [];
    for (const paragraph of splitParagraphs(section.body)) {
      if (isAtomicBlock(paragraph)) {
        units.push({ text: paragraph, atomic: true });
      } else if (paragraph.length > CHUNK_MAX_CHARS) {
        for (const sentence of splitSentences(paragraph)) {
          units.push({ text: sentence, atomic: false });
        }
      } else {
        units.push({ text: paragraph, atomic: false });
      }
    }
    packUnits(units, section.heading);
  }
  return chunks;
}
