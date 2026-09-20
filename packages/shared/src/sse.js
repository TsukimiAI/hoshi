"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseUsage = parseUsage;
exports.addUsage = addUsage;
exports.formatLlmUsage = formatLlmUsage;
function asNonNegInt(value) {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
        return Math.floor(value);
    }
    if (typeof value === "string" && value.trim() !== "") {
        const n = Number(value);
        if (Number.isFinite(n) && n >= 0) {
            return Math.floor(n);
        }
    }
    return undefined;
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function parseUsage(raw) {
    if (!isRecord(raw)) {
        return undefined;
    }
    const prompt = asNonNegInt(raw.prompt_tokens) ?? asNonNegInt(raw.input_tokens);
    const completion = asNonNegInt(raw.completion_tokens) ?? asNonNegInt(raw.output_tokens);
    const details = isRecord(raw.prompt_tokens_details)
        ? raw.prompt_tokens_details
        : isRecord(raw.input_tokens_details)
            ? raw.input_tokens_details
            : undefined;
    const cached = (details ? asNonNegInt(details.cached_tokens) : undefined) ??
        asNonNegInt(raw.cached_tokens) ??
        asNonNegInt(raw.prompt_cache_hit_tokens);
    const total = asNonNegInt(raw.total_tokens);
    if (prompt === undefined && completion === undefined && cached === undefined && total === undefined) {
        return undefined;
    }
    const promptTokens = prompt ?? 0;
    const completionTokens = completion ?? 0;
    return {
        promptTokens,
        completionTokens,
        totalTokens: total ?? promptTokens + completionTokens,
        cachedTokens: cached ?? 0
    };
}
function addUsage(a, b) {
    if (!a) {
        return b;
    }
    if (!b) {
        return a;
    }
    return {
        promptTokens: a.promptTokens + b.promptTokens,
        completionTokens: a.completionTokens + b.completionTokens,
        totalTokens: a.totalTokens + b.totalTokens,
        cachedTokens: a.cachedTokens + b.cachedTokens
    };
}
function formatLlmUsage(usage) {
    const base = `↑${usage.promptTokens} ↓${usage.completionTokens}`;
    return usage.cachedTokens > 0 ? `${base} cache ${usage.cachedTokens}` : base;
}
