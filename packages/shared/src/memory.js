"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MEMORY_KINDS = void 0;
exports.isMemoryKind = isMemoryKind;
exports.MEMORY_KINDS = [
    "identity",
    "preference",
    "habit",
    "agreement",
    "other"
];
function isMemoryKind(value) {
    return typeof value === "string" && exports.MEMORY_KINDS.includes(value);
}
