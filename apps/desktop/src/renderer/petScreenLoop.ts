interface PetScreenTickShot {
  ok: boolean;
  reason?: "denied" | "restricted" | "no-source" | "failed";
  hash?: string;
}

interface PetScreenBusy {
  live: boolean;
  holding: boolean;
  draft: boolean;
  generating: boolean;
  typing: boolean;
  speaking: boolean;
  glancing: boolean;
}

interface PetScreenTickInput {
  enabled: boolean;
  shot: PetScreenTickShot;
  sessionId: string;
  lastSessionId: string;
  lastHash: string;
  unchanged: (prev: string, next: string) => boolean;
  now: number;
  lastSpokenAt: number;
  cooldownMs: number;
  busy: PetScreenBusy;
}

interface PetScreenTickPlan {
  upload: boolean;
  glance: boolean;
  status: string | null;
}

interface PetScreenMemory {
  sessionId: string;
  hash: string;
}

const PET_SCREEN_FAILURE = {
  permission: "需要允许录屏，才能看着桌面",
  missing: "没有找到屏幕",
  failed: "看桌面失败"
} as const;

function petScreenFailureText(reason: "denied" | "restricted" | "no-source" | "failed"): string {
  if (reason === "denied" || reason === "restricted") {
    return PET_SCREEN_FAILURE.permission;
  }
  if (reason === "no-source") {
    return PET_SCREEN_FAILURE.missing;
  }
  return PET_SCREEN_FAILURE.failed;
}

function isPetScreenFailureText(text: string): boolean {
  return (
    text === PET_SCREEN_FAILURE.permission ||
    text === PET_SCREEN_FAILURE.missing ||
    text === PET_SCREEN_FAILURE.failed
  );
}

function petScreenGlanceBlocked(input: Pick<PetScreenTickInput, "now" | "lastSpokenAt" | "cooldownMs" | "busy">): boolean {
  if (
    input.busy.live ||
    input.busy.holding ||
    input.busy.draft ||
    input.busy.generating ||
    input.busy.typing ||
    input.busy.speaking ||
    input.busy.glancing
  ) {
    return true;
  }
  return input.lastSpokenAt > 0 && input.now - input.lastSpokenAt < input.cooldownMs;
}

function planPetScreenTick(input: PetScreenTickInput): PetScreenTickPlan {
  if (!input.enabled) {
    return { upload: false, glance: false, status: null };
  }
  if (!input.shot.ok) {
    return {
      upload: false,
      glance: false,
      status: petScreenFailureText(input.shot.reason ?? "failed")
    };
  }
  const hash = input.shot.hash ?? "";
  const sameSession = input.lastSessionId !== "" && input.lastSessionId === input.sessionId;
  if (sameSession && input.lastHash !== "" && input.unchanged(input.lastHash, hash)) {
    return { upload: false, glance: false, status: null };
  }
  return {
    upload: true,
    glance: !petScreenGlanceBlocked(input),
    status: null
  };
}

function commitPetScreenUpload(
  prev: PetScreenMemory,
  uploaded: { ok: boolean; sessionId: string; hash: string }
): PetScreenMemory {
  if (!uploaded.ok) {
    return prev;
  }
  return { sessionId: uploaded.sessionId, hash: uploaded.hash };
}

function notePetScreenSpoken(prevAt: number, spoke: boolean, now: number): number {
  return spoke ? now : prevAt;
}

(globalThis as unknown as {
  hoshiPetScreen: {
    planPetScreenTick: typeof planPetScreenTick;
    commitPetScreenUpload: typeof commitPetScreenUpload;
    notePetScreenSpoken: typeof notePetScreenSpoken;
    isPetScreenFailureText: typeof isPetScreenFailureText;
  };
}).hoshiPetScreen = {
  planPetScreenTick,
  commitPetScreenUpload,
  notePetScreenSpoken,
  isPetScreenFailureText
};
