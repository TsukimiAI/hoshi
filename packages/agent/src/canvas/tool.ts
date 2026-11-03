import type { CanvasCardPayload, CanvasImagePayload, CanvasItem, CanvasKind, CanvasPayload } from "@hoshi/shared";
import { AsyncLocalStorage } from "node:async_hooks";
import type { PluginHost } from "../runtime";
import type { LlmTool } from "../plugins/types";
import type { CanvasRepo } from "../storage/canvasRepo";
import { canonicalizeCanvasImageUrl, lookupPortraitUrl, type PortraitFetcher } from "./portrait";
import {
  classifyDeskTurn,
  extractPortraitName,
  extractPortraitNames,
  looksLikeChitchat,
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

const PLACEHOLDER = /待补数据|请老师补|星奈就绪/;

const CAPABILITY_PITCH =
  /等你(出题|给题目)|随时可以开工|能做的事|说一句主题就行|白板还没|还没内容|直接上板|星奈就绪|星奈在线/;

function looksLikeCapabilityPitch(page: string): boolean {
  if (CAPABILITY_PITCH.test(page)) {
    return true;
  }
  const menu = [/知识卡/, /markdown|对照/, /图表|柱状|折线/, /人物|概念/].filter((item) => item.test(page));
  return menu.length >= 3;
}

const HINT_FILLER =
  /现有产品|各种|怎么样|怎么|如何|为什么|是什么|什么|请问|帮我|我想|了解一下|介绍一下|分析一下|可以吗|现在|目前|设计/g;

export function looksLikePlaceholderCanvas(title: string, body: string): boolean {
  return PLACEHOLDER.test(`${title}\n${body}`);
}

export function canvasMissesQuestion(hint: string, texts: string[]): boolean {
  const trimmed = hint.trim();
  if (!trimmed || looksLikeChitchat(trimmed) || /你能做|你会什么|能做什么|怎么用你/.test(trimmed)) {
    return false;
  }
  const page = texts.join("\n");
  if (!looksLikeCapabilityPitch(page)) {
    return false;
  }
  const residual = trimmed.replace(HINT_FILLER, "").replace(/[\s，。！？、；：的了吗呢啊是在中等和与或]/g, "");
  const needles: string[] = [];
  for (let size = 2; size <= 4; size += 1) {
    for (let i = 0; i + size <= residual.length && needles.length < 24; i += 1) {
      needles.push(residual.slice(i, i + size));
    }
  }
  if (needles.length === 0) {
    return true;
  }
  return !needles.some((needle) => page.includes(needle));
}

function specPlainText(spec: { title: string; payload: CanvasPayload }): string {
  const payload = spec.payload as { body?: string; insight?: string; caption?: string };
  return [spec.title, payload.body, payload.insight, payload.caption].filter(Boolean).join("\n");
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
    if (labels.length === 0) {
      return "labels 为空";
    }
    if (series.length === 0) {
      return "series 为空";
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
    if (columns.length === 0) {
      return "columns 为空";
    }
    if (rows.length === 0) {
      return "rows 为空";
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
单卡改数字：canvas_put，必须带库存 id 或完全相同的标题。活板上已有卡片时禁止 put 一张新主题。`;

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
  const turn = classifyDeskTurn(hint);
  if (turn.kind !== "person" && turn.kind !== "compare") {
    return specs;
  }
  const names = turn.names.length > 0 ? turn.names : extractPortraitNames(hint, "");
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

function cardMeta(payload: CanvasPayload): { kicker?: string; tags?: string[] } {
  if (!payload || typeof payload !== "object" || !("kicker" in payload || "tags" in payload)) {
    return {};
  }
  const rec = payload as { kicker?: string; tags?: string[] };
  return { kicker: rec.kicker, tags: rec.tags };
}

function rejectsKindForHint(hint: string, spec: { kind: CanvasKind; payload: CanvasPayload }): string | null {
  const turn = classifyDeskTurn(hint).kind;
  if (turn === "live") {
    if (spec.kind !== "chart") {
      return "时效题只接受 kind=chart；摘录没有数字就不要落卡，禁止让老师补日期。";
    }
  }
  if (spec.kind === "chart" && rejectsChartForHint(hint)) {
    return "这是概念、人物或作品题，请改用 kind=card 写知识卡，不要 chart。";
  }
  const meta = cardMeta(spec.payload);
  if (rejectsLiveCharacterCard(hint, spec.kind, meta.kicker, meta.tags)) {
    return "这是天气或时效题，请用 kind=chart 填数字，不要人物卡。";
  }
  return null;
}

function rejectsChartForHint(hint: string): boolean {
  const kind = classifyDeskTurn(hint).kind;
  return kind === "person" || kind === "compare" || kind === "concept";
}

function rejectsLiveCharacterCard(hint: string, kind: CanvasKind, kicker?: string, tags?: string[]): boolean {
  if (classifyDeskTurn(hint).kind !== "live" || kind !== "card") {
    return false;
  }
  return /人物|角色/.test(`${kicker ?? ""} ${(tags ?? []).join(" ")}`);
}

type PageSpec = { kind: CanvasKind; title: string; payload: CanvasPayload };

export function validateCanvasPage(specs: PageSpec[], hint: string): string | null {
  const errors: string[] = [];
  for (const spec of specs) {
    const kindError = rejectsKindForHint(hint, spec);
    if (kindError) {
      errors.push(`「${spec.title}」${kindError}`);
    }
    const bodyText = "body" in spec.payload ? String(spec.payload.body ?? "") : "";
    if (looksLikePlaceholderCanvas(spec.title, bodyText)) {
      errors.push(`「${spec.title}」拒绝：缺少实测数字，不要往画布堆待补模板。口头说明即可。`);
    }
  }
  if (canvasMissesQuestion(hint, specs.map((spec) => specPlainText(spec)))) {
    errors.push("拒绝：这是欢迎语或能力清单，没有回答老师的问题。请用主题词当标题，把结论写进 body。");
  }
  return errors.length > 0 ? errors.join("；") : null;
}

export class CanvasToolHost implements PluginHost {
  private enabled = false;
  private sessionId: string | null = null;
  private turnHint = "";
  private changes: CanvasItem[] = [];
  private validationError: string | null = null;
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
      this.validationError = null;
    }
  }

  setTurnHint(message: string): void {
    this.turnHint = message.trim();
    this.validationError = null;
  }

  private noteCanvasWrite(): void {
    this.validationError = null;
  }

  private noteCanvasFailure(error: string): string {
    this.validationError = error;
    return error;
  }

  takeValidationError(): string | undefined {
    const error = this.validationError ?? undefined;
    this.validationError = null;
    return error;
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
        return this.noteCanvasFailure("canvas_set 需要至少一张卡片");
      }
      const specs: Array<{
        id?: string;
        kind: CanvasKind;
        title: string;
        payload: CanvasPayload;
      }> = [];
      const parseErrors: string[] = [];
      for (const raw of rawItems) {
        const rec = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
        const title = asString(rec.title) || "未命名";
        const parsed = parseItemArgs(rec);
        if (typeof parsed === "string") {
          parseErrors.push(`「${title}」${parsed}`);
          continue;
        }
        specs.push({
          id: parsed.requestedId || undefined,
          kind: parsed.kind,
          title: parsed.title,
          payload: parsed.payload
        });
      }
      if (parseErrors.length > 0) {
        return this.noteCanvasFailure(parseErrors.join("；"));
      }
      const page = specsForCurrentTurn(specs, turnHint);
      if (page.length === 0) {
        return this.noteCanvasFailure(
          "这是新人物或新主题：canvas_set 只提交本轮卡片，不要把上一回合的卡再画一遍。"
        );
      }
      const pageError = validateCanvasPage(page, turnHint);
      if (pageError) {
        return this.noteCanvasFailure(pageError);
      }
      for (const spec of page) {
        const mediaError = await this.fillImageMedia(spec);
        if (mediaError) {
          return this.noteCanvasFailure(`「${spec.title}」${mediaError}`);
        }
        this.prepareCardPortrait(spec);
      }
      const items = this.repo.replaceSession(sessionId, page);
      this.noteCanvasWrite();
      this.changes.push(...items);
      this.queueWrittenPortraits(sessionId, items);
      return `已更新画布：${items.length} 张`;
    }
    if (name !== "canvas_put") {
      return `工具不可用：${name}`;
    }
    const title = asString(args.title) || "未命名";
    const parsed = parseItemArgs(args);
    if (typeof parsed === "string") {
      return this.noteCanvasFailure(`「${title}」${parsed}`);
    }
    const id =
      (parsed.requestedId && this.repo.get(parsed.requestedId, sessionId)?.id) ||
      this.repo.findIdByTitle(sessionId, parsed.title) ||
      undefined;
    const overwrite = Boolean(id);
    const boardCount = this.repo.list(sessionId).length;
    const wantNewPage = PAGE_REPLACE.test(turnHint);
    if (!overwrite && (boardCount > 0 || wantNewPage)) {
      return this.noteCanvasFailure(
        "活板上已有卡片或本轮要换页：新增/整页请用 canvas_set 提交全部卡片并带上要保留的 id；单卡覆盖请带 id 或相同标题。"
      );
    }
    const pageError = validateCanvasPage([parsed], turnHint);
    if (pageError) {
      return this.noteCanvasFailure(pageError);
    }
    const mediaError = await this.fillImageMedia(parsed);
    if (mediaError) {
      return this.noteCanvasFailure(`「${parsed.title}」${mediaError}`);
    }
    this.prepareCardPortrait(parsed);
    const item = this.repo.upsert({
      sessionId,
      id: id || parsed.requestedId || undefined,
      kind: parsed.kind,
      title: parsed.title,
      payload: parsed.payload
    });
    this.noteCanvasWrite();
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
