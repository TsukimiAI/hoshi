import { classifyDeskTurn, extractDeskTopic, extractPortraitNames, type DeskTurnKind } from "../retrieval/plan";
import { wikiExtractTarget, publicHttpUrl } from "./fetchPage";
import { looksLikeReadableProse } from "./notes";

const QUERY_FILLER =
  /^(设定|人设|剧情|维基|百科|对比|主要|角色|重要|主要角色|重要剧情|萌点|异同|最强|保值|强度|推荐)$/;

function squash(text: string): string {
  return text.replace(/[^\u4e00-\u9fffA-Za-z0-9]/g, "").toLowerCase();
}

/** 本轮问句里已经点明的作品或角色。指代题（这位、她呢）返回空，抓取仍跟上文走。 */
export function questionFocusTokens(message: string): string[] {
  if (classifyDeskTurn(message).kind === "followup") {
    return [];
  }
  const tokens = [extractDeskTopic(message), ...extractPortraitNames(message)];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tokens) {
    const token = squash(raw);
    if (token.length < 2 || QUERY_FILLER.test(token) || seen.has(token)) {
      continue;
    }
    seen.add(token);
    out.push(token);
  }
  return out;
}

export function excerptMatchesQuestion(text: string, message: string): boolean {
  const tokens = questionFocusTokens(message);
  if (tokens.length === 0) {
    return true;
  }
  const hay = squash(text).slice(0, 4000);
  return tokens.some((token) => hay.includes(token));
}

const NAV_EXTRA = /站内搜索|搜索代码|帮助文档|Wiki\s*条目|如何搜索|百科全书/;
const FOLLOW_UP = /再查|再搜|其他地方|换个地方|继续查/;

/** 续问本身没有作品名时，把上一问原句带上，避免只搜到站点帮助页。 */
export function deskFollowupQuery(message: string, prior: string): string {
  const current = message.replace(/\s+/g, " ").trim();
  const earlier = prior.replace(/\s+/g, " ").trim();
  if (!earlier || earlier === current || !FOLLOW_UP.test(current)) {
    return "";
  }
  const head = earlier.match(/[A-Za-z][A-Za-z0-9]{2,}|[\u4e00-\u9fff]{2,}/)?.[0] ?? "";
  if (head && current.toLowerCase().includes(head.toLowerCase())) {
    return "";
  }
  return earlier.slice(0, 80);
}

export function fallbackDeskSearchQuery(message: string, prior: string): string {
  const current = message.replace(/\s+/g, " ").trim().slice(0, 120);
  const earlier = deskFollowupQuery(message, prior);
  if (!earlier) {
    return current;
  }
  return `${earlier} ${current}`.replace(/\s+/g, " ").trim().slice(0, 120);
}

export function keepDeskExtra(extra: string): boolean {
  const text = extra.replace(/\s+/g, " ").trim();
  return text.length >= 2 && !NAV_EXTRA.test(text);
}

export function deskQueryList(message: string, extras: string[] = []): string[] {
  const primary = message.replace(/\s+/g, " ").trim().slice(0, 80);
  if (!primary) {
    return [];
  }
  const queries = [primary];
  for (const extra of extras) {
    const text = extra.replace(/\s+/g, " ").trim().slice(0, 80);
    if (!text || queries.includes(text) || queries.length >= 4) {
      continue;
    }
    queries.push(text);
  }
  return queries;
}

export type ListedSearchHit = { index: number; title: string; url: string; text: string };

const PAGE_CHROME = /Help:搜索|搜索代码|CirrusSearch|Skip to content|跳转到正文/;

/** 按搜索引擎给出的顺序读出标题和摘录。帮助页丢掉，其余留给模型挑选。 */
export function listSearchHits(raw: string): ListedSearchHit[] {
  const hits: ListedSearchHit[] = [];
  const blocks = raw.matchAll(/\n(\d+)\.\s+([^\n]+)\n\s+(https?:\/\/\S+)([\s\S]*?)(?=\n\d+\.\s|$)/g);
  for (const match of blocks) {
    const title = match[2]?.trim() ?? "";
    const url = match[3]?.trim() ?? "";
    const rest = (match[4] ?? "").replace(/\s+/g, " ").trim();
    const text = `${title} ${rest}`.trim();
    if (!url || PAGE_CHROME.test(`${title}\n${text}`)) {
      continue;
    }
    hits.push({ index: hits.length + 1, title, url, text });
    if (hits.length >= 8) {
      break;
    }
  }
  return hits;
}

