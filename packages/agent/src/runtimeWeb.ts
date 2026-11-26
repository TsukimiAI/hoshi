import { addUsage, type AgentEvent, type ChatMessage, type LlmUsage } from "@hoshi/shared";
import { toLlmMessages, type LlmMessage } from "./llm/openai";
import { parseToolArgs } from "./plugins/parseTool";
import type { LlmTool, PluginHost } from "./plugins/types";
import { buildSearchSitesPrompt, parseSiteLines } from "./searchPrompt";
import { classifyDeskTurn, DESK_WEB_PROMPT } from "./retrieval/plan";
import { formatSearchActivity } from "./web/notes";
import { normalizeQueries } from "./web/merge";
import type { LlmClient } from "./runtime";
import { summarizeToolArgs, toolResultOk, withTimeout } from "./runtimeFormat";

export async function runDeskWeb(input: {
  message: string;
  history: ChatMessage[] | undefined;
  plugins: PluginHost;
  llm: LlmClient;
  tools: LlmTool[];
  web: boolean;
  webTools: boolean;
  referenceSites: string;
  sessionId?: string;
  signal?: AbortSignal;
  kbSummarize: boolean;
}): Promise<{
  webBody: string | null;
  webSearched: boolean;
  searchQuestion: string;
  events: AgentEvent[];
  usage?: LlmUsage;
  aborted: boolean;
}> {
  let searchQuestion = input.message.trim();
  let webBody: string | null = null;
  let webSearched = false;
  const events: AgentEvent[] = [];
  let usage: LlmUsage | undefined;
  let aborted = false;
  const webToolList = input.tools.filter(
    (tool) => tool.function.name === "web_search" || tool.function.name === "web_fetch"
  );
  if (!(input.web && input.webTools) || webToolList.length === 0) {
    return { webBody, webSearched, searchQuestion, events, usage, aborted };
  }
  const sitePrompt = buildSearchSitesPrompt(parseSiteLines(input.referenceSites));
  let pending: LlmMessage[] = [
    { role: "system", content: DESK_WEB_PROMPT },
    ...(sitePrompt ? [{ role: "system" as const, content: sitePrompt }] : []),
    ...toLlmMessages(input.history ?? []),
    { role: "user", content: input.message }
  ];
  const asked: string[] = [];
  const pieces: string[] = [];
  for (let round = 0; round < 6; round += 1) {
    if (input.signal?.aborted) {
      aborted = true;
      return { webBody, webSearched, searchQuestion, events, usage, aborted };
    }
    let complete: {
      content: string;
      toolCalls: Array<{ id: string; name: string; argumentsJson: string }>;
      usage?: LlmUsage;
    };
    try {
      complete = await withTimeout(
        input.llm.completeChat(pending, webToolList, {
          timeoutMs: 0,
          enableSearch: false,
          purpose: "tool",
          sessionId: input.sessionId
        }),
        0,
        "检索规划超时"
      );
    } catch {
      break;
    }
    if (complete.usage) {
      input.llm.noteUsage?.("tool", complete.usage, input.sessionId);
      usage = addUsage(usage, complete.usage);
    }
    const calls = complete.toolCalls.filter((call) => call.name === "web_search" || call.name === "web_fetch");
    if (calls.length === 0) {
      break;
    }
    const assistantToolCalls = calls.map((call) => ({
      id: call.id,
      type: "function" as const,
      function: { name: call.name, arguments: call.argumentsJson }
    }));
    pending = [...pending, { role: "assistant", content: complete.content || null, tool_calls: assistantToolCalls }];
    for (const call of calls) {
      if (input.signal?.aborted) {
        aborted = true;
        return { webBody, webSearched, searchQuestion, events, usage, aborted };
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
      events.push({
        event: "progress",
        data: { phase: "tool_start", name: call.name, detail: summarizeToolArgs(call.argumentsJson) }
      });
      const started = Date.now();
      const result = await withTimeout(
        input.plugins.execute(call.name, args),
        65000,
        `tool ${call.name} timeout`
      ).catch((error) => (error instanceof Error ? error.message : "tool failed"));
      const ok = toolResultOk(call.name, result);
      pieces.push(result.slice(0, ok ? 4000 : 800));
      events.push({
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
  if (!webSearched && classifyDeskTurn(input.message).kind !== "chitchat" && !input.kbSummarize) {
    const query = input.message.trim().slice(0, 200);
    if (query) {
      webSearched = true;
      asked.push(query);
      events.push({
        event: "progress",
        data: { phase: "tool_start", name: "web_search", detail: query }
      });
      const started = Date.now();
      const result = await withTimeout(
        input.plugins.execute("web_search", { queries: [query] }),
        65000,
        "tool web_search timeout"
      ).catch((error) => (error instanceof Error ? error.message : "tool failed"));
      pieces.push(result.slice(0, 4000));
      events.push({
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
  return { webBody, webSearched, searchQuestion, events, usage, aborted };
}
