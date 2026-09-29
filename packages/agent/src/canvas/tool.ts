import type { CanvasCardPayload, CanvasImagePayload, CanvasItem, CanvasKind, CanvasPayload } from "@hoshi/shared";
import { AsyncLocalStorage } from "node:async_hooks";
import type { PluginHost } from "../runtime";
import type { LlmTool } from "../plugins/types";
import type { CanvasRepo } from "../storage/canvasRepo";
import { canonicalizeCanvasImageUrl, lookupPortraitUrl, type PortraitFetcher } from "./portrait";
import {
  extractPortraitName,
  extractPortraitNames,
  looksLikeConceptQuery,
  looksLikePersonQuery,
  looksLikeWorkQuery,
  portraitLookupQuery,
  shouldAttachIllustration
} from "../retrieval/plan";

type CanvasTurnCtx = { sessionId: string; hint: string };

const canvasTurn = new AsyncLocalStorage<CanvasTurnCtx>();

export function runWithCanvasTurn<T>(ctx: CanvasTurnCtx, fn: () => T): T {
  return canvasTurn.run(ctx, fn);
}

const KINDS: CanvasKind[] = ["chart", "card", "image", "note", "table", "markdown"];

function asCanvasSetItems(args: Record<string, unknown>): unknown[] {
  const bags: Record<string, unknown>[] = [args];
  if (args.arguments && typeof args.arguments === "object" && !Array.isArray(args.arguments)) {
    bags.push(args.arguments as Record<string, unknown>);
  }
  for (const bag of bags) {
    for (const key of ["items", "cards"] as const) {
      const val = bag[key];
      if (Array.isArray(val) && val.length > 0) {
        return val;
      }
    }
  }
  return [];
}

const ITEM_PROPERTIES = {
  id: { type: "string", description: "已有卡片 id，更新时填写" },
  kind: { type: "string", enum: KINDS },
  title: { type: "string" },
  chartType: { type: "string", enum: ["bar", "line", "pie"], description: "kind=chart 时" },
  labels: { type: "array", items: { type: "string" }, description: "图表横轴/扇区名" },
  series: {
    type: "array",
    items: {
      type: "object",
      properties: {
        name: { type: "string" },
        values: { type: "array", items: { type: "number" } },
        axis: { type: "string", enum: ["left", "right"], description: "双轴时右轴用 right" },
        errors: { type: "array", items: { type: "number" }, description: "对称误差，与 values 对齐" }
      }
    }
  },
  subtitle: { type: "string", description: "图表副标题" },
  xLabel: { type: "string", description: "横轴名称，如日期" },
  yLabel: { type: "string", description: "纵轴名称，如温度" },
  y2Label: { type: "string", description: "右轴名称" },
  y2Unit: { type: "string", description: "右轴单位" },
  unit: { type: "string", description: "数值单位，如 °C" },
  insight: { type: "string", description: "图下方一两句结论" },
  body: { type: "string", description: "card/note/markdown 正文" },
  tags: { type: "array", items: { type: "string" } },
  kicker: { type: "string", description: "知识卡副标题，如身份、生卒" },
  portraitUrl: { type: "string", description: "知识卡头像 http(s)" },
  url: { type: "string", description: "image 的 http(s) 地址；人物可留空，系统会试配维基肖像" },
  caption: { type: "string" },
  columns: { type: "array", items: { type: "string" }, description: "kind=table 表头" },
  rows: {
    type: "array",
    items: { type: "array", items: { type: "string" } },
    description: "kind=table 数据行"
  }
} as const;

const PUT_TOOL: LlmTool = {
  type: "function",
  function: {
    name: "canvas_put",
    description:
      "覆盖当前会话活板上已有的一张卡（必须带 id 或相同标题）。活板为空时可以放第一张。新主题、多卡或换页一律用 canvas_set。",
    parameters: {
      type: "object",
      properties: ITEM_PROPERTIES,
      required: ["kind", "title"]
    }
  }
};

