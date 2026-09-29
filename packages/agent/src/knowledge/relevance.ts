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
  "一下"
]);

export function queryTopicGrams(query: string): string[] {
  const ascii = (query.match(/[a-zA-Z0-9]{2,}/g) ?? []).map((item) => item.toLowerCase());
  const compact = query.replace(/\s+/g, "");
  const grams: string[] = [...ascii];
  for (let i = 0; i < compact.length - 1; i += 1) {
    const gram = compact.slice(i, i + 2);
    if (/^[\u4e00-\u9fff]{2}$/.test(gram) && !STOP_BIGRAMS.has(gram)) {
      grams.push(gram);
    }
  }
  return [...new Set(grams)];
}

function compactAlnum(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, "");
}

export function isKnowledgeHitOnTopic(query: string, text: string): boolean {
  const grams = queryTopicGrams(query);
  const hay = text.toLowerCase();
  const hayCompact = compactAlnum(text);
  const ascii = (query.match(/[a-zA-Z0-9]{2,}/g) ?? []).map((item) => item.toLowerCase());
  if (
    /知识库|笔记|讲义|文档/.test(query) &&
    ascii.some((token) => hayCompact.includes(token) || hay.includes(token))
  ) {
    return true;
  }
  if (grams.length < 2) {
    return true;
  }
  const matched = grams.filter((gram) => {
    const g = gram.toLowerCase();
    return hay.includes(g) || hayCompact.includes(g);
  }).length;
  const need = grams.length >= 4 ? 2 : 1;
  return matched >= need;
}
