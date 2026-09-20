"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MEMORY_EXTRACT_PROMPT = exports.MEMORY_EXTRACT_MAX = exports.MEMORY_FACT_MAX = exports.MEMORY_FACT_MIN = void 0;
exports.shouldExtract = shouldExtract;
exports.normalizeTopic = normalizeTopic;
exports.canExtractMemory = canExtractMemory;
exports.normalizeMemoryText = normalizeMemoryText;
exports.isDuplicateFact = isDuplicateFact;
exports.hitsReject = hitsReject;
exports.sanitizeFactText = sanitizeFactText;
exports.parseOpsJson = parseOpsJson;
exports.filterFacts = filterFacts;
exports.buildExtractUserContent = buildExtractUserContent;
exports.extractLongTermOps = extractLongTermOps;
exports.MEMORY_FACT_MIN = 6;
exports.MEMORY_FACT_MAX = 80;
exports.MEMORY_EXTRACT_MAX = 3;
exports.MEMORY_EXTRACT_PROMPT = `你从本轮对话中为「老师」维护长期记忆。只输出 JSON：{"ops":[{"action":"upsert","kind":"preference","topic":"drink","text":"..."}]}
规则：
- ops 0到3条。action 只能是 upsert 或 retract。
- kind 只能是 identity、preference、habit、agreement、other。
- topic 用稳定短词（name/drink/job/schedule 等），同一件事必须同一 topic；改口靠同一 topic 覆盖，不必再 retract。
- 每条 text 一句中文，6到80字，写成「老师…」。
- 「我是研究生」「不喝咖啡」这类身份和否定偏好必须 upsert，不要因为星奈已答应就输出空。
- 只处理自我介绍、偏好、习惯、明确约定、身份称呼。
- 不抽天气播报/联播/代码题、情绪、对星奈的夸奖、猜测。职业含「新闻」可以记。
- 已有记忆里意思相同且未改口的不要再 upsert。
- 不要密码、验证码、密钥、证件号、银行卡、精确住址门牌、病历、气温预报。
- 没有值得记的就 {"ops":[]}`;
const DENY = ["天气", "新闻", "报错", "traceback", "帮我写", "写代码", "编译"];
const ALLOW = [
    "记住",
    "别忘",
    "以后",
    "我是",
    "叫我",
    "喜欢",
    "习惯",
    "不要",
    "我叫",
    "我在",
    "从事",
    "工作是"
];
const REJECT = [
    "密码",
    "验证码",
    "api key",
    "api token",
    "access token",
    "secret",
    "身份证",
    "银行卡",
    "cvv",
    "病历",
    "住址"
];
const WEATHER_HINT = ["今天", "明天", "气温", "预报", "怎么样"];
const ADDRESS_HINT = ["区", "路", "号", "小区"];
function shouldExtract(userText) {
    const user = userText.trim();
    if (!user) {
        return false;
    }
    if (ALLOW.some((item) => user.includes(item))) {
        return true;
    }
    if (DENY.some((item) => user.toLowerCase().includes(item))) {
        return false;
    }
    return false;
}
function normalizeTopic(raw) {
    if (typeof raw !== "string") {
        return "";
    }
    const topic = raw.toLowerCase().replace(/\s+/g, "").slice(0, 16);
    if (!topic || !/^[a-z0-9\u4e00-\u9fff]+$/.test(topic)) {
        return "";
    }
    return topic;
}
function canExtractMemory(autoWrite, userText, assistantText) {
    return autoWrite && shouldExtract(userText) && Boolean(assistantText.trim());
}
function normalizeMemoryText(text) {
    return text.toLowerCase().replace(/\s+/g, "");
}
function isDuplicateFact(candidate, existing) {
    const a = normalizeMemoryText(candidate);
    if (!a) {
        return true;
    }
    return existing.some((item) => {
        const b = normalizeMemoryText(item);
        if (!b) {
            return false;
        }
        return a === b || a.includes(b) || b.includes(a);
    });
}
function stripPrefix(text) {
    return text.replace(/^\s*(?:\d+[\.、)]\s*|[-*]\s+)/, "").trim();
}
function hitsReject(text) {
    const lower = text.toLowerCase();
    if (REJECT.some((item) => lower.includes(item))) {
        return true;
    }
    if (["气温", "预报", "新闻联播", "联播"].some((item) => text.includes(item))) {
        return true;
    }
    if (text.includes("天气") && WEATHER_HINT.some((item) => text.includes(item))) {
        return true;
    }
    if ((text.includes("家在") || text.includes("住在")) &&
        ADDRESS_HINT.some((item) => text.includes(item))) {
        return true;
    }
    return false;
}
function sanitizeFactText(raw) {
    const text = stripPrefix(raw).replace(/\s+/g, " ").trim();
    if (text.length < exports.MEMORY_FACT_MIN || text.length > exports.MEMORY_FACT_MAX) {
        return null;
    }
    if (hitsReject(text)) {
        return null;
    }
    return text;
}
function isKind(value) {
    return (value === "identity" ||
        value === "preference" ||
        value === "habit" ||
        value === "agreement" ||
        value === "other");
}
function parseJsonObject(raw) {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) {
        return null;
    }
    try {
        const parsed = JSON.parse(raw.slice(start, end + 1));
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
            return null;
        }
        return parsed;
    }
    catch {
        return null;
    }
}
function parseOpsJson(raw) {
    const parsed = parseJsonObject(raw);
    if (!parsed) {
        return [];
    }
    const opsRaw = parsed.ops;
    const factsRaw = parsed.facts;
    const items = Array.isArray(opsRaw)
        ? opsRaw
        : Array.isArray(factsRaw)
            ? factsRaw
            : [];
    const ops = [];
    for (const item of items) {
        if (ops.length >= exports.MEMORY_EXTRACT_MAX) {
            break;
        }
        if (typeof item === "string") {
            const text = sanitizeFactText(item);
            if (text) {
                ops.push({ action: "upsert", kind: "other", topic: "", text });
            }
            continue;
        }
        if (typeof item !== "object" || item === null) {
            continue;
        }
        const rec = item;
        const action = rec.action === "retract" ? "retract" : "upsert";
        const kind = isKind(rec.kind) ? rec.kind : "other";
        const textRaw = typeof rec.text === "string" ? rec.text : "";
        const text = sanitizeFactText(textRaw);
        if (!text) {
            continue;
        }
        ops.push({ action, kind, topic: normalizeTopic(rec.topic), text });
    }
    return ops;
}
function filterFacts(rawFacts, existing) {
    const kept = [];
    const seen = [...existing];
    for (const raw of rawFacts) {
        if (kept.length >= 2) {
            break;
        }
        const text = sanitizeFactText(raw);
        if (!text || isDuplicateFact(text, seen)) {
            continue;
        }
        kept.push(text);
        seen.push(text);
    }
    return kept;
}
function buildExtractUserContent(userText, assistantText, existing) {
    const listed = existing
        .slice(0, 12)
        .map((item, index) => {
        const tag = [item.kind, item.topic].filter(Boolean).join("/");
        return tag ? `${index + 1}. [${tag}] ${item.text}` : `${index + 1}. ${item.text}`;
    })
        .join("\n");
    return `已有记忆：\n${listed || "（无）"}\n\n老师：${userText.trim()}\n星奈：${assistantText.trim()}`;
}
async function extractLongTermOps(input) {
    if (!shouldExtract(input.userText) || !input.assistantText.trim()) {
        return [];
    }
    let raw = "";
    try {
        raw = await input.completeChat([
            { role: "system", content: exports.MEMORY_EXTRACT_PROMPT },
            {
                role: "user",
                content: buildExtractUserContent(input.userText, input.assistantText, input.existing)
            }
        ]);
    }
    catch {
        return [];
    }
    return parseOpsJson(raw);
}
