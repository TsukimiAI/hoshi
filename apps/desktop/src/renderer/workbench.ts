type PluginTemplateKind = "panel" | "launcher" | "mcp" | "theme";
type Rail = "desk" | "skin" | "shop" | "connect" | "kb";
type McpServerRow = {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
  connected: boolean;
  toolNames: string[];
  lastError: string;
};
type McpTemplate = {
  id: string;
  name: string;
  description: string;
  hints: string;
  command: string;
  args: string[];
  env: Record<string, string>;
};
type SandboxEntry = { id: string; template: PluginTemplateKind };
type LiveItem = {
  id: string;
  name: string;
  description: string;
  cover: string;
  template: PluginTemplateKind;
  enabled: boolean;
};
type KbCollection = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  documentCount: number;
  createdAt: string;
  updatedAt: string;
};
type KbDocument = {
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
type KbSearchHit = {
  chunkId: string;
  docId: string;
  documentTitle: string;
  collectionId: string;
  collectionName: string;
  text: string;
  score: number;
};
type KbTraceHit = { chunkId: string; score: number; text: string };
type KbSearchTrace = {
  query: string;
  vectorHits: KbTraceHit[];
  keywordHits: KbTraceHit[];
  fusedHits: KbTraceHit[];
  finalHits: KbTraceHit[];
  reranked: boolean;
  latencyMs: { embed: number; vector: number; keyword: number; fuse: number; rerank: number; total: number };
};
type DeskSession = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
};
type DeskMessage = {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
};
type DeskCanvasItem = {
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
type DeskAgentEvent =
  | { event: "sentence"; data: { text: string } }
  | { event: "done"; data: { ok: true } }
  | { event: "error"; data: { message: string } }
  | { event: "canvas"; data: { items: DeskCanvasItem[]; turnId?: string; validationError?: string } }
  | { event: "turn"; data: { turnId: string; sessionId: string; userMessageId: string } }
  | { event: "progress"; data: { phase: "think" | "think_done" | "tool_start" | "tool_done"; name?: string; detail?: string; ok?: boolean; elapsedMs?: number } }
  | { event: "emotion"; data: Record<string, unknown> }
  | { event: "citation"; data: Record<string, unknown> };
type DeskStep = {
  kind: "think" | "tool" | "reply";
  name?: string;
  detail?: string;
  elapsedMs?: number;
  ok?: boolean;
};
type DeskTurn = {
  id: string;
  userMessageId?: string;
  title: string;
  open: boolean;
  steps: DeskStep[];
  canvasItems?: DeskCanvasItem[];
};
type LayoutNode = {
  id: string;
  type: "image" | "text" | "deco";
  x: number;
  y: number;
  w: number;
  h: number;
  src?: string;
  text?: string;
};
const EMOTION_KEYS = [
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
type SkinForm = {
  id: string;
  template: PluginTemplateKind;
  name: string;
  description: string;
  label: string;
  title: string;
  multiple: boolean;
  filters: { name: string; extensions: string[] }[];
};

type WorkbenchApi = {
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

const wb = (window as Window & { hoshi?: WorkbenchApi }).hoshi;

const deskImageCache = new Map<string, string>();

function canonicalizeDeskImageUrl(raw: string): string | null {
  const source = raw.trim();
  if (!source) {
    return null;
  }
  try {
    const url = new URL(source);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    url.hash = "";
    const host = url.hostname.toLowerCase();
    const allowed = [
      "upload.wikimedia.org",
      "commons.wikimedia.org",
      "storage.moegirl.org.cn",
      "img.moegirl.org.cn",
      "img.moegirl.org"
    ].some((item) => host === item || host.endsWith(`.${item}`));
    const imagePath = /\.(png|jpe?g|webp|gif|svg|bmp)(?:$|[!/?#])/i.test(url.pathname);
    if (!allowed && !imagePath) {
      return null;
    }
    url.pathname = url.pathname.replace(/(\.(?:png|jpe?g|webp|gif|svg|bmp))!.+$/i, "$1");
    return url.toString();
  } catch {
    return null;
  }
}

function bindDeskImage(img: HTMLImageElement, raw: string, alt: string): boolean {
  img.alt = alt;
  img.referrerPolicy = "no-referrer";
  const url = canonicalizeDeskImageUrl(raw);
  if (!url) {
    return false;
  }
  const cached = deskImageCache.get(url);
  if (cached) {
    img.src = cached;
    return true;
  }
  const apply = (src: string): void => {
    deskImageCache.set(url, src);
    img.src = src;
  };
  if (wb?.fetchImage) {
    void wb
      .fetchImage(url)
      .then((file) => apply(`data:${file.mime};base64,${file.data}`))
      .catch(() => {
        img.src = url;
        img.addEventListener("error", () => img.remove(), { once: true });
      });
    return true;
  }
  img.src = url;
  img.addEventListener("error", () => img.remove(), { once: true });
  return true;
}

const listEl = document.getElementById("plugin-list") as HTMLUListElement;
const sideTitle = document.getElementById("side-title") as HTMLSpanElement;
const skinForm = document.getElementById("skin-form") as HTMLFormElement;
const shopHint = document.getElementById("shop-hint") as HTMLParagraphElement;
const connectPanel = document.getElementById("connect-panel") as HTMLDivElement;
const mcpListEl = document.getElementById("mcp-list") as HTMLUListElement;
const mcpTemplatesEl = document.getElementById("mcp-templates") as HTMLDivElement;
const mcpNote = document.getElementById("mcp-note") as HTMLParagraphElement;
const mcpForm = document.getElementById("mcp-form") as HTMLFormElement;
const mcpIdInput = document.getElementById("mcp-id") as HTMLInputElement;
const mcpCommandInput = document.getElementById("mcp-command") as HTMLInputElement;
const mcpArgsInput = document.getElementById("mcp-args") as HTMLTextAreaElement;
const mcpEnvInput = document.getElementById("mcp-env") as HTMLTextAreaElement;
const mcpFormErr = document.getElementById("mcp-form-err") as HTMLParagraphElement;
const mcpProbeBtn = document.getElementById("mcp-probe-btn") as HTMLButtonElement;
const mcpRevealBtn = document.getElementById("mcp-reveal-btn") as HTMLButtonElement;
const mcpProbeOut = document.getElementById("mcp-probe-out") as HTMLPreElement;
const skinName = document.getElementById("skin-name") as HTMLInputElement;
const skinDesc = document.getElementById("skin-desc") as HTMLInputElement;
const skinLabel = document.getElementById("skin-label") as HTMLInputElement;
const skinTitle = document.getElementById("skin-title") as HTMLInputElement;
const skinMultiple = document.getElementById("skin-multiple") as HTMLInputElement;
const skinFilterName = document.getElementById("skin-filter-name") as HTMLInputElement;
const skinFilterExt = document.getElementById("skin-filter-ext") as HTMLInputElement;
const skinMultipleRow = document.getElementById("skin-multiple-row") as HTMLLabelElement;
const skinFilterNameRow = document.getElementById("skin-filter-name-row") as HTMLLabelElement;
const skinFilterExtRow = document.getElementById("skin-filter-ext-row") as HTMLLabelElement;
const galleryEl = document.getElementById("gallery") as HTMLDivElement;
const themeEd = document.getElementById("theme-ed") as HTMLFormElement;
const themeName = document.getElementById("theme-name") as HTMLInputElement;
const themeDesc = document.getElementById("theme-desc") as HTMLInputElement;
const themePreviewBtn = document.getElementById("theme-preview") as HTMLButtonElement;
const themeRestoreBtn = document.getElementById("theme-restore") as HTMLButtonElement;
const themeSprites = document.getElementById("theme-sprites") as HTMLDivElement;
const themeBg = document.getElementById("theme-bg") as HTMLInputElement;
const themeDialog = document.getElementById("theme-dialog") as HTMLInputElement;
const themeMenu = document.getElementById("theme-menu") as HTMLInputElement;
const themeFont = document.getElementById("theme-font") as HTMLInputElement;
const canvasEd = document.getElementById("canvas-ed") as HTMLDivElement;
const canvasBoard = document.getElementById("canvas-board") as HTMLDivElement;
const sidebarEl = document.getElementById("sidebar") as HTMLElement;
const newBtn = document.getElementById("new-btn") as HTMLButtonElement;
const createMask = document.getElementById("create-mask") as HTMLDivElement;
const createBox = document.getElementById("create-box") as HTMLFormElement;
const newIdInput = document.getElementById("new-id") as HTMLInputElement;
const createErr = document.getElementById("create-err") as HTMLParagraphElement;
const newCancel = document.getElementById("new-cancel") as HTMLButtonElement;
const publishBtn = document.getElementById("publish-btn") as HTMLButtonElement;
const currentEl = document.getElementById("current-id") as HTMLSpanElement;
const wbNote = document.getElementById("wb-note") as HTMLParagraphElement;
const backBtn = document.getElementById("back-btn") as HTMLButtonElement;
const themeSound = document.getElementById("theme-sound") as HTMLInputElement;
const themeSoundPick = document.getElementById("theme-sound-pick") as HTMLButtonElement;
const themeSoundClear = document.getElementById("theme-sound-clear") as HTMLButtonElement;
const themeSoundPreview = document.getElementById("theme-sound-preview") as HTMLAudioElement;
const themeFile = document.getElementById("theme-file") as HTMLInputElement;
const themeSoundFile = document.getElementById("theme-sound-file") as HTMLInputElement;
const canvasTextBtn = document.getElementById("canvas-text") as HTMLButtonElement;
const canvasImageBtn = document.getElementById("canvas-image") as HTMLButtonElement;
const canvasDeco = document.getElementById("canvas-deco") as HTMLButtonElement;
const canvasDelete = document.getElementById("canvas-delete") as HTMLButtonElement;
const canvasSave = document.getElementById("canvas-save") as HTMLButtonElement;
const canvasFile = document.getElementById("canvas-file") as HTMLInputElement;
const previewMask = document.getElementById("preview-mask") as HTMLDivElement;
const previewTitle = document.getElementById("preview-title") as HTMLSpanElement;
const previewBody = document.getElementById("preview-body") as HTMLDivElement;
const previewClose = document.getElementById("preview-close") as HTMLButtonElement;
const kbPanel = document.getElementById("kb-panel") as HTMLDivElement;
const kbCollectionName = document.getElementById("kb-collection-name") as HTMLSpanElement;
const kbNewBtn = document.getElementById("kb-new-btn") as HTMLButtonElement;
const kbNewRow = document.getElementById("kb-new-row") as HTMLDivElement;
const kbNewInput = document.getElementById("kb-new-input") as HTMLInputElement;
const kbNewOk = document.getElementById("kb-new-ok") as HTMLButtonElement;
const kbRefreshBtn = document.getElementById("kb-refresh-btn") as HTMLButtonElement;
const kbReindexBtn = document.getElementById("kb-reindex-btn") as HTMLButtonElement;
const kbCapHint = document.getElementById("kb-cap-hint") as HTMLParagraphElement;
const kbStatus = document.getElementById("kb-status") as HTMLDivElement;
const kbDocList = document.getElementById("kb-doc-list") as HTMLUListElement;
const kbImportForm = document.getElementById("kb-import-form") as HTMLFormElement;
const kbImportTitle = document.getElementById("kb-import-title") as HTMLInputElement;
const kbImportText = document.getElementById("kb-import-text") as HTMLTextAreaElement;
const kbSearchInput = document.getElementById("kb-search-input") as HTMLInputElement;
const kbSearchBtn = document.getElementById("kb-search-btn") as HTMLButtonElement;
const kbSearchResults = document.getElementById("kb-search-results") as HTMLDivElement;
const deskPanel = document.getElementById("desk-panel") as HTMLDivElement;
const deskBoardEl = document.getElementById("desk-board") as HTMLDivElement;
const deskHistoryList = document.getElementById("desk-activity-list") as HTMLDivElement;
const deskResetBtn = document.getElementById("desk-reset-btn") as HTMLButtonElement;
const deskLiveBtn = document.getElementById("desk-live-btn") as HTMLButtonElement;
const deskChatForm = document.getElementById("desk-chat") as HTMLFormElement;
const deskInput = document.getElementById("desk-input") as HTMLInputElement;
const deskStop = document.getElementById("desk-stop") as HTMLButtonElement;
const deskSend = document.getElementById("desk-send") as HTMLButtonElement;
const deskAttachBtn = document.getElementById("desk-attach-btn") as HTMLButtonElement;
const deskFile = document.getElementById("desk-file") as HTMLInputElement;
const deskAttachRow = document.getElementById("desk-attach-row") as HTMLDivElement;
const deskStatus = document.getElementById("desk-status") as HTMLParagraphElement;
const deskNewBtn = document.getElementById("desk-new-btn") as HTMLButtonElement;
const kbFileBtn = document.getElementById("kb-file-btn") as HTMLButtonElement;
const kbFile = document.getElementById("kb-file") as HTMLInputElement;
const kbUrl = document.getElementById("kb-url") as HTMLInputElement;
const kbUrlBtn = document.getElementById("kb-url-btn") as HTMLButtonElement;
const kbExportBtn = document.getElementById("kb-export-btn") as HTMLButtonElement;

let rail: Rail = "desk";
let currentTemplate: PluginTemplateKind | "" = "";
let layoutNodes: LayoutNode[] = [];
let themePack: {
  name: string;
  description: string;
  tokens: { bg: string; font: string; dialog: string; menu: string; sound: string };
  sprites: Record<string, string>;
} | null = null;
let themeSpriteTarget = "";
let selectedNodeId = "";
let currentId = "";
let sending = false;
let kbCollections: KbCollection[] = [];
let kbCollectionId = "";
let kbDocuments: KbDocument[] = [];
let kbSourceName = "";
let deskSessions: DeskSession[] = [];
let deskSessionId = "";
let deskItems: DeskCanvasItem[] = [];
let deskLiveItems: DeskCanvasItem[] = [];
let deskViewingTurnId: string | null = null;
let deskPendingImages: Array<{ mime: string; data: string; preview: string }> = [];
let deskSending = false;
let deskTurns: DeskTurn[] = [];

function showNote(text: string): void {
  if (!kbPanel.hidden) {
    kbStatus.textContent = text;
    return;
  }
  wbNote.hidden = !text;
  wbNote.textContent = text;
}

if (!wb) {
  showNote("preload 未就绪");
}

function bindIme(el: HTMLElement): void {
  el.addEventListener("focus", () => {
    void wb?.workbenchIme(true);
  });
  el.addEventListener("blur", () => {
    void wb?.workbenchIme(false);
  });
}

function applyChrome(): void {
  const shop = rail === "shop";
  const skin = rail === "skin";
  const kb = rail === "kb";
  const connect = rail === "connect";
  const desk = rail === "desk";
  const editingSkin = skin && Boolean(currentId);
  const isTheme = currentTemplate === "theme";
  const isPanelLauncher = currentTemplate === "panel" || currentTemplate === "launcher";
  sideTitle.textContent = desk
    ? "会话"
    : shop
      ? "工坊"
      : skin
        ? "模板"
        : kb
          ? "知识库"
          : "连接";
  sidebarEl.classList.toggle("rail-hidden", shop || skin || connect);
  sidebarEl.classList.toggle("desk-wide", desk);
  newBtn.hidden = shop || kb || connect || desk;
  kbNewBtn.hidden = !kb;
  deskNewBtn.hidden = !desk;
  kbNewRow.hidden = true;
  backBtn.hidden = !editingSkin;
  publishBtn.hidden = shop || kb || connect || desk || (skin && !currentId);
  shopHint.hidden = !shop;
  connectPanel.hidden = !connect;
  kbPanel.hidden = !kb;
  deskPanel.hidden = !desk;
  skinForm.hidden = !(editingSkin && isPanelLauncher);
  galleryEl.hidden = !(shop || (skin && !currentId));
  themeEd.hidden = !(editingSkin && isTheme);
  canvasEd.hidden = !(editingSkin && isPanelLauncher);
}

function asNumArr(value: unknown): number[] {
  return Array.isArray(value)
    ? value.map((item) => Number(item)).filter((item) => Number.isFinite(item))
    : [];
}

const DESK_SERIES_COLORS = ["#1f4d45", "#3d9a8a", "#c4a35a", "#6b7c6e"];

function svgEl(name: string, attrs: Record<string, string>): SVGElement {
  const node = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, val] of Object.entries(attrs)) {
    node.setAttribute(key, val);
  }
  return node;
}

function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    return [min - 1, min, min + 1];
  }
  const span = max - min;
  const step = span / Math.max(1, count - 1);
  const mag = 10 ** Math.floor(Math.log10(step));
  const niceStep = [1, 2, 5, 10].map((n) => n * mag).find((n) => n >= step) ?? step;
  const start = Math.floor(min / niceStep) * niceStep;
  const ticks: number[] = [];
  for (let v = start; v <= max + niceStep / 2; v += niceStep) {
    ticks.push(Number(v.toFixed(6)));
  }
  return ticks.length ? ticks : [min, max];
}

function renderDeskChart(payload: Record<string, unknown>, width: number, height: number): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("class", "desk-chart");
  const labels = Array.isArray(payload.labels) ? payload.labels.map((item) => String(item)) : [];
  const seriesRaw = Array.isArray(payload.series) ? payload.series : [];
  const series = seriesRaw.map((row) => {
    const rec = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
    const values = asNumArr(rec.values);
    return {
      name: String(rec.name ?? ""),
      values,
      right: rec.axis === "right",
      errors: asNumArr(rec.errors).slice(0, values.length)
    };
  });
  const chartType = payload.chartType === "bar" || payload.chartType === "pie" ? payload.chartType : "line";
  const leftVals = series.filter((row) => !row.right).flatMap((row) => row.values);
  const rightVals = series.filter((row) => row.right).flatMap((row) => row.values);
  const hasRight = rightVals.length > 0 && chartType !== "pie";
  const rangeOf = (vals: number[]): { yMin: number; yMax: number } => {
    const minVal = vals.length ? Math.min(...vals) : 0;
    const maxVal = vals.length ? Math.max(...vals) : 1;
    const pad = (maxVal - minVal) * 0.14 || 1;
    return { yMin: minVal - pad, yMax: maxVal + pad };
  };
  const leftRange = rangeOf(leftVals.length ? leftVals : series.flatMap((row) => row.values));
  const rightRange = rangeOf(rightVals.length ? rightVals : leftRange.yMin === 0 ? [0, 1] : [leftRange.yMin, leftRange.yMax]);
  const leftPad = 52;
  const rightPad = hasRight ? 52 : 16;
  const top = 22;
  const bottom = 36;
  const innerW = Math.max(40, width - leftPad - rightPad);
  const innerH = Math.max(40, height - top - bottom);
  const n = Math.max(1, labels.length);
  const yOfSide = (value: number, right: boolean): number => {
    const { yMin, yMax } = right && hasRight ? rightRange : leftRange;
    return top + innerH - ((value - yMin) / (yMax - yMin || 1)) * innerH;
  };
  const xOf = (i: number): number => leftPad + (n === 1 ? innerW / 2 : (i / Math.max(1, n - 1)) * innerW);
  const fmt = (value: number): string => {
    if (Math.abs(value) >= 100) return String(Math.round(value));
    return String(Math.round(value * 10) / 10);
  };

  if (chartType === "pie") {
    const values = series[0]?.values ?? [];
    const total = values.reduce((sum, item) => sum + Math.max(0, item), 0) || 1;
    let angle = -Math.PI / 2;
    const cx = width / 2;
    const cy = height / 2 - 8;
    const r = Math.min(innerW, innerH) / 2.4;
    values.forEach((value, index) => {
      const slice = (Math.max(0, value) / total) * Math.PI * 2;
      const x1 = cx + r * Math.cos(angle);
      const y1 = cy + r * Math.sin(angle);
      angle += slice;
      const x2 = cx + r * Math.cos(angle);
      const y2 = cy + r * Math.sin(angle);
      const large = slice > Math.PI ? 1 : 0;
      svg.appendChild(
        svgEl("path", {
          d: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`,
          fill: DESK_SERIES_COLORS[index % DESK_SERIES_COLORS.length]
        })
      );
    });
    return svg as SVGSVGElement;
  }

  const paintTicks = (range: { yMin: number; yMax: number }, side: "left" | "right"): void => {
    const ticks = niceTicks(range.yMin, range.yMax, 5);
    const xTick = side === "left" ? leftPad : leftPad + innerW;
    for (const tick of ticks) {
      const y = yOfSide(tick, side === "right");
      if (side === "left") {
        svg.appendChild(
          svgEl("line", {
            x1: String(leftPad),
            x2: String(leftPad + innerW),
            y1: String(y),
            y2: String(y),
            stroke: "#eceee9",
            "stroke-dasharray": "3 4"
          })
        );
      }
      svg.appendChild(
        svgEl("text", {
          x: String(side === "left" ? leftPad - 8 : xTick + 8),
          y: String(y + 3),
          "text-anchor": side === "left" ? "end" : "start",
          fill: "#9aa39c",
          "font-size": "10"
        })
      ).textContent = fmt(tick);
    }
  };
  paintTicks(leftRange, "left");
  if (hasRight) {
    paintTicks(rightRange, "right");
  }
  svg.appendChild(
    svgEl("line", {
      x1: String(leftPad),
      x2: String(leftPad),
      y1: String(top),
      y2: String(top + innerH),
      stroke: "#d7dbd4"
    })
  );
  if (hasRight) {
    svg.appendChild(
      svgEl("line", {
        x1: String(leftPad + innerW),
        x2: String(leftPad + innerW),
        y1: String(top),
        y2: String(top + innerH),
        stroke: "#d7dbd4"
      })
    );
  }
  svg.appendChild(
    svgEl("line", {
      x1: String(leftPad),
      x2: String(leftPad + innerW),
      y1: String(top + innerH),
      y2: String(top + innerH),
      stroke: "#d7dbd4"
    })
  );
  labels.forEach((label, i) => {
    svg.appendChild(
      svgEl("text", {
        x: String(xOf(i)),
        y: String(top + innerH + 16),
        "text-anchor": "middle",
        fill: "#8b938c",
        "font-size": "10"
      })
    ).textContent = label;
  });
  const yTitle = [payload.yLabel, payload.unit].filter((item) => typeof item === "string" && item.trim()).join(" ");
  if (yTitle) {
    svg.appendChild(
      svgEl("text", {
        x: String(leftPad),
        y: String(12),
        fill: "#8b938c",
        "font-size": "10"
      })
    ).textContent = yTitle;
  }
  const y2Title = [payload.y2Label, payload.y2Unit].filter((item) => typeof item === "string" && item.trim()).join(" ");
  if (y2Title && hasRight) {
    svg.appendChild(
      svgEl("text", {
        x: String(leftPad + innerW),
        y: String(12),
        "text-anchor": "end",
        fill: "#8b938c",
        "font-size": "10"
      })
    ).textContent = y2Title;
  }
  const xTitle = String(payload.xLabel || "");
  if (xTitle) {
    svg.appendChild(
      svgEl("text", {
        x: String(leftPad + innerW / 2),
        y: String(height - 4),
        "text-anchor": "middle",
        fill: "#8b938c",
        "font-size": "10"
      })
    ).textContent = xTitle;
  }

  const errorYs = (value: number, err: number, right: boolean): { lo: number; hi: number } => ({
    lo: yOfSide(value - err, right),
    hi: yOfSide(value + err, right)
  });

  const labelStep = n > 8 ? 2 : 1;
  series.forEach((row, s) => {
    const color = DESK_SERIES_COLORS[s % DESK_SERIES_COLORS.length];
    const yOf = (value: number): number => yOfSide(value, row.right && hasRight);
    const paintErr = (x: number, value: number, i: number): void => {
      const err = row.errors[i];
      if (!(err > 0)) return;
      const { lo, hi } = errorYs(value, err, row.right && hasRight);
      svg.appendChild(
        svgEl("line", {
          x1: String(x),
          x2: String(x),
          y1: String(lo),
          y2: String(hi),
          stroke: color,
          "stroke-width": "1.2"
        })
      );
      svg.appendChild(
        svgEl("line", {
          x1: String(x - 3),
          x2: String(x + 3),
          y1: String(lo),
          y2: String(lo),
          stroke: color,
          "stroke-width": "1.2"
        })
      );
      svg.appendChild(
        svgEl("line", {
          x1: String(x - 3),
          x2: String(x + 3),
          y1: String(hi),
          y2: String(hi),
          stroke: color,
          "stroke-width": "1.2"
        })
      );
    };
    const paintLabel = (x: number, y: number, value: number, i: number): void => {
      if (i % labelStep !== 0) return;
      svg.appendChild(
        svgEl("text", {
          x: String(x),
          y: String(y - 8),
          "text-anchor": "middle",
          fill: "#4d5752",
          "font-size": "9"
        })
      ).textContent = fmt(value);
    };
    if (chartType === "bar") {
      const groupW = innerW / n;
      row.values.forEach((value, i) => {
        const barW = Math.max(4, (groupW - 10) / Math.max(1, series.length));
        const x = leftPad + i * groupW + s * barW + 6;
        const y = yOf(value);
        const h = top + innerH - y;
        svg.appendChild(
          svgEl("rect", {
            x: String(x),
            y: String(y),
            width: String(barW),
            height: String(Math.max(0, h)),
            rx: "3",
            fill: color
          })
        );
        const cx = x + barW / 2;
        paintErr(cx, value, i);
        paintLabel(cx, y, value, i);
      });
      return;
    }
    const pts = row.values.map((value, i) => `${xOf(i)},${yOf(value)}`);
    const area = `M ${xOf(0)} ${top + innerH} L ${pts.join(" L ")} L ${xOf(row.values.length - 1)} ${top + innerH} Z`;
    svg.appendChild(svgEl("path", { d: area, fill: color, opacity: s === 0 ? "0.12" : "0.08" }));
    svg.appendChild(
      svgEl("polyline", {
        points: pts.join(" "),
        fill: "none",
        stroke: color,
        "stroke-width": "2.2",
        "stroke-linecap": "round",
        "stroke-linejoin": "round"
      })
    );
    row.values.forEach((value, i) => {
      const x = xOf(i);
      const y = yOf(value);
      paintErr(x, value, i);
      svg.appendChild(
        svgEl("circle", {
          cx: String(x),
          cy: String(y),
          r: "3.2",
          fill: "#fbfbf8",
          stroke: color,
          "stroke-width": "2"
        })
      );
      paintLabel(x, y, value, i);
    });
  });
  return svg as SVGSVGElement;
}

function toolLabel(name: string): string {
  if (name === "canvas_put" || name === "canvas_set" || name === "canvas_remove") return "画布";
  if (name === "search_knowledge" || name === "list_knowledge") return "知识库";
  return name;
}

function paintDeskActivity(): void {
  const list = deskHistoryList;
  const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight <= 48;
  list.replaceChildren();
  for (const turn of deskTurns) {
    const card = document.createElement("div");
    card.className = `desk-turn${turn.open ? "" : " collapsed"}${
      deskViewingTurnId === turn.id ? " selected" : ""
    }`;
    const head = document.createElement("button");
    head.type = "button";
    head.className = "desk-turn-head";
    head.textContent = "";
    const chev = document.createElement("strong");
    chev.textContent = turn.open ? "▾" : "▸";
    const title = document.createElement("span");
    title.textContent = turn.title;
    head.append(chev, title);
    head.addEventListener("click", () => {
      turn.open = !turn.open;
      if (turn.canvasItems && turn.canvasItems.length > 0) {
        deskViewingTurnId = turn.id;
        showDeskBoard(turn.canvasItems, true);
      } else {
        deskViewingTurnId = null;
        showDeskBoard(deskLiveItems, deskSending);
      }
      paintDeskActivity();
    });
    const body = document.createElement("div");
    body.className = "desk-turn-body";
    for (const step of turn.steps) {
      if (step.kind === "reply") {
        const reply = document.createElement("div");
        reply.className = "desk-msg assistant";
        reply.textContent = step.detail || "";
        body.appendChild(reply);
        continue;
      }
      const row = document.createElement("div");
      row.className = `desk-step${step.kind === "think" ? " think" : ""}`;
      if (step.kind === "think") {
        row.textContent =
          step.elapsedMs != null
            ? `思考过程${step.detail ? ` · ${step.detail}` : ` · 已完成 ${step.elapsedMs}ms`}`
            : "思考过程 · 进行中";
        body.appendChild(row);
        continue;
      }
      const top = document.createElement("div");
      top.className = "desk-step-top";
      const mark = document.createElement("span");
      mark.textContent = step.ok === false ? "✕" : "✓";
      const name = document.createElement("span");
      name.textContent = toolLabel(step.name || "tool");
      const time = document.createElement("span");
      time.className = "muted";
      time.textContent = step.elapsedMs != null ? `已完成  ${step.elapsedMs}ms` : "进行中";
      top.append(mark, name, time);
      row.appendChild(top);
      if (step.detail) {
        const detail = document.createElement("div");
        detail.className = "desk-step-detail";
        detail.textContent = step.detail;
        row.appendChild(detail);
      }
      body.appendChild(row);
    }
    if (deskViewingTurnId === turn.id && !turn.id.startsWith("live-")) {
      const actions = document.createElement("div");
      actions.className = "desk-turn-actions";
      const restoreBtn = document.createElement("button");
      restoreBtn.type = "button";
      restoreBtn.textContent = "恢复为当前";
      restoreBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void restoreDeskSnapshot(turn.id);
      });
      actions.appendChild(restoreBtn);
      card.append(head, body, actions);
    } else {
      card.append(head, body);
    }
    deskHistoryList.appendChild(card);
  }
  if (nearBottom) {
    deskHistoryList.scrollTop = deskHistoryList.scrollHeight;
  }
}

function turnsFromMessages(
  messages: DeskMessage[],
  snapshots: Array<{ turnId: string; userMessageId: string; document: { items: DeskCanvasItem[] } }> = [],
  activity: Array<{ userMessageId: string; steps: DeskStep[] }> = []
): DeskTurn[] {
  const byUser = new Map(snapshots.map((item) => [item.userMessageId, item]));
  const stepsByUser = new Map(activity.map((item) => [item.userMessageId, item.steps]));
  const turns: DeskTurn[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      const snap = byUser.get(message.id);
      turns.push({
        id: snap?.turnId ?? message.id,
        userMessageId: message.id,
        title: message.content,
        open: true,
        steps: [...(stepsByUser.get(message.id) ?? [])],
        canvasItems: snap?.document.items
      });
    } else if (message.role === "assistant" && turns.length) {
      turns[turns.length - 1].steps.push({ kind: "reply", detail: message.content });
    }
  }
  if (turns.length) {
    for (const turn of turns.slice(0, -1)) turn.open = false;
  }
  return turns;
}

function paintDeskHistory(
  messages: DeskMessage[],
  snapshots: Array<{ turnId: string; userMessageId: string; document: { items: DeskCanvasItem[] } }> = [],
  activity: Array<{ userMessageId: string; steps: DeskStep[] }> = []
): void {
  deskTurns = turnsFromMessages(messages, snapshots, activity);
  paintDeskActivity();
}

function paintDeskAttach(): void {
  deskAttachRow.hidden = deskPendingImages.length === 0;
  deskAttachRow.replaceChildren();
  for (const image of deskPendingImages) {
    const img = document.createElement("img");
    img.className = "desk-thumb";
    img.src = image.preview;
    img.alt = "附件";
    deskAttachRow.appendChild(img);
  }
}

async function removeDeskItem(id: string): Promise<void> {
  if (deskViewingTurnId) return;
  deskLiveItems = deskLiveItems.filter((item) => item.id !== id);
  showDeskBoard(deskLiveItems, false);
  try {
    await wb?.deleteCanvasItem(id, deskSessionId);
  } catch (error) {
    deskStatus.textContent = error instanceof Error ? error.message : "删除画布失败";
    await loadDeskBoard();
  }
}

async function restoreDeskSnapshot(turnId: string): Promise<void> {
  if (!wb || !deskSessionId) return;
  try {
    const data = await wb.restoreCanvas(deskSessionId, turnId);
    deskLiveItems = data.items;
    deskViewingTurnId = null;
    showDeskBoard(deskLiveItems, false);
    paintDeskActivity();
    deskStatus.textContent = "已恢复为当前活板";
  } catch (error) {
    deskStatus.textContent = error instanceof Error ? error.message : "恢复失败";
  }
}

async function reorderDeskItems(fromId: string, toId: string, before: boolean): Promise<void> {
  if (!wb || !deskSessionId || fromId === toId || deskViewingTurnId) return;
  const order = deskItems.map((item) => item.id);
  const from = order.indexOf(fromId);
  const to = order.indexOf(toId);
  if (from < 0 || to < 0) return;
  order.splice(from, 1);
  const insertAt = order.indexOf(toId);
  if (insertAt < 0) return;
  order.splice(before ? insertAt : insertAt + 1, 0, fromId);
  try {
    const data = await wb.reorderCanvas(deskSessionId, order);
    deskLiveItems = data.items;
    showDeskBoard(deskLiveItems, false);
  } catch (error) {
    deskStatus.textContent = error instanceof Error ? error.message : "调整顺序失败";
  }
}

function appendSafeInline(el: HTMLElement, text: string): void {
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    if (match.index > last) {
      el.appendChild(document.createTextNode(text.slice(last, match.index)));
    }
    const token = match[0];
    if (token.startsWith("**")) {
      const strong = document.createElement("strong");
      strong.textContent = token.slice(2, -2);
      el.appendChild(strong);
    } else if (token.startsWith("`")) {
      const code = document.createElement("code");
      code.textContent = token.slice(1, -1);
      el.appendChild(code);
    } else {
      const parts = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
      if (parts) {
        const link = document.createElement("a");
        link.textContent = parts[1];
        link.href = parts[2];
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        el.appendChild(link);
      } else {
        el.appendChild(document.createTextNode(token));
      }
    }
    last = match.index + token.length;
  }
  if (last < text.length) {
    el.appendChild(document.createTextNode(text.slice(last)));
  }
}

function renderSafeMarkdown(source: string): HTMLElement {
  const root = document.createElement("div");
  root.className = "desk-md";
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  let list: HTMLUListElement | null = null;
  const flushList = (): void => {
    list = null;
  };
  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (!trimmed.trim()) {
      flushList();
      continue;
    }
    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushList();
      const level = heading[1].length;
      const node = document.createElement(level === 1 ? "h3" : level === 2 ? "h4" : "h5");
      appendSafeInline(node, heading[2]);
      root.appendChild(node);
      continue;
    }
    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      if (!list) {
        list = document.createElement("ul");
        root.appendChild(list);
      }
      const li = document.createElement("li");
      appendSafeInline(li, bullet[1]);
      list.appendChild(li);
      continue;
    }
    flushList();
    const p = document.createElement("p");
    appendSafeInline(p, trimmed);
    root.appendChild(p);
  }
  return root;
}

function renderDeskTable(payload: Record<string, unknown>): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "desk-table-wrap";
  const columns = Array.isArray(payload.columns) ? payload.columns.map((col) => String(col)) : [];
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const table = document.createElement("table");
  table.className = "desk-table";
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const col of columns) {
    const th = document.createElement("th");
    th.textContent = col;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  const tbody = document.createElement("tbody");
  for (const row of rows) {
    const tr = document.createElement("tr");
    const cells = Array.isArray(row) ? row.map((cell) => String(cell)) : [];
    for (let i = 0; i < columns.length; i += 1) {
      const td = document.createElement("td");
      td.textContent = cells[i] ?? "";
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.append(thead, tbody);
  wrap.appendChild(table);
  const caption = String(payload.caption ?? "");
  if (caption) {
    const note = document.createElement("p");
    note.className = "desk-insight";
    note.textContent = caption;
    wrap.appendChild(note);
  }
  return wrap;
}

function showDeskBoard(items: DeskCanvasItem[], readonly: boolean): void {
  deskItems = [...items].sort((a, b) => a.z - b.z);
  deskBoardEl.classList.toggle("desk-board-readonly", readonly);
  deskBoardEl.replaceChildren();
  for (const item of deskItems) {
    const el = document.createElement("article");
    el.className = `desk-item${item.kind === "chart" ? " desk-item-chart" : item.kind === "card" ? " desk-item-card" : ""}`;
    el.style.minHeight = `${Math.min(item.h, 420)}px`;
    const head = document.createElement("div");
    head.className = "desk-item-head";
    const titles = document.createElement("div");
    titles.className = "desk-item-titles";
    const title = document.createElement("h3");
    title.textContent = item.title;
    titles.appendChild(title);
    const subtitle = String(item.payload.kicker ?? item.payload.subtitle ?? "");
    if (subtitle) {
      const sub = document.createElement("p");
      sub.textContent = subtitle;
      titles.appendChild(sub);
    }
    if (readonly) {
      head.append(titles);
      head.style.cursor = "default";
    } else {
      const del = document.createElement("button");
      del.type = "button";
      del.className = "desk-item-del";
      del.setAttribute("aria-label", "从画布移除");
      del.textContent = "×";
      del.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void removeDeskItem(item.id);
      });
      head.append(titles, del);
      el.draggable = true;
      el.addEventListener("dragstart", (event) => {
        if ((event.target as HTMLElement).closest(".desk-item-del")) {
          event.preventDefault();
          return;
        }
        event.dataTransfer?.setData("text/plain", item.id);
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "move";
        }
      });
      el.addEventListener("dragover", (event) => {
        event.preventDefault();
      });
      el.addEventListener("drop", (event) => {
        event.preventDefault();
        const fromId = event.dataTransfer?.getData("text/plain") ?? "";
        if (!fromId) return;
        const before = event.offsetY < el.clientHeight / 2;
        void reorderDeskItems(fromId, item.id, before);
      });
    }
    const body = document.createElement("div");
    body.className = "desk-item-body";
    if (item.kind === "chart") {
      const series = Array.isArray(item.payload.series) ? item.payload.series : [];
      if (series.length) {
        const legend = document.createElement("div");
        legend.className = "desk-legend";
        series.forEach((row, index) => {
          const rec = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
          const itemEl = document.createElement("span");
          const dot = document.createElement("i");
          dot.style.background = DESK_SERIES_COLORS[index % DESK_SERIES_COLORS.length];
          itemEl.append(dot, document.createTextNode(String(rec.name ?? `系列 ${index + 1}`)));
          legend.appendChild(itemEl);
        });
        body.appendChild(legend);
      }
      body.appendChild(renderDeskChart(item.payload, 280, 220));
      const insight = String(item.payload.insight ?? "");
      if (insight) {
        const note = document.createElement("p");
        note.className = "desk-insight";
        note.textContent = insight;
        body.appendChild(note);
      }
    } else if (item.kind === "image") {
      const img = document.createElement("img");
      if (bindDeskImage(img, String(item.payload.url ?? ""), String(item.payload.caption ?? item.title))) {
        body.appendChild(img);
      }
      if (item.payload.caption) {
        const cap = document.createElement("p");
        cap.className = "desk-insight";
        cap.textContent = String(item.payload.caption);
        body.appendChild(cap);
      }
    } else if (item.kind === "table") {
      body.classList.add("desk-table-wrap");
      body.appendChild(renderDeskTable(item.payload));
    } else if (item.kind === "markdown") {
      body.appendChild(renderSafeMarkdown(String(item.payload.body ?? "")));
    } else if (item.kind === "card") {
      body.classList.add("desk-card");
      const portrait = String(item.payload.portraitUrl ?? "");
      const portraitPending = Boolean(item.payload.portraitPending);
      if (portrait || portraitPending) {
        const img = document.createElement("img");
        img.className = "desk-portrait";
        if (portrait && bindDeskImage(img, portrait, item.title)) {
          body.appendChild(img);
        } else {
          const slot = document.createElement("div");
          slot.className = "desk-portrait desk-portrait-pending";
          slot.setAttribute("aria-hidden", "true");
          body.appendChild(slot);
        }
      }
      const text = document.createElement("p");
      text.className = "desk-card-body";
      text.textContent = String(item.payload.body ?? "");
      body.appendChild(text);
      const tags = Array.isArray(item.payload.tags) ? item.payload.tags.map((tag) => String(tag)) : [];
      if (tags.length) {
        const row = document.createElement("div");
        row.className = "desk-tags";
        for (const tag of tags) {
          const chip = document.createElement("span");
          chip.className = "desk-tag";
          chip.textContent = tag;
          row.appendChild(chip);
        }
        body.appendChild(row);
      }
    } else {
      body.textContent = String(item.payload.body ?? "");
      const tags = Array.isArray(item.payload.tags) ? item.payload.tags.map((tag) => String(tag)) : [];
      if (tags.length) {
        const row = document.createElement("div");
        row.className = "desk-tags";
        for (const tag of tags) {
          const chip = document.createElement("span");
          chip.className = "desk-tag";
          chip.textContent = tag;
          row.appendChild(chip);
        }
        body.appendChild(row);
      }
    }
    el.append(head, body);
    deskBoardEl.appendChild(el);
  }
}

