import {
  applyChrome,
  backBtn,
  bindIme,
  canvasBoard,
  canvasDeco,
  canvasDelete,
  canvasEd,
  canvasFile,
  canvasImageBtn,
  canvasSave,
  canvasTextBtn,
  createBox,
  createErr,
  createMask,
  currentEl,
  deskAttachBtn,
  deskBoardEl,
  deskChatForm,
  deskFile,
  deskInput,
  deskLiveBtn,
  deskNewBtn,
  deskResetBtn,
  deskStop,
  emptyStateEl,
  galleryEl,
  kbExportBtn,
  kbFile,
  kbFileBtn,
  kbImportForm,
  kbImportText,
  kbImportTitle,
  kbNewBtn,
  kbNewInput,
  kbNewOk,
  kbNewRow,
  kbRefreshBtn,
  kbReindexBtn,
  kbSearchBtn,
  kbSearchInput,
  kbUrlBtn,
  listEl,
  mcpForm,
  mcpFormErr,
  mcpProbeBtn,
  mcpProbeOut,
  mcpRevealBtn,
  newBtn,
  newCancel,
  newIdInput,
  noteEl,
  previewBody,
  previewClose,
  previewMask,
  previewTitle,
  publishBtn,
  s,
  showNote,
  skinDesc,
  skinFilterExt,
  skinFilterExtRow,
  skinFilterName,
  skinFilterNameRow,
  skinForm,
  skinLabel,
  skinMultiple,
  skinMultipleRow,
  skinName,
  skinTitle,
  themeBg,
  themeDesc,
  themeDialog,
  themeEd,
  themeFile,
  themeFont,
  themeMenu,
  themeName,
  themePreviewBtn,
  themeRestoreBtn,
  themeSound,
  themeSoundClear,
  themeSoundFile,
  themeSoundPick,
  themeSoundPreview,
  themeSprites,
  wb as workbenchApi
} from "./ctx.js";
import {
  addDeskFiles,
  loadDeskBoard,
  paintDeskActivity,
  paintDeskSessions,
  refreshDesk,
  sendDeskChat,
  showDeskBoard
} from "./desk.js";
import { exportDb, handleKbFile, importKbUrl, refreshKb, renderKbPanel, runKbSearch } from "./kb.js";
import { parseMcpForm, refreshConnect, runMcpProbe } from "./connect.js";
import { EMOTION_KEYS, type LayoutNode, type LiveItem, type PluginTemplateKind, type SandboxEntry } from "./types.js";

const wb = workbenchApi;

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
  if (!wb || !s.currentId || s.rail !== "skin") return;
  await wb.patchSandboxPluginForm(s.currentId, readSkinPatch());
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

function emptyThemeTokens(): { bg: string; font: string; dialog: string; menu: string; sound: string } {
  return { bg: "#f4f6fb", font: "", dialog: "#ffffff", menu: "#ffffff", sound: "" };
}

function renderThemeSprites(): void {
  themeSprites.replaceChildren();
  const sprites = s.themePack?.sprites ?? {};
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
        ?.sandboxAssetUrl(s.currentId, rel)
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
      s.themeSpriteTarget = emotion;
      themeFile.value = "";
      themeFile.click();
    });
    actions.appendChild(upload);
    if (rel) {
      const clear = document.createElement("button");
      clear.type = "button";
      clear.textContent = "清除";
      clear.addEventListener("click", () => {
        if (!s.themePack) return;
        delete s.themePack.sprites[emotion];
        renderThemeSprites();
      });
      actions.appendChild(clear);
    }
    slot.append(label, box, actions);
    themeSprites.appendChild(slot);
  }
}

async function applyThemeSprite(file: File): Promise<void> {
  const emotion = s.themeSpriteTarget;
  if (!emotion || !wb || !s.currentId) return;
  try {
    const rel = `sprites/${emotion}${assetExt(file.name) || ".png"}`;
    const b64 = await fileToB64(file);
    await wb.uploadSandboxAsset(s.currentId, rel, b64);
    if (!s.themePack) s.themePack = { name: "", description: "", tokens: emptyThemeTokens(), sprites: {} };
    s.themePack.sprites[emotion] = rel;
    renderThemeSprites();
  } catch (error) {
    showNote(error instanceof Error ? error.message : "上传失败");
  }
}

