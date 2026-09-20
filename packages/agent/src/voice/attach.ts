import type { Server as HttpServer } from "node:http";
import type { ChatSettings, VoiceSettings } from "@hoshi/shared";
import type { SessionContext } from "../sessionContext";
import { WebSocket, WebSocketServer } from "ws";
import { runSessionChat } from "../chatTurn";
import type { OpenAiCompatClient } from "../llm/openai";
import type { AgentRuntime } from "../runtime";
import type { MemoryRepo } from "../storage/memoryRepo";
import type { SessionRepo } from "../storage/sessionRepo";
import { FunAsrClient } from "./funAsr";
import { hasDashscopeVoiceKey, resolveDashscopeCreds } from "./dashscopeCreds";
import { applyGsvWeights } from "./gptSovits";
import { createTtsEngine, type TtsEngine } from "./tts";
import { sanitizeTtsText } from "./ttsText";
import { WhisperAsrClient } from "./whisper";
import { emitTtsPcm, stopTtsPlayback } from "./ttsSink";
import { wsAuthorized } from "../agentAuth";

const IDLE_MS = 120_000;

let voiceSessions = 0;

export function voiceSessionCount(): number {
  return voiceSessions;
}

export interface VoiceGatewayDeps {
  ready: Promise<void>;
  authToken: string;
  getLlm: () => OpenAiCompatClient;
  getRuntime: () => AgentRuntime;
  getChatSettings: () => ChatSettings;
  getVoiceSettings: () => VoiceSettings;
  repo: SessionRepo;
  memoryRepo: MemoryRepo;
  buildHistory: (sessionId: string) => Promise<SessionContext>;
}

function sendJson(ws: WebSocket, data: object): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function logVoice(payload: Record<string, unknown>): void {
  console.error(JSON.stringify({ src: "hoshi.voice", ...payload }));
}

