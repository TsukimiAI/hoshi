import { describe, expect, it } from "vitest";
import { runLiveEvalFromEnv } from "./live";

const enabled = process.env.HOSHI_MEMORY_EVAL === "1";

describe.skipIf(!enabled)("memory live extract", () => {
  it("L2", async () => {
    const result = await runLiveEvalFromEnv();
    if ("skipped" in result) {
      throw new Error(result.skipped);
    }
    for (const line of result.failures) {
      console.error(line);
    }
    console.log(
      `memory_live abstain=${result.extract_abstain_acc.toFixed(2)} must_hit=${result.extract_must_hit.toFixed(2)} update=${result.extract_update_acc.toFixed(2)} n=${result.abstain_n}/${result.must_n}/${result.update_n}`
    );
    expect(result.failures).toEqual([]);
  }, 180000);
});
