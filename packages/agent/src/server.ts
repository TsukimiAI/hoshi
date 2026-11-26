import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { AgentRuntime } from "./runtime";
import { loadPersona } from "./persona";
import { OpenAiCompatClient } from "./llm/openai";
import type { ChatSettings, HoshiSettings, PluginListResponse } from "@hoshi/shared";
import { DEFAULT_HOSHI_SETTINGS, type MemoryListResponse } from "@hoshi/shared";
import { httpAuthorized } from "./agentAuth";
import { sanitizeFactText } from "./memory/extract";
import { PluginRegistry } from "./plugins/registry";
import { CompositePluginHost } from "./plugins/composite";
import { McpPluginHost } from "./plugins/mcpHost";
import { dirname, join } from "node:path";
import { migrateDb, openDatabase } from "./storage/db";
import { MemoryRepo } from "./storage/memoryRepo";
import { SessionRepo } from "./storage/sessionRepo";
import { ChatImageStore } from "./chatImages";
import { PetScreenSlot, freshPetScreen } from "./petScreen/slot";
import { matchGlanceInterval } from "./petScreen/content";
import { buildSessionContext, type SessionContext } from "./sessionContext";
import { attachVoiceGateway, voiceSessionCount } from "./voice/attach";
import { attachTtsGateway } from "./voice/ttsGateway";
import { applyGsvWeights } from "./voice/gptSovits";
import { OpenAiCompatEmbedding } from "./knowledge/embedding";
import { KnowledgeService } from "./knowledge/service";
import { KnowledgeToolHost } from "./knowledge/tool";
import { CanvasRepo } from "./storage/canvasRepo";
import { CanvasToolHost } from "./canvas/tool";
import { WebToolHost, resolveDeepseekSearchKey } from "./web/tool";
import { DashScopeRerank } from "./knowledge/rerank";
import { rewriteQuery } from "./knowledge/queryRewrite";
import type { AgentRouteCtx } from "./serverHttp";
import { readBody, resolveChatDeskMode, writeJson } from "./serverHttp";
import { handleSessions } from "./serverSessions";
import { handleCanvas } from "./serverCanvas";
import { handleKb } from "./serverKb";
import { handlePet } from "./serverPet";
import { handleChat } from "./serverChat";

export { resolveChatDeskMode };

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
  const imageStore =
    config.databasePath === ":memory:"
      ? undefined
      : new ChatImageStore(join(dirname(config.databasePath), "chat-images"));
  const repo = new SessionRepo(db, imageStore);
  const petSlot = new PetScreenSlot();
  const turnWithInterval = async (
    sessionId: string,
    message: string,
    kind: "chat" | "desk",
    ordinary: SessionContext
  ): Promise<{ history: SessionContext["history"]; lookback?: SessionContext["lookback"]; intervalId: string | null }> => {
    const intervalId = matchGlanceInterval({
      enabled: lastSettings.screen.enabled,
      kind,
      sessionId,
      message,
      now: Date.now(),
      open: petSlot.openInterval()
    });
    if (!intervalId) {
      return { history: ordinary.history, lookback: ordinary.lookback, intervalId: null };
    }
    const rows = await repo.listMessages(sessionId, 400);
    if (petSlot.openInterval()?.id !== intervalId) {
      return { history: ordinary.history, lookback: ordinary.lookback, intervalId: null };
    }
    petSlot.touchInterval(Date.now());
    return {
      history: SessionRepo.toPromptHistory(rows.filter((row) => row.intervalId === intervalId)),
      intervalId
    };
  };
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
  const memoryRepo = new MemoryRepo(db, embedding);
  void memoryRepo.backfillEmbeddings().catch(() => undefined);
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
  const webHost = new WebToolHost(
    () =>
      resolveDeepseekSearchKey({
        deepseekApiKey: lastSettings.chat.deepseekApiKey
      }),
    undefined,
    undefined,
    () => ({
      baseUrl: lastSettings.chat.searchBaseUrl,
      model: lastSettings.chat.searchModel
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
    if (!settings.screen.enabled) {
      petSlot.clearPixels();
      petSlot.clearInterval();
    }
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

  const routeCtx: AgentRouteCtx = {
    repo,
    memoryRepo,
    knowledgeService,
    knowledgeHost,
    canvasRepo,
    canvasHost,
    webHost,
    runtime,
    llm,
    persona,
    petSlot,
    plugins,
    getSettings: () => lastSettings,
    getChatSettings: () => chatSettings,
    turnWithInterval
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

    if (await handleSessions(routeCtx, req, res, method, url)) {
      return;
    }
    if (await handleCanvas(routeCtx, req, res, method, url)) {
      return;
    }
    if (await handleKb(routeCtx, req, res, method, url)) {
      return;
    }
    if (await handlePet(routeCtx, req, res, method, url)) {
      return;
    }
    await handleChat(routeCtx, req, res, method, url);
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
    buildHistory: (sessionId) => buildSessionContext(repo, sessionId, chatSettings, llm),
    applyGlanceInterval: (sessionId, message, kind, ordinary) =>
      turnWithInterval(sessionId, message, kind, ordinary),
    takeScreen: (sessionId) =>
      freshPetScreen({
        enabled: lastSettings.screen.enabled,
        kind: "chat",
        sessionId,
        now: Date.now(),
        slot: petSlot
      })
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
