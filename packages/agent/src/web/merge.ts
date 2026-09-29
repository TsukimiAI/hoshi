import type { WebHit } from "./types";

export function normalizeQueries(args: Record<string, unknown>): string[] | string {
  const raw: string[] = [];
  if (typeof args.query === "string" && args.query.trim()) {
    raw.push(args.query.trim());
  }
  if (Array.isArray(args.queries)) {
    for (const item of args.queries) {
      if (typeof item === "string" && item.trim()) {
        raw.push(item.trim());
      }
    }
  }
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const query of raw) {
    if (seen.has(query)) {
      continue;
    }
    seen.add(query);
    unique.push(query);
    if (unique.length >= 4) {
      break;
    }
  }
  if (unique.length === 0) {
    return "需要 1 到 4 条查询";
  }
  return unique;
}

export function mergeHitsByUrl(groups: WebHit[][], limit = 8): WebHit[] {
  const out: WebHit[] = [];
  const seen = new Set<string>();
  let index = 0;
  let progressed = true;
  while (out.length < limit && progressed) {
    progressed = false;
    for (const group of groups) {
      if (index >= group.length) {
        continue;
      }
      progressed = true;
      const hit = group[index];
      const key = hit.url.trim();
      if (!key || seen.has(key)) {
        continue;
      }
      seen.add(key);
      out.push(hit);
      if (out.length >= limit) {
        return out;
      }
    }
    index += 1;
  }
  return out;
}
