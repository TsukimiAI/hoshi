export const CHAT_IMAGE_MIMES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

export const CHAT_IMAGE_MAX_COUNT = 4;

/** 与 sanitize 的 base64 上限一致，约 1.35MB 原始字节。 */
export const CHAT_IMAGE_MAX_DATA_CHARS = 1_800_000;

export const CHAT_IMAGE_MAX_BYTES = 1_350_000;

export type ChatImageMime = (typeof CHAT_IMAGE_MIMES)[number];

export function normalizeChatImageMime(mime: string): string {
  const normalized = mime.trim().toLowerCase();
  return normalized === "image/jpg" ? "image/jpeg" : normalized;
}

export function isChatImageMime(mime: string): mime is ChatImageMime {
  return (CHAT_IMAGE_MIMES as readonly string[]).includes(normalizeChatImageMime(mime));
}

export function imageOnlyUserText(count: number): string {
  return `（老师发来了 ${count} 张图片）`;
}

export function isImageOnlyUserText(text: string): boolean {
  return /^（老师发来了 \d+ 张图片）$/.test(text.trim());
}
