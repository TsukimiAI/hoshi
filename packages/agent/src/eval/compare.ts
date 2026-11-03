import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BaselineFile, ExperimentRecord } from "./types";

const MODEL_DELTA = 0.05;

const RETRIEVAL_KEYS = ["kb.hit_at_k", "kb.mrr"];
const CHAT_KEYS = [
  "memory.extract.abstain",
  "memory.extract.must_hit",
  "memory.extract.update",
  "ragas.faithfulness",
  "ragas.answer_relevancy",
  "ragas.context_relevancy"
];

export function loadBaseline(): BaselineFile {
  return JSON.parse(readFileSync(join(__dirname, "baseline.json"), "utf8")) as BaselineFile;
}

export function compareBaseline(
  record: ExperimentRecord,
  baseline: BaselineFile
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  for (const dataset of record.datasets) {
    const expected = baseline.datasets[dataset.name];
    if (!expected) {
      reasons.push(`基线过期：缺少数据集 ${dataset.name}`);
      continue;
    }
    if (expected !== dataset.version) {
      reasons.push(`基线过期：${dataset.name} 版本 ${dataset.version} 对不上 ${expected}`);
    }
  }

  const ranRetrieval = RETRIEVAL_KEYS.some((key) => record.metrics[key] && !record.metrics[key].skipped);
  if (ranRetrieval && record.embeddingModel && record.embeddingModel !== baseline.embeddingModel) {
    reasons.push(`基线过期：嵌入模型 ${record.embeddingModel} 对不上 ${baseline.embeddingModel}`);
  }

  const ranChat = CHAT_KEYS.some((key) => record.metrics[key] && !record.metrics[key].skipped);
  if (ranChat && record.chatModel && record.chatModel !== baseline.chatModel) {
    reasons.push(`基线过期：对话模型 ${record.chatModel} 对不上 ${baseline.chatModel}`);
  }

  if (reasons.length > 0) {
    return { ok: false, reasons };
  }

  for (const [key, score] of Object.entries(record.metrics)) {
    if (score.skipped) {
      continue;
    }
    if (!(key in baseline.metrics)) {
      continue;
    }
    const floor = baseline.metrics[key];
    if (score.kind === "code") {
      if (RETRIEVAL_KEYS.includes(key) && record.embeddingModel !== baseline.embeddingModel) {
        continue;
      }
      if (score.value < floor) {
        reasons.push(`${key}=${score.value.toFixed(4)} 低于基线 ${floor}`);
      }
      continue;
    }
    if (CHAT_KEYS.includes(key) && record.chatModel !== baseline.chatModel) {
      continue;
    }
    if (score.value + MODEL_DELTA < floor) {
      reasons.push(`${key}=${score.value.toFixed(4)} 低于基线 ${floor}（容差 ${MODEL_DELTA}）`);
    }
  }

  return { ok: reasons.length === 0, reasons };
}
