"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const cases_1 = require("./eval/cases");
const run_1 = require("./eval/run");
(0, vitest_1.describe)("memory eval", () => {
    vitest_1.it.each(cases_1.EVAL_CASES)("$id gate", (evalCase) => {
        (0, vitest_1.expect)((0, run_1.runGate)(evalCase)).toBe(true);
    });
    vitest_1.it.each(cases_1.EVAL_CASES.filter((item) => item.expectWrites !== undefined))("$id writes", (evalCase) => {
        const result = (0, run_1.runWrites)(evalCase);
        (0, vitest_1.expect)(result.ok, JSON.stringify(result.writes)).toBe(true);
        (0, vitest_1.expect)(result.writes).toHaveLength(evalCase.expectWrites?.length ?? 0);
    });
    vitest_1.it.each(cases_1.EVAL_CASES.filter((item) => item.injectQuery !== undefined))("$id inject", (evalCase) => {
        const result = (0, run_1.runInject)(evalCase);
        (0, vitest_1.expect)(result.ids, result.ids.join(",")).toEqual(evalCase.expectInjectIds);
        (0, vitest_1.expect)(result.ok).toBe(true);
    });
    (0, vitest_1.it)("scores", () => {
        const scores = (0, run_1.scoreAll)();
        console.log(`memory_eval gate_acc=${scores.gate_acc.toFixed(2)} write_acc=${scores.write_acc.toFixed(2)} inject_p=${scores.inject_p.toFixed(2)} inject_r=${scores.inject_r.toFixed(2)} n=${scores.gate_n}/${scores.write_n}/${scores.inject_n}`);
        (0, vitest_1.expect)(scores.gate_acc).toBe(1);
        (0, vitest_1.expect)(scores.write_acc).toBe(1);
        (0, vitest_1.expect)(scores.inject_p).toBe(1);
        (0, vitest_1.expect)(scores.inject_r).toBe(1);
    });
});
