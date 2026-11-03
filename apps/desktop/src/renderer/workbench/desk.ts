import type { DeskCanvasItem, DeskMessage, DeskSession, DeskStep, DeskTurn } from "./types.js";
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

const wb = workbenchApi;

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
  for (const image of s.deskPendingImages) {
    const img = document.createElement("img");
    img.className = "desk-thumb";
    img.src = image.preview;
    img.alt = "附件";
    deskAttachRow.appendChild(img);
  }
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

async function reorderDeskItems(fromId: string, toId: string, before: boolean): Promise<void> {
  if (!wb || !s.deskSessionId || fromId === toId || s.deskViewingTurnId) return;
  const order = s.deskItems.map((item) => item.id);
  const from = order.indexOf(fromId);
  const to = order.indexOf(toId);
  if (from < 0 || to < 0) return;
  order.splice(from, 1);
  const insertAt = order.indexOf(toId);
  if (insertAt < 0) return;
  order.splice(before ? insertAt : insertAt + 1, 0, fromId);
  try {
    const data = await wb.reorderCanvas(s.deskSessionId, order);
    s.deskLiveItems = data.items;
    showDeskBoard(s.deskLiveItems, false);
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

export function showDeskBoard(items: DeskCanvasItem[], readonly: boolean): void {
  s.deskItems = [...items].sort((a, b) => a.z - b.z);
  deskBoardEl.classList.toggle("desk-board-readonly", readonly);
  deskBoardEl.replaceChildren();
  for (const item of s.deskItems) {
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
    li.className = `desk-session${session.id === s.deskSessionId ? " active" : ""}`;
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
        if (s.deskSessionId === session.id) s.deskSessionId = "";
        await refreshDesk();
      })();
    });
    li.append(title, meta, del);
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
  const list = Array.from(files).filter((file) => file.type.startsWith("image/"));
  for (const file of list.slice(0, 4 - s.deskPendingImages.length)) {
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
    s.deskPendingImages.push({ mime, data, preview: dataUrl });
  }
  paintDeskAttach();
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
    steps: []
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
