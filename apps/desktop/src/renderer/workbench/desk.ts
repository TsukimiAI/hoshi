import { takeChatImages } from "./imageFile.js";
import type { DeskCanvasItem, DeskMessage, DeskSession, DeskStep, DeskTurn } from "./types.js";
import { parseDeskMarkdown, type DeskMarkdownBlock } from "./deskMarkdown.js";
import { packDeskCards } from "./deskLayout.js";
import {
  currentEl,
  deskAttachRow,
  deskBoardEl,
  deskHistoryList,
  deskInput,
  deskSend,
  deskStatus,
  deskStop,
  listEl,
  s,
  showNote,
  wb as workbenchApi
} from "./ctx.js";

import { DESK_SERIES_COLORS, renderDeskChart } from "./deskChart.js";

const wb = workbenchApi;

/** 与 packages/shared 的 canvasLayoutRole 一致。工作台脚本不打包 shared。 */
function canvasLayoutRole(kind: string, payload: Record<string, unknown>): "wide" | "half" {
  if (kind === "chart" || kind === "table") {
    return "wide";
  }
  if (kind === "markdown") {
    return String(payload.body ?? "").length > 180 ? "wide" : "half";
  }
  return "half";
}

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
  const cached = s.deskImageCache.get(url);
  if (cached) {
    img.src = cached;
    return true;
  }
  const apply = (src: string): void => {
    s.deskImageCache.set(url, src);
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


function toolLabel(name: string): string {
  if (name === "canvas_put" || name === "canvas_set" || name === "canvas_remove") return "画布";
  if (name === "search_knowledge" || name === "list_knowledge") return "知识库";
  return name;
}

const turnThumbs = new Map<string, string[] | "loading">();

function turnThumbSrcs(turn: DeskTurn): string[] {
  if (turn.previews && turn.previews.length > 0) {
    return turn.previews;
  }
  if (!turn.userMessageId || !turn.imageCount || !wb || !s.deskSessionId) {
    return [];
  }
  const cached = turnThumbs.get(turn.userMessageId);
  if (Array.isArray(cached)) {
    return cached;
  }
  if (cached !== "loading") {
    const messageId = turn.userMessageId;
    const sessionId = s.deskSessionId;
    turnThumbs.set(messageId, "loading");
    void wb
      .listMessageImages(sessionId, messageId)
      .then((data) => {
        turnThumbs.set(
          messageId,
          data.images.map((image) => `data:${image.mime};base64,${image.data}`)
        );
        paintDeskActivity();
      })
      .catch(() => {
        turnThumbs.set(messageId, []);
      });
  }
  return [];
}

export function paintDeskActivity(): void {
  const list = deskHistoryList;
  const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight <= 48;
  list.replaceChildren();
  for (const turn of s.deskTurns) {
    const card = document.createElement("div");
    card.className = `desk-turn${turn.open ? "" : " collapsed"}${
      s.deskViewingTurnId === turn.id ? " selected" : ""
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
    const thumbs = turnThumbSrcs(turn);
    if (thumbs.length > 0) {
      const row = document.createElement("span");
      row.className = "desk-turn-thumbs";
      for (const src of thumbs) {
        const img = document.createElement("img");
        img.src = src;
        img.alt = "图片";
        row.appendChild(img);
      }
      head.appendChild(row);
    }
    head.addEventListener("click", () => {
      turn.open = !turn.open;
      if (turn.canvasItems && turn.canvasItems.length > 0) {
        s.deskViewingTurnId = turn.id;
        showDeskBoard(turn.canvasItems, true);
      } else {
        s.deskViewingTurnId = null;
        showDeskBoard(s.deskLiveItems, s.deskSending);
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
    if (s.deskViewingTurnId === turn.id && !turn.id.startsWith("live-")) {
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
        imageCount: message.imageCount ?? 0,
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
  s.deskTurns = turnsFromMessages(messages, snapshots, activity);
  paintDeskActivity();
}

function paintDeskAttach(): void {
  deskAttachRow.hidden = s.deskPendingImages.length === 0;
  deskAttachRow.replaceChildren();
  s.deskPendingImages.forEach((image, index) => {
    const wrap = document.createElement("span");
    wrap.className = "desk-thumb-wrap";
    const img = document.createElement("img");
    img.className = "desk-thumb";
    img.src = image.preview;
    img.alt = "附件";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "desk-thumb-remove";
    remove.textContent = "×";
    remove.title = "移除";
    remove.addEventListener("click", () => {
      s.deskPendingImages.splice(index, 1);
      paintDeskAttach();
    });
    wrap.append(img, remove);
    deskAttachRow.appendChild(wrap);
  });
}

async function removeDeskItem(id: string): Promise<void> {
  if (s.deskViewingTurnId) return;
  s.deskLiveItems = s.deskLiveItems.filter((item) => item.id !== id);
  showDeskBoard(s.deskLiveItems, false);
  try {
    await wb?.deleteCanvasItem(id, s.deskSessionId);
  } catch (error) {
    deskStatus.textContent = error instanceof Error ? error.message : "删除画布失败";
    await loadDeskBoard();
  }
}

async function restoreDeskSnapshot(turnId: string): Promise<void> {
  if (!wb || !s.deskSessionId) return;
  try {
    const data = await wb.restoreCanvas(s.deskSessionId, turnId);
    s.deskLiveItems = data.items;
    s.deskViewingTurnId = null;
    showDeskBoard(s.deskLiveItems, false);
    paintDeskActivity();
    deskStatus.textContent = "已恢复为当前活板";
  } catch (error) {
    deskStatus.textContent = error instanceof Error ? error.message : "恢复失败";
  }
}

function deskItemWidth(item: DeskCanvasItem): number {
  const wide = canvasLayoutRole(item.kind, item.payload) === "wide";
  const floor = wide ? 560 : 300;
  return Math.max(floor, item.w || floor);
}

function sizeDeskCanvas(layer: HTMLElement): void {
  let width = layer.parentElement?.clientWidth ?? 0;
  let height = layer.parentElement?.clientHeight ?? 0;
  for (const node of Array.from(layer.querySelectorAll<HTMLElement>(".desk-item"))) {
    width = Math.max(width, node.offsetLeft + node.offsetWidth + 24);
    height = Math.max(height, node.offsetTop + node.offsetHeight + 24);
  }
  layer.style.width = `${width}px`;
  layer.style.height = `${height}px`;
}

let deskDragging = false;
let deskLayoutObserver: ResizeObserver | null = null;
let deskLayoutFrame = 0;

function placedStorageKey(sessionId: string): string {
  return `hoshi-desk-placed:${sessionId}`;
}

function readPlacedIds(sessionId: string): Set<string> {
  if (!sessionId) {
    return new Set();
  }
  try {
    const raw = localStorage.getItem(placedStorageKey(sessionId));
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) {
      return new Set();
    }
    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set();
  }
}

function rememberPlacedId(sessionId: string, id: string): void {
  if (!sessionId) {
    return;
  }
  const ids = readPlacedIds(sessionId);
  ids.add(id);
  localStorage.setItem(placedStorageKey(sessionId), JSON.stringify([...ids]));
}

function applyDeskPack(layer: HTMLElement): void {
  if (deskDragging || !layer.isConnected) {
    sizeDeskCanvas(layer);
    return;
  }
  // 历史快照只改画面。写回会改到活板上同 id 的卡。
  const persist = s.deskViewingTurnId == null && Boolean(s.deskSessionId);
  const placed = persist ? readPlacedIds(s.deskSessionId) : new Set<string>();
  const cards = s.deskItems.flatMap((item) => {
    const el = layer.querySelector<HTMLElement>(`.desk-item[data-id="${CSS.escape(item.id)}"]`);
    if (!el) {
      return [];
    }
    return [
      {
        id: item.id,
        x: item.x,
        y: item.y,
        w: el.offsetWidth,
        h: el.offsetHeight,
        placed: placed.has(item.id)
      }
    ];
  });
  const boardWidth = Math.max(layer.parentElement?.clientWidth ?? 0, 720);
  const packed = packDeskCards(cards, boardWidth);
  for (const next of packed) {
    if (placed.has(next.id)) {
      continue;
    }
    const item = s.deskItems.find((entry) => entry.id === next.id);
    const el = layer.querySelector<HTMLElement>(`.desk-item[data-id="${CSS.escape(next.id)}"]`);
    if (!item || !el || (item.x === next.x && item.y === next.y)) {
      continue;
    }
    item.x = next.x;
    item.y = next.y;
    el.style.left = `${next.x}px`;
    el.style.top = `${next.y}px`;
    if (!persist) {
      continue;
    }
    const live = s.deskLiveItems.find((entry) => entry.id === next.id);
    if (live) {
      live.x = next.x;
      live.y = next.y;
    }
    void wb?.patchCanvas(next.id, { x: next.x, y: next.y }, s.deskSessionId).catch(() => undefined);
  }
  sizeDeskCanvas(layer);
}

function watchDeskLayout(layer: HTMLElement): void {
  deskLayoutObserver?.disconnect();
  deskLayoutObserver = null;
  if (typeof ResizeObserver === "undefined") {
    return;
  }
  deskLayoutObserver = new ResizeObserver(() => {
    if (deskDragging || !layer.isConnected) {
      return;
    }
    cancelAnimationFrame(deskLayoutFrame);
    deskLayoutFrame = requestAnimationFrame(() => applyDeskPack(layer));
  });
  for (const card of Array.from(layer.querySelectorAll<HTMLElement>(".desk-item"))) {
    deskLayoutObserver.observe(card);
  }
}

function attachDeskDrag(el: HTMLElement, head: HTMLElement, item: DeskCanvasItem, layer: HTMLElement): void {
  head.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest(".desk-item-del")) {
      return;
    }
    event.preventDefault();
    deskDragging = true;
    head.setPointerCapture(event.pointerId);
    const originX = item.x;
    const originY = item.y;
    const startX = event.clientX;
    const startY = event.clientY;
    const topZ = s.deskItems.reduce((max, entry) => Math.max(max, entry.z), 0) + 1;
    item.z = topZ;
    el.style.zIndex = String(topZ);
    const move = (ev: PointerEvent): void => {
      item.x = Math.max(0, Math.round(originX + ev.clientX - startX));
      item.y = Math.max(0, Math.round(originY + ev.clientY - startY));
      el.style.left = `${item.x}px`;
      el.style.top = `${item.y}px`;
      sizeDeskCanvas(layer);
    };
    const up = (): void => {
      head.removeEventListener("pointermove", move);
      head.removeEventListener("pointerup", up);
      deskDragging = false;
      if (s.deskSessionId && (item.x !== originX || item.y !== originY)) {
        rememberPlacedId(s.deskSessionId, item.id);
      }
      const live = s.deskLiveItems.find((entry) => entry.id === item.id);
      if (live) {
        live.x = item.x;
        live.y = item.y;
        live.z = item.z;
      }
      void wb
        ?.patchCanvas(item.id, { x: item.x, y: item.y, z: item.z }, s.deskSessionId)
        .catch((error: unknown) => {
          deskStatus.textContent = error instanceof Error ? error.message : "移动卡片失败";
        });
    };
    head.addEventListener("pointermove", move);
    head.addEventListener("pointerup", up);
  });
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

function renderMarkdownBlock(block: DeskMarkdownBlock): HTMLElement {
  if (block.type === "h") {
    const node = document.createElement(block.level === 1 ? "h3" : block.level === 2 ? "h4" : "h5");
    appendSafeInline(node, block.text);
    return node;
  }
  if (block.type === "ul" || block.type === "ol") {
    const list = document.createElement(block.type);
    for (const item of block.items) {
      const li = document.createElement("li");
      appendSafeInline(li, item);
      list.appendChild(li);
    }
    return list;
  }
  if (block.type === "table") {
    return renderDeskTable({ columns: block.headers, rows: block.rows });
  }
  if (block.type === "code") {
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.textContent = block.text;
    pre.appendChild(code);
    return pre;
  }
  const p = document.createElement("p");
  appendSafeInline(p, block.text);
  return p;
}

function renderSafeMarkdown(source: string): HTMLElement {
  const root = document.createElement("div");
  root.className = "desk-md";
  for (const block of parseDeskMarkdown(source)) {
    root.appendChild(renderMarkdownBlock(block));
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

export function showDeskBoard(items: DeskCanvasItem[], readonly: boolean): void {
  cancelAnimationFrame(deskLayoutFrame);
  deskLayoutObserver?.disconnect();
  deskLayoutObserver = null;
  s.deskItems = items.map((item) => ({ ...item })).sort((a, b) => a.z - b.z);
  deskBoardEl.classList.toggle("desk-board-readonly", readonly);
  const layer = document.createElement("div");
  layer.className = "desk-canvas";
  deskBoardEl.replaceChildren(layer);
  for (const item of s.deskItems) {
    const el = document.createElement("article");
    el.dataset.id = item.id;
    el.className = `desk-item${item.kind === "chart" ? " desk-item-chart" : item.kind === "card" ? " desk-item-card" : ""}`;
    el.style.left = `${Math.max(0, item.x)}px`;
    el.style.top = `${Math.max(0, item.y)}px`;
    el.style.width = `${deskItemWidth(item)}px`;
    el.style.zIndex = String(item.z);
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
      attachDeskDrag(el, head, item, layer);
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
      body.appendChild(renderDeskChart(item.payload, 640, 260));
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
      body.appendChild(renderSafeMarkdown(String(item.payload.body ?? "")));
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
      body.appendChild(renderSafeMarkdown(String(item.payload.body ?? "")));
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
    layer.appendChild(el);
  }
  applyDeskPack(layer);
  watchDeskLayout(layer);
}

export async function loadDeskBoard(): Promise<void> {
  if (!wb) return;
  if (!s.deskSessionId) {
    s.deskLiveItems = [];
    if (s.deskViewingTurnId == null) {
      showDeskBoard([], false);
    }
    return;
  }
  const data = await wb.listCanvas(s.deskSessionId);
  s.deskLiveItems = data.items;
  if (s.deskViewingTurnId == null) {
    showDeskBoard(s.deskLiveItems, false);
  }
}

async function loadDeskHistory(): Promise<void> {
  if (!wb || !s.deskSessionId) {
    paintDeskHistory([]);
    return;
  }
  const detail = await wb.listSessionMessages(s.deskSessionId);
  const snaps = await wb.listCanvasSnapshots(s.deskSessionId).catch(() => ({ snapshots: [], activity: [] }));
  paintDeskHistory(detail.messages, snaps.snapshots, snaps.activity ?? []);
}

export function paintDeskSessions(): void {
  listEl.replaceChildren();
  for (const session of s.deskSessions) {
    const li = document.createElement("li");
    li.className = `side-card desk-session${session.id === s.deskSessionId ? " active" : ""}`;
    const top = document.createElement("div");
    top.className = "side-card-top";
    const title = document.createElement("div");
    title.className = "desk-session-title";
    title.textContent = session.title || "新会话";
    const del = document.createElement("button");
    del.type = "button";
    del.className = "item-del side-card-del";
    del.textContent = "×";
    del.title = "删除会话";
    del.addEventListener("click", (event) => {
      event.stopPropagation();
      void (async () => {
        await wb?.deleteSession(session.id);
        if (s.deskSessionId === session.id) s.deskSessionId = "";
        await refreshDesk();
      })();
    });
    top.append(title, del);
    const meta = document.createElement("div");
    meta.className = "desk-session-meta";
    const stamp = session.lastMessageAt || session.updatedAt;
    meta.textContent = stamp ? stamp.slice(5, 16).replace("T", " ") : "空";
    li.append(top, meta);
    li.addEventListener("click", () => {
      s.deskSessionId = session.id;
      s.deskViewingTurnId = null;
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
  if (s.deskSessionId) return s.deskSessionId;
  const created = await wb.createSession("新会话", "desk");
  s.deskSessionId = created.id;
  return created.id;
}

export async function refreshDesk(): Promise<void> {
  if (!wb) return;
  s.deskSessions = await wb.listSessions("desk");
  if (!s.deskSessionId && s.deskSessions[0]) {
    s.deskSessionId = s.deskSessions[0].id;
  }
  if (s.deskSessionId && !s.deskSessions.some((item) => item.id === s.deskSessionId)) {
    s.deskSessionId = s.deskSessions[0]?.id ?? "";
  }
  currentEl.textContent = s.deskSessions.find((item) => item.id === s.deskSessionId)?.title || "共享画布";
  paintDeskSessions();
  await loadDeskBoard();
  await loadDeskHistory();
}

export async function addDeskFiles(files: FileList | File[]): Promise<void> {
  const rejected = await takeChatImages(files, s.deskPendingImages);
  paintDeskAttach();
  if (rejected) {
    deskStatus.textContent = rejected;
  }
}

function setDeskSending(busy: boolean): void {
  s.deskSending = busy;
  deskSend.disabled = busy;
  deskSend.hidden = busy;
  deskStop.hidden = !busy;
  deskBoardEl.classList.toggle("desk-generating", busy && !s.deskViewingTurnId);
  if (busy && !s.deskViewingTurnId) {
    deskStatus.textContent = s.deskLiveItems.length ? "生成中…画布仍是当前活板" : "生成中…";
  }
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && (error.name === "AbortError" || /aborted/i.test(error.message)))
  );
}

async function pullDeskLiveBoard(): Promise<void> {
  if (!wb || !s.deskSessionId) return;
  try {
    const data = await wb.listCanvas(s.deskSessionId);
    s.deskLiveItems = data.items;
    if (s.deskViewingTurnId == null) {
      showDeskBoard(s.deskLiveItems, s.deskSending);
    }
  } catch {
    /* 生成中刷新失败不打断 */
  }
}

export async function sendDeskChat(): Promise<void> {
  if (!wb || s.deskSending) return;
  const message = deskInput.value.trim();
  if (!message && s.deskPendingImages.length === 0) return;
  setDeskSending(true);
  s.deskViewingTurnId = null;
  deskStatus.textContent = "生成中…";
  const images = s.deskPendingImages.map(({ mime, data }) => ({ mime, data }));
  const previews = s.deskPendingImages.map((image) => image.preview);
  deskInput.value = "";
  s.deskPendingImages = [];
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
    steps: [],
    imageCount: images.length,
    previews
  };
  for (const item of s.deskTurns) item.open = false;
  s.deskTurns.push(turn);
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
        s.deskLiveItems = event.data.items;
        if (event.data.validationError) {
          deskStatus.textContent = event.data.validationError;
        }
        s.deskViewingTurnId = null;
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
    s.deskSessions = await wb.listSessions("desk");
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