const SET_TOOL: LlmTool = {
  type: "function",
  function: {
    name: "canvas_set",
    description:
      "用提交列表整页替换当前会话活板：列表内 upsert（标题规范化去重仍生效），活板上不在列表中的卡片删除。模型要「换成这一页」时用本工具；只改一张仍用 canvas_put。列表用 items（也接受 cards）。",
    parameters: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: ITEM_PROPERTIES,
            required: ["kind", "title"]
          }
        },
        cards: {
          type: "array",
          description: "items 的别名",
          items: {
            type: "object",
            properties: ITEM_PROPERTIES,
            required: ["kind", "title"]
          }
        }
      }
    }
  }
};

const REMOVE_TOOL: LlmTool = {
  type: "function",
  function: {
    name: "canvas_remove",
    description: "从当前会话活板删除一张卡片。仅在老师明确要求拿掉某张图/卡时调用。",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string" }
      },
      required: ["id"]
    }
  }
};

function unescapeBody(raw: string): string {
  return raw.replace(/\\n/g, "\n").replace(/\\t/g, "\t");
}

const PLACEHOLDER =
  /待补数据|还缺两样|请把每天|把七天的最高|不想凭印象编数字|把每天的天气现象/;

export function looksLikePlaceholderCanvas(title: string, body: string): boolean {
  return PLACEHOLDER.test(`${title}\n${body}`);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === "number" && Number.isFinite(item) ? item : Number(item)))
    .filter((item) => Number.isFinite(item));
}

function safeUrl(raw: string): string {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "";
    }
    return url.toString();
  } catch {
    return "";
  }
}

function buildPayload(kind: CanvasKind, args: Record<string, unknown>): CanvasPayload | string {
  if (kind === "chart") {
    const labels = Array.isArray(args.labels)
      ? args.labels.map((item) => String(item)).filter(Boolean).slice(0, 24)
      : [];
    const seriesRaw = Array.isArray(args.series) ? args.series : [];
    const series = seriesRaw
      .map((row) => {
        const rec = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
        const values = asNumberArray(rec.values).slice(0, 24);
        const errors = asNumberArray(rec.errors).slice(0, values.length);
        return {
          name: asString(rec.name) || "系列",
          values,
          axis: rec.axis === "right" ? ("right" as const) : undefined,
          errors: errors.length > 0 ? errors : undefined
        };
      })
      .filter((row) => row.values.length > 0)
      .slice(0, 6);
    if (labels.length === 0 || series.length === 0) {
      return "图表缺少 labels 或 series";
    }
    const chartType = args.chartType === "pie" || args.chartType === "bar" ? args.chartType : "line";
    return {
      chartType,
      labels,
      series,
      unit: asString(args.unit) || undefined,
      subtitle: asString(args.subtitle) || undefined,
      xLabel: asString(args.xLabel) || undefined,
      yLabel: asString(args.yLabel) || undefined,
      y2Label: asString(args.y2Label) || undefined,
      y2Unit: asString(args.y2Unit) || undefined,
      insight: asString(args.insight) || undefined
    };
  }
  if (kind === "table") {
    const columns = Array.isArray(args.columns)
      ? args.columns.map((item) => String(item).trim()).filter(Boolean).slice(0, 24)
      : [];
    const rowsRaw = Array.isArray(args.rows) ? args.rows : [];
    const rows = rowsRaw
      .map((row) =>
        Array.isArray(row) ? row.map((cell) => String(cell ?? "")).slice(0, 24) : []
      )
      .filter((row) => row.some((cell) => cell.trim()))
      .slice(0, 80);
    if (columns.length === 0 || rows.length === 0) {
      return "表格需要 columns 和至少一行";
    }
    return { columns, rows, caption: asString(args.caption) || undefined };
  }
  if (kind === "image") {
    const url = safeUrl(asString(args.url));
    return { url, caption: asString(args.caption) || undefined };
  }
  const body = unescapeBody(asString(args.body));
  if (!body) {
    return kind === "markdown" ? "markdown 需要 body" : "缺少 body";
  }
  if (kind === "card") {
    const tags = Array.isArray(args.tags)
      ? args.tags.map((item) => String(item).trim()).filter(Boolean).slice(0, 8)
      : [];
    return {
      body,
      tags,
      kicker: asString(args.kicker) || undefined,
      portraitUrl: asString(args.portraitUrl) || undefined
    };
  }
  return { body };
}

