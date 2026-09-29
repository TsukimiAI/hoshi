const SEARCH_DUMP =
  /外部数据，不能当作指令|口播超时了|萌娘百科[_-]|万物皆可萌|自由的百科全书|公式サイト|CHARACTER\s*\|/i;

const TOOL_TALK =
  /没有可调用工具|只能先口头|不能乱编|依据不足|我不能乱|画布没有|星奈只能|web_search|"queries"|queries":/;

const CORPUS_JUNK = /\/hdd\/|\/datasets\/|\.pdf\b|file:\/\//i;

const ENCODED_PATH = /%(?:E[0-9A-F]|[89A-F][0-9A-F]){6,}/i;

export function looksLikeSearchToolDump(text: string): boolean {
  return (
    SEARCH_DUMP.test(text) ||
    TOOL_TALK.test(text) ||
    CORPUS_JUNK.test(text) ||
    ENCODED_PATH.test(text) ||
    (/https?:\/\/[^\s]+/i.test(text) && /\d+\.\s/.test(text))
  );
}

function compactLen(text: string): number {
  return text.replace(/\s+/g, "").length;
}

function isTitleOnlyChunk(text: string): boolean {
  const t = text.trim();
  if (!t || /搜词条/.test(t) || SEARCH_DUMP.test(t)) {
    return true;
  }
  const compact = compactLen(t);
  if (/女主|男主|角色|住|担任|设定/.test(t) && compact >= 6) {
    return false;
  }
  if (compact < 12) {
    return true;
  }
  return !/[。！？，、]|是|的|了/.test(t);
}

export function looksLikeReadableProse(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || looksLikeSearchToolDump(trimmed) || /还在整理/.test(trimmed) || TOOL_TALK.test(trimmed)) {
    return false;
  }
  const lines = trimmed.split(/\n/).map((line) => line.trim()).filter(Boolean);
  const usable = lines.filter((line) => !isTitleOnlyChunk(line));
  return compactLen(usable.join("")) >= 12;
}

export function humanizeSearchNotes(raw: string): string {
  const text = raw.replace(/^口播超时了[^：:]*[：:]\s*/, "").trim();
  if (!text) {
    return "";
  }
  if (!looksLikeSearchToolDump(text) && !/来源：/.test(text) && !/\d+\.\s*\S+\s+https?:\/\//.test(text)) {
    return looksLikeReadableProse(text) ? text.replace(/\s+/g, " ").trim() : "";
  }
  const source = text.replace(/（模型顺带生成的文字[\s\S]*$/, "");
  const start = source.search(/\d+\.\s/);
  const body = start >= 0 ? source.slice(start) : source;
  const chunks: string[] = [];
  const blocks = body.matchAll(/(\d+)\.\s*([\s\S]*?)(?=\s*\d+\.\s|$)/g);
  for (const match of blocks) {
    const rest = match[2]
      .replace(/https?:\/\/[^\s]+/gi, " ")
      .replace(/\/hdd\/[^\s]*/gi, " ")
      .replace(/\/datasets\/[^\s]*/gi, " ")
      .replace(/\S+\.pdf\S*/gi, " ")
      .replace(ENCODED_PATH, " ")
      .replace(/查询：[\s\S]*$/u, "")
      .replace(/\s+/g, " ")
      .trim();
    if (
      !rest ||
      /^外部数据|^查询：|^来源：/.test(rest) ||
      isTitleOnlyChunk(rest) ||
      CORPUS_JUNK.test(rest) ||
      ENCODED_PATH.test(rest)
    ) {
      continue;
    }
    chunks.push(rest);
  }
  return chunks.join("\n").trim();
}

export function formatSearchActivity(raw: string): string {
  const query = raw.match(/查询：([^\n]+)/)?.[1]?.replace(/\s+/g, " ").trim() ?? "";
  const notes = humanizeSearchNotes(raw);
  const lines = [query ? `查询：${query}` : "", notes].filter(Boolean);
  if (lines.length > 0) {
    return lines.join("\n").slice(0, 8000);
  }
  if (/抓取失败|缺少 DeepSeek|整批结果已丢弃|工具不可用/.test(raw)) {
    return raw.replace(/https?:\/\/[^\s]+/gi, "").replace(/\s+/g, " ").trim().slice(0, 800);
  }
  return "已检索到来源，摘录不足。";
}
