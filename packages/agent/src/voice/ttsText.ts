const EMOTION_MARK_RE = /⟦[\w-]+⟧|[～~][\w-]+/g;
const URL_RE = /https?:\/\/\S+/gi;
const MD_LINK_RE = /\[([^\]]+)\]\([^)]+\)/g;
const WEB_BLOCK_RE = /\[webpage[^\]]*\][\s\S]*?\[\/?webpage[^\]]*\]/gi;
const CITE_RE = /【(?:网页|来源|搜索|\d+)[^】]*】|\[[0-9]+\]/g;

export function sanitizeTtsText(raw: string): string {
  let text = raw.replace(WEB_BLOCK_RE, " ");
  text = text.replace(EMOTION_MARK_RE, " ");
  text = text.replace(MD_LINK_RE, "$1");
  text = text.replace(URL_RE, " ");
  text = text.replace(CITE_RE, " ");
  text = text.replace(/[`*_#]+/g, " ");
  return text.replace(/\s+/g, " ").trim();
}