function parseItemArgs(
  args: Record<string, unknown>
): { kind: CanvasKind; title: string; payload: CanvasPayload; requestedId: string } | string {
  const kind = asString(args.kind) as CanvasKind;
  if (!KINDS.includes(kind)) {
    return "kind 必须是 chart、card、image、note、table 或 markdown";
  }
  const title = asString(args.title) || "未命名";
  const payload = buildPayload(kind, args);
  if (typeof payload === "string") {
    return payload;
  }
  const bodyText = "body" in payload ? String(payload.body ?? "") : "";
  if (looksLikePlaceholderCanvas(title, bodyText)) {
    return "拒绝：缺少实测数字，不要往画布堆待补模板。口头说明即可。";
  }
  return { kind, title, payload, requestedId: asString(args.id) };
}

export const CANVAS_USAGE_PROMPT = `你在工作台里和老师对话。一份会话只有一块正在写的活板；右侧动态只是回合时间线，每回合结束会自动把当时的整板存成快照。不要为每个动态另开一块画布，也不要把上一回合的卡片再生成一遍。
换人物、换主题、只要这一页：canvas_set 只列出本轮要留下的卡片。默认不要带上旧人物卡。老师明确说保留/一起看时才带库存 id。
单卡改数字：canvas_put，必须带库存 id 或完全相同的标题。活板上已有卡片时禁止 put 一张新主题。
- web_search 来源里有趋势/对比数字：立刻 kind=chart，填齐 labels、series（需要时 axis=right、errors）、subtitle、xLabel、yLabel、y2Label、unit、insight。禁止再问老师要气温表，禁止「待补数据」卡片。
- 概念、定义、知识点：必须 kind=card。title 用词条名，kicker 用一句话定位，body 写 3～8 句给人看的说明，tags 2～5 个。禁止只口头解释却不放卡，禁止输出字面 \\n。
- 人物、角色、演员、影视、图书、漫画等：每人/每部一张 card（title 用人名或作品名，kicker 用身份，body 只写该对象）。系统会按标题查萌百/维基配图。
- 两人对照、异同、萌点：一次 canvas_set 最好三张——两位各一张 card（禁止两张卡复制同一段口播），再加一张 kind=table 或 markdown 写异同与萌点。不要把整句问话当标题。两张人物卡也可以先交。
- 对照表：kind=table，填 columns 和至少一行 rows。
- 长说明：kind=markdown，body 用标题、列表、加粗、代码、链接，不要 HTML。
- 单独配图：kind=image，url 必须是 http(s)，或标题用准确人名以便配肖像。
摘录没有数字才口头说明查不到，不要往画布堆模板。时效资料先 web_search，需要全文再 web_fetch。禁止输出 tool_call XML。`;

const PAGE_REPLACE = /换成|整页|只要这|重新画|清掉旧/;
const KEEP_OLD_CARDS = /一起|都放|保留旧|加上|同时放/;

function titleMatchesFocus(title: string, focus: string): boolean {
  const a = title.replace(/[\s\u3000]+/g, "");
  const b = focus.replace(/[\s\u3000]+/g, "");
  if (a.length < 2 || b.length < 2) {
    return false;
  }
  return a.includes(b) || b.includes(a);
}

function isQuestionDumpTitle(title: string): boolean {
  const t = title.replace(/[\s\u3000]+/g, "");
  return t.length > 16 && /分析|什么是|怎么|为什么/.test(t);
}