async function loadDeskBoard(): Promise<void> {
  if (!wb) return;
  if (!deskSessionId) {
    deskLiveItems = [];
    if (deskViewingTurnId == null) {
      showDeskBoard([], false);
    }
    return;
  }
  const data = await wb.listCanvas(deskSessionId);
  deskLiveItems = data.items;
  if (deskViewingTurnId == null) {
    showDeskBoard(deskLiveItems, false);
  }
}

async function loadDeskHistory(): Promise<void> {
  if (!wb || !deskSessionId) {
    paintDeskHistory([]);
    return;
  }
  const detail = await wb.listSessionMessages(deskSessionId);
  const snaps = await wb.listCanvasSnapshots(deskSessionId).catch(() => ({ snapshots: [], activity: [] }));
  paintDeskHistory(detail.messages, snaps.snapshots, snaps.activity ?? []);
}

function paintDeskSessions(): void {
  listEl.replaceChildren();
  for (const session of deskSessions) {
    const li = document.createElement("li");
    li.className = `desk-session${session.id === deskSessionId ? " active" : ""}`;
    const title = document.createElement("div");
    title.className = "desk-session-title";
    title.textContent = session.title || "新会话";
    const meta = document.createElement("div");
    meta.className = "desk-session-meta";
    const stamp = session.lastMessageAt || session.updatedAt;
    meta.textContent = stamp ? stamp.slice(5, 16).replace("T", " ") : "空";
    const del = document.createElement("button");
    del.type = "button";
    del.className = "item-del";
    del.textContent = "删";
    del.addEventListener("click", (event) => {
      event.stopPropagation();
      void (async () => {
        await wb?.deleteSession(session.id);
        if (deskSessionId === session.id) deskSessionId = "";
        await refreshDesk();
      })();
    });
    li.append(title, meta, del);
    li.addEventListener("click", () => {
      deskSessionId = session.id;
      deskViewingTurnId = null;
      currentEl.textContent = session.title || "画布会话";
      void loadDeskBoard();
      void loadDeskHistory();
      paintDeskSessions();
    });
    listEl.appendChild(li);
  }
}

