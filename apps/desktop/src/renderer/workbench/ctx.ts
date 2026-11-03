import type {
  KbCollection,
  KbDocument,
  DeskSession,
  DeskCanvasItem,
  DeskTurn,
  LayoutNode,
  PluginTemplateKind,
  Rail,
  WorkbenchApi
} from "./types.js";

export const wb = (window as Window & { hoshi?: WorkbenchApi }).hoshi;

export const s = {
  deskImageCache: new Map<string, string>(),
  rail: "desk" as Rail,
  currentTemplate: "" as PluginTemplateKind | "",
  layoutNodes: [] as LayoutNode[],
  themePack: null as {
    name: string;
    description: string;
    tokens: { bg: string; font: string; dialog: string; menu: string; sound: string };
    sprites: Record<string, string>;
  } | null,
  themeSpriteTarget: "",
  selectedNodeId: "",
  currentId: "",
  sending: false,
  kbCollections: [] as KbCollection[],
  kbCollectionId: "",
  kbDocuments: [] as KbDocument[],
  kbSourceName: "",
  deskSessions: [] as DeskSession[],
  deskSessionId: "",
  deskItems: [] as DeskCanvasItem[],
  deskLiveItems: [] as DeskCanvasItem[],
  deskViewingTurnId: null as string | null,
  deskPendingImages: [] as Array<{ mime: string; data: string; preview: string }>,
  deskSending: false,
  deskTurns: [] as DeskTurn[]
};