function isCompareCompanion(spec: { title: string; kind?: CanvasKind }): boolean {
  if (spec.kind === "table" || spec.kind === "markdown") {
    return true;
  }
  const t = spec.title.replace(/[\s\u3000]+/g, "");
  return t.length <= 16 && /异同|对比|比较|萌点|对照|区别/.test(t);
}

function specsForCurrentTurn<T extends { title: string; kind?: CanvasKind }>(specs: T[], hint: string): T[] {
  if (KEEP_OLD_CARDS.test(hint)) {
    return specs;
  }
  const names = extractPortraitNames(hint, "");
  if (specs.length <= 1) {
    const only = specs[0];
    if (only && names.length >= 2 && isQuestionDumpTitle(only.title)) {
      return [];
    }
    return specs;
  }
  const focus = names[0] ?? extractPortraitName(hint, "");
  if (focus.length < 2) {
    return specs;
  }
  if (!looksLikePersonQuery(hint) && !looksLikeConceptQuery(hint) && !looksLikeWorkQuery(hint)) {
    return specs;
  }
  const matched = specs.filter((spec) => {
    if (isQuestionDumpTitle(spec.title)) {
      return false;
    }
    if (names.length >= 2) {
      return names.some((name) => titleMatchesFocus(spec.title, name)) || isCompareCompanion(spec);
    }
    return titleMatchesFocus(spec.title, focus);
  });
  return matched.length > 0 ? matched : [];
}

export class CanvasToolHost implements PluginHost {
  private enabled = false;
  private sessionId: string | null = null;
  private turnHint = "";
  private changes: CanvasItem[] = [];
  private readonly foundPortraits = new Map<string, string>();
  private readonly inflightPortraits = new Map<string, Promise<string | null>>();
  private readonly portraitJobs = new Map<string, Promise<void>[]>();

  constructor(
    private readonly repo: CanvasRepo,
    private readonly portraits: PortraitFetcher = lookupPortraitUrl
  ) {}

  setEnabled(enabled: boolean, sessionId?: string): void {
    this.enabled = enabled;
    this.sessionId = sessionId ?? (enabled ? this.sessionId : null);
    if (!enabled) {
      this.changes = [];
      this.turnHint = "";
    }
  }

  setTurnHint(message: string): void {
    this.turnHint = message.trim();
  }

  async flushPortraits(sessionId?: string): Promise<void> {
    const ids = sessionId ? [sessionId] : [...this.portraitJobs.keys()];
    for (const id of ids) {
      const jobs = this.portraitJobs.get(id) ?? [];
      this.portraitJobs.set(id, []);
      await Promise.all(jobs);
      this.clearLeftoverPending(id);
    }
  }

  private turn(): CanvasTurnCtx | null {
    const store = canvasTurn.getStore();
    if (store?.sessionId) {
      return store;
    }
    if (this.enabled && this.sessionId) {
      return { sessionId: this.sessionId, hint: this.turnHint };
    }
    return null;
  }

  private wantsIllustration(title: string, payload?: CanvasCardPayload): boolean {
    return shouldAttachIllustration({
      hint: this.turn()?.hint ?? "",
      title,
      kicker: payload?.kicker,
      tags: payload?.tags
    });
  }

  private portraitQuery(title: string): string {
    return portraitLookupQuery(this.turn()?.hint ?? "", title);
  }

  private portraitKey(query: string): string {
    return query.replace(/[\s\u3000]+/g, " ").trim();
  }

  private lookupCached(query: string): Promise<string | null> {
    const key = this.portraitKey(query);
    if (!key) {
      return Promise.resolve(null);
    }
    const hit = this.foundPortraits.get(key);
    if (hit) {
      return Promise.resolve(hit);
    }
    const inflight = this.inflightPortraits.get(key);
    if (inflight) {
      return inflight;
    }
    const pending = Promise.resolve()
      .then(() => this.portraits(query))
      .then((found) => {
        const next = canonicalizeCanvasImageUrl(found ?? "") ?? found ?? null;
        if (next) {
          this.foundPortraits.set(key, next);
        }
        return next;
      })
      .finally(() => {
        this.inflightPortraits.delete(key);
      });
    this.inflightPortraits.set(key, pending);
    return pending;
  }

