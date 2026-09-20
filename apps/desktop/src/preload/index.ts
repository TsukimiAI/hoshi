import { contextBridge, ipcRenderer } from "electron";
import type {
  AgentEvent,
  Emotion,
  HoshiSettings,
  MemoryItem,
  MemoryListResponse,
  PresentationSettings,
  SessionItem,
  SessionMessagesResponse,
  PluginListResponse,
  UsageSummaryResponse
} from "@hoshi/shared";

interface RendererConfig {
  agentBaseUrl: string;
  agentToken: string;
  defaultEmotion: Emotion;
  thinkingEmotion: Emotion;
  presentation: PresentationSettings;
}

let activeController: AbortController | null = null;
let transcribeController: AbortController | null = null;
let voiceWs: WebSocket | null = null;
let ttsWs: WebSocket | null = null;
function bytesToB64(bytes: Uint8Array): string {
  const chunk = 0x2000;
  let bin = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function emitWsPayload(
  onEvent: (payload: Record<string, unknown>) => void,
  data: unknown
): void {
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
      onEvent(JSON.parse(data) as Record<string, unknown>);
    } catch {
      // ignore
    }
  }
}
let configCache: RendererConfig | null = null;

function agentHeaders(config: RendererConfig, extra?: Record<string, string>): Record<string, string> {
  return { Authorization: `Bearer ${config.agentToken}`, ...extra };
}

function agentWsUrl(config: RendererConfig, path: string): string {
  return `${config.agentBaseUrl.replace(/^http/, "ws")}${path}?token=${encodeURIComponent(config.agentToken)}`;
}

function parseSseChunk(chunk: string): AgentEvent[] {
  const blocks = chunk.split("\n\n");
  const events: AgentEvent[] = [];
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
      const data = JSON.parse(dataRaw) as AgentEvent["data"];
      if (
        event === "emotion" ||
        event === "sentence" ||
        event === "done" ||
        event === "error"
      ) {
        events.push({ event, data } as AgentEvent);
      }
    } catch {
      continue;
    }
  }
  return events;
}

