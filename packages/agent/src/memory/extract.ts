import type { MemoryKind } from "@hoshi/shared";
import type { LlmMessage } from "../llm/openai";

export const MEMORY_FACT_MIN = 4;
export const MEMORY_FACT_MAX = 80;
export const MEMORY_EXTRACT_MAX = 3;
export const MEMORY_EXTRACT_NEIGHBORS = 8;

export type MemoryOpAction = "upsert" | "retract";

export interface MemoryOp {
  action: MemoryOpAction;
  kind: MemoryKind;
  topic: string;
  text: string;
  id?: string;
}

export const MEMORY_EXTRACT_PROMPT = `你从老师这句话中为「老师」维护长期记忆。只输出 JSON：{"ops":[{"action":"upsert","kind":"preference","topic":"drink","text":"...","id":"可选"}]}
规则：
- ops 0到3条。action 只能是 upsert 或 retract。
- kind 只能是 identity、preference、habit、agreement、other。
- topic 用稳定短词（name/drink/job/schedule 等）。
- 每条 text 一句中文，4到80字，写成「老师…」。
- 已有记忆带 id。改口、覆盖同一件事时必须带上那条 id。对不上就不要填 id，让系统新增。
- 「我是研究生」「不喝咖啡」「我叫韩」这类身份、否定偏好和名字必须 upsert。名字写成「老师希望被叫做韩」。
- 只处理自我介绍、偏好、习惯、明确约定、身份称呼。
- 寒暄、天气播报、新闻联播、代码题、报错、情绪、对星奈的夸奖、猜测：输出 {"ops":[]}。
- 职业含「新闻」可以记。已有记忆意思相同且未改口的不要再 upsert。
- 不要密码、验证码、密钥、证件号、银行卡、精确住址门牌、病历、气温预报。
- 没有值得记的就 {"ops":[]}`;

const REJECT = [
  "密码",
  "验证码",
  "api key",
  "api token",
  "access token",
  "secret",
  "身份证",
  "银行卡",
  "cvv",
  "病历",
  "住址"
];

const WEATHER_HINT = ["今天", "明天", "气温", "预报", "怎么样"];
const ADDRESS_HINT = ["区", "路", "号", "小区"];
const FORCE_EXTRACT = /我是|我叫|喜欢|习惯|记住|以后|不要|别忘/;
const SKIP_WEATHER = /天气|气温|预报/;
const SKIP_CODE = /代码|编译|函数|traceback|报错|写一段/i;
const SKIP_NEWS = /新闻联播|联播/;
const SKIP_GREET = /^(你好|您好|在吗|早上好|晚上好|晚安|嗨|哈喽|hi+|hello)[啊呀呢吧。！!？?\s]*$/i;
const SKIP_TONE = /^(嗯+|啊+|哦+|哈+|好的?|嗯好的|好)[啊呀呢吧。！!？?\s]*$/;
export const MEMORY_DUP_LENGTH_RATIO = 0.8;

function isSkipTopic(text: string): boolean {
  return SKIP_GREET.test(text) || SKIP_TONE.test(text) || SKIP_NEWS.test(text) || SKIP_WEATHER.test(text) || SKIP_CODE.test(text);
}

function hasSelfPronoun(text: string): boolean {
  return text.replace(/我们|帮我|给我|让我/g, "").includes("我");
}

export function isChitchatSkip(userText: string): boolean {
  return !shouldExtract(userText);
}

export function shouldExtract(userText: string): boolean {
  const text = userText.trim();
  if (!text) {
    return false;
  }
  if (FORCE_EXTRACT.test(text)) {
    return true;
  }
  if (isSkipTopic(text)) {
    return false;
  }
  return hasSelfPronoun(text);
}

export function normalizeTopic(raw: unknown): string {
  if (typeof raw !== "string") {
    return "";
  }
  const topic = raw.toLowerCase().replace(/\s+/g, "").slice(0, 16);
  if (!topic || !/^[a-z0-9\u4e00-\u9fff]+$/.test(topic)) {
    return "";
  }
  return topic;
}

export function canExtractMemory(autoWrite: boolean, userText: string): boolean {
  return autoWrite && shouldExtract(userText);
}

export function normalizeMemoryText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "");
}

const MEMORY_FACT_STOP = ["老师", "希望", "被", "叫做", "平时", "喜欢", "喝", "的", "了", "是", "在", "经常", "请", "记住"];

export function memoryFactKey(text: string): string {
  let key = normalizeMemoryText(text);
  for (const stop of MEMORY_FACT_STOP) {
    key = key.split(stop).join("");
  }
  return key;
}

export function sharesFactEntity(a: string, b: string, allowUnigram = false): boolean {
  const ka = memoryFactKey(a);
  const kb = memoryFactKey(b);
  if (!ka || !kb) {
    return false;
  }
  const [short, long] = ka.length <= kb.length ? [ka, kb] : [kb, ka];
  if (allowUnigram && short.length >= 1 && long.includes(short)) {
    return true;
  }
  if (short.length < 2) {
    return false;
  }
  for (let n = short.length; n >= 2; n -= 1) {
    for (let i = 0; i + n <= short.length; i += 1) {
      if (long.includes(short.slice(i, i + n))) {
        return true;
      }
    }
  }
  return false;
}

