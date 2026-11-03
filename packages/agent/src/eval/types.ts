export type EvalTier = "offline" | "live";

export type KnowledgeRouteKind = "skip" | "lookup" | "summarize";

export type DeskTurnKind =
  | "live"
  | "compare"
  | "person"
  | "work"
  | "concept"
  | "chitchat"
  | "followup"
  | "note";

export type ScoreKind = "code" | "model";

export interface DatasetMeta {
  name: string;
  version: string;
  n: number;
}

export interface MetricScore {
  value: number;
  n: number;
  kind: ScoreKind;
  skipped?: string;
}

export interface FailureRow {
  id: string;
  metric: string;
  reason: string;
}

export interface SearchPin {
  topK: number;
  queryRewrite: "off";
  rerank: false;
  embeddingModel: string;
}

export interface ExperimentRecord {
  experimentId: string;
  createdAt: string;
  tier: EvalTier;
  datasets: DatasetMeta[];
  embeddingModel?: string;
  chatModel?: string;
  search: SearchPin;
  metrics: Record<string, MetricScore>;
  failures: FailureRow[];
}

export interface BaselineFile {
  datasets: Record<string, string>;
  embeddingModel: string;
  chatModel: string;
  metrics: Record<string, number>;
}

export interface RouterCase {
  id: string;
  text: string;
  web: boolean;
  kb: KnowledgeRouteKind;
  desk: DeskTurnKind;
}

export interface RouterDataset {
  name: string;
  version: string;
  cases: RouterCase[];
}

export interface InjectMemorySeed {
  id: string;
  text: string;
  kind: "identity" | "preference" | "habit" | "agreement" | "other";
  topic: string;
}

export interface InjectCase {
  id: string;
  query: string;
  memories: InjectMemorySeed[];
  expectIds: string[];
}

export interface InjectDataset {
  name: string;
  version: string;
  cases: InjectCase[];
}

export interface KbDoc {
  title: string;
  text: string;
}

export interface KbCorpus {
  name: string;
  version: string;
  documents: KbDoc[];
}

export interface KbQrel {
  id: string;
  query: string;
  expectDocTitle: string;
}

export interface KbQrels {
  name: string;
  version: string;
  cases: KbQrel[];
}