async function ensureDeskSession(): Promise<string> {
  if (!wb) throw new Error("preload 未就绪");
  if (deskSessionId) return deskSessionId;
  const created = await wb.createSession("新会话", "desk");
  deskSessionId = created.id;
  return created.id;
}

async function refreshDesk(): Promise<void> {
  if (!wb) return;
  deskSessions = await wb.listSessions("desk");
  if (!deskSessionId && deskSessions[0]) {
    deskSessionId = deskSessions[0].id;
  }
  if (deskSessionId && !deskSessions.some((item) => item.id === deskSessionId)) {
    deskSessionId = deskSessions[0]?.id ?? "";
  }
  currentEl.textContent = deskSessions.find((item) => item.id === deskSessionId)?.title || "共享画布";
  paintDeskSessions();
  await loadDeskBoard();
  await loadDeskHistory();
}

async function addDeskFiles(files: FileList | File[]): Promise<void> {
  const list = Array.from(files).filter((file) => file.type.startsWith("image/"));
  for (const file of list.slice(0, 4 - deskPendingImages.length)) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error("读图失败"));
      reader.readAsDataURL(file);
    });
    const comma = dataUrl.indexOf(",");
    const header = dataUrl.slice(0, comma);
    const mimeMatch = /data:(image\/[a-zA-Z0-9.+-]+);base64/.exec(header);
    const mime = mimeMatch?.[1] || file.type;
    const data = dataUrl.slice(comma + 1);
    deskPendingImages.push({ mime, data, preview: dataUrl });
  }
  paintDeskAttach();
}

