import type { ChatMessageRole, LlmUsage } from "./sse";
import type { Emotion } from "./emotion";

export const DEFAULT_SESSION_TITLE = "新会话";
export const SESSION_TITLE_MAX_LEN = 48;

export function sessionTitleFromUserMessage(message: string): string {
  return message.replace(/\s+/g, " ").trim().slice(0, SESSION_TITLE_MAX_LEN);
}

export interface SessionItem {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
  summaryVersion: number;
}

export interface SessionMessage {
  id: string;
  sessionId: string;
  role: ChatMessageRole;
  content: string;
  emotion: Emotion | null;
  createdAt: string;
  tokenEstimate: number;
  usage?: LlmUsage;
}

export interface SessionListResponse {
  sessions: SessionItem[];
}

export interface SessionMessagesResponse {
  session: SessionItem;
  messages: SessionMessage[];
}

export type UsagePurpose = "chat" | "tool" | "compact" | "extract" | "asr";

export const USAGE_PURPOSES: UsagePurpose[] = ["chat", "tool", "compact", "extract", "asr"];

export interface UsageTotals {
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  totalTokens: number;
  turns: number;
}

export interface SessionUsageItem {
  sessionId: string;
  title: string;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  totalTokens: number;
  turns: number;
}

export interface UsageSummaryResponse {
  all: UsageTotals;
  today: UsageTotals;
  byPurpose: Record<UsagePurpose, { all: UsageTotals; today: UsageTotals }>;
  sessions: SessionUsageItem[];
}
