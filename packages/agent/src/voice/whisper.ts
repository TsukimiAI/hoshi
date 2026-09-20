import { createWriteStream, existsSync, mkdirSync, statSync, unlinkSync } from "node:fs";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import type { VoiceSettings } from "@hoshi/shared";
import { encodePcm16MonoWav } from "../audio/wav";

const MODEL_URL = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin";
const MIN_MODEL_BYTES = 80_000_000;

function modelReady(path: string): boolean {
  return existsSync(path) && statSync(path).size >= MIN_MODEL_BYTES;
}

export async function ensureWhisperModel(dest: string): Promise<void> {
  if (modelReady(dest)) {
    return;
  }
  mkdirSync(dirname(dest), { recursive: true });
  const tmp = `${dest}.part`;
  let last = "";
  for (let i = 0; i < 3; i += 1) {
    try {
      if (existsSync(tmp)) {
        unlinkSync(tmp);
      }
      if (existsSync(dest) && !modelReady(dest)) {
        unlinkSync(dest);
      }
      const res = await fetch(MODEL_URL, { redirect: "follow" });
      if (!res.ok || !res.body) {
        throw new Error(`模型下载失败 ${res.status}`);
      }
      await pipeline(Readable.fromWeb(res.body as never), createWriteStream(tmp));
      if (!existsSync(tmp) || statSync(tmp).size < MIN_MODEL_BYTES) {
        throw new Error("模型下载不完整");
      }
      await rename(tmp, dest);
      return;
    } catch (error) {
      last = error instanceof Error ? error.message : "模型下载失败";
    }
  }
  throw new Error(last || "模型下载失败");
}

function pcmRmsInt16(pcm: Buffer): number {
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

export async function transcribeWithWhisper(
  voice: VoiceSettings,
  wav: Uint8Array,
  signal?: AbortSignal
): Promise<string> {
  const bin = voice.whisperBin.trim();
  const model = voice.whisperModelPath.trim();
  if (!bin || !existsSync(bin)) {
    throw new Error("请先获取 Whisper 程序");
  }
  if (!model || !modelReady(model)) {
    throw new Error("请先下载 Whisper 模型");
  }
  const dir = await mkdtemp(join(tmpdir(), "hoshi-whisper-"));
  const wavPath = join(dir, "in.wav");
  const outBase = join(dir, "out");
  await writeFile(wavPath, wav);
  const libDir = dirname(bin);
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        bin,
        ["-m", model, "-f", wavPath, "-l", "zh", "-nt", "-np", "-otxt", "-of", outBase],
        {
          stdio: ["ignore", "pipe", "pipe"],
          env: {
            ...process.env,
            DYLD_LIBRARY_PATH: [libDir, process.env.DYLD_LIBRARY_PATH ?? ""]
              .filter(Boolean)
              .join(":"),
            LD_LIBRARY_PATH: [libDir, process.env.LD_LIBRARY_PATH ?? ""].filter(Boolean).join(":")
          }
        }
      );
      const onAbort = (): void => {
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
    const raw = await readFile(`${outBase}.txt`, "utf8").catch(async () => {
      return readFile(`${outBase}.wav.txt`, "utf8").catch(() => "");
    });
    return raw.replace(/\s+/g, " ").trim();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function transcribePcm16WithWhisper(
  voice: VoiceSettings,
  pcm: Buffer,
  signal?: AbortSignal
): Promise<string> {
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2));
  const wav = encodePcm16MonoWav(samples, 16000);
  return transcribeWithWhisper(voice, wav, signal);
}

export class WhisperAsrClient {
  private chunks: Buffer[] = [];
  private speaking = false;
  private silenceMs = 0;
  private speechMs = 0;
  private busy = false;
  private closed = false;

  constructor(
    private readonly voice: VoiceSettings,
    private readonly onPartial: (text: string) => void,
    private readonly onFinal: (text: string) => void
  ) {}

  async start(): Promise<void> {
    const bin = this.voice.whisperBin.trim();
    const model = this.voice.whisperModelPath.trim();
    if (!bin || !existsSync(bin)) {
      throw new Error("请先获取 Whisper 程序");
    }
    if (!model || !modelReady(model)) {
      throw new Error("请先下载 Whisper 模型");
    }
  }

  sendPcm(pcm: Buffer): void {
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

  private async flush(): Promise<void> {
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
    } catch {
      // ignore one-shot fail
    } finally {
      this.busy = false;
    }
  }

  close(): void {
    this.closed = true;
    this.chunks = [];
  }
}
