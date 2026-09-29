import { randomUUID } from "node:crypto";
import { createServer, type ServerResponse } from "node:http";
import { AgentRuntime } from "./runtime";
import { loadPersona } from "./persona";
import { OpenAiCompatClient, isAbortTimeout } from "./llm/openai";
import type {
  AgentEvent,
  ChatRequestBody,
  ChatSettings,
  HoshiSettings,
  PluginListResponse,
  SessionListResponse,
  SessionMessagesResponse,
  UsageSummaryResponse,
  SessionKind
} from "@hoshi/shared";
import { DEFAULT_HOSHI_SETTINGS, type MemoryListResponse } from "@hoshi/shared";
import { BodyTooLargeError, readJson } from "./httpJson";
import { httpAuthorized } from "./agentAuth";
import { sanitizeFactText } from "./memory/extract";
import { PluginRegistry } from "./plugins/registry";
import { CompositePluginHost } from "./plugins/composite";
import { McpPluginHost } from "./plugins/mcpHost";
import { migrateDb, openDatabase } from "./storage/db";
import { MemoryRepo } from "./storage/memoryRepo";
import { SessionRepo } from "./storage/sessionRepo";
import { runSessionChat } from "./chatTurn";
import { buildSessionContext } from "./sessionContext";
import { attachVoiceGateway, voiceSessionCount } from "./voice/attach";
import { attachTtsGateway } from "./voice/ttsGateway";
import { applyGsvWeights } from "./voice/gptSovits";
import { resolveDashscopeCreds, hasDashscopeVoiceKey } from "./voice/dashscopeCreds";
import { transcribeWithWhisper } from "./voice/whisper";
import { OpenAiCompatEmbedding } from "./knowledge/embedding";
import { KnowledgeService, MAX_TEXT_CHARS } from "./knowledge/service";
import { KnowledgeToolHost } from "./knowledge/tool";
import { CanvasRepo } from "./storage/canvasRepo";
import { CanvasToolHost, CANVAS_USAGE_PROMPT, runWithCanvasTurn } from "./canvas/tool";
import { WebToolHost, resolveDeepseekSearchKey } from "./web/tool";
import { canvasItemIdFromPath } from "./canvas/id";
import { composeTurnHint } from "./retrieval/plan";
import { sanitizeChatImages } from "./llm/openai";
import { DashScopeRerank } from "./knowledge/rerank";
import { rewriteQuery } from "./knowledge/queryRewrite";
import type {
  KnowledgeChunksResponse,
  KnowledgeCollectionsResponse,
  KnowledgeDocumentsResponse,
  KnowledgeJobsResponse,
  KnowledgeSearchResponse,
  KnowledgeSearchTraceResponse
} from "./knowledge/types";

export interface AgentServerConfig {
  personaPath: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  databasePath: string;
  pluginsDir: string;
  mcpPath: string;
  pathEnv: string;
  storageDir?: string;
  onPluginKvSet?: (pluginId: string, key: string, value: string) => void;
  openExternal?: (target: string) => Promise<string>;
  listApps?: () => Promise<import("./plugins/types").HostAppInfo[]>;
  pickFiles?: (opts?: import("./plugins/types").PluginPickOpts) => Promise<string[]>;
  pluginCaps?: import("./plugins/registry").PluginRuntimeCaps;
  isolatedRun?: import("./plugins/registry").IsolatedRunFn;
}

function writeSse(res: ServerResponse, event: AgentEvent): void {
  res.write(`event: ${event.event}\n`);
  res.write(`data: ${JSON.stringify(event.data)}\n\n`);
}

