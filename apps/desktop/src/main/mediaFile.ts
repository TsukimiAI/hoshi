import { createReadStream, statSync } from "node:fs";
import { extname } from "node:path";
import { Readable } from "node:stream";

const MIME: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg"
};

export function mediaMime(abs: string): string {
  return MIME[extname(abs).toLowerCase()] || "application/octet-stream";
}

export function parseByteRange(
  size: number,
  header: string | null
): { start: number; end: number } | "full" | "unsatisfiable" {
  if (!header) return "full";
  const m = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!m) return "full";
  const hasStart = m[1] !== "";
  const hasEnd = m[2] !== "";
  if (!hasStart && !hasEnd) return "unsatisfiable";
  let start = 0;
  let end = size - 1;
  if (!hasStart && hasEnd) {
    const suffix = Number(m[2]);
    if (!Number.isFinite(suffix) || suffix <= 0) return "unsatisfiable";
    start = Math.max(0, size - suffix);
  } else {
    start = Number(m[1]);
    if (hasEnd) end = Number(m[2]);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= size || end < start) {
    return "unsatisfiable";
  }
  return { start, end: Math.min(end, size - 1) };
}

function body(abs: string, start?: number, end?: number): ReadableStream {
  const stream =
    start != null && end != null ? createReadStream(abs, { start, end }) : createReadStream(abs);
  return Readable.toWeb(stream) as unknown as ReadableStream;
}

export function serveLocalMedia(abs: string, request: Request): Response {
  const size = statSync(abs).size;
  const type = mediaMime(abs);
  const base: Record<string, string> = {
    "Accept-Ranges": "bytes",
    "Content-Type": type
  };
  const parsed = parseByteRange(size, request.headers.get("range"));
  if (parsed === "unsatisfiable") {
    return new Response(null, {
      status: 416,
      headers: { ...base, "Content-Range": `bytes */${size}` }
    });
  }
  const partial = parsed !== "full";
  const start = partial ? parsed.start : 0;
  const end = partial ? parsed.end : size - 1;
  const len = size === 0 ? 0 : end - start + 1;
  const headers: Record<string, string> = {
    ...base,
    "Content-Length": String(len)
  };
  if (partial) headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
  const status = partial ? 206 : 200;
  if (request.method === "HEAD" || size === 0) {
    return new Response(null, { status, headers });
  }
  return new Response(body(abs, partial ? start : undefined, partial ? end : undefined), {
    status,
    headers
  });
}
