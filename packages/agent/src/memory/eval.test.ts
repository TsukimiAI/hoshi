import { describe, expect, it } from "vitest";
import { EVAL_CASES } from "./eval/cases";
import { runGate, runInject, runWrites, scoreAll } from "./eval/run";

describe("memory eval", () => {
  it.each(EVAL_CASES)("$id gate", (evalCase) => {
    expect(runGate(evalCase)).toBe(true);
  });

  it.each(EVAL_CASES.filter((item) => item.expectWrites !== undefined))("$id writes", (evalCase) => {
    const result = runWrites(evalCase);
    expect(result.ok, JSON.stringify(result.writes)).toBe(true);
    expect(result.writes).toHaveLength(evalCase.expectWrites?.length ?? 0);
  });

  it.each(EVAL_CASES.filter((item) => item.injectQuery !== undefined))("$id inject", (evalCase) => {
    const result = runInject(evalCase);
    expect(result.ids, result.ids.join(",")).toEqual(evalCase.expectInjectIds);
    expect(result.ok).toBe(true);
  });

  it("scores", () => {
    const scores = scoreAll();
    console.log(
      `memory_eval gate_acc=${scores.gate_acc.toFixed(2)} write_acc=${scores.write_acc.toFixed(2)} inject_p=${scores.inject_p.toFixed(2)} inject_r=${scores.inject_r.toFixed(2)} n=${scores.gate_n}/${scores.write_n}/${scores.inject_n}`
    );
    expect(scores.gate_acc).toBe(1);
    expect(scores.write_acc).toBe(1);
    expect(scores.inject_p).toBe(1);
    expect(scores.inject_r).toBe(1);
  });
});
