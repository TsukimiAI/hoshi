import type { IncomingMessage } from "node:http";

export const JSON_BODY_LIMIT = 1024 * 1024;

export class BodyTooLargeError extends Error {
  constructor() {
    super("payload too large");
    this.name = "BodyTooLargeError";
  }
}

export async function readJson<T>(
  req: IncomingMessage,
  maxBytes = JSON_BODY_LIMIT
): Promise<T> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.from(chunk);
    size += buf.length;
    if (size > maxBytes) {
      throw new BodyTooLargeError();
    }
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) {
    return {} as T;
  }
  return JSON.parse(raw) as T;
}