export const listEl = document.getElementById("plugin-list") as HTMLUListElement;
export const sideTitle = document.getElementById("side-title") as HTMLSpanElement;
export const skinForm = document.getElementById("skin-form") as HTMLFormElement;
export const shopHint = document.getElementById("shop-hint") as HTMLParagraphElement;
export const connectPanel = document.getElementById("connect-panel") as HTMLDivElement;
export const mcpListEl = document.getElementById("mcp-list") as HTMLUListElement;
export const mcpTemplatesEl = document.getElementById("mcp-templates") as HTMLDivElement;
export const mcpNote = document.getElementById("mcp-note") as HTMLParagraphElement;
export const mcpForm = document.getElementById("mcp-form") as HTMLFormElement;
export const mcpIdInput = document.getElementById("mcp-id") as HTMLInputElement;
export const mcpCommandInput = document.getElementById("mcp-command") as HTMLInputElement;
export const mcpArgsInput = document.getElementById("mcp-args") as HTMLTextAreaElement;
export const mcpEnvInput = document.getElementById("mcp-env") as HTMLTextAreaElement;
export const mcpFormErr = document.getElementById("mcp-form-err") as HTMLParagraphElement;
export const mcpProbeBtn = document.getElementById("mcp-probe-btn") as HTMLButtonElement;
export const mcpRevealBtn = document.getElementById("mcp-reveal-btn") as HTMLButtonElement;
export const mcpProbeOut = document.getElementById("mcp-probe-out") as HTMLPreElement;
export const skinName = document.getElementById("skin-name") as HTMLInputElement;
export const skinDesc = document.getElementById("skin-desc") as HTMLInputElement;
export const skinLabel = document.getElementById("skin-label") as HTMLInputElement;
export const skinTitle = document.getElementById("skin-title") as HTMLInputElement;
export const skinMultiple = document.getElementById("skin-multiple") as HTMLInputElement;
export const skinFilterName = document.getElementById("skin-filter-name") as HTMLInputElement;
export const skinFilterExt = document.getElementById("skin-filter-ext") as HTMLInputElement;
export const skinMultipleRow = document.getElementById("skin-multiple-row") as HTMLLabelElement;
export const skinFilterNameRow = document.getElementById("skin-filter-name-row") as HTMLLabelElement;
export const skinFilterExtRow = document.getElementById("skin-filter-ext-row") as HTMLLabelElement;
export const galleryEl = document.getElementById("gallery") as HTMLDivElement;
export const themeEd = document.getElementById("theme-ed") as HTMLFormElement;
export const themeName = document.getElementById("theme-name") as HTMLInputElement;
export const themeDesc = document.getElementById("theme-desc") as HTMLInputElement;
export const themePreviewBtn = document.getElementById("theme-preview") as HTMLButtonElement;
export const themeRestoreBtn = document.getElementById("theme-restore") as HTMLButtonElement;
export const themeSprites = document.getElementById("theme-sprites") as HTMLDivElement;
export const themeBg = document.getElementById("theme-bg") as HTMLInputElement;
export const themeDialog = document.getElementById("theme-dialog") as HTMLInputElement;
export const themeMenu = document.getElementById("theme-menu") as HTMLInputElement;
export const themeFont = document.getElementById("theme-font") as HTMLInputElement;
export const canvasEd = document.getElementById("canvas-ed") as HTMLDivElement;
export const canvasBoard = document.getElementById("canvas-board") as HTMLDivElement;
export const sidebarEl = document.getElementById("sidebar") as HTMLElement;
export const newBtn = document.getElementById("new-btn") as HTMLButtonElement;
export const createMask = document.getElementById("create-mask") as HTMLDivElement;
export const createBox = document.getElementById("create-box") as HTMLFormElement;
export const newIdInput = document.getElementById("new-id") as HTMLInputElement;
export const createErr = document.getElementById("create-err") as HTMLParagraphElement;
export const newCancel = document.getElementById("new-cancel") as HTMLButtonElement;
export const publishBtn = document.getElementById("publish-btn") as HTMLButtonElement;
export const currentEl = document.getElementById("current-id") as HTMLSpanElement;
export const wbNote = document.getElementById("wb-note") as HTMLParagraphElement;
export const backBtn = document.getElementById("back-btn") as HTMLButtonElement;
export const themeSound = document.getElementById("theme-sound") as HTMLInputElement;
export const themeSoundPick = document.getElementById("theme-sound-pick") as HTMLButtonElement;
export const themeSoundClear = document.getElementById("theme-sound-clear") as HTMLButtonElement;
export const themeSoundPreview = document.getElementById("theme-sound-preview") as HTMLAudioElement;
export const themeFile = document.getElementById("theme-file") as HTMLInputElement;
export const themeSoundFile = document.getElementById("theme-sound-file") as HTMLInputElement;
export const canvasTextBtn = document.getElementById("canvas-text") as HTMLButtonElement;
export const canvasImageBtn = document.getElementById("canvas-image") as HTMLButtonElement;
export const canvasDeco = document.getElementById("canvas-deco") as HTMLButtonElement;
export const canvasDelete = document.getElementById("canvas-delete") as HTMLButtonElement;
export const canvasSave = document.getElementById("canvas-save") as HTMLButtonElement;
export const canvasFile = document.getElementById("canvas-file") as HTMLInputElement;
export const previewMask = document.getElementById("preview-mask") as HTMLDivElement;
export const previewTitle = document.getElementById("preview-title") as HTMLSpanElement;
export const previewBody = document.getElementById("preview-body") as HTMLDivElement;
export const previewClose = document.getElementById("preview-close") as HTMLButtonElement;
export const kbPanel = document.getElementById("kb-panel") as HTMLDivElement;
export const kbCollectionName = document.getElementById("kb-collection-name") as HTMLSpanElement;
export const kbNewBtn = document.getElementById("kb-new-btn") as HTMLButtonElement;
export const kbNewRow = document.getElementById("kb-new-row") as HTMLDivElement;
export const kbNewInput = document.getElementById("kb-new-input") as HTMLInputElement;
export const kbNewOk = document.getElementById("kb-new-ok") as HTMLButtonElement;
export const kbRefreshBtn = document.getElementById("kb-refresh-btn") as HTMLButtonElement;
export const kbReindexBtn = document.getElementById("kb-reindex-btn") as HTMLButtonElement;
export const kbCapHint = document.getElementById("kb-cap-hint") as HTMLParagraphElement;
export const kbStatus = document.getElementById("kb-status") as HTMLDivElement;
export const kbDocList = document.getElementById("kb-doc-list") as HTMLUListElement;
export const kbImportForm = document.getElementById("kb-import-form") as HTMLFormElement;
export const kbImportTitle = document.getElementById("kb-import-title") as HTMLInputElement;
export const kbImportText = document.getElementById("kb-import-text") as HTMLTextAreaElement;
export const kbSearchInput = document.getElementById("kb-search-input") as HTMLInputElement;
export const kbSearchBtn = document.getElementById("kb-search-btn") as HTMLButtonElement;
export const kbSearchResults = document.getElementById("kb-search-results") as HTMLDivElement;
export const deskPanel = document.getElementById("desk-panel") as HTMLDivElement;
export const deskBoardEl = document.getElementById("desk-board") as HTMLDivElement;
export const deskHistoryList = document.getElementById("desk-activity-list") as HTMLDivElement;
export const deskResetBtn = document.getElementById("desk-reset-btn") as HTMLButtonElement;
export const deskLiveBtn = document.getElementById("desk-live-btn") as HTMLButtonElement;
export const deskChatForm = document.getElementById("desk-chat") as HTMLFormElement;
export const deskInput = document.getElementById("desk-input") as HTMLInputElement;
export const deskStop = document.getElementById("desk-stop") as HTMLButtonElement;
export const deskSend = document.getElementById("desk-send") as HTMLButtonElement;
export const deskAttachBtn = document.getElementById("desk-attach-btn") as HTMLButtonElement;
export const deskFile = document.getElementById("desk-file") as HTMLInputElement;
export const deskAttachRow = document.getElementById("desk-attach-row") as HTMLDivElement;
export const deskStatus = document.getElementById("desk-status") as HTMLParagraphElement;
export const deskNewBtn = document.getElementById("desk-new-btn") as HTMLButtonElement;
export const kbFileBtn = document.getElementById("kb-file-btn") as HTMLButtonElement;
export const kbFile = document.getElementById("kb-file") as HTMLInputElement;
export const kbUrl = document.getElementById("kb-url") as HTMLInputElement;
export const kbUrlBtn = document.getElementById("kb-url-btn") as HTMLButtonElement;
export const kbExportBtn = document.getElementById("kb-export-btn") as HTMLButtonElement;