function setDeskSending(sending: boolean): void {
  deskSending = sending;
  deskSend.disabled = sending;
  deskSend.hidden = sending;
  deskStop.hidden = !sending;
  deskBoardEl.classList.toggle("desk-generating", sending && !deskViewingTurnId);
  if (sending && !deskViewingTurnId) {
    deskStatus.textContent = deskLiveItems.length ? "生成中…画布仍是当前活板" : "生成中…";
  }
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && (error.name === "AbortError" || /aborted/i.test(error.message)))
  );
}

async function pullDeskLiveBoard(): Promise<void> {
  if (!wb || !deskSessionId) return;
  try {
    const data = await wb.listCanvas(deskSessionId);
    deskLiveItems = data.items;
    if (deskViewingTurnId == null) {
      showDeskBoard(deskLiveItems, deskSending);
    }
  } catch {
    /* 生成中刷新失败不打断 */
  }
}

async function sendDeskChat(): Promise<void> {
  if (!wb || deskSending) return;
  const message = deskInput.value.trim();
  if (!message && deskPendingImages.length === 0) return;
  setDeskSending(true);
  deskViewingTurnId = null;
  deskStatus.textContent = "生成中…";
  const images = deskPendingImages.map(({ mime, data }) => ({ mime, data }));
  deskInput.value = "";
  deskPendingImages = [];
  paintDeskAttach();
  const title = message
    ? images.length
      ? `${message} · 图片 ${images.length}`
      : message
    : `图片 ${images.length}`;
  const turn: DeskTurn = {
    id: `live-${Date.now()}`,
    title,
    open: true,
    steps: []
  };
  for (const item of deskTurns) item.open = false;
  deskTurns.push(turn);
  paintDeskActivity();
  try {
    const sessionId = await ensureDeskSession();
    let draft = "";
    let failed = false;
    await wb.chat({ message, sessionId, workspace: "desk", images }, (event) => {
      if (event.event === "progress") {
        if (event.data.phase === "think") {
          turn.steps.push({ kind: "think" });
        } else if (event.data.phase === "think_done") {
          const thinking = [...turn.steps].reverse().find((step) => step.kind === "think" && step.elapsedMs == null);
          if (thinking) {
            thinking.elapsedMs = event.data.elapsedMs;
            if (event.data.detail) thinking.detail = event.data.detail;
          }
        } else if (event.data.phase === "tool_start") {
          turn.steps.push({
            kind: "tool",
            name: event.data.name,
            detail: event.data.detail
          });
        } else if (event.data.phase === "tool_done") {
          const pending = [...turn.steps]
            .reverse()
            .find((step) => step.kind === "tool" && step.name === event.data.name && step.elapsedMs == null);
          if (pending) {
            pending.elapsedMs = event.data.elapsedMs;
            if (event.data.detail) pending.detail = event.data.detail;
            if (event.data.ok === false) pending.ok = false;
          }
          if (
            event.data.ok !== false &&
            (event.data.name === "canvas_put" ||
              event.data.name === "canvas_set" ||
              event.data.name === "canvas_remove")
          ) {
            void pullDeskLiveBoard();
          }
        }
        paintDeskActivity();
      }
      if (event.event === "sentence") {
        draft += event.data.text;
        const reply = turn.steps.find((step) => step.kind === "reply");
        if (reply) {
          reply.detail = draft;
        } else {
          turn.steps.push({ kind: "reply", detail: draft });
        }
        paintDeskActivity();
      }
      if (event.event === "turn") {
        turn.id = event.data.turnId;
        turn.userMessageId = event.data.userMessageId;
        paintDeskActivity();
      }
      if (event.event === "canvas") {
        turn.canvasItems = event.data.items;
        deskLiveItems = event.data.items;
        if (event.data.validationError) {
          deskStatus.textContent = event.data.validationError;
        }
        deskViewingTurnId = null;
        showDeskBoard(event.data.items, false);
        paintDeskActivity();
      }
      if (event.event === "error") {
        failed = true;
        const raw = event.data.message || "";
        const message = /aborted|timeout|超时/i.test(raw) ? "回答超时，请再试一次" : raw;
        deskStatus.textContent = message;
        turn.steps.push({ kind: "reply", detail: message });
        paintDeskActivity();
      }
    });
    if (!failed) {
      deskStatus.textContent = "";
    }
    if (!draft && !turn.steps.some((step) => step.kind === "reply")) {
      turn.steps.push({ kind: "reply", detail: "没有生成回复" });
      paintDeskActivity();
    }
    deskSessions = await wb.listSessions("desk");
    paintDeskSessions();
  } catch (error) {
    if (isAbortError(error)) {
      deskStatus.textContent = "已停止";
      if (!turn.steps.some((step) => step.kind === "reply" && step.detail === "已停止")) {
        turn.steps.push({ kind: "reply", detail: "已停止" });
        paintDeskActivity();
      }
    } else {
      deskStatus.textContent = error instanceof Error ? error.message : "发送失败";
    }
  } finally {
    setDeskSending(false);
  }
}

// ---- knowledge base ----

function kbStatusLabel(status: string): string {
  const map: Record<string, string> = {
    parsing: "解析中",
    chunking: "分块中",
    embedding: "嵌入中",
    ready: "就绪",
    failed: "失败",
    disabled: "已禁用"
  };
  return map[status] ?? status;
}

function renderKbSidebar(): void {
  listEl.replaceChildren();
  for (const collection of kbCollections) {
    const li = document.createElement("li");
    if (collection.id === kbCollectionId) {
      li.className = "active";
    }
    li.dataset.id = collection.id;
    const row = document.createElement("div");
    row.className = "ws-row";
    const name = document.createElement("span");
    name.className = "ws-name";
    name.textContent = `${collection.name} · ${collection.documentCount}`;
    if (!collection.enabled) {
      name.style.opacity = "0.55";
      name.style.textDecoration = "line-through";
    }
    name.addEventListener("click", () => {
      kbCollectionId = collection.id;
      void renderKbPanel();
    });
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "item-del";
    toggle.textContent = collection.enabled ? "停用" : "启用";
    toggle.title = collection.enabled ? "停用该知识库（检索时忽略）" : "启用该知识库";
    toggle.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void (async () => {
        if (!wb) {
          return;
        }
        try {
          await wb.patchKbCollection(collection.id, { enabled: !collection.enabled });
          await refreshKb();
        } catch (error) {
          showNote(error instanceof Error ? error.message : "操作失败");
        }
      })();
    });
    const del = document.createElement("button");
    del.type = "button";
    del.className = "item-del";
    del.textContent = "×";
    del.title = "删除知识库";
    del.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void deleteKbCollection(collection.id);
    });
    row.append(name, toggle, del);
    li.appendChild(row);
    listEl.appendChild(li);
  }
  if (kbCollections.length === 0) {
    listEl.replaceChildren(emptyStateEl("📚", "还没有知识库，点「＋ 新建」开始"));
  }
}