function updateSoundPreview(): void {
  const rel = themeSound.value.trim();
  if (rel && wb && s.currentId) {
    void wb
      .sandboxAssetUrl(s.currentId, rel)
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
  s.themePack = pack;
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
  if (!wb || !s.currentId || !s.themePack) return;
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
    sprites: s.themePack.sprites
  };
  s.themePack = await wb.writeThemePack(s.currentId, pack);
  showNote("主题已保存");
}

// ---- canvas editor ----

function clampNum(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function selectCanvasNode(id: string): void {
  s.selectedNodeId = id;
  for (const el of Array.from(canvasBoard.querySelectorAll(".canvas-node"))) {
    el.classList.toggle("selected", (el as HTMLElement).dataset.id === id);
  }
  canvasDelete.disabled = !id;
}

function bringToFront(id: string): void {
  const idx = s.layoutNodes.findIndex((n) => n.id === id);
  if (idx < 0 || idx === s.layoutNodes.length - 1) return;
  const node = s.layoutNodes[idx];
  s.layoutNodes.splice(idx, 1);
  s.layoutNodes.push(node as LayoutNode);
  const el = canvasBoard.querySelector(`.canvas-node[data-id="${id}"]`);
  if (el) canvasBoard.appendChild(el);
}

function renderCanvas(): void {
  canvasBoard.replaceChildren();
  canvasDelete.disabled = !s.selectedNodeId || !s.layoutNodes.some((n) => n.id === s.selectedNodeId);
  for (const node of s.layoutNodes) {
    const el = document.createElement("div");
    el.className = `canvas-node${node.id === s.selectedNodeId ? " selected" : ""}${node.type === "deco" ? " deco" : ""}`;
    el.dataset.id = node.id;
    el.style.left = `${node.x}px`;
    el.style.top = `${node.y}px`;
    el.style.width = `${node.w}px`;
    el.style.height = `${node.h}px`;
    if (node.type === "image" && node.src) {
      const img = document.createElement("img");
      img.draggable = false;
      void wb
        ?.sandboxAssetUrl(s.currentId, node.src)
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
  s.layoutNodes.push({ id: nodeId("t"), type: "text", x: 8, y: 8, w: 60, h: 24, text });
  renderCanvas();
}

function addCanvasDeco(): void {
  s.layoutNodes.push({ id: nodeId("d"), type: "deco", x: 8, y: 8, w: 60, h: 40 });
  renderCanvas();
}

async function applyCanvasImage(file: File): Promise<void> {
  if (!wb || !s.currentId) return;
  try {
    const rel = `deco/${nodeId("img")}${assetExt(file.name) || ".png"}`;
    const b64 = await fileToB64(file);
    await wb.uploadSandboxAsset(s.currentId, rel, b64);
    s.layoutNodes.push({ id: nodeId("i"), type: "image", x: 8, y: 8, w: 60, h: 60, src: rel });
    renderCanvas();
  } catch (error) {
    showNote(error instanceof Error ? error.message : "上传失败");
  }
}

function deleteSelectedNode(): void {
  if (!s.selectedNodeId) return;
  s.layoutNodes = s.layoutNodes.filter((n) => n.id !== s.selectedNodeId);
  s.selectedNodeId = "";
  renderCanvas();
}

async function saveCanvas(): Promise<void> {
  if (!wb || !s.currentId) return;
  await wb.writeLayout(s.currentId, s.layoutNodes);
  showNote("布局已保存");
}

async function loadCanvasEditor(id: string): Promise<void> {
  if (!wb) return;
  const data = await wb.readLayout(id);
  s.layoutNodes = data.nodes ?? [];
  s.selectedNodeId = "";
  canvasBoard.style.width = "280px";
  canvasBoard.style.height = s.currentTemplate === "launcher" ? "420px" : "360px";
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
  card.className = `card${entry.id === s.currentId ? " active" : ""}`;
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

function setSending(busy: boolean): void {
  s.sending = busy;
  publishBtn.disabled = !s.currentId || busy || s.rail === "shop" || s.rail === "connect" || s.rail === "kb";
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

async function refreshList(): Promise<void> {
  if (!wb) {
    return;
  }
  applyChrome();
  listEl.replaceChildren();
  if (s.rail === "desk") {
    await refreshDesk();
    return;
  }
  if (s.rail === "kb") {
    await refreshKb();
    return;
  }
  if (s.rail === "connect") {
    await refreshConnect();
    return;
  }
  if (s.rail === "shop") {
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
  if (s.rail === "skin") {
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
    if (s.currentId === id) {
      s.currentId = "";
      s.currentTemplate = "";
      s.themePack = null;
      s.layoutNodes = [];
      s.selectedNodeId = "";
      currentEl.textContent = s.rail === "shop" ? "工坊" : s.rail === "skin" ? "模板" : s.rail === "connect" ? "连接" : "未选择";
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
  if (id === s.currentId) {
    return;
  }
  if (!wb || s.sending) {
    return;
  }
  s.currentId = id;
  currentEl.textContent = s.rail === "shop" ? `${id} · 已上线` : `${id} · 草稿`;
  if (s.rail === "shop") {
    await refreshList();
    setSending(false);
    return;
  }
  s.currentTemplate = "";
  try {
    const entries = await wb.listSandboxPlugins();
    s.currentTemplate = entries.find((item) => item.id === id)?.template ?? "";
    if (s.currentTemplate === "theme") {
      await loadThemeEditor(id);
    } else if (s.currentTemplate === "panel" || s.currentTemplate === "launcher") {
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
  if (s.rail === "shop") return;
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
  if (!s.currentId || !wb || s.sending || s.rail === "shop") {
    return;
  }
  void (async () => {
    setSending(true);
    try {
      if (s.rail === "skin") {
        if (s.currentTemplate === "theme") {
          await saveThemeEditor();
        } else if (s.currentTemplate === "panel" || s.currentTemplate === "launcher") {
          await saveSkinForm();
          await saveCanvas();
        }
        void wb.previewTheme(null);
      }
      const result = await wb.publishSandboxPlugin(s.currentId);
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
    if (s.rail === "shop" || s.rail === "connect") void refreshList();
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
      if (next === s.rail) return;
      void (async () => {
        s.rail = next;
        document.querySelectorAll("[data-rail]").forEach((node) => {
          node.classList.toggle("active", (node as HTMLElement).dataset.rail === s.rail);
        });
        s.currentId = "";
        s.currentTemplate = "";
        s.themePack = null;
        s.layoutNodes = [];
        s.selectedNodeId = "";
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
    if (!file || !wb || !s.currentId) return;
    void (async () => {
      try {
        const rel = `sound/${nodeId("snd")}${assetExt(file.name) || ".mp3"}`;
        const b64 = await fileToB64(file);
        await wb.uploadSandboxAsset(s.currentId, rel, b64);
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
    if ((event.key === "Delete" || event.key === "Backspace") && !canvasEd.hidden && s.selectedNodeId) {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      event.preventDefault();
      deleteSelectedNode();
    }
  });
  backBtn.addEventListener("click", () => {
    s.currentId = "";
    s.currentTemplate = "";
    s.themePack = null;
    s.layoutNodes = [];
    s.selectedNodeId = "";
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
    if (!wb || !s.kbCollectionId) return;
    const title = kbImportTitle.value.trim();
    const text = kbImportText.value.trim();
    if (!text) return;
    void (async () => {
      try {
        const result = await wb.importKbDocument(s.kbCollectionId, { title: title || "未命名文档", text, sourceName: s.kbSourceName });
        s.kbSourceName = "";
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
      s.deskSessionId = created.id;
      await refreshDesk();
    })();
  });
  deskResetBtn.addEventListener("click", () => {
    void (async () => {
      const created = await wb.createSession("新会话", "desk");
      s.deskSessionId = created.id;
      s.deskViewingTurnId = null;
      s.deskTurns = [];
      paintDeskActivity();
      s.deskSessions = await wb.listSessions("desk");
      paintDeskSessions();
      currentEl.textContent = created.title || "共享画布";
      await loadDeskBoard();
    })();
  });
  deskLiveBtn.addEventListener("click", () => {
    s.deskViewingTurnId = null;
    showDeskBoard(s.deskLiveItems, false);
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
