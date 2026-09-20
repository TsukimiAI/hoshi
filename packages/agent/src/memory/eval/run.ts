import type { MemoryItem } from "@hoshi/shared";
import { planMemoryWrites, type MemoryWrite } from "../apply";
import { canExtractMemory, parseOpsJson, shouldExtract } from "../extract";
import { selectMemoriesForInject } from "../inject";
import { EVAL_CASES, type EvalCase, type ExpectWrite, type ExistingSeed } from "./cases";

export function toItems(seeds: ExistingSeed[] | undefined): MemoryItem[] {
  return (seeds ?? []).map((seed) => ({
    id: seed.id,
    text: seed.text,
    kind: seed.kind,
    topic: seed.topic ?? "",
    status: "active" as const,
    sourceSessionId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: seed.updatedAt ?? "2026-01-01T00:00:00.000Z",
    ackedAt: null
  }));
}

export function runGate(evalCase: EvalCase): boolean {
  return shouldExtract(evalCase.user) === evalCase.expectGate;
}

export function writeFits(actual: MemoryWrite, expected: ExpectWrite): boolean {
  if (actual.type !== expected.type) {
    return false;
  }
  if (expected.id && !("id" in actual && actual.id === expected.id)) {
    return false;
  }
  if (expected.topic && !("topic" in actual && actual.topic === expected.topic)) {
    return false;
  }
  if (expected.kind && actual.type === "insert" && actual.kind !== expected.kind) {
    return false;
  }
  return true;
}

export function writesMatch(actual: MemoryWrite[], expected: ExpectWrite[]): boolean {
  if (actual.length !== expected.length) {
    return false;
  }
  const used = new Set<number>();
  for (const item of expected) {
    const index = actual.findIndex((write, i) => !used.has(i) && writeFits(write, item));
    if (index < 0) {
      return false;
    }
    used.add(index);
  }
  return true;
}

export function runWrites(evalCase: EvalCase): { ok: boolean; writes: MemoryWrite[] } {
  const autoWrite = evalCase.autoWrite ?? true;
  if (!canExtractMemory(autoWrite, evalCase.user, evalCase.assistant)) {
    const writes: MemoryWrite[] = [];
    return { ok: writesMatch(writes, evalCase.expectWrites ?? []), writes };
  }
  const ops = parseOpsJson(JSON.stringify({ ops: evalCase.ops ?? [] }));
  const writes = planMemoryWrites(ops, toItems(evalCase.existing));
  return { ok: writesMatch(writes, evalCase.expectWrites ?? []), writes };
}

export function runInject(evalCase: EvalCase): { ok: boolean; ids: string[] } {
  const query = evalCase.injectQuery;
  if (query === undefined) {
    return { ok: true, ids: [] };
  }
  const ids = selectMemoriesForInject(toItems(evalCase.existing), query).map((item) => item.id);
  const need = evalCase.expectInjectIds ?? [];
  const ban = evalCase.expectInjectExcludeIds ?? [];
  const hit = need.every((id) => ids.includes(id));
  const clean = ban.every((id) => !ids.includes(id));
  return { ok: hit && clean && ids.length === need.length, ids };
}

export interface EvalScores {
  gate_acc: number;
  write_acc: number;
  inject_p: number;
  inject_r: number;
  gate_n: number;
  write_n: number;
  inject_n: number;
}

export function scoreAll(cases: EvalCase[] = EVAL_CASES): EvalScores {
  let gateOk = 0;
  const gateN = cases.length;
  let writeOk = 0;
  let writeN = 0;
  let injectTp = 0;
  let injectPred = 0;
  let injectGold = 0;
  let injectN = 0;

  for (const evalCase of cases) {
    if (runGate(evalCase)) {
      gateOk += 1;
    }
    if (evalCase.expectWrites !== undefined) {
      writeN += 1;
      if (runWrites(evalCase).ok) {
        writeOk += 1;
      }
    }
    if (evalCase.injectQuery !== undefined) {
      injectN += 1;
      const { ids } = runInject(evalCase);
      const need = new Set(evalCase.expectInjectIds ?? []);
      const pred = new Set(ids);
      injectGold += need.size;
      injectPred += pred.size;
      for (const id of pred) {
        if (need.has(id)) {
          injectTp += 1;
        }
      }
    }
  }

  return {
    gate_acc: gateN ? gateOk / gateN : 1,
    write_acc: writeN ? writeOk / writeN : 1,
    inject_p: injectPred ? injectTp / injectPred : 1,
    inject_r: injectGold ? injectTp / injectGold : 1,
    gate_n: gateN,
    write_n: writeN,
    inject_n: injectN
  };
}
