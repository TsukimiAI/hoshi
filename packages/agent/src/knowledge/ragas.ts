import type { LlmMessage } from "../llm/openai";
import type { KnowledgeService } from "./service";

type CompleteChat = (messages: LlmMessage[]) => Promise<string>;

export interface RagasCase {
  query: string;
}

export interface RagasCaseResult {
  query: string;
  answer: string;
  faithfulness: number;
  contextRelevance: number;
  answerRelevance: number;
  unsupportedClaims: string[];
}

export interface RagasEvalResult {
  avgFaithfulness: number;
  avgContextRelevance: number;
  avgAnswerRelevance: number;
  cases: RagasCaseResult[];
  skipped: Array<{ query: string; reason: string }>;
}

const GENERATION_PROMPT = `你是检索问答助手。只根据资料片段回答，不要使用你自己的知识。
规则：
- 资料按相关度从高到低排列。只用能回答问题的片段，忽略其他片段。
- 用资料原句直接作答，覆盖其中与问题直接相关的全部要点。
- 不要补充资料没写的原因、步骤、背景、建议或数字。问题问“为什么”时，只复述资料里与该问题相关的原句，不要编机理。
- 不要评论资料缺了什么，禁止写“资料中仅提到”“并未说明”“没有写原因”。
- 若某条资料包含问题里的主题，就摘出那句作答。即使没有写出“因为”，也不要回答“资料中没有相关信息”。
- 只要任一片段能回答问题，就必须作答，禁止说“资料中没有相关信息”。
- 所有片段都没有答案时，才回答“资料中没有相关信息”。
- 用一两句话作答，不要标题和分点。`;

const FAITHFULNESS_PROMPT = `你是忠实度评估器。判断"回答"中的每个论断是否能被"资料"支撑。
规则：
- 把回答拆成若干论断（claim）。
- 与资料原句一致，或只是语序、标点不同的同义表述，supported 为 true。
- 资料完全没有依据的原因、步骤、数字或评价，supported 为 false。
- 回答说“资料中没有相关信息”，但资料里其实有能回答问题的内容时，supported 为 false。
- 只输出 JSON：{"claims":[{"text":"...","supported":true}]}`;

const CONTEXT_RELEVANCE_PROMPT = `你是相关性评估器。判断每条"资料片段"是否与"问题"相关。
- 只输出 JSON：{"relevant":[true,false]}，数组长度必须等于资料片段数量。`;

const ANSWER_RELEVANCE_PROMPT = `你是回答相关性评估器。判断回答是否对准了问题。简短、只说事实、没有展开原因，都不算扣分理由。
- 回答给出了问题所问的事实、定义、数量或做法：0.85 到 1。
- 问题问“为什么”或“会怎样”，只要回答点出了相关事实，就给 0.85 到 1。不要因为没写机理而打到 0.4 以下。
- 问题问“怎么做”或“怎么清理”，只要回答给出了做法或频率，就给 0.85 到 1。不要因为步骤不够细而打低分。
- 回答偏题、空泛，或只说“没有信息”：0 到 0.4。
- 只输出 JSON：{"score":0到1之间的小数}`;