export function hitsByIndex(hits: ListedSearchHit[], indexes: number[]): ListedSearchHit[] {
  const picked: ListedSearchHit[] = [];
  for (const index of indexes) {
    const hit = hits.find((item) => item.index === index);
    if (!hit || picked.some((item) => item.url === hit.url)) {
      continue;
    }
    picked.push(hit);
    if (picked.length >= 3) {
      break;
    }
  }
  return picked;
}

export function wikiUrlsFromSearchRaw(raw: string, message = ""): string[] {
  const tokens = questionFocusTokens(message);
  const found = [...raw.matchAll(/https?:\/\/[^\s]+/gi)];
  const urls: string[] = [];
  for (const match of found) {
    const clean = match[0].replace(/[),.;"'，。]+$/g, "");
    const target = wikiExtractTarget(clean);
    if (!target || urls.includes(clean)) {
      continue;
    }
    if (tokens.length > 0) {
      const around = raw.slice(Math.max(0, match.index - 180), match.index + clean.length);
      const hay = squash(`${target.title}\n${around}`);
      if (!tokens.some((token) => hay.includes(token))) {
        continue;
      }
    }
    urls.push(clean);
    if (urls.length >= 2) {
      break;
    }
  }
  return urls;
}

export function pageUrlsFromSearchRaw(raw: string, message = "", kind: DeskTurnKind = "note"): string[] {
  if (kind === "live") {
    return weatherUrlsFromSearchRaw(raw);
  }
  const tokens = questionFocusTokens(message);
  const found = [...raw.matchAll(/https?:\/\/[^\s]+/gi)];
  const wiki: string[] = [];
  const other: string[] = [];
  const seen = new Set<string>();
  for (const match of found) {
    const clean = match[0].replace(/[),.;"'，。]+$/g, "");
    if (!publicHttpUrl(clean) || seen.has(clean) || /baike\.baidu\.com|baidu\.com\/baike/i.test(clean)) {
      continue;
    }
    const around = raw.slice(
      Math.max(0, (match.index ?? 0) - 180),
      (match.index ?? 0) + clean.length + 160
    );
    const target = wikiExtractTarget(clean);
    if (tokens.length > 0) {
      const hay = squash(`${target?.title ?? ""}\n${clean}\n${around}`);
      if (!tokens.some((token) => hay.includes(token))) {
        continue;
      }
    }
    seen.add(clean);
    if (target) {
      wiki.push(clean);
    } else {
      other.push(clean);
    }
  }
  const preferWiki = kind === "person" || kind === "compare";
  return (preferWiki ? [...wiki, ...other] : [...other, ...wiki]).slice(0, 6);
}

export function weatherUrlsFromSearchRaw(raw: string): string[] {
  const found = [...raw.matchAll(/https?:\/\/[^\s]+/gi)];
  const urls: string[] = [];
  for (const match of found) {
    const clean = match[0].replace(/[),.;"'，。]+$/g, "");
    const url = publicHttpUrl(clean);
    if (!url || urls.includes(url) || /baike\.baidu\.com|baidu\.com\/baike/i.test(url)) {
      continue;
    }
    const around = raw.slice(Math.max(0, match.index - 60), match.index);
    if (
      /wikipedia\.org|moegirl\./i.test(url) ||
      !/天气|预报|气温|温度|weather|forecast/i.test(`${url}\n${around}`)
    ) {
      continue;
    }
    urls.push(url);
    if (urls.length >= 2) {
      break;
    }
  }
  return urls;
}

export function stripFetchPrefix(raw: string): string {
  return raw
    .replace(/^抓取结果：[^\n]*\n/, "")
    .replace(/^（维基开放接口）\n/, "")
    .trim();
}

export function mergeDeskBrief(parts: string[]): string {
  return parts
    .map((part) => part.trim())
    .filter((part) => part && looksLikeReadableProse(part))
    .join("\n")
    .slice(0, 8000);
}
