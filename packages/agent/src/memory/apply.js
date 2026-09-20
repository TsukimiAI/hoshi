"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inferTopic = inferTopic;
exports.planMemoryWrites = planMemoryWrites;
const extract_1 = require("./extract");
const TOPIC_BUCKETS = [
    { topic: "name", keys: ["叫我", "叫做", "名叫", "名字", "称呼"] },
    { topic: "drink", keys: ["喝", "茶", "咖啡", "奶"] },
    { topic: "job", keys: ["工作是", "上班", "职业", "后端", "研究生"] },
    { topic: "schedule", keys: ["加班", "作息", "晚上写", "周末"] }
];
function inferTopic(text) {
    for (const bucket of TOPIC_BUCKETS) {
        if (bucket.keys.some((key) => text.includes(key))) {
            return bucket.topic;
        }
    }
    return "";
}
function resolvedTopic(item) {
    return item.topic || inferTopic(item.text);
}
function findByTopic(active, kind, topic) {
    if (!topic) {
        return undefined;
    }
    return active.find((item) => item.status === "active" && item.kind === kind && resolvedTopic(item) === topic);
}
function findOverlap(active, text, kind) {
    return active.find((item) => {
        if (item.status !== "active") {
            return false;
        }
        if (kind && item.kind !== kind) {
            return false;
        }
        return (0, extract_1.isDuplicateFact)(text, [item.text]);
    });
}
function planMemoryWrites(ops, active) {
    const current = active.filter((item) => item.status === "active").map((item) => ({ ...item }));
    const writes = [];
    for (const op of ops) {
        const topic = inferTopic(op.text) || op.topic;
        if (op.action === "retract") {
            const hit = findByTopic(current, op.kind, topic) ?? findOverlap(current, op.text);
            if (!hit) {
                continue;
            }
            writes.push({ type: "supersede", id: hit.id });
            const idx = current.findIndex((item) => item.id === hit.id);
            if (idx >= 0) {
                current.splice(idx, 1);
            }
            continue;
        }
        const byTopic = findByTopic(current, op.kind, topic);
        const same = byTopic ?? findOverlap(current, op.text, op.kind);
        if (same) {
            const nextTopic = topic || same.topic || inferTopic(same.text);
            if (same.text === op.text && resolvedTopic(same) === nextTopic) {
                continue;
            }
            writes.push({ type: "update", id: same.id, text: op.text, topic: nextTopic });
            same.text = op.text;
            same.topic = nextTopic;
            continue;
        }
        writes.push({ type: "insert", text: op.text, kind: op.kind, topic });
        current.push({
            id: `pending:${writes.length}`,
            text: op.text,
            kind: op.kind,
            topic,
            status: "active",
            sourceSessionId: null,
            createdAt: "",
            updatedAt: "",
            ackedAt: null
        });
    }
    return writes;
}
