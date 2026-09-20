import WebSocket from "ws";
import { parseUsage, type LlmUsage } from "@hoshi/shared";

export function inferenceWsUrl(httpBaseUrl: string): string {
  if (httpBaseUrl.includes("dashscope-intl")) {
    return "wss://dashscope-intl.aliyuncs.com/api-ws/v1/inference";
  }
  return "wss://dashscope.aliyuncs.com/api-ws/v1/inference";
}

export function openDashscopeWs(apiKey: string, httpBaseUrl: string): WebSocket {
  return new WebSocket(inferenceWsUrl(httpBaseUrl), {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
}

export function waitOpen(ws: WebSocket, timeoutMs = 8000): Promise<void> {
  if (ws.readyState === WebSocket.OPEN) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("dashscope ws timeout"));
    }, timeoutMs);
    ws.once("open", () => {
      clearTimeout(timer);
      resolve();
    });
    ws.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

export function parseDashscopeEvent(raw: WebSocket.RawData): {
  event?: string;
  taskId?: string;
  sentenceText?: string;
  sentenceEnd?: boolean;
  errorMessage?: string;
  usage?: LlmUsage;
} | null {
  const text =
    typeof raw === "string"
      ? raw
      : Buffer.isBuffer(raw)
        ? raw.toString("utf8")
        : Array.isArray(raw)
          ? Buffer.concat(raw).toString("utf8")
          : Buffer.from(raw).toString("utf8");
  try {
    const json = JSON.parse(text) as {
      header?: { event?: string; task_id?: string; error_message?: string; error_code?: string };
      payload?: {
        output?: { sentence?: { text?: string; sentence_end?: boolean } };
        usage?: unknown;
      };
    };
    const sentence = json.payload?.output?.sentence;
    const err = json.header?.error_message || json.header?.error_code;
    return {
      event: json.header?.event,
      taskId: json.header?.task_id,
      sentenceText: sentence?.text,
      sentenceEnd: sentence?.sentence_end === true,
      errorMessage: err,
      usage: parseUsage(json.payload?.usage)
    };
  } catch {
    return null;
  }
}