function writeJson(res: ServerResponse, statusCode: number, data: unknown): void {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

const TRANSCRIBE_BODY_LIMIT = Math.floor(2.5 * 1024 * 1024);

async function readBody<T>(
  req: Parameters<typeof readJson>[0],
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

export function createAgentServer(config: AgentServerConfig) {
  const persona = loadPersona(config.personaPath);
  const plugins = new PluginRegistry(
    config.pluginsDir,
    config.storageDir,
    config.onPluginKvSet,
    config.openExternal,
    config.listApps,
    config.pickFiles,
    config.pluginCaps,
    config.isolatedRun
  );
  const mcp = new McpPluginHost(config.mcpPath, config.pathEnv);
  let lastSettings: HoshiSettings = { ...DEFAULT_HOSHI_SETTINGS };
  plugins.reload(lastSettings);
  const db = openDatabase(config.databasePath);
  migrateDb(db);
  const repo = new SessionRepo(db);
  const memoryRepo = new MemoryRepo(db);
  const ready = Promise.resolve();
  const authToken = randomUUID();
  const llm = new OpenAiCompatClient(
    {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: config.model
    },
    (row) => {
      void ready.then(() => repo.insertUsage(row)).catch((error) => {
        console.error(
          JSON.stringify({
            src: "hoshi.usage",
            ok: false,
            message: error instanceof Error ? error.message : "insert failed"
          })
        );
      });
    }
  );
  const embedding = new OpenAiCompatEmbedding(llm, () => ({
    model: lastSettings.knowledge.embedding.model,
    apiKey: lastSettings.knowledge.embedding.apiKey,
    baseUrl: lastSettings.knowledge.embedding.baseUrl
  }));
  const rerank = new DashScopeRerank(() => ({
    apiKey: lastSettings.knowledge.rerank.apiKey || lastSettings.model.apiKey,
    baseUrl: lastSettings.knowledge.rerank.baseUrl,
    model: lastSettings.knowledge.rerank.model
  }));
  const rewriteQueryFn = (query: string, mode: "rewrite" | "multi"): Promise<string[]> =>
    rewriteQuery(
      (messages) =>
        llm.completeChat(messages, [], { timeoutMs: 15000, enableSearch: false }).then((r) => r.content),
      query,
      mode
    );
  const knowledgeService = new KnowledgeService(db, embedding, lastSettings.knowledge, rerank, rewriteQueryFn);
  const knowledgeHost = new KnowledgeToolHost(knowledgeService);
  const canvasRepo = new CanvasRepo(db);
  const canvasHost = new CanvasToolHost(canvasRepo);
  const webHost = new WebToolHost(() =>
    resolveDeepseekSearchKey({
      deepseekApiKey: lastSettings.chat.deepseekApiKey,
      modelApiKey: lastSettings.model.apiKey,
      modelBaseUrl: lastSettings.model.baseUrl
    })
  );
  const pluginHost = new CompositePluginHost([plugins, mcp, knowledgeHost, webHost, canvasHost]);
  const runtime = new AgentRuntime({
    persona,
    llm,
    plugins: pluginHost
  });
  let chatSettings: ChatSettings = { ...DEFAULT_HOSHI_SETTINGS.chat };

  const applySettings = (settings: HoshiSettings): void => {
    llm.updateConfig({
      apiKey: settings.model.apiKey,
      baseUrl: settings.model.baseUrl,
      model: settings.model.model
    });
    chatSettings = { ...settings.chat };
    lastSettings = settings;
    knowledgeService.applySettings(settings.knowledge);
    plugins.reload(settings);
    void mcp.reload();
    runtime.setReferenceSites(settings.chat.referenceSites);
    const voice = settings.voice;
    if (
      voice.ttsBackend === "gpt-sovits" &&
      voiceSessionCount() === 0 &&
      (voice.gsvGptWeights.trim() || voice.gsvSovitsWeights.trim())
    ) {
      void applyGsvWeights(voice).catch((error) => {
        console.error(
          JSON.stringify({
            src: "hoshi.voice",
            phase: "gsv_weights_save",
            ok: false,
            message: error instanceof Error ? error.message : "gsv weights failed"
          })
        );
      });
    }
  };

  const server = createServer(async (req, res) => {
    const method = req.method ?? "GET";
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    try {
      await ready;
    } catch (error) {
      const payload = {
        error: "db_migration_failed",
        message: error instanceof Error ? error.message : "unknown error"
      };
      writeJson(res, url.pathname === "/healthz" ? 503 : 500, payload);
      return;
    }

    if (url.pathname === "/healthz") {
      writeJson(res, 200, { ok: true });
      return;
    }

    if (!httpAuthorized(req, authToken)) {
      writeJson(res, 401, { error: "unauthorized" });
      return;
    }

    try {
    if (method === "GET" && url.pathname === "/v1/plugins") {
      plugins.reload(lastSettings);
      const data: PluginListResponse = { plugins: plugins.list() };
      writeJson(res, 200, data);
      return;
    }

    if (method === "GET" && url.pathname === "/v1/memories") {
      const status = url.searchParams.get("status");
      const memories =
        status === "superseded" ? await memoryRepo.listSuperseded() : await memoryRepo.listActive();
      const data: MemoryListResponse = { memories };
      writeJson(res, 200, data);
      return;
    }

    const memoryRestore = url.pathname.match(/^\/v1\/memories\/([0-9a-fA-F-]+)\/restore$/);
    if (method === "POST" && memoryRestore) {
      const restored = await memoryRepo.restore(memoryRestore[1]);
      if (!restored) {
        writeJson(res, 404, { error: "memory_not_found" });
        return;
      }
      writeJson(res, 200, restored);
      return;
    }

    const memoryMatch = url.pathname.match(/^\/v1\/memories\/([0-9a-fA-F-]+)$/);
    if (memoryMatch && (method === "DELETE" || method === "PATCH")) {
      const id = memoryMatch[1];
      if (method === "DELETE") {
        const deleted = await memoryRepo.supersede(id);
        if (!deleted) {
          writeJson(res, 404, { error: "memory_not_found" });
          return;
        }
        writeJson(res, 200, { ok: true });
        return;
      }
      const patch = await readBody<{ text?: string }>(req, res);
      if (!patch) {
        return;
      }
      const text = sanitizeFactText(patch.text ?? "");
      if (!text) {
        writeJson(res, 400, { error: "invalid_memory_text" });
        return;
      }
      const updated = await memoryRepo.updateText(id, text, { acked: true });
      if (!updated) {
        writeJson(res, 404, { error: "memory_not_found" });
        return;
      }
      writeJson(res, 200, updated);
      return;
    }

    if (method === "GET" && url.pathname === "/v1/sessions") {
      const kind: SessionKind = url.searchParams.get("kind") === "desk" ? "desk" : "chat";
      const sessions = await repo.listSessions(30, kind);
      const data: SessionListResponse = { sessions };
      writeJson(res, 200, data);
      return;
    }

    if (method === "GET" && url.pathname === "/v1/usage") {
      const data: UsageSummaryResponse = await repo.getUsageSummary();
      writeJson(res, 200, data);
      return;
    }

    if (method === "POST" && url.pathname === "/v1/sessions") {
      const body = await readBody<{ title?: string; kind?: SessionKind }>(req, res);
      if (!body) {
        return;
      }
      const session = await repo.createSession(body.title, body.kind === "desk" ? "desk" : "chat");
      writeJson(res, 200, session);
      return;
    }

    const deleteMatch = url.pathname.match(/^\/v1\/sessions\/([0-9a-fA-F-]+)$/);
    if (method === "DELETE" && deleteMatch) {
      const deleted = await repo.deleteSession(deleteMatch[1]);
      if (!deleted) {
        writeJson(res, 404, { error: "session_not_found" });
        return;
      }
      writeJson(res, 200, { ok: true });
      return;
    }

    const sessionMatch = url.pathname.match(/^\/v1\/sessions\/([0-9a-fA-F-]+)\/messages$/);
    if (method === "GET" && sessionMatch) {
      const sessionId = sessionMatch[1];
      const session = await repo.getSession(sessionId);
      if (!session) {
        writeJson(res, 404, { error: "session_not_found" });
        return;
      }
      const messages = await repo.listMessages(sessionId, 200);
      const data: SessionMessagesResponse = { session, messages };
      writeJson(res, 200, data);
      return;
    }

    const snapshotMatch = url.pathname.match(/^\/v1\/sessions\/([0-9a-fA-F-]+)\/canvas-snapshots$/);
    if (method === "GET" && snapshotMatch) {
      const sessionId = snapshotMatch[1];
      const session = await repo.getSession(sessionId);
      if (!session) {
        writeJson(res, 404, { error: "session_not_found" });
        return;
      }
      writeJson(res, 200, {
        snapshots: canvasRepo.listSnapshots(sessionId),
        activity: canvasRepo.listActivity(sessionId)
      });
      return;
    }

    if (method === "GET" && url.pathname === "/v1/canvas") {
      const canvasSessionId = url.searchParams.get("sessionId")?.trim() ?? "";
      if (!canvasSessionId) {
        writeJson(res, 400, { error: "session_id_required" });
        return;
      }
      if (!(await repo.getSession(canvasSessionId))) {
        writeJson(res, 404, { error: "session_not_found" });
        return;
      }
      writeJson(res, 200, { items: canvasRepo.list(canvasSessionId) });
      return;
    }

    if (method === "POST" && url.pathname === "/v1/canvas/restore") {
      const restoreBody = await readBody<{ sessionId?: string; turnId?: string }>(req, res);
      if (!restoreBody) {
        return;
      }
      const sessionId = restoreBody.sessionId?.trim() ?? "";
      const turnId = restoreBody.turnId?.trim() ?? "";
      if (!sessionId || !turnId) {
        writeJson(res, 400, { error: "session_id_and_turn_id_required" });
        return;
      }
      if (!(await repo.getSession(sessionId))) {
        writeJson(res, 404, { error: "session_not_found" });
        return;
      }
      const items = canvasRepo.restoreFromSnapshot(sessionId, turnId);
      if (!items) {
        writeJson(res, 404, { error: "snapshot_not_found" });
        return;
      }
      writeJson(res, 200, { items });
      return;
    }

    if (method === "POST" && url.pathname === "/v1/canvas/reorder") {
      const orderBody = await readBody<{ sessionId?: string; ids?: string[] }>(req, res);
      if (!orderBody) {
        return;
      }
      const sessionId = orderBody.sessionId?.trim() ?? "";
      const ids = Array.isArray(orderBody.ids) ? orderBody.ids.map((id) => String(id).trim()).filter(Boolean) : [];
      if (!sessionId || ids.length === 0) {
        writeJson(res, 400, { error: "session_id_and_ids_required" });
        return;
      }
      if (!(await repo.getSession(sessionId))) {
        writeJson(res, 404, { error: "session_not_found" });
        return;
      }
      writeJson(res, 200, { items: canvasRepo.reorder(sessionId, ids) });
      return;
    }

    const canvasItemId = canvasItemIdFromPath(url.pathname);
    if (canvasItemId && method === "PATCH") {
      const patchBody = await readBody<{ x?: number; y?: number; w?: number; h?: number; z?: number }>(
        req,
        res
      );
      if (!patchBody) {
        return;
      }
      const sessionId = url.searchParams.get("sessionId")?.trim() || undefined;
      const item = canvasRepo.patchLayout(canvasItemId, patchBody, sessionId);
      if (!item) {
        writeJson(res, 404, { error: "canvas_not_found" });
        return;
      }
      writeJson(res, 200, item);
      return;
    }
    if (canvasItemId && method === "DELETE") {
      const sessionId = url.searchParams.get("sessionId")?.trim() || undefined;
      const ok = canvasRepo.remove(canvasItemId, sessionId);
      if (!ok) {
        writeJson(res, 404, { error: "canvas_not_found" });
        return;
      }
      writeJson(res, 200, { ok: true });
      return;
    }

    if (method === "POST" && url.pathname === "/v1/transcribe") {
      const body = await readBody<{ audioWavBase64?: string; sessionId?: string }>(
        req,
        res,
        TRANSCRIBE_BODY_LIMIT
      );
      if (!body) {
        return;
      }
      const audioWavBase64 = body.audioWavBase64?.trim() ?? "";
      if (!audioWavBase64) {
        writeJson(res, 400, { error: "audio_required" });
        return;
      }
      const started = Date.now();
      try {
        const voice = lastSettings.voice;
        const snap = llm.snapshot();
        const ds = resolveDashscopeCreds(voice, snap);
        let text = "";
        if (hasDashscopeVoiceKey(voice, snap)) {
          text = await llm.transcribeWav(audioWavBase64, {
            timeoutMs: 20000,
            apiKey: ds.apiKey,
            baseUrl: ds.baseUrl,
            sessionId: body.sessionId?.trim()
          });
        } else {
          const raw = audioWavBase64.trim().replace(/^data:audio\/wav;base64,/i, "");
          text = await transcribeWithWhisper(voice, Buffer.from(raw, "base64"));
        }
        console.error(
          JSON.stringify({
            src: "hoshi.asr",
            ok: true,
            empty: !text,
            ms: Date.now() - started
          })
        );
        if (!res.headersSent) {
          writeJson(res, 200, { text });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "transcribe failed";
        const statusMatch = message.match(/ASR request failed: (\d+)/);
        console.error(
          JSON.stringify({
            src: "hoshi.asr",
            ok: false,
            empty: false,
            ms: Date.now() - started,
            ...(statusMatch ? { status: Number(statusMatch[1]) } : {})
          })
        );
        if (!res.headersSent) {
          writeJson(res, 502, { error: "transcribe_failed", message });
        }
      }
      return;
    }

    // ---- knowledge base ----
    if (method === "GET" && url.pathname === "/v1/kb/collections") {
      const data: KnowledgeCollectionsResponse = {
        collections: await knowledgeService.listCollections(),
        capabilities: knowledgeService.capabilities()
      };
      writeJson(res, 200, data);
      return;
    }

    if (method === "POST" && url.pathname === "/v1/kb/collections") {
      const body = await readBody<{ name?: string; description?: string }>(req, res);
      if (!body) {
        return;
      }
      const collection = await knowledgeService.createCollection(body.name ?? "", body.description ?? "");
      writeJson(res, 200, collection);
      return;
    }

    const collectionMatch = url.pathname.match(/^\/v1\/kb\/collections\/([0-9a-fA-F-]+)$/);
    if (collectionMatch && (method === "PATCH" || method === "DELETE")) {
      const id = collectionMatch[1];
      if (method === "DELETE") {
        const deleted = await knowledgeService.deleteCollection(id);
        if (!deleted) {
          writeJson(res, 404, { error: "collection_not_found" });
          return;
        }
        writeJson(res, 200, { ok: true });
        return;
      }
      const body = await readBody<{ name?: string; description?: string; enabled?: boolean }>(req, res);
      if (!body) {
        return;
      }
      const updated = await knowledgeService.patchCollection(id, {
        name: body.name,
        description: body.description,
        enabled: body.enabled
      });
      if (!updated) {
        writeJson(res, 404, { error: "collection_not_found" });
        return;
      }
      writeJson(res, 200, updated);
      return;
    }

    const docsMatch = url.pathname.match(/^\/v1\/kb\/collections\/([0-9a-fA-F-]+)\/documents$/);
    if (docsMatch) {
      if (method === "GET") {
        const data: KnowledgeDocumentsResponse = { documents: await knowledgeService.listDocuments(docsMatch[1]) };
        writeJson(res, 200, data);
        return;
      }
      if (method === "POST") {
        const body = await readBody<{ title?: string; text?: string; sourceName?: string; mime?: string }>(
          req,
          res
        );
        if (!body) {
          return;
        }
        const text = body.text ?? "";
        if (!text.trim()) {
          writeJson(res, 400, { error: "text_required" });
          return;
        }
        if (text.length > MAX_TEXT_CHARS) {
          writeJson(res, 413, { error: "text_too_large", message: `文本超过上限 ${MAX_TEXT_CHARS} 字符` });
          return;
        }
        const result = await knowledgeService.ingestDocument({
          collectionId: docsMatch[1],
          title: body.title?.trim() || "未命名文档",
          sourceName: body.sourceName ?? "",
          mime: body.mime ?? "text/plain",
          text
        });
        console.error(
          JSON.stringify({
            src: "hoshi.kb",
            phase: "ingest",
            sourceName: body.sourceName ?? "",
            title: body.title ?? "",
            action: result.action
          })
        );
        writeJson(res, 200, result);
        return;
      }
    }

    const docRetryMatch = url.pathname.match(/^\/v1\/kb\/documents\/([0-9a-fA-F-]+)\/retry$/);
    if (docRetryMatch && method === "POST") {
      const doc = await knowledgeService.retryDocument(docRetryMatch[1]);
      if (!doc) {
        writeJson(res, 404, { error: "document_not_found_or_no_source" });
        return;
      }
      writeJson(res, 200, doc);
      return;
    }

    const docMatch = url.pathname.match(/^\/v1\/kb\/documents\/([0-9a-fA-F-]+)$/);
    if (docMatch && method === "DELETE") {
      const deleted = await knowledgeService.deleteDocument(docMatch[1]);
      if (!deleted) {
        writeJson(res, 404, { error: "document_not_found" });
        return;
      }
      writeJson(res, 200, { ok: true });
      return;
    }
    if (docMatch && method === "PATCH") {
      const body = await readBody<{ disabled?: boolean }>(req, res);
      if (!body) {
        return;
      }
      const ok = await knowledgeService.setDocumentDisabled(docMatch[1], body.disabled === true);
      if (!ok) {
        writeJson(res, 404, { error: "document_not_found" });
        return;
      }
      writeJson(res, 200, { ok: true });
      return;
    }

    const chunksMatch = url.pathname.match(/^\/v1\/kb\/documents\/([0-9a-fA-F-]+)\/chunks$/);
    if (chunksMatch && method === "GET") {
      const offsetRaw = Number(url.searchParams.get("offset") ?? 0);
      const limitRaw = Number(url.searchParams.get("limit") ?? 50);
      const result = await knowledgeService.listChunks(
        chunksMatch[1],
        Number.isFinite(offsetRaw) ? offsetRaw : 0,
        Number.isFinite(limitRaw) ? limitRaw : 50
      );
      const data: KnowledgeChunksResponse = { chunks: result.chunks, total: result.total };
      writeJson(res, 200, data);
      return;
    }

    const chunkPatchMatch = url.pathname.match(/^\/v1\/kb\/chunks\/([0-9a-fA-F-]+)$/);
    if (chunkPatchMatch && method === "PATCH") {
      const body = await readBody<{ text?: string }>(req, res);
      if (!body) {
        return;
      }
      const text = body.text?.trim() ?? "";
      if (!text) {
        writeJson(res, 400, { error: "text_required" });
        return;
      }
      try {
        const ok = await knowledgeService.updateChunk(chunkPatchMatch[1], text);
        if (!ok) {
          writeJson(res, 404, { error: "chunk_not_found" });
          return;
        }
        writeJson(res, 200, { ok: true });
      } catch (error) {
        writeJson(res, 500, {
          error: "chunk_update_failed",
          message: error instanceof Error ? error.message : "unknown"
        });
      }
      return;
    }

    if (method === "POST" && url.pathname === "/v1/kb/search") {
      const body = await readBody<{ query?: string; collectionIds?: string[]; topK?: number; includeTrace?: boolean }>(
        req,
        res
      );
      if (!body) {
        return;
      }
      const query = body.query?.trim() ?? "";
      if (!query) {
        writeJson(res, 400, { error: "query_required" });
        return;
      }
      if (body.includeTrace) {
        const { hits, trace } = await knowledgeService.searchWithTrace(query, {
          collectionIds: body.collectionIds,
          topK: body.topK
        });
        const data: KnowledgeSearchTraceResponse = { hits, trace };
        writeJson(res, 200, data);
      } else {
        const hits = await knowledgeService.search(query, {
          collectionIds: body.collectionIds,
          topK: body.topK
        });
        const data: KnowledgeSearchResponse = { hits };
        writeJson(res, 200, data);
      }
      return;
    }

    if (method === "POST" && url.pathname === "/v1/kb/reindex-all") {
      try {
        const result = await knowledgeService.reindexAll();
        writeJson(res, 200, result);
      } catch (error) {
        writeJson(res, 500, { error: "reindex_failed", message: error instanceof Error ? error.message : "unknown" });
      }
      return;
    }

    if (method === "GET" && url.pathname === "/v1/kb/jobs") {
      const jobs = await knowledgeService.listJobs({ limit: 200 });
      const data: KnowledgeJobsResponse = { jobs, pending: knowledgeService.pendingJobs() };
      writeJson(res, 200, data);
      return;
    }

    const rememberMatch = url.pathname.match(/^\/v1\/kb\/chunks\/([0-9a-fA-F-]+)\/remember$/);
    if (rememberMatch && method === "POST") {
      const context = await knowledgeService.getChunkContext(rememberMatch[1]);
      if (!context) {
        writeJson(res, 404, { error: "chunk_not_found" });
        return;
      }
      const text = context.text.replace(/\s+/g, " ").trim();
      if (!text) {
        writeJson(res, 400, { error: "empty_chunk" });
        return;
      }
      const memory = await memoryRepo.insert(text, null, "other", context.title, {
        source: "knowledge",
        chunkId: rememberMatch[1],
        documentId: context.documentId,
        documentTitle: context.title,
        collectionId: context.collectionId
      });
      // 用户主动摘录，无需助手再次“确认已记住”，直接标记为已确认。
      await memoryRepo.markAcked([memory.id]);
      writeJson(res, 200, memory);
      return;
    }

    if (method !== "POST" || url.pathname !== "/v1/chat") {
      writeJson(res, 404, { error: "not_found" });
      return;
    }

    const body = await readBody<ChatRequestBody>(req, res, 8 * 1024 * 1024);
    if (!body) {
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    });
    const turnAbort = new AbortController();
    const abortTurn = (): void => {
      if (!turnAbort.signal.aborted) {
        turnAbort.abort();
      }
    };
    req.once("aborted", abortTurn);
    req.once("close", () => {
      if (!res.writableEnded) {
        abortTurn();
      }
    });
    try {
      const sessionId = body.sessionId?.trim();
      if (!sessionId) {
        writeSse(res, { event: "error", data: { message: "sessionId is required" } });
        return;
      }
      const session = await repo.getSession(sessionId);
      if (!session) {
        writeSse(res, { event: "error", data: { message: "session not found" } });
        return;
      }

      const desk = body.workspace === "desk";
      const hint = desk ? String(body.message ?? "") : "";
      canvasHost.setEnabled(desk, sessionId);
      webHost.setEnabled(desk);
      canvasHost.setTurnHint(hint);
      const runTurn = async (): Promise<void> => {
        const images = sanitizeChatImages(body.images);
        const { history, compactUsage } = await buildSessionContext(
          repo,
          sessionId,
          chatSettings,
          llm
        );
        if (desk) {
          const prior = history
            .filter((item) => item.role === "user")
            .slice(-4)
            .map((item) => item.content)
            .join("\n");
          canvasHost.setTurnHint(composeTurnHint(hint, prior));
        }
        for await (const event of runSessionChat({
          repo,
          memoryRepo,
          runtime,
          llm,
          chatSettings,
          sessionId,
          message: body.message,
          history,
          compactUsage,
          signal: turnAbort.signal,
          canvasPrompt: desk ? `${CANVAS_USAGE_PROMPT}\n${canvasHost.inventoryPrompt() ?? ""}` : undefined,
          images,
          workspace: body.workspace,
          commitCanvas: desk
            ? async ({ turnId, sessionId: sid, userMessageId, steps }) => {
                await canvasHost.flushPortraits(sid);
                canvasRepo.saveActivity({
                  turnId,
                  sessionId: sid,
                  userMessageId,
                  steps: steps ?? []
                });
                const items = canvasRepo.list(sid);
                const document = { version: 1 as const, turnId, sessionId: sid, items };
                canvasRepo.saveSnapshot({
                  turnId,
                  sessionId: sid,
                  userMessageId,
                  document
                });
                canvasHost.takeChanges();
                return { items };
              }
            : undefined
        })) {
          if (turnAbort.signal.aborted) {
            break;
          }
          writeSse(res, event);
        }
        const citations = knowledgeHost.takeCitations();
        if (citations.length > 0) {
          writeSse(res, { event: "citation", data: { callId: "", citations } });
        }
      };
      if (desk) {
        await runWithCanvasTurn({ sessionId, hint }, runTurn);
      } else {
        await runTurn();
      }
    } catch (error) {
      const raw = error instanceof Error ? error.message : "Unknown error";
      const message =
        isAbortTimeout(error) || /模型请求超时|超时/.test(raw) ? "回答超时，请再试一次" : raw;
      writeSse(res, { event: "error", data: { message } });
    } finally {
      canvasHost.setEnabled(false);
      webHost.setEnabled(false);
      res.end();
    }
    } catch (error) {
      if (!res.headersSent) {
        writeJson(res, 500, {
          error: "internal",
          message: error instanceof Error ? error.message : "unknown error"
        });
      }
    }
  });

  attachVoiceGateway(server, {
    ready,
    authToken,
    getLlm: () => llm,
    getRuntime: () => runtime,
    getChatSettings: () => chatSettings,
    getVoiceSettings: () => lastSettings.voice,
    repo,
    memoryRepo,
    buildHistory: (sessionId) => buildSessionContext(repo, sessionId, chatSettings, llm)
  });
  attachTtsGateway(server, {
    authToken,
    getLlm: () => llm,
    getVoiceSettings: () => lastSettings.voice
  });

  return {
    server,
    persona,
    applySettings,
    authToken,
    mcpReady: mcp.reload(),
    close: () => {
      mcp.stop();
    },
    executeByPluginId: (pluginId: string, args: Record<string, unknown>) => plugins.executeByPluginId(pluginId, args),
    listMcpServers: () => mcp.snapshot(),
    reloadMcp: () => mcp.reload()
  };
}
