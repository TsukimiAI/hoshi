import { userContentWithImages, type LlmContentPart } from "../llm/openai";

export const PET_SCREEN_TURN_NOTE =
  "（这是星奈刚看到的桌面，不是老师发来的图片。只用来回答这句话，不要复述文件名、代码、分支或屏幕上的其他字。）";

export const PET_SCREEN_SYSTEM_NOTE =
  "你刚看了一眼老师的桌面，只用它回答他这句话。不要顺带介绍窗口、文件、代码、分支或画面里的聊天。不要朗读密码、验证码、密钥、证件号、私聊和邮件全文。";

export const PET_SCREEN_FOLLOW_NOTE =
  "你刚才那句是看过老师桌面后说的，不是猜的。老师这句是在接那一段。顺着接，不要改口说看不见屏幕或是猜的，不要提知识库或其他笔记，也不要扯进这段之外的事。";

export const GLANCE_INTERVAL_MS = 10 * 60 * 1000;

export type OpenGlanceInterval = { id: string; sessionId: string; at: number };

const SCREEN_TURN_RE =
  /屏幕|桌面|窗口|画面|截图|显示器|眼前|报错|这段代码|这行|这个文件|左边|右边|看这|看下|瞧这|帮我看/;

export function continuesGlance(message: string): boolean {
  const text = message.replace(/\s+/g, "").trim();
  if (!text || text.length > 24) {
    return false;
  }
  if (/帮我|解释|是什么|为什么|怎么/.test(text)) {
    return false;
  }
  if (SCREEN_TURN_RE.test(text)) {
    return false;
  }
  return /你|这|那|刚才|真的|吗|吧|呢|懂/.test(text);
}

export function matchGlanceInterval(input: {
  enabled: boolean;
  kind: "chat" | "desk";
  sessionId: string;
  message: string;
  now: number;
  open: OpenGlanceInterval | null;
}): string | null {
  if (!input.enabled || input.kind !== "chat" || !input.open?.id) {
    return null;
  }
  if (input.open.sessionId !== input.sessionId) {
    return null;
  }
  if (input.now < input.open.at || input.now - input.open.at > GLANCE_INTERVAL_MS) {
    return null;
  }
  if (!continuesGlance(input.message)) {
    return null;
  }
  return input.open.id;
}

export type PetTurnScreen = { mime: "image/jpeg"; data: string };

export function screenForTurn(
  message: string,
  screen: PetTurnScreen | null | undefined,
  force = false
): PetTurnScreen | null {
  if (!screen) {
    return null;
  }
  if (force || SCREEN_TURN_RE.test(message)) {
    return screen;
  }
  return null;
}

export function userContentWithScreen(
  text: string,
  images: Array<{ mime: string; data: string }>,
  screen: PetTurnScreen | null | undefined
): string | LlmContentPart[] {
  if (!screen) {
    return userContentWithImages(text, images);
  }
  const parts: LlmContentPart[] = [{ type: "text", text }];
  for (const image of images) {
    parts.push({
      type: "image_url",
      image_url: { url: `data:${image.mime};base64,${image.data}` }
    });
  }
  parts.push({ type: "text", text: PET_SCREEN_TURN_NOTE });
  parts.push({
    type: "image_url",
    image_url: { url: `data:${screen.mime};base64,${screen.data}` }
  });
  return parts;
}