const hoshiApi = {
  async getConfig() {
    if (!configCache) {
      configCache = (await ipcRenderer.invoke("hoshi:get-config")) as RendererConfig;
    }
    return configCache;
  },
  async getSpriteData(emotion: Emotion) {
    return (await ipcRenderer.invoke("hoshi:get-sprite-data", emotion)) as string;
  },
  async setIgnoreMouseEvents(ignore: boolean) {
    await ipcRenderer.invoke("hoshi:set-ignore-mouse-events", ignore);
  },
  async moveWindowBy(dx: number, dy: number) {
    await ipcRenderer.invoke("hoshi:move-window-by", dx, dy);
  },
  async downloadWhisperModel() {
    return (await ipcRenderer.invoke("hoshi:download-whisper-model")) as { ok: true; path: string };
  },
  async getSettings() {
    return (await ipcRenderer.invoke("hoshi:get-settings")) as HoshiSettings;
  },
  async saveSettings(settings: HoshiSettings) {
    return (await ipcRenderer.invoke("hoshi:save-settings", settings)) as HoshiSettings;
  },
  async testGsv(baseUrl: string) {
    return (await ipcRenderer.invoke("hoshi:test-gsv", baseUrl)) as { ok: true };
  },
  async listPlugins() {
    const config = await hoshiApi.getConfig();
    const response = await fetch(`${config.agentBaseUrl}/v1/plugins`, {
      headers: agentHeaders(config)
    });
    if (!response.ok) {
      throw new Error(`list plugins failed: ${response.status}`);
    }
    return (await response.json()) as PluginListResponse;
  },
  async openPluginsDir() {
    await ipcRenderer.invoke("hoshi:open-plugins-dir");
  },
  async openSettings() {
    await ipcRenderer.invoke("hoshi:open-settings");
  },
  onSettingsUpdated(handler: (settings: HoshiSettings) => void) {
    ipcRenderer.on("hoshi:settings-updated", (_event, settings: HoshiSettings) => {
      if (configCache) {
        configCache = { ...configCache, presentation: settings.presentation };
      }
      handler(settings);
    });
  },
  async chat(
    payload: { message: string; sessionId: string },
    onEvent: (event: AgentEvent) => void
  ) {
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
    const data = (await response.json()) as { sessions: SessionItem[] };
    return data.sessions;
  },
  async createSession(title?: string) {
    const config = await hoshiApi.getConfig();
    const response = await fetch(`${config.agentBaseUrl}/v1/sessions`, {
      method: "POST",
      headers: agentHeaders(config, { "Content-Type": "application/json" }),
      body: JSON.stringify({ title })
    });
    if (!response.ok) {
      throw new Error(`create session failed: ${response.status}`);
    }
    return (await response.json()) as SessionItem;
  },
  async deleteSession(sessionId: string) {
    const config = await hoshiApi.getConfig();
    const response = await fetch(`${config.agentBaseUrl}/v1/sessions/${sessionId}`, {
      method: "DELETE",
      headers: agentHeaders(config)
    });
    if (!response.ok) {
      throw new Error(`delete session failed: ${response.status}`);
    }
  },
  async listSessionMessages(sessionId: string) {
    const config = await hoshiApi.getConfig();
    const response = await fetch(`${config.agentBaseUrl}/v1/sessions/${sessionId}/messages`, {
      headers: agentHeaders(config)
    });
    if (!response.ok) {
      throw new Error(`list session messages failed: ${response.status}`);
    }
    return (await response.json()) as SessionMessagesResponse;
  },
  async getUsage() {
    const config = await hoshiApi.getConfig();
    const response = await fetch(`${config.agentBaseUrl}/v1/usage`, {
      headers: agentHeaders(config)
    });
    if (!response.ok) {
      throw new Error(`get usage failed: ${response.status}`);
    }
    return (await response.json()) as UsageSummaryResponse;
  },
  async listMemories() {
    const config = await hoshiApi.getConfig();
    const response = await fetch(`${config.agentBaseUrl}/v1/memories`, {
      headers: agentHeaders(config)
    });
    if (!response.ok) {
      throw new Error(`list memories failed: ${response.status}`);
    }
    return (await response.json()) as MemoryListResponse;
  },
  async deleteMemory(id: string) {
    const config = await hoshiApi.getConfig();
    const response = await fetch(`${config.agentBaseUrl}/v1/memories/${id}`, {
      method: "DELETE",
      headers: agentHeaders(config)
    });
    if (!response.ok) {
      throw new Error(`delete memory failed: ${response.status}`);
    }
  },
  async updateMemory(id: string, text: string) {
    const config = await hoshiApi.getConfig();
    const response = await fetch(`${config.agentBaseUrl}/v1/memories/${id}`, {
      method: "PATCH",
      headers: agentHeaders(config, { "Content-Type": "application/json" }),
      body: JSON.stringify({ text })
    });
    if (!response.ok) {
      throw new Error(`update memory failed: ${response.status}`);
    }
    return (await response.json()) as MemoryItem;
  },
  async listArchivedMemories() {
    const config = await hoshiApi.getConfig();
    const response = await fetch(`${config.agentBaseUrl}/v1/memories?status=superseded`, {
      headers: agentHeaders(config)
    });
    if (!response.ok) {
      throw new Error(`list archived memories failed: ${response.status}`);
    }
    return (await response.json()) as MemoryListResponse;
  },
  async restoreMemory(id: string) {
    const config = await hoshiApi.getConfig();
    const response = await fetch(`${config.agentBaseUrl}/v1/memories/${id}/restore`, {
      method: "POST",
      headers: agentHeaders(config)
    });
    if (!response.ok) {
      throw new Error(`restore memory failed: ${response.status}`);
    }
  },
  async transcribe(audioWavBase64: string, sessionId?: string) {
    if (transcribeController) {
      transcribeController.abort();
    }
    transcribeController = new AbortController();
    const config = await hoshiApi.getConfig();
    const timeout = AbortSignal.timeout(25000);
    const signal =
      typeof AbortSignal.any === "function"
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
        const err = (await response.json()) as { message?: string };
        if (err.message) {
          extra = `${response.status} ${err.message}`;
        }
      } catch {
        // ignore
      }
      throw new Error(`transcribe failed: ${extra}`);
    }
    const data = (await response.json()) as { text?: string };
    return (data.text ?? "").trim();
  },
  async startVoice(sessionId: string, onEvent: (payload: Record<string, unknown>) => void) {
    hoshiApi.stopVoice();
    const config = await hoshiApi.getConfig();
    const wsUrl = agentWsUrl(config, "/v1/voice");
    await new Promise<void>((resolve, reject) => {
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
  sendVoicePcm(pcm: ArrayBuffer) {
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
      } catch {
        // ignore
      }
    }
    voiceWs?.close();
    voiceWs = null;
  },
  onVoiceClose(handler: () => void) {
    const socket = voiceWs;
    if (!socket) {
      return;
    }
    socket.addEventListener("close", () => handler());
  },
  async startSpeak(onEvent: (payload: Record<string, unknown>) => void) {
    hoshiApi.stopSpeak();
    const config = await hoshiApi.getConfig();
    const wsUrl = agentWsUrl(config, "/v1/tts");
    await new Promise<void>((resolve, reject) => {
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
  speakText(text: string) {
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
      } catch {
        // ignore
      }
    }
    ttsWs?.close();
    ttsWs = null;
  }
};

contextBridge.exposeInMainWorld("hoshi", hoshiApi);
