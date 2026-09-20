"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhisperAsrClient = void 0;
exports.ensureWhisperModel = ensureWhisperModel;
exports.transcribeWithWhisper = transcribeWithWhisper;
exports.transcribePcm16WithWhisper = transcribePcm16WithWhisper;
const node_fs_1 = require("node:fs");
const node_child_process_1 = require("node:child_process");
const promises_1 = require("node:fs/promises");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const promises_2 = require("node:stream/promises");
const node_stream_1 = require("node:stream");
const wav_1 = require("../audio/wav");
const MODEL_URL = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin";
const MIN_MODEL_BYTES = 80_000_000;
function modelReady(path) {
    return (0, node_fs_1.existsSync)(path) && (0, node_fs_1.statSync)(path).size >= MIN_MODEL_BYTES;
}
async function ensureWhisperModel(dest) {
    if (modelReady(dest)) {
        return;
    }
    (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(dest), { recursive: true });
    const tmp = `${dest}.part`;
    let last = "";
    for (let i = 0; i < 3; i += 1) {
        try {
            if ((0, node_fs_1.existsSync)(tmp)) {
                (0, node_fs_1.unlinkSync)(tmp);
            }
            if ((0, node_fs_1.existsSync)(dest) && !modelReady(dest)) {
                (0, node_fs_1.unlinkSync)(dest);
            }
            const res = await fetch(MODEL_URL, { redirect: "follow" });
            if (!res.ok || !res.body) {
                throw new Error(`模型下载失败 ${res.status}`);
            }
            await (0, promises_2.pipeline)(node_stream_1.Readable.fromWeb(res.body), (0, node_fs_1.createWriteStream)(tmp));
            if (!(0, node_fs_1.existsSync)(tmp) || (0, node_fs_1.statSync)(tmp).size < MIN_MODEL_BYTES) {
                throw new Error("模型下载不完整");
            }
            await (0, promises_1.rename)(tmp, dest);
            return;
        }
        catch (error) {
            last = error instanceof Error ? error.message : "模型下载失败";
        }
    }
    throw new Error(last || "模型下载失败");
}
function pcmRmsInt16(pcm) {
    if (pcm.length < 2) {
        return 0;
    }
    const n = Math.floor(pcm.length / 2);
    let sum = 0;
    for (let i = 0; i < n; i += 1) {
        const v = pcm.readInt16LE(i * 2) / 32768;
        sum += v * v;
    }
    return Math.sqrt(sum / n);
}
async function transcribeWithWhisper(voice, wav, signal) {
    const bin = voice.whisperBin.trim();
    const model = voice.whisperModelPath.trim();
    if (!bin || !(0, node_fs_1.existsSync)(bin)) {
        throw new Error("请先获取 Whisper 程序");
    }
    if (!model || !modelReady(model)) {
        throw new Error("请先下载 Whisper 模型");
    }
    const dir = await (0, promises_1.mkdtemp)((0, node_path_1.join)((0, node_os_1.tmpdir)(), "hoshi-whisper-"));
    const wavPath = (0, node_path_1.join)(dir, "in.wav");
    const outBase = (0, node_path_1.join)(dir, "out");
    await (0, promises_1.writeFile)(wavPath, wav);
    const libDir = (0, node_path_1.dirname)(bin);
    try {
        await new Promise((resolve, reject) => {
            const child = (0, node_child_process_1.spawn)(bin, ["-m", model, "-f", wavPath, "-l", "zh", "-nt", "-np", "-otxt", "-of", outBase], {
                stdio: ["ignore", "pipe", "pipe"],
                env: {
                    ...process.env,
                    DYLD_LIBRARY_PATH: [libDir, process.env.DYLD_LIBRARY_PATH ?? ""]
                        .filter(Boolean)
                        .join(":"),
                    LD_LIBRARY_PATH: [libDir, process.env.LD_LIBRARY_PATH ?? ""].filter(Boolean).join(":")
                }
            });
            const onAbort = () => {
                child.kill("SIGKILL");
            };
            signal?.addEventListener("abort", onAbort, { once: true });
            const timer = setTimeout(() => {
                child.kill("SIGKILL");
                reject(new Error("whisper timeout"));
            }, 60000);
            child.on("error", (error) => {
                clearTimeout(timer);
                signal?.removeEventListener("abort", onAbort);
                reject(error);
            });
            child.on("close", (code) => {
                clearTimeout(timer);
                signal?.removeEventListener("abort", onAbort);
                if (signal?.aborted) {
                    reject(new Error("whisper aborted"));
                    return;
                }
                if (code !== 0) {
                    reject(new Error(`whisper exit ${code ?? "null"}`));
                    return;
                }
                resolve();
            });
        });
        const raw = await (0, promises_1.readFile)(`${outBase}.txt`, "utf8").catch(async () => {
            return (0, promises_1.readFile)(`${outBase}.wav.txt`, "utf8").catch(() => "");
        });
        return raw.replace(/\s+/g, " ").trim();
    }
    finally {
        await (0, promises_1.rm)(dir, { recursive: true, force: true });
    }
}
async function transcribePcm16WithWhisper(voice, pcm, signal) {
    const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2));
    const wav = (0, wav_1.encodePcm16MonoWav)(samples, 16000);
    return transcribeWithWhisper(voice, wav, signal);
}
class WhisperAsrClient {
    voice;
    onPartial;
    onFinal;
    chunks = [];
    speaking = false;
    silenceMs = 0;
    speechMs = 0;
    busy = false;
    closed = false;
    constructor(voice, onPartial, onFinal) {
        this.voice = voice;
        this.onPartial = onPartial;
        this.onFinal = onFinal;
    }
    async start() {
        const bin = this.voice.whisperBin.trim();
        const model = this.voice.whisperModelPath.trim();
        if (!bin || !(0, node_fs_1.existsSync)(bin)) {
            throw new Error("请先获取 Whisper 程序");
        }
        if (!model || !modelReady(model)) {
            throw new Error("请先下载 Whisper 模型");
        }
    }
    sendPcm(pcm) {
        if (this.closed || this.busy || pcm.length < 2) {
            return;
        }
        const frameMs = (Math.floor(pcm.length / 2) / 16000) * 1000;
        const loud = pcmRmsInt16(pcm) >= 0.02;
        if (loud) {
            this.speaking = true;
            this.silenceMs = 0;
            this.speechMs += frameMs;
            this.chunks.push(pcm);
            if (this.speechMs >= 18000) {
                void this.flush();
            }
            return;
        }
        if (!this.speaking) {
            return;
        }
        this.silenceMs += frameMs;
        this.chunks.push(pcm);
        if (this.silenceMs >= 400 && this.speechMs >= 400) {
            void this.flush();
        }
    }
    async flush() {
        if (this.busy || this.closed) {
            return;
        }
        const pcm = Buffer.concat(this.chunks);
        this.chunks = [];
        this.speaking = false;
        this.silenceMs = 0;
        this.speechMs = 0;
        if (pcm.length < 16000 * 2 * 0.4) {
            return;
        }
        this.busy = true;
        this.onPartial("…");
        try {
            const text = await transcribePcm16WithWhisper(this.voice, pcm);
            if (!this.closed && text) {
                this.onFinal(text);
            }
        }
        catch {
            // ignore one-shot fail
        }
        finally {
            this.busy = false;
        }
    }
    close() {
        this.closed = true;
        this.chunks = [];
    }
}
exports.WhisperAsrClient = WhisperAsrClient;
