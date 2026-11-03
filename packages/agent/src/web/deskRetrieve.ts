import {
  classifyDeskTurn,
  extractDeskTopic,
  extractPortraitNames,
  extractWorkForName,
  type DeskTurnKind
} from "../retrieval/plan";
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

/** 没有自己的对象、只是接着上一问往下说。完整新问句不算。 */
function liveFactQueries(message: string): string[] {
  const stripped = message
    .replace(/^(?:请)?(?:可以)?(?:帮我)?(?:我想了解|我想问|了解一下|介绍一下)?(?:一下)?/, "")
    .replace(/一个月以来|一个月内|近一个月|近30天|三十天/g, " ")
    .replace(/[？?！!。]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const primary = (stripped || message).slice(0, 40);
  const queries: string[] = [];
  const add = (raw: string) => {
    const text = raw.replace(/\s+/g, " ").trim();
    if (text.length >= 2 && !queries.includes(text) && queries.length < 4) {
      queries.push(text);
    }
  };
  add(primary);
  if (/天气|气温|温度|预报|降雨|降水|湿度|风力/.test(message)) {
    const city = primary
      .match(/([\u4e00-\u9fff]{2,8}?)(?:的)?(?:天气|气温|温度|预报|降雨|降水|湿度)/)?.[1]
      ?.replace(/本周|本月|今天|今日|最近|一周|实时|现在|以来|过去/g, "")
      .trim();
    if (city && city.length >= 2) {
      add(`${city} 每日最高最低气温`);
      add(`${city} 天气预报`);
      if (/一个月|本月|近30|三十天|以来/.test(message)) {
        add(`${city} 近一个月 每日最高最低气温`);
      }
    }
  }
  return queries;
}

export function buildDeskSearchQueries(message: string, prior = ""): string[] {
  const turn = classifyDeskTurn(message);
  if (turn.kind === "live") {
    return liveFactQueries(message);
  }
  if (turn.kind === "chitchat") {
    return [];
  }
  const names = [...turn.names];
  const ownTopic = extractDeskTopic(message);
  const usePrior = turn.kind === "followup";
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
  if (turn.kind === "person" || turn.kind === "compare" || (usePrior && names.length > 0)) {
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
  }
  if (queries.length === 0) {
    const topic = ownTopic || (usePrior ? extractDeskTopic(prior) : "");
    if (topic) {
      const angles = ["最强", "保值", "强度", "数值膨胀"].filter((word) => message.includes(word));
      if (angles.length > 0) {
        add(`${topic} ${angles.join(" ")} 角色`);
      }
      if (/人设|角色/.test(message)) {
        add(`${topic} 主要角色 人设`);
      }
      if (/剧情/.test(message)) {
        add(`${topic} 重要剧情`);
      }
      if (/维基|百科|萌娘|萌百/.test(message)) {
        add(`${topic} 维基`);
      }
      if (queries.length === 0) {
        add(topic);
      }
    } else if (!usePrior) {
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
  return (preferWiki ? [...wiki, ...other] : [...other, ...wiki]).slice(0, 2);
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
