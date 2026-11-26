import type { IncomingMessage, ServerResponse } from "node:http";
import type { AgentEvent, ChatRequestBody, ChatSettings, HoshiSettings, SessionKind } from "@hoshi/shared";
import type { AgentRuntime } from "./runtime";
import type { OpenAiCompatClient } from "./llm/openai";
import type { PersonaConfig } from "./persona";
import type { SessionRepo } from "./storage/sessionRepo";
import type { MemoryRepo } from "./storage/memoryRepo";
import type { KnowledgeService } from "./knowledge/service";
import type { KnowledgeToolHost } from "./knowledge/tool";
import type { CanvasRepo } from "./storage/canvasRepo";
import type { CanvasToolHost } from "./canvas/tool";
import type { WebToolHost } from "./web/tool";
import type { PetScreenSlot } from "./petScreen/slot";
import type { PluginRegistry } from "./plugins/registry";
import type { SessionContext } from "./sessionContext";
import { BodyTooLargeError, readJson } from "./httpJson";

export interface AgentRouteCtx {
  repo: SessionRepo;
  memoryRepo: MemoryRepo;
  knowledgeService: KnowledgeService;
  knowledgeHost: KnowledgeToolHost;
  canvasRepo: CanvasRepo;
  canvasHost: CanvasToolHost;
  webHost: WebToolHost;
  runtime: AgentRuntime;
  llm: OpenAiCompatClient;
  persona: PersonaConfig;
  petSlot: PetScreenSlot;
  plugins: PluginRegistry;
  getSettings: () => HoshiSettings;
  getChatSettings: () => ChatSettings;
  turnWithInterval: (
    sessionId: string,
    message: string,
    kind: "chat" | "desk",
    ordinary: SessionContext
  ) => Promise<{
    history: SessionContext["history"];
    lookback?: SessionContext["lookback"];
    intervalId: string | null;
  }>;
}

/** POST /v1/chat：画布只跟 session.kind，语音不要走这条。 */
export function resolveChatDeskMode(input: {
  sessionKind: SessionKind;
  workspace?: ChatRequestBody["workspace"];
}): { ok: true; desk: boolean } | { ok: false; message: string } {
  if (input.workspace === "desk" && input.sessionKind !== "desk") {
    return { ok: false, message: "workspace desk requires a desk session" };
  }
  return { ok: true, desk: input.sessionKind === "desk" };
}

export function writeSse(res: ServerResponse, event: AgentEvent): void {
  res.write(`event: ${event.event}\n`);
  res.write(`data: ${JSON.stringify(event.data)}\n\n`);
}

export function writeJson(res: ServerResponse, statusCode: number, data: unknown): void {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

export async function readBody<T>(
  req: IncomingMessage,
  res: ServerResponse,
  maxBytes?: number
): Promise<T | undefined> {
  try {
    return await readJson<T>(req, maxBytes);
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      writeJson(res, 400, { error: "payload_too_large" });
      return undefined;
    }
    writeJson(res, 400, { error: "invalid_json" });
    return undefined;
  }
}
