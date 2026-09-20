export type MemoryKind = "identity" | "preference" | "habit" | "agreement" | "other";
export type MemoryStatus = "active" | "superseded";

export const MEMORY_KINDS: MemoryKind[] = [
  "identity",
  "preference",
  "habit",
  "agreement",
  "other"
];

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
}

export interface MemoryListResponse {
  memories: MemoryItem[];
}

export function isMemoryKind(value: unknown): value is MemoryKind {
  return typeof value === "string" && (MEMORY_KINDS as string[]).includes(value);
}
