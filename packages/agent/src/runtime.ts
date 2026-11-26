import type {
  AgentEvent,
  ChatMessage,
  ChatRequestBody,
  LlmUsage,
  UsagePurpose
} from "@hoshi/shared";
import { addUsage, imageOnlyUserText, isImageOnlyUserText } from "@hoshi/shared";
import { toLlmMessages, isAbortTimeout, type LlmCallOptions, type LlmMessage, type StreamChatPart } from "./llm/openai";
import { historyWithLookback, type ChatImagePayload } from "./chatImages";
import { PET_SCREEN_FOLLOW_NOTE, PET_SCREEN_SYSTEM_NOTE, userContentWithScreen, type PetTurnScreen } from "./petScreen/content";
import type { PersonaConfig } from "./persona";
import { parseToolArgs } from "./plugins/parseTool";
import type { LlmTool, PluginHost } from "./plugins/types";
import { buildMemoryAckPrompt, buildMemoryInjectPrompt, type MemoryInjectLine } from "./memory/inject";
import { buildSearchSitesPrompt, parseSiteLines, EMOTION_USAGE_PROMPT, PET_ANSWER_PROMPT } from "./searchPrompt";
import { buildDeskCanvasGuide, buildIntegratePrompt, classifyDeskTurn, imageTurnRetrieval, knowledgeHitLooksEmpty, knowledgeRoute, looksLikeLocalKnowledgeQuery, type DeskCanvasChoice } from "./retrieval/plan";
import { updateCanvasTurn } from "./canvas/tool";
import { runDeskWeb } from "./runtimeWeb";
import { chooseDeskForm, emitText, reviewCanvas, streamSentences } from "./runtimeSpeak";
import {
  deskContextText,
  doneEvent,
  knowledgeExcerptFits,
  lastCanvasArguments,
  summarizeToolArgs,
  timeoutSpeakFallback,
  toolResultOk,
  withTimeout
} from "./runtimeFormat";
import { formatSearchActivity, humanizeSearchNotes, looksLikeReadableProse } from "./web/notes";
import { stripFetchPrefix } from "./web/deskRetrieve";

