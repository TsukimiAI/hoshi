export const EMOTIONS = [
  "normal",
  "happy",
  "very-happy",
  "like",
  "very-like",
  "sad",
  "angry",
  "shy",
  "shy-and-indignation",
  "shock",
  "doubt",
  "confused",
  "expect",
  "wry",
  "disdain",
  "resist",
  "resentment",
  "yandere"
] as const;

export type Emotion = (typeof EMOTIONS)[number];

const EMOTION_SET = new Set<string>(EMOTIONS);

export function isEmotion(value: string): value is Emotion {
  return EMOTION_SET.has(value);
}
