import type { MemoryItem, MemoryMeta } from "@hoshi/shared";
import { memoryFactKey, normalizeMemoryText } from "./extract";

export const MEMORY_INJECT_MAX = 12;
export const MEMORY_INJECT_MAX_CHARS = 960;
export const MEMORY_CORE_MAX = 6;
export const MEMORY_CORE_IDENTITY_MAX = 3;
export const MEMORY_CORE_AGREEMENT_MAX = 3;
export const MEMORY_ARCHIVE_MAX = 6;
export const MEMORY_ARCHIVE_MIN_SCORE = 0.4;
export const MEMORY_ARCHIVE_SCORE_MARGIN = 0.07;
export const MEMORY_INJECT_LINE_MAX = 160;
export const MEMORY_QUERY_EMBED_TIMEOUT_MS = 4000;

const ARCHIVE_KINDS = new Set(["preference", "habit", "other"]);

export interface MemoryArchiveHit {
  id: string;
  score: number;
}

function byUpdatedDesc(a: MemoryItem, b: MemoryItem): number {
  return b.updatedAt.localeCompare(a.updatedAt);
}

function byNameThenUpdated(a: MemoryItem, b: MemoryItem): number {
  const an = a.topic === "name" ? 1 : 0;
  const bn = b.topic === "name" ? 1 : 0;
  if (an !== bn) {
    return bn - an;
  }
  return byUpdatedDesc(a, b);
}

function pickCoreKind(items: MemoryItem[], kind: "identity" | "agreement", max: number): MemoryItem[] {
  return items
    .filter((item) => item.status === "active" && item.kind === kind)
    .sort(byNameThenUpdated)
    .slice(0, max);
}

export function selectCoreMemories(items: MemoryItem[]): MemoryItem[] {
  return [...pickCoreKind(items, "identity", MEMORY_CORE_IDENTITY_MAX), ...pickCoreKind(items, "agreement", MEMORY_CORE_AGREEMENT_MAX)].slice(
    0,
    MEMORY_CORE_MAX
  );
}

export function selectArchiveMemories(items: MemoryItem[], hits: MemoryArchiveHit[]): MemoryItem[] {
  const byId = new Map(items.filter((item) => item.status === "active").map((item) => [item.id, item]));
  const ranked = [...hits].sort((a, b) => b.score - a.score);
  const picked: MemoryItem[] = [];
  const used = new Set<string>();
  const best = ranked.find((hit) => {
    const item = byId.get(hit.id);
    return item && ARCHIVE_KINDS.has(item.kind) && hit.score >= MEMORY_ARCHIVE_MIN_SCORE;
  })?.score;
  for (const hit of ranked) {
    if (hit.score < MEMORY_ARCHIVE_MIN_SCORE) {
      continue;
    }
    if (best !== undefined && hit.score <= best - MEMORY_ARCHIVE_SCORE_MARGIN) {
      continue;
    }
    const item = byId.get(hit.id);
    if (!item || used.has(item.id) || !ARCHIVE_KINDS.has(item.kind)) {
      continue;
    }
    used.add(item.id);
    picked.push(item);
    if (picked.length >= MEMORY_ARCHIVE_MAX) {
      break;
    }
  }
  return picked;
}

export function selectMemoriesForInject(
  items: MemoryItem[],
  _userText?: string,
  archiveHits?: MemoryArchiveHit[]
): MemoryItem[] {
  const core = selectCoreMemories(items);
  const used = new Set(core.map((item) => item.id));
  const archive = selectArchiveMemories(items, archiveHits ?? []).filter((item) => !used.has(item.id));
  return [...core, ...archive].slice(0, MEMORY_INJECT_MAX);
}

export function clipMemoryLine(text: string, max = MEMORY_INJECT_LINE_MAX): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, max - 1)}…`;
}

export type MemoryInjectLine = string | { text: string; meta?: MemoryMeta | null };

function injectParts(items: MemoryInjectLine[]): { personal: string[]; notes: string[] } {
  const personal: string[] = [];
  const notes: string[] = [];
  let used = 0;
  for (const raw of items) {
    if (personal.length + notes.length >= MEMORY_INJECT_MAX) {
      break;
    }
    const rec = typeof raw === "string" ? { text: raw, knowledge: false } : { text: raw.text, knowledge: raw.meta?.source === "knowledge" };
    const text = clipMemoryLine(rec.text);
    if (!text) {
      continue;
    }
    if (used + text.length > MEMORY_INJECT_MAX_CHARS) {
      break;
    }
    used += text.length;
    (rec.knowledge ? notes : personal).push(text);
  }
  return { personal, notes };
}

function section(title: string, lines: string[]): string | null {
  if (lines.length === 0) {
    return null;
  }
  return `${title}\n${lines.map((line) => `- ${line}`).join("\n")}`;
}

export function buildMemoryInjectPrompt(items: MemoryInjectLine[]): string | null {
  const { personal, notes } = injectParts(items);
  const blocks = [section("关于老师的长期记忆：", personal), section("老师摘录的笔记，不是老师本人的话：", notes)].filter(
    (item): item is string => Boolean(item)
  );
  return blocks.length > 0 ? blocks.join("\n") : null;
}

const ACK_TONE = /记|叫|喜欢|习惯/;
const ACK_NAME_SHORT = 12;

function isNameMemory(text: string): boolean {
  return /叫|名字|称呼/.test(text);
}

export function mentionsMemory(reply: string, memoryText: string): boolean {
  const spoken = normalizeMemoryText(reply);
  if (!spoken) {
    return false;
  }
  const key = memoryFactKey(memoryText);
  if (!key || !spoken.includes(key)) {
    return false;
  }
  if (isNameMemory(memoryText)) {
    return spoken.length <= ACK_NAME_SHORT || ACK_TONE.test(spoken);
  }
  return key.length >= 2 && ACK_TONE.test(spoken);
}

export function selectAckedMemoryIds(reply: string, items: Array<{ id: string; text: string }>): string[] {
  return items.filter((item) => mentionsMemory(reply, item.text)).map((item) => item.id);
}

export function buildMemoryAckPrompt(texts: string[]): string | null {
  const lines = texts.map((item) => item.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 2);
  if (lines.length === 0) {
    return null;
  }
  return `若合适，用一句星奈口吻带过已记住，不要列清单：\n${lines.map((line) => `- ${line}`).join("\n")}`;
}
