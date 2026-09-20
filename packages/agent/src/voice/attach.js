"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.voiceSessionCount = voiceSessionCount;
exports.attachVoiceGateway = attachVoiceGateway;
const ws_1 = require("ws");
const chatTurn_1 = require("../chatTurn");
const funAsr_1 = require("./funAsr");
const dashscopeCreds_1 = require("./dashscopeCreds");
const gptSovits_1 = require("./gptSovits");
const tts_1 = require("./tts");
const ttsText_1 = require("./ttsText");
const whisper_1 = require("./whisper");
const ttsSink_1 = require("./ttsSink");
const agentAuth_1 = require("../agentAuth");
const IDLE_MS = 120_000;
let voiceSessions = 0;
function voiceSessionCount() {
    return voiceSessions;
}
function sendJson(ws, data) {
    if (ws.readyState === ws_1.WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}
function logVoice(payload) {
    console.error(JSON.stringify({ src: "hoshi.voice", ...payload }));
}
async function handleClient(ws, deps) {
    voiceSessions += 1;
    let sessionId = "";
    let asr = null;
    let tts = null;
    let gsvWeightsReady = false;
    let ttsPlaying = false;
    let turnBusy = false;
    let pcmBytes = 0;
    let lastRate = 22050;
    let awaitingDrain = false;
    let playbackTimer = null;
    let chatAbort = null;
    let idleTimer = null;
    let closed = false;
    let pendingFinal = null;
    let runTurnActive = false;
    const startedAt = Date.now();
    const clearIdle = () => {
        if (idleTimer) {
            clearTimeout(idleTimer);
            idleTimer = null;
        }
    };
    const bumpIdle = () => {
        clearIdle();
        idleTimer = setTimeout(() => {
            sendJson(ws, { type: "status", phase: "idle_stop" });
            ws.close();
        }, IDLE_MS);
    };
    const clearPlaybackWait = () => {
        if (playbackTimer) {
            clearTimeout(playbackTimer);
            playbackTimer = null;
        }
    };
    let asrKind = "fun-asr";
    const enterListening = () => {
        clearPlaybackWait();
        awaitingDrain = false;
        ttsPlaying = false;
        turnBusy = false;
        sendJson(ws, { type: "status", phase: "listening", asr: asrKind });
    };
    const waitPlayback = () => {
        awaitingDrain = true;
        clearPlaybackWait();
        const rate = tts?.sampleRate() ?? lastRate;
        const ms = Math.min(12000, Math.max(800, Math.ceil((pcmBytes / 2 / Math.max(rate, 1)) * 1000) + 700));
        playbackTimer = setTimeout(() => {
            sendJson(ws, { type: "tts_done" });
            enterListening();
        }, ms);
    };
    const emitRate = (rate) => {
        if (rate > 0 && rate !== lastRate) {
            lastRate = rate;
            sendJson(ws, { type: "tts_format", sampleRate: rate });
        }
    };
    const cleanup = () => {
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
        (0, ttsSink_1.stopTtsPlayback)();
        asr = null;
        tts = null;
    };
    const bargeIn = () => {
        clearPlaybackWait();
        turnBusy = false;
        ttsPlaying = false;
        chatAbort?.abort();
        chatAbort = null;
        tts?.cancel();
        tts = null;
        (0, ttsSink_1.stopTtsPlayback)();
        awaitingDrain = false;
        sendJson(ws, { type: "status", phase: "listening", asr: asrKind });
        logVoice({ phase: "barge", ms: Date.now() - startedAt });
    };
    const startTurn = (text) => {
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
    const runTurn = async (text) => {
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
        const ds = (0, dashscopeCreds_1.resolveDashscopeCreds)(voice, snap);
        const speakOn = voice.ttsEnabled !== false;
        ttsPlaying = speakOn;
        let engine = null;
        try {
            if (speakOn) {
                engine = (0, tts_1.createTtsEngine)(voice, ds, (pcm) => {
                    pcmBytes += pcm.length;
                    if (pcmBytes === pcm.length) {
                        logVoice({ phase: "tts_pcm", n: pcm.length, rate: lastRate });
                    }
                    (0, ttsSink_1.emitTtsPcm)(pcm, lastRate);
                    if (ws.readyState === ws_1.WebSocket.OPEN) {
                        ws.send(pcm, { binary: true, compress: false });
                    }
                }, () => {
                    waitPlayback();
                }, (rate) => {
                    emitRate(rate);
                });
            }
        }
        catch (error) {
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
            for await (const event of (0, chatTurn_1.runSessionChat)({
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
                        const spoken = (0, ttsText_1.sanitizeTtsText)(event.data.text);
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
        }
        catch (error) {
            if (!signal.aborted) {
                const message = error instanceof Error ? error.message : "voice chat failed";
                sendJson(ws, { type: "error", message });
                logVoice({ phase: "chat", ok: false, ms: Date.now() - startedAt });
            }
            engine?.cancel();
            tts = null;
            if (!signal.aborted) {
                enterListening();
            }
            else {
                ttsPlaying = false;
            }
            return;
        }
        if (signal.aborted) {
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
            asr?.sendPcm(Buffer.from(raw));
            return;
        }
        let msg;
        try {
            msg = JSON.parse(raw.toString());
        }
        catch {
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
                            await (0, gptSovits_1.applyGsvWeights)(voice);
                        }
                        catch (error) {
                            const message = error instanceof Error ? error.message : "gsv weights failed";
                            sendJson(ws, { type: "error", message });
                            logVoice({ phase: "gsv_weights", ok: false, message });
                        }
                    }
                    const onFinal = (finalText) => {
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
                    const onPartial = (partial) => sendJson(ws, { type: "partial", text: partial });
                    const useCloudAsr = (0, dashscopeCreds_1.hasDashscopeVoiceKey)(voice, snap);
                    asrKind = useCloudAsr ? "fun-asr" : "whisper";
                    if (useCloudAsr) {
                        const ds = (0, dashscopeCreds_1.resolveDashscopeCreds)(voice, snap);
                        asr = new funAsr_1.FunAsrClient(ds.apiKey, ds.baseUrl, onPartial, onFinal, voice.hotwords, voice.hotwordVocabularyId, (usage) => {
                            deps.getLlm().noteUsage("asr", usage, sessionId, "fun-asr-realtime");
                        });
                        await asr.start();
                        sendJson(ws, { type: "status", phase: "listening", asr: "fun-asr" });
                    }
                    else {
                        asr = new whisper_1.WhisperAsrClient(voice, onPartial, onFinal);
                        await asr.start();
                        sendJson(ws, { type: "status", phase: "listening", asr: "whisper" });
                    }
                    bumpIdle();
                    logVoice({ phase: "start", ms: Date.now() - startedAt });
                }
                catch (error) {
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
function attachVoiceGateway(server, deps) {
    const wss = new ws_1.WebSocketServer({ noServer: true });
    server.on("upgrade", (req, socket, head) => {
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        if (url.pathname !== "/v1/voice") {
            return;
        }
        if (!(0, agentAuth_1.wsAuthorized)(url, deps.authToken)) {
            socket.destroy();
            return;
        }
        wss.handleUpgrade(req, socket, head, (ws) => {
            void handleClient(ws, deps);
        });
    });
}