export function isDuplicateFact(candidate: string, existing: string[]): boolean {
  const a = normalizeMemoryText(candidate);
  if (!a) {
    return true;
  }
  return existing.some((item) => {
    const b = normalizeMemoryText(item);
    if (!b) {
      return false;
    }
    if (a === b) {
      return true;
    }
    if (!a.includes(b) && !b.includes(a)) {
      return false;
    }
    return Math.min(a.length, b.length) / Math.max(a.length, b.length) >= MEMORY_DUP_LENGTH_RATIO;
  });
}

function stripPrefix(text: string): string {
  return text.replace(/^\s*(?:\d+[\.、)]\s*|[-*]\s+)/, "").trim();
}

export function hitsReject(text: string): boolean {
  const lower = text.toLowerCase();
  if (REJECT.some((item) => lower.includes(item))) {
    return true;
  }
  if (["气温", "预报", "新闻联播", "联播"].some((item) => text.includes(item))) {
    return true;
  }
  if (text.includes("天气") && WEATHER_HINT.some((item) => text.includes(item))) {
    return true;
  }
  if (
    (text.includes("家在") || text.includes("住在")) &&
    ADDRESS_HINT.some((item) => text.includes(item))
  ) {
    return true;
  }
  return false;
}

export function sanitizeFactText(raw: string): string | null {
  const text = stripPrefix(raw).replace(/\s+/g, " ").trim();
  if (text.length < MEMORY_FACT_MIN || text.length > MEMORY_FACT_MAX) {
    return null;
  }
  if (hitsReject(text)) {
    return null;
  }
  return text;
}

function isKind(value: unknown): value is MemoryKind {
  return (
    value === "identity" ||
    value === "preference" ||
    value === "habit" ||
    value === "agreement" ||
    value === "other"
  );
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeOpId(raw: unknown): string | undefined {
  if (typeof raw !== "string") {
    return undefined;
  }
  const id = raw.trim();
  if (!id || id.length > 64) {
    return undefined;
  }
  return id;
}

export function parseOpsJson(raw: string): MemoryOp[] {
  const parsed = parseJsonObject(raw);
  if (!parsed) {
    return [];
  }
  const opsRaw = parsed.ops;
  const factsRaw = parsed.facts;
  const items: unknown[] = Array.isArray(opsRaw)
    ? opsRaw
    : Array.isArray(factsRaw)
      ? factsRaw
      : [];
  const ops: MemoryOp[] = [];
  for (const item of items) {
    if (ops.length >= MEMORY_EXTRACT_MAX) {
      break;
    }
    if (typeof item === "string") {
      const text = sanitizeFactText(item);
      if (text) {
        ops.push({ action: "upsert", kind: "other", topic: "", text });
      }
      continue;
    }
    if (typeof item !== "object" || item === null) {
      continue;
    }
    const rec = item as Record<string, unknown>;
    const action = rec.action === "retract" ? "retract" : "upsert";
    const kind = isKind(rec.kind) ? rec.kind : "other";
    const textRaw = typeof rec.text === "string" ? rec.text : "";
    const text = sanitizeFactText(textRaw);
    if (!text) {
      continue;
    }
    const op: MemoryOp = { action, kind, topic: normalizeTopic(rec.topic), text };
    const id = normalizeOpId(rec.id);
    if (id) {
      op.id = id;
    }
    ops.push(op);
  }
  return ops;
}

export function filterFacts(rawFacts: string[], existing: string[]): string[] {
  const kept: string[] = [];
  const seen = [...existing];
  for (const raw of rawFacts) {
    if (kept.length >= 2) {
      break;
    }
    const text = sanitizeFactText(raw);
    if (!text || isDuplicateFact(text, seen)) {
      continue;
    }
    kept.push(text);
    seen.push(text);
  }
  return kept;
}

export function buildExtractUserContent(
  userText: string,
  existing: Array<{ id?: string; text: string; kind?: string; topic?: string }>
): string {
  const listed = existing
    .slice(0, MEMORY_EXTRACT_NEIGHBORS)
    .map((item, index) => {
      const tag = [item.kind, item.topic].filter(Boolean).join("/");
      const id = item.id ? ` id=${item.id}` : "";
      const head = tag ? `[${tag}${id}]` : id ? `[${id.trim()}]` : "";
      return head ? `${index + 1}. ${head} ${item.text}` : `${index + 1}. ${item.text}`;
    })
    .join("\n");
  return `已有记忆：\n${listed || "（无）"}\n\n老师：${userText.trim()}`;
}

export async function extractLongTermOps(input: {
  userText: string;
  existing: Array<{ id?: string; text: string; kind?: string; topic?: string }>;
  completeChat: (messages: LlmMessage[]) => Promise<string>;
}): Promise<MemoryOp[]> {
  if (!input.userText.trim()) {
    return [];
  }
  let raw = "";
  try {
    raw = await input.completeChat([
      { role: "system", content: MEMORY_EXTRACT_PROMPT },
      {
        role: "user",
        content: buildExtractUserContent(input.userText, input.existing)
      }
    ]);
  } catch {
    return [];
  }
  return parseOpsJson(raw);
}
