"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.inferenceWsUrl = inferenceWsUrl;
exports.openDashscopeWs = openDashscopeWs;
exports.waitOpen = waitOpen;
exports.parseDashscopeEvent = parseDashscopeEvent;
const ws_1 = __importDefault(require("ws"));
const shared_1 = require("@hoshi/shared");
function inferenceWsUrl(httpBaseUrl) {
    if (httpBaseUrl.includes("dashscope-intl")) {
        return "wss://dashscope-intl.aliyuncs.com/api-ws/v1/inference";
    }
    return "wss://dashscope.aliyuncs.com/api-ws/v1/inference";
}
function openDashscopeWs(apiKey, httpBaseUrl) {
    return new ws_1.default(inferenceWsUrl(httpBaseUrl), {
        headers: { Authorization: `Bearer ${apiKey}` }
    });
}
function waitOpen(ws, timeoutMs = 8000) {
    if (ws.readyState === ws_1.default.OPEN) {
        return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error("dashscope ws timeout"));
        }, timeoutMs);
        ws.once("open", () => {
            clearTimeout(timer);
            resolve();
        });
        ws.once("error", (error) => {
            clearTimeout(timer);
            reject(error);
        });
    });
}
function parseDashscopeEvent(raw) {
    const text = typeof raw === "string"
        ? raw
        : Buffer.isBuffer(raw)
            ? raw.toString("utf8")
            : Array.isArray(raw)
                ? Buffer.concat(raw).toString("utf8")
                : Buffer.from(raw).toString("utf8");
    try {
        const json = JSON.parse(text);
        const sentence = json.payload?.output?.sentence;
        const err = json.header?.error_message || json.header?.error_code;
        return {
            event: json.header?.event,
            taskId: json.header?.task_id,
            sentenceText: sentence?.text,
            sentenceEnd: sentence?.sentence_end === true,
            errorMessage: err,
            usage: (0, shared_1.parseUsage)(json.payload?.usage)
        };
    }
    catch {
        return null;
    }
}
