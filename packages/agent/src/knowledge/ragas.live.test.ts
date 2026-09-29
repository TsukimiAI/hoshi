import { describe, expect, it } from "vitest";
import { runRagasEvalFromEnv } from "./ragas.live";

const enabled = process.env.HOSHI_KB_EVAL === "1";

describe.skipIf(!enabled)("ragas live", () => {
  it("faithfulness 与 context relevance", async () => {
    const result = await runRagasEvalFromEnv();
    if ("skipped" in result) {
      throw new Error(result.skipped);
    }
    console.log(
      `ragas avg_faithfulness=${result.avgFaithfulness.toFixed(2)} avg_context_relevance=${result.avgContextRelevance.toFixed(2)} avg_answer_relevance=${result.avgAnswerRelevance.toFixed(2)}`
    );
    for (const evalCase of result.cases) {
      console.log(
        `  ${evalCase.query} -> faithfulness=${evalCase.faithfulness.toFixed(2)} contextRelevance=${evalCase.contextRelevance.toFixed(2)} answerRelevance=${evalCase.answerRelevance.toFixed(2)}`
      );
      if (evalCase.unsupportedClaims.length > 0) {
        console.log(`    未支撑论断: ${evalCase.unsupportedClaims.join(" | ")}`);
      }
    }
    expect(result.cases).toHaveLength(3);
    expect(result.avgFaithfulness).toBeGreaterThan(0.5);
  }, 120000);
});
