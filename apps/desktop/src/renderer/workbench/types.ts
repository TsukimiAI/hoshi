export type PluginTemplateKind = "panel" | "launcher" | "mcp" | "theme";
export type Rail = "desk" | "skin" | "shop" | "connect" | "kb";
export type McpServerRow = {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
  connected: boolean;
  toolNames: string[];
  lastError: string;
};
export type McpTemplate = {
  id: string;
  name: string;
  description: string;
  hints: string;
  command: string;
  args: string[];
  env: Record<string, string>;
};
export type SandboxEntry = { id: string; template: PluginTemplateKind };
export type LiveItem = {
  id: string;
  name: string;
  description: string;
  cover: string;
  template: PluginTemplateKind;
  enabled: boolean;
};
export type KbCollection = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  documentCount: number;
  createdAt: string;
  updatedAt: string;
};
export type KbDocument = {
  id: string;
  collectionId: string;
  title: string;
  sourceName: string;
  mime: string;
  sizeBytes: number;
  status: string;
  error: string;
  chunkCount: number;
  createdAt: string;
  updatedAt: string;
};
export type KbSearchHit = {
  chunkId: string;
  docId: string;
  documentTitle: string;
  collectionId: string;
  collectionName: string;
  text: string;
  score: number;
};
export type KbTraceHit = { chunkId: string; score: number; text: string };
export type KbSearchTrace = {
  query: string;
  vectorHits: KbTraceHit[];
  keywordHits: KbTraceHit[];
  fusedHits: KbTraceHit[];
  finalHits: KbTraceHit[];
  reranked: boolean;
  latencyMs: { embed: number; vector: number; keyword: number; fuse: number; rerank: number; total: number };
};
export type DeskSession = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
};
export type DeskMessage = {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
};
export type DeskCanvasItem = {
  id: string;
  kind: "chart" | "card" | "image" | "note" | "table" | "markdown";
  title: string;
  payload: Record<string, unknown>;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
};
export type DeskAgentEvent =
  | { event: "sentence"; data: { text: string } }
  | { event: "done"; data: { ok: true } }
  | { event: "error"; data: { message: string } }
  | { event: "canvas"; data: { items: DeskCanvasItem[]; turnId?: string; validationError?: string } }
  | { event: "turn"; data: { turnId: string; sessionId: string; userMessageId: string } }
  | { event: "progress"; data: { phase: "think" | "think_done" | "tool_start" | "tool_done"; name?: string; detail?: string; ok?: boolean; elapsedMs?: number } }
  | { event: "emotion"; data: Record<string, unknown> }
  | { event: "citation"; data: Record<string, unknown> };
export type DeskStep = {
  kind: "think" | "tool" | "reply";
  name?: string;
  detail?: string;
  elapsedMs?: number;
  ok?: boolean;
};
export type DeskTurn = {
  id: string;
  userMessageId?: string;
  title: string;
  open: boolean;
  steps: DeskStep[];
  canvasItems?: DeskCanvasItem[];
};
export type LayoutNode = {
  id: string;
  type: "image" | "text" | "deco";
  x: number;
  y: number;
  w: number;
  h: number;
  src?: string;
  text?: string;
};
export const EMOTION_KEYS = [
  "normal",
  "happy",
  "very-happy",
  "like",
  "very-like",
  "sad",
  "angry",
  "shy",
  "shy-and-indignation",
  "shock",
  "doubt",
  "confused",
  "expect",
  "wry",
  "disdain",
  "resist",
  "resentment",
  "yandere"
];
export type SkinForm = {
  id: string;
  template: PluginTemplateKind;
  name: string;
  description: string;
  label: string;
  title: string;
  multiple: boolean;
  filters: { name: string; extensions: string[] }[];
};

