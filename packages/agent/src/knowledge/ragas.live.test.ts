import { describe, expect, it } from "vitest";
import { loadBaseline } from "../eval/compare";
import { ragasEvalCaseCount, runRagasEvalFromEnv } from "./ragas.live";

const MODEL_DELTA = 0.05;

const enabled = process.env.HOSHI_KB_EVAL === "1";

describe.skipIf(!enabled)("ragas live", () => {
  it("faithfulness 与 context relevance", async () => {
    const result = await runRagasEvalFromEnv();
    if (!("avgFaithfulness" in result)) {
      throw new Error(result.skipped);
    }
    console.log(
      `ragas avg_faithfulness=${result.avgFaithfulness.toFixed(2)} avg_context_relevance=${result.avgContextRelevance.toFixed(2)} avg_answer_relevance=${result.avgAnswerRelevance.toFixed(2)}`
    );
    for (const evalCase of result.cases) {
      console.log(
        `  ${evalCase.query} -> faithfulness=${evalCase.faithfulness.toFixed(2)} contextRelevance=${evalCase.contextRelevance.toFixed(2)} answerRelevance=${evalCase.answerRelevance.toFixed(2)}`
      );
      console.log(`    answer: ${evalCase.answer}`);
      if (evalCase.unsupportedClaims.length > 0) {
        console.log(`    未支撑论断: ${evalCase.unsupportedClaims.join(" | ")}`);
      }
    }
    if (result.skipped.length > 0) {
      console.log(`skipped=${result.skipped.length}`);
      for (const row of result.skipped) {
        console.log(`  ${row.query}: ${row.reason}`);
      }
    }
    const baseline = loadBaseline();
    expect(result.cases).toHaveLength(ragasEvalCaseCount());
    expect(result.avgFaithfulness + MODEL_DELTA).toBeGreaterThanOrEqual(baseline.metrics["ragas.faithfulness"]);
    expect(result.avgAnswerRelevance + MODEL_DELTA).toBeGreaterThanOrEqual(
      baseline.metrics["ragas.answer_relevancy"]
    );
    expect(result.avgContextRelevance + MODEL_DELTA).toBeGreaterThanOrEqual(
      baseline.metrics["ragas.context_relevancy"]
    );
  }, 600000);
});
