/** 与 packages/shared/src/chatImage.ts 的类型和大小上限一致。 */

const CHAT_IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const CHAT_IMAGE_MAX_BYTES = 1_350_000;
const CHAT_IMAGE_MAX_DATA_CHARS = 1_800_000;

export interface PendingChatImage {
  mime: string;
  data: string;
  preview: string;
}

function normalizeMime(mime: string): string {
  const value = mime.trim().toLowerCase();
  return value === "image/jpg" ? "image/jpeg" : value;
}

export async function readChatImageFile(file: File): Promise<PendingChatImage | { error: string }> {
  const mime = normalizeMime(file.type);
  if (!CHAT_IMAGE_MIMES.has(mime)) {
    return { error: "只支持 png、jpeg、webp、gif" };
  }
  if (file.size > CHAT_IMAGE_MAX_BYTES) {
    return { error: "单张图片太大" };
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("读图失败"));
    reader.readAsDataURL(file);
  });
  const comma = dataUrl.indexOf(",");
  const data = dataUrl.slice(comma + 1).replace(/\s+/g, "");
  if (!data || data.length > CHAT_IMAGE_MAX_DATA_CHARS) {
    return { error: "单张图片太大" };
  }
  return { mime, data, preview: dataUrl };
}

export async function takeChatImages(
  files: FileList | File[],
  pending: PendingChatImage[],
  maxCount = 4
): Promise<string> {
  let rejected = "";
  for (const file of Array.from(files)) {
    if (pending.length >= maxCount) {
      rejected = "最多 4 张图片";
      break;
    }
    let read: PendingChatImage | { error: string };
    try {
      read = await readChatImageFile(file);
    } catch {
      rejected = "读图失败";
      continue;
    }
    if ("error" in read) {
      rejected = read.error;
      continue;
    }
    pending.push(read);
  }
  return rejected;
}
