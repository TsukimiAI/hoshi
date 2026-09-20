export const SEARCH_USAGE_PROMPT =
  "你能联网。检索由系统自动完成，禁止说自己上不了网、没有浏览器、知识截止不能查。老师明确要求联网/搜索/查官网时必须检索后回答。自己知识里没有、会过时或拿不准的事实（版本、日期、活动、新闻、官方公告）也要检索，不要用旧印象硬答。禁止输出 tool_call、function call、XML 或 JSON 工具调用。对老师用自然语言回答。每一句末尾只许附加 ⟦emotion⟧，禁止 ～happy 或 ~happy。emotion 必须贴合该句，禁止整段全标 normal。normal 仅纯客观陈述；傲娇嘴硬 shy-and-indignation；无奈 wry；惊讶 shock；质疑 doubt；没听懂 confused；嫌弃 disdain；抗拒 resist；委屈 resentment；吃醋 yandere；亲近 like/very-like；高兴 happy/very-happy；期待或思考 expect。相邻句尽量换表情。";

export function parseSiteLines(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function buildSearchSitesPrompt(sites: string[]): string | null {
  if (sites.length === 0) {
    return null;
  }
  return `老师配置了这些参考站点：
${sites.join("\n")}

需要联网查资料时：先判断当前问题是否可能在这些站点上找到靠谱答案。
- 用得上：优先检索并引用这些站点。
- 用不上或上面找不到：再按问题正常全网检索，不要生搬这些网址。
不要为了用站点而用站点。纯闲聊、人设互动不必检索；老师要查或知识不够时必须检索。`;
}
