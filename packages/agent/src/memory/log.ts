import type { MemoryWrite } from "./apply";

export type MemoryChatExtract = "pending" | "skip";
export type MemoryWriteKind = "none" | "insert" | "update" | "supersede" | "mixed" | "error";

export type MemoryTurnPayload =
  | {
      phase: "chat";
      sessionId: string;
      turnId: string;
      inject: number;
      ack: number;
      extract: MemoryChatExtract;
      ms: number;
    }
  | {
      phase: "extract";
      sessionId: string;
      turnId: string;
      write: MemoryWriteKind;
      n: number;
      ms: number;
    };

export function summarizeWrites(writes: MemoryWrite[]): Exclude<MemoryWriteKind, "error"> {
  if (writes.length === 0) {
    return "none";
  }
  const types = new Set(writes.map((item) => item.type));
  if (types.size > 1) {
    return "mixed";
  }
  const only = writes[0]?.type;
  if (only === "insert" || only === "update" || only === "supersede") {
    return only;
  }
  return "none";
}

export function logMemoryTurn(payload: MemoryTurnPayload): void {
  console.error(JSON.stringify({ src: "hoshi.memory", ...payload }));
}
