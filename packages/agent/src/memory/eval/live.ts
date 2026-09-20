import type { LlmMessage } from "../../llm/openai";
import { OpenAiCompatClient } from "../../llm/openai";
import { planMemoryWrites } from "../apply";
import { extractLongTermOps } from "../extract";
import { EVAL_CASES, type EvalCase } from "./cases";
import { toItems, writesMatch } from "./run";

export interface LiveScores {
  extract_abstain_acc: number;
  extract_must_hit: number;
  extract_update_acc: number;
  abstain_n: number;
  must_n: number;
  update_n: number;
  failures: string[];
}

type CompleteChat = (messages: LlmMessage[]) => Promise<string>;

function liveCases(): EvalCase[] {
  return EVAL_CASES.filter((item) => item.live && item.live.kind !== "skip");
}

async function extractOps(evalCase: EvalCase, completeChat: CompleteChat) {
  return extractLongTermOps({
    userText: evalCase.user,
    assistantText: evalCase.assistant,
    existing: toItems(evalCase.existing).map((item) => ({
      text: item.text,
      kind: item.kind,
      topic: item.topic
    })),
    completeChat
  });
}

export async function runLiveEval(completeChat: CompleteChat): Promise<LiveScores> {
  let abstainOk = 0;
  let abstainN = 0;
  let mustOk = 0;
  let mustN = 0;
  let updateOk = 0;
  let updateN = 0;
  const failures: string[] = [];

  for (const evalCase of liveCases()) {
    const kind = evalCase.live?.kind;
    const ops = await extractOps(evalCase, completeChat);
    const blob = ops.map((op) => op.text).join("\n");
    if (kind === "abstain") {
      abstainN += 1;
      if (ops.length === 0) {
        abstainOk += 1;
      } else {
        failures.push(`${evalCase.id} ${JSON.stringify(ops)}`);
      }
    } else if (kind === "must_hit") {
      mustN += 1;
      const keywords = evalCase.live?.keywords ?? [];
      const writes = planMemoryWrites(ops, toItems(evalCase.existing));
      const hit =
        ops.some((op) => op.action === "upsert") &&
        keywords.every((word) => blob.includes(word)) &&
        writesMatch(writes, evalCase.expectWrites ?? []);
      if (hit) {
        mustOk += 1;
      } else {
        failures.push(`${evalCase.id} ${JSON.stringify({ ops, writes })}`);
      }
    } else if (kind === "update") {
      updateN += 1;
      const writes = planMemoryWrites(ops, toItems(evalCase.existing));
      const ok =
        writes.some((write) => write.type === "update") &&
        writes.every((write) => write.type !== "insert") &&
        writesMatch(writes, evalCase.expectWrites ?? []);
      if (ok) {
        updateOk += 1;
      } else {
        failures.push(`${evalCase.id} ${JSON.stringify({ ops, writes })}`);
      }
    }
  }

  return {
    extract_abstain_acc: abstainN ? abstainOk / abstainN : 1,
    extract_must_hit: mustN ? mustOk / mustN : 1,
    extract_update_acc: updateN ? updateOk / updateN : 1,
    abstain_n: abstainN,
    must_n: mustN,
    update_n: updateN,
    failures
  };
}

export async function runLiveEvalFromEnv(): Promise<LiveScores | { skipped: string }> {
  const apiKey = process.env.HOSHI_API_KEY?.trim() ?? "";
  if (!apiKey) {
    return { skipped: "missing HOSHI_API_KEY" };
  }
  const client = new OpenAiCompatClient({
    apiKey,
    baseUrl: process.env.HOSHI_BASE_URL?.trim() || "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: process.env.HOSHI_MODEL?.trim() || "qwen-plus"
  });
  return runLiveEval(async (messages) => {
    const result = await client.completeChat(messages, [], { enableSearch: false, timeoutMs: 20000 });
    return result.content;
  });
}
