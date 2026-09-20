"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bundledWhisperBin = bundledWhisperBin;
exports.defaultWhisperModelPath = defaultWhisperModelPath;
exports.resolveWhisperVoice = resolveWhisperVoice;
exports.downloadWhisperModel = downloadWhisperModel;
const electron_1 = require("electron");
const node_path_1 = require("node:path");
const agent_1 = require("@hoshi/agent");
const MODEL_NAME = "ggml-small.bin";
function bundledWhisperBin() {
    const arch = process.arch === "arm64" ? "arm64" : "x64";
    if (electron_1.app.isPackaged) {
        return (0, node_path_1.join)(process.resourcesPath, "whisper", "whisper-cli");
    }
    return (0, node_path_1.join)(__dirname, `../../vendor/whisper/${arch}/whisper-cli`);
}
function defaultWhisperModelPath() {
    return (0, node_path_1.join)(electron_1.app.getPath("userData"), "whisper", MODEL_NAME);
}
function resolveWhisperVoice(voice) {
    return {
        ...voice,
        whisperBin: voice.whisperBin.trim() || bundledWhisperBin(),
        whisperModelPath: voice.whisperModelPath.trim() || defaultWhisperModelPath()
    };
}
async function downloadWhisperModel() {
    const dest = defaultWhisperModelPath();
    await (0, agent_1.ensureWhisperModel)(dest);
    return dest;
}
