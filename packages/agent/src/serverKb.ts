import type { IncomingMessage, ServerResponse } from "node:http";
import { MAX_TEXT_CHARS } from "./knowledge/service";
import type {
  KnowledgeChunksResponse,
  KnowledgeCollectionsResponse,
  KnowledgeDocumentsResponse,
  KnowledgeJobsResponse,
  KnowledgeSearchResponse,
  KnowledgeSearchTraceResponse
} from "./knowledge/types";
import type { AgentRouteCtx } from "./serverHttp";
import { readBody, writeJson } from "./serverHttp";

export async function handleKb(
  ctx: AgentRouteCtx,
  req: IncomingMessage,
  res: ServerResponse,
  method: string,
  url: URL
): Promise<boolean> {
  if (method === "GET" && url.pathname === "/v1/kb/collections") {
    const data: KnowledgeCollectionsResponse = {
      collections: await ctx.knowledgeService.listCollections(),
      capabilities: ctx.knowledgeService.capabilities()
    };
    writeJson(res, 200, data);
    return true;
  }

  if (method === "POST" && url.pathname === "/v1/kb/collections") {
    const body = await readBody<{ name?: string; description?: string }>(req, res);
    if (!body) {
      return true;
    }
    const collection = await ctx.knowledgeService.createCollection(body.name ?? "", body.description ?? "");
    writeJson(res, 200, collection);
    return true;
  }

  const collectionMatch = url.pathname.match(/^\/v1\/kb\/collections\/([0-9a-fA-F-]+)$/);
  if (collectionMatch && (method === "PATCH" || method === "DELETE")) {
    const id = collectionMatch[1];
    if (method === "DELETE") {
      const deleted = await ctx.knowledgeService.deleteCollection(id);
      if (!deleted) {
        writeJson(res, 404, { error: "collection_not_found" });
        return true;
      }
      writeJson(res, 200, { ok: true });
      return true;
    }
    const body = await readBody<{ name?: string; description?: string; enabled?: boolean }>(req, res);
    if (!body) {
      return true;
    }
    const updated = await ctx.knowledgeService.patchCollection(id, {
      name: body.name,
      description: body.description,
      enabled: body.enabled
    });
    if (!updated) {
      writeJson(res, 404, { error: "collection_not_found" });
      return true;
    }
    writeJson(res, 200, updated);
    return true;
  }

  const docsMatch = url.pathname.match(/^\/v1\/kb\/collections\/([0-9a-fA-F-]+)\/documents$/);
  if (docsMatch) {
    if (method === "GET") {
      const data: KnowledgeDocumentsResponse = {
        documents: await ctx.knowledgeService.listDocuments(docsMatch[1])
      };
      writeJson(res, 200, data);
      return true;
    }
    if (method === "POST") {
      const body = await readBody<{ title?: string; text?: string; sourceName?: string; mime?: string }>(req, res);
      if (!body) {
        return true;
      }
      const text = body.text ?? "";
      if (!text.trim()) {
        writeJson(res, 400, { error: "text_required" });
        return true;
      }
      if (text.length > MAX_TEXT_CHARS) {
        writeJson(res, 413, { error: "text_too_large", message: `文本超过上限 ${MAX_TEXT_CHARS} 字符` });
        return true;
      }
      const result = await ctx.knowledgeService.ingestDocument({
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
      return true;
    }
  }

  const docRetryMatch = url.pathname.match(/^\/v1\/kb\/documents\/([0-9a-fA-F-]+)\/retry$/);
  if (docRetryMatch && method === "POST") {
    const doc = await ctx.knowledgeService.retryDocument(docRetryMatch[1]);
    if (!doc) {
      writeJson(res, 404, { error: "document_not_found_or_no_source" });
      return true;
    }
    writeJson(res, 200, doc);
    return true;
  }

  const docMatch = url.pathname.match(/^\/v1\/kb\/documents\/([0-9a-fA-F-]+)$/);
  if (docMatch && method === "DELETE") {
    const deleted = await ctx.knowledgeService.deleteDocument(docMatch[1]);
    if (!deleted) {
      writeJson(res, 404, { error: "document_not_found" });
      return true;
    }
    writeJson(res, 200, { ok: true });
    return true;
  }
  if (docMatch && method === "PATCH") {
    const body = await readBody<{ disabled?: boolean }>(req, res);
    if (!body) {
      return true;
    }
    const ok = await ctx.knowledgeService.setDocumentDisabled(docMatch[1], body.disabled === true);
    if (!ok) {
      writeJson(res, 404, { error: "document_not_found" });
      return true;
    }
    writeJson(res, 200, { ok: true });
    return true;
  }

  const chunksMatch = url.pathname.match(/^\/v1\/kb\/documents\/([0-9a-fA-F-]+)\/chunks$/);
  if (chunksMatch && method === "GET") {
    const offsetRaw = Number(url.searchParams.get("offset") ?? 0);
    const limitRaw = Number(url.searchParams.get("limit") ?? 50);
    const result = await ctx.knowledgeService.listChunks(
      chunksMatch[1],
      Number.isFinite(offsetRaw) ? offsetRaw : 0,
      Number.isFinite(limitRaw) ? limitRaw : 50
    );
    const data: KnowledgeChunksResponse = { chunks: result.chunks, total: result.total };
    writeJson(res, 200, data);
    return true;
  }

  const chunkPatchMatch = url.pathname.match(/^\/v1\/kb\/chunks\/([0-9a-fA-F-]+)$/);
  if (chunkPatchMatch && method === "PATCH") {
    const body = await readBody<{ text?: string }>(req, res);
    if (!body) {
      return true;
    }
    const text = body.text?.trim() ?? "";
    if (!text) {
      writeJson(res, 400, { error: "text_required" });
      return true;
    }
    try {
      const ok = await ctx.knowledgeService.updateChunk(chunkPatchMatch[1], text);
      if (!ok) {
        writeJson(res, 404, { error: "chunk_not_found" });
        return true;
      }
      writeJson(res, 200, { ok: true });
    } catch (error) {
      writeJson(res, 500, {
        error: "chunk_update_failed",
        message: error instanceof Error ? error.message : "unknown"
      });
    }
    return true;
  }

  if (method === "POST" && url.pathname === "/v1/kb/search") {
    const body = await readBody<{
      query?: string;
      collectionIds?: string[];
      topK?: number;
      includeTrace?: boolean;
    }>(req, res);
    if (!body) {
      return true;
    }
    const query = body.query?.trim() ?? "";
    if (!query) {
      writeJson(res, 400, { error: "query_required" });
      return true;
    }
    if (body.includeTrace) {
      const { hits, trace } = await ctx.knowledgeService.searchWithTrace(query, {
        collectionIds: body.collectionIds,
        topK: body.topK
      });
      const data: KnowledgeSearchTraceResponse = { hits, trace };
      writeJson(res, 200, data);
    } else {
      const hits = await ctx.knowledgeService.search(query, {
        collectionIds: body.collectionIds,
        topK: body.topK
      });
      const data: KnowledgeSearchResponse = { hits };
      writeJson(res, 200, data);
    }
    return true;
  }

  if (method === "POST" && url.pathname === "/v1/kb/reindex-all") {
    try {
      const result = await ctx.knowledgeService.reindexAll();
      writeJson(res, 200, result);
    } catch (error) {
      writeJson(res, 500, { error: "reindex_failed", message: error instanceof Error ? error.message : "unknown" });
    }
    return true;
  }

  if (method === "GET" && url.pathname === "/v1/kb/jobs") {
    const jobs = await ctx.knowledgeService.listJobs({ limit: 200 });
    const data: KnowledgeJobsResponse = { jobs, pending: ctx.knowledgeService.pendingJobs() };
    writeJson(res, 200, data);
    return true;
  }

  const rememberMatch = url.pathname.match(/^\/v1\/kb\/chunks\/([0-9a-fA-F-]+)\/remember$/);
  if (rememberMatch && method === "POST") {
    const context = await ctx.knowledgeService.getChunkContext(rememberMatch[1]);
    if (!context) {
      writeJson(res, 404, { error: "chunk_not_found" });
      return true;
    }
    const text = context.text.replace(/\s+/g, " ").trim();
    if (!text) {
      writeJson(res, 400, { error: "empty_chunk" });
      return true;
    }
    const memory = await ctx.memoryRepo.insert(text, null, "other", context.title, {
      source: "knowledge",
      chunkId: rememberMatch[1],
      documentId: context.documentId,
      documentTitle: context.title,
      collectionId: context.collectionId
    });
    await ctx.memoryRepo.markAcked([memory.id]);
    writeJson(res, 200, memory);
    return true;
  }

  return false;
}
