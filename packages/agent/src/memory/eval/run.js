"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toItems = toItems;
exports.runGate = runGate;
exports.writeFits = writeFits;
exports.writesMatch = writesMatch;
exports.runWrites = runWrites;
exports.runInject = runInject;
exports.scoreAll = scoreAll;
const apply_1 = require("../apply");
const extract_1 = require("../extract");
const inject_1 = require("../inject");
const cases_1 = require("./cases");
function toItems(seeds) {
    return (seeds ?? []).map((seed) => ({
        id: seed.id,
        text: seed.text,
        kind: seed.kind,
        topic: seed.topic ?? "",
        status: "active",
        sourceSessionId: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: seed.updatedAt ?? "2026-01-01T00:00:00.000Z",
        ackedAt: null
    }));
}
function runGate(evalCase) {
    return (0, extract_1.shouldExtract)(evalCase.user) === evalCase.expectGate;
}
function writeFits(actual, expected) {
    if (actual.type !== expected.type) {
        return false;
    }
    if (expected.id && !("id" in actual && actual.id === expected.id)) {
        return false;
    }
    if (expected.topic && !("topic" in actual && actual.topic === expected.topic)) {
        return false;
    }
    if (expected.kind && actual.type === "insert" && actual.kind !== expected.kind) {
        return false;
    }
    return true;
}
function writesMatch(actual, expected) {
    if (actual.length !== expected.length) {
        return false;
    }
    const used = new Set();
    for (const item of expected) {
        const index = actual.findIndex((write, i) => !used.has(i) && writeFits(write, item));
        if (index < 0) {
            return false;
        }
        used.add(index);
    }
    return true;
}
function runWrites(evalCase) {
    const autoWrite = evalCase.autoWrite ?? true;
    if (!(0, extract_1.canExtractMemory)(autoWrite, evalCase.user, evalCase.assistant)) {
        const writes = [];
        return { ok: writesMatch(writes, evalCase.expectWrites ?? []), writes };
    }
    const ops = (0, extract_1.parseOpsJson)(JSON.stringify({ ops: evalCase.ops ?? [] }));
    const writes = (0, apply_1.planMemoryWrites)(ops, toItems(evalCase.existing));
    return { ok: writesMatch(writes, evalCase.expectWrites ?? []), writes };
}
function runInject(evalCase) {
    const query = evalCase.injectQuery;
    if (query === undefined) {
        return { ok: true, ids: [] };
    }
    const ids = (0, inject_1.selectMemoriesForInject)(toItems(evalCase.existing), query).map((item) => item.id);
    const need = evalCase.expectInjectIds ?? [];
    const ban = evalCase.expectInjectExcludeIds ?? [];
    const hit = need.every((id) => ids.includes(id));
    const clean = ban.every((id) => !ids.includes(id));
    return { ok: hit && clean && ids.length === need.length, ids };
}
function scoreAll(cases = cases_1.EVAL_CASES) {
    let gateOk = 0;
    const gateN = cases.length;
    let writeOk = 0;
    let writeN = 0;
    let injectTp = 0;
    let injectPred = 0;
    let injectGold = 0;
    let injectN = 0;
    for (const evalCase of cases) {
        if (runGate(evalCase)) {
            gateOk += 1;
        }
        if (evalCase.expectWrites !== undefined) {
            writeN += 1;
            if (runWrites(evalCase).ok) {
                writeOk += 1;
            }
        }
        if (evalCase.injectQuery !== undefined) {
            injectN += 1;
            const { ids } = runInject(evalCase);
            const need = new Set(evalCase.expectInjectIds ?? []);
            const pred = new Set(ids);
            injectGold += need.size;
            injectPred += pred.size;
            for (const id of pred) {
                if (need.has(id)) {
                    injectTp += 1;
                }
            }
        }
    }
    return {
        gate_acc: gateN ? gateOk / gateN : 1,
        write_acc: writeN ? writeOk / writeN : 1,
        inject_p: injectPred ? injectTp / injectPred : 1,
        inject_r: injectGold ? injectTp / injectGold : 1,
        gate_n: gateN,
        write_n: writeN,
        inject_n: injectN
    };
}
