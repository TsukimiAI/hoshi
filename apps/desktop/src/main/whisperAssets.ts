import { app } from "electron";
import { join } from "node:path";
import { ensureWhisperModel } from "@hoshi/agent";
import type { VoiceSettings } from "@hoshi/shared";

const MODEL_NAME = "ggml-small.bin";

export function bundledWhisperBin(): string {
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  if (app.isPackaged) {
    return join(process.resourcesPath, "whisper", "whisper-cli");
  }
  return join(__dirname, `../../vendor/whisper/${arch}/whisper-cli`);
}

export function defaultWhisperModelPath(): string {
  return join(app.getPath("userData"), "whisper", MODEL_NAME);
}

export function resolveWhisperVoice(voice: VoiceSettings): VoiceSettings {
  return {
    ...voice,
    whisperBin: voice.whisperBin.trim() || bundledWhisperBin(),
    whisperModelPath: voice.whisperModelPath.trim() || defaultWhisperModelPath()
  };
}

export async function downloadWhisperModel(): Promise<string> {
  const dest = defaultWhisperModelPath();
  await ensureWhisperModel(dest);
  return dest;
}
