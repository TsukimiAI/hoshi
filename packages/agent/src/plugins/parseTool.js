"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseCompleteChatResponse = parseCompleteChatResponse;
exports.parseToolArgs = parseToolArgs;
const shared_1 = require("@hoshi/shared");
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function parseCompleteChatResponse(json) {
    const usage = isRecord(json) ? (0, shared_1.parseUsage)(json.usage) : undefined;
    if (!isRecord(json) || !Array.isArray(json.choices)) {
        return { content: "", toolCalls: [], ...(usage ? { usage } : {}) };
    }
    const choice = json.choices[0];
    if (!isRecord(choice) || !isRecord(choice.message)) {
        return { content: "", toolCalls: [], ...(usage ? { usage } : {}) };
    }
    const message = choice.message;
    const content = typeof message.content === "string" ? message.content : "";
    const toolCalls = [];
    if (Array.isArray(message.tool_calls)) {
        for (const item of message.tool_calls) {
            if (!isRecord(item) || !isRecord(item.function)) {
                continue;
            }
            const name = typeof item.function.name === "string" ? item.function.name : "";
            if (!name) {
                continue;
            }
            const id = typeof item.id === "string" && item.id ? item.id : `call_${toolCalls.length}`;
            const argumentsJson = typeof item.function.arguments === "string" ? item.function.arguments : "{}";
            toolCalls.push({ id, name, argumentsJson });
        }
    }
    return { content, toolCalls, ...(usage ? { usage } : {}) };
}
function parseToolArgs(argumentsJson) {
    try {
        const value = JSON.parse(argumentsJson);
        if (isRecord(value)) {
            return value;
        }
        return { value };
    }
    catch {
        return { raw: argumentsJson };
    }
}
