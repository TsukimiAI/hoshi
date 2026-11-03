import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExperimentRecord } from "./types";

const RUN_DIR = join(__dirname, "..", "..", "eval-runs");

export function writeRun(record: ExperimentRecord): string {
  mkdirSync(RUN_DIR, { recursive: true });
  const file = join(RUN_DIR, `${record.experimentId}.json`);
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
  return file;
}

export function printSummary(record: ExperimentRecord): void {
  const log = (line: string): void => {
    process.stdout.write(`${line}\n`);
  };
  const line = (key: string, label: string): string => {
    const score = record.metrics[key];
    if (!score) {
      return `${label} 未跑`;
    }
    if (score.skipped) {
      return `${label} skipped (${score.skipped})`;
    }
    return `${label}=${score.value.toFixed(2)} n=${score.n}`;
  };
  log(`=== Hoshi eval ${record.tier} ${record.experimentId} ===`);
  log(line("router.web.accuracy", "router web accuracy"));
  log(line("router.kb.accuracy", "router kb accuracy"));
  log(line("router.desk.accuracy", "router desk accuracy"));
  log(line("memory.inject.precision", "memory inject precision"));
  log(line("memory.inject.recall", "memory inject recall"));
  log(line("kb.hit_at_k", "kb hit@k"));
  log(line("kb.mrr", "kb mrr"));
  log(line("memory.extract.abstain", "memory extract abstain"));
  log(line("memory.extract.must_hit", "memory extract must_hit"));
  log(line("memory.extract.update", "memory extract update"));
  log("检索条件生成组件（非整轮对话）；Faithfulness 需与 Hit@k 一起看");
  log(line("ragas.faithfulness", "ragas faithfulness"));
  log(line("ragas.answer_relevancy", "ragas answer relevancy"));
  log(line("ragas.context_relevancy", "ragas context relevancy"));
  if (record.failures.length > 0) {
    log(`failures=${record.failures.length}`);
    for (const row of record.failures.slice(0, 20)) {
      log(`  ${row.metric} ${row.id}: ${row.reason}`);
    }
  }
}
