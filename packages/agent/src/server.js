"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAgentServer = createAgentServer;
const node_crypto_1 = require("node:crypto");
const node_http_1 = require("node:http");
const runtime_1 = require("./runtime");
const persona_1 = require("./persona");
const openai_1 = require("./llm/openai");
const shared_1 = require("@hoshi/shared");
const httpJson_1 = require("./httpJson");
const agentAuth_1 = require("./agentAuth");
const extract_1 = require("./memory/extract");
const registry_1 = require("./plugins/registry");
const pg_1 = require("./storage/pg");
const memoryRepo_1 = require("./storage/memoryRepo");
const sessionRepo_1 = require("./storage/sessionRepo");
const chatTurn_1 = require("./chatTurn");
const sessionContext_1 = require("./sessionContext");
const attach_1 = require("./voice/attach");
const ttsGateway_1 = require("./voice/ttsGateway");
const gptSovits_1 = require("./voice/gptSovits");
const dashscopeCreds_1 = require("./voice/dashscopeCreds");
const whisper_1 = require("./voice/whisper");
function writeSse(res, event) {
    res.write(`event: ${event.event}\n`);
    res.write(`data: ${JSON.stringify(event.data)}\n\n`);
}
function writeJson(res, statusCode, data) {
    res.writeHead(statusCode, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
}
const TRANSCRIBE_BODY_LIMIT = Math.floor(2.5 * 1024 * 1024);
async function readBody(req, res, maxBytes) {
    try {
        return await (0, httpJson_1.readJson)(req, maxBytes);
    }
    catch (error) {
        if (error instanceof httpJson_1.BodyTooLargeError) {
            writeJson(res, 400, { error: "payload_too_large" });
            return undefined;
        }
        writeJson(res, 400, { error: "invalid_json" });
        return undefined;
    }
}
function createAgentServer(config) {
    const persona = (0, persona_1.loadPersona)(config.personaPath);
    const plugins = new registry_1.PluginRegistry(config.pluginsDir);
    let lastSettings = { ...shared_1.DEFAULT_HOSHI_SETTINGS };
    plugins.reload(lastSettings);
    const pool = (0, pg_1.createPgPool)(config.databaseUrl);
    const repo = new sessionRepo_1.SessionRepo(pool);
    const memoryRepo = new memoryRepo_1.MemoryRepo(pool);
    const ready = (0, pg_1.migratePg)(pool);
    const authToken = (0, node_crypto_1.randomUUID)();
    const llm = new openai_1.OpenAiCompatClient({
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        model: config.model
    }, (row) => {
        void ready.then(() => repo.insertUsage(row)).catch((error) => {
            console.error(JSON.stringify({
                src: "hoshi.usage",
                ok: false,
                message: error instanceof Error ? error.message : "insert failed"
            }));
        });
    });
    const runtime = new runtime_1.AgentRuntime({
        persona,
        llm,
        plugins
    });
    let chatSettings = { ...shared_1.DEFAULT_HOSHI_SETTINGS.chat };
    const applySettings = (settings) => {
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
        if (voice.ttsBackend === "gpt-sovits" &&
            (0, attach_1.voiceSessionCount)() === 0 &&
            (voice.gsvGptWeights.trim() || voice.gsvSovitsWeights.trim())) {
            void (0, gptSovits_1.applyGsvWeights)(voice).catch((error) => {
                console.error(JSON.stringify({
                    src: "hoshi.voice",
                    phase: "gsv_weights_save",
                    ok: false,
                    message: error instanceof Error ? error.message : "gsv weights failed"
                }));
            });
        }
    };
    const server = (0, node_http_1.createServer)(async (req, res) => {
        const method = req.method ?? "GET";
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        try {
            await ready;
        }
        catch (error) {
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
        if (!(0, agentAuth_1.httpAuthorized)(req, authToken)) {
            writeJson(res, 401, { error: "unauthorized" });
            return;
        }
        try {
            if (method === "GET" && url.pathname === "/v1/plugins") {
                plugins.reload(lastSettings);
                const data = { plugins: plugins.list() };
                writeJson(res, 200, data);
                return;
            }
            if (method === "GET" && url.pathname === "/v1/memories") {
                const status = url.searchParams.get("status");
                const memories = status === "superseded" ? await memoryRepo.listSuperseded() : await memoryRepo.listActive();
                const data = { memories };
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
                const patch = await readBody(req, res);
                if (!patch) {
                    return;
                }
                const text = (0, extract_1.sanitizeFactText)(patch.text ?? "");
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
                const data = { sessions };
                writeJson(res, 200, data);
                return;
            }
            if (method === "GET" && url.pathname === "/v1/usage") {
                const data = await repo.getUsageSummary();
                writeJson(res, 200, data);
                return;
            }
            if (method === "POST" && url.pathname === "/v1/sessions") {
                const body = await readBody(req, res);
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
                const data = { session, messages };
                writeJson(res, 200, data);
                return;
            }
            if (method === "POST" && url.pathname === "/v1/transcribe") {
                const body = await readBody(req, res, TRANSCRIBE_BODY_LIMIT);
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
                    const ds = (0, dashscopeCreds_1.resolveDashscopeCreds)(voice, snap);
                    let text = "";
                    if ((0, dashscopeCreds_1.hasDashscopeVoiceKey)(voice, snap)) {
                        text = await llm.transcribeWav(audioWavBase64, {
                            timeoutMs: 20000,
                            apiKey: ds.apiKey,
                            baseUrl: ds.baseUrl,
                            sessionId: body.sessionId?.trim()
                        });
                    }
                    else {
                        const raw = audioWavBase64.trim().replace(/^data:audio\/wav;base64,/i, "");
                        text = await (0, whisper_1.transcribeWithWhisper)(voice, Buffer.from(raw, "base64"));
                    }
                    console.error(JSON.stringify({
                        src: "hoshi.asr",
                        ok: true,
                        empty: !text,
                        ms: Date.now() - started
                    }));
                    if (!res.headersSent) {
                        writeJson(res, 200, { text });
                    }
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : "transcribe failed";
                    const statusMatch = message.match(/ASR request failed: (\d+)/);
                    console.error(JSON.stringify({
                        src: "hoshi.asr",
                        ok: false,
                        empty: false,
                        ms: Date.now() - started,
                        ...(statusMatch ? { status: Number(statusMatch[1]) } : {})
                    }));
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
            const body = await readBody(req, res);
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
                const { history, compactUsage } = await (0, sessionContext_1.buildSessionContext)(repo, sessionId, chatSettings, llm);
                for await (const event of (0, chatTurn_1.runSessionChat)({
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
            }
            catch (error) {
                const message = error instanceof Error ? error.message : "Unknown error";
                writeSse(res, { event: "error", data: { message } });
            }
            finally {
                res.end();
            }
        }
        catch (error) {
            if (!res.headersSent) {
                writeJson(res, 500, {
                    error: "internal",
                    message: error instanceof Error ? error.message : "unknown error"
                });
            }
        }
    });
    (0, attach_1.attachVoiceGateway)(server, {
        ready,
        authToken,
        getLlm: () => llm,
        getRuntime: () => runtime,
        getChatSettings: () => chatSettings,
        getVoiceSettings: () => lastSettings.voice,
        repo,
        memoryRepo,
        buildHistory: (sessionId) => (0, sessionContext_1.buildSessionContext)(repo, sessionId, chatSettings, llm)
    });
    (0, ttsGateway_1.attachTtsGateway)(server, {
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
