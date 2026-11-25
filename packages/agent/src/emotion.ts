import { EMOTIONS, isEmotion, type Emotion } from "@hoshi/shared";

const MARK_NAME = String.raw`[A-Za-z][\w-]*|[\u4e00-\u9fff]{1,8}`;
const BRACKET_MARK_RE = /⟦\s*([^⟧]+?)\s*⟧/g;
const EDGE_TILDE_RE = new RegExp(String.raw`(?:^[～~]\s*(${MARK_NAME})\s*|[～~]\s*(${MARK_NAME})\s*$)`);
const TILDE_MARK_RE = new RegExp(String.raw`[～~]\s*(${MARK_NAME})`, "g");
const LABEL_MARK_RE = new RegExp(String.raw`(?:情绪|表情|emotion)\s*[:：]\s*(${MARK_NAME})`, "gi");
const WRAP_MARK_RE = new RegExp(
  String.raw`[（(【\[「『［〖〈]\s*(${MARK_NAME})\s*[）)】\]」』］〗〉]`,
  "g"
);
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

const CN_ALIAS: Record<string, Emotion> = {
  正常: "normal",
  平静: "normal",
  开心: "happy",
  高兴: "happy",
  快乐: "happy",
  超开心: "very-happy",
  非常开心: "very-happy",
  喜欢: "like",
  亲近: "like",
  超喜欢: "very-like",
  难过: "sad",
  伤心: "sad",
  生气: "angry",
  害羞: "shy",
  傲娇: "shy-and-indignation",
  嘴硬: "shy-and-indignation",
  惊讶: "shock",
  吃惊: "shock",
  质疑: "doubt",
  怀疑: "doubt",
  困惑: "confused",
  疑惑: "confused",
  期待: "expect",
  思考: "expect",
  无奈: "wry",
  吐槽: "wry",
  嫌弃: "disdain",
  抗拒: "resist",
  委屈: "resentment",
  吃醋: "yandere",
  占有: "yandere"
};

function stripMarkedEmotions(text: string): { text: string; emotion: Emotion | null } {
  let emotion: Emotion | null = null;
  const apply = (pattern: RegExp, dropUnknown: boolean) => {
    text = text.replace(pattern, (all, name: string) => {
      const coerced = coerceEmotion(name);
      if (!coerced && !dropUnknown) {
        return all;
      }
      if (coerced) {
        emotion = coerced;
      }
      return "";
    });
  };
  apply(BRACKET_MARK_RE, true);
  apply(WRAP_MARK_RE, false);
  apply(TILDE_MARK_RE, false);
  apply(LABEL_MARK_RE, false);
  return { text, emotion };
}

function tidyEmotionResidue(text: string): string {
  return text
    .replace(/[（(【\[「『]\s*[）)】\]」』]/g, "")
    .replace(/[（(【\[「『]\s*$/g, "")
    .replace(/^\s*[）)】\]」』]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([。！？，、])/g, "$1")
    .trim();
}

function peelBareEmotion(text: string): { text: string; emotion: Emotion | null } {
  const names = [...EMOTIONS].sort((left, right) => right.length - left.length);
  let emotion: Emotion | null = null;
  let next = text;
  next = next.replace(/(?<![A-Za-z])([A-Za-z]+(?:[_-][A-Za-z]+)+)(?![A-Za-z])/gi, (all) => {
    const coerced = coerceEmotion(all);
    if (!coerced) {
      return all;
    }
    emotion = coerced;
    return "";
  });
  for (const name of names) {
    const pattern = new RegExp(`(?<![A-Za-z-])${name.replace(/-/g, "\\-")}(?![A-Za-z-])`, "gi");
    if (pattern.test(next)) {
      emotion = name;
      pattern.lastIndex = 0;
      next = next.replace(pattern, "");
    }
  }
  next = next.replace(/([\u4e00-\u9fff])([A-Za-z-]{4,})/g, (all, han: string, tail: string) => {
    const lower = tail.toLowerCase();
    const hit = names.find((name) => name.endsWith(lower) && name !== lower);
    if (!hit) {
      return all;
    }
    emotion = hit;
    return han;
  });
  return { text: next.replace(/[ \t]{2,}/g, " ").trim(), emotion };
}

function maskInlineCode(text: string): { text: string; spans: string[] } {
  const spans: string[] = [];
  const next = text.replace(/`[^`\n]+`/g, (span) => {
    spans.push(span);
    return `\uE000${spans.length - 1}\uE001`;
  });
  return { text: next, spans };
}

function unmaskInlineCode(text: string, spans: string[]): string {
  return text.replace(/\uE000(\d+)\uE001/g, (all, index: string) => spans[Number(index)] ?? all);
}

export function parseSentenceEmotion(
  rawSentence: string,
  fallbackEmotion: Emotion
): { text: string; emotion: Emotion; explicit: boolean } {
  const held = maskInlineCode(rawSentence.trim());
  let text = held.text;
  const marked = stripMarkedEmotions(text);
  text = marked.text;
  let emotion = marked.emotion;

  const tilde = text.match(EDGE_TILDE_RE);
  if (tilde) {
    const coerced = coerceEmotion(tilde[1] || tilde[2] || "");
    if (coerced) {
      emotion = coerced;
    }
    text = text.replace(EDGE_TILDE_RE, "").trim();
  }

  const peeled = peelBareEmotion(text);
  text = unmaskInlineCode(tidyEmotionResidue(peeled.text), held.spans);
  if (!emotion && peeled.emotion) {
    emotion = peeled.emotion;
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
  const trimmed = raw.trim();
  const labeled = CN_ALIAS[trimmed];
  if (labeled) {
    return labeled;
  }
  const key = trimmed.toLowerCase().replace(/_/g, "-");
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
