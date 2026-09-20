"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GptSovitsEngine = void 0;
exports.assertLocalGsvUrl = assertLocalGsvUrl;
exports.applyGsvWeights = applyGsvWeights;
exports.pcmFromWav = pcmFromWav;
function assertLocalGsvUrl(baseUrl) {
    let parsed;
    try {
        parsed = new URL(baseUrl.trim());
    }
    catch {
        throw new Error("gsv url invalid");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("gsv url invalid");
    }
    if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
        throw new Error("gsv url must be localhost");
    }
    const path = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/, "");
    return `${parsed.protocol}//${parsed.host}${path}`;
}
async function postJson(url, body, signal) {
    return fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal
    });
}
async function setWeight(base, route, path, jsonBody) {
    try {
        const res = await postJson(`${base}${route}`, jsonBody);
        if (res.ok) {
            return;
        }
    }
    catch {
        // try GET
    }
    const res = await fetch(`${base}${route}?weights_path=${encodeURIComponent(path)}`);
    if (!res.ok) {
        throw new Error(`${route} ${res.status}`);
    }
}
async function applyGsvWeights(voice) {
    const base = assertLocalGsvUrl(voice.gsvBaseUrl);
    const gpt = voice.gsvGptWeights.trim();
    const sovits = voice.gsvSovitsWeights.trim();
    if (gpt) {
        await setWeight(base, "/set_gpt_weights", gpt, { gpt_path: gpt, weights_path: gpt });
    }
    if (sovits) {
        await setWeight(base, "/set_sovits_weights", sovits, {
            sovits_path: sovits,
            weights_path: sovits
        });
    }
}
function pcmFromWav(buf) {
    if (buf.length < 12 || buf.toString("ascii", 0, 4) !== "RIFF") {
        return null;
    }
    let offset = 12;
    let rate = 0;
    let pcm = null;
    while (offset + 8 <= buf.length) {
        const id = buf.toString("ascii", offset, offset + 4);
        const size = buf.readUInt32LE(offset + 4);
        const dataStart = offset + 8;
        if (id === "fmt " && size >= 16 && dataStart + 16 <= buf.length) {
            rate = buf.readUInt32LE(dataStart + 4);
        }
        else if (id === "data") {
            const end = size > 0 ? Math.min(buf.length, dataStart + size) : buf.length;
            pcm = buf.subarray(dataStart, end);
            break;
        }
        offset = dataStart + size + (size % 2);
    }
    if (!rate || !pcm) {
        return null;
    }
    return { rate, pcm };
}
function looksJson(res, buf) {
    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    if (ct.includes("json")) {
        return true;
    }
    if (buf && buf.length > 0 && buf[0] === 0x7b) {
        return true;
    }
    return false;
}
class GptSovitsEngine {
    voice;
    onPcm;
    onDone;
    onRate;
    rate = 32000;
    abort = null;
    cancelled = false;
    constructor(voice, onPcm, onDone, onRate) {
        this.voice = voice;
        this.onPcm = onPcm;
        this.onDone = onDone;
        this.onRate = onRate;
    }
    sampleRate() {
        return this.rate;
    }
    async start() {
        this.cancelled = false;
        this.onRate(this.rate);
    }
    emitRate(rate) {
        if (rate > 0 && rate !== this.rate) {
            this.rate = rate;
            this.onRate(rate);
        }
    }
    emitPcm(pcm) {
        if (pcm.length >= 2) {
            this.onPcm(Buffer.from(pcm.subarray(0, pcm.length - (pcm.length % 2))));
        }
    }
    async speak(text, signal) {
        const trimmed = text.trim();
        if (!trimmed || this.cancelled) {
            return;
        }
        const ref = this.voice.gsvRefAudioPath.trim();
        if (!ref) {
            throw new Error("gsvRefAudioPath required");
        }
        this.abort?.abort();
        this.abort = new AbortController();
        if (signal) {
            if (signal.aborted) {
                return;
            }
            signal.addEventListener("abort", () => this.abort?.abort(), { once: true });
        }
        const linked = this.abort.signal;
        const base = assertLocalGsvUrl(this.voice.gsvBaseUrl);
        const url = `${base}/tts`;
        const common = {
            text: trimmed,
            text_lang: "zh",
            ref_audio_path: ref,
            prompt_text: this.voice.gsvPromptText,
            prompt_lang: this.voice.gsvPromptLang || "zh"
        };
        const attempts = [
            { streaming_mode: 2, media_type: "raw" },
            { streaming_mode: true, media_type: "raw" },
            { streaming_mode: 0, media_type: "wav" }
        ];
        let lastError = null;
        for (const attempt of attempts) {
            if (this.cancelled || signal?.aborted) {
                return;
            }
            try {
                const res = await postJson(url, { ...common, ...attempt }, linked);
                if (!res.ok || !res.body) {
                    lastError = new Error(`gsv tts ${res.status}`);
                    continue;
                }
                if (attempt.media_type === "wav" && attempt.streaming_mode === 0) {
                    const buf = Buffer.from(await res.arrayBuffer());
                    if (looksJson(res, buf)) {
                        lastError = new Error("gsv tts json");
                        continue;
                    }
                    const wav = pcmFromWav(buf);
                    if (wav) {
                        this.emitRate(wav.rate);
                        this.emitPcm(wav.pcm);
                    }
                    else {
                        this.emitPcm(buf);
                    }
                    return;
                }
                await this.readStream(res, linked);
                return;
            }
            catch (error) {
                if (this.cancelled || signal?.aborted) {
                    return;
                }
                lastError = error instanceof Error ? error : new Error("gsv tts failed");
            }
        }
        if (lastError) {
            throw lastError;
        }
    }
    async readStream(res, signal) {
        const reader = res.body.getReader();
        let leftover = Buffer.alloc(0);
        let sawHeader = false;
        for (;;) {
            if (signal.aborted) {
                await reader.cancel();
                return;
            }
            const next = await reader.read();
            if (next.done) {
                break;
            }
            leftover = Buffer.concat([leftover, Buffer.from(next.value)]);
            if (!sawHeader) {
                if (leftover.length === 0) {
                    continue;
                }
                if (looksJson(res, leftover)) {
                    throw new Error("gsv tts json");
                }
                if (leftover.toString("ascii", 0, 4) === "RIFF") {
                    if (leftover.length < 44) {
                        continue;
                    }
                    const wav = pcmFromWav(leftover);
                    if (!wav) {
                        throw new Error("gsv wav");
                    }
                    this.emitRate(wav.rate);
                    leftover = Buffer.from(wav.pcm);
                }
                sawHeader = true;
            }
            const even = leftover.length - (leftover.length % 2);
            if (even > 0) {
                this.emitPcm(leftover.subarray(0, even));
                leftover = Buffer.from(leftover.subarray(even));
            }
        }
        this.emitPcm(leftover);
    }
    async finish() {
        this.onDone();
    }
    cancel() {
        this.cancelled = true;
        this.abort?.abort();
        this.abort = null;
    }
}
exports.GptSovitsEngine = GptSovitsEngine;
