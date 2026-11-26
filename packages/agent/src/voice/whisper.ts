import { createWriteStream, existsSync, mkdirSync, statSync, unlinkSync } from "node:fs";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { once } from "node:events";
import { Readable } from "node:stream";
import type { VoiceSettings } from "@hoshi/shared";
import { encodePcm16MonoWav } from "../audio/wav";

const MODEL_URL = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin";
const MIN_MODEL_BYTES = 80_000_000;

function modelReady(path: string): boolean {
  return existsSync(path) && statSync(path).size >= MIN_MODEL_BYTES;
}

function stoppedError(error: unknown, signal?: AbortSignal): boolean {
  return Boolean(signal?.aborted || (error instanceof Error && error.name === "AbortError"));
}

function headerTotal(header: string | null): number | null {
  const match = /\/(\d+)\s*$/.exec(header ?? "");
  if (!match) {
    return null;
  }
  const total = Number(match[1]);
  return Number.isFinite(total) ? total : null;
}

function headerStart(header: string | null): number | null {
  const match = /bytes\s+(\d+)-/i.exec(header ?? "");
  if (!match) {
    return null;
  }
  const start = Number(match[1]);
  return Number.isFinite(start) ? start : null;
}

function partOffset(tmp: string): number {
  if (!existsSync(tmp)) {
    return 0;
  }
  const stat = statSync(tmp);
  return stat.isFile() ? stat.size : 0;
}

async function writeModelBody(
  dest: string,
  tmp: string,
  body: ReadableStream<Uint8Array>,
  offset: number,
  total: number,
  flags: "w" | "a",
  onProgress?: (loaded: number, total: number) => void,
  signal?: AbortSignal
): Promise<void> {
  const file = createWriteStream(tmp, { flags });
  let loaded = offset;
  onProgress?.(loaded, total);
  try {
    for await (const chunk of Readable.fromWeb(body as never)) {
      if (signal?.aborted) {
        throw new Error("已停止下载");
      }
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
      if (!file.write(buf)) {
        await once(file, "drain");
      }
      loaded += buf.length;
      onProgress?.(loaded, total);
    }
  } finally {
    await new Promise<void>((resolve) => file.end(() => resolve()));
  }
  if (signal?.aborted) {
    throw new Error("已停止下载");
  }
  const size = existsSync(tmp) ? statSync(tmp).size : 0;
  if (total >= MIN_MODEL_BYTES && size === total) {
    await rename(tmp, dest);
    return;
  }
  if (total > 0 && size === total) {
    throw new Error("模型下载不完整");
  }
  throw new Error("模型下载不完整");
}

export async function ensureWhisperModel(
  dest: string,
  onProgress?: (loaded: number, total: number) => void,
  signal?: AbortSignal
): Promise<void> {
  if (signal?.aborted) {
    throw new Error("已停止下载");
  }
  if (modelReady(dest)) {
    return;
  }
  mkdirSync(dirname(dest), { recursive: true });
  const tmp = `${dest}.part`;
  if (existsSync(dest) && !modelReady(dest)) {
    unlinkSync(dest);
  }
  const fullRestart = { used: false };
  let last = "";
  for (let i = 0; i < 3; i += 1) {
    try {
      await pullWhisperModel(dest, tmp, fullRestart, onProgress, signal);
      return;
    } catch (error) {
      if (stoppedError(error, signal)) {
        throw new Error("已停止下载");
      }
      last = error instanceof Error ? error.message : "模型下载失败";
    }
  }
  throw new Error(last || "模型下载失败");
}

