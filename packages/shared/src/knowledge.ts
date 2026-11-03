export type KnowledgeDocumentStatus =
  | "parsing"
  | "chunking"
  | "embedding"
  | "ready"
  | "failed"
  | "disabled";

export interface KnowledgeCollection {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  documentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeDocument {
  id: string;
  collectionId: string;
  title: string;
  sourceName: string;
  mime: string;
  sizeBytes: number;
  status: KnowledgeDocumentStatus;
  error: string;
  chunkCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeChunkItem {
  id: string;
  documentId: string;
  seq: number;
  text: string;
  meta: { page?: number; headingPath?: string[] };
}

export interface KnowledgeSearchHit {
  chunkId: string;
  docId: string;
  documentTitle: string;
  collectionId: string;
  collectionName: string;
  seq: number;
  text: string;
  score: number;
}

export type KnowledgeJobStatus = "pending" | "running" | "done" | "failed";

export interface KnowledgeJob {
  id: string;
  documentId: string;
  kind: string;
  status: KnowledgeJobStatus;
  attempt: number;
  error: string;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeCapabilities {
  vectorAvailable: boolean;
  embeddingModel: string;
  embeddingDim: number;
  pendingJobs: number;
}

export interface KnowledgeCollectionsResponse {
  collections: KnowledgeCollection[];
  capabilities: KnowledgeCapabilities;
}

export interface KnowledgeDocumentsResponse {
  documents: KnowledgeDocument[];
}

export interface KnowledgeChunksResponse {
  chunks: KnowledgeChunkItem[];
  total: number;
}

export interface KnowledgeSearchResponse {
  hits: KnowledgeSearchHit[];
}

export interface SearchTraceHit {
  chunkId: string;
  score: number;
  text: string;
}

export interface SearchTrace {
  query: string;
  queries?: string[];
  vectorHits: SearchTraceHit[];
  keywordHits: SearchTraceHit[];
  fusedHits: SearchTraceHit[];
  finalHits: SearchTraceHit[];
  reranked: boolean;
  latencyMs: { embed: number; vector: number; keyword: number; fuse: number; rerank: number; total: number };
}

export interface KnowledgeSearchTraceResponse {
  hits: KnowledgeSearchHit[];
  trace: SearchTrace;
}

export interface KnowledgeJobsResponse {
  jobs: KnowledgeJob[];
  pending: number;
}