export function stripModelThinking(raw: string): string {
  return raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

const TOPIC_STOPS = ["为什么", "怎么样", "怎么", "怎样", "如何", "是不是", "哪些", "什么", "多久", "多少", "会让"];

export function contextMentionsQuery(query: string, context: string): boolean {
  let rest = query.replace(/[？?，,。！!\s]/g, "");
  for (const word of TOPIC_STOPS) {
    rest = rest.replaceAll(word, "\n");
  }
  const pieces = rest
    .split("\n")
    .map((piece) => piece.replace(/^[要的和与或]+|[要的和与或]+$/g, "").trim())
    .filter((piece) => piece.length >= 2);
  if (pieces.length === 0) {
    return false;
  }
  return pieces.every((piece) => pieceInContext(piece, context));
}

function pieceInContext(piece: string, context: string): boolean {
  if (context.includes(piece)) {
    return true;
  }
  const compact = piece.replace(/[要的和与或]/g, "");
  if (compact.length >= 2 && compact !== piece && context.includes(compact)) {
    return true;
  }
  let hits = 0;
  for (let i = 0; i < piece.length - 1; i += 1) {
    if (context.includes(piece.slice(i, i + 2))) {
      hits += 1;
    }
  }
  return hits >= 2;
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

async function generateAnswer(completeChat: CompleteChat, query: string, context: string): Promise<string> {
  const ask = (extra = ""): Promise<string> =>
    completeChat([
      { role: "system", content: GENERATION_PROMPT },
      { role: "user", content: `资料：\n${context}\n\n问题：${query}${extra}` }
    ]).then(stripModelThinking);

  const first = await ask();
  if (!first.includes("资料中没有相关信息") || !contextMentionsQuery(query, context)) {
    return first;
  }
  return ask("\n\n资料里已经有和问题相关的原句。请摘出那句作答，不要说没有信息。");
}

async function judgeFaithfulness(
  completeChat: CompleteChat,
  query: string,
  answer: string,
  context: string
): Promise<{ score: number; unsupported: string[] }> {
  const raw = stripModelThinking(
    await completeChat([
      { role: "system", content: FAITHFULNESS_PROMPT },
      { role: "user", content: `问题：${query}\n回答：${answer}\n资料：${context}` }
    ])
  );
  const parsed = parseJsonObject(raw);
  const claims = Array.isArray(parsed?.claims) ? parsed.claims : [];
  const valid = claims.filter(
    (claim): claim is { text: string; supported: boolean } =>
      typeof claim === "object" && claim !== null && typeof claim.text === "string" && typeof claim.supported === "boolean"
  );
  if (valid.length === 0) {
    return { score: 1, unsupported: [] };
  }
  const supported = valid.filter((claim) => claim.supported).length;
  const unsupported = valid.filter((claim) => !claim.supported).map((claim) => claim.text);
  return { score: supported / valid.length, unsupported };
}

async function judgeContextRelevance(
  completeChat: CompleteChat,
  query: string,
  contexts: string[]
): Promise<number> {
  const numbered = contexts.map((context, index) => `[${index + 1}] ${context}`).join("\n");
  const raw = stripModelThinking(
    await completeChat([
      { role: "system", content: CONTEXT_RELEVANCE_PROMPT },
      { role: "user", content: `问题：${query}\n资料片段：\n${numbered}` }
    ])
  );
  const parsed = parseJsonObject(raw);
  const relevant = Array.isArray(parsed?.relevant)
    ? parsed.relevant.filter((value): value is boolean => typeof value === "boolean")
    : [];
  if (relevant.length === 0) {
    return 0;
  }
  return relevant.filter(Boolean).length / relevant.length;
}

async function judgeAnswerRelevance(
  completeChat: CompleteChat,
  query: string,
  answer: string
): Promise<number> {
  const raw = stripModelThinking(
    await completeChat([
      { role: "system", content: ANSWER_RELEVANCE_PROMPT },
      { role: "user", content: `问题：${query}\n回答：${answer}` }
    ])
  );
  const parsed = parseJsonObject(raw);
  const score = Number(parsed?.score);
  if (!Number.isFinite(score)) {
    return 0;
  }
  return Math.min(1, Math.max(0, score));
}

export async function runRagasEval(opts: {
  service: KnowledgeService;
  completeChat: CompleteChat;
  cases: RagasCase[];
  topK?: number;
}): Promise<RagasEvalResult> {
  const results: RagasCaseResult[] = [];
  const skipped: Array<{ query: string; reason: string }> = [];
  for (const evalCase of opts.cases) {
    try {
      const hits = await opts.service.search(evalCase.query, { topK: opts.topK ?? 3 });
      const contexts = hits.map((hit) => hit.text);
      const context = contexts.map((item, index) => `[${index + 1}] ${item}`).join("\n\n");
      const answer = await generateAnswer(opts.completeChat, evalCase.query, context);
      const faithfulness = await judgeFaithfulness(opts.completeChat, evalCase.query, answer, context);
      const contextRelevance =
        contexts.length > 0 ? await judgeContextRelevance(opts.completeChat, evalCase.query, contexts) : 0;
      const answerRelevance = await judgeAnswerRelevance(opts.completeChat, evalCase.query, answer);
      results.push({
        query: evalCase.query,
        answer,
        faithfulness: faithfulness.score,
        contextRelevance,
        answerRelevance,
        unsupportedClaims: faithfulness.unsupported
      });
    } catch (error) {
      skipped.push({
        query: evalCase.query,
        reason: error instanceof Error ? error.message : String(error)
      });
    }
  }
  const avg = (key: keyof Pick<RagasCaseResult, "faithfulness" | "contextRelevance" | "answerRelevance">): number =>
    results.reduce((sum, result) => sum + result[key], 0) / (results.length || 1);
  return {
    avgFaithfulness: avg("faithfulness"),
    avgContextRelevance: avg("contextRelevance"),
    avgAnswerRelevance: avg("answerRelevance"),
    cases: results,
    skipped
  };
}
