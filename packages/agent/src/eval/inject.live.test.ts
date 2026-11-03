import { describe, expect, it } from "vitest";
import { OpenAiCompatClient } from "../llm/openai";
import { OpenAiCompatEmbedding } from "../knowledge/embedding";
import { scoreInjectEmbedded } from "./evaluators";
import { loadInjectDataset } from "./load";
import { EVAL_EMBEDDING_MODEL, loadRepoEnv, resolveApiKey, resolveBaseUrl } from "./settings";

const enabled = process.env.HOSHI_EVAL_LIVE === "1" || process.env.HOSHI_MEMORY_EVAL === "1";

describe.skipIf(!enabled)("memory inject live", () => {
  it("改写召回", async () => {
    loadRepoEnv();
    const apiKey = resolveApiKey();
    if (!apiKey) {
      throw new Error("missing HOSHI_API_KEY");
    }
    const client = new OpenAiCompatClient({
      apiKey,
      baseUrl: resolveBaseUrl(),
      model: EVAL_EMBEDDING_MODEL
    });
    const embedding = new OpenAiCompatEmbedding(client, () => ({
      model: EVAL_EMBEDDING_MODEL,
      apiKey: "",
      baseUrl: ""
    }));
    const dataset = loadInjectDataset();
    const scored = await scoreInjectEmbedded(dataset.cases, embedding);
    console.log(
      `inject precision=${scored.metrics["memory.inject.precision"]?.value.toFixed(2)} recall=${scored.metrics["memory.inject.recall"]?.value.toFixed(2)}`
    );
    for (const row of scored.failures) {
      console.log(`  ${row.id}: ${row.reason}`);
    }
    expect(scored.metrics["memory.inject.precision"]?.value).toBe(1);
    expect(scored.metrics["memory.inject.recall"]?.value).toBe(1);
  }, 120000);
});
