import type { Server as HttpServer } from "node:http";
import type { VoiceSettings } from "@hoshi/shared";
import { wsAuthorized } from "../agentAuth";
import { WebSocket, WebSocketServer } from "ws";
import type { OpenAiCompatClient } from "../llm/openai";
import { resolveDashscopeCreds } from "./dashscopeCreds";
import { applyGsvWeights } from "./gptSovits";
import { createTtsEngine, type TtsEngine } from "./tts";
import { emitTtsPcm, stopTtsPlayback } from "./ttsSink";
import { sanitizeTtsText } from "./ttsText";

export function attachTtsGateway(
  server: HttpServer,
  deps: {
    authToken: string;
    getLlm: () => OpenAiCompatClient;
    getVoiceSettings: () => VoiceSettings;
  }
): void {
  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname !== "/v1/tts") {
      return;
    }
    if (!wsAuthorized(url, deps.authToken)) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      void handleTts(ws, deps);
    });
  });
}

async function handleTts(
  ws: WebSocket,
  deps: {
    getLlm: () => OpenAiCompatClient;
    getVoiceSettings: () => VoiceSettings;
  }
): Promise<void> {
  let tts: TtsEngine | null = null;
  let closed = false;
  let pcmBytes = 0;
  let lastRate = 22050;
  let doneTimer: ReturnType<typeof setTimeout> | null = null;
  let chain = Promise.resolve();
  const sendJson = (data: object): void => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  };
  const emitTtsDone = (): void => {
    if (doneTimer) {
      clearTimeout(doneTimer);
      doneTimer = null;
    }
    const rate = tts?.sampleRate() ?? lastRate;
    const ms =
      pcmBytes < 2
        ? 0
        : Math.min(12000, Math.max(800, Math.ceil((pcmBytes / 2 / Math.max(rate, 1)) * 1000) + 700));
    doneTimer = setTimeout(() => {
      sendJson({ type: "tts_done" });
    }, ms);
  };
  const enqueue = (fn: () => Promise<void>): void => {
    chain = chain.then(async () => {
      if (closed) {
        return;
      }
      await fn();
    }).catch((error) => {
      if (closed) {
        return;
      }
      const message = error instanceof Error ? error.message : "tts failed";
      sendJson({ type: "error", message });
      emitTtsDone();
    });
  };
  const ensure = async (): Promise<TtsEngine> => {
    if (tts) {
      return tts;
    }
    const voice = deps.getVoiceSettings();
    if (voice.ttsBackend === "gpt-sovits") {
      await applyGsvWeights(voice);
    }
    const ds = resolveDashscopeCreds(voice, deps.getLlm().snapshot());
    tts = createTtsEngine(
      voice,
      ds,
      (pcm) => {
        pcmBytes += pcm.length;
        lastRate = tts?.sampleRate() ?? lastRate;
        emitTtsPcm(pcm, lastRate);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(pcm, { binary: true, compress: false });
        }
      },
      () => {
        emitTtsDone();
      },
      (rate) => {
        sendJson({ type: "tts_format", sampleRate: rate });
      }
    );
    await tts.start();
    sendJson({ type: "tts_format", sampleRate: tts.sampleRate() });
    return tts;
  };
  ws.on("message", (raw, isBinary) => {
    if (isBinary) {
      return;
    }
    let msg: { type?: string; text?: string };
    try {
      msg = JSON.parse(raw.toString()) as { type?: string; text?: string };
    } catch {
      return;
    }
    if (msg.type === "stop") {
      closed = true;
      tts?.cancel();
      stopTtsPlayback();
      ws.close();
      return;
    }
    if (msg.type === "speak" && msg.text) {
      if (deps.getVoiceSettings().ttsEnabled === false) {
        return;
      }
      const text = sanitizeTtsText(msg.text);
      if (!text) {
        return;
      }
      enqueue(async () => {
        const engine = await ensure();
        await engine.speak(text, undefined);
      });
    }
    if (msg.type === "finish") {
      enqueue(async () => {
        await tts?.finish();
      });
    }
  });
  ws.on("close", () => {
    closed = true;
    tts?.cancel();
    tts = null;
    stopTtsPlayback();
  });
}
