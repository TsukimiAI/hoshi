import type {
  AgentEvent,
  ChatMessage,
  ChatRequestBody,
  LlmUsage,
  SentenceEvent,
  UsagePurpose
} from "@hoshi/shared";
import { addUsage } from "@hoshi/shared";
import { toLlmMessages, userContentWithImages, mergeTimeoutSignal, isAbortTimeout, type LlmCallOptions, type LlmMessage, type StreamChatPart } from "./llm/openai";
import { resolveSentenceEmotion } from "./emotion";
import type { PersonaConfig } from "./persona";
import { parseToolArgs } from "./plugins/parseTool";
import type { LlmTool } from "./plugins/types";
import { buildMemoryAckPrompt, buildMemoryInjectPrompt, type MemoryInjectLine } from "./memory/inject";
import { buildSearchSitesPrompt, parseSiteLines, EMOTION_USAGE_PROMPT, SEARCH_USAGE_PROMPT } from "./searchPrompt";
import { buildDeskCanvasPrompt, buildIntegratePrompt, classifyDeskTurn, hasLiveFactNumbers, knowledgeHitLooksEmpty, knowledgeRoute, looksLikeUsableWebBrief, shouldWebSearch, WEB_BRIEF_PROMPT } from "./retrieval/plan";
import { deskSearchNotes, formatSearchActivity, humanizeSearchNotes, looksLikeReadableProse } from "./web/notes";
import {
  buildDeskSearchQueries,
  excerptMatchesQuestion,
  mergeDeskBrief,
  pageUrlsFromSearchRaw,
  stripFetchPrefix
} from "./web/deskRetrieve";
import { hasSpeechContent, SentenceSplitter } from "./sentence";

export interface PluginHost {
  tools(): LlmTool[];
  execute(name: string, args: Record<string, unknown>): Promise<string>;
}

export interface LlmClient {
  completeChat(
    messages: LlmMessage[],
    tools: LlmTool[],
    options?: LlmCallOptions
  ): Promise<{
    content: string;
    toolCalls: Array<{ id: string; name: string; argumentsJson: string }>;
    usage?: LlmUsage;
    searchNotes?: string;
  }>;
  noteUsage?(
    purpose: UsagePurpose,
    usage: LlmUsage,
    sessionId?: string,
    model?: string
  ): void;
  streamChat(
    messages: LlmMessage[],
    signal?: AbortSignal,
    options?: Pick<LlmCallOptions, "purpose" | "sessionId" | "enableSearch">
  ): AsyncGenerator<StreamChatPart>;
}

export interface AgentRuntimeConfig {
  persona: PersonaConfig;
  llm: LlmClient;
  plugins?: PluginHost;
  referenceSites?: string;
  pluginTimeoutMs?: number;
}

export class AgentRuntime {
  private referenceSites: string;

  constructor(private readonly config: AgentRuntimeConfig) {
    this.referenceSites = config.referenceSites ?? "";
  }

  private pluginTimeoutMs(): number {
    return this.config.pluginTimeoutMs ?? 15000;
  }

  setReferenceSites(referenceSites: string): void {
    this.referenceSites = referenceSites;
  }