export type { PluginHost } from "./plugins/types";

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
    const glance = Boolean(extra?.glanceInterval);
    const wantsLocalFile =
      !desk &&
      tools.some((tool) => tool.function.name.startsWith("mcp_")) &&
      /\.txt|\.md|\.json|\.csv|这个文件|本地文件/.test(message);
    const petCanSearch = wantsLocalFile || glance
      ? false
      : imageRetrieval
        ? !desk && imageRetrieval.web && webTools
        : !visualOnly && !desk && !chitchat && !noteQuestion && webTools;
    const web = wantsLocalFile || glance
      ? false
      : imageRetrieval
      ? imageRetrieval.web && webTools
      : visualOnly
        ? false
        : desk
          ? message.trim().length > 0 && webTools
          : !chitchat && !noteQuestion;
    const kbWanted = glance
      ? false
      : imageRetrieval
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
    if (!desk && !noteQuestion) {
      modelTools = modelTools.filter((tool) => tool.function.name !== "list_knowledge");
    }
    if (glance) {
      modelTools = modelTools.filter((tool) => {
        const name = tool.function.name;
        return name !== "list_knowledge" && name !== "web_search" && name !== "web_fetch";
      });
    }
    let canvasChoice: DeskCanvasChoice = { canvas: desk && message.trim().length > 0, images: false, form: "note" };

    yield { event: "progress", data: { phase: "think" } };
    const thinkStarted = Date.now();

    let kbBody: string | null = null;
    let webBody: string | null = null;
    let webSearched = false;
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
        const context = [...(body.history ?? []).slice(-4).map((item) => item.content), message]
          .join("\n")
          .trim();
        kbBody = !desk && !noteQuestion && !knowledgeExcerptFits(context, raw) ? null : raw;
      }
    };
    if (desk && this.config.plugins) {
      const webRun = await runDeskWeb({
        message,
        history: body.history,
        plugins: this.config.plugins,
        llm: this.config.llm,
        tools,
        web,
        webTools,
        referenceSites: this.referenceSites,
        sessionId,
        signal: extra?.signal,
        kbSummarize: kbRoute.kind === "summarize"
      });
      webBody = webRun.webBody;
      webSearched = webRun.webSearched;
      searchQuestion = webRun.searchQuestion;
      if (webRun.usage) {
        turnUsage = addUsage(turnUsage, webRun.usage);
      }
      if (webRun.aborted || extra?.signal?.aborted) {
        return;
      }
      for (const event of webRun.events) {
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
    if (!desk && kbEnabled && noteQuestion) {
      promptMessages.push({
        role: "system",
        content:
          "老师问知识库有哪些文件、笔记叫什么、上传过什么时，调用 list_knowledge。不要编造未列出的文件。正文检索由系统完成，禁止再调用 search_knowledge。"
      });
    }
    const mcpNames = modelTools
      .map((tool) => tool.function.name)
      .filter((name) => name.startsWith("mcp_"));
    if (!desk && mcpNames.length > 0) {
      promptMessages.push({
        role: "system",
        content: `已接入本机 MCP，可以直接调用，不需要老师再允许：${mcpNames.join("、")}。老师要读本地文件或目录时立刻调用对应工具，不要说自己读不了，不要向老师要权限，也不要让老师把正文贴过来。只访问这些工具允许的目录。`
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
      const chosen = await chooseDeskForm(this.config.llm, deskContext, searchQuestion, webBody ?? kbBody ?? "", sessionId);
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
    let mcpToolResult = "";
    if (modelTools.length > 0) {
      try {
        let pending: LlmMessage[] = messages;
        let canvasFailed = false;
        let canvasFailDetail = "";
        const maxRounds = desk ? 2 : 2;
        let mcpReadRetry = false;
        for (let round = 0; round < maxRounds; round += 1) {
          if (!desk && round > 0 && !canvasFailed && !mcpReadRetry) {
            break;
          }
          mcpReadRetry = false;
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
            if (
              !desk &&
              round === 0 &&
              mcpNames.length > 0 &&
              wantsLocalFile &&
              (complete.content ?? "").trim()
            ) {
              pending = [
                ...pending,
                { role: "assistant", content: complete.content },
                {
                  role: "system",
                  content: "MCP 已启用。直接调用对应工具读取文件。"
                }
              ];
              mcpReadRetry = true;
              continue;
            }
            if ((complete.content ?? "").trim() && body.workspace !== "desk") {
              const mustSearch =
                petCanSearch && !webSearched && classifyDeskTurn(message).kind === "live";
              if (!mustSearch) {
                yield {
                  event: "progress",
                  data: { phase: "think_done", elapsedMs: Date.now() - thinkStarted }
                };
                yield* emitText(this.config.persona, complete.content);
                yield doneEvent(turnUsage);
                return;
              }
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
            if (!desk && call.name.startsWith("mcp_") && result.trim()) {
              mcpToolResult = [mcpToolResult, result].filter(Boolean).join("\n").slice(0, 8000);
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
    if (
      !desk &&
      petCanSearch &&
      !webSearched &&
      classifyDeskTurn(message).kind === "live" &&
      this.config.plugins
    ) {
      const query = message.trim().slice(0, 200);
      if (query) {
        webSearched = true;
        yield {
          event: "progress",
          data: { phase: "tool_start", name: "web_search", detail: query }
        };
        const started = Date.now();
        const result = await withTimeout(
          this.config.plugins.execute("web_search", { queries: [query] }),
          65000,
          "tool web_search timeout"
        ).catch((error) => (error instanceof Error ? error.message : "tool failed"));
        const ok = toolResultOk("web_search", result);
        if (ok) {
          const note = humanizeSearchNotes(result) || result.slice(0, 4000);
          if (note.trim()) {
            webBody = [webBody, note].filter(Boolean).join("\n").slice(0, 8000);
          }
        }
        yield {
          event: "progress",
          data: {
            phase: "tool_done",
            name: "web_search",
            detail: formatSearchActivity(result),
            ok,
            elapsedMs: Date.now() - started
          }
        };
      }
    }
    if (desk && canvasPlaced && this.config.plugins) {
      const review = await reviewCanvas(this.config.llm, {
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
      if (!desk && mcpToolResult) {
        try {
          const follow = await withTimeout(
            this.config.llm.completeChat(
              [
                ...speakMessages,
                {
                  role: "system",
                  content: `用中文完整句子回答。工具结果如下，按结果说，不要说老师禁止调用工具，也不要让老师把正文贴过来。\n${mcpToolResult}`
                }
              ],
              [],
              { timeoutMs: 18000, enableSearch: false, purpose: "chat", sessionId }
            ),
            20000,
            "补答超时"
          );
          if (follow.usage) {
            this.config.llm.noteUsage?.("chat", follow.usage, sessionId);
            turnUsage = addUsage(turnUsage, follow.usage);
          }
          const text = (follow.content ?? "").trim();
          if (text) {
            for await (const event of emitText(this.config.persona, text)) {
              spoke += 1;
              yield event;
            }
          }
        } catch {
          /* 再用口播 */
        }
      }
      if (spoke === 0) {
        for await (const event of streamSentences(this.config.llm, this.config.persona, 
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
      }
      if (extra?.signal?.aborted) {
        return;
      }
      if (spoke === 0 && !(desk && canvasPlaced) && !mcpToolResult) {
        try {
          const rescueMessages = [
            ...speakMessages,
            {
              role: "system" as const,
              content: "用中文完整句子回答老师刚才的问题。"
            }
          ];
          const rescue = await withTimeout(
            this.config.llm.completeChat(rescueMessages, [], {
              timeoutMs: desk ? 45000 : 18000,
              enableSearch: false,
              purpose: "chat",
              sessionId
            }),
            desk ? 50000 : 20000,
            "补答超时"
          );
          if (rescue.usage) {
            this.config.llm.noteUsage?.("chat", rescue.usage, sessionId);
            turnUsage = addUsage(turnUsage, rescue.usage);
          }
          const text = (rescue.content ?? "").trim();
          if (text) {
            for await (const event of emitText(this.config.persona, text)) {
              spoke += 1;
              yield event;
            }
          }
        } catch {
          /* 再用下面的兜底句 */
        }
      }
      if (spoke === 0) {
        const fallback = mcpToolResult
          ? mcpToolResult.replace(/\s+/g, " ").trim().slice(0, 400)
          : webBody
            ? timeoutSpeakFallback(webBody)
            : desk && canvasPlaced
              ? "画布已经更新好了，可以直接看卡片。"
              : web && !webBody
                ? "这次网页检索没有拿到可用资料。你可以稍后再问。"
                : "我这边没有生成成句回复，请再试一次。";
        for await (const event of emitText(this.config.persona, fallback)) {
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
          for await (const event of emitText(this.config.persona, text)) {
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

}
