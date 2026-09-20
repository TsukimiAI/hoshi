import type { MemoryItem, MemoryKind } from "@hoshi/shared";
import { isDuplicateFact, type MemoryOp } from "./extract";

export type MemoryWrite =
  | { type: "insert"; text: string; kind: MemoryKind; topic: string }
  | { type: "update"; id: string; text: string; topic: string }
  | { type: "supersede"; id: string };

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

function resolvedTopic(item: { topic: string; text: string }): string {
  return item.topic || inferTopic(item.text);
}

function findByTopic(
  active: MemoryItem[],
  kind: MemoryKind,
  topic: string
): MemoryItem | undefined {
  if (!topic) {
    return undefined;
  }
  return active.find(
    (item) => item.status === "active" && item.kind === kind && resolvedTopic(item) === topic
  );
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

export function planMemoryWrites(ops: MemoryOp[], active: MemoryItem[]): MemoryWrite[] {
  const current = active.filter((item) => item.status === "active").map((item) => ({ ...item }));
  const writes: MemoryWrite[] = [];

  for (const op of ops) {
    const topic = inferTopic(op.text) || op.topic;
    if (op.action === "retract") {
      const hit = findByTopic(current, op.kind, topic) ?? findOverlap(current, op.text);
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

    const byTopic = findByTopic(current, op.kind, topic);
    const same = byTopic ?? findOverlap(current, op.text, op.kind);
    if (same) {
      const nextTopic = topic || same.topic || inferTopic(same.text);
      if (same.text === op.text && resolvedTopic(same) === nextTopic) {
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
