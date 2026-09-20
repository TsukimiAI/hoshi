export type TtsPcmHandler = (pcm: Buffer, sampleRate: number) => void;

let pcmHandler: TtsPcmHandler | null = null;
let stopHandler: (() => void) | null = null;

export function setTtsPcmSink(handler: TtsPcmHandler | null, onStop?: (() => void) | null): void {
  pcmHandler = handler;
  stopHandler = onStop ?? null;
}

export function emitTtsPcm(pcm: Buffer, sampleRate: number): void {
  if (pcm.length < 2) {
    return;
  }
  pcmHandler?.(pcm, sampleRate);
}

export function stopTtsPlayback(): void {
  stopHandler?.();
}
