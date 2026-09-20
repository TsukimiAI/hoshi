import { randomUUID } from "node:crypto";
import { createServer, type ServerResponse } from "node:http";
import { AgentRuntime } from "./runtime";
import { loadPersona } from "./persona";
import { OpenAiCompatClient } from "./llm/openai";
import type {
  AgentEvent,
  ChatRequestBody,
  ChatSettings,
  HoshiSettings,
  PluginListResponse,
  SessionListResponse,
  SessionMessagesResponse,
  UsageSummaryResponse
} from "@hoshi/shared";
import { DEFAULT_HOSHI_SETTINGS, type MemoryListResponse } from "@hoshi/shared";
import { BodyTooLargeError, readJson } from "./httpJson";
import { httpAuthorized } from "./agentAuth";
import { sanitizeFactText } from "./memory/extract";
import { PluginRegistry } from "./plugins/registry";
import { createPgPool, migratePg } from "./storage/pg";
import { MemoryRepo } from "./storage/memoryRepo";
import { SessionRepo } from "./storage/sessionRepo";
import { runSessionChat } from "./chatTurn";
import { buildSessionContext } from "./sessionContext";
import { attachVoiceGateway, voiceSessionCount } from "./voice/attach";
import { attachTtsGateway } from "./voice/ttsGateway";
import { applyGsvWeights } from "./voice/gptSovits";
import { resolveDashscopeCreds, hasDashscopeVoiceKey } from "./voice/dashscopeCreds";
import { transcribeWithWhisper } from "./voice/whisper";

export interface AgentServerConfig {
  personaPath: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  databaseUrl: string;
  pluginsDir: string;
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
  const plugins = new PluginRegistry(config.pluginsDir);
  let lastSettings: HoshiSettings = { ...DEFAULT_HOSHI_SETTINGS };
  plugins.reload(lastSettings);
  const pool = createPgPool(config.databaseUrl);
  const repo = new SessionRepo(pool);
  const memoryRepo = new MemoryRepo(pool);
  const ready = migratePg(pool);
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
  const runtime = new AgentRuntime({
    persona,
    llm,
    plugins
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
    plugins.reload(settings);
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
      const sessions = await repo.listSessions();
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
      const body = await readBody<{ title?: string }>(req, res);
      if (!body) {
        return;
      }
      const session = await repo.createSession(body.title);
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

    if (method !== "POST" || url.pathname !== "/v1/chat") {
      writeJson(res, 404, { error: "not_found" });
      return;
    }

    const body = await readBody<ChatRequestBody>(req, res);
    if (!body) {
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
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

      const { history, compactUsage } = await buildSessionContext(
        repo,
        sessionId,
        chatSettings,
        llm
      );
      for await (const event of runSessionChat({
        repo,
        memoryRepo,
        runtime,
        llm,
        chatSettings,
        sessionId,
        message: body.message,
        history,
        compactUsage
      })) {
        writeSse(res, event);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      writeSse(res, { event: "error", data: { message } });
    } finally {
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
    authToken
  };
}
