import type { IncomingMessage, ServerResponse } from "node:http";
import type { SessionKind, SessionListResponse, SessionMessagesResponse, UsageSummaryResponse } from "@hoshi/shared";
import type { AgentRouteCtx } from "./serverHttp";
import { readBody, writeJson } from "./serverHttp";

export async function handleSessions(
  ctx: AgentRouteCtx,
  req: IncomingMessage,
  res: ServerResponse,
  method: string,
  url: URL
): Promise<boolean> {
  if (method === "GET" && url.pathname === "/v1/sessions") {
    const kind: SessionKind = url.searchParams.get("kind") === "desk" ? "desk" : "chat";
    const sessions = await ctx.repo.listSessions(30, kind);
    const data: SessionListResponse = { sessions };
    writeJson(res, 200, data);
    return true;
  }

  if (method === "GET" && url.pathname === "/v1/usage") {
    const data: UsageSummaryResponse = await ctx.repo.getUsageSummary();
    writeJson(res, 200, data);
    return true;
  }

  if (method === "POST" && url.pathname === "/v1/sessions") {
    const body = await readBody<{ title?: string; kind?: SessionKind }>(req, res);
    if (!body) {
      return true;
    }
    const session = await ctx.repo.createSession(body.title, body.kind === "desk" ? "desk" : "chat");
    writeJson(res, 200, session);
    return true;
  }

  const deleteMatch = url.pathname.match(/^\/v1\/sessions\/([0-9a-fA-F-]+)$/);
  if (method === "DELETE" && deleteMatch) {
    const deleted = await ctx.repo.deleteSession(deleteMatch[1]);
    if (!deleted) {
      writeJson(res, 404, { error: "session_not_found" });
      return true;
    }
    ctx.petSlot.clearIfSession(deleteMatch[1]);
    writeJson(res, 200, { ok: true });
    return true;
  }

  const imageMatch = url.pathname.match(
    /^\/v1\/sessions\/([0-9a-fA-F-]+)\/messages\/([0-9a-fA-F-]+)\/images$/
  );
  if (method === "GET" && imageMatch) {
    const sessionId = imageMatch[1];
    const messageId = imageMatch[2];
    const session = await ctx.repo.getSession(sessionId);
    if (!session) {
      writeJson(res, 404, { error: "session_not_found" });
      return true;
    }
    const owned = await ctx.repo.messageInSession(sessionId, messageId);
    if (!owned) {
      writeJson(res, 404, { error: "message_not_found" });
      return true;
    }
    writeJson(res, 200, { images: await ctx.repo.readMessageImages(messageId) });
    return true;
  }

  const sessionMatch = url.pathname.match(/^\/v1\/sessions\/([0-9a-fA-F-]+)\/messages$/);
  if (method === "GET" && sessionMatch) {
    const sessionId = sessionMatch[1];
    const session = await ctx.repo.getSession(sessionId);
    if (!session) {
      writeJson(res, 404, { error: "session_not_found" });
      return true;
    }
    const messages = await ctx.repo.listMessages(sessionId, 200);
    const data: SessionMessagesResponse = { session, messages };
    writeJson(res, 200, data);
    return true;
  }

  return false;
}
