import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import { openDashscopeWs, parseDashscopeEvent, waitOpen } from "./dashscopeWs";

const TTS_SAMPLE_RATE = 22050;

export class CosyVoiceClient {
  private ws: WebSocket | null = null;
  private taskId = "";
  private started = false;

  constructor(
    private readonly apiKey: string,
    private readonly httpBaseUrl: string,
    private readonly model: string,
    private readonly voice: string,
    private readonly onPcm: (pcm: Buffer) => void,
    private readonly onDone: () => void
  ) {}

  sampleRate(): number {
    return TTS_SAMPLE_RATE;
  }

  async start(): Promise<void> {
    this.close();
    this.taskId = randomUUID();
    this.ws = openDashscopeWs(this.apiKey, this.httpBaseUrl);
    await waitOpen(this.ws);
    const started = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("cosyvoice task-started timeout")), 8000);
      this.ws!.on("message", (raw, isBinary) => {
        const buf = Buffer.isBuffer(raw)
          ? raw
          : Array.isArray(raw)
            ? Buffer.concat(raw)
            : Buffer.from(raw as ArrayBuffer);
        if (isBinary || (buf.length > 0 && buf[0] !== 0x7b && buf[0] !== 0x5b)) {
          if (buf.length >= 2) {
            this.onPcm(Buffer.from(buf));
          }
          return;
        }
        const parsed = parseDashscopeEvent(buf);
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
          console.error(
            JSON.stringify({
              src: "hoshi.voice",
              phase: "cosy_failed",
              detail,
              model: this.model,
              voice: this.voice
            })
          );
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
    this.ws.send(
      JSON.stringify({
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
      })
    );
    await started;
  }

  speak(text: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.started || !text.trim()) {
      return;
    }
    this.ws.send(
      JSON.stringify({
        header: {
          action: "continue-task",
          task_id: this.taskId,
          streaming: "duplex"
        },
        payload: { input: { text } }
      })
    );
  }

  finish(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.taskId) {
      return;
    }
    this.ws.send(
      JSON.stringify({
        header: {
          action: "finish-task",
          task_id: this.taskId,
          streaming: "duplex"
        },
        payload: { input: {} }
      })
    );
  }

  cancel(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.taskId) {
      this.close();
      return;
    }
    try {
      this.ws.send(
        JSON.stringify({
          header: {
            action: "finish-task",
            task_id: this.taskId,
            streaming: "duplex"
          },
          payload: { input: { directive: "cancel" } }
        })
      );
    } catch {
      // ignore
    }
    this.close();
  }

  close(): void {
    this.ws?.close();
    this.ws = null;
    this.started = false;
    this.taskId = "";
  }
}
