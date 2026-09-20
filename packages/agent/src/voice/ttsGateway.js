"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.attachTtsGateway = attachTtsGateway;
const agentAuth_1 = require("../agentAuth");
const ws_1 = require("ws");
const dashscopeCreds_1 = require("./dashscopeCreds");
const gptSovits_1 = require("./gptSovits");
const tts_1 = require("./tts");
const ttsSink_1 = require("./ttsSink");
const ttsText_1 = require("./ttsText");
function attachTtsGateway(server, deps) {
    const wss = new ws_1.WebSocketServer({ noServer: true });
    server.on("upgrade", (req, socket, head) => {
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        if (url.pathname !== "/v1/tts") {
            return;
        }
        if (!(0, agentAuth_1.wsAuthorized)(url, deps.authToken)) {
            socket.destroy();
            return;
        }
        wss.handleUpgrade(req, socket, head, (ws) => {
            void handleTts(ws, deps);
        });
    });
}
async function handleTts(ws, deps) {
    let tts = null;
    let closed = false;
    let pcmBytes = 0;
    let lastRate = 22050;
    let doneTimer = null;
    let chain = Promise.resolve();
    const sendJson = (data) => {
        if (ws.readyState === ws_1.WebSocket.OPEN) {
            ws.send(JSON.stringify(data));
        }
    };
    const emitTtsDone = () => {
        if (doneTimer) {
            clearTimeout(doneTimer);
            doneTimer = null;
        }
        const rate = tts?.sampleRate() ?? lastRate;
        const ms = pcmBytes < 2
            ? 0
            : Math.min(12000, Math.max(800, Math.ceil((pcmBytes / 2 / Math.max(rate, 1)) * 1000) + 700));
        doneTimer = setTimeout(() => {
            sendJson({ type: "tts_done" });
        }, ms);
    };
    const enqueue = (fn) => {
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
    const ensure = async () => {
        if (tts) {
            return tts;
        }
        const voice = deps.getVoiceSettings();
        if (voice.ttsBackend === "gpt-sovits") {
            await (0, gptSovits_1.applyGsvWeights)(voice);
        }
        const ds = (0, dashscopeCreds_1.resolveDashscopeCreds)(voice, deps.getLlm().snapshot());
        tts = (0, tts_1.createTtsEngine)(voice, ds, (pcm) => {
            pcmBytes += pcm.length;
            lastRate = tts?.sampleRate() ?? lastRate;
            (0, ttsSink_1.emitTtsPcm)(pcm, lastRate);
            if (ws.readyState === ws_1.WebSocket.OPEN) {
                ws.send(pcm, { binary: true, compress: false });
            }
        }, () => {
            emitTtsDone();
        }, (rate) => {
            sendJson({ type: "tts_format", sampleRate: rate });
        });
        await tts.start();
        sendJson({ type: "tts_format", sampleRate: tts.sampleRate() });
        return tts;
    };
    ws.on("message", (raw, isBinary) => {
        if (isBinary) {
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
            closed = true;
            tts?.cancel();
            (0, ttsSink_1.stopTtsPlayback)();
            ws.close();
            return;
        }
        if (msg.type === "speak" && msg.text) {
            if (deps.getVoiceSettings().ttsEnabled === false) {
                return;
            }
            const text = (0, ttsText_1.sanitizeTtsText)(msg.text);
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
        (0, ttsSink_1.stopTtsPlayback)();
    });
}
