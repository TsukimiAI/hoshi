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
import { stopTtsPlayback } from "./ttsSink";
import { wsAuthorized } from "../agentAuth";
import {
  BARGE_RESUME_MS,
  decideAsrFinal,
  nextTurnFromFinally,
  playbackWatchdogMs,
  shouldAcceptTtsEnd
} from "./turn";

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
  let bargeResumeTimer: ReturnType<typeof setTimeout> | null = null;
  let chatAbort: AbortController | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  let pendingFinal: string | null = null;
  let runTurnActive = false;
  let epoch = 0;
  let barged = false;
  let asrFeed = true;
  let funAsrRestarts = 0;
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
      sendJson(ws, { type: "status", phase: "idle_stop", epoch });
      ws.close();
    }, IDLE_MS);
  };

  const clearPlaybackWait = (): void => {
    if (playbackTimer) {
      clearTimeout(playbackTimer);
      playbackTimer = null;
    }
  };

  const clearBargeResume = (): void => {
    if (bargeResumeTimer) {
      clearTimeout(bargeResumeTimer);
      bargeResumeTimer = null;
    }
  };

  let asrKind: "fun-asr" | "whisper" = "fun-asr";

  const enterListening = (): void => {
    clearPlaybackWait();
    clearBargeResume();
    awaitingDrain = false;
    ttsPlaying = false;
    turnBusy = false;
    barged = false;
    asrFeed = true;
    sendJson(ws, { type: "status", phase: "listening", asr: asrKind, epoch });
  };

  const finishPlayback = (forEpoch: number): void => {
    if (epoch !== forEpoch) {
      return;
    }
    if (!awaitingDrain && !ttsPlaying) {
      return;
    }
    clearPlaybackWait();
    awaitingDrain = false;
    ttsPlaying = false;
    sendJson(ws, { type: "tts_done", epoch });
    enterListening();
  };

  const waitPlayback = (forEpoch: number): void => {
    if (epoch !== forEpoch) {
      return;
    }
    awaitingDrain = true;
    ttsPlaying = true;
    asrFeed = false;
    bumpIdle();
    sendJson(ws, { type: "tts_flush", epoch: forEpoch });
    clearPlaybackWait();
    const rate = tts?.sampleRate() ?? lastRate;
    const ms = playbackWatchdogMs(pcmBytes, rate);
    playbackTimer = setTimeout(() => {
      finishPlayback(forEpoch);
    }, ms);
  };

  const emitRate = (rate: number): void => {
    if (rate > 0 && rate !== lastRate) {
      lastRate = rate;
      sendJson(ws, { type: "tts_format", sampleRate: rate, epoch });
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
    clearBargeResume();
    chatAbort?.abort();
    asr?.close();
    tts?.cancel();
    stopTtsPlayback();
    asr = null;
    tts = null;
  };

  const bargeIn = (): void => {
    epoch += 1;
    barged = true;
    asrFeed = true;
    pendingFinal = null;
    clearPlaybackWait();
    clearBargeResume();
    ttsPlaying = false;
    awaitingDrain = false;
    chatAbort?.abort();
    chatAbort = null;
    tts?.cancel();
    tts = null;
    stopTtsPlayback();
    bumpIdle();
    bargeResumeTimer = setTimeout(() => {
      if (closed || pendingFinal || runTurnActive) {
        if (!pendingFinal && !runTurnActive) {
          enterListening();
        }
        return;
      }
      enterListening();
    }, BARGE_RESUME_MS);
    logVoice({ phase: "barge", ms: Date.now() - startedAt, epoch });
  };

  const startTurn = (text: string): void => {
    epoch += 1;
    const myEpoch = epoch;
    turnBusy = true;
    barged = false;
    asrFeed = false;
    pendingFinal = null;
    clearBargeResume();
    bumpIdle();
    void runTurn(text, myEpoch).finally(() => {
      runTurnActive = false;
      if (closed) {
        return;
      }
      const next = nextTurnFromFinally({
        myEpoch,
        currentEpoch: epoch,
        pendingFinal,
        ttsPlaying,
        awaitingDrain
      });
      pendingFinal = null;
      if (next.start) {
        startTurn(next.start);
        return;
      }
      if (next.clearBusy) {
        turnBusy = false;
      }
      if (next.enterListening) {
        enterListening();
        return;
      }
      if (barged && !pendingFinal) {
        clearBargeResume();
        bargeResumeTimer = setTimeout(() => {
          if (!closed && !pendingFinal && !runTurnActive) {
            enterListening();
          }
        }, BARGE_RESUME_MS);
      }
    });
  };

  const runTurn = async (text: string, myEpoch: number): Promise<void> => {
    if (text.length < 2) {
      return;
    }
    runTurnActive = true;
    chatAbort?.abort();
    chatAbort = new AbortController();
    const signal = chatAbort.signal;
    pcmBytes = 0;
    awaitingDrain = false;
    sendJson(ws, { type: "final", text, epoch: myEpoch });
    sendJson(ws, { type: "status", phase: "generating", epoch: myEpoch });
    const llm = deps.getLlm();
    const snap = llm.snapshot();
    const { history, compactUsage } = await deps.buildHistory(sessionId);
    if (signal.aborted || myEpoch !== epoch) {
      return;
    }
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
            if (myEpoch !== epoch) {
              return;
            }
            pcmBytes += pcm.length;
            if (pcmBytes === pcm.length) {
              logVoice({ phase: "tts_pcm", n: pcm.length, rate: lastRate, epoch: myEpoch });
            }
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(pcm, { binary: true, compress: false });
            }
          },
          () => {
            waitPlayback(myEpoch);
          },
          (rate) => {
            emitRate(rate);
          }
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "tts failed";
      sendJson(ws, { type: "error", message, epoch: myEpoch });
    }
    tts = engine;
    const ttsReady = engine
      ? engine
          .start()
          .then(() => {
            if (signal.aborted || myEpoch !== epoch || !engine) {
              return;
            }
            lastRate = engine.sampleRate();
            sendJson(ws, { type: "tts_format", sampleRate: lastRate, epoch: myEpoch });
          })
          .catch((error) => {
            const raw = error instanceof Error ? error.message : "tts failed";
            const message = raw.includes("418") || raw.includes("Model not found")
              ? "TTS 模型/音色无效，已请改用 cosyvoice-v2 + longxiaochun_v2"
              : raw;
            sendJson(ws, { type: "error", message, epoch: myEpoch });
            engine?.cancel();
            if (tts === engine) {
              tts = null;
            }
            engine = null;
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
        if (signal.aborted || myEpoch !== epoch) {
          break;
        }
        bumpIdle();
        sendJson(ws, event);
        if (engine && event.event === "sentence") {
          await ttsReady;
          if (engine && myEpoch === epoch) {
            if (!ttsPlaying) {
              ttsPlaying = true;
            }
            sendJson(ws, { type: "status", phase: "speaking", epoch: myEpoch });
            const spoken = sanitizeTtsText(event.data.text);
            if (spoken) {
              await engine.speak(spoken, signal);
            }
          }
        }
      }
      if (!signal.aborted && myEpoch === epoch && engine) {
        await engine.finish();
      }
      if (!signal.aborted && myEpoch === epoch && !engine) {
        sendJson(ws, { type: "tts_done", epoch: myEpoch });
        ttsPlaying = false;
        awaitingDrain = false;
      }
    } catch (error) {
      if (!signal.aborted && myEpoch === epoch) {
        const message = error instanceof Error ? error.message : "voice chat failed";
        sendJson(ws, { type: "error", message, epoch: myEpoch });
        logVoice({ phase: "chat", ok: false, ms: Date.now() - startedAt });
      }
      engine?.cancel();
      if (tts === engine) {
        tts = null;
      }
      if (!signal.aborted && myEpoch === epoch) {
        ttsPlaying = false;
        awaitingDrain = false;
      }
      return;
    }
    if (signal.aborted || myEpoch !== epoch) {
      engine?.cancel();
      if (tts === engine) {
        tts = null;
      }
      ttsPlaying = false;
      return;
    }
    logVoice({ phase: "turn", ok: true, ms: Date.now() - startedAt, epoch: myEpoch });
  };

  const onFinal = (finalText: string): void => {
    bumpIdle();
    const text = finalText.trim();
    if (text.length < 2) {
      return;
    }
    const decision = decideAsrFinal({ turnBusy, ttsPlaying, awaitingDrain, barged });
    if (decision === "drop") {
      return;
    }
    if (decision === "queue") {
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

  const openFunAsr = async (voice: VoiceSettings, snap: { apiKey: string; baseUrl: string }): Promise<void> => {
    const ds = resolveDashscopeCreds(voice, snap);
    asr?.close();
    asr = new FunAsrClient(
      ds.apiKey,
      ds.baseUrl,
      onPartial,
      onFinal,
      voice.hotwords,
      voice.hotwordVocabularyId,
      (usage) => {
        deps.getLlm().noteUsage("asr", usage, sessionId, "fun-asr-realtime");
      },
      (error) => {
        logVoice({ phase: "asr_failed", message: error.message });
        if (closed || funAsrRestarts >= 1) {
          sendJson(ws, { type: "error", message: error.message });
          return;
        }
        funAsrRestarts += 1;
        void (async () => {
          try {
            await openFunAsr(deps.getVoiceSettings(), deps.getLlm().snapshot());
            sendJson(ws, { type: "status", phase: "listening", asr: "fun-asr", epoch });
          } catch (restartError) {
            const message = restartError instanceof Error ? restartError.message : "fun-asr restart failed";
            sendJson(ws, { type: "error", message });
          }
        })();
      }
    );
    await asr.start();
    asrKind = "fun-asr";
  };

  ws.on("message", (raw, isBinary) => {
    if (closed) {
      return;
    }
    if (isBinary) {
      if (asrFeed) {
        asr?.sendPcm(Buffer.from(raw as Buffer));
      }
      return;
    }
    let msg: { type?: string; sessionId?: string; epoch?: number };
    try {
      msg = JSON.parse(raw.toString()) as { type?: string; sessionId?: string; epoch?: number };
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
      const msgEpoch = typeof msg.epoch === "number" ? msg.epoch : epoch;
      if (shouldAcceptTtsEnd({ awaitingDrain, epoch, msgEpoch })) {
        finishPlayback(msgEpoch);
      }
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
          if (voice.asrBackend === "whisper") {
            asrKind = "whisper";
            asr = new WhisperAsrClient(voice, onPartial, onFinal);
            await asr.start();
            sendJson(ws, { type: "status", phase: "listening", asr: "whisper", epoch });
          } else if (hasDashscopeVoiceKey(voice, snap)) {
            await openFunAsr(voice, snap);
            sendJson(ws, { type: "status", phase: "listening", asr: "fun-asr", epoch });
          } else {
            sendJson(ws, { type: "error", message: "请填写百炼语音 Key，或在设置中改用本机 Whisper" });
            ws.close();
            return;
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
