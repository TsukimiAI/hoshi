"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTtsEngine = createTtsEngine;
const shared_1 = require("@hoshi/shared");
const cosyVoice_1 = require("./cosyVoice");
const gptSovits_1 = require("./gptSovits");
class DashscopeTtsEngine {
    client;
    constructor(apiKey, httpBaseUrl, model, voice, onPcm, onDone) {
        this.client = new cosyVoice_1.CosyVoiceClient(apiKey, httpBaseUrl, model, voice, onPcm, onDone);
    }
    sampleRate() {
        return this.client.sampleRate();
    }
    start() {
        return this.client.start();
    }
    async speak(text, signal) {
        if (signal?.aborted) {
            this.client.cancel();
            return;
        }
        const onAbort = () => {
            this.client.cancel();
        };
        signal?.addEventListener("abort", onAbort, { once: true });
        this.client.speak(text);
    }
    async finish() {
        this.client.finish();
    }
    cancel() {
        this.client.cancel();
    }
}
function createTtsEngine(voice, llm, onPcm, onDone, onRate) {
    if (voice.ttsBackend === "gpt-sovits") {
        return new gptSovits_1.GptSovitsEngine(voice, onPcm, onDone, onRate);
    }
    if (!llm.apiKey.trim()) {
        throw new Error("请填写百炼语音 Key");
    }
    const pair = (0, shared_1.resolveCosyVoicePair)(voice.ttsModel, voice.ttsVoice);
    return new DashscopeTtsEngine(llm.apiKey, llm.baseUrl, pair.model, pair.voice, onPcm, onDone);
}
