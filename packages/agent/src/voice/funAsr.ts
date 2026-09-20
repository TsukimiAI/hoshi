import { randomUUID } from "node:crypto";
import type { LlmUsage } from "@hoshi/shared";
import WebSocket from "ws";
import { openDashscopeWs, parseDashscopeEvent, waitOpen } from "./dashscopeWs";

export class FunAsrClient {
  private ws: WebSocket | null = null;
  private taskId = "";
  private started = false;
  private lastUsage: LlmUsage | undefined;
  private usageEmitted = false;

  constructor(
    private readonly apiKey: string,
    private readonly httpBaseUrl: string,
    private readonly onPartial: (text: string) => void,
    private readonly onFinal: (text: string) => void,
    private readonly hotwords: string,
    private readonly vocabularyId: string,
    private readonly onUsage?: (usage: LlmUsage) => void
  ) {}

  async start(): Promise<void> {
    this.lastUsage = undefined;
    this.usageEmitted = false;
    this.taskId = randomUUID();
    this.ws = openDashscopeWs(this.apiKey, this.httpBaseUrl);
    await waitOpen(this.ws);
    const vocab = this.vocabularyId.trim();
    let retried = false;
    const started = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("fun-asr task-started timeout")), 12000);
      this.ws!.on("message", (raw, isBinary) => {
        if (isBinary) {
          return;
        }
        const parsed = parseDashscopeEvent(raw);
        if (!parsed) {
          return;
        }
        if (parsed.usage) {
          this.lastUsage = parsed.usage;
        }
        if (parsed.event === "task-finished") {
          this.emitUsageOnce();
        }
        if (parsed.event === "task-started") {
          this.started = true;
          clearTimeout(timer);
          resolve();
          return;
        }
        if (parsed.event === "result-generated" && parsed.sentenceText) {
          const text = parsed.sentenceText.trim();
          if (!text) {
            return;
          }
          if (parsed.sentenceEnd) {
            this.onFinal(text);
          } else {
            this.onPartial(text);
          }
        }
        if (parsed.event === "task-failed") {
          if (!this.started && vocab && !retried) {
            retried = true;
            this.taskId = randomUUID();
            this.sendRunTask("");
            return;
          }
          clearTimeout(timer);
          reject(new Error("fun-asr task-failed"));
        }
      });
    });
    this.sendRunTask(vocab);
    await started;
  }

  private hotwordContext(): object {
    const words = this.hotwords
      .split(/[,，\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (words.length === 0) {
      return {};
    }
    return {
      context: [
        {
          role: "user",
          content: [{ type: "input_text", text: words.join("、") }]
        }
      ]
    };
  }

  private sendRunTask(vocabularyId: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    this.ws.send(
      JSON.stringify({
        header: {
          action: "run-task",
          task_id: this.taskId,
          streaming: "duplex"
        },
        payload: {
          task_group: "audio",
          task: "asr",
          function: "recognition",
          model: "fun-asr-realtime",
          parameters: {
            sample_rate: 16000,
            format: "pcm",
            heartbeat: true,
            max_sentence_silence: 1000,
            language_hints: ["zh"],
            ...(vocabularyId ? { vocabulary_id: vocabularyId } : {})
          },
          input: this.hotwordContext()
        }
      })
    );
  }

  sendPcm(pcm: Buffer): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.started) {
      return;
    }
    this.ws.send(pcm);
  }

  private emitUsageOnce(): void {
    if (this.usageEmitted || !this.lastUsage) {
      return;
    }
    this.usageEmitted = true;
    this.onUsage?.(this.lastUsage);
  }

  close(): void {
    this.emitUsageOnce();
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.taskId) {
      try {
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
      } catch {
        // ignore
      }
    }
    this.ws?.close();
    this.ws = null;
    this.started = false;
  }
}
