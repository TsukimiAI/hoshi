const TOOL_CALL_BLOCK_RE = /<tool_call\b[\s\S]*?<\/tool_call\s*>/gi;
const TOOL_CALL_OPEN_RE = /<tool_call\b/i;
const EMOTION_MARK = String.raw`(?:⟦\s*[\w-]+\s*⟧|[～~]\s*(?:[A-Za-z][\w-]*|[\u4e00-\u9fff]{1,8}))`;
// 点号后面还连着字母或数字时是标识符、文件名或版本号，不是句号。单个换行不当句号。
const SENTENCE_END = String.raw`(?:[。！？!?]|…|\.{3,}|\.(?![A-Za-z0-9_])|\n{2,})`;
const CONTENT_CHAR = String.raw`[^\s。！？!?….~～⟦⟧]`;
const SENTENCE_RE = new RegExp(
  String.raw`^(\s*(?:${EMOTION_MARK}\s*)*${CONTENT_CHAR}[\s\S]*?(?:${SENTENCE_END}\s*${EMOTION_MARK}?|${EMOTION_MARK}))`
);

export function stripToolCallBlocks(text: string): string {
  return text.replace(TOOL_CALL_BLOCK_RE, "");
}

export function hasSpeechContent(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text.replace(/⟦[^⟧]*⟧|[～~]\s*[\w-]+/g, ""));
}

function joinSoftBreaks(text: string): string {
  return text.replace(/[ \t]*\n[ \t]*/g, (gap, offset, all) => {
    const prev = all[offset - 1] ?? "";
    const next = all[offset + gap.length] ?? "";
    if (/[\u4e00-\u9fff\d~～\-－—]/.test(prev) && /[°℃\d\u4e00-\u9fff]/.test(next)) {
      return "";
    }
    if (/[\u4e00-\u9fff]/.test(prev) && /[\u4e00-\u9fff]/.test(next)) {
      return "";
    }
    return " ";
  });
}

function openToolCallIndex(text: string): number {
  const match = text.match(TOOL_CALL_OPEN_RE);
  return match && match.index !== undefined ? match.index : -1;
}

export class SentenceSplitter {
  private buffer = "";

  push(chunk: string): string[] {
    this.buffer += chunk;
    this.buffer = stripToolCallBlocks(this.buffer);
    const openAt = openToolCallIndex(this.buffer);
    const ready = openAt >= 0 ? this.buffer.slice(0, openAt) : this.buffer;
    const held = openAt >= 0 ? this.buffer.slice(openAt) : "";
    this.buffer = ready;
    const out: string[] = [];

    while (true) {
      this.buffer = this.buffer.replace(/^[\s。！？!?…]+/, "");
      if (!this.buffer) {
        break;
      }
      const match = this.buffer.match(SENTENCE_RE);
      if (!match) {
        break;
      }
      const rest = this.buffer.slice(match[1].length);
      if (!rest && !new RegExp(String.raw`(?:${EMOTION_MARK})\s*$`).test(match[1])) {
        break;
      }
      const sentence = joinSoftBreaks(match[1]).trim();
      this.buffer = rest;
      if (sentence && hasSpeechContent(sentence)) {
        out.push(sentence);
      }
    }

    this.buffer = this.buffer + held;
    return out;
  }

  flush(): string[] {
    this.buffer = stripToolCallBlocks(this.buffer);
    if (openToolCallIndex(this.buffer) >= 0) {
      this.buffer = this.buffer.slice(0, openToolCallIndex(this.buffer)).trim();
    }
    const rest = joinSoftBreaks(this.buffer.replace(/^[\s。！？!?…]+/, "")).trim();
    this.buffer = "";
    return rest && hasSpeechContent(rest) ? [rest] : [];
  }
}
