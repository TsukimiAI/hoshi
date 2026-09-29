export type MemoryKind = "identity" | "preference" | "habit" | "agreement" | "other";
export type MemoryStatus = "active" | "superseded";

export const MEMORY_KINDS: MemoryKind[] = [
  "identity",
  "preference",
  "habit",
  "agreement",
  "other"
];

export interface MemoryMeta {
  /** 摘录来源类型；目前仅知识库摘录会带 meta。 */
  source?: "knowledge";
  chunkId?: string;
  documentId?: string;
  documentTitle?: string;
  collectionId?: string;
}

export interface MemoryItem {
  id: string;
  text: string;
  kind: MemoryKind;
  topic: string;
  status: MemoryStatus;
  sourceSessionId: string | null;
  createdAt: string;
  updatedAt: string;
  ackedAt: string | null;
  meta?: MemoryMeta | null;
}

export interface MemoryListResponse {
  memories: MemoryItem[];
}

export function isMemoryKind(value: unknown): value is MemoryKind {
  return typeof value === "string" && (MEMORY_KINDS as string[]).includes(value);
}
