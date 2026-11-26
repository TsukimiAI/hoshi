import type { IncomingMessage, ServerResponse } from "node:http";
import type { ChatRequestBody } from "@hoshi/shared";
import { isAbortTimeout, sanitizeChatImages } from "./llm/openai";
import { resolveDashscopeCreds, hasDashscopeVoiceKey } from "./voice/dashscopeCreds";
import { transcribeWithWhisper } from "./voice/whisper";
import { runSessionChat } from "./chatTurn";
import { freshPetScreen } from "./petScreen/slot";
import { buildSessionContext } from "./sessionContext";
import { CANVAS_USAGE_PROMPT, runWithCanvasTurn, updateCanvasTurn } from "./canvas/tool";
import { composeTurnHint } from "./retrieval/plan";
import { SessionRepo } from "./storage/sessionRepo";
import type { AgentRouteCtx } from "./serverHttp";
import { readBody, resolveChatDeskMode, writeJson, writeSse } from "./serverHttp";

const TRANSCRIBE_BODY_LIMIT = Math.floor(2.5 * 1024 * 1024);

export async function handleChat(
  ctx: AgentRouteCtx,
  req: IncomingMessage,
  res: ServerResponse,
  method: string,
  url: URL
): Promise<void> {
  if (method === "POST" && url.pathname === "/v1/transcribe") {
    const body = await readBody<{ audioWavBase64?: string; sessionId?: string }>(req, res, TRANSCRIBE_BODY_LIMIT);
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
      const voice = ctx.getSettings().voice;
      const ds = resolveDashscopeCreds(voice);
      let text = "";
      if (hasDashscopeVoiceKey(voice)) {
        text = await ctx.llm.transcribeWav(audioWavBase64, {
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
    const session = await ctx.repo.getSession(sessionId);
    if (!session) {
      writeSse(res, { event: "error", data: { message: "session not found" } });
      return;
    }

    ctx.knowledgeHost.takeCitations();
    const mode = resolveChatDeskMode({ sessionKind: session.kind, workspace: body.workspace });
    if (!mode.ok) {
      writeSse(res, { event: "error", data: { message: mode.message } });
      return;
    }
    const desk = mode.desk;
    const requestedImages = Array.isArray(body.images) ? body.images.length : 0;
    const images = sanitizeChatImages(body.images);
    if (requestedImages > 0 && images.length === 0) {
      writeSse(res, { event: "error", data: { message: "图片无法识别，请换 png、jpeg、webp 或 gif，且单张不要过大" } });
      return;
    }
    const hint = desk ? String(body.message ?? "") : "";
    ctx.canvasHost.setEnabled(desk, sessionId);
    ctx.webHost.setEnabled(true);
    ctx.canvasHost.setTurnHint(hint);
    const runTurn = async (): Promise<void> => {
      const images = sanitizeChatImages(body.images);
      const chatSettings = ctx.getChatSettings();
      const { history, compactUsage, lookback } = await buildSessionContext(
        ctx.repo,
        sessionId,
        chatSettings,
        ctx.llm
      );
      const turned = await ctx.turnWithInterval(sessionId, body.message ?? "", session.kind, {
        history,
        lookback
      });
      let lookbackImages: Awaited<ReturnType<SessionRepo["readMessageImages"]>> = [];
      if (images.length === 0 && lookback) {
        lookbackImages = await ctx.repo.readMessageImages(lookback.messageId);
      }
      if (desk) {
        const prior = history
          .filter((item) => item.role === "user")
          .slice(-4)
          .map((item) => item.content)
          .join("\n");
        const composed = composeTurnHint(hint, prior);
        ctx.canvasHost.setTurnHint(composed);
        updateCanvasTurn({ hint: composed });
      }
      const settings = ctx.getSettings();
      for await (const event of runSessionChat({
        repo: ctx.repo,
        memoryRepo: ctx.memoryRepo,
        runtime: ctx.runtime,
        llm: ctx.llm,
        chatSettings,
        sessionId,
        message: body.message,
        history: turned.history,
        compactUsage,
        signal: turnAbort.signal,
        canvasPrompt: desk ? `${CANVAS_USAGE_PROMPT}\n${ctx.canvasHost.inventoryPrompt() ?? ""}` : undefined,
        images,
        screen: desk
          ? null
          : freshPetScreen({
              enabled: settings.screen.enabled,
              kind: session.kind,
              sessionId,
              now: Date.now(),
              slot: ctx.petSlot,
              ignoreTtl: Boolean(turned.intervalId)
            }),
        intervalId: turned.intervalId,
        lookback:
          images.length === 0 && !turned.intervalId && lookback && lookbackImages.length > 0
            ? { historyIndex: lookback.historyIndex, images: lookbackImages }
            : undefined,
        workspace: desk ? "desk" : undefined,
        commitCanvas: desk
          ? async ({ turnId, sessionId: sid, userMessageId, steps }) => {
              await ctx.canvasHost.flushPortraits(sid);
              ctx.canvasRepo.saveActivity({
                turnId,
                sessionId: sid,
                userMessageId,
                steps: steps ?? []
              });
              const validationError = ctx.canvasHost.takeValidationError();
              const items = validationError ? [] : ctx.canvasRepo.list(sid);
              const document = {
                version: 1 as const,
                turnId,
                sessionId: sid,
                items,
                ...(validationError ? { validationError } : {})
              };
              ctx.canvasRepo.saveSnapshot({
                turnId,
                sessionId: sid,
                userMessageId,
                document
              });
              ctx.canvasHost.takeChanges();
              return validationError ? { items, validationError } : { items };
            }
          : undefined
      })) {
        if (turnAbort.signal.aborted) {
          break;
        }
        writeSse(res, event);
      }
      const citations = ctx.knowledgeHost.takeCitations();
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
    const message = isAbortTimeout(error) || /模型请求超时|超时/.test(raw) ? "回答超时，请再试一次" : raw;
    writeSse(res, { event: "error", data: { message } });
  } finally {
    ctx.canvasHost.setEnabled(false);
    ctx.webHost.setEnabled(false);
    res.end();
  }
}
