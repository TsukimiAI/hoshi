import type { IncomingMessage, ServerResponse } from "node:http";
import { canvasItemIdFromPath } from "./canvas/id";
import type { AgentRouteCtx } from "./serverHttp";
import { readBody, writeJson } from "./serverHttp";

export async function handleCanvas(
  ctx: AgentRouteCtx,
  req: IncomingMessage,
  res: ServerResponse,
  method: string,
  url: URL
): Promise<boolean> {
  const snapshotMatch = url.pathname.match(/^\/v1\/sessions\/([0-9a-fA-F-]+)\/canvas-snapshots$/);
  if (method === "GET" && snapshotMatch) {
    const sessionId = snapshotMatch[1];
    const session = await ctx.repo.getSession(sessionId);
    if (!session) {
      writeJson(res, 404, { error: "session_not_found" });
      return true;
    }
    writeJson(res, 200, {
      snapshots: ctx.canvasRepo.listSnapshots(sessionId),
      activity: ctx.canvasRepo.listActivity(sessionId)
    });
    return true;
  }

  if (method === "GET" && url.pathname === "/v1/canvas") {
    const canvasSessionId = url.searchParams.get("sessionId")?.trim() ?? "";
    if (!canvasSessionId) {
      writeJson(res, 400, { error: "session_id_required" });
      return true;
    }
    if (!(await ctx.repo.getSession(canvasSessionId))) {
      writeJson(res, 404, { error: "session_not_found" });
      return true;
    }
    writeJson(res, 200, { items: ctx.canvasRepo.list(canvasSessionId) });
    return true;
  }

  if (method === "POST" && url.pathname === "/v1/canvas/restore") {
    const restoreBody = await readBody<{ sessionId?: string; turnId?: string }>(req, res);
    if (!restoreBody) {
      return true;
    }
    const sessionId = restoreBody.sessionId?.trim() ?? "";
    const turnId = restoreBody.turnId?.trim() ?? "";
    if (!sessionId || !turnId) {
      writeJson(res, 400, { error: "session_id_and_turn_id_required" });
      return true;
    }
    if (!(await ctx.repo.getSession(sessionId))) {
      writeJson(res, 404, { error: "session_not_found" });
      return true;
    }
    const items = ctx.canvasRepo.restoreFromSnapshot(sessionId, turnId);
    if (!items) {
      writeJson(res, 404, { error: "snapshot_not_found" });
      return true;
    }
    writeJson(res, 200, { items });
    return true;
  }

  if (method === "POST" && url.pathname === "/v1/canvas/reorder") {
    const orderBody = await readBody<{ sessionId?: string; ids?: string[] }>(req, res);
    if (!orderBody) {
      return true;
    }
    const sessionId = orderBody.sessionId?.trim() ?? "";
    const ids = Array.isArray(orderBody.ids) ? orderBody.ids.map((id) => String(id).trim()).filter(Boolean) : [];
    if (!sessionId || ids.length === 0) {
      writeJson(res, 400, { error: "session_id_and_ids_required" });
      return true;
    }
    if (!(await ctx.repo.getSession(sessionId))) {
      writeJson(res, 404, { error: "session_not_found" });
      return true;
    }
    writeJson(res, 200, { items: ctx.canvasRepo.reorder(sessionId, ids) });
    return true;
  }

  const canvasItemId = canvasItemIdFromPath(url.pathname);
  if (canvasItemId && method === "PATCH") {
    const patchBody = await readBody<{ x?: number; y?: number; w?: number; h?: number; z?: number }>(req, res);
    if (!patchBody) {
      return true;
    }
    const sessionId = url.searchParams.get("sessionId")?.trim() || undefined;
    const item = ctx.canvasRepo.patchLayout(canvasItemId, patchBody, sessionId);
    if (!item) {
      writeJson(res, 404, { error: "canvas_not_found" });
      return true;
    }
    writeJson(res, 200, item);
    return true;
  }
  if (canvasItemId && method === "DELETE") {
    const sessionId = url.searchParams.get("sessionId")?.trim() || undefined;
    const ok = ctx.canvasRepo.remove(canvasItemId, sessionId);
    if (!ok) {
      writeJson(res, 404, { error: "canvas_not_found" });
      return true;
    }
    writeJson(res, 200, { ok: true });
    return true;
  }

  return false;
}
