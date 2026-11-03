export const PLAYBACK_EXTRA_MS = 3000;
export const BARGE_RESUME_MS = 8000;
export const BARGE_HOLD_MS = 500;
export const BARGE_TAIL_MS = 250;
export const BARGE_RMS = 0.06;

export function playbackWatchdogMs(pcmBytes: number, sampleRate: number, extraMs = PLAYBACK_EXTRA_MS): number {
  const rate = Math.max(sampleRate, 1);
  const audioMs = Math.ceil((pcmBytes / 2 / rate) * 1000);
  return Math.max(800, audioMs + extraMs);
}

export function decideAsrFinal(input: {
  turnBusy: boolean;
  ttsPlaying: boolean;
  awaitingDrain: boolean;
  barged: boolean;
}): "start" | "queue" | "drop" {
  const blocked = input.turnBusy || input.ttsPlaying || input.awaitingDrain;
  if (!blocked) {
    return "start";
  }
  if (input.barged) {
    return "queue";
  }
  return "drop";
}

export function shouldAcceptTtsEnd(input: { awaitingDrain: boolean; epoch: number; msgEpoch: number }): boolean {
  return input.awaitingDrain && input.msgEpoch === input.epoch;
}

export function nextTurnFromFinally(input: {
  myEpoch: number;
  currentEpoch: number;
  pendingFinal: string | null;
  ttsPlaying: boolean;
  awaitingDrain: boolean;
}): { start: string | null; clearBusy: boolean; enterListening: boolean } {
  if (input.pendingFinal) {
    return { start: input.pendingFinal, clearBusy: false, enterListening: false };
  }
  if (input.myEpoch !== input.currentEpoch) {
    return { start: null, clearBusy: false, enterListening: false };
  }
  if (input.ttsPlaying || input.awaitingDrain) {
    return { start: null, clearBusy: false, enterListening: false };
  }
  return { start: null, clearBusy: true, enterListening: true };
}

export type BargeGate = {
  loudMs: number;
};

export function createBargeGate(): BargeGate {
  return { loudMs: 0 };
}

export function tickBargeGate(
  gate: BargeGate,
  rms: number,
  frameMs: number,
  holding: boolean
): { send: boolean; barge: boolean } {
  if (!holding) {
    gate.loudMs = 0;
    return { send: true, barge: false };
  }
  if (rms >= BARGE_RMS) {
    gate.loudMs += frameMs;
    if (gate.loudMs >= BARGE_HOLD_MS) {
      gate.loudMs = 0;
      return { send: false, barge: true };
    }
    return { send: false, barge: false };
  }
  gate.loudMs = 0;
  return { send: false, barge: false };
}
