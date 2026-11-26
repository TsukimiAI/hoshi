import type { IncomingMessage, ServerResponse } from "node:http";
import type { PetGlanceRequest, PetScreenPutRequest } from "@hoshi/shared";
import { matchGlanceInterval } from "./petScreen/content";
import { runPetGlance } from "./petScreen/glance";
import type { AgentRouteCtx } from "./serverHttp";
import { readBody, writeJson, writeSse } from "./serverHttp";

export async function handlePet(
  ctx: AgentRouteCtx,
  req: IncomingMessage,
  res: ServerResponse,
  method: string,
  url: URL
): Promise<boolean> {
  if (method === "POST" && url.pathname === "/v1/pet/glance-join") {
    const body = await readBody<{ sessionId?: string; message?: string }>(req, res, 64 * 1024);
    if (!body) {
      return true;
    }
    const sessionId = body.sessionId?.trim() ?? "";
    const session = sessionId ? await ctx.repo.getSession(sessionId) : null;
    const settings = ctx.getSettings();
    const intervalId =
      session &&
      matchGlanceInterval({
        enabled: settings.screen.enabled,
        kind: session.kind,
        sessionId,
        message: body.message ?? "",
        now: Date.now(),
        open: ctx.petSlot.openInterval()
      });
    writeJson(res, 200, { join: Boolean(intervalId) });
    return true;
  }

  if (method === "POST" && url.pathname === "/v1/pet/screen") {
    const body = await readBody<PetScreenPutRequest>(req, res, 8 * 1024 * 1024);
    if (!body) {
      return true;
    }
    const sessionId = body.sessionId?.trim() ?? "";
    const session = sessionId ? await ctx.repo.getSession(sessionId) : null;
    if (!session) {
      writeJson(res, 404, { message: "会话不存在" });
      return true;
    }
    if (session.kind !== "chat") {
      writeJson(res, 400, { message: "只有桌宠会话可以看桌面" });
      return true;
    }
    const settings = ctx.getSettings();
    if (!settings.screen.enabled) {
      ctx.petSlot.clearPixels();
      ctx.petSlot.clearInterval();
      writeJson(res, 400, { message: "看着桌面没有打开" });
      return true;
    }
    const stored = ctx.petSlot.put({
      sessionId,
      mime: body.mime ?? "",
      data: body.data ?? "",
      hash: body.hash ?? "",
      now: Date.now()
    });
    if (!stored.ok) {
      writeJson(res, 400, { message: stored.reason === "too-large" ? "图片太大" : "图片无法识别" });
      return true;
    }
    console.info(
      JSON.stringify({
        src: "hoshi.screen",
        sessionId,
        hash: (body.hash ?? "").trim().toLowerCase(),
        bytes: (body.data ?? "").replace(/\s+/g, "").length,
        stored: stored.stored
      })
    );
    writeJson(res, 200, { ok: true, stored: stored.stored });
    return true;
  }

  if (method === "POST" && url.pathname === "/v1/pet/glance") {
    const body = await readBody<PetGlanceRequest>(req, res);
    if (!body) {
      return true;
    }
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    });
    const glanceAbort = new AbortController();
    const abortGlance = (): void => {
      if (!glanceAbort.signal.aborted) {
        glanceAbort.abort();
      }
    };
    req.once("aborted", abortGlance);
    req.once("close", () => {
      if (!res.writableEnded) {
        abortGlance();
      }
    });
    try {
      const sessionId = body.sessionId?.trim() ?? "";
      const session = sessionId ? await ctx.repo.getSession(sessionId) : null;
      if (!session) {
        writeSse(res, { event: "error", data: { message: "会话不存在" } });
      } else {
        const settings = ctx.getSettings();
        const events = await runPetGlance({
          sessionId,
          sessionKind: session.kind,
          enabled: settings.screen.enabled,
          stillEnabled: () => ctx.getSettings().screen.enabled,
          personaPrompt: ctx.persona.systemPrompt,
          now: Date.now(),
          signal: glanceAbort.signal,
          slot: ctx.petSlot,
          completeChat: (messages) => ctx.llm.completeChat(messages, [], { timeoutMs: 60_000 }),
          appendMessage: (row) => ctx.repo.appendMessage(row)
        });
        for (const event of events) {
          writeSse(res, event);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "看桌面失败";
      writeSse(res, { event: "error", data: { message } });
    }
    res.end();
    return true;
  }

  return false;
}
