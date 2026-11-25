import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import {
  isChatImageMime,
  normalizeChatImageMime,
  type ChatMessage
} from "@hoshi/shared";
import { toLlmMessages, userContentWithImages, type LlmMessage } from "./llm/openai";

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif"
};

export interface ChatImagePayload {
  mime: string;
  data: string;
}

export interface ImageLookback {
  historyIndex: number;
  messageId: string;
}

export class ChatImageStore {
  constructor(readonly root: string) {}

  save(
    sessionId: string,
    messageId: string,
    images: ChatImagePayload[]
  ): Array<{ idx: number; mime: string; relPath: string }> {
    const saved: Array<{ idx: number; mime: string; relPath: string }> = [];
    for (let idx = 0; idx < images.length; idx += 1) {
      const mime = normalizeChatImageMime(images[idx]?.mime ?? "");
      const ext = EXT_BY_MIME[mime];
      const data = images[idx]?.data ?? "";
      if (!ext || !isChatImageMime(mime) || !data) {
        continue;
      }
      const relPath = `${sessionId}/${messageId}/${idx}.${ext}`;
      const abs = this.resolveInside(relPath);
      if (!abs) {
        continue;
      }
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, Buffer.from(data, "base64"));
      saved.push({ idx, mime, relPath });
    }
    return saved;
  }

  read(relPath: string): ChatImagePayload | null {
    const abs = this.resolveInside(relPath);
    if (!abs) {
      return null;
    }
    try {
      const data = readFileSync(abs).toString("base64");
      const mime = mimeFromRelPath(relPath);
      if (!data || !mime) {
        return null;
      }
      return { mime, data };
    } catch {
      return null;
    }
  }

  removeMessage(sessionId: string, messageId: string): void {
    const abs = this.resolveInside(join(sessionId, messageId));
    if (!abs) {
      return;
    }
    rmSync(abs, { recursive: true, force: true });
  }

  removeSession(sessionId: string): void {
    const abs = this.resolveInside(sessionId);
    if (!abs || abs === resolve(this.root)) {
      return;
    }
    rmSync(abs, { recursive: true, force: true });
  }

  resolveInside(relPath: string): string | null {
    if (!relPath || relPath.includes("\0")) {
      return null;
    }
    const root = resolve(this.root);
    const abs = resolve(root, relPath);
    if (abs !== root && !abs.startsWith(root + sep)) {
      return null;
    }
    return abs;
  }
}

export function findImageLookback(
  messages: Array<{ id: string; role: string; imageCount?: number }>,
  summaryCount: number
): ImageLookback | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const item = messages[i];
    if (item && item.role === "user" && (item.imageCount ?? 0) > 0) {
      return { historyIndex: summaryCount + i, messageId: item.id };
    }
  }
  return undefined;
}

/** 本轮没有新图时，把最近一条用户图挂回那条历史消息。 */
export function historyWithLookback(
  history: ChatMessage[],
  lookback: { historyIndex: number; images: ChatImagePayload[] } | null
): LlmMessage[] {
  const messages = toLlmMessages(history);
  if (!lookback || lookback.images.length === 0) {
    return messages;
  }
  const target = messages[lookback.historyIndex];
  if (!target || target.role !== "user" || typeof target.content !== "string") {
    return messages;
  }
  messages[lookback.historyIndex] = {
    role: "user",
    content: userContentWithImages(target.content, lookback.images)
  };
  return messages;
}

function mimeFromRelPath(relPath: string): string | null {
  const ext = relPath.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return null;
}
