"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MEMORY_OVERLAP_MAX = exports.MEMORY_CORE_MAX = exports.MEMORY_INJECT_MAX_CHARS = exports.MEMORY_INJECT_MAX = void 0;
exports.memoryOverlapsQuery = memoryOverlapsQuery;
exports.memoryRetrieveScore = memoryRetrieveScore;
exports.selectMemoriesForInject = selectMemoriesForInject;
exports.buildMemoryInjectPrompt = buildMemoryInjectPrompt;
exports.buildMemoryAckPrompt = buildMemoryAckPrompt;
const extract_1 = require("./extract");
exports.MEMORY_INJECT_MAX = 12;
exports.MEMORY_INJECT_MAX_CHARS = 960;
exports.MEMORY_CORE_MAX = 6;
exports.MEMORY_OVERLAP_MAX = 6;
const STOP = ["老师", "星奈", "的", "了", "我", "你", "是"];
function contentText(text) {
    let n = (0, extract_1.normalizeMemoryText)(text);
    for (const word of STOP) {
        n = n.split(word).join("");
    }
    return n;
}
function grams(text) {
    const n = contentText(text);
    const set = new Set();
    for (let i = 0; i < n.length - 1; i += 1) {
        set.add(n.slice(i, i + 2));
    }
    return set;
}
function memoryOverlapsQuery(userText, memoryText) {
    const a = contentText(userText);
    const b = contentText(memoryText);
    if (!a || !b) {
        return false;
    }
    if (a.includes(b) || b.includes(a)) {
        return true;
    }
    const gb = grams(memoryText);
    const gq = grams(userText);
    let shared = 0;
    for (const g of gq) {
        if (gb.has(g)) {
            shared += 1;
        }
    }
    if (shared >= 2) {
        return true;
    }
    if (a.length <= 4) {
        const need = Math.min(2, a.length);
        let hit = 0;
        for (const ch of a) {
            if (b.includes(ch)) {
                hit += 1;
                if (hit >= need) {
                    return true;
                }
            }
        }
    }
    return false;
}
function memoryRetrieveScore(userText, memoryText) {
    const a = contentText(userText);
    const b = contentText(memoryText);
    if (!a || !b) {
        return 0;
    }
    if (a.includes(b) || b.includes(a)) {
        return 3;
    }
    const gq = grams(userText);
    const gb = grams(memoryText);
    if (gq.size === 0 || gb.size === 0) {
        return 0;
    }
    let shared = 0;
    for (const g of gq) {
        if (gb.has(g)) {
            shared += 1;
        }
    }
    const jaccard = shared / (gq.size + gb.size - shared);
    let charHit = 0;
    if (a.length <= 4) {
        for (const ch of a) {
            if (b.includes(ch)) {
                charHit += 1;
            }
        }
    }
    return jaccard + charHit / Math.max(a.length, 1);
}
function byUpdatedDesc(a, b) {
    return b.updatedAt.localeCompare(a.updatedAt);
}
function selectMemoriesForInject(items, userText) {
    const active = items.filter((item) => item.status === "active");
    const picked = [];
    const used = new Set();
    const core = active
        .filter((item) => item.kind === "identity" || item.kind === "agreement")
        .sort(byUpdatedDesc);
    for (const item of core) {
        if (picked.length >= exports.MEMORY_CORE_MAX) {
            break;
        }
        used.add(item.id);
        picked.push(item);
    }
    const overlap = active
        .filter((item) => !used.has(item.id) &&
        (item.kind === "preference" || item.kind === "habit" || item.kind === "other") &&
        memoryOverlapsQuery(userText, item.text))
        .sort((left, right) => {
        const score = memoryRetrieveScore(userText, right.text) - memoryRetrieveScore(userText, left.text);
        if (score !== 0) {
            return score;
        }
        return byUpdatedDesc(left, right);
    });
    let overlapCount = 0;
    for (const item of overlap) {
        if (picked.length >= exports.MEMORY_INJECT_MAX || overlapCount >= exports.MEMORY_OVERLAP_MAX) {
            break;
        }
        used.add(item.id);
        picked.push(item);
        overlapCount += 1;
    }
    return picked;
}
function buildMemoryInjectPrompt(texts) {
    const lines = [];
    let used = 0;
    for (const raw of texts) {
        if (lines.length >= exports.MEMORY_INJECT_MAX) {
            break;
        }
        const text = raw.replace(/\s+/g, " ").trim();
        if (!text) {
            continue;
        }
        if (used + text.length > exports.MEMORY_INJECT_MAX_CHARS) {
            break;
        }
        used += text.length;
        lines.push(text);
    }
    if (lines.length === 0) {
        return null;
    }
    return `关于老师的长期记忆：\n${lines.map((line) => `- ${line}`).join("\n")}`;
}
function buildMemoryAckPrompt(texts) {
    const lines = texts.map((item) => item.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 2);
    if (lines.length === 0) {
        return null;
    }
    return `若合适，用一句星奈口吻带过已记住，不要列清单：\n${lines.map((line) => `- ${line}`).join("\n")}`;
}