export function showNote(text: string): void {
  if (!kbPanel.hidden) {
    kbStatus.textContent = text;
    return;
  }
  wbNote.hidden = !text;
  wbNote.textContent = text;
}

export function bindIme(el: HTMLElement): void {
  el.addEventListener("focus", () => {
    void wb?.workbenchIme(true);
  });
  el.addEventListener("blur", () => {
    void wb?.workbenchIme(false);
  });
}

export function applyChrome(): void {
  const shop = s.rail === "shop";
  const skin = s.rail === "skin";
  const kb = s.rail === "kb";
  const connect = s.rail === "connect";
  const desk = s.rail === "desk";
  const editingSkin = skin && Boolean(s.currentId);
  const isTheme = s.currentTemplate === "theme";
  const isPanelLauncher = s.currentTemplate === "panel" || s.currentTemplate === "launcher";
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
  publishBtn.hidden = shop || kb || connect || desk || (skin && !s.currentId);
  shopHint.hidden = !shop;
  connectPanel.hidden = !connect;
  kbPanel.hidden = !kb;
  deskPanel.hidden = !desk;
  skinForm.hidden = !(editingSkin && isPanelLauncher);
  galleryEl.hidden = !(shop || (skin && !s.currentId));
  themeEd.hidden = !(editingSkin && isTheme);
  canvasEd.hidden = !(editingSkin && isPanelLauncher);
}

export function noteEl(text: string): HTMLParagraphElement {
  const el = document.createElement("p");
  el.className = "preview-hint";
  el.textContent = text;
  return el;
}

export function emptyStateEl(icon: string, text: string): HTMLDivElement {
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
