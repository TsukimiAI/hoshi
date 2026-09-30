import { contextBridge, ipcRenderer } from "electron";
import type {
  AgentEvent,
  CanvasItem,
  CanvasSnapshotListResponse,
  Emotion,
  HoshiSettings,
  MemoryItem,
  MemoryListResponse,
  PresentationSettings,
  SessionItem,
  SessionKind,
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
        event === "error" ||
        event === "citation" ||
        event === "canvas" ||
        event === "turn" ||
        event === "progress"
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
  async getThemeSound() {
    return (await ipcRenderer.invoke("hoshi:get-theme-sound")) as string;
  },
  async listPluginActions() {
    return (await ipcRenderer.invoke("hoshi:list-plugin-actions")) as {
      pluginId: string;
      id: string;
      label: string;
      window: string;
      kind?: "panel";
    }[];
  },
  async openPluginWindow(pluginId: string, windowId: string) {
    await ipcRenderer.invoke("hoshi:open-plugin-window", { pluginId, window: windowId });
  },
  async openPluginPanel(pluginId: string) {
    await ipcRenderer.invoke("hoshi:open-plugin-panel", pluginId);
  },
  async openAppBox() {
    await ipcRenderer.invoke("hoshi:open-app-box");
  },
  onPluginPanel(handler: (open: boolean, width: number) => void) {
    ipcRenderer.on("hoshi:plugin-panel", (_event, payload: { open?: unknown; width?: unknown }) => {
      handler(Boolean(payload?.open), Number(payload?.width ?? 0));
    });
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
  async openWorkbench() {
    await ipcRenderer.invoke("hoshi:open-workbench");
  },
  async listSandboxPlugins() {
    return (await ipcRenderer.invoke("hoshi:list-sandbox-plugins")) as {
      id: string;
      template: "panel" | "launcher" | "mcp" | "theme";
    }[];
  },
  async listLivePlugins() {
    return (await ipcRenderer.invoke("hoshi:list-live-plugins")) as {
      id: string;
      name: string;
      description: string;
      cover: string;
      template: "panel" | "launcher" | "mcp" | "theme";
      enabled: boolean;
    }[];
  },
  async listMcpServers() {
    return (await ipcRenderer.invoke("hoshi:list-mcp-servers")) as {
      name: string;
      command: string;
      args: string[];
      env: Record<string, string>;
      enabled: boolean;
      connected: boolean;
      toolNames: string[];
      lastError: string;
    }[];
  },
  async listMcpTemplates() {
    return (await ipcRenderer.invoke("hoshi:list-mcp-templates")) as {
      id: string;
      name: string;
      description: string;
      hints: string;
      command: string;
      args: string[];
      env: Record<string, string>;
    }[];
  },
  async upsertMcpServer(server: {
    name: string;
    command: string;
    args: string[];
    env: Record<string, string>;
    enabled?: boolean;
  }) {
    return (await ipcRenderer.invoke("hoshi:upsert-mcp-server", server)) as {
      ok: boolean;
      server: {
        name: string;
        command: string;
        args: string[];
        env: Record<string, string>;
        enabled: boolean;
        connected: boolean;
        toolNames: string[];
        lastError: string;
      } | null;
    };
  },
  async probeMcpServer(server: { name: string; command: string; args: string[]; env: Record<string, string> }) {
    return (await ipcRenderer.invoke("hoshi:probe-mcp-server", server)) as {
      ok: boolean;
      toolNames: string[];
      error: string;
    };
  },
  async setMcpEnabled(name: string, enabled: boolean) {
    return (await ipcRenderer.invoke("hoshi:set-mcp-enabled", { name, enabled })) as { ok: true };
  },
  async removeMcpServer(name: string) {
    return (await ipcRenderer.invoke("hoshi:remove-mcp-server", name)) as { ok: true };
  },
  async revealMcpConfig() {
    return (await ipcRenderer.invoke("hoshi:reveal-mcp-config")) as { ok: true };
  },
  async getTheme() {
    return (await ipcRenderer.invoke("hoshi:get-theme")) as {
      id: string;
      tokens: { bg: string; font: string; dialog: string; menu: string; sound: string };
    } | null;
  },
  async previewTheme(tokens: { bg?: string; font?: string; dialog?: string; menu?: string } | null) {
    return (await ipcRenderer.invoke("hoshi:preview-theme", tokens)) as { ok: true };
  },
  onThemePreview(handler: (tokens: { bg: string; font: string; dialog: string; menu: string } | null) => void) {
    ipcRenderer.on("hoshi:theme-preview", (_event, tokens: { bg: string; font: string; dialog: string; menu: string } | null) => {
      handler(tokens ?? null);
    });
  },
  async readThemePack(id: string) {
    return (await ipcRenderer.invoke("hoshi:read-theme-pack", id)) as {
      name: string;
      description: string;
      tokens: { bg: string; font: string; dialog: string; menu: string; sound: string };
      sprites: Record<string, string>;
    };
  },
  async readLiveThemePack(id: string) {
    return (await ipcRenderer.invoke("hoshi:read-live-theme-pack", id)) as {
      name: string;
      description: string;
      tokens: { bg: string; font: string; dialog: string; menu: string; sound: string };
      sprites: Record<string, string>;
    };
  },
  async writeThemePack(
    id: string,
    pack: {
      name: string;
      description: string;
      tokens: { bg: string; font: string; dialog: string; menu: string; sound: string };
      sprites: Record<string, string>;
    }
  ) {
    return (await ipcRenderer.invoke("hoshi:write-theme-pack", { id, pack })) as {
      name: string;
      description: string;
      tokens: { bg: string; font: string; dialog: string; menu: string; sound: string };
      sprites: Record<string, string>;
    };
  },
  async readLayout(id: string) {
    return (await ipcRenderer.invoke("hoshi:read-layout", id)) as {
      nodes: { id: string; type: string; x: number; y: number; w: number; h: number; src?: string; text?: string }[];
    };
  },
  async writeLayout(
    id: string,
    nodes: { id: string; type: string; x: number; y: number; w: number; h: number; src?: string; text?: string }[]
  ) {
    return (await ipcRenderer.invoke("hoshi:write-layout", { id, nodes })) as { nodes: unknown[] };
  },
  async uploadSandboxAsset(id: string, rel: string, b64: string) {
    return (await ipcRenderer.invoke("hoshi:upload-sandbox-asset", { id, rel, b64 })) as { rel: string };
  },
  async sandboxAssetUrl(id: string, rel: string, live?: boolean) {
    return (await ipcRenderer.invoke("hoshi:sandbox-asset-url", { id, rel, live: live === true })) as { url: string };
  },
  async readSandboxPluginForm(id: string) {
    return (await ipcRenderer.invoke("hoshi:read-sandbox-plugin-form", id)) as {
      id: string;
      template: "panel" | "launcher" | "mcp" | "theme";
      name: string;
      description: string;
      label: string;
      title: string;
      multiple: boolean;
      filters: { name: string; extensions: string[] }[];
    };
  },
  async patchSandboxPluginForm(
    id: string,
    patch: {
      name: string;
      description: string;
      label: string;
      title: string;
      multiple: boolean;
      filters: { name: string; extensions: string[] }[];
    }
  ) {
    return (await ipcRenderer.invoke("hoshi:patch-sandbox-plugin-form", { id, ...patch })) as {
      id: string;
      template: "panel" | "launcher" | "mcp" | "theme";
      name: string;
      description: string;
      label: string;
      title: string;
      multiple: boolean;
      filters: { name: string; extensions: string[] }[];
    };
  },
  async createSandboxPlugin(
    dirName: string,
    kind?: "mcp" | "panel" | "launcher" | "theme"
  ) {
    return (await ipcRenderer.invoke("hoshi:create-sandbox-plugin", {
      id: dirName,
      kind: kind ?? "theme"
    })) as { id: string };
  },
  async deleteSandboxPlugin(dirName: string) {
    return (await ipcRenderer.invoke("hoshi:delete-sandbox-plugin", dirName)) as { id: string };
  },
  async workbenchIme(focused: boolean) {
    await ipcRenderer.invoke("hoshi:workbench-ime", focused);
  },
  async publishSandboxPlugin(dirName: string) {
    return (await ipcRenderer.invoke("hoshi:publish-sandbox-plugin", dirName)) as
      | { ok: true; id: string; howToUse?: string }
      | { ok: false; error: string };
  },
  onSettingsUpdated(handler: (settings: HoshiSettings) => void) {
    ipcRenderer.on("hoshi:settings-updated", (_event, settings: HoshiSettings) => {
      if (configCache) {
        configCache = { ...configCache, presentation: settings.presentation };
      }
      handler(settings);
    });
  },
  async listKbCollections() {
    const config = await hoshiApi.getConfig();
    const response = await fetch(`${config.agentBaseUrl}/v1/kb/collections`, {
      headers: agentHeaders(config)
    });
    if (!response.ok) {
      throw new Error(`list kb collections failed: ${response.status}`);
    }
    return (await response.json()) as {
      collections: Array<{ id: string; name: string; description: string; enabled: boolean; documentCount: number; createdAt: string; updatedAt: string }>;
      capabilities: { vectorAvailable: boolean; embeddingModel: string; embeddingDim: number; pendingJobs: number };
    };
  },
  async createKbCollection(name: string, description?: string) {
    const config = await hoshiApi.getConfig();
    const response = await fetch(`${config.agentBaseUrl}/v1/kb/collections`, {
      method: "POST",
      headers: agentHeaders(config, { "Content-Type": "application/json" }),
      body: JSON.stringify({ name, description })
    });
    if (!response.ok) {
      throw new Error(`create kb collection failed: ${response.status}`);
    }
    return (await response.json()) as { id: string; name: string };
  },
  async deleteKbCollection(id: string) {
    const config = await hoshiApi.getConfig();
    const response = await fetch(`${config.agentBaseUrl}/v1/kb/collections/${id}`, {
      method: "DELETE",
      headers: agentHeaders(config)
    });
    if (!response.ok) {
      throw new Error(`delete kb collection failed: ${response.status}`);
    }
    return (await response.json()) as { ok: true };
  },
  async patchKbCollection(id: string, patch: { enabled?: boolean }) {
    const config = await hoshiApi.getConfig();
    const response = await fetch(`${config.agentBaseUrl}/v1/kb/collections/${id}`, {
      method: "PATCH",
      headers: agentHeaders(config, { "Content-Type": "application/json" }),
      body: JSON.stringify(patch)
    });
    if (!response.ok) {
      throw new Error(`patch kb collection failed: ${response.status}`);
    }
    return (await response.json()) as { id: string; name: string; enabled: boolean };
  },
  async listKbDocuments(collectionId: string) {
    const config = await hoshiApi.getConfig();
    const response = await fetch(`${config.agentBaseUrl}/v1/kb/collections/${collectionId}/documents`, {
      headers: agentHeaders(config)
    });
    if (!response.ok) {
      throw new Error(`list kb documents failed: ${response.status}`);
    }
    return (await response.json()) as { documents: Array<{ id: string; collectionId: string; title: string; sourceName: string; mime: string; sizeBytes: number; status: string; error: string; chunkCount: number; createdAt: string; updatedAt: string }> };
  },
  async importKbDocument(collectionId: string, input: { title: string; text: string; sourceName?: string }) {
    const config = await hoshiApi.getConfig();
    const response = await fetch(`${config.agentBaseUrl}/v1/kb/collections/${collectionId}/documents`, {
      method: "POST",
      headers: agentHeaders(config, { "Content-Type": "application/json" }),
      body: JSON.stringify({ title: input.title, text: input.text, sourceName: input.sourceName })
    });
    if (!response.ok) {
      throw new Error(`import kb document failed: ${response.status}`);
    }
    return (await response.json()) as {
      doc: { id: string; status: string };
      action: "created" | "updated" | "skipped";
    };
  },
  async retryKbDocument(id: string) {
    const config = await hoshiApi.getConfig();
    const response = await fetch(`${config.agentBaseUrl}/v1/kb/documents/${id}/retry`, {
      method: "POST",
      headers: agentHeaders(config)
    });
    if (!response.ok) {
      throw new Error(`retry kb document failed: ${response.status}`);
    }
    return (await response.json()) as { id: string; status: string };
  },
  async deleteKbDocument(id: string) {
    const config = await hoshiApi.getConfig();
    const response = await fetch(`${config.agentBaseUrl}/v1/kb/documents/${id}`, {
      method: "DELETE",
      headers: agentHeaders(config)
    });
    if (!response.ok) {
      throw new Error(`delete kb document failed: ${response.status}`);
    }
    return (await response.json()) as { ok: true };
  },
  async setKbDocumentDisabled(id: string, disabled: boolean) {
    const config = await hoshiApi.getConfig();
    const response = await fetch(`${config.agentBaseUrl}/v1/kb/documents/${id}`, {
      method: "PATCH",
      headers: agentHeaders(config, { "Content-Type": "application/json" }),
      body: JSON.stringify({ disabled })
    });
    if (!response.ok) {
      throw new Error(`set kb document disabled failed: ${response.status}`);
    }
    return (await response.json()) as { ok: true };
  },
  async searchKb(query: string, collectionIds?: string[], includeTrace?: boolean) {
    const config = await hoshiApi.getConfig();
    const response = await fetch(`${config.agentBaseUrl}/v1/kb/search`, {
      method: "POST",
      headers: agentHeaders(config, { "Content-Type": "application/json" }),
      body: JSON.stringify({ query, collectionIds, includeTrace: includeTrace === true })
    });
    if (!response.ok) {
      throw new Error(`kb search failed: ${response.status}`);
    }
    return (await response.json()) as {
      hits: Array<{ chunkId: string; docId: string; documentTitle: string; collectionId: string; collectionName: string; text: string; score: number }>;
      trace?: {
        query: string;
        vectorHits: Array<{ chunkId: string; score: number; text: string }>;
        keywordHits: Array<{ chunkId: string; score: number; text: string }>;
        fusedHits: Array<{ chunkId: string; score: number; text: string }>;
        finalHits: Array<{ chunkId: string; score: number; text: string }>;
        reranked: boolean;
        latencyMs: { embed: number; vector: number; keyword: number; fuse: number; rerank: number; total: number };
      };
    };
  },
  async listKbChunks(documentId: string) {
    const config = await hoshiApi.getConfig();
    const response = await fetch(`${config.agentBaseUrl}/v1/kb/documents/${documentId}/chunks?limit=100`, {
      headers: agentHeaders(config)
    });
    if (!response.ok) {
      throw new Error(`list kb chunks failed: ${response.status}`);
    }
    return (await response.json()) as { chunks: Array<{ id: string; documentId: string; seq: number; text: string }>; total: number };
  },
  async updateKbChunk(chunkId: string, text: string) {
    const config = await hoshiApi.getConfig();
    const response = await fetch(`${config.agentBaseUrl}/v1/kb/chunks/${chunkId}`, {
      method: "PATCH",
      headers: agentHeaders(config, { "Content-Type": "application/json" }),
      body: JSON.stringify({ text })
    });
    if (!response.ok) {
      throw new Error(`update kb chunk failed: ${response.status}`);
    }
    return (await response.json()) as { ok: true };
  },
  async reindexKb() {
    const config = await hoshiApi.getConfig();
    const response = await fetch(`${config.agentBaseUrl}/v1/kb/reindex-all`, {
      method: "POST",
      headers: agentHeaders(config)
    });
    if (!response.ok) {
      throw new Error(`reindex kb failed: ${response.status}`);
    }
    return (await response.json()) as { chunks: number };
  },
  async listKbJobs() {
    const config = await hoshiApi.getConfig();
    const response = await fetch(`${config.agentBaseUrl}/v1/kb/jobs`, {
      headers: agentHeaders(config)
    });
    if (!response.ok) {
      throw new Error(`list kb jobs failed: ${response.status}`);
    }
    return (await response.json()) as {
      jobs: Array<{ id: string; documentId: string; kind: string; status: string; attempt: number; error: string; createdAt: string; updatedAt: string }>;
      pending: number;
    };
  },
  async rememberKbChunk(chunkId: string) {
    const config = await hoshiApi.getConfig();
    const response = await fetch(`${config.agentBaseUrl}/v1/kb/chunks/${encodeURIComponent(chunkId)}/remember`, {
      method: "POST",
      headers: agentHeaders(config)
    });
    if (!response.ok) {
      throw new Error(`remember kb chunk failed: ${response.status}`);
    }
    return (await response.json()) as MemoryItem;
  },
  async fetchUrl(url: string) {
    return (await ipcRenderer.invoke("hoshi:fetch-url", url)) as { text: string; contentType: string };
  },
  async fetchImage(url: string) {
    return (await ipcRenderer.invoke("hoshi:fetch-image", url)) as { mime: string; data: string };
  },
  async parseDocx(fileBase64: string) {
    return (await ipcRenderer.invoke("hoshi:parse-docx", fileBase64)) as { text: string };
  },
  async exportDb() {
    return (await ipcRenderer.invoke("hoshi:export-db")) as { ok: boolean; path?: string };
  },
  async chat(
    payload: {
      message: string;
      sessionId: string;
      workspace?: "desk";
      images?: Array<{ mime: string; data: string }>;
    },
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
  abortChat() {
    activeController?.abort();
  },
  async listSessions(kind: SessionKind = "chat") {
    const config = await hoshiApi.getConfig();
    const response = await fetch(
      `${config.agentBaseUrl}/v1/sessions?kind=${encodeURIComponent(kind)}`,
      {
        headers: agentHeaders(config)
      }
    );
    if (!response.ok) {
      throw new Error(`list sessions failed: ${response.status}`);
    }
    const data = (await response.json()) as { sessions: SessionItem[] };
    return data.sessions;
  },
  async createSession(title?: string, kind: SessionKind = "chat") {
    const config = await hoshiApi.getConfig();
    const response = await fetch(`${config.agentBaseUrl}/v1/sessions`, {
      method: "POST",
      headers: agentHeaders(config, { "Content-Type": "application/json" }),
      body: JSON.stringify({ title, kind })
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
  async listCanvas(sessionId: string) {
    const config = await hoshiApi.getConfig();
    const response = await fetch(
      `${config.agentBaseUrl}/v1/canvas?sessionId=${encodeURIComponent(sessionId)}`,
      { headers: agentHeaders(config) }
    );
    if (!response.ok) {
      throw new Error(`list canvas failed: ${response.status}`);
    }
    return (await response.json()) as { items: CanvasItem[] };
  },
  async listCanvasSnapshots(sessionId: string) {
    const config = await hoshiApi.getConfig();
    const response = await fetch(
      `${config.agentBaseUrl}/v1/sessions/${encodeURIComponent(sessionId)}/canvas-snapshots`,
      { headers: agentHeaders(config) }
    );
    if (!response.ok) {
      throw new Error(`list canvas snapshots failed: ${response.status}`);
    }
    return (await response.json()) as CanvasSnapshotListResponse;
  },
  async patchCanvas(
    id: string,
    patch: { x?: number; y?: number; w?: number; h?: number; z?: number },
    sessionId?: string
  ) {
    const config = await hoshiApi.getConfig();
    const qs = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : "";
    const response = await fetch(`${config.agentBaseUrl}/v1/canvas/${encodeURIComponent(id)}${qs}`, {
      method: "PATCH",
      headers: agentHeaders(config, { "Content-Type": "application/json" }),
      body: JSON.stringify(patch)
    });
    if (!response.ok) {
      throw new Error(`patch canvas failed: ${response.status}`);
    }
    return (await response.json()) as CanvasItem;
  },
  async deleteCanvasItem(id: string, sessionId?: string) {
    const config = await hoshiApi.getConfig();
    const qs = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : "";
    const response = await fetch(`${config.agentBaseUrl}/v1/canvas/${encodeURIComponent(id)}${qs}`, {
      method: "DELETE",
      headers: agentHeaders(config)
    });
    if (!response.ok) {
      throw new Error(`delete canvas failed: ${response.status}`);
    }
  },
  async restoreCanvas(sessionId: string, turnId: string) {
    const config = await hoshiApi.getConfig();
    const response = await fetch(`${config.agentBaseUrl}/v1/canvas/restore`, {
      method: "POST",
      headers: agentHeaders(config, { "Content-Type": "application/json" }),
      body: JSON.stringify({ sessionId, turnId })
    });
    if (!response.ok) {
      throw new Error(`restore canvas failed: ${response.status}`);
    }
    return (await response.json()) as { items: CanvasItem[] };
  },
  async reorderCanvas(sessionId: string, ids: string[]) {
    const config = await hoshiApi.getConfig();
    const response = await fetch(`${config.agentBaseUrl}/v1/canvas/reorder`, {
      method: "POST",
      headers: agentHeaders(config, { "Content-Type": "application/json" }),
      body: JSON.stringify({ sessionId, ids })
    });
    if (!response.ok) {
      throw new Error(`reorder canvas failed: ${response.status}`);
    }
    return (await response.json()) as { items: CanvasItem[] };
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
