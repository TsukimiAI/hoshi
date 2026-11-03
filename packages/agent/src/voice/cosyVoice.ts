import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import { openDashscopeWs, parseDashscopeEvent, waitOpen } from "./dashscopeWs";

const TTS_SAMPLE_RATE = 22050;

export class CosyVoiceClient {
  private ws: WebSocket | null = null;
  private taskId = "";
  private started = false;
  private doneOnce = false;
  private finishing: { resolve: () => void; timer: ReturnType<typeof setTimeout> } | null = null;

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

  private emitDone(): void {
    if (this.doneOnce) {
      return;
    }
    this.doneOnce = true;
    this.clearFinishing(true);
    this.onDone();
  }

  private clearFinishing(resolve: boolean): void {
    if (!this.finishing) {
      return;
    }
    clearTimeout(this.finishing.timer);
    if (resolve) {
      this.finishing.resolve();
    }
    this.finishing = null;
  }

  async start(): Promise<void> {
    this.close();
    this.doneOnce = false;
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
          this.emitDone();
          return;
        }
        if (parsed?.event === "task-finished") {
          this.emitDone();
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

  finish(): Promise<void> {
    if (this.doneOnce) {
      return Promise.resolve();
    }
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.taskId) {
      this.emitDone();
      return Promise.resolve();
    }
    if (this.finishing) {
      return new Promise((resolve) => {
        const prev = this.finishing;
        if (!prev) {
          resolve();
          return;
        }
        const inner = prev.resolve;
        prev.resolve = () => {
          inner();
          resolve();
        };
      });
    }
    return new Promise((resolve) => {
      this.finishing = {
        resolve,
        timer: setTimeout(() => {
          this.emitDone();
        }, 10000)
      };
      this.ws?.send(
        JSON.stringify({
          header: {
            action: "finish-task",
            task_id: this.taskId,
            streaming: "duplex"
          },
          payload: { input: {} }
        })
      );
    });
  }

  cancel(): void {
    this.clearFinishing(true);
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
    this.clearFinishing(true);
    this.ws?.close();
    this.ws = null;
    this.started = false;
    this.taskId = "";
  }
}
