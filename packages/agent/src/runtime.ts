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
import { buildMemoryAckPrompt, buildMemoryInjectPrompt } from "./memory/inject";
import { buildSearchSitesPrompt, parseSiteLines, EMOTION_USAGE_PROMPT, SEARCH_USAGE_PROMPT } from "./searchPrompt";
import { buildIntegratePrompt, extractDeskTopic, extractPortraitNames, knowledgeHitLooksEmpty, knowledgeRoute, knowledgeSearchQuery, looksLikeChitchat, looksLikeCompareQuery, looksLikePersonQuery, looksLikeWorkQuery, shouldWebSearch } from "./retrieval/plan";
import { formatSearchActivity, humanizeSearchNotes, looksLikeReadableProse, looksLikeSearchToolDump } from "./web/notes";
import {
  buildDeskSearchQueries,
  excerptMatchesQuestion,
  mergeDeskBrief,
  stripFetchPrefix,
  wikiUrlsFromSearchRaw
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
      longTermMemories?: string[];
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
          query: knowledgeSearchQuery(message),
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
    if (desk && web && webTools && this.config.plugins) {
      const queries = buildDeskSearchQueries(message, deskPriorText(body.history, extra?.canvasPrompt));
      if (queries.length > 0) {
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
        const notes = searchOk ? humanizeSearchNotes(searchRaw) : "";
        if (notes) {
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
        if (searchOk && canFetch) {
          for (const url of wikiUrlsFromSearchRaw(searchRaw, message)) {
            if (extra?.signal?.aborted) {
              return;
            }
            yield {
              event: "progress",
              data: { phase: "tool_start", name: "web_fetch", detail: "维基摘录" }
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
              webBody = mergeDeskBrief([webBody ?? "", fetched]) || webBody;
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
      promptMessages.push({
        role: "system",
        content:
          "每一句都必须调用 canvas_set（改已有卡可用 canvas_put），禁止只口头、禁止说没有画布工具。闲聊或短句：一张 kind=note 或 card，title 用不超过 8 个字的短词，不要整句问话。知识整理：能点名的每人/每概念一张 card，剧情或清单用 markdown。对照：两人各一张 card，可选 table/markdown。天气数字：kind=chart。检索摘录仅作参考；摘录脏或空时用固有知识写卡，口头可说可能过时。禁止把 web_search、queries、工具名、pdf 路径、口播借口写进 body。口播只概括卡片，不要复述 brief 或念 queries。"
      });
      if (looksLikeCompareQuery(message) && extractPortraitNames(message).length >= 2) {
        promptMessages.push({
          role: "system",
          content:
            "本题是人物对照：两位角色各一张 kind=card（title 用角色名，body 只写该人设定，禁止两张卡同一段话）。"
        });
      }
    }
    promptMessages.push(...(body.history ?? []));
    const messages: LlmMessage[] = toLlmMessages(promptMessages);
    messages.push({
      role: "user",
      content: userContentWithImages(message, images)
    });

    const sessionId = extra?.sessionId ?? body.sessionId;
    let speakMessages = messages;
    let turnUsage: LlmUsage | undefined;
    let canvasPlaced = false;
    if (modelTools.length > 0) {
      try {
        let pending: LlmMessage[] = messages;
        let canvasFailed = false;
        const maxRounds = desk ? 2 : 2;
        for (let round = 0; round < maxRounds; round += 1) {
          if (!desk && round > 0 && !canvasFailed) {
            break;
          }
          canvasFailed = false;
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
            if (desk && round === 0) {
              pending = [
                ...pending,
                { role: "assistant", content: complete.content || "" },
                {
                  role: "user",
                  content: "必须调用 canvas_set 提交卡片或便签。禁止只口头说已放卡，禁止把查询词或工具名写进 body。"
                }
              ];
              continue;
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
            break;
          }
        }
      } catch {
        /* 规划失败则带着已收集的知识库/联网设定直接回答 */
      }
    }
    if (desk && canvasPlaced) {
      const deskSpeak: LlmMessage[] = [
        { role: "system", content: this.config.persona.systemPrompt },
        {
          role: "system",
          content:
            "画布已经写好。用一两句中文概括你刚查到的要点，让老师去看卡片。禁止说没有查、不用查、没法上网；老师要你上网时更要承认已经检索过。"
        },
        { role: "user", content: userContentWithImages(message, images) }
      ];
      speakMessages = deskSpeak;
    }
    yield {
      event: "progress",
      data: { phase: "think_done", elapsedMs: Date.now() - thinkStarted }
    };

    const streamSearch = web && !desk;
    const speakTimeoutMs = desk ? 20000 : 90000;
    let spoke = 0;
    let spoken = "";
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
          spoken += String((event.data as { text?: string }).text ?? "");
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
              if (event.event === "sentence") {
                spoken += String((event.data as { text?: string }).text ?? "");
              }
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
                ? "这次网页检索没有拿到可用资料，没法按实测画图。你可以稍后再问，或换个更具体的地点和时间。"
                : "我这边没有生成成句回复，请再试一次。";
        for await (const event of this.emitText(fallback)) {
          spoke += 1;
          if (event.event === "sentence") {
            spoken += String((event.data as { text?: string }).text ?? "");
          }
          yield event;
        }
      }
      if (body.workspace === "desk" && !canvasPlaced) {
        for await (const event of this.ensureDeskKnowledgeCard({
          message,
          webBody,
          kbBody,
          signal: extra?.signal
        })) {
          if (
            event.event === "progress" &&
            event.data.phase === "tool_done" &&
            event.data.ok &&
            String(event.data.name ?? "").startsWith("canvas_")
          ) {
            canvasPlaced = true;
          }
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
            if (event.event === "sentence") {
              spoken += String((event.data as { text?: string }).text ?? "");
            }
            yield event;
          }
        }
        if (body.workspace === "desk" && !canvasPlaced) {
          for await (const event of this.ensureDeskKnowledgeCard({
            message,
            webBody,
            kbBody,
            signal: extra?.signal
          })) {
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
        /* 口播超时交给外层用摘录补答/补卡 */
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

  private async *ensureDeskKnowledgeCard(input: {
    message: string;
    webBody: string | null;
    kbBody: string | null;
    signal?: AbortSignal;
  }): AsyncGenerator<AgentEvent> {
    if (!this.config.plugins || input.signal?.aborted) {
      return;
    }
    const names = extractPortraitNames(input.message);
    const notes = usableCardBody(humanizeSearchNotes(input.webBody ?? ""));
    const kb = usableCardBody((input.kbBody ?? "").replace(/\s+/g, " ").trim());
    const prose = [notes, kb].find((item) => looksLikeReadableProse(item)) ?? "";
    const person = looksLikePersonQuery(input.message);
    const work = !person && looksLikeWorkQuery(input.message);
    const kicker = person ? "人物 / 角色" : work ? "作品" : looksLikeChitchat(input.message) ? "备注" : "知识点";
    const tags = person ? ["角色"] : work ? ["作品"] : looksLikeChitchat(input.message) ? ["备注"] : ["概念"];
    const items: Array<Record<string, unknown>> = [];
    const source = [notes, kb].filter((item) => looksLikeReadableProse(item)).join("\n");
    for (const title of names) {
      const about = source
        .split(/[。！？\n]/)
        .map((line) => line.trim())
        .find((line) => line.includes(title) && looksLikeReadableProse(line));
      let body = about ? `${about}。` : "";
      if (!body && names.length === 1 && looksLikeReadableProse(prose)) {
        body = prose.slice(0, 2000);
      }
      if (!looksLikeReadableProse(body) && looksLikeReadableProse(prose)) {
        const snippet = prose
          .split(/[。！？\n]/)
          .map((line) => line.trim())
          .filter((line) => line.includes(title) && line.length >= 8)
          .slice(0, 4)
          .join("。");
        body = snippet ? `${snippet}。` : "";
      }
      if (!looksLikeReadableProse(body)) {
        continue;
      }
      items.push({
        kind: "card",
        title,
        kicker,
        body: body.slice(0, 2000),
        tags
      });
    }
    if (items.length === 0) {
      const title = fallbackDeskTitle(input.message, names);
      if (looksLikeReadableProse(prose)) {
        items.push({
          kind: "card",
          title,
          kicker,
          body: prose.slice(0, 2000),
          tags
        });
      } else {
        items.push({
          kind: "note",
          title,
          body: inherentDeskNote(input.message, title)
        });
      }
    }
    yield {
      event: "progress",
      data: { phase: "tool_start", name: "canvas_set", detail: String(items[0]?.title ?? "要点") }
    };
    const started = Date.now();
    const result = await withTimeout(
      this.config.plugins.execute("canvas_set", {
        items
      }),
      this.pluginTimeoutMs(),
      "tool canvas_set timeout"
    ).catch((error) => (error instanceof Error ? error.message : "tool failed"));
    yield {
      event: "progress",
      data: {
        phase: "tool_done",
        name: "canvas_set",
        detail: result.slice(0, 8000),
        ok: toolResultOk("canvas_set", result),
        elapsedMs: Date.now() - started
      }
    };
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
    if (!parsed.text || !hasSpeechContent(parsed.text)) {
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

function timeoutSpeakFallback(webBody: string | null): string {
  const brief = humanizeSearchNotes(webBody ?? "");
  if (brief.length >= 24) {
    return `口播超时了，先按检索到的资料说：${brief.slice(0, 280)}`;
  }
  return "回答超时，请再试一次。";
}

function usableCardBody(text: string): string {
  const trimmed = text.trim();
  if (!trimmed || looksLikeSearchToolDump(trimmed) || /还在整理/.test(trimmed)) {
    return "";
  }
  return trimmed.slice(0, 2000);
}

function fallbackDeskTitle(message: string, names: string[]): string {
  if (names.length >= 2) {
    return "要点";
  }
  const topic = extractDeskTopic(message);
  if (topic) {
    return topic.slice(0, 16);
  }
  if (names.length === 1) {
    return names[0];
  }
  return "要点";
}

function inherentDeskNote(message: string, title: string): string {
  if (looksLikeChitchat(message)) {
    return "老师打了招呼。这一页先记下，想整理知识时再往下写。";
  }
  if (title && title !== "要点") {
    return `${title}是这轮要整理的对象。公开摘录不够用，先占一格，细节可以下一问再补。`;
  }
  const clipped = message.replace(/\s+/g, " ").trim().slice(0, 24);
  return `先把「${clipped}」这一问记下。资料不够展开时，下一问再补细节。`;
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
