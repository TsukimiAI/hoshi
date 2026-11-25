export const PET_SCREEN = {
  intervalMs: 20_000,
  minIntervalMs: 8_000,
  cooldownMs: 60_000,
  frameTtlMs: 30_000,
  maxEdge: 1280,
  jpegQuality: 60,
  hashThreshold: 10
} as const;

const DHASH_WIDTH = 9;
const DHASH_HEIGHT = 8;
const DHASH_SAMPLES = DHASH_WIDTH * DHASH_HEIGHT;

export type PetScreenShot =
  | { ok: true; mime: "image/jpeg"; data: string; hash: string }
  | { ok: false; reason: "denied" | "restricted" | "no-source" | "failed" };

export type ScreenCaptureGate = "proceed" | "restricted" | "denied";

/** 相邻不等时比大小。相等时看左像素亮不亮，否则全黑和全白都会收成同一个哈希。 */
export function dHashFromGray(samples: readonly number[]): string {
  if (samples.length !== DHASH_SAMPLES) {
    throw new Error("dhash samples");
  }
  let bits = 0n;
  for (let y = 0; y < DHASH_HEIGHT; y += 1) {
    const row = y * DHASH_WIDTH;
    for (let x = 0; x < DHASH_WIDTH - 1; x += 1) {
      const left = samples[row + x] ?? 0;
      const right = samples[row + x + 1] ?? 0;
      const bit = left === right ? left >= 128 : left > right;
      bits = (bits << 1n) | (bit ? 1n : 0n);
    }
  }
  return bits.toString(16).padStart(16, "0");
}

export function dHashDistance(a: string, b: string): number {
  if (!/^[0-9a-f]{16}$/i.test(a) || !/^[0-9a-f]{16}$/i.test(b)) {
    return 64;
  }
  let xor = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let count = 0;
  while (xor > 0n) {
    count += Number(xor & 1n);
    xor >>= 1n;
  }
  return count;
}

export function petScreenUnchanged(a: string, b: string): boolean {
  return dHashDistance(a, b) <= PET_SCREEN.hashThreshold;
}

export function petScreenIntervalMs(requested = PET_SCREEN.intervalMs): number {
  const value = Number.isFinite(requested) ? Math.floor(requested) : PET_SCREEN.intervalMs;
  return Math.max(PET_SCREEN.minIntervalMs, value);
}

export function pickDisplaySource<T extends { display_id: string }>(
  sources: readonly T[],
  displayId: string
): T | null {
  if (sources.length === 0) {
    return null;
  }
  const id = displayId.trim();
  if (id) {
    const hit = sources.find((source) => source.display_id === id);
    if (hit) {
      return hit;
    }
  }
  return sources[0] ?? null;
}

export function screenCaptureGate(status: string, deniedAttempted: boolean): ScreenCaptureGate {
  if (status === "restricted") {
    return "restricted";
  }
  if (status === "denied") {
    return deniedAttempted ? "denied" : "proceed";
  }
  return "proceed";
}