async function refreshKb(): Promise<void> {
  if (!wb) {
    return;
  }
  try {
    const data = await wb.listKbCollections();
    kbCollections = data.collections;
    if (!kbCollections.some((c) => c.id === kbCollectionId)) {
      kbCollectionId = kbCollections[0]?.id ?? "";
    }
    renderKbSidebar();
    const cap = data.capabilities;
    kbCapHint.hidden = cap.vectorAvailable && cap.embeddingDim > 0;
    if (!cap.vectorAvailable) {
      kbCapHint.textContent = "向量扩展加载失败：语义检索不可用（关键词检索仍可用）。";
    } else if (cap.embeddingDim === 0) {
      kbCapHint.textContent = "尚未建立向量索引，导入文档后自动创建。";
    }
    if (cap.pendingJobs > 0) {
      kbStatus.textContent = `${cap.pendingJobs} 个文档处理中…`;
      window.setTimeout(() => {
        if (rail === "kb") {
          void refreshKb();
        }
      }, 1500);
    } else {
      kbStatus.textContent = "";
    }
    await renderKbPanel();
  } catch (error) {
    showNote(error instanceof Error ? error.message : "知识库加载失败");
  }
}

async function renderKbPanel(): Promise<void> {
  kbCollectionName.textContent =
    kbCollections.find((c) => c.id === kbCollectionId)?.name ?? "未选择知识库";
  kbImportForm.hidden = !kbCollectionId;
  kbSearchInput.disabled = !kbCollectionId;
  kbSearchBtn.disabled = !kbCollectionId;
  kbDocList.replaceChildren();
  if (!kbCollectionId || !wb) {
    kbDocList.replaceChildren(emptyStateEl("📚", "还没有知识库：点左侧「＋ 新建」创建后，即可导入文档与测试检索"));
    return;
  }
  const data = await wb.listKbDocuments(kbCollectionId);
  kbDocuments = data.documents;
  if (kbDocuments.length === 0) {
    kbDocList.replaceChildren(emptyStateEl("📄", "还没有文档，粘贴文本导入"));
    return;
  }
  for (const doc of kbDocuments) {
    const li = document.createElement("li");
    const meta = document.createElement("div");
    meta.className = "kb-doc-meta";
    const title = document.createElement("span");
    title.className = "kb-doc-title";
    title.textContent = doc.title;
    const sub = document.createElement("span");
    sub.className = "kb-doc-sub";
    sub.textContent = `${doc.chunkCount} 块 · ${kbStatusLabel(doc.status)}${doc.error ? " · " + doc.error : ""}`;
    meta.append(title, sub);
    const badge = document.createElement("span");
    badge.className = `kb-badge ${doc.status}`;
    badge.textContent = kbStatusLabel(doc.status);
    const view = document.createElement("button");
    view.type = "button";
    view.className = "item-del";
    view.textContent = "分块";
    view.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void viewKbChunks(doc);
    });
    const del = document.createElement("button");
    del.type = "button";
    del.className = "item-del";
    del.textContent = "删除";
    del.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void deleteKbDocument(doc.id);
    });
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "item-del";
    if (doc.status === "ready") {
      toggle.textContent = "停用";
    } else if (doc.status === "disabled") {
      toggle.textContent = "启用";
    }
    toggle.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const disable = doc.status === "ready";
      void (async () => {
        try {
          await wb.setKbDocumentDisabled(doc.id, disable);
          void renderKbPanel();
        } catch (error) {
          showNote(error instanceof Error ? error.message : "操作失败");
        }
      })();
    });
    const buttons = [view, del];
    if (doc.status === "failed") {
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "item-del";
      retry.textContent = "重试";
      retry.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void (async () => {
          try {
            await wb.retryKbDocument(doc.id);
            showNote("已重新处理，后台进行中");
            window.setTimeout(() => {
              void renderKbPanel();
            }, 1500);
          } catch (error) {
            showNote(error instanceof Error ? error.message : "重试失败");
          }
        })();
      });
      buttons.splice(1, 0, retry);
    } else if (doc.status === "ready" || doc.status === "disabled") {
      buttons.splice(1, 0, toggle);
    }
    li.append(meta, badge, ...buttons);
    kbDocList.appendChild(li);
  }
}

async function deleteKbCollection(id: string): Promise<void> {
  if (!wb) return;
  await wb.deleteKbCollection(id);
  if (kbCollectionId === id) {
    kbCollectionId = "";
  }
  await refreshKb();
}

async function deleteKbDocument(id: string): Promise<void> {
  if (!wb) return;
  await wb.deleteKbDocument(id);
  await renderKbPanel();
}

async function viewKbChunks(doc: KbDocument): Promise<void> {
  if (!wb) return;
  const { chunks, total } = await wb.listKbChunks(doc.id);
  kbSearchResults.replaceChildren();
  const head = document.createElement("div");
  head.className = "kb-hit-head";
  head.textContent = `《${doc.title}》 ${total} 个分块`;
  kbSearchResults.appendChild(head);
  for (const chunk of chunks) {
    const el = document.createElement("div");
    el.className = "kb-hit";
    const sub = document.createElement("div");
    sub.className = "kb-hit-head";
    sub.textContent = `#${chunk.seq}`;
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "item-del";
    edit.textContent = "编辑";
    sub.appendChild(edit);
    const text = document.createElement("div");
    text.className = "kb-hit-text";
    text.textContent = chunk.text;
    el.append(sub, text);
    kbSearchResults.appendChild(el);

    let editing = false;
    edit.addEventListener("click", () => {
      if (editing) return;
      editing = true;
      const ta = document.createElement("textarea");
      ta.className = "kb-hit-textarea";
      ta.rows = 4;
      ta.value = chunk.text;
      const actions = document.createElement("div");
      actions.className = "kb-hit-actions";
      const save = document.createElement("button");
      save.type = "button";
      save.textContent = "保存";
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.textContent = "取消";
      actions.append(save, cancel);
      text.replaceWith(ta);
      el.appendChild(actions);

      const finish = (): void => {
        editing = false;
        ta.replaceWith(text);
        actions.remove();
      };
      cancel.addEventListener("click", finish);
      save.addEventListener("click", () => {
        const next = ta.value.trim();
        if (!next) {
          finish();
          return;
        }
        void (async () => {
          try {
            await wb.updateKbChunk(chunk.id, next);
            showNote("已更新并重新嵌入");
            void viewKbChunks(doc);
          } catch (error) {
            showNote(error instanceof Error ? error.message : "更新失败");
          }
        })();
      });
    });
  }
}

function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script,style,noscript").forEach((el) => el.remove());
  const text = doc.body?.textContent ?? "";
  return text.replace(/\s+/g, " ").trim();
}

async function importKbUrl(): Promise<void> {
  const url = kbUrl.value.trim();
  if (!url || !wb) return;
  try {
    const { text } = await wb.fetchUrl(url);
    const parsed = text.trim().startsWith("<") ? htmlToText(text) : text;
    if (!parsed.trim()) {
      showNote("未提取到文本");
      return;
    }
    kbImportTitle.value = kbImportTitle.value.trim() || url.replace(/^https?:\/\//, "").slice(0, 40);
    kbImportText.value = parsed;
    kbSourceName = url;
    showNote("已解析链接，点「导入」入库");
  } catch (error) {
    showNote(error instanceof Error ? error.message : "解析失败");
  }
}

async function exportDb(): Promise<void> {
  if (!wb) return;
  try {
    const result = await wb.exportDb();
    showNote(result.ok ? `已导出到 ${result.path ?? ""}` : "已取消");
  } catch (error) {
    showNote(error instanceof Error ? error.message : "导出失败");
  }
}

function getPdfLib(): { GlobalWorkerOptions: { workerSrc: string }; getDocument: (opts: { data: ArrayBuffer }) => { promise: Promise<unknown> } } | null {  const w = window as unknown as { pdfjsLib?: { GlobalWorkerOptions: { workerSrc: string }; getDocument: unknown } };
  const lib = w.pdfjsLib;
  if (!lib) {
    return null;
  }
  lib.GlobalWorkerOptions.workerSrc = "./pdf.worker.min.js";
  return lib as { GlobalWorkerOptions: { workerSrc: string }; getDocument: (opts: { data: ArrayBuffer }) => { promise: Promise<unknown> } };
}

async function extractPdfText(data: ArrayBuffer): Promise<string> {
  const lib = getPdfLib();
  if (!lib) {
    throw new Error("PDF 解析库未加载");
  }
  const doc = (await lib.getDocument({ data }).promise) as {
    numPages: number;
    getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: PdfTextItem[] }> }>;
  };
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(reconstructPdfPage(content.items));
  }
  return pages.join("\n\n");
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        resolve(result.slice(result.indexOf(",") + 1));
      } else {
        reject(new Error("读取文件失败"));
      }
    };
    reader.onerror = () => reject(new Error("读取文件失败"));
    reader.readAsDataURL(file);
  });
}

async function handleKbFile(file: File): Promise<void> {
  try {
    const name = file.name;
    const ext = (name.split(".").pop() ?? "").toLowerCase();
    let text = "";
    if (ext === "pdf") {
      text = await extractPdfText(await file.arrayBuffer());
    } else if (ext === "docx") {
      if (!wb?.parseDocx) {
        showNote("Word 解析不可用");
        return;
      }
      const { text: parsed } = await wb.parseDocx(await fileToBase64(file));
      text = parsed;
    } else if (ext === "html" || ext === "htm") {
      text = htmlToText(await file.text());
    } else {
      text = await file.text();
    }
    if (!text.trim()) {
      showNote("未提取到文本");
      return;
    }
    kbImportTitle.value = name.replace(/\.[^.]+$/, "");
    kbImportText.value = text;
    kbSourceName = file.name;
    showNote(`已解析《${name}》，点「导入」入库`);
  } catch (error) {
    showNote(error instanceof Error ? error.message : "解析失败");
  }
}

function renderTraceSection(title: string, hits: KbTraceHit[]): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "kb-trace-section";
  const head = document.createElement("div");
  head.className = "kb-hit-head";
  head.textContent = `${title}（${hits.length}）`;
  el.appendChild(head);
  if (hits.length === 0) {
    const empty = document.createElement("div");
    empty.className = "kb-hit-text";
    empty.textContent = "（无）";
    el.appendChild(empty);
    return el;
  }
  for (const hit of hits) {
    const row = document.createElement("div");
    row.className = "kb-trace-hit";
    row.textContent = `${hit.score.toFixed(3)}  ${hit.text.slice(0, 40)}`;
    el.appendChild(row);
  }
  return el;
}

async function runKbSearch(): Promise<void> {
  if (!wb || !kbCollectionId) return;
  const query = kbSearchInput.value.trim();
  if (!query) return;
  kbSearchResults.replaceChildren();
  try {
    const { hits, trace } = await wb.searchKb(query, [kbCollectionId], true);
    if (hits.length === 0) {
      kbSearchResults.appendChild(noteEl("未找到相关内容"));
      return;
    }
    for (const hit of hits) {
      const el = document.createElement("div");
      el.className = "kb-hit";
      const head = document.createElement("div");
      head.className = "kb-hit-head";
      head.textContent = `《${hit.documentTitle}》 相似度 ${hit.score.toFixed(3)}`;
      const text = document.createElement("div");
      text.className = "kb-hit-text";
      text.textContent = hit.text;
      el.append(head, text);
      kbSearchResults.appendChild(el);
    }
    if (trace) {
      const divider = document.createElement("div");
      divider.className = "kb-hit-head";
      divider.textContent = "── 检索过程 ──";
      kbSearchResults.appendChild(divider);
      const latency = trace.latencyMs;
      const latencyEl = document.createElement("div");
      latencyEl.className = "kb-trace-latency";
      latencyEl.textContent = `嵌入 ${latency.embed}ms · 向量 ${latency.vector}ms · 关键词 ${latency.keyword}ms · 融合 ${latency.fuse}ms · 重排 ${latency.rerank}ms（${trace.reranked ? "已重排" : "未重排"}）· 总计 ${latency.total}ms`;
      kbSearchResults.appendChild(latencyEl);
      kbSearchResults.appendChild(renderTraceSection("向量命中", trace.vectorHits));
      kbSearchResults.appendChild(renderTraceSection("关键词命中", trace.keywordHits));
      kbSearchResults.appendChild(renderTraceSection("融合结果", trace.fusedHits));
    }
  } catch (error) {
    kbSearchResults.appendChild(noteEl(error instanceof Error ? error.message : "检索失败"));
  }
}

async function paintTheme(): Promise<void> {
  if (!wb?.getTheme) return;
  const theme = await wb.getTheme();
  const root = document.documentElement;
  const tokens = theme?.tokens;
  root.style.setProperty("--hoshi-bg", tokens?.bg || "#f4f6fb");
  root.style.setProperty("--hoshi-font", tokens?.font || '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif');
  root.style.setProperty("--hoshi-dialog", tokens?.dialog || "#ffffff");
  root.style.setProperty("--hoshi-menu", tokens?.menu || "#ffffff");
}