  private trackPortraitJob(sessionId: string, job: Promise<void>): void {
    const list = this.portraitJobs.get(sessionId) ?? [];
    list.push(job);
    this.portraitJobs.set(sessionId, list);
  }

  private applyCardPortrait(sessionId: string, itemId: string, url: string | null): void {
    const item = this.repo.get(itemId, sessionId);
    if (!item || item.kind !== "card") {
      return;
    }
    const payload: CanvasCardPayload = { ...(item.payload as CanvasCardPayload) };
    delete payload.portraitPending;
    if (!payload.portraitUrl && url) {
      payload.portraitUrl = url;
    }
    this.repo.upsert({
      sessionId,
      id: itemId,
      kind: item.kind,
      title: item.title,
      payload
    });
  }

  private scheduleCardPortrait(sessionId: string, itemId: string, query: string): void {
    const job = this.lookupCached(query)
      .then((url) => this.applyCardPortrait(sessionId, itemId, url))
      .catch(() => this.applyCardPortrait(sessionId, itemId, null));
    this.trackPortraitJob(sessionId, job);
  }

  private clearLeftoverPending(sessionId: string): void {
    for (const item of this.repo.list(sessionId)) {
      if (item.kind !== "card") {
        continue;
      }
      const payload = item.payload as CanvasCardPayload;
      if (payload.portraitPending) {
        this.applyCardPortrait(sessionId, item.id, payload.portraitUrl ?? null);
      }
    }
  }

  private prepareCardPortrait(spec: { kind: CanvasKind; title: string; payload: CanvasPayload }): void {
    if (spec.kind !== "card") {
      return;
    }
    const payload = spec.payload as CanvasCardPayload;
    const canon = canonicalizeCanvasImageUrl(payload.portraitUrl ?? "");
    if (canon) {
      payload.portraitUrl = canon;
      delete payload.portraitPending;
      return;
    }
    payload.portraitUrl = undefined;
    delete payload.portraitPending;
    if (this.wantsIllustration(spec.title, payload)) {
      payload.portraitPending = true;
    }
  }

  private queueWrittenPortraits(sessionId: string, items: CanvasItem[]): void {
    for (const item of items) {
      if (item.kind !== "card") {
        continue;
      }
      const payload = item.payload as CanvasCardPayload;
      if (!payload.portraitPending || payload.portraitUrl) {
        continue;
      }
      this.scheduleCardPortrait(sessionId, item.id, this.portraitQuery(item.title));
    }
  }

  private async fillImageMedia(spec: {
    kind: CanvasKind;
    title: string;
    payload: CanvasPayload;
  }): Promise<string | null> {
    if (spec.kind !== "image") {
      return null;
    }
    const payload = spec.payload as CanvasImagePayload;
    const canon = canonicalizeCanvasImageUrl(payload.url ?? "");
    if (canon) {
      payload.url = canon;
      return null;
    }
    const found = await this.portraits(this.portraitQuery(spec.title));
    const next = canonicalizeCanvasImageUrl(found ?? "") ?? found;
    if (!next) {
      return "图片需要 http(s) URL；人物、角色或作品可用准确标题配萌百/维基配图";
    }
    payload.url = next;
    return null;
  }

  tools(): LlmTool[] {
    return this.enabled || this.turn() ? [PUT_TOOL, SET_TOOL, REMOVE_TOOL] : [];
  }

