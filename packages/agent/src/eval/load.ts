import { readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  InjectDataset,
  KbCorpus,
  KbQrels,
  RouterDataset
} from "./types";

function readJson<T>(file: string): T {
  const raw = readFileSync(join(__dirname, "datasets", file), "utf8");
  return JSON.parse(raw) as T;
}

export function loadRouterDataset(): RouterDataset {
  return readJson<RouterDataset>("router.json");
}

export function loadInjectDataset(): InjectDataset {
  return readJson<InjectDataset>("memory-inject-paraphrase.json");
}

export function loadKbCorpus(): KbCorpus {
  return readJson<KbCorpus>("kb-corpus.json");
}

export function loadKbQrels(): KbQrels {
  return readJson<KbQrels>("kb-qrels.json");
}