function syncCreateKinds(): void {
  const title = document.getElementById("create-title");
  const kinds = document.getElementById("create-kind");
  if (title) title.textContent = "新建模板";
  if (kinds) kinds.hidden = false;
  const allow = ["theme", "panel", "launcher"];
  let first = "";
  for (const label of Array.from(createBox.querySelectorAll("#create-kind label"))) {
    if (!(label instanceof HTMLLabelElement)) continue;
    const kind = label.dataset.kind ?? "";
    const on = allow.includes(kind);
    label.hidden = !on;
    if (on && !first) first = kind;
  }
  const checked = createBox.querySelector('input[name="new-kind"]:checked') as HTMLInputElement | null;
  if (!checked || checked.closest("label")?.hidden) {
    const next = createBox.querySelector(`input[name="new-kind"][value="${first}"]`) as HTMLInputElement | null;
    if (next) next.checked = true;
  }
}

function applySkinFields(template: PluginTemplateKind): void {
  const panel = template === "panel";
  skinMultipleRow.hidden = !panel;
  skinFilterNameRow.hidden = !panel;
  skinFilterExtRow.hidden = !panel;
}

async function loadSkinForm(id: string): Promise<void> {
  if (!wb) return;
  const data = await wb.readSandboxPluginForm(id);
  skinName.value = data.name;
  skinDesc.value = data.description;
  skinLabel.value = data.label;
  skinTitle.value = data.title;
  skinMultiple.checked = data.multiple;
  const filter = data.filters[0];
  skinFilterName.value = filter?.name ?? "";
  skinFilterExt.value = (filter?.extensions ?? []).join(",");
  applySkinFields(data.template);
  skinForm.hidden = false;
}

function readSkinPatch(): {
  name: string;
  description: string;
  label: string;
  title: string;
  multiple: boolean;
  filters: { name: string; extensions: string[] }[];
} {
  const extensions = skinFilterExt.value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return {
    name: skinName.value.trim(),
    description: skinDesc.value.trim(),
    label: skinLabel.value.trim(),
    title: skinTitle.value.trim(),
    multiple: skinMultiple.checked,
    filters: extensions.length || skinFilterName.value.trim()
      ? [{ name: skinFilterName.value.trim() || "文件", extensions }]
      : []
  };
}

async function saveSkinForm(): Promise<void> {
  if (!wb || !currentId || rail !== "skin") return;
  await wb.patchSandboxPluginForm(currentId, readSkinPatch());
}

function fileToB64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(new Error("读取失败"));
    reader.readAsDataURL(file);
  });
}

function assetExt(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot) : "";
}

function nodeId(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function templateLabel(template: PluginTemplateKind): string {
  const map: Record<PluginTemplateKind, string> = {
    mcp: "MCP",
    panel: "播放器",
    launcher: "启动器",
    theme: "主题"
  };
  return map[template] ?? template;
}

function emptyStateEl(icon: string, text: string): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "empty-state";
  const i = document.createElement("div");
  i.className = "empty-icon";
  i.textContent = icon;
  const p = document.createElement("p");
  p.textContent = text;
  el.append(i, p);
  return el;
}

// ---- theme editor ----

function emptyThemeTokens(): { bg: string; font: string; dialog: string; menu: string; sound: string } {
  return { bg: "#f4f6fb", font: "", dialog: "#ffffff", menu: "#ffffff", sound: "" };
}

function renderThemeSprites(): void {
  themeSprites.replaceChildren();
  const sprites = themePack?.sprites ?? {};
  for (const emotion of EMOTION_KEYS) {
    const rel = sprites[emotion] ?? "";
    const slot = document.createElement("div");
    slot.className = "theme-sprite";
    const label = document.createElement("span");
    label.className = "theme-sprite-label";
    label.textContent = emotion;
    const box = document.createElement("div");
    box.className = "theme-sprite-box";
    if (rel) {
      const img = document.createElement("img");
      img.alt = emotion;
      void wb
        ?.sandboxAssetUrl(currentId, rel)
        .then(({ url }) => {
          if (url) img.src = url;
        })
        .catch(() => undefined);
      box.appendChild(img);
    } else {
      box.classList.add("empty");
      box.textContent = "未设置";
    }
    const actions = document.createElement("div");
    actions.className = "theme-sprite-actions";
    const upload = document.createElement("button");
    upload.type = "button";
    upload.textContent = "上传";
    upload.addEventListener("click", () => {
      themeSpriteTarget = emotion;
      themeFile.value = "";
      themeFile.click();
    });
    actions.appendChild(upload);
    if (rel) {
      const clear = document.createElement("button");
      clear.type = "button";
      clear.textContent = "清除";
      clear.addEventListener("click", () => {
        if (!themePack) return;
        delete themePack.sprites[emotion];
        renderThemeSprites();
      });
      actions.appendChild(clear);
    }
    slot.append(label, box, actions);
    themeSprites.appendChild(slot);
  }
}

async function applyThemeSprite(file: File): Promise<void> {
  const emotion = themeSpriteTarget;
  if (!emotion || !wb || !currentId) return;
  try {
    const rel = `sprites/${emotion}${assetExt(file.name) || ".png"}`;
    const b64 = await fileToB64(file);
    await wb.uploadSandboxAsset(currentId, rel, b64);
    if (!themePack) themePack = { name: "", description: "", tokens: emptyThemeTokens(), sprites: {} };
    themePack.sprites[emotion] = rel;
    renderThemeSprites();
  } catch (error) {
    showNote(error instanceof Error ? error.message : "上传失败");
  }
}

function updateSoundPreview(): void {
  const rel = themeSound.value.trim();
  if (rel && wb && currentId) {
    void wb
      .sandboxAssetUrl(currentId, rel)
      .then(({ url }) => {
        if (url) {
          themeSoundPreview.src = url;
          themeSoundPreview.hidden = false;
        }
      })
      .catch(() => undefined);
  } else {
    themeSoundPreview.removeAttribute("src");
    themeSoundPreview.hidden = true;
  }
}

async function loadThemeEditor(id: string): Promise<void> {
  if (!wb) return;
  const pack = await wb.readThemePack(id);
  themePack = pack;
  themeName.value = pack.name || "";
  themeDesc.value = pack.description || "";
  themeBg.value = pack.tokens.bg || "#f4f6fb";
  themeDialog.value = pack.tokens.dialog || "#ffffff";
  themeMenu.value = pack.tokens.menu || "#ffffff";
  themeFont.value = pack.tokens.font || "";
  themeSound.value = pack.tokens.sound || "";
  updateSoundPreview();
  renderThemeSprites();
}

function themePreviewTokens(): { bg: string; font: string; dialog: string; menu: string } {
  return {
    bg: themeBg.value.trim(),
    font: themeFont.value.trim(),
    dialog: themeDialog.value.trim(),
    menu: themeMenu.value.trim()
  };
}

async function saveThemeEditor(): Promise<void> {
  if (!wb || !currentId || !themePack) return;
  const pack = {
    name: themeName.value.trim(),
    description: themeDesc.value.trim(),
    tokens: {
      bg: themeBg.value.trim(),
      font: themeFont.value.trim(),
      dialog: themeDialog.value.trim(),
      menu: themeMenu.value.trim(),
      sound: themeSound.value.trim()
    },
    sprites: themePack.sprites
  };
  themePack = await wb.writeThemePack(currentId, pack);
  showNote("主题已保存");
}

// ---- canvas editor ----

function clampNum(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function selectCanvasNode(id: string): void {
  selectedNodeId = id;
  for (const el of Array.from(canvasBoard.querySelectorAll(".canvas-node"))) {
    el.classList.toggle("selected", (el as HTMLElement).dataset.id === id);
  }
  canvasDelete.disabled = !id;
}

function bringToFront(id: string): void {
  const idx = layoutNodes.findIndex((n) => n.id === id);
  if (idx < 0 || idx === layoutNodes.length - 1) return;
  const node = layoutNodes[idx];
  layoutNodes.splice(idx, 1);
  layoutNodes.push(node as LayoutNode);
  const el = canvasBoard.querySelector(`.canvas-node[data-id="${id}"]`);
  if (el) canvasBoard.appendChild(el);
}

function renderCanvas(): void {
  canvasBoard.replaceChildren();
  canvasDelete.disabled = !selectedNodeId || !layoutNodes.some((n) => n.id === selectedNodeId);
  for (const node of layoutNodes) {
    const el = document.createElement("div");
    el.className = `canvas-node${node.id === selectedNodeId ? " selected" : ""}${node.type === "deco" ? " deco" : ""}`;
    el.dataset.id = node.id;
    el.style.left = `${node.x}px`;
    el.style.top = `${node.y}px`;
    el.style.width = `${node.w}px`;
    el.style.height = `${node.h}px`;
    if (node.type === "image" && node.src) {
      const img = document.createElement("img");
      img.draggable = false;
      void wb
        ?.sandboxAssetUrl(currentId, node.src)
        .then(({ url }) => {
          if (url) img.src = url;
        })
        .catch(() => undefined);
      el.appendChild(img);
    } else if (node.type === "text") {
      el.textContent = node.text || "";
    }
    const handle = document.createElement("span");
    handle.className = "resize-handle";
    handle.title = "拖动改大小";
    el.appendChild(handle);
    attachCanvasNode(el, handle, node);
    canvasBoard.appendChild(el);
  }
}

function attachCanvasNode(el: HTMLElement, handle: HTMLElement, node: LayoutNode): void {
  let moving = false;
  let offsetX = 0;
  let offsetY = 0;
  el.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    selectCanvasNode(node.id);
    bringToFront(node.id);
    const rect = canvasBoard.getBoundingClientRect();
    offsetX = event.clientX - rect.left - node.x;
    offsetY = event.clientY - rect.top - node.y;
    moving = true;
    try {
      el.setPointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
  });
  el.addEventListener("pointermove", (event) => {
    if (!moving) return;
    const rect = canvasBoard.getBoundingClientRect();
    const w = node.w || 40;
    const h = node.h || 24;
    node.x = Math.round(clampNum(event.clientX - rect.left - offsetX, 0, rect.width - w));
    node.y = Math.round(clampNum(event.clientY - rect.top - offsetY, 0, rect.height - h));
    el.style.left = `${node.x}px`;
    el.style.top = `${node.y}px`;
  });
  const stopMove = (): void => {
    moving = false;
  };
  el.addEventListener("pointerup", stopMove);
  el.addEventListener("pointercancel", stopMove);

  let resizing = false;
  let startX = 0;
  let startY = 0;
  let origW = 0;
  let origH = 0;
  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    selectCanvasNode(node.id);
    startX = event.clientX;
    startY = event.clientY;
    origW = node.w || 40;
    origH = node.h || 24;
    resizing = true;
    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
  });
  handle.addEventListener("pointermove", (event) => {
    if (!resizing) return;
    const rect = canvasBoard.getBoundingClientRect();
    node.w = Math.round(clampNum(origW + (event.clientX - startX), 20, rect.width - node.x));
    node.h = Math.round(clampNum(origH + (event.clientY - startY), 16, rect.height - node.y));
    el.style.width = `${node.w}px`;
    el.style.height = `${node.h}px`;
  });
  const stopResize = (): void => {
    resizing = false;
  };
  handle.addEventListener("pointerup", stopResize);
  handle.addEventListener("pointercancel", stopResize);
}

function addCanvasText(): void {
  const text = window.prompt("文字内容", "文字")?.trim();
  if (!text) return;
  layoutNodes.push({ id: nodeId("t"), type: "text", x: 8, y: 8, w: 60, h: 24, text });
  renderCanvas();
}

function addCanvasDeco(): void {
  layoutNodes.push({ id: nodeId("d"), type: "deco", x: 8, y: 8, w: 60, h: 40 });
  renderCanvas();
}

async function applyCanvasImage(file: File): Promise<void> {
  if (!wb || !currentId) return;
  try {
    const rel = `deco/${nodeId("img")}${assetExt(file.name) || ".png"}`;
    const b64 = await fileToB64(file);
    await wb.uploadSandboxAsset(currentId, rel, b64);
    layoutNodes.push({ id: nodeId("i"), type: "image", x: 8, y: 8, w: 60, h: 60, src: rel });
    renderCanvas();
  } catch (error) {
    showNote(error instanceof Error ? error.message : "上传失败");
  }
}

function deleteSelectedNode(): void {
  if (!selectedNodeId) return;
  layoutNodes = layoutNodes.filter((n) => n.id !== selectedNodeId);
  selectedNodeId = "";
  renderCanvas();
}

async function saveCanvas(): Promise<void> {
  if (!wb || !currentId) return;
  await wb.writeLayout(currentId, layoutNodes);
  showNote("布局已保存");
}

async function loadCanvasEditor(id: string): Promise<void> {
  if (!wb) return;
  const data = await wb.readLayout(id);
  layoutNodes = data.nodes ?? [];
  selectedNodeId = "";
  canvasBoard.style.width = "280px";
  canvasBoard.style.height = currentTemplate === "launcher" ? "420px" : "360px";
  renderCanvas();
}

// ---- gallery cards ----

async function themeFirstSpriteRel(id: string): Promise<string> {
  if (!wb) return "";
  try {
    const pack = await wb.readThemePack(id);
    return Object.values(pack.sprites ?? {})[0] ?? "";
  } catch {
    return "";
  }
}