  async execute(name: string, args: Record<string, unknown>): Promise<string> {
    const turn = this.turn();
    if (!turn) {
      return `工具不可用：${name}`;
    }
    const sessionId = turn.sessionId;
    const turnHint = turn.hint;
    if (name === "canvas_remove") {
      const id = asString(args.id);
      if (!id) {
        return "删除失败：缺少 id";
      }
      const ok = this.repo.remove(id, sessionId);
      return ok ? `已从画布移除 ${id}` : `画布上没有 ${id}`;
    }
    if (name === "canvas_set") {
      const rawItems = asCanvasSetItems(args);
      if (rawItems.length === 0) {
        return "canvas_set 需要至少一张卡片";
      }
      const specs: Array<{
        id?: string;
        kind: CanvasKind;
        title: string;
        payload: CanvasPayload;
      }> = [];
      for (const raw of rawItems) {
        const rec = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
        const parsed = parseItemArgs(rec);
        if (typeof parsed === "string") {
          return parsed;
        }
        if (
          parsed.kind === "chart" &&
          (looksLikeConceptQuery(turnHint) || looksLikePersonQuery(turnHint) || looksLikeWorkQuery(turnHint))
        ) {
          return "这是概念、人物或作品题，请改用 kind=card 写知识卡，不要 chart。";
        }
        specs.push({
          id: parsed.requestedId || undefined,
          kind: parsed.kind,
          title: parsed.title,
          payload: parsed.payload
        });
      }
      const page = specsForCurrentTurn(specs, turnHint);
      if (page.length === 0) {
        return "这是新人物或新主题：canvas_set 只提交本轮卡片，不要把上一回合的卡再画一遍。";
      }
      for (const spec of page) {
        const mediaError = await this.fillImageMedia(spec);
        if (mediaError) {
          return mediaError;
        }
        this.prepareCardPortrait(spec);
      }
      const items = this.repo.replaceSession(sessionId, page);
      this.changes.push(...items);
      this.queueWrittenPortraits(sessionId, items);
      return `已更新画布：${items.length} 张`;
    }
    if (name !== "canvas_put") {
      return `工具不可用：${name}`;
    }
    const parsed = parseItemArgs(args);
    if (typeof parsed === "string") {
      return parsed;
    }
    if (
      parsed.kind === "chart" &&
      (looksLikeConceptQuery(turnHint) || looksLikePersonQuery(turnHint) || looksLikeWorkQuery(turnHint))
    ) {
      return "这是概念、人物或作品题，请改用 kind=card 写知识卡，不要 chart。";
    }
    const id =
      (parsed.requestedId && this.repo.get(parsed.requestedId, sessionId)?.id) ||
      this.repo.findIdByTitle(sessionId, parsed.title) ||
      undefined;
    const overwrite = Boolean(id);
    const boardCount = this.repo.list(sessionId).length;
    const wantNewPage = PAGE_REPLACE.test(turnHint);
    if (!overwrite && (boardCount > 0 || wantNewPage)) {
      return "活板上已有卡片或本轮要换页：新增/整页请用 canvas_set 提交全部卡片并带上要保留的 id；单卡覆盖请带 id 或相同标题。";
    }
    const mediaError = await this.fillImageMedia(parsed);
    if (mediaError) {
      return mediaError;
    }
    this.prepareCardPortrait(parsed);
    const item = this.repo.upsert({
      sessionId,
      id: id || parsed.requestedId || undefined,
      kind: parsed.kind,
      title: parsed.title,
      payload: parsed.payload
    });
    this.changes.push(item);
    this.queueWrittenPortraits(sessionId, [item]);
    return `已放到画布：${item.kind} id=${item.id} 「${item.title}」`;
  }

  takeChanges(): CanvasItem[] {
    const out = this.changes;
    this.changes = [];
    return out;
  }

  inventoryPrompt(): string | null {
    const sessionId = this.turn()?.sessionId;
    if (!sessionId) {
      return null;
    }
    return `当前会话只有一块活板，动态里点回合只是看当时快照。新人物/新主题用 canvas_set 只交本轮卡片，不要重画上一回合。当前卡片：\n${this.repo.summarizeForPrompt(sessionId)}`;
  }
}