async function handleClient(ws: WebSocket, deps: VoiceGatewayDeps): Promise<void> {
  voiceSessions += 1;
  let sessionId = "";
  let asr: { start(): Promise<void>; sendPcm: (pcm: Buffer) => void; close: () => void } | null = null;
  let tts: TtsEngine | null = null;
  let gsvWeightsReady = false;
  let ttsPlaying = false;
  let turnBusy = false;
  let pcmBytes = 0;
  let lastRate = 22050;
  let awaitingDrain = false;
  let playbackTimer: ReturnType<typeof setTimeout> | null = null;
  let chatAbort: AbortController | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  let pendingFinal: string | null = null;
  let runTurnActive = false;
  const startedAt = Date.now();

  const clearIdle = (): void => {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  };

  const bumpIdle = (): void => {
    clearIdle();
    idleTimer = setTimeout(() => {
      sendJson(ws, { type: "status", phase: "idle_stop" });
      ws.close();
    }, IDLE_MS);
  };

  const clearPlaybackWait = (): void => {
    if (playbackTimer) {
      clearTimeout(playbackTimer);
      playbackTimer = null;
    }
  };

  let asrKind: "fun-asr" | "whisper" = "fun-asr";

  const enterListening = (): void => {
    clearPlaybackWait();
    awaitingDrain = false;
    ttsPlaying = false;
    turnBusy = false;
    sendJson(ws, { type: "status", phase: "listening", asr: asrKind });
  };

  const waitPlayback = (): void => {
    awaitingDrain = true;
    clearPlaybackWait();
    const rate = tts?.sampleRate() ?? lastRate;
    const ms = Math.min(12000, Math.max(800, Math.ceil((pcmBytes / 2 / Math.max(rate, 1)) * 1000) + 700));
    playbackTimer = setTimeout(() => {
      sendJson(ws, { type: "tts_done" });
      enterListening();
    }, ms);
  };

  const emitRate = (rate: number): void => {
    if (rate > 0 && rate !== lastRate) {
      lastRate = rate;
      sendJson(ws, { type: "tts_format", sampleRate: rate });
    }
  };

  const cleanup = (): void => {
    if (closed) {
      return;
    }
    closed = true;
    voiceSessions = Math.max(0, voiceSessions - 1);
    clearIdle();
    clearPlaybackWait();
    chatAbort?.abort();
    asr?.close();
    tts?.cancel();
    stopTtsPlayback();
    asr = null;
    tts = null;
  };

  const bargeIn = (): void => {
    clearPlaybackWait();
    pendingFinal = null;
    turnBusy = false;
    ttsPlaying = false;
    chatAbort?.abort();
    chatAbort = null;
    tts?.cancel();
    tts = null;
    stopTtsPlayback();
    awaitingDrain = false;
    sendJson(ws, { type: "status", phase: "listening", asr: asrKind });
    logVoice({ phase: "barge", ms: Date.now() - startedAt });
  };

  const startTurn = (text: string): void => {
    turnBusy = true;
    void runTurn(text).finally(() => {
      runTurnActive = false;
      if (closed) {
        return;
      }
      const next = pendingFinal;
      pendingFinal = null;
      if (next) {
        startTurn(next);
        return;
      }
      if (!ttsPlaying && !awaitingDrain) {
        turnBusy = false;
      }
    });
  };

  const runTurn = async (text: string): Promise<void> => {
    if (text.length < 2) {
      return;
    }
    runTurnActive = true;
    chatAbort?.abort();
    chatAbort = new AbortController();
    const signal = chatAbort.signal;
    pcmBytes = 0;
    awaitingDrain = false;
    sendJson(ws, { type: "final", text });
    sendJson(ws, { type: "status", phase: "generating" });
    const llm = deps.getLlm();
    const snap = llm.snapshot();
    const { history, compactUsage } = await deps.buildHistory(sessionId);
    const voice = deps.getVoiceSettings();
    const ds = resolveDashscopeCreds(voice, snap);
    const speakOn = voice.ttsEnabled !== false;
    ttsPlaying = speakOn;
    let engine: TtsEngine | null = null;
    try {
      if (speakOn) {
        engine = createTtsEngine(
          voice,
          ds,
          (pcm) => {
            pcmBytes += pcm.length;
            if (pcmBytes === pcm.length) {
              logVoice({ phase: "tts_pcm", n: pcm.length, rate: lastRate });
            }
            emitTtsPcm(pcm, lastRate);
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(pcm, { binary: true, compress: false });
            }
          },
          () => {
            waitPlayback();
          },
          (rate) => {
            emitRate(rate);
          }
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "tts failed";
      sendJson(ws, { type: "error", message });
    }
    tts = engine;
    const ttsReady = engine
      ? engine
          .start()
          .then(() => {
            if (signal.aborted || !engine) {
              return;
            }
            lastRate = engine.sampleRate();
            sendJson(ws, { type: "tts_format", sampleRate: lastRate });
          })
          .catch((error) => {
            const raw = error instanceof Error ? error.message : "tts failed";
            const message = raw.includes("418") || raw.includes("Model not found")
              ? "TTS 模型/音色无效，已请改用 cosyvoice-v2 + longxiaochun_v2"
              : raw;
            sendJson(ws, { type: "error", message });
            engine?.cancel();
            engine = null;
            tts = null;
          })
      : Promise.resolve();
    try {
      for await (const event of runSessionChat({
        repo: deps.repo,
        memoryRepo: deps.memoryRepo,
        runtime: deps.getRuntime(),
        llm,
        chatSettings: deps.getChatSettings(),
        sessionId,
        message: text,
        history,
        compactUsage,
        signal
      })) {
        if (signal.aborted) {
          break;
        }
        sendJson(ws, event);
        if (engine && event.event === "sentence") {
          await ttsReady;
          if (engine) {
            if (!ttsPlaying) {
              ttsPlaying = true;
              sendJson(ws, { type: "status", phase: "speaking" });
            }
            const spoken = sanitizeTtsText(event.data.text);
            if (spoken) {
              await engine.speak(spoken, signal);
            }
          }
        }
      }
      if (!signal.aborted && engine) {
        await engine.finish();
      }
      if (!signal.aborted && !engine) {
        sendJson(ws, { type: "tts_done" });
        enterListening();
      }
    } catch (error) {
      if (!signal.aborted) {
        const message = error instanceof Error ? error.message : "voice chat failed";
        sendJson(ws, { type: "error", message });
        logVoice({ phase: "chat", ok: false, ms: Date.now() - startedAt });
      }
      engine?.cancel();
      if (tts === engine) {
        tts = null;
      }
      if (!signal.aborted) {
        enterListening();
      } else {
        ttsPlaying = false;
      }
      return;
    }
    if (signal.aborted) {
      engine?.cancel();
      if (tts === engine) {
        tts = null;
      }
      ttsPlaying = false;
      return;
    }
    logVoice({ phase: "turn", ok: true, ms: Date.now() - startedAt });
  };

  ws.on("message", (raw, isBinary) => {
    if (closed) {
      return;
    }
    if (isBinary) {
      asr?.sendPcm(Buffer.from(raw as Buffer));
      return;
    }
    let msg: { type?: string; sessionId?: string };
    try {
      msg = JSON.parse(raw.toString()) as { type?: string; sessionId?: string };
    } catch {
      return;
    }
    if (msg.type === "stop") {
      ws.close();
      return;
    }
    if (msg.type === "barge") {
      bargeIn();
      return;
    }
    if (msg.type === "tts_end") {
      return;
    }
    if (msg.type === "start" && msg.sessionId && !asr) {
      sessionId = msg.sessionId.trim();
      void (async () => {
        try {
          await deps.ready;
          const session = await deps.repo.getSession(sessionId);
          if (!session) {
            sendJson(ws, { type: "error", message: "session not found" });
            ws.close();
            return;
          }
          const snap = deps.getLlm().snapshot();
          const voice = deps.getVoiceSettings();
          if (voice.ttsBackend === "gpt-sovits" && !gsvWeightsReady) {
            gsvWeightsReady = true;
            try {
              await applyGsvWeights(voice);
            } catch (error) {
              const message = error instanceof Error ? error.message : "gsv weights failed";
              sendJson(ws, { type: "error", message });
              logVoice({ phase: "gsv_weights", ok: false, message });
            }
          }
          const onFinal = (finalText: string): void => {
            bumpIdle();
            const text = finalText.trim();
            if (text.length < 2) {
              return;
            }
            if (ttsPlaying || turnBusy || awaitingDrain) {
              bargeIn();
              pendingFinal = text;
              if (!runTurnActive) {
                const next = pendingFinal;
                pendingFinal = null;
                if (next) {
                  startTurn(next);
                }
              }
              return;
            }
            startTurn(text);
          };
          const onPartial = (partial: string): void => sendJson(ws, { type: "partial", text: partial });
          const useCloudAsr = hasDashscopeVoiceKey(voice, snap);
          asrKind = useCloudAsr ? "fun-asr" : "whisper";
          if (useCloudAsr) {
            const ds = resolveDashscopeCreds(voice, snap);
            asr = new FunAsrClient(
              ds.apiKey,
              ds.baseUrl,
              onPartial,
              onFinal,
              voice.hotwords,
              voice.hotwordVocabularyId,
              (usage) => {
                deps.getLlm().noteUsage("asr", usage, sessionId, "fun-asr-realtime");
              }
            );
            await asr.start();
            sendJson(ws, { type: "status", phase: "listening", asr: "fun-asr" });
          } else {
            asr = new WhisperAsrClient(voice, onPartial, onFinal);
            await asr.start();
            sendJson(ws, { type: "status", phase: "listening", asr: "whisper" });
          }
          bumpIdle();
          logVoice({ phase: "start", ms: Date.now() - startedAt });
        } catch (error) {
          const message = error instanceof Error ? error.message : "voice start failed";
          sendJson(ws, { type: "error", message });
          ws.close();
        }
      })();
    }
  });

  ws.on("close", () => {
    cleanup();
    logVoice({ phase: "close", ms: Date.now() - startedAt });
  });
  ws.on("error", () => {
    cleanup();
  });
}

export function attachVoiceGateway(server: HttpServer, deps: VoiceGatewayDeps): void {
  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname !== "/v1/voice") {
      return;
    }
    if (!wsAuthorized(url, deps.authToken)) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      void handleClient(ws, deps);
    });
  });
}
