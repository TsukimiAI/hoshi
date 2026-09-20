"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FunAsrClient = void 0;
const node_crypto_1 = require("node:crypto");
const ws_1 = __importDefault(require("ws"));
const dashscopeWs_1 = require("./dashscopeWs");
class FunAsrClient {
    apiKey;
    httpBaseUrl;
    onPartial;
    onFinal;
    hotwords;
    vocabularyId;
    onUsage;
    ws = null;
    taskId = "";
    started = false;
    lastUsage;
    usageEmitted = false;
    constructor(apiKey, httpBaseUrl, onPartial, onFinal, hotwords, vocabularyId, onUsage) {
        this.apiKey = apiKey;
        this.httpBaseUrl = httpBaseUrl;
        this.onPartial = onPartial;
        this.onFinal = onFinal;
        this.hotwords = hotwords;
        this.vocabularyId = vocabularyId;
        this.onUsage = onUsage;
    }
    async start() {
        this.lastUsage = undefined;
        this.usageEmitted = false;
        this.taskId = (0, node_crypto_1.randomUUID)();
        this.ws = (0, dashscopeWs_1.openDashscopeWs)(this.apiKey, this.httpBaseUrl);
        await (0, dashscopeWs_1.waitOpen)(this.ws);
        const vocab = this.vocabularyId.trim();
        let retried = false;
        const started = new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error("fun-asr task-started timeout")), 12000);
            this.ws.on("message", (raw, isBinary) => {
                if (isBinary) {
                    return;
                }
                const parsed = (0, dashscopeWs_1.parseDashscopeEvent)(raw);
                if (!parsed) {
                    return;
                }
                if (parsed.usage) {
                    this.lastUsage = parsed.usage;
                }
                if (parsed.event === "task-finished") {
                    this.emitUsageOnce();
                }
                if (parsed.event === "task-started") {
                    this.started = true;
                    clearTimeout(timer);
                    resolve();
                    return;
                }
                if (parsed.event === "result-generated" && parsed.sentenceText) {
                    const text = parsed.sentenceText.trim();
                    if (!text) {
                        return;
                    }
                    if (parsed.sentenceEnd) {
                        this.onFinal(text);
                    }
                    else {
                        this.onPartial(text);
                    }
                }
                if (parsed.event === "task-failed") {
                    if (!this.started && vocab && !retried) {
                        retried = true;
                        this.taskId = (0, node_crypto_1.randomUUID)();
                        this.sendRunTask("");
                        return;
                    }
                    clearTimeout(timer);
                    reject(new Error("fun-asr task-failed"));
                }
            });
        });
        this.sendRunTask(vocab);
        await started;
    }
    hotwordContext() {
        const words = this.hotwords
            .split(/[,，\s]+/)
            .map((item) => item.trim())
            .filter(Boolean);
        if (words.length === 0) {
            return {};
        }
        return {
            context: [
                {
                    role: "user",
                    content: [{ type: "input_text", text: words.join("、") }]
                }
            ]
        };
    }
    sendRunTask(vocabularyId) {
        if (!this.ws || this.ws.readyState !== ws_1.default.OPEN) {
            return;
        }
        this.ws.send(JSON.stringify({
            header: {
                action: "run-task",
                task_id: this.taskId,
                streaming: "duplex"
            },
            payload: {
                task_group: "audio",
                task: "asr",
                function: "recognition",
                model: "fun-asr-realtime",
                parameters: {
                    sample_rate: 16000,
                    format: "pcm",
                    heartbeat: true,
                    max_sentence_silence: 1000,
                    language_hints: ["zh"],
                    ...(vocabularyId ? { vocabulary_id: vocabularyId } : {})
                },
                input: this.hotwordContext()
            }
        }));
    }
    sendPcm(pcm) {
        if (!this.ws || this.ws.readyState !== ws_1.default.OPEN || !this.started) {
            return;
        }
        this.ws.send(pcm);
    }
    emitUsageOnce() {
        if (this.usageEmitted || !this.lastUsage) {
            return;
        }
        this.usageEmitted = true;
        this.onUsage?.(this.lastUsage);
    }
    close() {
        this.emitUsageOnce();
        if (this.ws && this.ws.readyState === ws_1.default.OPEN && this.taskId) {
            try {
                this.ws.send(JSON.stringify({
                    header: {
                        action: "finish-task",
                        task_id: this.taskId,
                        streaming: "duplex"
                    },
                    payload: { input: {} }
                }));
            }
            catch {
                // ignore
            }
        }
        this.ws?.close();
        this.ws = null;
        this.started = false;
    }
}
exports.FunAsrClient = FunAsrClient;
