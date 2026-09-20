"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.summarizeWrites = summarizeWrites;
exports.logMemoryTurn = logMemoryTurn;
function summarizeWrites(writes) {
    if (writes.length === 0) {
        return "none";
    }
    const types = new Set(writes.map((item) => item.type));
    if (types.size > 1) {
        return "mixed";
    }
    const only = writes[0]?.type;
    if (only === "insert" || only === "update" || only === "supersede") {
        return only;
    }
    return "none";
}
function logMemoryTurn(payload) {
    console.error(JSON.stringify({ src: "hoshi.memory", ...payload }));
}
