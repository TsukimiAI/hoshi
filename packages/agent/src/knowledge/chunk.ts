export interface ChunkSeg {
  text: string;
  headingPath: string[];
}

export const CHUNK_MAX_CHARS = 720;

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

  for (const section of sections) {
    for (const paragraph of splitParagraphs(section.body)) {
      if (isAtomicBlock(paragraph)) {
        chunks.push({ text: paragraph, headingPath: section.heading });
      } else if (paragraph.length > CHUNK_MAX_CHARS) {
        for (const sentence of splitSentences(paragraph)) {
          chunks.push({ text: sentence, headingPath: section.heading });
        }
      } else {
        chunks.push({ text: paragraph, headingPath: section.heading });
      }
    }
  }
  return chunks;
}
