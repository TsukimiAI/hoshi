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
}

const GENERATION_PROMPT = `你是检索问答助手。只根据下面提供的资料片段回答问题，不要使用你自己的知识。
如果资料中没有答案，就回答"资料中没有相关信息"。回答要简洁、准确。`;

const FAITHFULNESS_PROMPT = `你是忠实度评估器。判断"回答"中的每个论断是否能被"资料"支撑。
规则：
- 把回答拆成若干论断（claim），每句一个。
- 对每个论断，判断它是否被资料片段明确支持或合理推断。
- 只输出 JSON：{"claims":[{"text":"...","supported":true}]}`;

const CONTEXT_RELEVANCE_PROMPT = `你是相关性评估器。判断每条"资料片段"是否与"问题"相关。
- 只输出 JSON：{"relevant":[true,false]}，数组长度必须等于资料片段数量。`;

const ANSWER_RELEVANCE_PROMPT = `你是回答相关性评估器。判断"回答"是否直接、完整地回应了"问题"：
- 答非所问、遗漏关键点、顾左右而言他、或只说"没有信息"都算低分。
- 只输出 JSON：{"score":0到1之间的小数}，分数越高越相关。`;

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
  return completeChat([
    { role: "system", content: GENERATION_PROMPT },
    { role: "user", content: `资料：\n${context}\n\n问题：${query}` }
  ]);
}

async function judgeFaithfulness(
  completeChat: CompleteChat,
  query: string,
  answer: string,
  context: string
): Promise<{ score: number; unsupported: string[] }> {
  const raw = await completeChat([
    { role: "system", content: FAITHFULNESS_PROMPT },
    { role: "user", content: `问题：${query}\n回答：${answer}\n资料：${context}` }
  ]);
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
  const raw = await completeChat([
    { role: "system", content: CONTEXT_RELEVANCE_PROMPT },
    { role: "user", content: `问题：${query}\n资料片段：\n${numbered}` }
  ]);
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
  const raw = await completeChat([
    { role: "system", content: ANSWER_RELEVANCE_PROMPT },
    { role: "user", content: `问题：${query}\n回答：${answer}` }
  ]);
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
  for (const evalCase of opts.cases) {
    const hits = await opts.service.search(evalCase.query, { topK: opts.topK ?? 3 });
    const contexts = hits.map((hit) => hit.text);
    const context = contexts.join("\n\n---\n\n");
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
  }
  const avg = (key: keyof Pick<RagasCaseResult, "faithfulness" | "contextRelevance" | "answerRelevance">): number =>
    results.reduce((sum, result) => sum + result[key], 0) / (results.length || 1);
  return {
    avgFaithfulness: avg("faithfulness"),
    avgContextRelevance: avg("contextRelevance"),
    avgAnswerRelevance: avg("answerRelevance"),
    cases: results
  };
}