function buildSkinCard(entry: SandboxEntry): HTMLDivElement {
  const card = document.createElement("div");
  card.className = `card${entry.id === currentId ? " active" : ""}`;
  card.dataset.id = entry.id;
  const cover = document.createElement("div");
  cover.className = "card-cover";
  const badge = document.createElement("span");
  badge.className = "badge";
  badge.textContent = templateLabel(entry.template);
  cover.appendChild(badge);
  if (entry.template === "theme") {
    void themeFirstSpriteRel(entry.id)
      .then(async (rel) => {
        if (rel && wb) {
          const { url } = await wb.sandboxAssetUrl(entry.id, rel);
          if (url) {
            const img = document.createElement("img");
            img.src = url;
            cover.appendChild(img);
          }
        }
      })
      .catch(() => undefined);
  } else {
    cover.classList.add("placeholder");
    const icon = document.createElement("span");
    icon.className = "card-cover-icon";
    icon.textContent = entry.template === "launcher" ? "🚀" : "▶";
    cover.appendChild(icon);
  }
  const h3 = document.createElement("h3");
  h3.textContent = entry.id;
  const p = document.createElement("p");
  p.textContent = entry.template === "theme" ? "立绘与颜色" : "宿主界面 + 画布";
  card.append(cover, h3, p);
  const actions = document.createElement("div");
  actions.className = "card-actions";
  const del = document.createElement("button");
  del.type = "button";
  del.textContent = "删除";
  del.addEventListener("click", (event) => {
    event.stopPropagation();
    void deleteWorkspace(entry.id);
  });
  actions.appendChild(del);
  card.append(actions);
  card.addEventListener("click", () => {
    void selectWorkspace(entry.id);
  });
  return card;
}

async function buildShopCard(item: LiveItem): Promise<HTMLDivElement> {
  const card = document.createElement("div");
  card.className = "card";
  card.dataset.id = item.id;
  const cover = document.createElement("div");
  cover.className = "card-cover";
  const badge = document.createElement("span");
  badge.className = "badge";
  badge.textContent = templateLabel(item.template);
  cover.appendChild(badge);
  if (item.cover && wb) {
    try {
      const { url } = await wb.sandboxAssetUrl(item.id, item.cover, true);
      if (url) {
        const img = document.createElement("img");
        img.src = url;
        cover.appendChild(img);
      }
    } catch {
      /* none */
    }
  }
  if (!cover.querySelector("img")) {
    cover.classList.add("placeholder");
    const icon = document.createElement("span");
    icon.className = "card-cover-icon";
    icon.textContent = "✦";
    cover.appendChild(icon);
  }
  const h3 = document.createElement("h3");
  h3.textContent = item.name || item.id;
  const p = document.createElement("p");
  p.textContent = item.description || "";
  card.append(cover, h3, p);
  const actions = document.createElement("div");
  actions.className = "card-actions";
  const toggleLabel = document.createElement("label");
  toggleLabel.className = "card-toggle";
  const toggle = document.createElement("input");
  toggle.type = "checkbox";
  toggle.checked = item.enabled;
  toggle.addEventListener("change", () => {
    void setEnabled(item.id, toggle.checked).catch((error) => {
      toggle.checked = !toggle.checked;
      showNote(error instanceof Error ? error.message : "开关失败");
    });
  });
  toggleLabel.append(toggle, document.createTextNode("启用"));
  const preview = document.createElement("button");
  preview.type = "button";
  preview.textContent = "预览";
  preview.addEventListener("click", (event) => {
    event.stopPropagation();
    void openShopPreview(item);
  });
  const del = document.createElement("button");
  del.type = "button";
  del.textContent = "卸载";
  del.addEventListener("click", (event) => {
    event.stopPropagation();
    void deleteWorkspace(item.id);
  });
  actions.append(toggleLabel, preview, del);
  card.append(actions);
  return card;
}

async function openShopPreview(item: LiveItem): Promise<void> {
  previewTitle.textContent = item.name || item.id;
  previewBody.replaceChildren();
  const hint = document.createElement("p");
  hint.className = "preview-hint";
  hint.textContent = item.description || templateLabel(item.template);
  previewBody.appendChild(hint);
  if (item.template === "theme" && wb) {
    try {
      const pack = await wb.readLiveThemePack(item.id);
      const swatches = document.createElement("div");
      swatches.className = "preview-swatches";
      const tokens = pack.tokens;
      for (const [key, label] of [
        ["bg", "背景"],
        ["dialog", "对话框"],
        ["menu", "菜单"]
      ] as const) {
        if (tokens[key]) {
          const chip = document.createElement("span");
          chip.className = "preview-swatch";
          chip.style.background = tokens[key];
          chip.title = `${label} ${tokens[key]}`;
          chip.textContent = label;
          swatches.appendChild(chip);
        }
      }
      if (pack.tokens.sound) {
        const sound = document.createElement("span");
        sound.className = "preview-note";
        sound.textContent = `音效: ${pack.tokens.sound}`;
        swatches.appendChild(sound);
      }
      previewBody.appendChild(swatches);
      const grid = document.createElement("div");
      grid.className = "preview-grid";
      const entries = Object.entries(pack.sprites ?? {});
      if (entries.length === 0) {
        grid.textContent = "未设置立绘，回退默认人格";
      }
      for (const [emotion, rel] of entries) {
        const cell = document.createElement("div");
        cell.className = "preview-cell";
        const img = document.createElement("img");
        img.alt = emotion;
        const { url } = await wb.sandboxAssetUrl(item.id, rel, true);
        if (url) img.src = url;
        const name = document.createElement("span");
        name.textContent = emotion;
        cell.append(img, name);
        grid.appendChild(cell);
      }
      previewBody.appendChild(grid);
    } catch (error) {
      previewBody.appendChild(noteEl(error instanceof Error ? error.message : "读取失败"));
    }
  } else {
    const big = document.createElement("div");
    big.className = "preview-cover";
    if (item.cover && wb) {
      const { url } = await wb.sandboxAssetUrl(item.id, item.cover, true);
      if (url) {
        const img = document.createElement("img");
        img.src = url;
        big.appendChild(img);
      }
    }
    const note = document.createElement("p");
    note.className = "preview-hint";
    note.textContent = item.template === "launcher" ? "宿主启动器：列出应用并打开" : "宿主播放器：选文件播放";
    big.appendChild(note);
    previewBody.appendChild(big);
  }
  previewMask.hidden = false;
}

function noteEl(text: string): HTMLParagraphElement {
  const el = document.createElement("p");
  el.className = "preview-hint";
  el.textContent = text;
  return el;
}

function setSending(busy: boolean): void {
  sending = busy;
  publishBtn.disabled = !currentId || busy || rail === "shop" || rail === "connect" || rail === "kb";
}

async function setEnabled(id: string, on: boolean): Promise<void> {
  if (!wb) return;
  const settings = await wb.getSettings();
  const enabled = new Set(settings.plugins.enabled);
  if (on) enabled.add(id);
  else enabled.delete(id);
  await wb.saveSettings({
    ...settings,
    plugins: { ...settings.plugins, enabled: [...enabled] }
  });
}

function parseMcpForm(): { name: string; command: string; args: string[]; env: Record<string, string> } {
  const name = mcpIdInput.value.trim();
  const command = mcpCommandInput.value.trim();
  const args = mcpArgsInput.value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const env: Record<string, string> = {};
  for (const line of mcpEnvInput.value.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1);
  }
  return { name, command, args, env };
}

function fillMcpForm(input: { name?: string; command: string; args: string[]; env: Record<string, string> }): void {
  if (input.name) mcpIdInput.value = input.name;
  mcpCommandInput.value = input.command;
  mcpArgsInput.value = input.args.join("\n");
  mcpEnvInput.value = Object.entries(input.env)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

function mcpStatusText(row: McpServerRow): string {
  if (!row.enabled) return "已停用";
  if (row.connected) return `已连接 · ${row.toolNames.length} 个工具`;
  return row.lastError ? "失败" : "未连接";
}

async function refreshConnect(): Promise<void> {
  if (!wb) return;
  mcpNote.textContent = "";
  const [servers, templates] = await Promise.all([wb.listMcpServers(), wb.listMcpTemplates()]);
  mcpListEl.replaceChildren();
  if (servers.length === 0) {
    mcpListEl.appendChild(emptyStateEl("🔌", "还没有连接器，从下方模版填入或手写 command"));
  }
  for (const row of servers) {
    const li = document.createElement("li");
    const wrap = document.createElement("div");
    wrap.className = "mcp-row";
    const meta = document.createElement("div");
    meta.className = "mcp-meta";
    const h3 = document.createElement("h3");
    h3.textContent = row.name;
    const p = document.createElement("p");
    p.textContent = `${mcpStatusText(row)} · ${row.command} ${row.args.join(" ")}`.trim();
    meta.append(h3, p);
    if (row.lastError) {
      const err = document.createElement("p");
      err.textContent = row.lastError;
      meta.appendChild(err);
    }
    if (row.toolNames.length) {
      const tools = document.createElement("p");
      tools.className = "mcp-tools";
      tools.textContent = row.toolNames.join("、");
      meta.appendChild(tools);
    }
    const actions = document.createElement("div");
    actions.className = "mcp-actions";
    const toggleLabel = document.createElement("label");
    toggleLabel.className = "card-toggle";
    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.checked = row.enabled;
    toggle.addEventListener("change", () => {
      void wb
        ?.setMcpEnabled(row.name, toggle.checked)
        .then(() => refreshConnect())
        .catch((error) => {
          toggle.checked = !toggle.checked;
          showNote(error instanceof Error ? error.message : "开关失败");
        });
    });
    toggleLabel.append(toggle, document.createTextNode("启用"));
    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "填入表单";
    edit.addEventListener("click", () => {
      fillMcpForm(row);
    });
    const probe = document.createElement("button");
    probe.type = "button";
    probe.textContent = "试连";
    probe.addEventListener("click", () => {
      void runMcpProbe(row);
    });
    const del = document.createElement("button");
    del.type = "button";
    del.textContent = "删除";
    del.addEventListener("click", () => {
      void (async () => {
        await wb?.removeMcpServer(row.name);
        await refreshConnect();
      })().catch((error) => {
        showNote(error instanceof Error ? error.message : "删除失败");
      });
    });
    actions.append(toggleLabel, edit, probe, del);
    wrap.append(meta, actions);
    li.appendChild(wrap);
    mcpListEl.appendChild(li);
  }
  mcpTemplatesEl.replaceChildren();
  for (const tpl of templates) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mcp-tpl";
    const h3 = document.createElement("h3");
    h3.textContent = tpl.name;
    const p = document.createElement("p");
    p.textContent = tpl.hints ? `${tpl.description}\n${tpl.hints}` : tpl.description;
    btn.append(h3, p);
    btn.addEventListener("click", () => {
      fillMcpForm({ name: tpl.id, command: tpl.command, args: tpl.args, env: tpl.env });
      mcpFormErr.textContent = "";
    });
    mcpTemplatesEl.appendChild(btn);
  }
}

async function runMcpProbe(server: { name: string; command: string; args: string[]; env: Record<string, string> }): Promise<void> {
  if (!wb) return;
  mcpProbeOut.hidden = false;
  mcpProbeOut.textContent = "试连中…";
  try {
    const result = await wb.probeMcpServer(server);
    mcpProbeOut.textContent = result.ok
      ? `试连成功\n${result.toolNames.join("\n") || "（无工具）"}`
      : `试连失败\n${result.error}`;
  } catch (error) {
    mcpProbeOut.textContent = error instanceof Error ? error.message : "试连失败";
  }
}

async function refreshList(): Promise<void> {
  if (!wb) {
    return;
  }
  applyChrome();
  listEl.replaceChildren();
  if (rail === "desk") {
    await refreshDesk();
    return;
  }
  if (rail === "kb") {
    await refreshKb();
    return;
  }
  if (rail === "connect") {
    await refreshConnect();
    return;
  }
  if (rail === "shop") {
    const items = await wb.listLivePlugins();
    galleryEl.replaceChildren();
    if (items.length === 0) {
      galleryEl.appendChild(emptyStateEl("🛍️", "还没有上线的模组，先到模板做好再上线"));
      return;
    }
    for (const item of items) {
      galleryEl.appendChild(await buildShopCard(item));
    }
    return;
  }
  if (rail === "skin") {
    const allow = new Set(["theme", "panel", "launcher"]);
    const entries = (await wb.listSandboxPlugins()).filter((item) => allow.has(item.template));
    galleryEl.replaceChildren();
    if (entries.length === 0) {
      galleryEl.appendChild(emptyStateEl("🎨", "还没有模板，点「新建」创建主题、播放器或启动器"));
      return;
    }
    for (const entry of entries) {
      galleryEl.appendChild(buildSkinCard(entry));
    }
    return;
  }
}

