"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runLiveEval = runLiveEval;
exports.runLiveEvalFromEnv = runLiveEvalFromEnv;
const openai_1 = require("../../llm/openai");
const apply_1 = require("../apply");
const extract_1 = require("../extract");
const cases_1 = require("./cases");
const run_1 = require("./run");
function liveCases() {
    return cases_1.EVAL_CASES.filter((item) => item.live && item.live.kind !== "skip");
}
async function extractOps(evalCase, completeChat) {
    return (0, extract_1.extractLongTermOps)({
        userText: evalCase.user,
        assistantText: evalCase.assistant,
        existing: (0, run_1.toItems)(evalCase.existing).map((item) => ({
            text: item.text,
            kind: item.kind,
            topic: item.topic
        })),
        completeChat
    });
}
async function runLiveEval(completeChat) {
    let abstainOk = 0;
    let abstainN = 0;
    let mustOk = 0;
    let mustN = 0;
    let updateOk = 0;
    let updateN = 0;
    const failures = [];
    for (const evalCase of liveCases()) {
        const kind = evalCase.live?.kind;
        const ops = await extractOps(evalCase, completeChat);
        const blob = ops.map((op) => op.text).join("\n");
        if (kind === "abstain") {
            abstainN += 1;
            if (ops.length === 0) {
                abstainOk += 1;
            }
            else {
                failures.push(`${evalCase.id} ${JSON.stringify(ops)}`);
            }
        }
        else if (kind === "must_hit") {
            mustN += 1;
            const keywords = evalCase.live?.keywords ?? [];
            const writes = (0, apply_1.planMemoryWrites)(ops, (0, run_1.toItems)(evalCase.existing));
            const hit = ops.some((op) => op.action === "upsert") &&
                keywords.every((word) => blob.includes(word)) &&
                (0, run_1.writesMatch)(writes, evalCase.expectWrites ?? []);
            if (hit) {
                mustOk += 1;
            }
            else {
                failures.push(`${evalCase.id} ${JSON.stringify({ ops, writes })}`);
            }
        }
        else if (kind === "update") {
            updateN += 1;
            const writes = (0, apply_1.planMemoryWrites)(ops, (0, run_1.toItems)(evalCase.existing));
            const ok = writes.some((write) => write.type === "update") &&
                writes.every((write) => write.type !== "insert") &&
                (0, run_1.writesMatch)(writes, evalCase.expectWrites ?? []);
            if (ok) {
                updateOk += 1;
            }
            else {
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
async function runLiveEvalFromEnv() {
    const apiKey = process.env.HOSHI_API_KEY?.trim() ?? "";
    if (!apiKey) {
        return { skipped: "missing HOSHI_API_KEY" };
    }
    const client = new openai_1.OpenAiCompatClient({
        apiKey,
        baseUrl: process.env.HOSHI_BASE_URL?.trim() || "https://dashscope.aliyuncs.com/compatible-mode/v1",
        model: process.env.HOSHI_MODEL?.trim() || "qwen-plus"
    });
    return runLiveEval(async (messages) => {
        const result = await client.completeChat(messages, [], { enableSearch: false, timeoutMs: 20000 });
        return result.content;
    });
}
