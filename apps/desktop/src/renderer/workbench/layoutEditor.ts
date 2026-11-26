import { fileToB64, assetExt, nodeId } from "./editorFiles.js";
import { canvasBoard, canvasDelete, s, showNote, wb as workbenchApi } from "./ctx.js";
import type { LayoutNode } from "./types.js";

const wb = workbenchApi;

function clampNum(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function selectCanvasNode(id: string): void {
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

export function addCanvasText(): void {
  const text = window.prompt("文字内容", "文字")?.trim();
  if (!text) return;
  s.layoutNodes.push({ id: nodeId("t"), type: "text", x: 8, y: 8, w: 60, h: 24, text });
  renderCanvas();
}

export function addCanvasDeco(): void {
  s.layoutNodes.push({ id: nodeId("d"), type: "deco", x: 8, y: 8, w: 60, h: 40 });
  renderCanvas();
}

export async function applyCanvasImage(file: File): Promise<void> {
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

export function deleteSelectedNode(): void {
  if (!s.selectedNodeId) return;
  s.layoutNodes = s.layoutNodes.filter((n) => n.id !== s.selectedNodeId);
  s.selectedNodeId = "";
  renderCanvas();
}

export async function saveCanvas(): Promise<void> {
  if (!wb || !s.currentId) return;
  await wb.writeLayout(s.currentId, s.layoutNodes);
  showNote("布局已保存");
}

export async function loadCanvasEditor(id: string): Promise<void> {
  if (!wb) return;
  const data = await wb.readLayout(id);
  s.layoutNodes = data.nodes ?? [];
  s.selectedNodeId = "";
  canvasBoard.style.width = "280px";
  canvasBoard.style.height = s.currentTemplate === "launcher" ? "420px" : "360px";
  renderCanvas();
}

