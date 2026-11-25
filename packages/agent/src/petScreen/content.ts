import { userContentWithImages, type LlmContentPart } from "../llm/openai";

export const PET_SCREEN_TURN_NOTE =
  "（这是星奈刚看到的桌面，不是老师发来的图片。只用来回答这句话，不要复述文件名、代码、分支或屏幕上的其他字。）";

export const PET_SCREEN_SYSTEM_NOTE =
  "你刚看了一眼老师的桌面，只用它回答他这句话。不要顺带介绍窗口、文件、代码、分支或画面里的聊天。不要朗读密码、验证码、密钥、证件号、私聊和邮件全文。";

export type PetTurnScreen = { mime: "image/jpeg"; data: string };

const SCREEN_TURN_RE =
  /屏幕|桌面|窗口|画面|截图|显示器|眼前|报错|这段代码|这行|这个文件|左边|右边|看这|看下|瞧这|帮我看/;

export function screenForTurn(
  message: string,
  screen: PetTurnScreen | null | undefined
): PetTurnScreen | null {
  if (!screen || !SCREEN_TURN_RE.test(message)) {
    return null;
  }
  return screen;
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