export type WorkbenchApi = {
  listSandboxPlugins: () => Promise<SandboxEntry[]>;
  listLivePlugins: () => Promise<LiveItem[]>;
  listMcpServers: () => Promise<McpServerRow[]>;
  listMcpTemplates: () => Promise<McpTemplate[]>;
  upsertMcpServer: (server: {
    name: string;
    command: string;
    args: string[];
    env: Record<string, string>;
    enabled?: boolean;
  }) => Promise<{ ok: boolean; server: McpServerRow | null }>;
  probeMcpServer: (server: {
    name: string;
    command: string;
    args: string[];
    env: Record<string, string>;
  }) => Promise<{ ok: boolean; toolNames: string[]; error: string }>;
  setMcpEnabled: (name: string, enabled: boolean) => Promise<{ ok: true }>;
  removeMcpServer: (name: string) => Promise<{ ok: true }>;
  revealMcpConfig: () => Promise<{ ok: true }>;
  readSandboxPluginForm: (id: string) => Promise<SkinForm>;
  patchSandboxPluginForm: (
    id: string,
    patch: {
      name: string;
      description: string;
      label: string;
      title: string;
      multiple: boolean;
      filters: { name: string; extensions: string[] }[];
    }
  ) => Promise<SkinForm>;
  getSettings: () => Promise<{ plugins: { enabled: string[]; configs: Record<string, Record<string, string>> } } & Record<string, unknown>>;
  saveSettings: (settings: unknown) => Promise<unknown>;
  getTheme: () => Promise<{ tokens: { bg: string; font: string; dialog: string; menu: string; sound: string } } | null>;
  previewTheme: (tokens: { bg: string; font: string; dialog: string; menu: string } | null) => Promise<{ ok: true }>;
  readThemePack: (id: string) => Promise<{
    name: string;
    description: string;
    tokens: { bg: string; font: string; dialog: string; menu: string; sound: string };
    sprites: Record<string, string>;
  }>;
  readLiveThemePack: (id: string) => Promise<{
    name: string;
    description: string;
    tokens: { bg: string; font: string; dialog: string; menu: string; sound: string };
    sprites: Record<string, string>;
  }>;
  writeThemePack: (
    id: string,
    pack: {
      name: string;
      description: string;
      tokens: { bg: string; font: string; dialog: string; menu: string; sound: string };
      sprites: Record<string, string>;
    }
  ) => Promise<{
    name: string;
    description: string;
    tokens: { bg: string; font: string; dialog: string; menu: string; sound: string };
    sprites: Record<string, string>;
  }>;
  readLayout: (id: string) => Promise<{ nodes: LayoutNode[] }>;
  writeLayout: (id: string, nodes: LayoutNode[]) => Promise<unknown>;
  uploadSandboxAsset: (id: string, rel: string, b64: string) => Promise<{ rel: string }>;
  sandboxAssetUrl: (id: string, rel: string, live?: boolean) => Promise<{ url: string }>;
  createSandboxPlugin: (
    id: string,
    kind?: "mcp" | "panel" | "launcher" | "theme"
  ) => Promise<{ id: string }>;
  deleteSandboxPlugin: (id: string) => Promise<{ id: string }>;
  publishSandboxPlugin: (id: string) => Promise<{ ok: true; id: string; howToUse?: string } | { ok: false; error: string }>;
  listKbCollections: () => Promise<{
    collections: KbCollection[];
    capabilities: { vectorAvailable: boolean; embeddingModel: string; embeddingDim: number; pendingJobs: number };
  }>;
  createKbCollection: (name: string, description?: string) => Promise<KbCollection>;
  deleteKbCollection: (id: string) => Promise<{ ok: true }>;
  patchKbCollection: (id: string, patch: { enabled?: boolean }) => Promise<KbCollection>;
  listKbDocuments: (collectionId: string) => Promise<{ documents: KbDocument[] }>;
  importKbDocument: (collectionId: string, input: { title: string; text: string; sourceName?: string }) => Promise<{ doc: KbDocument; action: "created" | "updated" | "skipped" }>;
  retryKbDocument: (id: string) => Promise<KbDocument>;
  deleteKbDocument: (id: string) => Promise<{ ok: true }>;
  setKbDocumentDisabled: (id: string, disabled: boolean) => Promise<{ ok: true }>;
  searchKb: (query: string, collectionIds?: string[], includeTrace?: boolean) => Promise<{ hits: KbSearchHit[]; trace?: KbSearchTrace }>;
  listKbChunks: (documentId: string) => Promise<{ chunks: Array<{ id: string; documentId: string; seq: number; text: string }>; total: number }>;
  updateKbChunk: (chunkId: string, text: string) => Promise<{ ok: true }>;
  reindexKb: () => Promise<{ chunks: number }>;
  fetchUrl: (url: string) => Promise<{ text: string; contentType: string }>;
  fetchImage: (url: string) => Promise<{ mime: string; data: string }>;
  parseDocx: (fileBase64: string) => Promise<{ text: string }>;
  exportDb: () => Promise<{ ok: boolean; path?: string }>;
  chat: (
    payload: {
      message: string;
      sessionId: string;
      workspace?: "desk";
      images?: Array<{ mime: string; data: string }>;
    },
    onEvent: (event: DeskAgentEvent) => void
  ) => Promise<void>;
  abortChat: () => void;
  listSessions: (kind?: "chat" | "desk") => Promise<DeskSession[]>;
  createSession: (title?: string, kind?: "chat" | "desk") => Promise<DeskSession>;
  deleteSession: (sessionId: string) => Promise<void>;
  listSessionMessages: (sessionId: string) => Promise<{ session: DeskSession; messages: DeskMessage[] }>;
  listCanvas: (sessionId: string) => Promise<{ items: DeskCanvasItem[] }>;
  listCanvasSnapshots: (sessionId: string) => Promise<{
    snapshots: Array<{
      turnId: string;
      userMessageId: string;
      document: { items: DeskCanvasItem[] };
    }>;
    activity?: Array<{
      turnId: string;
      userMessageId: string;
      steps: DeskStep[];
    }>;
  }>;
  patchCanvas: (
    id: string,
    patch: { x?: number; y?: number; w?: number; h?: number; z?: number },
    sessionId?: string
  ) => Promise<DeskCanvasItem>;
  deleteCanvasItem: (id: string, sessionId?: string) => Promise<void>;
  restoreCanvas: (sessionId: string, turnId: string) => Promise<{ items: DeskCanvasItem[] }>;
  reorderCanvas: (sessionId: string, ids: string[]) => Promise<{ items: DeskCanvasItem[] }>;
  workbenchIme: (focused: boolean) => Promise<void>;
  onSettingsUpdated: (handler: () => void) => void;
};

export type PdfTextItem = {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
  hasEOL?: boolean;
};
