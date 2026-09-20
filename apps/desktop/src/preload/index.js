"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
let activeController = null;
let transcribeController = null;
let voiceWs = null;
let ttsWs = null;
function bytesToB64(bytes) {
    const chunk = 0x2000;
    let bin = "";
    for (let i = 0; i < bytes.length; i += chunk) {
        bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
}
function emitWsPayload(onEvent, data) {
    if (data instanceof ArrayBuffer) {
        onEvent({ type: "pcm", b64: bytesToB64(new Uint8Array(data)) });
        return;
    }
    if (typeof Uint8Array !== "undefined" && data instanceof Uint8Array) {
        onEvent({ type: "pcm", b64: bytesToB64(data) });
        return;
    }
    if (typeof Blob !== "undefined" && data instanceof Blob) {
        void data.arrayBuffer().then((buf) => {
            onEvent({ type: "pcm", b64: bytesToB64(new Uint8Array(buf)) });
        });
        return;
    }
    if (typeof data === "string") {
        try {
            onEvent(JSON.parse(data));
        }
        catch {
            // ignore
        }
    }
}
let configCache = null;
function agentHeaders(config, extra) {
    return { Authorization: `Bearer ${config.agentToken}`, ...extra };
}
function agentWsUrl(config, path) {
    return `${config.agentBaseUrl.replace(/^http/, "ws")}${path}?token=${encodeURIComponent(config.agentToken)}`;
}
function parseSseChunk(chunk) {
    const blocks = chunk.split("\n\n");
    const events = [];
    for (const block of blocks) {
        const lines = block.split("\n");
        const eventLine = lines.find((line) => line.startsWith("event: "));
        const dataLine = lines.find((line) => line.startsWith("data: "));
        if (!eventLine || !dataLine) {
            continue;
        }
        const event = eventLine.slice(7).trim();
        const dataRaw = dataLine.slice(6).trim();
        try {
            const data = JSON.parse(dataRaw);
            if (event === "emotion" ||
                event === "sentence" ||
                event === "done" ||
                event === "error") {
                events.push({ event, data });
            }
        }
        catch {
            continue;
        }
    }
    return events;
}
const hoshiApi = {
    async getConfig() {
        if (!configCache) {
            configCache = (await electron_1.ipcRenderer.invoke("hoshi:get-config"));
        }
        return configCache;
    },
    async getSpriteData(emotion) {
        return (await electron_1.ipcRenderer.invoke("hoshi:get-sprite-data", emotion));
    },
    async setIgnoreMouseEvents(ignore) {
        await electron_1.ipcRenderer.invoke("hoshi:set-ignore-mouse-events", ignore);
    },
    async moveWindowBy(dx, dy) {
        await electron_1.ipcRenderer.invoke("hoshi:move-window-by", dx, dy);
    },
    async downloadWhisperModel() {
        return (await electron_1.ipcRenderer.invoke("hoshi:download-whisper-model"));
    },
    async getSettings() {
        return (await electron_1.ipcRenderer.invoke("hoshi:get-settings"));
    },
    async saveSettings(settings) {
        return (await electron_1.ipcRenderer.invoke("hoshi:save-settings", settings));
    },
    async testGsv(baseUrl) {
        return (await electron_1.ipcRenderer.invoke("hoshi:test-gsv", baseUrl));
    },
    async listPlugins() {
        const config = await hoshiApi.getConfig();
        const response = await fetch(`${config.agentBaseUrl}/v1/plugins`, {
            headers: agentHeaders(config)
        });
        if (!response.ok) {
            throw new Error(`list plugins failed: ${response.status}`);
        }
        return (await response.json());
    },
    async openPluginsDir() {
        await electron_1.ipcRenderer.invoke("hoshi:open-plugins-dir");
    },
    async openSettings() {
        await electron_1.ipcRenderer.invoke("hoshi:open-settings");
    },
    onSettingsUpdated(handler) {
        electron_1.ipcRenderer.on("hoshi:settings-updated", (_event, settings) => {
            if (configCache) {
                configCache = { ...configCache, presentation: settings.presentation };
            }
            handler(settings);
        });
    },
    async chat(payload, onEvent) {
        if (activeController) {
            activeController.abort();
        }
        activeController = new AbortController();
        const config = await hoshiApi.getConfig();
        const response = await fetch(`${config.agentBaseUrl}/v1/chat`, {
            method: "POST",
            headers: agentHeaders(config, { "Content-Type": "application/json" }),
            body: JSON.stringify(payload),
            signal: activeController.signal
        });
        if (!response.ok || !response.body) {
            throw new Error(`chat request failed: ${response.status}`);
        }
        const decoder = new TextDecoder();
        const reader = response.body.getReader();
        let pending = "";
        while (true) {
            const { value, done } = await reader.read();
            if (done) {
                break;
            }
            pending += decoder.decode(value, { stream: true });
            const chunks = pending.split("\n\n");
            pending = chunks.pop() ?? "";
            for (const chunk of chunks) {
                for (const event of parseSseChunk(`${chunk}\n\n`)) {
                    onEvent(event);
                }
            }
        }
    },
    async listSessions() {
        const config = await hoshiApi.getConfig();
        const response = await fetch(`${config.agentBaseUrl}/v1/sessions`, {
            headers: agentHeaders(config)
        });
        if (!response.ok) {
            throw new Error(`list sessions failed: ${response.status}`);
        }
        const data = (await response.json());
        return data.sessions;
    },
    async createSession(title) {
        const config = await hoshiApi.getConfig();
        const response = await fetch(`${config.agentBaseUrl}/v1/sessions`, {
            method: "POST",
            headers: agentHeaders(config, { "Content-Type": "application/json" }),
            body: JSON.stringify({ title })
        });
        if (!response.ok) {
            throw new Error(`create session failed: ${response.status}`);
        }
        return (await response.json());
    },
    async deleteSession(sessionId) {
        const config = await hoshiApi.getConfig();
        const response = await fetch(`${config.agentBaseUrl}/v1/sessions/${sessionId}`, {
            method: "DELETE",
            headers: agentHeaders(config)
        });
        if (!response.ok) {
            throw new Error(`delete session failed: ${response.status}`);
        }
    },
    async listSessionMessages(sessionId) {
        const config = await hoshiApi.getConfig();
        const response = await fetch(`${config.agentBaseUrl}/v1/sessions/${sessionId}/messages`, {
            headers: agentHeaders(config)
        });
        if (!response.ok) {
            throw new Error(`list session messages failed: ${response.status}`);
        }
        return (await response.json());
    },
    async getUsage() {
        const config = await hoshiApi.getConfig();
        const response = await fetch(`${config.agentBaseUrl}/v1/usage`, {
            headers: agentHeaders(config)
        });
        if (!response.ok) {
            throw new Error(`get usage failed: ${response.status}`);
        }
        return (await response.json());
    },
    async listMemories() {
        const config = await hoshiApi.getConfig();
        const response = await fetch(`${config.agentBaseUrl}/v1/memories`, {
            headers: agentHeaders(config)
        });
        if (!response.ok) {
            throw new Error(`list memories failed: ${response.status}`);
        }
        return (await response.json());
    },
    async deleteMemory(id) {
        const config = await hoshiApi.getConfig();
        const response = await fetch(`${config.agentBaseUrl}/v1/memories/${id}`, {
            method: "DELETE",
            headers: agentHeaders(config)
        });
        if (!response.ok) {
            throw new Error(`delete memory failed: ${response.status}`);
        }
    },
    async updateMemory(id, text) {
        const config = await hoshiApi.getConfig();
        const response = await fetch(`${config.agentBaseUrl}/v1/memories/${id}`, {
            method: "PATCH",
            headers: agentHeaders(config, { "Content-Type": "application/json" }),
            body: JSON.stringify({ text })
        });
        if (!response.ok) {
            throw new Error(`update memory failed: ${response.status}`);
        }
        return (await response.json());
    },
    async listArchivedMemories() {
        const config = await hoshiApi.getConfig();
        const response = await fetch(`${config.agentBaseUrl}/v1/memories?status=superseded`, {
            headers: agentHeaders(config)
        });
        if (!response.ok) {
            throw new Error(`list archived memories failed: ${response.status}`);
        }
        return (await response.json());
    },
    async restoreMemory(id) {
        const config = await hoshiApi.getConfig();
        const response = await fetch(`${config.agentBaseUrl}/v1/memories/${id}/restore`, {
            method: "POST",
            headers: agentHeaders(config)
        });
        if (!response.ok) {
            throw new Error(`restore memory failed: ${response.status}`);
        }
    },
    async transcribe(audioWavBase64, sessionId) {
        if (transcribeController) {
            transcribeController.abort();
        }
        transcribeController = new AbortController();
        const config = await hoshiApi.getConfig();
        const timeout = AbortSignal.timeout(25000);
        const signal = typeof AbortSignal.any === "function"
            ? AbortSignal.any([transcribeController.signal, timeout])
            : transcribeController.signal;
        const response = await fetch(`${config.agentBaseUrl}/v1/transcribe`, {
            method: "POST",
            headers: agentHeaders(config, { "Content-Type": "application/json" }),
            body: JSON.stringify({ audioWavBase64, sessionId }),
            signal
        });
        if (!response.ok) {
            let extra = `${response.status}`;
            try {
                const err = (await response.json());
                if (err.message) {
                    extra = `${response.status} ${err.message}`;
                }
            }
            catch {
                // ignore
            }
            throw new Error(`transcribe failed: ${extra}`);
        }
        const data = (await response.json());
        return (data.text ?? "").trim();
    },
    async startVoice(sessionId, onEvent) {
        hoshiApi.stopVoice();
        const config = await hoshiApi.getConfig();
        const wsUrl = agentWsUrl(config, "/v1/voice");
        await new Promise((resolve, reject) => {
            const socket = new WebSocket(wsUrl);
            socket.binaryType = "arraybuffer";
            voiceWs = socket;
            socket.addEventListener("open", () => {
                socket.send(JSON.stringify({ type: "start", sessionId }));
                resolve();
            });
            socket.addEventListener("error", () => {
                reject(new Error("voice ws failed"));
            });
            socket.addEventListener("message", (event) => {
                emitWsPayload(onEvent, event.data);
            });
        });
    },
    sendVoicePcm(pcm) {
        if (voiceWs && voiceWs.readyState === WebSocket.OPEN) {
            voiceWs.send(pcm);
        }
    },
    bargeVoice() {
        if (voiceWs && voiceWs.readyState === WebSocket.OPEN) {
            voiceWs.send(JSON.stringify({ type: "barge" }));
        }
    },
    voiceTtsEnd() {
        if (voiceWs && voiceWs.readyState === WebSocket.OPEN) {
            voiceWs.send(JSON.stringify({ type: "tts_end" }));
        }
    },
    stopVoice() {
        if (voiceWs && voiceWs.readyState === WebSocket.OPEN) {
            try {
                voiceWs.send(JSON.stringify({ type: "stop" }));
            }
            catch {
                // ignore
            }
        }
        voiceWs?.close();
        voiceWs = null;
    },
    onVoiceClose(handler) {
        const socket = voiceWs;
        if (!socket) {
            return;
        }
        socket.addEventListener("close", () => handler());
    },
    async startSpeak(onEvent) {
        hoshiApi.stopSpeak();
        const config = await hoshiApi.getConfig();
        const wsUrl = agentWsUrl(config, "/v1/tts");
        await new Promise((resolve, reject) => {
            const socket = new WebSocket(wsUrl);
            socket.binaryType = "arraybuffer";
            ttsWs = socket;
            socket.addEventListener("open", () => resolve());
            socket.addEventListener("error", () => {
                reject(new Error("tts ws failed"));
            });
            socket.addEventListener("message", (event) => {
                emitWsPayload(onEvent, event.data);
            });
        });
    },
    speakText(text) {
        if (ttsWs && ttsWs.readyState === WebSocket.OPEN) {
            ttsWs.send(JSON.stringify({ type: "speak", text }));
        }
    },
    finishSpeak() {
        if (ttsWs && ttsWs.readyState === WebSocket.OPEN) {
            ttsWs.send(JSON.stringify({ type: "finish" }));
        }
    },
    stopSpeak() {
        if (ttsWs && ttsWs.readyState === WebSocket.OPEN) {
            try {
                ttsWs.send(JSON.stringify({ type: "stop" }));
            }
            catch {
                // ignore
            }
        }
        ttsWs?.close();
        ttsWs = null;
    }
};
electron_1.contextBridge.exposeInMainWorld("hoshi", hoshiApi);
