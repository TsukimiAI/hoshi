import type {
  AgentEvent,
  ChatMessage,
  ChatRequestBody,
  LlmUsage,
  SentenceEvent,
  UsagePurpose
} from "@hoshi/shared";
import { addUsage, imageOnlyUserText, isImageOnlyUserText } from "@hoshi/shared";
import { toLlmMessages, mergeTimeoutSignal, isAbortTimeout, type LlmCallOptions, type LlmMessage, type StreamChatPart } from "./llm/openai";
import { historyWithLookback, type ChatImagePayload } from "./chatImages";
import { PET_SCREEN_FOLLOW_NOTE, PET_SCREEN_SYSTEM_NOTE, userContentWithScreen, type PetTurnScreen } from "./petScreen/content";
import { resolveSentenceEmotion } from "./emotion";
import type { PersonaConfig } from "./persona";
import { parseToolArgs } from "./plugins/parseTool";
import type { LlmTool } from "./plugins/types";
import { buildMemoryAckPrompt, buildMemoryInjectPrompt, type MemoryInjectLine } from "./memory/inject";
import { buildSearchSitesPrompt, parseSiteLines, EMOTION_USAGE_PROMPT, PET_ANSWER_PROMPT } from "./searchPrompt";
import { buildDeskCanvasGuide, buildIntegratePrompt, classifyDeskTurn, DESK_CRITIC_PROMPT, DESK_FORM_PROMPT, DESK_WEB_PROMPT, imageTurnRetrieval, knowledgeHitLooksEmpty, knowledgeRoute, looksLikeLocalKnowledgeQuery, parseDeskCanvasChoice, parseDeskCritic, type DeskCanvasChoice } from "./retrieval/plan";
import { updateCanvasTurn } from "./canvas/tool";
import { formatSearchActivity, humanizeSearchNotes, looksLikeReadableProse } from "./web/notes";
import { stripFetchPrefix } from "./web/deskRetrieve";
import { normalizeQueries } from "./web/merge";
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
      lookback?: { historyIndex: number; images: ChatImagePayload[] };
      screen?: PetTurnScreen | null;
      glanceInterval?: boolean;
    }
  ): AsyncGenerator<AgentEvent> {
    const images = body.images ?? [];
    const message = body.message?.trim() || (images.length > 0 ? imageOnlyUserText(images.length) : "");
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
    const desk = body.workspace === "desk";
    let turnUsage: LlmUsage | undefined;
    const kbRoute = knowledgeRoute(message);
    const canvasTools = tools.filter((tool) => tool.function.name.startsWith("canvas_"));
    const sessionId = extra?.sessionId ?? body.sessionId;
    const visualOnly = isImageOnlyUserText(message);
    const imageRetrieval = images.length > 0 ? imageTurnRetrieval(message) : null;
    const chitchat = !desk && classifyDeskTurn(message).kind === "chitchat";
    const noteQuestion = kbRoute.kind === "summarize" || looksLikeLocalKnowledgeQuery(message);
    const petCanSearch = imageRetrieval
      ? !desk && imageRetrieval.web && webTools
      : !visualOnly && !desk && !chitchat && !noteQuestion && webTools;
    const web = imageRetrieval
      ? imageRetrieval.web && webTools
      : visualOnly
        ? false
        : desk
          ? message.trim().length > 0 && webTools
          : !chitchat && !noteQuestion;
    const kbWanted = imageRetrieval
      ? imageRetrieval.knowledge
      : visualOnly
        ? false
        : desk
          ? message.trim().length > 0
          : kbRoute.kind !== "skip";
    let modelTools = desk
      ? []
      : tools.filter((tool) => {
          const name = tool.function.name;
          if (name === "search_knowledge") {
            return false;
          }
          if ((name === "web_search" || name === "web_fetch") && !petCanSearch) {
            return false;
          }
          return true;
        });
    let canvasChoice: DeskCanvasChoice = { canvas: desk && message.trim().length > 0, images: false, form: "note" };

    yield { event: "progress", data: { phase: "think" } };
    const thinkStarted = Date.now();

    let kbBody: string | null = null;
    let webBody: string | null = null;
    let webSearched = false;
    const webEvents: AgentEvent[] = [];
    const rememberWeb = (event: AgentEvent): void => {
      webEvents.push(event);
    };
    let webAborted = false;
    const deskContext = desk ? deskContextText(body.history, message) : "";
    let searchQuestion = message.trim();
    const runKb = async (): Promise<void> => {
      if (!(kbEnabled && kbWanted && this.config.plugins)) {
        return;
      }
      const raw = await this.config.plugins
        .execute("search_knowledge", {
          query: !desk && kbRoute.kind === "summarize" ? kbRoute.query : searchQuestion,
          mode: desk ? "lookup" : kbRoute.kind
        })
        .catch((error) => (error instanceof Error ? error.message : "检索失败"));
      if (!knowledgeHitLooksEmpty(raw)) {
        kbBody = raw;
      }
    };
    const runWeb = async (): Promise<void> => {
      const plugins = this.config.plugins;
      const webToolList = tools.filter(
        (tool) => tool.function.name === "web_search" || tool.function.name === "web_fetch"
      );
      if (!(web && webTools && plugins) || webToolList.length === 0) {
        return;
      }
      const sitePrompt = buildSearchSitesPrompt(parseSiteLines(this.referenceSites));
      let pending: LlmMessage[] = [
        { role: "system", content: DESK_WEB_PROMPT },
        ...(sitePrompt ? [{ role: "system" as const, content: sitePrompt }] : []),
        ...toLlmMessages(body.history ?? []),
        { role: "user", content: message }
      ];
      const asked: string[] = [];
      const pieces: string[] = [];
      for (let round = 0; round < 6; round += 1) {
        if (extra?.signal?.aborted) {
          webAborted = true;
          return;
        }
        let complete: {
          content: string;
          toolCalls: Array<{ id: string; name: string; argumentsJson: string }>;
          usage?: LlmUsage;
        };
        try {
          complete = await withTimeout(
            this.config.llm.completeChat(pending, webToolList, {
              timeoutMs: 0,
              enableSearch: false,
              purpose: "tool",
              sessionId
            }),
            0,
            "检索规划超时"
          );
        } catch {
          break;
        }
        if (complete.usage) {
          this.config.llm.noteUsage?.("tool", complete.usage, sessionId);
          turnUsage = addUsage(turnUsage, complete.usage);
        }
        const calls = complete.toolCalls.filter(
          (call) => call.name === "web_search" || call.name === "web_fetch"
        );
        if (calls.length === 0) {
          break;
        }
        const assistantToolCalls = calls.map((call) => ({
          id: call.id,
          type: "function" as const,
          function: { name: call.name, arguments: call.argumentsJson }
        }));
        pending = [
          ...pending,
          { role: "assistant", content: complete.content || null, tool_calls: assistantToolCalls }
        ];
        for (const call of calls) {
          if (extra?.signal?.aborted) {
            webAborted = true;
            return;
          }
          const args = parseToolArgs(call.argumentsJson);
          if (call.name === "web_search") {
            const queries = normalizeQueries(args);
            if (Array.isArray(queries)) {
              for (const query of queries) {
                if (!asked.includes(query)) {
                  asked.push(query);
                }
              }
            }
          }
          webSearched = true;
          rememberWeb({
            event: "progress",
            data: { phase: "tool_start", name: call.name, detail: summarizeToolArgs(call.argumentsJson) }
          });
          const started = Date.now();
          const result = await withTimeout(
            plugins.execute(call.name, args),
            65000,
            `tool ${call.name} timeout`
          ).catch((error) => (error instanceof Error ? error.message : "tool failed"));
          const ok = toolResultOk(call.name, result);
          pieces.push(result.slice(0, ok ? 4000 : 800));
          rememberWeb({
            event: "progress",
            data: {
              phase: "tool_done",
              name: call.name,
              detail: call.name === "web_search" ? formatSearchActivity(result) : result.slice(0, 800),
              ok,
              elapsedMs: Date.now() - started
            }
          });
          pending.push({ role: "tool", tool_call_id: call.id, content: result });
        }
      }
      if (
        !webSearched &&
        classifyDeskTurn(message).kind !== "chitchat" &&
        kbRoute.kind !== "summarize"
      ) {
        const query = message.trim().slice(0, 200);
        if (query) {
          webSearched = true;
          asked.push(query);
          rememberWeb({
            event: "progress",
            data: { phase: "tool_start", name: "web_search", detail: query }
          });
          const started = Date.now();
          const result = await withTimeout(
            plugins.execute("web_search", { queries: [query] }),
            65000,
            "tool web_search timeout"
          ).catch((error) => (error instanceof Error ? error.message : "tool failed"));
          pieces.push(result.slice(0, 4000));
          rememberWeb({
            event: "progress",
            data: {
              phase: "tool_done",
              name: "web_search",
              detail: formatSearchActivity(result),
              ok: toolResultOk("web_search", result),
              elapsedMs: Date.now() - started
            }
          });
        }
      }
      if (asked.length > 0) {
        searchQuestion = asked.join("；").slice(0, 200);
      }
      const joined = pieces.join("\n").trim();
      webBody = joined ? joined.slice(0, 8000) : webSearched ? "没搜到贴合资料" : null;
    };
    if (desk) {
      await runWeb();
      if (webAborted || extra?.signal?.aborted) {
        return;
      }
      for (const event of webEvents) {
        yield event;
      }
    }
    yield {
      event: "progress",
      data: {
        phase: "tool_start",
        name: "知识库",
        detail: !kbEnabled ? "未启用" : !kbWanted ? "跳过" : "检查知识库"
      }
    };
    const kbStarted = Date.now();
    await runKb();
    yield {
      event: "progress",
      data: {
        phase: "tool_done",
        name: "知识库",
        detail: !kbEnabled ? "未启用" : !kbWanted ? "跳过" : kbBody ? "已命中相关文档" : "无相关文档",
        ok: true,
        elapsedMs: Date.now() - kbStarted
      }
    };
    const promptMessages: ChatMessage[] = [
      { role: "system", content: this.config.persona.systemPrompt },
      { role: "system", content: EMOTION_USAGE_PROMPT },
      { role: "system", content: buildIntegratePrompt({
        web,
        webBody: desk ? webBody : null,
        webLive: false,
        webTools: petCanSearch,
        webSearched: desk && webSearched,
        webLiveFact: false,
        forCanvas: desk,
        kbEnabled,
        kbBody,
        kbSummarize: !desk && kbRoute.kind === "summarize",
        noteQuestion
      }) }
    ];
    if (petCanSearch) {
      promptMessages.push({ role: "system", content: PET_ANSWER_PROMPT });
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
    if (desk && searchQuestion && !visualOnly) {
      promptMessages.push({
        role: "system",
        content: `结合上下文，这一轮要查的是：${searchQuestion}`
      });
    }
    if (desk && message.trim()) {
      const chosen = await this.chooseDeskForm(deskContext, searchQuestion, webBody ?? kbBody ?? "", sessionId);
      if (chosen.usage) {
        turnUsage = addUsage(turnUsage, chosen.usage);
      }
      canvasChoice = chosen.choice;
      // 版式示例里的 images:false 不能关掉角色卡。未显式要求时，卡片自己决定要不要查公开头像。
      if (canvasChoice.images) {
        updateCanvasTurn({ portraits: true });
      }
      modelTools = canvasChoice.canvas ? canvasTools : [];
      let canvasGuide = buildDeskCanvasGuide(canvasChoice);
      if (kbEnabled && kbWanted && !kbBody) {
        canvasGuide +=
          "知识库没有命中文档时：canvas_set 只写一张短 note，说明没找到匹配笔记；禁止用固有知识编造课程大纲、讲义摘要或「下一步给老师」。";
      }
      promptMessages.push({
        role: "system",
        content: canvasGuide
      });
    }
    const lookback = images.length > 0 ? null : extra?.lookback ?? null;
    const screen = extra?.screen ?? null;
    if (extra?.glanceInterval) {
      promptMessages.push({ role: "system", content: PET_SCREEN_FOLLOW_NOTE });
    } else if (screen) {
      promptMessages.push({ role: "system", content: PET_SCREEN_SYSTEM_NOTE });
    }
    const messages: LlmMessage[] = [
      ...toLlmMessages(promptMessages),
      ...historyWithLookback(body.history ?? [], lookback),
      {
        role: "user",
        content: userContentWithScreen(message, images, screen)
      }
    ];

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
            if (!desk && (call.name === "web_search" || call.name === "web_fetch")) {
              webSearched = true;
            }
            if (!desk && call.name === "web_search" && ok) {
              const note = humanizeSearchNotes(result) || result.slice(0, 4000);
              if (note.trim()) {
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
    if (desk && canvasPlaced && this.config.plugins) {
      const review = await this.reviewCanvas({
        message: searchQuestion || message,
        excerpt: (webBody ?? kbBody ?? "").slice(0, 1200),
        cards: lastCanvasArguments(speakMessages),
        sessionId
      });
      if (review.usage) {
        turnUsage = addUsage(turnUsage, review.usage);
      }
      if (review.fix) {
        try {
          const pending: LlmMessage[] = [
            ...speakMessages,
            {
              role: "user",
              content: `这页没有回答老师的问题：${review.fix}。只改这些卡片后再 canvas_set。`
            }
          ];
          const complete = await withTimeout(
            this.config.llm.completeChat(pending, modelTools, {
              timeoutMs: 0,
              enableSearch: false,
              sessionId
            }),
            0,
            "模型规划超时"
          );
          if (complete.usage) {
            this.config.llm.noteUsage?.("tool", complete.usage, sessionId);
            turnUsage = addUsage(turnUsage, complete.usage);
          }
          const toolCalls = complete.toolCalls.filter((call) => call.name.startsWith("canvas_"));
          if (toolCalls.length > 0) {
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
              const result = await withTimeout(
                this.config.plugins.execute(call.name, parseToolArgs(call.argumentsJson)),
                this.pluginTimeoutMs(),
                `tool ${call.name} timeout`
              ).catch((error) => (error instanceof Error ? error.message : "tool failed"));
              const ok = toolResultOk(call.name, result);
              if (ok) {
                canvasPlaced = true;
              }
              yield {
                event: "progress",
                data: {
                  phase: "tool_done",
                  name: call.name,
                  detail: result.slice(0, 8000),
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
          }
        } catch {
          /* 评判退回失败就保留已经落上的板 */
        }
      }
    }
    if (desk && canvasPlaced) {
      speakMessages = [
        { role: "system", content: this.config.persona.systemPrompt },
        {
          role: "system",
          content: `画布已经写好。这一轮要查的是：${searchQuestion}。用一两句中文概括已经落到画布上的要点，让老师去看卡片。禁止说「我先查一下」。禁止说没有查、不用查、没法上网。`
        },
        ...(extra?.screen ? [{ role: "system" as const, content: PET_SCREEN_SYSTEM_NOTE }] : []),
        ...(historyWithLookback(body.history ?? [], images.length > 0 ? null : extra?.lookback ?? null)),
        { role: "user", content: userContentWithScreen(message, images, extra?.screen) }
      ];
    }
    if (!desk && webSearched) {
      const searchedPrompt = buildIntegratePrompt({
        web: true,
        webBody,
        webLive: false,
        webTools: false,
        webSearched: true,
        webLiveFact: false,
        forCanvas: false,
        kbEnabled,
        kbBody,
        kbSummarize: kbRoute.kind === "summarize",
        noteQuestion
      });
      speakMessages = speakMessages.flatMap((item) => {
        if (item.role !== "system" || typeof item.content !== "string") {
          return [item];
        }
        if (item.content.startsWith("资料由系统先判定")) {
          return [{ role: "system" as const, content: searchedPrompt }];
        }
        if (item.content === PET_ANSWER_PROMPT) {
          return [];
        }
        return [item];
      });
    }
    yield {
      event: "progress",
      data: { phase: "think_done", elapsedMs: Date.now() - thinkStarted }
    };

    const speakTimeoutMs = desk ? 120000 : 90000;
    let spoke = 0;
    try {
      for await (const event of this.streamSentences(
        speakMessages,
        extra?.signal,
        (usage) => {
          turnUsage = addUsage(turnUsage, usage);
        },
        sessionId,
        false,
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
              { timeoutMs: desk ? 45000 : 18000, enableSearch: false, purpose: "chat", sessionId }
            ),
            desk ? 50000 : 20000,
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
                ? "这次网页检索没有拿到可用资料。你可以稍后再问。"
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

  private async chooseDeskForm(
    context: string,
    question: string,
    summary: string,
    sessionId?: string
  ): Promise<{ choice: DeskCanvasChoice; usage?: LlmUsage }> {
    const fallback: DeskCanvasChoice = { canvas: true, images: false, form: "note" };
    try {
      const result = await withTimeout(
        this.config.llm.completeChat(
          [
            { role: "system", content: DESK_FORM_PROMPT },
            { role: "user", content: `上下文：\n${context}\n要查的问题：${question}\n总结：${summary || "无"}` }
          ],
          [],
          { timeoutMs: 30000, enableSearch: false, purpose: "chat", sessionId }
        ),
        35000,
        "版式超时"
      );
      if (result.usage) {
        this.config.llm.noteUsage?.("chat", result.usage, sessionId);
      }
      const parsed = parseDeskCanvasChoice(result.content ?? "");
      if (!parsed) {
        return { choice: fallback, usage: result.usage };
      }
      if (parsed.form === "chart" && !/\d/.test(summary)) {
        return { choice: { ...parsed, form: "note" }, usage: result.usage };
      }
      return { choice: parsed, usage: result.usage };
    } catch {
      return { choice: fallback };
    }
  }

  private async reviewCanvas(input: {
    message: string;
    excerpt: string;
    cards: string;
    sessionId?: string;
  }): Promise<{ fix: string | null; usage?: LlmUsage }> {
    try {
      const result = await withTimeout(
        this.config.llm.completeChat(
          [
            { role: "system", content: DESK_CRITIC_PROMPT },
            {
              role: "user",
              content: `问句：${input.message}\n摘录：${input.excerpt || "无"}\n卡片：${input.cards || "无"}`
            }
          ],
          [],
          { timeoutMs: 30000, enableSearch: false, purpose: "chat", sessionId: input.sessionId }
        ),
        35000,
        "评判超时"
      );
      if (result.usage) {
        this.config.llm.noteUsage?.("chat", result.usage, input.sessionId);
      }
      const verdict = parseDeskCritic(result.content ?? "");
      if (!verdict || verdict.pass) {
        return { fix: null, usage: result.usage };
      }
      return { fix: verdict.fix, usage: result.usage };
    } catch {
      return { fix: null };
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
  const raw = (webBody ?? "").trim();
  if (/没搜到贴合资料|没留下贴合/.test(raw)) {
    return "这轮检索没有留下和问题贴合的资料。";
  }
  const brief = humanizeSearchNotes(raw);
  if (brief.length >= 24) {
    return `口播超时了，先按检索到的资料说：${brief.slice(0, 280)}`;
  }
  return "回答超时，请再试一次。";
}

function deskContextText(history: ChatMessage[] | undefined, message: string): string {
  const lines: string[] = [];
  for (const item of history ?? []) {
    const text = item.content.replace(/\s+/g, " ").trim().slice(0, 1500);
    if (!text) {
      continue;
    }
    if (item.role === "system") {
      lines.push(text);
      continue;
    }
    if (item.role !== "user" && item.role !== "assistant") {
      continue;
    }
    lines.push(`${item.role === "user" ? "老师" : "星奈"}：${text}`);
  }
  const current = `老师：${message.replace(/\s+/g, " ").trim()}`;
  if (lines.at(-1) !== current) {
    lines.push(current);
  }
  return lines.join("\n");
}

function lastCanvasArguments(messages: LlmMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role !== "assistant" || !message.tool_calls) {
      continue;
    }
    const call = [...message.tool_calls].reverse().find((item) => item.function.name.startsWith("canvas_"));
    if (call) {
      return call.function.arguments;
    }
  }
  return "";
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
