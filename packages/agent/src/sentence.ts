const TOOL_CALL_BLOCK_RE = /<tool_call\b[\s\S]*?<\/tool_call\s*>/gi;
const TOOL_CALL_OPEN_RE = /<tool_call\b/i;
const EMOTION_MARK = String.raw`(?:⟦\s*[\w-]+\s*⟧|[～~]\s*[\w-]+)`;
// 点号后面还连着字母或数字时是标识符、文件名或版本号，不是句号。
const SENTENCE_END = String.raw`(?:[。！？!?\n]|…|\.{3,}|\.(?![A-Za-z0-9_]))`;
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
      if (!rest && !/(?:⟦\s*[\w-]+\s*⟧|[～~]\s*[\w-]+)\s*$/.test(match[1])) {
        break;
      }
      const sentence = match[1].trim();
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
    const rest = this.buffer.replace(/^[\s。！？!?…]+/, "").trim();
    this.buffer = "";
    return rest && hasSpeechContent(rest) ? [rest] : [];
  }
}
