import { existsSync, rmSync, statSync } from "node:fs";
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

function modelFileReady(path: string): boolean {
  return existsSync(path) && statSync(path).size >= 80_000_000;
}

export function whisperCacheState(): { ready: boolean; partialBytes: number; residualBytes: number } {
  const dest = defaultWhisperModelPath();
  const part = `${dest}.part`;
  const ready = modelFileReady(dest);
  let partialBytes = 0;
  if (existsSync(part)) {
    const stat = statSync(part);
    if (stat.isFile()) {
      partialBytes = stat.size;
    }
  }
  let residualBytes = 0;
  if (!ready && existsSync(dest)) {
    const stat = statSync(dest);
    if (stat.isFile()) {
      residualBytes = stat.size;
    }
  }
  return { ready, partialBytes, residualBytes };
}

export async function downloadWhisperModel(
  onProgress?: (loaded: number, total: number) => void,
  signal?: AbortSignal
): Promise<{ path: string; skipped: boolean }> {
  const dest = defaultWhisperModelPath();
  if (modelFileReady(dest)) {
    return { path: dest, skipped: true };
  }
  await ensureWhisperModel(dest, onProgress, signal);
  return { path: dest, skipped: false };
}

function removeModelFile(path: string): boolean {
  if (!path || !existsSync(path)) {
    return false;
  }
  if (!statSync(path).isFile()) {
    return false;
  }
  rmSync(path);
  return true;
}

export function deleteWhisperModelFiles(): number {
  const dest = defaultWhisperModelPath();
  let removed = 0;
  if (removeModelFile(dest)) {
    removed += 1;
  }
  if (removeModelFile(`${dest}.part`)) {
    removed += 1;
  }
  return removed;
}
