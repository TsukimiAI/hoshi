import { extractDeskTopic, extractPortraitNames, extractWorkForName, looksLikeAnaphoricDeskQuery } from "../retrieval/plan";
import { wikiExtractTarget } from "./fetchPage";
import { looksLikeReadableProse } from "./notes";

const QUERY_FILLER =
  /^(设定|人设|剧情|维基|百科|对比|主要|角色|重要|主要角色|重要剧情|萌点|异同|最强|保值|强度|推荐)$/;

function squash(text: string): string {
  return text.replace(/[^\u4e00-\u9fffA-Za-z0-9]/g, "").toLowerCase();
}

/** 本轮问句里已经点明的作品或角色。指代题（这位、她呢）返回空，抓取仍跟上文走。 */
export function questionFocusTokens(message: string): string[] {
  if (looksLikeAnaphoricDeskQuery(message)) {
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

/** 没有自己的对象、只是接着上一问往下说。完整新问句不算。 */
function isBareFollowUp(message: string): boolean {
  const text = message.replace(/[\s？?！!。，,、]/g, "");
  if (!text || text.length > 12) {
    return false;
  }
  return !/哪些|什么|怎么|为什么|如何|现在|目前|最近|天气|股价|新闻/.test(text);
}

export function buildDeskSearchQueries(message: string, prior = ""): string[] {
  const names = [...extractPortraitNames(message)];
  const ownTopic = extractDeskTopic(message);
  const anaphoric = looksLikeAnaphoricDeskQuery(message);
  // 指代和很短的追问才借上文人名。本轮已经是完整新问句时，不把上一页角色搜出来。
  const usePrior = anaphoric || (isBareFollowUp(message) && !ownTopic && names.length === 0);
  if (usePrior) {
    for (const name of extractPortraitNames(`${message}\n${prior}`)) {
      if (!names.includes(name)) {
        names.push(name);
      }
    }
  }
  const queries: string[] = [];
  const add = (raw: string) => {
    const text = raw.replace(/\s+/g, " ").trim();
    if (text.length < 2 || queries.includes(text) || queries.length >= 4) {
      return;
    }
    if (/^(可以)?上网|查一查|搜一下|有关这位/.test(text) && extractPortraitNames(text).length === 0) {
      return;
    }
    queries.push(text);
  };
  const seed = usePrior ? `${message}\n${prior}` : message;
  for (const name of names) {
    const work = extractWorkForName(seed, name) || extractWorkForName(message, name);
    add(work ? `${work} ${name} 设定` : `${name} 设定`);
    if (/鸣潮/.test(seed) && !/鸣潮/.test(name)) {
      add(`鸣潮 ${name}`);
    }
  }
  if (names.length >= 2) {
    add(`${names.join(" ")} 对比`);
  }
  if (queries.length === 0) {
    const topic = ownTopic || (usePrior ? extractDeskTopic(prior) : "");
    if (topic) {
      const angles = ["最强", "保值", "强度", "数值膨胀"].filter((word) => message.includes(word));
      if (angles.length > 0) {
        add(`${topic} ${angles.join(" ")} 角色`);
      }
      add(`${topic} 主要角色 人设`);
      add(`${topic} 重要剧情`);
      add(`${topic} 维基`);
    } else if (!anaphoric) {
      const stripped = message
        .replace(/^(请)?(可以)?(帮我)?(上网)?[，, ]*(搜一下|查一下|查一查|搜索)/, "")
        .replace(/\s+/g, " ")
        .trim();
      add((stripped || message).slice(0, 40));
    }
  }
  return queries;
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
