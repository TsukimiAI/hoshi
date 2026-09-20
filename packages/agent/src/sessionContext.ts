import type { ChatMessage, ChatSettings, LlmUsage } from "@hoshi/shared";
import type { OpenAiCompatClient } from "./llm/openai";
import { estimateTokenCount, SessionRepo } from "./storage/sessionRepo";

const RECENT_RATIO = 0.7;
const SUMMARY_RATIO = 0.3;
const MAX_SUMMARY_CHARS = 3200;

export function sliceCompactSummary(prev: string, lines: string[]): string {
  const merged = [prev.trim(), lines.join("\n").trim()].filter(Boolean).join("\n");
  if (merged.length <= MAX_SUMMARY_CHARS) {
    return merged;
  }
  return merged.slice(merged.length - MAX_SUMMARY_CHARS);
}

export async function llmCompactSummary(
  llm: OpenAiCompatClient,
  prev: string,
  lines: string[],
  sessionId?: string
): Promise<{ text: string; usage?: LlmUsage }> {
  const fallback = sliceCompactSummary(prev, lines);
  try {
    const result = await llm.completeChat(
      [
        {
          role: "system",
          content:
            "把对话压成第三人称要点摘要，保留约定、称呼、老师偏好与未完成事项。不要发挥、不要对话体。不超过800字。"
        },
        {
          role: "user",
          content: `旧摘要：\n${prev.trim() || "（无）"}\n\n新对话：\n${lines.join("\n")}`
        }
      ],
      [],
      { enableSearch: false, timeoutMs: 20000, purpose: "compact", sessionId }
    );
    const text = result.content.replace(/\s+/g, " ").trim();
    if (!text) {
      return { text: fallback };
    }
    return {
      text: text.length > MAX_SUMMARY_CHARS ? text.slice(0, MAX_SUMMARY_CHARS) : text,
      usage: result.usage
    };
  } catch {
    return { text: fallback };
  }
}

export interface SessionContext {
  history: ChatMessage[];
  compactUsage?: LlmUsage;
}

export async function buildSessionContext(
  repo: SessionRepo,
  sessionId: string,
  chat: ChatSettings,
  llm: OpenAiCompatClient
): Promise<SessionContext> {
  const session = await repo.getSession(sessionId);
  if (!session) {
    throw new Error("session not found");
  }
  const stats = await repo.getSessionStats(sessionId);
  const allMessages = await repo.listMessages(sessionId, 400);
  const summaryTokenBudget = Math.floor(chat.contextBudget * SUMMARY_RATIO);
  const recentTokenBudget = Math.floor(chat.contextBudget * RECENT_RATIO);
  const summaryTokens = estimateTokenCount(session.summaryText);
  const shouldCompact =
    stats.messageCount > chat.compactTriggerMsgCount ||
    stats.tokenEstimateSum > chat.compactTriggerToken ||
    summaryTokens + allMessages.reduce((sum, msg) => sum + msg.tokenEstimate, 0) > chat.contextBudget;

  let compactUsage: LlmUsage | undefined;
  let triedCompact = false;
  if (shouldCompact && allMessages.length > chat.compactKeepRecent) {
    triedCompact = true;
    const compactable = allMessages.slice(0, allMessages.length - chat.compactKeepRecent);
    const keep = allMessages.slice(allMessages.length - chat.compactKeepRecent);
    const compactLines = compactable.map((message) => {
      const text = message.content.replace(/\s+/g, " ").trim().slice(0, 140);
      return `${message.role}: ${text}`;
    });
    const compactResult = await llmCompactSummary(llm, session.summaryText, compactLines, sessionId);
    const nextSummary = compactResult.text;
    compactUsage = compactResult.usage;
    const nextVersion = session.summaryVersion + 1;
    const compacted = await repo.compactSession({
      sessionId,
      summaryText: nextSummary,
      summaryVersion: nextVersion,
      expectedVersion: session.summaryVersion,
      deleteMessageIds: compactable.map((item) => item.id),
      beforeMessageCount: allMessages.length,
      afterMessageCount: keep.length,
      compressedTokenEstimate: compactable.reduce((sum, msg) => sum + msg.tokenEstimate, 0),
      firstCompactedMessageId: compactable[0]?.id ?? null,
      lastCompactedMessageId: compactable[compactable.length - 1]?.id ?? null
    });
    if (!compacted) {
      compactUsage = undefined;
    }
  }

  const freshSession = triedCompact ? await repo.getSession(sessionId) : session;
  const summaryText = freshSession?.summaryText ?? session.summaryText;
  const summaryMessage =
    summaryText && estimateTokenCount(summaryText) <= summaryTokenBudget
      ? [{ role: "system" as const, content: `会话摘要：\n${summaryText}` }]
      : [];
  const recentMessages = await repo.listMessages(sessionId, 240);
  const chosen = [];
  let used = 0;
  for (let i = recentMessages.length - 1; i >= 0; i -= 1) {
    const item = recentMessages[i];
    if (used + item.tokenEstimate > recentTokenBudget) {
      break;
    }
    used += item.tokenEstimate;
    chosen.push(item);
  }
  chosen.reverse();
  return {
    history: [...summaryMessage, ...SessionRepo.toPromptHistory(chosen)],
    compactUsage
  };
}
