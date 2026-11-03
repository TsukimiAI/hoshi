import { describe, it } from "vitest";
import { compareBaseline, loadBaseline } from "./compare";
import { runExperiment } from "./experiment";
import { printSummary, writeRun } from "./report";

const live = process.env.HOSHI_EVAL_LIVE === "1";

describe("hoshi eval experiment", () => {
  it(live ? "live" : "offline", async () => {
    const record = await runExperiment(live ? "live" : "offline");
    writeRun(record);
    printSummary(record);
    const compared = compareBaseline(record, loadBaseline());
    if (!compared.ok) {
      throw new Error(compared.reasons.join("\n"));
    }
  }, live ? 600000 : 30000);
});
