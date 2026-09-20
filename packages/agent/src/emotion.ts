import { isEmotion, type Emotion } from "@hoshi/shared";

const BRACKET_MARK_RE = /⟦([\w-]+)⟧/g;
const EDGE_TILDE_RE = /(?:^[～~]([\w-]+)\s*|[～~]([\w-]+)\s*$)/;
const YANDERE_RE = /(只许看我|不准离开|只能是我|吃醋|独占|属于我)/;
const VERY_LIKE_RE = /(最喜欢你|好喜欢老师|心动|心跳加速)/;
const LIKE_RE = /(喜欢你|亲近|想靠近|温柔点)/;
const STRONG_POSITIVE_RE = /(爱你|超喜欢|最喜欢|激动|兴奋|太开心|幸福|太棒了)/;
const POSITIVE_RE = /(喜欢|开心|高兴|太好|太棒|厉害|真不错|谢谢|可爱|赞|哈哈|嘿嘿|耶)/;
const SHY_INDIGNATION_RE = /(才不是|才没有|谁要啊|哼！|才不会|别误会)/;
const RESIST_RE = /(不要乱来|别碰|走开|我拒绝|别这样啊)/;
const RESENTMENT_RE = /(凭什么|不公平|记仇|好委屈|怨你)/;
const DISDAIN_RE = /(幼稚|无聊透|也配|瞧不起|无语死)/;
const WRY_RE = /(呵呵|哈啊|无奈|还真是|行吧|拿你没办法|吐槽)/;
const SHOCK_RE = /(竟然|居然|诶[？?]|什么[！!]|吓我|不敢相信)/;
const STRONG_NEGATIVE_RE = /(生气|愤怒|讨厌|气死|崩溃|绝望|恨)/;
const NEGATIVE_RE = /(难过|伤心|糟糕|失落|沮丧|烦|痛苦|委屈|不开心)/;
const SHY_RE = /(害羞|脸红|别这样|你你你|不要这样|突然说这个|羞)/;
const EXPECT_RE = /(稍等|等我|我看看|让我想想|正在|一会儿|期待|准备)/;
const CONFUSED_RE = /(搞不懂|没听懂|乱了|一头雾水|啥意思)/;
const DOUBT_RE = /(为什么|咋办|怎么办|真的吗|怀疑|不会吧|\?|？)/;

const ALIAS: Record<string, Emotion> = {
  joy: "happy",
  smile: "happy",
  surprise: "shock",
  surprised: "shock",
  confuse: "confused",
  thinking: "expect",
  tsundere: "shy-and-indignation",
  jealous: "yandere",
  love: "like",
  smirk: "wry",
  speechless: "wry",
  annoyed: "angry",
  upset: "sad"
};

export function parseSentenceEmotion(
  rawSentence: string,
  fallbackEmotion: Emotion
): { text: string; emotion: Emotion; explicit: boolean } {
  let text = rawSentence.trim();
  let emotion: Emotion | null = null;

  const brackets = [...text.matchAll(BRACKET_MARK_RE)];
  for (const match of brackets) {
    const coerced = coerceEmotion(match[1] ?? "");
    if (coerced) {
      emotion = coerced;
    }
  }
  text = text.replace(/⟦[\w-]+⟧/g, "").trim();

  const tilde = text.match(EDGE_TILDE_RE);
  if (tilde) {
    const coerced = coerceEmotion(tilde[1] || tilde[2] || "");
    if (coerced) {
      emotion = coerced;
    }
    text = text.replace(EDGE_TILDE_RE, "").trim();
  }

  if (!emotion) {
    return { text, emotion: fallbackEmotion, explicit: false };
  }
  return { text, emotion, explicit: true };
}

export function inferSentenceEmotion(text: string, fallbackEmotion: Emotion): Emotion {
  const normalized = text.trim();
  if (!normalized) {
    return fallbackEmotion;
  }
  if (YANDERE_RE.test(normalized)) {
    return "yandere";
  }
  if (VERY_LIKE_RE.test(normalized)) {
    return "very-like";
  }
  if (LIKE_RE.test(normalized)) {
    return "like";
  }
  if (STRONG_NEGATIVE_RE.test(normalized)) {
    return "angry";
  }
  if (NEGATIVE_RE.test(normalized)) {
    return "sad";
  }
  if (STRONG_POSITIVE_RE.test(normalized)) {
    return "very-happy";
  }
  if (POSITIVE_RE.test(normalized)) {
    return "happy";
  }
  if (SHY_INDIGNATION_RE.test(normalized)) {
    return "shy-and-indignation";
  }
  if (RESIST_RE.test(normalized)) {
    return "resist";
  }
  if (RESENTMENT_RE.test(normalized)) {
    return "resentment";
  }
  if (DISDAIN_RE.test(normalized)) {
    return "disdain";
  }
  if (WRY_RE.test(normalized)) {
    return "wry";
  }
  if (SHOCK_RE.test(normalized)) {
    return "shock";
  }
  if (SHY_RE.test(normalized)) {
    return "shy";
  }
  if (EXPECT_RE.test(normalized)) {
    return "expect";
  }
  if (CONFUSED_RE.test(normalized)) {
    return "confused";
  }
  if (DOUBT_RE.test(normalized)) {
    return "doubt";
  }
  return fallbackEmotion;
}

export function resolveSentenceEmotion(rawSentence: string, fallbackEmotion: Emotion): {
  text: string;
  emotion: Emotion;
} {
  const parsed = parseSentenceEmotion(rawSentence, fallbackEmotion);
  const inferred = inferSentenceEmotion(parsed.text, fallbackEmotion);
  if (parsed.explicit && parsed.emotion !== "normal") {
    return { text: parsed.text, emotion: parsed.emotion };
  }
  return { text: parsed.text, emotion: inferred };
}

function coerceEmotion(raw: string): Emotion | null {
  const key = raw.toLowerCase().replace(/_/g, "-");
  if (isEmotion(key)) {
    return key;
  }
  const compact = key.replace(/-/g, "");
  if (compact === "veryhappy") {
    return "very-happy";
  }
  if (compact === "verylike") {
    return "very-like";
  }
  if (compact === "shyandindignation") {
    return "shy-and-indignation";
  }
  return ALIAS[key] ?? ALIAS[compact] ?? null;
}