async function deleteWorkspace(id: string): Promise<void> {
  if (!wb) {
    return;
  }
  try {
    await wb.deleteSandboxPlugin(id);
    if (currentId === id) {
      currentId = "";
      currentTemplate = "";
      themePack = null;
      layoutNodes = [];
      selectedNodeId = "";
      currentEl.textContent = rail === "shop" ? "工坊" : rail === "skin" ? "模板" : rail === "connect" ? "连接" : "未选择";
      skinForm.hidden = true;
      setSending(false);
      applyChrome();
    }
    await refreshList();
  } catch (error) {
    showNote(error instanceof Error ? error.message : "删除失败");
  }
}

async function selectWorkspace(id: string): Promise<void> {
  if (id === currentId) {
    return;
  }
  if (!wb || sending) {
    return;
  }
  currentId = id;
  currentEl.textContent = rail === "shop" ? `${id} · 已上线` : `${id} · 草稿`;
  if (rail === "shop") {
    await refreshList();
    setSending(false);
    return;
  }
  currentTemplate = "";
  try {
    const entries = await wb.listSandboxPlugins();
    currentTemplate = entries.find((item) => item.id === id)?.template ?? "";
    if (currentTemplate === "theme") {
      await loadThemeEditor(id);
    } else if (currentTemplate === "panel" || currentTemplate === "launcher") {
      await loadSkinForm(id);
      await loadCanvasEditor(id);
    } else {
      showNote("未知模板");
    }
  } catch (error) {
    showNote(error instanceof Error ? error.message : "读取失败");
  }
  await refreshList();
  setSending(false);
}

function openCreate(): void {
  if (rail === "shop") return;
  createErr.textContent = "";
  newIdInput.value = "";
  syncCreateKinds();
  createMask.hidden = false;
  newIdInput.focus();
}

function closeCreate(): void {
  createMask.hidden = true;
}

newBtn.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  openCreate();
});

newCancel.addEventListener("click", () => {
  closeCreate();
});

createMask.addEventListener("click", (event) => {
  if (event.target === createMask) {
    closeCreate();
  }
});

createBox.addEventListener("submit", (event) => {
  event.preventDefault();
  const id = newIdInput.value.trim();
  if (!id) {
    createErr.textContent = "填写工作区 id";
    return;
  }
  if (!wb) {
    createErr.textContent = "preload 未就绪";
    return;
  }
  void (async () => {
    try {
      const raw =
        (createBox.querySelector('input[name="new-kind"]:checked') as HTMLInputElement | null)?.value ??
        "theme";
      const kind = raw === "panel" || raw === "launcher" || raw === "theme" ? raw : "theme";
      await wb.createSandboxPlugin(id, kind);
      closeCreate();
      await selectWorkspace(id);
    } catch (error) {
      createErr.textContent = error instanceof Error ? error.message : "新建失败";
    }
  })();
});

publishBtn.addEventListener("click", () => {
  if (!currentId || !wb || sending || rail === "shop") {
    return;
  }
  void (async () => {
    setSending(true);
    try {
      if (rail === "skin") {
        if (currentTemplate === "theme") {
          await saveThemeEditor();
        } else if (currentTemplate === "panel" || currentTemplate === "launcher") {
          await saveSkinForm();
          await saveCanvas();
        }
        void wb.previewTheme(null);
      }
      const result = await wb.publishSandboxPlugin(currentId);
      if (result.ok) {
        showNote(`已上线 ${result.id}，已在工坊启用。`);
      } else {
        showNote(result.error);
      }
    } catch (error) {
      showNote(error instanceof Error ? error.message : "上线失败");
    } finally {
      setSending(false);
    }
  })();
});

if (wb) {
  bindIme(newIdInput);
  bindIme(deskInput);
  wb.onSettingsUpdated(() => {
    void paintTheme();
    if (rail === "shop" || rail === "connect") void refreshList();
  });
  mcpRevealBtn.addEventListener("click", () => {
    void wb.revealMcpConfig().catch((error) => {
      showNote(error instanceof Error ? error.message : "无法打开配置");
    });
  });
  mcpProbeBtn.addEventListener("click", () => {
    const server = parseMcpForm();
    if (!server.name || !server.command) {
      mcpFormErr.textContent = "填写 id 与 command";
      return;
    }
    mcpFormErr.textContent = "";
    void runMcpProbe(server);
  });
  mcpForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const server = parseMcpForm();
    if (!server.name || !server.command) {
      mcpFormErr.textContent = "填写 id 与 command";
      return;
    }
    mcpFormErr.textContent = "";
    void (async () => {
      const result = await wb.upsertMcpServer(server);
      mcpProbeOut.hidden = false;
      if (result.ok && result.server) {
        mcpProbeOut.textContent = `已连接\n${result.server.toolNames.join("\n") || "（无工具）"}`;
      } else {
        mcpProbeOut.textContent = `连接失败\n${result.server?.lastError || "未知错误"}`;
      }
      await refreshConnect();
    })().catch((error) => {
      mcpFormErr.textContent = error instanceof Error ? error.message : "连接失败";
    });
  });
  for (const btn of Array.from(document.querySelectorAll("[data-rail]"))) {
    btn.addEventListener("click", () => {
      const next = (btn as HTMLButtonElement).dataset.rail;
      if (
        next !== "desk" &&
        next !== "skin" &&
        next !== "shop" &&
        next !== "connect" &&
        next !== "kb"
      )
        return;
      if (next === rail) return;
      void (async () => {
        rail = next;
        document.querySelectorAll("[data-rail]").forEach((node) => {
          node.classList.toggle("active", (node as HTMLElement).dataset.rail === rail);
        });
        currentId = "";
        currentTemplate = "";
        themePack = null;
        layoutNodes = [];
        selectedNodeId = "";
        currentEl.textContent =
          next === "shop"
            ? "工坊"
            : next === "skin"
              ? "模板"
              : next === "kb"
                ? "知识库"
                : next === "desk"
                  ? "共享画布"
                  : "连接";
        void wb?.previewTheme(null);
        applyChrome();
        setSending(false);
        await refreshList();
      })();
    });
  }
  skinForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void saveSkinForm().catch((error) => {
      showNote(error instanceof Error ? error.message : "保存失败");
    });
  });
  themeEd.addEventListener("submit", (event) => {
    event.preventDefault();
    void saveThemeEditor().catch((error) => {
      showNote(error instanceof Error ? error.message : "保存失败");
    });
  });
  themeFile.addEventListener("change", () => {
    const file = themeFile.files?.[0];
    if (file) void applyThemeSprite(file);
  });
  themeSoundPick.addEventListener("click", () => {
    themeSoundFile.value = "";
    themeSoundFile.click();
  });
  themeSoundClear.addEventListener("click", () => {
    themeSound.value = "";
    updateSoundPreview();
  });
  themePreviewBtn.addEventListener("click", () => {
    void wb?.previewTheme(themePreviewTokens());
  });
  themeRestoreBtn.addEventListener("click", () => {
    void wb?.previewTheme(null);
  });
  themeSoundFile.addEventListener("change", () => {
    const file = themeSoundFile.files?.[0];
    if (!file || !wb || !currentId) return;
    void (async () => {
      try {
        const rel = `sound/${nodeId("snd")}${assetExt(file.name) || ".mp3"}`;
        const b64 = await fileToB64(file);
        await wb.uploadSandboxAsset(currentId, rel, b64);
        themeSound.value = rel;
        updateSoundPreview();
      } catch (error) {
        showNote(error instanceof Error ? error.message : "上传失败");
      }
    })();
  });
  canvasTextBtn.addEventListener("click", () => {
    addCanvasText();
  });
  canvasImageBtn.addEventListener("click", () => {
    canvasFile.value = "";
    canvasFile.click();
  });
  canvasDeco.addEventListener("click", () => {
    addCanvasDeco();
  });
  canvasDelete.addEventListener("click", () => {
    deleteSelectedNode();
  });
  canvasSave.addEventListener("click", () => {
    void saveCanvas().catch((error) => {
      showNote(error instanceof Error ? error.message : "保存失败");
    });
  });
  canvasFile.addEventListener("change", () => {
    const file = canvasFile.files?.[0];
    if (file) void applyCanvasImage(file);
  });
  canvasBoard.addEventListener("pointerdown", (event) => {
    if (event.target === canvasBoard) {
      selectCanvasNode("");
    }
  });
  window.addEventListener("keydown", (event) => {
    if ((event.key === "Delete" || event.key === "Backspace") && !canvasEd.hidden && selectedNodeId) {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      event.preventDefault();
      deleteSelectedNode();
    }
  });
  backBtn.addEventListener("click", () => {
    currentId = "";
    currentTemplate = "";
    themePack = null;
    layoutNodes = [];
    selectedNodeId = "";
    currentEl.textContent = "模板";
    void wb?.previewTheme(null);
    applyChrome();
    void refreshList();
  });
  previewClose.addEventListener("click", () => {
    previewMask.hidden = true;
    previewBody.replaceChildren();
  });
  previewMask.addEventListener("click", (event) => {
    if (event.target === previewMask) {
      previewMask.hidden = true;
      previewBody.replaceChildren();
    }
  });
  kbNewBtn.addEventListener("click", () => {
    kbNewRow.hidden = false;
    kbNewInput.value = "";
    kbNewInput.focus();
  });
  const createKb = async (): Promise<void> => {
    const name = kbNewInput.value.trim();
    if (!name || !wb) return;
    kbNewRow.hidden = true;
    try {
      await wb.createKbCollection(name);
      await refreshKb();
    } catch (error) {
      showNote(error instanceof Error ? error.message : "创建失败");
    }
  };
  kbNewOk.addEventListener("click", () => {
    void createKb();
  });
  kbNewInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void createKb();
    }
  });
  kbRefreshBtn.addEventListener("click", () => {
    void refreshKb();
  });
  kbReindexBtn.addEventListener("click", () => {
    if (!wb) return;
    void (async () => {
      try {
        const { chunks } = await wb.reindexKb();
        showNote(`已重建 ${chunks} 个分块的索引`);
      } catch (error) {
        showNote(error instanceof Error ? error.message : "重建失败");
      }
    })();
  });
  kbFileBtn.addEventListener("click", () => {
    kbFile.value = "";
    kbFile.click();
  });
  kbFile.addEventListener("change", () => {
    const file = kbFile.files?.[0];
    if (file) void handleKbFile(file);
  });
  kbUrlBtn.addEventListener("click", () => {
    void importKbUrl();
  });
  kbExportBtn.addEventListener("click", () => {
    void exportDb();
  });
  kbImportForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!wb || !kbCollectionId) return;
    const title = kbImportTitle.value.trim();
    const text = kbImportText.value.trim();
    if (!text) return;
    void (async () => {
      try {
        const result = await wb.importKbDocument(kbCollectionId, { title: title || "未命名文档", text, sourceName: kbSourceName });
        kbSourceName = "";
        kbImportText.value = "";
        kbImportTitle.value = "";
        if (result.action === "skipped") {
          showNote("内容未变化，已跳过（去重）");
        } else if (result.action === "updated") {
          showNote("已覆盖更新，后台重新处理中");
        } else {
          showNote("已导入，后台处理中");
        }
        window.setTimeout(() => {
          void renderKbPanel();
        }, 1500);
      } catch (error) {
        showNote(error instanceof Error ? error.message : "导入失败");
      }
    })();
  });
  kbSearchBtn.addEventListener("click", () => {
    void runKbSearch();
  });
  kbSearchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void runKbSearch();
    }
  });
  deskNewBtn.addEventListener("click", () => {
    void (async () => {
      const created = await wb.createSession("新会话", "desk");
      deskSessionId = created.id;
      await refreshDesk();
    })();
  });
  deskResetBtn.addEventListener("click", () => {
    void (async () => {
      const created = await wb.createSession("新会话", "desk");
      deskSessionId = created.id;
      deskViewingTurnId = null;
      deskTurns = [];
      paintDeskActivity();
      deskSessions = await wb.listSessions("desk");
      paintDeskSessions();
      currentEl.textContent = created.title || "共享画布";
      await loadDeskBoard();
    })();
  });
  deskLiveBtn.addEventListener("click", () => {
    deskViewingTurnId = null;
    showDeskBoard(deskLiveItems, false);
    paintDeskActivity();
  });
  deskAttachBtn.addEventListener("click", () => {
    deskFile.click();
  });
  deskFile.addEventListener("change", () => {
    if (deskFile.files) void addDeskFiles(deskFile.files);
    deskFile.value = "";
  });
  deskInput.addEventListener("paste", (event) => {
    const files = event.clipboardData?.files;
    if (files && files.length) {
      event.preventDefault();
      void addDeskFiles(files);
    }
  });
  deskBoardEl.addEventListener("paste", (event) => {
    const files = event.clipboardData?.files;
    if (files && files.length) {
      event.preventDefault();
      void addDeskFiles(files);
    }
  });
  deskChatForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void sendDeskChat();
  });
  deskStop.addEventListener("click", () => {
    wb?.abortChat();
  });
  void paintTheme();
  void refreshList();
}
setSending(false);