  async *chat(
    body: ChatRequestBody,
    extra?: {
      longTermMemories?: MemoryInjectLine[];
      memoryAckTexts?: string[];
      canvasPrompt?: string;
      signal?: AbortSignal;
      sessionId?: string;
    }
  ): AsyncGenerator<AgentEvent> {
    const images = body.images ?? [];
    const message = body.message?.trim() || (images.length > 0 ? "（老师发来了图片）" : "");
    if (!message) {
      yield { event: "error", data: { message: "message is required" } };
      return;
    }

    yield {
      event: "emotion",
      data: { emotion: this.config.persona.thinkingEmotion }
    };

    const tools = this.config.plugins?.tools() ?? [];
    const kbEnabled = tools.some(
      (tool) => tool.function.name === "search_knowledge" || tool.function.name === "list_knowledge"
    );
    const webTools = tools.some((tool) => tool.function.name === "web_search");
    const canFetch = tools.some((tool) => tool.function.name === "web_fetch");
    const desk = body.workspace === "desk";
    const deskTurn = classifyDeskTurn(message);
    const kbRoute = knowledgeRoute(message);
    const web = shouldWebSearch(message);
    const canvasTools = tools.filter((tool) => tool.function.name.startsWith("canvas_"));
    const modelTools = desk
      ? canvasTools
      : tools.filter((tool) => tool.function.name !== "search_knowledge");

    yield { event: "progress", data: { phase: "think" } };
    const thinkStarted = Date.now();

    if (!desk) {
      yield {
        event: "progress",
        data: { phase: "tool_start", name: "联网", detail: web ? "检索网页" : "本次不必联网" }
      };
      yield {
        event: "progress",
        data: {
          phase: "tool_done",
          name: "联网",
          detail: web ? "已开启网页检索" : "跳过",
          ok: true,
          elapsedMs: 0
        }
      };
    }
    yield {
      event: "progress",
      data: {
        phase: "tool_start",
        name: "知识库",
        detail: !kbEnabled ? "未启用" : kbRoute.kind === "skip" ? "跳过" : "检查知识库"
      }
    };
    const kbStarted = Date.now();
    let kbBody: string | null = null;
    if (kbEnabled && kbRoute.kind !== "skip" && this.config.plugins) {
      const raw = await this.config.plugins
        .execute("search_knowledge", {
          query: kbRoute.query,
          mode: kbRoute.kind
        })
        .catch((error) => (error instanceof Error ? error.message : "检索失败"));
      if (!knowledgeHitLooksEmpty(raw)) {
        kbBody = raw;
      }
    }
    yield {
      event: "progress",
      data: {
        phase: "tool_done",
        name: "知识库",
        detail: !kbEnabled ? "未启用" : kbRoute.kind === "skip" ? "跳过" : kbBody ? "已命中相关文档" : "无相关文档",
        ok: true,
        elapsedMs: Date.now() - kbStarted
      }
    };

    let webBody: string | null = null;
    let webSearched = false;
    let turnUsage: LlmUsage | undefined;
    if (desk && web && webTools && this.config.plugins) {
      const queries = buildDeskSearchQueries(message, deskPriorText(body.history, extra?.canvasPrompt));
      if (queries.length > 0) {
        webSearched = true;
        yield {
          event: "progress",
          data: { phase: "tool_start", name: "web_search", detail: queries.join("；") }
        };
        const searchStarted = Date.now();
        const searchRaw = await withTimeout(
          this.config.plugins.execute("web_search", { queries }),
          0,
          "tool web_search timeout"
        ).catch((error) => (error instanceof Error ? error.message : "tool failed"));
        const searchOk = toolResultOk("web_search", searchRaw);
        const notes = searchOk ? deskSearchNotes(searchRaw) : "";
        if (notes && deskTurn.kind !== "live") {
          webBody = notes;
        }
        yield {
          event: "progress",
          data: {
            phase: "tool_done",
            name: "web_search",
            detail: formatSearchActivity(searchRaw),
            ok: searchOk,
            elapsedMs: Date.now() - searchStarted
          }
        };
        let fetchBundle = "";
        if (searchOk && canFetch) {
          const urls = pageUrlsFromSearchRaw(searchRaw, message, deskTurn.kind);
          for (const url of urls) {
            if (extra?.signal?.aborted) {
              return;
            }
            yield {
              event: "progress",
              data: {
                phase: "tool_start",
                name: "web_fetch",
                detail: deskTurn.kind === "live" ? "预报摘录" : "网页摘录"
              }
            };
            const fetchStarted = Date.now();
            const fetchRaw = await withTimeout(
              this.config.plugins.execute("web_fetch", { url }),
              0,
              "tool web_fetch timeout"
            ).catch((error) => (error instanceof Error ? error.message : "tool failed"));
            const fetchOk = toolResultOk("web_fetch", fetchRaw) && !/抓取失败/.test(fetchRaw);
            const fetched = stripFetchPrefix(fetchRaw);
            const aligned = fetchOk && excerptMatchesQuestion(fetched, message);
            if (aligned && looksLikeReadableProse(fetched)) {
              if (deskTurn.kind === "live") {
                fetchBundle = mergeDeskBrief([fetchBundle, fetched]);
              } else {
                webBody = mergeDeskBrief([webBody ?? "", fetched]) || webBody;
              }
            }
            const fetchDetail = aligned
              ? fetched
                  .replace(/https?:\/\/[^\s]+/gi, "")
                  .replace(/\s+/g, " ")
                  .trim()
                  .slice(0, 800)
              : fetchOk
                ? "摘录和这一问对不上，已略过"
                : fetched
                    .replace(/https?:\/\/[^\s]+/gi, "")
                    .replace(/\s+/g, " ")
                    .trim()
                    .slice(0, 800);
            yield {
              event: "progress",
              data: {
                phase: "tool_done",
                name: "web_fetch",
                detail: fetchDetail || "无摘录",
                ok: fetchOk && aligned,
                elapsedMs: Date.now() - fetchStarted
              }
            };
          }
        }
        if (deskTurn.kind === "live" && searchOk) {
          const material = [searchRaw, fetchBundle].filter(Boolean).join("\n").slice(0, 8000);
          try {
            const brief = await this.config.llm.completeChat(
              [
                { role: "system", content: WEB_BRIEF_PROMPT },
                { role: "user", content: material || message }
              ],
              [],
              { timeoutMs: 15000, enableSearch: false, purpose: "chat", sessionId: extra?.sessionId ?? body.sessionId }
            );
            if (brief.usage) {
              this.config.llm.noteUsage?.("chat", brief.usage, extra?.sessionId ?? body.sessionId);
              turnUsage = addUsage(turnUsage, brief.usage);
            }
            const text = (brief.content ?? "").trim();
            if (hasLiveFactNumbers(text) && looksLikeUsableWebBrief(text)) {
              webBody = text.slice(0, 8000);
            }
          } catch {
            if (hasLiveFactNumbers(notes)) {
              webBody = notes;
            }
          }
        }
      }
    }

    const promptMessages: ChatMessage[] = [
      { role: "system", content: this.config.persona.systemPrompt },
      { role: "system", content: EMOTION_USAGE_PROMPT },
      { role: "system", content: buildIntegratePrompt({
        web,
        webBody: desk ? webBody : null,
        webLive: web && !desk,
        webTools: false,
        webSearched: desk && webSearched,
        kbEnabled,
        kbBody,
        kbSummarize: kbRoute.kind === "summarize"
      }) }
    ];
    if (web && !desk) {
      promptMessages.push({ role: "system", content: SEARCH_USAGE_PROMPT });
    }
    if (!desk && kbEnabled) {
      promptMessages.push({
        role: "system",
        content:
          "老师问知识库有哪些文件、笔记叫什么、上传过什么时，调用 list_knowledge。不要编造未列出的文件。正文检索由系统完成，禁止再调用 search_knowledge。"
      });
    }
    const sitePrompt = web ? buildSearchSitesPrompt(parseSiteLines(this.referenceSites)) : null;
    if (sitePrompt) {
      promptMessages.push({ role: "system", content: sitePrompt });
    }
    const memoryPrompt = buildMemoryInjectPrompt(extra?.longTermMemories ?? []);
    if (memoryPrompt) {
      promptMessages.push({ role: "system", content: memoryPrompt });
    }
    const ackPrompt = buildMemoryAckPrompt(extra?.memoryAckTexts ?? []);
    if (ackPrompt) {
      promptMessages.push({ role: "system", content: ackPrompt });
    }
    if (extra?.canvasPrompt) {
      promptMessages.push({ role: "system", content: extra.canvasPrompt });
    }
    if (desk) {
      let canvasGuide = buildDeskCanvasPrompt(deskTurn.kind);
      if (kbEnabled && kbRoute.kind !== "skip" && !kbBody) {
        canvasGuide +=
          "知识库没有命中文档时：canvas_set 只写一张短 note，说明没找到匹配笔记；禁止用固有知识编造课程大纲、讲义摘要或「下一步给老师」。";
      }
      promptMessages.push({
        role: "system",
        content: canvasGuide
      });
    }
    promptMessages.push(...(body.history ?? []));
    const messages: LlmMessage[] = toLlmMessages(promptMessages);
    messages.push({
      role: "user",
      content: userContentWithImages(message, images)
    });

    const sessionId = extra?.sessionId ?? body.sessionId;
    let speakMessages = messages;
    let canvasPlaced = false;
    if (modelTools.length > 0) {
      try {
        let pending: LlmMessage[] = messages;
        let canvasFailed = false;
        let canvasFailDetail = "";
        const maxRounds = desk ? 2 : 2;
        for (let round = 0; round < maxRounds; round += 1) {
          if (!desk && round > 0 && !canvasFailed) {
            break;
          }
          canvasFailed = false;
          canvasFailDetail = "";
          const planTimeoutMs = desk ? 0 : 18000;
          const complete = await withTimeout(
            this.config.llm.completeChat(pending, modelTools, {
              timeoutMs: planTimeoutMs,
              enableSearch: false,
              sessionId
            }),
            planTimeoutMs > 0 ? planTimeoutMs + 5000 : 0,
            "模型规划超时"
          );
          if (complete.usage) {
            this.config.llm.noteUsage?.(
              complete.toolCalls.length > 0 ? "tool" : "chat",
              complete.usage,
              sessionId
            );
          }
          turnUsage = addUsage(turnUsage, complete.usage);
          if (extra?.signal?.aborted) {
            return;
          }
          const toolCalls = desk
            ? complete.toolCalls.filter((call) => call.name.startsWith("canvas_"))
            : complete.toolCalls;
          if (toolCalls.length === 0) {
            if ((complete.content ?? "").trim() && body.workspace !== "desk") {
              yield {
                event: "progress",
                data: { phase: "think_done", elapsedMs: Date.now() - thinkStarted }
              };
              yield* this.emitText(complete.content);
              yield doneEvent(turnUsage);
              return;
            }
            break;
          }
          const assistantToolCalls = toolCalls.map((call) => ({
            id: call.id,
            type: "function" as const,
            function: { name: call.name, arguments: call.argumentsJson }
          }));
          speakMessages = [
            ...pending,
            { role: "assistant", content: complete.content || null, tool_calls: assistantToolCalls }
          ];
          for (const call of toolCalls) {
            if (extra?.signal?.aborted) {
              return;
            }
            yield {
              event: "progress",
              data: {
                phase: "tool_start",
                name: call.name,
                detail: summarizeToolArgs(call.argumentsJson)
              }
            };
            const started = Date.now();
            const toolTimeoutMs =
              call.name === "web_search" || call.name === "web_fetch"
                ? 65000
                : this.pluginTimeoutMs();
            const result = await withTimeout(
              this.config.plugins!.execute(call.name, parseToolArgs(call.argumentsJson)),
              toolTimeoutMs,
              `tool ${call.name} timeout`
            ).catch((error) => (error instanceof Error ? error.message : "tool failed"));
            const ok = toolResultOk(call.name, result);
            if (call.name.startsWith("canvas_")) {
              if (ok) {
                canvasPlaced = true;
              } else {
                canvasFailed = true;
                canvasFailDetail = result;
              }
            }
            if (!desk && call.name === "web_search" && ok) {
              const note = humanizeSearchNotes(result);
              if (note) {
                webBody = [webBody, note].filter(Boolean).join("\n").slice(0, 8000);
              }
            }
            if (!desk && call.name === "web_fetch" && ok && !/抓取失败/.test(result)) {
              const fetched = stripFetchPrefix(result);
              if (looksLikeReadableProse(fetched)) {
                webBody = [webBody, fetched].filter(Boolean).join("\n").slice(0, 8000);
              }
            }
            yield {
              event: "progress",
              data: {
                phase: "tool_done",
                name: call.name,
                detail: call.name === "web_search" ? formatSearchActivity(result) : result.slice(0, 8000),
                ok,
                elapsedMs: Date.now() - started
              }
            };
            speakMessages.push({
              role: "tool",
              tool_call_id: call.id,
              content: result
            });
          }
          pending = speakMessages;
          if (desk) {
            if (canvasFailed && round + 1 < maxRounds) {
              pending = [
                ...speakMessages,
                {
                  role: "user",
                  content: `画布结构不合格：${canvasFailDetail}。只改这些字段后再 canvas_set。禁止欢迎语和占位卡。`
                }
              ];
              continue;
            }
            break;
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "规划失败";
        console.error(
          JSON.stringify({
            src: "hoshi.runtime",
            phase: "plan",
            ok: false,
            message
          })
        );
        yield {
          event: "progress",
          data: { phase: "tool_done", name: "plan", detail: message, ok: false }
        };
      }
    }
    if (desk && canvasPlaced) {
      speakMessages = [
        { role: "system", content: this.config.persona.systemPrompt },
        {
          role: "system",
          content:
            "画布已经写好。用一两句中文概括你刚查到的要点，让老师去看卡片。禁止说没有查、不用查、没法上网；老师要你上网时更要承认已经检索过。"
        },
        { role: "user", content: userContentWithImages(message, images) }
      ];
    } else if (desk && deskTurn.kind === "live") {
      speakMessages = [
        { role: "system", content: this.config.persona.systemPrompt },
        {
          role: "system",
          content: hasLiveFactNumbers(webBody ?? "")
            ? `检索摘录：\n${webBody}\n用一两句中文汇报其中的气温。禁止提 kind=chart、画布拒绝、工具名；禁止让老师手抄。`
            : "检索没有可用的逐日气温数字，没有往画布落卡。用一两句中文说明这次没画成图。禁止提 kind=chart、画布拒绝、工具名；禁止让老师手抄气温或日期表。"
        },
        { role: "user", content: userContentWithImages(message, images) }
      ];
    }
    yield {
      event: "progress",
      data: { phase: "think_done", elapsedMs: Date.now() - thinkStarted }
    };

    const streamSearch = web && !desk;
    const speakTimeoutMs = desk ? 45000 : 90000;
    let spoke = 0;
    try {
      for await (const event of this.streamSentences(
        speakMessages,
        extra?.signal,
        (usage) => {
          turnUsage = addUsage(turnUsage, usage);
        },
        sessionId,
        streamSearch,
        speakTimeoutMs
      )) {
        if (event.event === "sentence") {
          spoke += 1;
        }
        yield event;
      }
      if (extra?.signal?.aborted) {
        return;
      }
      if (spoke === 0 && !(desk && canvasPlaced)) {
        try {
          const rescue = await withTimeout(
            this.config.llm.completeChat(
              [
                ...speakMessages,
                {
                  role: "user",
                  content: "不要调用工具。用中文完整句子回答老师刚才的问题。"
                }
              ],
              [],
              { timeoutMs: desk ? 15000 : 18000, enableSearch: false, purpose: "chat", sessionId }
            ),
            desk ? 18000 : 20000,
            "补答超时"
          );
          if (rescue.usage) {
            this.config.llm.noteUsage?.("chat", rescue.usage, sessionId);
            turnUsage = addUsage(turnUsage, rescue.usage);
          }
          const text = (rescue.content ?? "").trim();
          if (text) {
            for await (const event of this.emitText(text)) {
              spoke += 1;
              yield event;
            }
          }
        } catch {
          /* 再用下面的兜底句 */
        }
      }
      if (spoke === 0) {
        const fallback =
          webBody
            ? timeoutSpeakFallback(webBody)
            : desk && canvasPlaced
              ? "画布已经更新好了，可以直接看卡片。"
              : web && !webBody
                ? deskTurn.kind === "live"
                  ? "这次检索没有拿到可用的逐日气温，没法按实测画图。"
                  : "这次网页检索没有拿到可用资料，没法按实测画图。你可以稍后再问，或换个更具体的地点和时间。"
                : "我这边没有生成成句回复，请再试一次。";
        for await (const event of this.emitText(fallback)) {
          spoke += 1;
          yield event;
        }
      }
      yield doneEvent(turnUsage);
    } catch (error) {
      if (extra?.signal?.aborted && !isAbortTimeout(error)) {
        return;
      }
      if (isAbortTimeout(error) || (error instanceof Error && /超时/.test(error.message))) {
        if (spoke === 0) {
          const text = timeoutSpeakFallback(webBody);
          for await (const event of this.emitText(text)) {
            spoke += 1;
            yield event;
          }
        }
        yield doneEvent(turnUsage);
        return;
      }
      throw error;
    }
  }

  private async *streamSentences(
    messages: LlmMessage[],
    signal?: AbortSignal,
    onUsage?: (usage: LlmUsage) => void,
    sessionId?: string,
    enableSearch = true,
    timeoutMs = 90000
  ): AsyncGenerator<AgentEvent> {
    const splitter = new SentenceSplitter();
    let index = 0;
    try {
      for await (const part of this.config.llm.streamChat(
        messages,
        mergeTimeoutSignal(timeoutMs, signal),
        {
          purpose: "chat",
          sessionId,
          enableSearch
        }
      )) {
        if (signal?.aborted) {
          return;
        }
        if (part.kind === "usage") {
          onUsage?.(part.usage);
          continue;
        }
        for (const sentence of splitter.push(part.text)) {
          const event = this.toSentence(sentence, index);
          if (event) {
            index += 1;
            yield event;
          }
        }
      }
    } catch (error) {
      if (isAbortTimeout(error) || (error instanceof Error && /超时/.test(error.message))) {
        /* 口播超时交给外层用摘录补答 */
      } else {
        throw error;
      }
    }
    for (const sentence of splitter.flush()) {
      const event = this.toSentence(sentence, index);
      if (event) {
        index += 1;
        yield event;
      }
    }
  }

  private async *emitText(text: string): AsyncGenerator<AgentEvent> {
    const splitter = new SentenceSplitter();
    let index = 0;
    for (const sentence of splitter.push(text)) {
      const event = this.toSentence(sentence, index);
      if (event) {
        index += 1;
        yield event;
      }
    }
    for (const sentence of splitter.flush()) {
      const event = this.toSentence(sentence, index);
      if (event) {
        index += 1;
        yield event;
      }
    }
  }

  private toSentence(sentence: string, index: number): SentenceEvent | null {
    const parsed = resolveSentenceEmotion(sentence, this.config.persona.defaultEmotion);
    if (!parsed.text || !hasSpeechContent(parsed.text) || looksLikeInternalCanvasTalk(parsed.text)) {
      return null;
    }
    return {
      event: "sentence",
      data: {
        text: parsed.text,
        emotion: parsed.emotion,
        index
      }
    };
  }
}

function itemTitles(list: unknown): string[] {
  if (!Array.isArray(list)) {
    return [];
  }
  return list
    .map((item) => {
      const rec = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      return typeof rec.title === "string" ? rec.title.trim() : "";
    })
    .filter(Boolean);
}

function summarizePageArgs(args: Record<string, unknown>): string | null {
  const items = Array.isArray(args.items) ? args.items : Array.isArray(args.cards) ? args.cards : null;
  if (!items) {
    return null;
  }
  const titles = itemTitles(items);
  if (titles.length) {
    return `整页 ${items.length} 张：${titles.slice(0, 3).join("、")}`;
  }
  return `整页 ${items.length} 张`;
}

function summarizeToolArgs(argumentsJson: string): string {
  try {
    const parsed = JSON.parse(argumentsJson) as Record<string, unknown>;
    const nested =
      parsed.arguments && typeof parsed.arguments === "object"
        ? (parsed.arguments as Record<string, unknown>)
        : parsed;
    if (typeof nested.query === "string" && nested.query.trim()) {
      return nested.query.trim();
    }
    if (Array.isArray(nested.queries)) {
      const queries = nested.queries
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => item.trim());
      if (queries.length) {
        return queries.slice(0, 4).join("；");
      }
    }
    if (typeof nested.title === "string" && nested.title.trim()) {
      return nested.title.trim();
    }
    const page = summarizePageArgs(nested) ?? summarizePageArgs(parsed);
    if (page) {
      return page;
    }
    if (typeof nested.url === "string" && nested.url.trim()) {
      return nested.url.trim();
    }
    return JSON.stringify(nested);
  } catch {
    return argumentsJson;
  }
}

function toolResultOk(name: string, result: string): boolean {
  if (name === "canvas_put") {
    return result.startsWith("已放到画布");
  }
  if (name === "canvas_set") {
    return result.startsWith("已更新画布");
  }
  if (name === "canvas_remove") {
    return result.startsWith("已从画布移除");
  }
  return !/失败|不可用|缺少|拒绝：/.test(result);
}

function looksLikeInternalCanvasTalk(text: string): boolean {
  return /kind=chart|画布拒绝|时效这一页|只认 chart|老师要是拿到逐日|逐日实测记录/.test(text);
}

function timeoutSpeakFallback(webBody: string | null): string {
  const brief = humanizeSearchNotes(webBody ?? "");
  if (brief.length >= 24) {
    return `口播超时了，先按检索到的资料说：${brief.slice(0, 280)}`;
  }
  return "回答超时，请再试一次。";
}

function deskPriorText(history?: ChatMessage[], canvasPrompt?: string): string {
  const chats = (history ?? [])
    .filter((item) => item.role === "user" || item.role === "assistant")
    .slice(-8)
    .map((item) => item.content)
    .join("\n");
  const titles = [...(canvasPrompt ?? "").matchAll(/「([^」]{1,24})」/g)].map((match) => match[1]);
  return [chats, titles.join("\n")].filter(Boolean).join("\n");
}

function doneEvent(usage?: LlmUsage): AgentEvent {
  return usage
    ? { event: "done", data: { ok: true, usage } }
    : { event: "done", data: { ok: true } };
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  if (ms <= 0) {
    return promise;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(label)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