async function pullWhisperModel(
  dest: string,
  tmp: string,
  fullRestart: { used: boolean },
  onProgress?: (loaded: number, total: number) => void,
  signal?: AbortSignal
): Promise<void> {
  if (signal?.aborted) {
    throw new Error("已停止下载");
  }
  const offset = partOffset(tmp);
  const headers: Record<string, string> = {};
  if (offset > 0) {
    headers.Range = `bytes=${offset}-`;
  }
  const res = await fetch(MODEL_URL, { headers, redirect: "follow", signal });
  if (res.status === 416 && offset > 0) {
    const total = headerTotal(res.headers.get("content-range"));
    await res.body?.cancel();
    if (total !== null && offset === total && total >= MIN_MODEL_BYTES) {
      await rename(tmp, dest);
      onProgress?.(total, total);
      return;
    }
    await rewriteWhisperModel(dest, tmp, fullRestart, onProgress, signal);
    return;
  }
  if (res.status === 206) {
    const total = headerTotal(res.headers.get("content-range"));
    const start = headerStart(res.headers.get("content-range"));
    if (total === null || start !== offset || !res.body) {
      await res.body?.cancel();
      await rewriteWhisperModel(dest, tmp, fullRestart, onProgress, signal);
      return;
    }
    await writeModelBody(dest, tmp, res.body, offset, total, "a", onProgress, signal);
    return;
  }
  if (res.status === 200 && offset > 0) {
    if (!res.body) {
      throw new Error("模型下载失败 200");
    }
    if (fullRestart.used) {
      await res.body.cancel();
      throw new Error("模型下载失败");
    }
    fullRestart.used = true;
    if (existsSync(tmp)) {
      unlinkSync(tmp);
    }
    const total = Number(res.headers.get("content-length")) || 0;
    await writeModelBody(dest, tmp, res.body, 0, total, "w", onProgress, signal);
    return;
  }
  if (!res.ok || !res.body) {
    throw new Error(`模型下载失败 ${res.status}`);
  }
  const total = Number(res.headers.get("content-length")) || 0;
  await writeModelBody(dest, tmp, res.body, 0, total, "w", onProgress, signal);
}

async function rewriteWhisperModel(
  dest: string,
  tmp: string,
  fullRestart: { used: boolean },
  onProgress?: (loaded: number, total: number) => void,
  signal?: AbortSignal
): Promise<void> {
  if (fullRestart.used) {
    throw new Error("模型下载失败");
  }
  fullRestart.used = true;
  if (existsSync(tmp)) {
    unlinkSync(tmp);
  }
  const res = await fetch(MODEL_URL, { redirect: "follow", signal });
  if (!res.ok || !res.body) {
    throw new Error(`模型下载失败 ${res.status}`);
  }
  const total = Number(res.headers.get("content-length")) || 0;
  await writeModelBody(dest, tmp, res.body, 0, total, "w", onProgress, signal);
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

const OVERFLOW_MAX_MS = 3000;

export class WhisperAsrClient {
  private chunks: Buffer[] = [];
  private overflow: Buffer[] = [];
  private overflowMs = 0;
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

  private pushOverflow(pcm: Buffer, frameMs: number): void {
    this.overflow.push(pcm);
    this.overflowMs += frameMs;
    while (this.overflowMs > OVERFLOW_MAX_MS && this.overflow.length > 0) {
      const dropped = this.overflow.shift();
      if (!dropped) {
        break;
      }
      this.overflowMs -= (Math.floor(dropped.length / 2) / 16000) * 1000;
    }
    if (this.overflowMs < 0) {
      this.overflowMs = 0;
    }
  }

  sendPcm(pcm: Buffer): void {
    if (this.closed || pcm.length < 2) {
      return;
    }
    const frameMs = (Math.floor(pcm.length / 2) / 16000) * 1000;
    if (this.busy) {
      this.pushOverflow(pcm, frameMs);
      return;
    }
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
      if (this.overflow.length > 0 && !this.closed) {
        this.chunks = this.overflow.concat(this.chunks);
        this.speechMs = this.overflowMs;
        this.speaking = this.speechMs > 0;
        this.overflow = [];
        this.overflowMs = 0;
        this.silenceMs = 0;
        if (this.speechMs >= 400) {
          void this.flush();
        }
      }
    }
  }

  close(): void {
    this.closed = true;
    this.chunks = [];
    this.overflow = [];
    this.overflowMs = 0;
  }
}
