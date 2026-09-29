export type CanvasKind = "chart" | "card" | "image" | "note" | "table" | "markdown";
export type CanvasChartType = "bar" | "line" | "pie";

export interface CanvasSeries {
  name: string;
  values: number[];
  axis?: "left" | "right";
  errors?: number[];
}

export interface CanvasChartPayload {
  chartType: CanvasChartType;
  labels: string[];
  series: CanvasSeries[];
  unit?: string;
  subtitle?: string;
  xLabel?: string;
  yLabel?: string;
  y2Label?: string;
  y2Unit?: string;
  insight?: string;
}

export interface CanvasCardPayload {
  body: string;
  tags?: string[];
  kicker?: string;
  portraitUrl?: string;
  portraitPending?: boolean;
}

export interface CanvasImagePayload {
  url: string;
  caption?: string;
}

export interface CanvasNotePayload {
  body: string;
}

export interface CanvasTablePayload {
  columns: string[];
  rows: string[][];
  caption?: string;
}

export interface CanvasMarkdownPayload {
  body: string;
}

export type CanvasPayload =
  | CanvasChartPayload
  | CanvasCardPayload
  | CanvasImagePayload
  | CanvasNotePayload
  | CanvasTablePayload
  | CanvasMarkdownPayload;

export interface CanvasItem {
  id: string;
  kind: CanvasKind;
  title: string;
  payload: CanvasPayload;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  sourceSessionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CanvasListResponse {
  items: CanvasItem[];
}

export interface CanvasDocument {
  version: 1;
  turnId: string;
  sessionId: string;
  items: CanvasItem[];
}

export interface CanvasSnapshot {
  turnId: string;
  sessionId: string;
  userMessageId: string;
  document: CanvasDocument;
  createdAt: string;
}

export interface CanvasTurnActivityStep {
  kind: "think" | "tool";
  name?: string;
  detail?: string;
  elapsedMs?: number;
  ok?: boolean;
}

export interface CanvasTurnActivity {
  turnId: string;
  sessionId: string;
  userMessageId: string;
  steps: CanvasTurnActivityStep[];
  createdAt: string;
}

export interface CanvasSnapshotListResponse {
  snapshots: CanvasSnapshot[];
  activity?: CanvasTurnActivity[];
}

export interface ChatImagePart {
  mime: string;
  data: string;
}
