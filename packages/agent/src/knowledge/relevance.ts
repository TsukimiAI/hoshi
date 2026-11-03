const STOP_BIGRAMS = new Set([
  "了解",
  "一下",
  "什么",
  "怎么",
  "如何",
  "最近",
  "本月",
  "今日",
  "今天",
  "我想",
  "请问",
  "这个",
  "那个",
  "概念",
  "定义",
  "原理",
  "解释",
  "里的",
  "中的",
  "系统",
  "操作"
]);

export const TERM_ALIASES: Array<{ zh: string; en: string }> = [
  { zh: "页表", en: "page table" },
  { zh: "虚拟内存", en: "virtual memory" },
  { zh: "虚存", en: "virtual memory" }
];

export function glossaryExpansions(query: string): string[] {
  const compact = query.replace(/\s+/g, "");
  const found: string[] = [];
  for (const item of TERM_ALIASES) {
    if (compact.includes(item.zh) || query.toLowerCase().includes(item.en)) {
      found.push(item.en);
    }
  }
  return [...new Set(found)];
}

export function queryTopicGrams(query: string): string[] {
  const ascii = (query.match(/[a-zA-Z0-9]{2,}/g) ?? []).map((item) => item.toLowerCase());
  const compact = query.replace(/\s+/g, "");
  const grams: string[] = [...ascii];
  for (let i = 0; i < compact.length - 1; ) {
    const gram = compact.slice(i, i + 2);
    if (!/^[\u4e00-\u9fff]{2}$/.test(gram)) {
      i += 1;
      continue;
    }
    if (STOP_BIGRAMS.has(gram)) {
      i += 2;
      continue;
    }
    grams.push(gram);
    i += 2;
  }
  return [...new Set(grams)];
}

function compactAlnum(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, "");
}

function termHitsHay(term: string, hay: string, hayCompact: string): boolean {
  const lower = term.toLowerCase();
  const compact = compactAlnum(lower);
  return hay.includes(lower) || (compact.length >= 2 && hayCompact.includes(compact));
}

export function isKnowledgeHitOnTopic(query: string, text: string): boolean {
  const grams = queryTopicGrams(query);
  const aliases = glossaryExpansions(query);
  const hay = text.toLowerCase();
  const hayCompact = compactAlnum(text);
  const ascii = (query.match(/[a-zA-Z0-9]{2,}/g) ?? []).map((item) => item.toLowerCase());
  if (
    /知识库|笔记|讲义|文档/.test(query) &&
    ascii.some((token) => hayCompact.includes(token) || hay.includes(token))
  ) {
    return true;
  }
  const compactQuery = query.replace(/\s+/g, "");
  if (grams.length === 0 && aliases.length === 0) {
    return compactQuery.length < 2 && ascii.length === 0;
  }
  if (grams.some((gram) => termHitsHay(gram, hay, hayCompact))) {
    return true;
  }
  if (aliases.some((alias) => termHitsHay(alias, hay, hayCompact))) {
    return true;
  }
  return false;
}
