import type { MemoryItem, MemoryKind } from "@hoshi/shared";
import { isDuplicateFact, sharesFactEntity, type MemoryOp } from "./extract";

export type MemoryWrite =
  | { type: "insert"; text: string; kind: MemoryKind; topic: string }
  | { type: "update"; id: string; text: string; topic: string }
  | { type: "supersede"; id: string };

export const MEMORY_NEAR_DUP_SCORE = 0.86;

const TOPIC_BUCKETS: Array<{ topic: string; keys: string[] }> = [
  { topic: "name", keys: ["叫我", "叫做", "名叫", "名字", "称呼"] },
  { topic: "drink", keys: ["喝", "茶", "咖啡", "奶"] },
  { topic: "job", keys: ["工作是", "上班", "职业", "后端", "研究生"] },
  { topic: "schedule", keys: ["加班", "作息", "晚上写", "周末"] }
];

export function inferTopic(text: string): string {
  for (const bucket of TOPIC_BUCKETS) {
    if (bucket.keys.some((key) => text.includes(key))) {
      return bucket.topic;
    }
  }
  return "";
}

function resolvedTopic(op: { topic: string; text: string }): string {
  return op.topic || inferTopic(op.text);
}

export interface MemorySimilarHit {
  id: string;
  score: number;
}

function findById(active: MemoryItem[], id: string | undefined): MemoryItem | undefined {
  if (!id) {
    return undefined;
  }
  return active.find((item) => item.status === "active" && item.id === id);
}

function findOverlap(active: MemoryItem[], text: string, kind?: MemoryKind): MemoryItem | undefined {
  return active.find((item) => {
    if (item.status !== "active") {
      return false;
    }
    if (kind && item.kind !== kind) {
      return false;
    }
    return isDuplicateFact(text, [item.text]);
  });
}

function isPreferenceRevision(text: string): boolean {
  return /不喝|不再|改|现在/.test(text);
}

function findEntityTwin(
  active: MemoryItem[],
  text: string,
  kind: MemoryKind,
  topic: string
): MemoryItem | undefined {
  const nameId = kind === "identity" && topic === "name";
  if (kind === "preference") {
    if (!topic || !isPreferenceRevision(text)) {
      return undefined;
    }
  } else if (!nameId) {
    return undefined;
  }
  return active.find((item) => {
    if (item.status !== "active" || item.kind !== kind) {
      return false;
    }
    const itemTopic = item.topic || inferTopic(item.text);
    if (itemTopic !== topic) {
      return false;
    }
    return sharesFactEntity(text, item.text, nameId);
  });
}

function findNearDup(
  active: MemoryItem[],
  hits: MemorySimilarHit[] | undefined,
  kind?: MemoryKind
): MemoryItem | undefined {
  if (!hits || hits.length === 0) {
    return undefined;
  }
  const ranked = [...hits].sort((a, b) => b.score - a.score);
  for (const hit of ranked) {
    if (hit.score < MEMORY_NEAR_DUP_SCORE) {
      continue;
    }
    const item = findById(active, hit.id);
    if (!item) {
      continue;
    }
    if (kind && item.kind !== kind) {
      continue;
    }
    return item;
  }
  return undefined;
}

export function planMemoryWrites(
  ops: MemoryOp[],
  active: MemoryItem[],
  similar?: Map<string, MemorySimilarHit[]>
): MemoryWrite[] {
  const current = active.filter((item) => item.status === "active").map((item) => ({ ...item }));
  const writes: MemoryWrite[] = [];

  for (const op of ops) {
    const topic = resolvedTopic(op);
    const neighbors = similar?.get(op.text);
    if (op.action === "retract") {
      const hit =
        findById(current, op.id) ?? findNearDup(current, neighbors, op.kind) ?? findOverlap(current, op.text);
      if (!hit) {
        continue;
      }
      writes.push({ type: "supersede", id: hit.id });
      const idx = current.findIndex((item) => item.id === hit.id);
      if (idx >= 0) {
        current.splice(idx, 1);
      }
      continue;
    }

    const same =
      findById(current, op.id) ??
      findNearDup(current, neighbors, op.kind) ??
      findOverlap(current, op.text, op.kind) ??
      findEntityTwin(current, op.text, op.kind, topic);
    if (same) {
      const nextTopic = topic || same.topic || inferTopic(same.text);
      if (same.text === op.text && (same.topic || inferTopic(same.text)) === nextTopic) {
        continue;
      }
      writes.push({ type: "update", id: same.id, text: op.text, topic: nextTopic });
      same.text = op.text;
      same.topic = nextTopic;
      continue;
    }
    writes.push({ type: "insert", text: op.text, kind: op.kind, topic });
    current.push({
      id: `pending:${writes.length}`,
      text: op.text,
      kind: op.kind,
      topic,
      status: "active",
      sourceSessionId: null,
      createdAt: "",
      updatedAt: "",
      ackedAt: null
    });
  }
  return writes;
}
