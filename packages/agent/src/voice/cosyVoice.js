"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CosyVoiceClient = void 0;
const node_crypto_1 = require("node:crypto");
const ws_1 = __importDefault(require("ws"));
const dashscopeWs_1 = require("./dashscopeWs");
const TTS_SAMPLE_RATE = 22050;
class CosyVoiceClient {
    apiKey;
    httpBaseUrl;
    model;
    voice;
    onPcm;
    onDone;
    ws = null;
    taskId = "";
    started = false;
    constructor(apiKey, httpBaseUrl, model, voice, onPcm, onDone) {
        this.apiKey = apiKey;
        this.httpBaseUrl = httpBaseUrl;
        this.model = model;
        this.voice = voice;
        this.onPcm = onPcm;
        this.onDone = onDone;
    }
    sampleRate() {
        return TTS_SAMPLE_RATE;
    }
    async start() {
        this.close();
        this.taskId = (0, node_crypto_1.randomUUID)();
        this.ws = (0, dashscopeWs_1.openDashscopeWs)(this.apiKey, this.httpBaseUrl);
        await (0, dashscopeWs_1.waitOpen)(this.ws);
        const started = new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error("cosyvoice task-started timeout")), 8000);
            this.ws.on("message", (raw, isBinary) => {
                const buf = Buffer.isBuffer(raw)
                    ? raw
                    : Array.isArray(raw)
                        ? Buffer.concat(raw)
                        : Buffer.from(raw);
                if (isBinary || (buf.length > 0 && buf[0] !== 0x7b && buf[0] !== 0x5b)) {
                    if (buf.length >= 2) {
                        this.onPcm(Buffer.from(buf));
                    }
                    return;
                }
                const parsed = (0, dashscopeWs_1.parseDashscopeEvent)(buf);
                if (!parsed) {
                    if (buf.length >= 2) {
                        this.onPcm(Buffer.from(buf));
                    }
                    return;
                }
                if (parsed?.event === "task-started") {
                    this.started = true;
                    clearTimeout(timer);
                    resolve();
                    return;
                }
                if (parsed?.event === "task-failed") {
                    const detail = parsed.errorMessage ? `cosyvoice ${parsed.errorMessage}` : "cosyvoice task-failed";
                    console.error(JSON.stringify({
                        src: "hoshi.voice",
                        phase: "cosy_failed",
                        detail,
                        model: this.model,
                        voice: this.voice
                    }));
                    if (!this.started) {
                        clearTimeout(timer);
                        reject(new Error(detail));
                        return;
                    }
                    this.close();
                    this.onDone();
                    return;
                }
                if (parsed?.event === "task-finished") {
                    this.onDone();
                }
            });
        });
        this.ws.send(JSON.stringify({
            header: {
                action: "run-task",
                task_id: this.taskId,
                streaming: "duplex"
            },
            payload: {
                task_group: "audio",
                task: "tts",
                function: "SpeechSynthesizer",
                model: this.model,
                parameters: {
                    text_type: "PlainText",
                    voice: this.voice,
                    format: "pcm",
                    sample_rate: TTS_SAMPLE_RATE
                },
                input: {}
            }
        }));
        await started;
    }
    speak(text) {
        if (!this.ws || this.ws.readyState !== ws_1.default.OPEN || !this.started || !text.trim()) {
            return;
        }
        this.ws.send(JSON.stringify({
            header: {
                action: "continue-task",
                task_id: this.taskId,
                streaming: "duplex"
            },
            payload: { input: { text } }
        }));
    }
    finish() {
        if (!this.ws || this.ws.readyState !== ws_1.default.OPEN || !this.taskId) {
            return;
        }
        this.ws.send(JSON.stringify({
            header: {
                action: "finish-task",
                task_id: this.taskId,
                streaming: "duplex"
            },
            payload: { input: {} }
        }));
    }
    cancel() {
        if (!this.ws || this.ws.readyState !== ws_1.default.OPEN || !this.taskId) {
            this.close();
            return;
        }
        try {
            this.ws.send(JSON.stringify({
                header: {
                    action: "finish-task",
                    task_id: this.taskId,
                    streaming: "duplex"
                },
                payload: { input: { directive: "cancel" } }
            }));
        }
        catch {
            // ignore
        }
        this.close();
    }
    close() {
        this.ws?.close();
        this.ws = null;
        this.started = false;
        this.taskId = "";
    }
}
exports.CosyVoiceClient = CosyVoiceClient;
