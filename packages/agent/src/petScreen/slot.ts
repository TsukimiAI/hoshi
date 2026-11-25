import { CHAT_IMAGE_MAX_DATA_CHARS, PET_SCREEN } from "@hoshi/shared";

export type PetScreenFrame = {
  sessionId: string;
  mime: "image/jpeg";
  data: string;
  hash: string;
  at: number;
};

export type PutPetScreenResult =
  | { ok: true; stored: boolean }
  | { ok: false; reason: "mime" | "empty" | "too-large" | "hash" };

const HASH = /^[0-9a-f]{16}$/;

export class PetScreenSlot {
  private frame: PetScreenFrame | null = null;
  private commentedHash = "";
  private commentedAt = 0;
  private busy = false;

  put(input: {
    sessionId: string;
    mime: string;
    data: string;
    hash: string;
    now: number;
  }): PutPetScreenResult {
    if (input.mime !== "image/jpeg") {
      return { ok: false, reason: "mime" };
    }
    const data = input.data.replace(/\s+/g, "");
    if (!data) {
      return { ok: false, reason: "empty" };
    }
    if (data.length > CHAT_IMAGE_MAX_DATA_CHARS) {
      return { ok: false, reason: "too-large" };
    }
    const hash = input.hash.trim().toLowerCase();
    if (!HASH.test(hash)) {
      return { ok: false, reason: "hash" };
    }
    if (this.frame && this.frame.hash === hash && this.frame.sessionId === input.sessionId) {
      return { ok: true, stored: false };
    }
    this.frame = {
      sessionId: input.sessionId,
      mime: "image/jpeg",
      data,
      hash,
      at: input.now
    };
    return { ok: true, stored: true };
  }

  read(sessionId: string, now: number): PetScreenFrame | null {
    if (!this.frame || this.frame.sessionId !== sessionId) {
      return null;
    }
    if (now - this.frame.at > PET_SCREEN.frameTtlMs) {
      return null;
    }
    return this.frame;
  }

  clearPixels(): void {
    this.frame = null;
  }

  clearIfSession(sessionId: string): void {
    if (this.frame?.sessionId === sessionId) {
      this.frame = null;
    }
  }

  commented(): { hash: string; at: number } {
    return { hash: this.commentedHash, at: this.commentedAt };
  }

  markSpoken(hash: string, at: number): void {
    this.commentedHash = hash;
    this.commentedAt = at;
  }

  tryBegin(): boolean {
    if (this.busy) {
      return false;
    }
    this.busy = true;
    return true;
  }

  end(): void {
    this.busy = false;
  }
}

export function freshPetScreen(input: {
  enabled: boolean;
  kind: "chat" | "desk";
  sessionId: string;
  now: number;
  slot: PetScreenSlot;
}): { mime: "image/jpeg"; data: string } | null {
  if (!input.enabled || input.kind !== "chat") {
    return null;
  }
  const frame = input.slot.read(input.sessionId, input.now);
  if (!frame) {
    return null;
  }
  return { mime: frame.mime, data: frame.data };
}
