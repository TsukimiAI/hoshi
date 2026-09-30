import { basename, extname } from "node:path";

export type AudioTag = {
  path: string;
  title: string;
  artist: string;
  album: string;
  picture: string | null;
};

const TITLE_MAX = 80;
const PICTURE_MAX = 256_000;

function fallbackTitle(file: string): string {
  return basename(file, extname(file)).trim().slice(0, TITLE_MAX) || "未知曲目";
}

function synchsafe(buf: Buffer, offset: number): number {
  return ((buf[offset] & 0x7f) << 21) | ((buf[offset + 1] & 0x7f) << 14) | ((buf[offset + 2] & 0x7f) << 7) | (buf[offset + 3] & 0x7f);
}

function u32(buf: Buffer, offset: number): number {
  return buf.readUInt32BE(offset);
}

function decodeText(enc: number, data: Buffer): string {
  if (!data.length) return "";
  try {
    if (enc === 1 || enc === 2) {
      return data.toString("utf16le").replace(/\0/g, "").trim();
    }
    if (enc === 3) {
      return data.toString("utf8").replace(/\0/g, "").trim();
    }
    return data.toString("latin1").replace(/\0/g, "").trim();
  } catch {
    return "";
  }
}

function parseApic(data: Buffer): string | null {
  if (data.length < 4) return null;
  const enc = data[0];
  let i = 1;
  const z1 = data.indexOf(0, i);
  if (z1 < 0) return null;
  const mime = data.subarray(i, z1).toString("latin1") || "image/jpeg";
  i = z1 + 1;
  if (i >= data.length) return null;
  i += 1;
  if (enc === 1 || enc === 2) {
    while (i + 1 < data.length && !(data[i] === 0 && data[i + 1] === 0)) i += 2;
    i += 2;
  } else {
    const z2 = data.indexOf(0, i);
    i = z2 < 0 ? data.length : z2 + 1;
  }
  const pic = data.subarray(Math.min(i, data.length));
  if (!pic.length || pic.length > PICTURE_MAX) return null;
  const safeMime = mime.startsWith("image/") ? mime : "image/jpeg";
  return `data:${safeMime};base64,${pic.toString("base64")}`;
}

function parseId3(buf: Buffer): { title: string; artist: string; album: string; picture: string | null } | null {
  if (buf.length < 10 || buf.subarray(0, 3).toString("latin1") !== "ID3") return null;
  const ver = buf[3];
  const size = synchsafe(buf, 6);
  const end = Math.min(buf.length, 10 + size);
  let offset = 10;
  if (buf[5] & 0x40) {
    if (offset + 4 > end) return null;
    offset += synchsafe(buf, offset);
  }
  const fields: Record<string, string> = {};
  let picture: string | null = null;
  while (offset + 10 <= end) {
    const id = buf.subarray(offset, offset + 4).toString("latin1");
    if (!/^[A-Z0-9]{4}$/.test(id)) break;
    const frameSize = ver === 4 ? synchsafe(buf, offset + 4) : u32(buf, offset + 4);
    offset += 10;
    if (frameSize <= 0 || offset + frameSize > buf.length) break;
    const body = buf.subarray(offset, offset + frameSize);
    offset += frameSize;
    if (id === "APIC" || id === "PIC") {
      picture = parseApic(body) ?? picture;
      continue;
    }
    if (id === "TIT2" || id === "TPE1" || id === "TALB" || id === "TT2" || id === "TP1" || id === "TAL") {
      const text = decodeText(body[0] ?? 0, body.subarray(1));
      if (id === "TIT2" || id === "TT2") fields.title = text;
      if (id === "TPE1" || id === "TP1") fields.artist = text;
      if (id === "TALB" || id === "TAL") fields.album = text;
    }
  }
  return {
    title: (fields.title ?? "").slice(0, TITLE_MAX),
    artist: (fields.artist ?? "").slice(0, TITLE_MAX),
    album: (fields.album ?? "").slice(0, TITLE_MAX),
    picture
  };
}

export function parseAudioTags(path: string, buf: Buffer): AudioTag {
  const fromName = fallbackTitle(path);
  const id3 = parseId3(buf);
  return {
    path,
    title: id3?.title || fromName,
    artist: id3?.artist || "",
    album: id3?.album || "",
    picture: id3?.picture ?? null
  };
}

export function audioTagFromPath(path: string): AudioTag {
  return { path, title: fallbackTitle(path), artist: "", album: "", picture: null };
}
